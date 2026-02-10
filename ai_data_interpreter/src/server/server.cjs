require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const { parse } = require('csv-parse/sync');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
// Allow larger payloads to support base64 images in slides
app.use(express.json({ limit: '25mb' }));

// Resolve Python interpreter: env var > repo venv > system
const isWin = process.platform === 'win32';
const venvPython = path.join(__dirname, isWin ? '../../venv/Scripts/python.exe' : '../../venv/bin/python');
const PYTHON_PATH = (process.env.PYTHON_PATH && process.env.PYTHON_PATH.trim())
  ? process.env.PYTHON_PATH.trim()
  : (fs.existsSync(venvPython) ? venvPython : 'python');
console.log('[server] Using Python interpreter:', PYTHON_PATH);

// Robust temp dir cleanup (Windows may lock files briefly)
function cleanupDir(dir, attempts = 5, delayMs = 300) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    if (attempts > 0 && (e.code === 'ENOTEMPTY' || e.code === 'EBUSY' || e.code === 'EPERM')) {
      setTimeout(() => cleanupDir(dir, attempts - 1, Math.floor(delayMs * 1.5)), delayMs);
    } else if (attempts <= 0) {
      console.warn('[cleanup] failed to remove', dir, e?.code || e);
    }
  }
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Helper: retry + fallback across models to handle 503/overloaded/429
const DEFAULT_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-pro-latest'
];

function formatHistoryForPrompt(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const trimmed = history.slice(-12);
  return trimmed
    .map((entry) => {
      const role = entry && entry.role === 'assistant' ? 'Assistant' : 'User';
      const content = entry && entry.content ? String(entry.content).trim() : '';
      if (!content) return '';
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildModelCandidates() {
  const envCandidates = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // If the environment variable is set, use it as the ONLY source of models.
  // Otherwise, fall back to the default list.
  const candidates = envCandidates.length > 0 ? envCandidates : DEFAULT_MODEL_CANDIDATES;
  
  const seen = new Set();
  const normalized = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const prefixed = candidate.startsWith('models/') ? candidate : `models/${candidate}`;
    if (seen.has(prefixed)) continue;
    seen.add(prefixed);
    normalized.push(prefixed);
  }
  // Fallback to a default model only if the final list is empty.
  return normalized.length ? normalized : ['models/gemini-pro-latest'];
}

async function generateWithFallback(prompt) {
  const candidates = buildModelCandidates();
  let lastErr;

  for (const modelId of candidates) {
    let attempt = 0;
    let backoff = 500; // Initial backoff in ms

    while (attempt < 3) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(prompt);
        return result; // Success, exit the function
      } catch (e) {
        lastErr = e;
        const msg = (e?.message || "").toLowerCase();
        const status = e?.status || e?.code;

        // If the model doesn't exist, stop trying this model immediately.
        const isModelNotFound = status === 404 || (msg.includes('not found') && msg.includes('model'));
        if (isModelNotFound) {
          console.warn(`[gemini] Model ${modelId} not available, skipping.`);
          break; // Break from the while loop to try the next model
        }

        // If it's a rate limit (429) or other non-retryable client error, skip to next model.
        // Do NOT retry on 429 for the same model, as it will just burn quota.
        if (status === 429 || (status >= 400 && status < 500 && status !== 429)) {
           console.error(`[gemini] Client error for model ${modelId}: ${e.message}`);
           if (status === 429) {
             console.warn(`[gemini] Quota exceeded for ${modelId}, trying next model...`);
             break; // Try next model
           } else {
             throw e; // Other 4xx errors are not retryable
           }
        }

        // Only retry on 503 Service Unavailable or other potential transient server issues.
        const isRetryableServerError = status >= 500;
        if (isRetryableServerError && attempt < 2) {
          console.warn(`[gemini] Server error for ${modelId}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          backoff *= 2; // Exponential backoff
          attempt++;
        } else {
          // If it's another type of error or retries are exhausted, stop for this model.
          break;
        }
      }
    }
  }

  // If all models and retries fail, throw the last captured error.
  throw lastErr || new Error("AI generation failed with all candidate models.");
}


// --- 1. CSV Upload & Data Caching ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    let records;

    // Check file type and parse accordingly
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      const content = fs.readFileSync(file.path, 'utf8');
      records = parse(content, { columns: true, skip_empty_lines: true });
    } else if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
      file.mimetype === 'application/vnd.ms-excel' || // .xls
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      records = XLSX.utils.sheet_to_json(worksheet, { defval: "" }); // Use sheet_to_json for robustness
    } else {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Unsupported file type. Please upload a CSV or Excel file.' });
    }

    fs.unlinkSync(file.path); // Clean up uploaded file

    if (!records || records.length === 0) {
      return res.status(400).json({ error: 'No data found in file.' });
    }

    // Generate a unique session ID for this dataset
    const sessionId = crypto.randomBytes(16).toString('hex');
    const sessionDir = path.join(os.tmpdir(), 'insight-to-deck', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    
    // Convert parsed records back to a clean CSV string
    const headers = Object.keys(records[0]);
    const csvString = [
      headers.join(','),
      ...records.map(row => headers.map(h => {
        const val = String(row[h] || '');
        // Basic CSV escaping
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(','))
    ].join('\n');

    // Save the clean CSV in the session directory
    fs.writeFileSync(path.join(sessionDir, 'data.csv'), csvString);

    // Return the session ID and a preview, but not the full data
    res.json({
      sessionId: sessionId,
      fileName: file.originalname,
      rowCount: records.length,
      columns: headers,
      preview: records.slice(0, 5)
    });
  } catch (err) {
    console.error('[upload] error:', err);
    res.status(500).json({ error: 'Failed to parse or process file.' });
  }
});

// --- 2. AI Analysis (Gemini) ---
app.post('/api/analyze', async (req, res) => {
  const { question, sessionId, requestType = 'user', history = [] } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const sessionDir = path.join(os.tmpdir(), 'insight-to-deck', sessionId);
    const csvPath = path.join(sessionDir, 'data.csv');

    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ error: "Data for this session not found. Please upload the file again." });
    }

    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const lines = fileContent.split('\n');
    const columns = lines[0].split(',');
    const sampleData = lines.slice(0, 6).join('\n');

    const lowerQuestion = question.toLowerCase();
    const isVizRequest = lowerQuestion.includes('chart') || lowerQuestion.includes('plot') || lowerQuestion.includes('visualize') || lowerQuestion.includes('graph') || lowerQuestion.includes('visualization');

    const historyText = formatHistoryForPrompt(history);
    const historyContext = historyText ? `\nPrevious conversation:\n${historyText}\n\n` : '';

    let prompt;

    if (requestType === 'initial') {
        prompt = `${historyContext}You are an expert data analyst. A pandas DataFrame named 'df' is in memory.
        
        DATASET INFO:
        - Columns: ${columns.join(', ')}
        - Sample:
        ${sampleData}

        USER REQUEST: "${question}"

        YOUR TASK:
        Provide a comprehensive, professional analysis of the dataset in Markdown format. Your report must include:
        1. A summary of data quality, identifying any missing values or potential issues.
        2. A table of descriptive statistics for each numerical column.
        3. A detailed interpretation of the statistics and what they imply.
        4. After the text analysis, provide a SINGLE, COMPLETE Python script in a 
        
        
        python block to generate a correlation matrix heatmap.
        
        - The script must use the 'df' DataFrame.
        - Do not use plt.show().
        - Do not include any other visualizations in this script.
        `;
    } else if (isVizRequest) {
      prompt = `${historyContext}You are a Python data visualization bot. Your SOLE purpose is to generate a Python script to plot user data.
A pandas DataFrame named 'df' is already in memory.

DATASET COLUMNS: ${columns.join(', ')}
USER REQUEST: "${question}"

ABSOLUTE RULES:
1. Your ENTIRE response MUST be ONLY a Python script wrapped in a single fenced code block that starts with "\`\`\`python" and ends with "\`\`\`".
2. DO NOT write ANY text, explanation, or narrative outside that single fenced block.
3. The script MUST generate ONE plot.
4. Use the 'df' DataFrame. DO NOT load data.
5. Do NOT use plt.show().
6. Do NOT print tables or use .to_markdown().
7. If you break these rules, the system will fail.
`;
    } else {
      prompt = `${historyContext}You are an expert data analyst. A pandas DataFrame named 'df' is in memory with columns: ${columns.join(', ')}.
The user's request is: "${question}"

Please provide a concise, data-driven answer in Markdown format.
- Use the 'df' DataFrame for any calculations. Do not load the data yourself.
- If you provide tables, use Markdown.
`;
    }

    const result = await generateWithFallback(prompt);
    const responseText = result.response.text();
    res.json({ answer: responseText });
  } catch (err) {
    console.error('[analyze] AI error', err);
    const msg = (err && err.message) ? String(err.message) : 'AI analysis failed.';
    const status = (err && err.status) ? err.status : 500;
    if (status === 503 || status === 429) {
      return res.status(status).json({ error: msg, retryable: true });
    }
    res.status(500).json({ error: msg });
  }
});

// --- 2b. Basic Visualization Endpoint ---
// This endpoint is now less critical but kept for specific client-side viz generation
app.post('/api/visualize', async (req, res) => {
  const { 
      chartType = 'auto',
      sessionId, // Expect sessionId now
      prompt = '',
      x: xPref = null,
      y: yPref = null,
      hue: huePref = null,
      size: sizePref = null,
    } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }
  const sessionDir = path.join(os.tmpdir(), 'insight-to-deck', sessionId);
  const csvPath = path.join(sessionDir, 'data.csv');
  if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: "Data for this session not found." });
  }
  const data = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });

  try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-'));
    fs.writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify(data || []));
    fs.writeFileSync(path.join(tempDir, 'meta.json'), JSON.stringify({ chartType, prompt, xPref, yPref, huePref, sizePref }));

    const codePath = path.join(tempDir, 'viz.py');
    fs.writeFileSync(codePath, `
import json, os, re
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

try {
    import seaborn as sns
    sns.set_theme(style='whitegrid')
    HAVE_SNS = True
} catch (Exception) {
    HAVE_SNS = False
}

with open('data.json','r', encoding='utf-8') as f:
    rows = json.load(f)
with open('meta.json','r', encoding='utf-8') as f:
    meta = json.load(f)

chartType = (meta.get('chartType') or 'auto').lower()
prompt = meta.get('prompt') or ''
xPref = meta.get('xPref')
yPref = meta.get('yPref')
huePref = meta.get('huePref')
sizePref = meta.get('sizePref')

df = pd.DataFrame(rows)
df.columns = [str(c).strip() for c in df.columns]
for c in df.columns:
    try:
        df[c] = pd.to_numeric(df[c], errors='ignore')
    except Exception:
        pass

num_cols = df.select_dtypes(include=['number']).columns.tolist()
obj_cols = df.select_dtypes(exclude=['number']).columns.tolist()

def first_exists(preferred, candidates):
    for name in preferred:
        for c in candidates:
            if str(c).lower() == str(name).lower():
                return c
    return None

def from_prompt(cols, p):
    p = p.lower()
    for c in cols:
        if re.search(r'\\b' + re.escape(str(c).lower()) + r'\\b', p):
            return c
    return None

def best_pair():
    if len(num_cols) < 2: return (num_cols[0] if num_cols else None, None)
    corr = df[num_cols].corr().abs()
    target = first_exists(['yield','y','output','target'], num_cols)
    if target is not None:
        other = corr[target].drop(labels=[target]).idxmax()
        return other, target
    corr.values[[range(len(corr))]*2] = 0
    ij = divmod(corr.values.argmax(), corr.shape[1])
    return num_cols[ij[1]], num_cols[ij[0]]

def draw_fallback(msg='Unable to draw chart'):
    plt.figure(figsize=(6,4))
    plt.text(0.5,0.5,msg, ha='center', va='center')
    plt.axis('off')

x = xPref or from_prompt(df.columns, prompt)
y = yPref
hue = huePref or from_prompt(df.columns, prompt)
size = sizePref or from_prompt(df.columns, prompt)

if chartType == 'auto':
    if len(num_cols) >= 3: chartType = 'heatmap'
    elif len(num_cols) >= 2: chartType = 'scatter'
    elif len(num_cols) == 1: chartType = 'hist'
    else: chartType = 'fallback'

try:
    if chartType in ('heatmap','corr','correlation'):
        if len(num_cols) >= 2:
            plt.figure(figsize=(8,6))
            if HAVE_SNS: sns.heatmap(df[num_cols].corr(), annot=True, cmap='coolwarm', fmt='.2f')
            else: 
                plt.imshow(df[num_cols].corr(), cmap='coolwarm')
                plt.colorbar()
            plt.title('Correlation Heatmap')
            plt.tight_layout()
        else: draw_fallback('Need at least 2 numeric columns for heatmap')
    elif chartType in ('pairplot','pairs'):
        if HAVE_SNS and len(num_cols) >= 2:
            g = sns.pairplot(df[num_cols])
            g.fig.suptitle('Pairplot', y=1.02)
        else:
            if len(num_cols) >= 2:
                plt.figure(figsize=(8,6))
                if HAVE_SNS: sns.heatmap(df[num_cols].corr(), annot=True, cmap='coolwarm', fmt='.2f')
                else:
                    plt.imshow(df[num_cols].corr(), cmap='coolwarm')
                    plt.colorbar()
                plt.title('Correlation Heatmap')
                plt.tight_layout()
            elif len(num_cols) == 1: 
                plt.figure(figsize=(8,4)); plt.hist(df[num_cols[0]].dropna(), bins=20); plt.title(f'Distribution of {num_cols[0]}')
            else: draw_fallback()
    elif chartType in ('scatter','bubble'):
        if x is None or y is None:
            bx, by = best_pair()
            x = x or bx
            y = y or by
        if x is None or y is None: draw_fallback('Could not decide x/y for scatter')
        else:
            plt.figure(figsize=(8,6))
            if HAVE_SNS:
                sns.scatterplot(data=df, x=x, y=y, hue=hue if hue in df.columns else None,
                                size=(size if size in df.columns else None) if chartType=='bubble' else None,
                                palette='viridis', edgecolor='black', linewidth=0.5, alpha=0.85)
            else: plt.scatter(df[x], df[y])
            plt.title(f'{x} vs {y}'); plt.tight_layout()
    elif chartType in ('hist','histogram'):
        col = x or first_exists(['yield','y','output'], num_cols) or (num_cols[0] if num_cols else None)
        if col is None: draw_fallback('No numeric column for histogram')
        else:
            plt.figure(figsize=(8,4))
            if HAVE_SNS: sns.histplot(df[col].dropna(), bins=20)
            else: plt.hist(df[col].dropna(), bins=20)
            plt.title(f'Distribution of {col}'); plt.tight_layout()
    elif chartType in ('box','violin','bar','line'):
        ycol = y or first_exists(['yield','y','output'], num_cols) or (num_cols[0] if num_cols else None)
        xcol = x or (obj_cols[0] if obj_cols else (num_cols[1] if len(num_cols) > 1 else None))
        if ycol is None: draw_fallback('No numeric column found')
        else:
            plt.figure(figsize=(9,5))
            if chartType == 'box':
                if HAVE_SNS and xcol is not None: sns.boxplot(data=df, x=xcol, y=ycol)
                else: df[ycol].plot(kind='box')
            elif chartType == 'violin':
                if HAVE_SNS and xcol is not None: sns.violinplot(data=df, x=xcol, y=ycol)
                else: df[ycol].plot(kind='box')
            elif chartType == 'bar':
                if xcol is not None: df.groupby(xcol)[ycol].mean().plot(kind='bar')
                else: df[ycol].plot(kind='bar')
            elif chartType == 'line':
                if xcol is not None: df.sort_values(by=xcol).plot(x=xcol, y=ycol, kind='line')
                else: df[ycol].sort_index().plot(kind='line')
            plt.title(f'{chartType.title()}'); plt.tight_layout()
    else: draw_fallback('Unknown chart type: ' + str(chartType))
except Exception as e:
    draw_fallback(str(e))

plt.savefig('plot.png', dpi=150, bbox_inches='tight')
print(json.dumps({'ok': True}))
    `);

    const py = spawn(PYTHON_PATH, ['viz.py'], { cwd: tempDir });
    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });
    py.on('close', () => {
      const png = path.join(tempDir, 'plot.png');
      try {
        if (fs.existsSync(png)) {
          const img = fs.readFileSync(png, { encoding: 'base64' });
          setImmediate(() => cleanupDir(tempDir));
          return res.json({ chartData: `data:image/png;base64,${img}` });
        }
        console.warn('[visualize] no plot output', { stdout, stderr });
        setImmediate(() => cleanupDir(tempDir));
        return res.status(500).json({ error: 'Visualization failed', stdout, stderr });
      } catch (e) {
        setImmediate(() => cleanupDir(tempDir));
        return res.status(500).json({ error: String(e), stdout, stderr });
      }
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// --- 3. Execute AI-Generated Python Code Safely ---
app.post('/api/exec-python', async (req, res) => {
  const { code, sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: "Missing sessionId" });
  }

  try {
    const sessionDir = path.join(os.tmpdir(), 'insight-to-deck', sessionId);
    const csvPath = path.join(sessionDir, 'data.csv').replace(/\\/g, '/');
    const plotPath = path.join(sessionDir, 'plot.png').replace(/\\/g, '/');
    const resultPath = path.join(sessionDir, 'result.json').replace(/\\/g, '/');
    const userCodePath = path.join(sessionDir, 'user_code.py').replace(/\\/g, '/');
    try { fs.unlinkSync(resultPath); } catch {}

    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ success: false, error: "Data for this session not found. Please upload the file again." });
    }

    // Persist user code separately so syntax errors don't break the harness
    const userCodePathVar = path.join(sessionDir, 'user_code.py').replace(/\\/g, '/');
    fs.writeFileSync(userCodePathVar, code && code.endsWith('\n') ? code : `${code || ''}\n`);

    const codePath = path.join(sessionDir, 'script.py');
    fs.writeFileSync(codePath, `
RESULT_PATH = r"${resultPath}"

import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import json
import io
from contextlib import redirect_stdout
import numpy as np
from pandas import Timedelta
from pandas.api.types import (
    is_object_dtype,
    is_datetime64_any_dtype,
    is_datetime64tz_dtype,
    is_timedelta64_dtype,
)

def _noop_show(*args, **kwargs):
    # Prevent user code from closing figures before we save them
    return None

plt.show = _noop_show

def _to_seconds(value):
    arr = np.asarray(value)
    if arr.dtype == object:
        flat = arr.reshape(-1)
        series = pd.Series(flat)
        dt_candidate = pd.to_datetime(series, errors='coerce', utc=True)
        if dt_candidate.notna().sum() >= max(1, int(len(series) * 0.5)):
            arr = dt_candidate.dt.tz_convert(None).to_numpy(dtype='datetime64[ns]').reshape(arr.shape)
        else:
            td_candidate = pd.to_timedelta(series, errors='coerce')
            if td_candidate.notna().sum() >= max(1, int(len(series) * 0.5)):
                arr = td_candidate.to_numpy(dtype='timedelta64[ns]').reshape(arr.shape)
            else:
                return value
    if np.issubdtype(arr.dtype, np.datetime64):
        return arr.astype('datetime64[ns]').astype('float64') / 1e9
    if np.issubdtype(arr.dtype, np.timedelta64):
        return arr.astype('timedelta64[ns]').astype('float64') / 1e9
    return value

def _wrap_temporal_ufunc(fn):
    def wrapper(a, b, *args, **kwargs):
        try:
            if hasattr(a, 'dtype') or isinstance(a, (list, tuple)):
                a = _to_seconds(a)
            if hasattr(b, 'dtype') or isinstance(b, (list, tuple)):
                b = _to_seconds(b)
        except Exception:
            pass
        return fn(a, b, *args, **kwargs)
    return wrapper

for _op in ('divide', 'true_divide', 'floor_divide', 'greater', 'greater_equal', 'less', 'less_equal'):
    if hasattr(np, _op):
        setattr(np, _op, _wrap_temporal_ufunc(getattr(np, _op)))

# Normalize temporal inputs for np.diff / np.gradient style helpers
if hasattr(np, 'diff'):
    _orig_diff = np.diff
    def _safe_diff(a, *args, **kwargs):
        try:
            a = _to_seconds(a)
        except Exception:
            pass
        return _orig_diff(a, *args, **kwargs)
    np.diff = _safe_diff

if hasattr(np, 'gradient'):
    _orig_gradient = np.gradient
    def _safe_gradient(a, *args, **kwargs):
        try:
            a = _to_seconds(a)
        except Exception:
            pass
        return _orig_gradient(a, *args, **kwargs)
    np.gradient = _safe_gradient

# Patch FFT helper frequencies to normalize timedelta inputs
if hasattr(np, 'fft'):
    if hasattr(np.fft, 'fftfreq'):
        _orig_fftfreq = np.fft.fftfreq
        def _safe_fftfreq(n, d=1.0):
            try:
                d = _to_seconds(d)
            except Exception:
                pass
            return _orig_fftfreq(n, d)
        np.fft.fftfreq = _safe_fftfreq
    if hasattr(np.fft, 'rfftfreq'):
        _orig_rfftfreq = np.fft.rfftfreq
        def _safe_rfftfreq(n, d=1.0):
            try:
                d = _to_seconds(d)
            except Exception:
                pass
            return _orig_rfftfreq(n, d)
        np.fft.rfftfreq = _safe_rfftfreq

# Allow pandas Timedelta comparisons against numeric types (interpreted as seconds)
def _timedelta_compare_wrapper(op_name):
    original = getattr(Timedelta, op_name, None)
    if original is None:
        return
    def _wrapped(self, other):
        try:
            if isinstance(other, (int, float, np.number)):
                other = Timedelta(seconds=float(other))
        except Exception:
            pass
        return original(self, other)
    setattr(Timedelta, op_name, _wrapped)

for _cmp in ('__le__', '__lt__', '__ge__', '__gt__'):
    _timedelta_compare_wrapper(_cmp)

TEMPORAL_KEYWORDS = ('time', 'date', 'timestamp', 'datetime', 'ts')

def _likely_temporal(name):
    lower = str(name or '').lower()
    return any(token in lower for token in TEMPORAL_KEYWORDS)

def _convert_object_temporal_columns(frame):
    for col in frame.columns:
        series = frame[col]
        if not (is_object_dtype(series) or _likely_temporal(col)):
            continue
        dt_candidate = pd.to_datetime(series, errors='coerce', utc=True)
        if dt_candidate.notna().sum() >= max(3, int(len(series) * 0.6)):
            frame[col] = dt_candidate.dt.tz_convert(None)
            continue
        td_candidate = pd.to_timedelta(series, errors='coerce')
        if td_candidate.notna().sum() >= max(3, int(len(series) * 0.6)):
            frame[col] = td_candidate

def _datetime_series_to_seconds(series):
    arr = series
    if is_datetime64tz_dtype(arr):
        arr = arr.dt.tz_convert('UTC').dt.tz_localize(None)
    arr = arr.astype('datetime64[ns]')
    sec = arr.view('int64').astype('float64') / 1e9
    mask = series.isna()
    if mask.any():
        sec[mask.to_numpy()] = np.nan
    return pd.Series(sec, index=series.index)

def _timedelta_series_to_seconds(series):
    td = series.astype('timedelta64[ns]')
    sec = td.view('int64').astype('float64') / 1e9
    mask = series.isna()
    if mask.any():
        sec[mask.to_numpy()] = np.nan
    return pd.Series(sec, index=series.index)

def _normalize_temporal_columns(frame):
    for col in frame.columns:
        series = frame[col]
        if is_datetime64_any_dtype(series) or is_datetime64tz_dtype(series):
            backup_col = f"{col}_datetime"
            if backup_col not in frame.columns:
                frame[backup_col] = series
            ts_col = f"{col}_ts"
            frame[ts_col] = _datetime_series_to_seconds(series)
            frame[col] = frame[ts_col]
        elif is_timedelta64_dtype(series):
            backup_col = f"{col}_timedelta"
            if backup_col not in frame.columns:
                frame[backup_col] = series
            sec_col = f"{col}_seconds"
            frame[sec_col] = _timedelta_series_to_seconds(series)
            frame[col] = frame[sec_col]

output = {}
debug_output = io.StringIO()

try:
    # --- Data Loading ---
    df = pd.read_csv(r"${csvPath}")
    debug_output.write("---\\nInitial DataFrame Info---\\n")
    df.info(buf=debug_output)
    debug_output.write("\\n--- Initial DataFrame Head ---\\n")
    debug_output.write(df.head(3).to_string()[:2000])

    # --- Data Preparation ---

    if 'time' in df.columns:
        try:
            df['time'] = pd.to_datetime(df['time'], unit='d', origin='1899-12-30')
        except (ValueError, TypeError):
            try:
                df['time'] = pd.to_datetime(df['time'])
            except (ValueError, TypeError):
                pass

    if 'value' in df.columns:
        df['value'] = pd.to_numeric(df['value'], errors='coerce')
        df.dropna(subset=['value'], inplace=True)

    _convert_object_temporal_columns(df)

    _normalize_temporal_columns(df)

    debug_output.write("\\n\\n--- Processed DataFrame Info ---\\n")
    df.info(buf=debug_output)
    debug_output.write("\\n--- Processed DataFrame Head ---\\n")
    debug_output.write(df.head(3).to_string()[:2000])  # Limit to first 5 rows to avoid large output

    # --- AI Code Execution ---
    stdout_capture = io.StringIO()
    with redirect_stdout(stdout_capture):
        user_code_file = r"${userCodePathVar}"
        with open(user_code_file, 'r', encoding='utf-8') as f:
            user_code = f.read()
        exec(compile(user_code, user_code_file, 'exec'), globals(), locals())

    output['success'] = True
    output['output'] = stdout_capture.getvalue()

    # Save matplotlib plot if one was created
    if plt.get_fignums():
        plt.savefig(r"${plotPath}")
        output['plot'] = 'plot.png'
        plt.close('all')

    output['debug'] = debug_output.getvalue()
    try:
        with open(RESULT_PATH, 'w', encoding='utf-8') as _result_file:
            json.dump(output, _result_file, default=repr)
    except Exception as e:
        # Fallback: write a simple error JSON
        with open(RESULT_PATH, 'w', encoding='utf-8') as _result_file:
            json.dump({'error': 'Failed to serialize result: ' + repr(e), 'success': False}, _result_file)
    print("__RESULT_WRITTEN__")

except Exception as e:
    import traceback
    output = {
        'error': str(e),
        'traceback': traceback.format_exc(),
        'success': False
    }
    output['debug'] = ''
    try:
        with open(RESULT_PATH, 'w', encoding='utf-8') as _result_file:
            json.dump(output, _result_file, default=repr)
    except Exception as e2:
        # Fallback: write a simple error JSON
        with open(RESULT_PATH, 'w', encoding='utf-8') as _result_file:
            json.dump({'error': 'Failed to serialize error result: ' + repr(e2), 'success': False}, _result_file)
    print("__RESULT_WRITTEN__")
    `);

    // Run the script from within the session directory
    const py = spawn(PYTHON_PATH, ['script.py'], { cwd: sessionDir });
    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (data) => { stdout += data.toString(); });
    py.stderr.on('data', (data) => { stderr += data.toString(); });

    py.on('close', (code) => {
      let result = {};
      if (fs.existsSync(resultPath)) {
        try {
          result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        } catch (e) {
          result = { error: 'Failed to parse Python script output.', details: String(e), stderr, success: false };
        }
      } else {
        try {
          result = JSON.parse(stdout);
        } catch {
          result = { error: 'Failed to parse Python script output.', details: stdout, stderr, success: false };
        }
      }
      
      // Attach plot if it was created
      if (result.plot && fs.existsSync(plotPath)) {
        const img = fs.readFileSync(plotPath, { encoding: 'base64' });
        result.plotData = `data:image/png;base64,${img}`;
      }
      
      res.json(result);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 4. Generate PPTX from Slides ---
app.post('/api/generate-pptx', async (req, res) => {
  const { slides } = req.body; // [{title, text, imageBase64}]
  let responseSent = false;
  
  const sendError = (status, error) => {
    if (!responseSent) {
      responseSent = true;
      res.status(status).json(error);
    }
  };
  
  // Save slides to temp file
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-'));
  const slidesPath = path.join(tempDir, 'slides.json').replace(/\\/g, '/');
  const pptxPath = path.join(tempDir, 'presentation.pptx').replace(/\\/g, '/');
  fs.writeFileSync(slidesPath, JSON.stringify(slides));

  // Python script to generate PPTX
  const codePath = path.join(tempDir, 'makepptx.py');
  // Escape backslashes in paths for Python
  const escapedSlidesPath = slidesPath.replace(/\\/g, '\\\\');
  const escapedPptxPath = pptxPath.replace(/\\/g, '\\\\');
  
  fs.writeFileSync(codePath, `
import json, io, base64, os, sys, traceback

try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.enum.text import PP_ALIGN
    from pptx.dml.color import RGBColor
    from PIL import Image
except ImportError as e:
    print(f"IMPORT_ERROR: {e}", file=sys.stderr)
    print("Please install required packages: pip install python-pptx Pillow", file=sys.stderr)
    sys.exit(1)

try:
    with open(r"${escapedSlidesPath}", 'r', encoding='utf-8') as f:
        slides = json.load(f)

    prs = Presentation()

    def add_textbox(slide, left, top, width, height, text, size=18, bold=False, align_center=False):
        box = slide.shapes.add_textbox(left, top, width, height)
        tf = box.text_frame
        tf.clear()
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = text or ''
        font = run.font
        font.size = Pt(size)
        font.bold = bold
        if align_center:
            p.alignment = PP_ALIGN.CENTER
        return box

    for idx, slide in enumerate(slides or []):
        s = prs.slides.add_slide(prs.slide_layouts[6])  # blank for full control

        # Margins and dimensions
        margin = Inches(0.5)
        title_h = Inches(1.0)
        inner_w = prs.slide_width - 2 * margin
        content_top = Inches(0.2)

        # Title
        add_textbox(
            s,
            margin,
            content_top,
            inner_w,
            title_h,
            slide.get('title', 'Slide'),
            size=36,
            bold=True,
            align_center=True,
        )

        # Compute main and findings areas (~70/30 of remaining height)
        top_after_title = content_top + title_h + Inches(0.2)
        total_rem = prs.slide_height - top_after_title - Inches(0.3)
        main_h = int(total_rem * 0.7)
        findings_h = int(total_rem - main_h)

        # Main area: selected message (text) OR selected image
        img_b64 = slide.get('imageBase64')
        if img_b64 and isinstance(img_b64, str) and len(img_b64) > 10:
            try:
                if ',' in img_b64:
                    img_b64 = img_b64.split(',', 1)[1]
                imgdata = base64.b64decode(img_b64)
                img = Image.open(io.BytesIO(imgdata))
                img_path = f'img_{idx}.png'
                img.save(img_path)
                # Fit image inside main area preserving aspect ratio
                pic = s.shapes.add_picture(img_path, margin, top_after_title)
                # Scale to fit width or height
                # Convert EMU to floating for comparisons
                if pic.height > main_h:
                    scale = main_h / float(pic.height)
                    pic.height = main_h
                    pic.width = int(pic.width * scale)
                if pic.width > inner_w:
                    scale = inner_w / float(pic.width)
                    pic.width = inner_w
                    pic.height = int(pic.height * scale)
                # Center horizontally in main area
                pic.left = margin + int((inner_w - pic.width) / 2)
                pic.top = top_after_title + int((main_h - pic.height) / 2)
            except Exception as e:
                add_textbox(s, margin, top_after_title, inner_w, main_h, slide.get('text',''), size=18)
        else:
            add_textbox(s, margin, top_after_title, inner_w, main_h, slide.get('text',''), size=18)

        # Findings area (bottom 30%)
        findings_top = top_after_title + main_h + Inches(0.1)
        findings = slide.get('findings') or ''
        if findings:
            # Add label
            add_textbox(s, margin, findings_top, inner_w, Inches(0.3), 'Findings', size=20, bold=True)
            add_textbox(s, margin, findings_top + Inches(0.35), inner_w, max(findings_h - Inches(0.35), Inches(0.8)), findings, size=16)

    # Ensure at least one slide exists
    if len(prs.slides) == 0:
        prs.slides.add_slide(prs.slide_layouts[5])

    prs.save(r"${escapedPptxPath}")
    print("SUCCESS: PPTX file created", file=sys.stdout)
except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
  `);

  // Run the script and capture logs
  // Use cwd + relative script name to avoid issues with spaces/parentheses in paths
  const py = spawn(PYTHON_PATH, ['makepptx.py'], { cwd: tempDir });
  let out = '';
  let err = '';
  py.stdout && py.stdout.on('data', (d) => { out += d.toString(); });
  py.stderr && py.stderr.on('data', (d) => { err += d.toString(); });
  
  // Add timeout (30 seconds)
  const timeout = setTimeout(() => {
    if (!responseSent) {
      console.error('[pptx] Python script timeout after 30 seconds');
      py.kill();
      sendError(500, { error: 'PPTX generation timed out. Please check if Python dependencies are installed: pip install python-pptx Pillow' });
      setImmediate(() => cleanupDir(tempDir));
    }
  }, 30000);
  
  py.on('error', (e) => {
    clearTimeout(timeout);
    console.error('[pptx] spawn error', e);
    console.error('[pptx] Python path:', PYTHON_PATH);
    sendError(500, { error: 'Failed to run Python for PPTX. Make sure Python is installed and accessible.', spawnError: String(e) });
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });
  py.on('close', (code) => {
    clearTimeout(timeout);
    if (responseSent) return;
    
    // Log all output for debugging
    if (out) console.log('[pptx] Python stdout:', out);
    if (err) console.error('[pptx] Python stderr:', err);
    
    if (code === 0) {
      if (fs.existsSync(pptxPath)) {
        const stats = fs.statSync(pptxPath);
        // Check if file is valid (PPTX files should be at least a few KB)
        if (stats.size < 1000) {
          console.error('[pptx] PPTX file too small, likely invalid:', stats.size, 'bytes');
          console.error('[pptx] stdout:', out);
          console.error('[pptx] stderr:', err);
          sendError(500, { error: 'PPTX file appears to be invalid or empty', size: stats.size, stdout: out, stderr: err });
          setImmediate(() => cleanupDir(tempDir));
          return;
        }
        
        responseSent = true;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', 'attachment; filename="AI_Report.pptx"');
        res.setHeader('Content-Length', stats.size);
        const fileStream = fs.createReadStream(pptxPath);
        fileStream.on('error', (err) => {
          console.error('[pptx] file stream error:', err);
          if (!res.headersSent) {
            responseSent = true;
            res.status(500).json({ error: 'Failed to read PPTX file', details: String(err) });
          }
          setImmediate(() => cleanupDir(tempDir));
        });
        fileStream.on('end', () => {
          setImmediate(() => cleanupDir(tempDir));
        });
        fileStream.pipe(res);
      } else {
        console.error('[pptx] PPTX file not found at:', pptxPath);
        console.error('[pptx] stdout:', out);
        console.error('[pptx] stderr:', err);
        sendError(500, { error: 'PPTX file not generated', stdout: out, stderr: err });
        setImmediate(() => cleanupDir(tempDir));
      }
    } else {
      console.error('[pptx] Python script failed with exit code:', code);
      console.error('[pptx] stdout:', out);
      console.error('[pptx] stderr:', err);
      
      // Check for common errors
      let errorMsg = 'PPTX generation failed';
      if (err.includes('IMPORT_ERROR') || err.includes('ModuleNotFoundError') || err.includes('ImportError')) {
        errorMsg = 'Missing Python dependencies. Please install: pip install python-pptx Pillow';
      } else if (err.includes('ERROR:')) {
        const match = err.match(/ERROR:\s*(.+)/);
        if (match) errorMsg = match[1];
      }
      
      sendError(500, { 
        error: errorMsg, 
        code, 
        stdout: out, 
        stderr: err,
        hint: 'If you see import errors, run: pip install python-pptx Pillow'
      });
      setImmediate(() => cleanupDir(tempDir));
    }
  });
});

// --- 5. (Optional) PPTX Preview as Images (Advanced) ---
// You can add a similar endpoint using python-pptx + pdf2image if you want slide previews.

// --- Contact Form Submission ---
app.post('/api/contact', (req, res) => {
  const { firstName, lastName, email, phone, company, industry, subject, message, newsletter } = req.body;
  const submission = {
    firstName,
    lastName,
    email,
    phone,
    company,
    industry,
    subject,
    message,
    newsletter,
    submittedAt: new Date().toISOString(),
  };

  const submissionsFilePath = path.join(__dirname, '../../backend/contact-form-submissions.json');

  fs.readFile(submissionsFilePath, 'utf8', (err, data) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Error reading submissions file:', err);
      return res.status(500).json({ error: 'Failed to save submission.' });
    }

    let submissions = [];
    if (data) {
      try {
        const parsedData = JSON.parse(data);
        // Ensure we have an array
        if (Array.isArray(parsedData)) {
          submissions = parsedData;
        }
      } catch (parseError) {
        console.error('Error parsing contact-form-submissions.json, starting new list.', parseError);
        // If file is corrupt, start with a new empty list to prevent data loss.
        // For even greater safety, you might consider renaming the corrupt file here.
        submissions = [];
      }
    }
    submissions.push(submission);

    fs.writeFile(submissionsFilePath, JSON.stringify(submissions, null, 2), (err) => {
      if (err) {
        console.error('Error writing submissions file:', err);
        return res.status(500).json({ error: 'Failed to save submission.' });
      }
      res.status(200).json({ message: 'Form submitted successfully!' });
    });
  });
});

app.listen(5000, () => console.log('API running on http://localhost:5000'));
