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

const SESSION_ROOT = path.join(os.tmpdir(), 'insight-to-deck');

// Resolve Python interpreter: valid env var > repo-local venvs > system
const isWin = process.platform === 'win32';
const pythonCandidates = [
  process.env.PYTHON_PATH && process.env.PYTHON_PATH.trim(),
  path.join(__dirname, isWin ? '../../ai_venv/Scripts/python.exe' : '../../ai_venv/bin/python'),
  path.join(__dirname, isWin ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python'),
  path.join(__dirname, isWin ? '../../venv/Scripts/python.exe' : '../../venv/bin/python'),
  'python',
].filter(Boolean);

const PYTHON_PATH = pythonCandidates.find((candidate) => {
  if (candidate === 'python') return true;
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}) || 'python';
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

function getSessionDir(sessionId) {
  return path.join(SESSION_ROOT, String(sessionId || ''));
}

function getSessionCsvPath(sessionId) {
  return path.join(getSessionDir(sessionId), 'data.csv');
}

function getSessionMetaPath(sessionId) {
  return path.join(getSessionDir(sessionId), 'meta.json');
}

function ensureSessionMeta(sessionId) {
  const metaPath = getSessionMetaPath(sessionId);
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({ markedRows: [] }, null, 2));
  }
}

function readSessionMeta(sessionId) {
  const metaPath = getSessionMetaPath(sessionId);
  try {
    ensureSessionMeta(sessionId);
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      markedRows: Array.isArray(parsed?.markedRows) ? parsed.markedRows.map((v) => Number(v)).filter(Number.isFinite) : [],
    };
  } catch {
    return { markedRows: [] };
  }
}

function writeSessionMeta(sessionId, meta) {
  const sessionDir = getSessionDir(sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(getSessionMetaPath(sessionId), JSON.stringify(meta, null, 2));
}

function parseCsvFromSession(sessionId) {
  const csvPath = getSessionCsvPath(sessionId);
  if (!fs.existsSync(csvPath)) {
    const err = new Error('Data for this session not found. Please upload the file again.');
    err.status = 404;
    throw err;
  }
  const content = fs.readFileSync(csvPath, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  const columns = records.length ? Object.keys(records[0]) : [];
  return { csvPath, records, columns };
}

function toCsvString(records, preferredColumns = []) {
  const columnSet = new Set(Array.isArray(preferredColumns) ? preferredColumns : []);
  for (const row of records || []) {
    for (const key of Object.keys(row || {})) columnSet.add(key);
  }
  const columns = Array.from(columnSet);
  const lines = [
    columns.join(','),
    ...(records || []).map((row) =>
      columns
        .map((column) => {
          const raw = row && Object.prototype.hasOwnProperty.call(row, column) ? row[column] : '';
          const val = raw == null ? '' : String(raw);
          if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    ),
  ];
  return { csvString: lines.join('\n'), columns };
}

function writeSessionRecords(sessionId, records, preferredColumns = []) {
  const sessionDir = getSessionDir(sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const { csvString, columns } = toCsvString(records, preferredColumns);
  fs.writeFileSync(getSessionCsvPath(sessionId), csvString);
  ensureSessionMeta(sessionId);
  return columns;
}

function paginateRows(rows, offset, limit) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(10000, Number(limit) || 100));
  return {
    rows: rows.slice(safeOffset, safeOffset + safeLimit),
    offset: safeOffset,
    limit: safeLimit,
  };
}

function createSessionDataPayload(sessionId, rows, columns, offset, limit) {
  const meta = readSessionMeta(sessionId);
  const page = paginateRows(rows, offset, limit);
  return {
    rows: page.rows,
    offset: page.offset,
    limit: page.limit,
    totalRows: rows.length,
    columns,
    markedRows: meta.markedRows,
  };
}

function applySimpleFormula(records, expression, outputColumn) {
  const expr = String(expression || '').trim().replace(/^=/, '');
  if (!expr) {
    const err = new Error('Formula cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (!records.length) return records;

  const jsExpr = expr.replace(/\^/g, '**');
  const evaluator = new Function(
    'row',
    `
      with (row) {
        return (${jsExpr});
      }
    `
  );
  return records.map((row) => {
    let result = '';
    try {
      result = evaluator(row);
    } catch (e) {
      const err = new Error(`Failed to evaluate formula: ${e?.message || e}`);
      err.status = 400;
      throw err;
    }
    return { ...row, [outputColumn]: result == null ? '' : result };
  });
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const GROQ_API_BASE = (process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OPENROUTER_API_BASE = (process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const SAFE_AI_FALLBACK_MESSAGE =
  "AI service is temporarily unavailable right now. I can still help with deterministic actions (data preview, edits, and local script execution). Please retry in a moment.";

// Helper: retry + fallback across models to handle 503/overloaded/429
const DEFAULT_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-pro-latest'
];
const MODEL_COOLDOWN_MS = Number(process.env.GEMINI_MODEL_COOLDOWN_MS || 60_000);
const GLOBAL_COOLDOWN_MS = Number(process.env.GEMINI_GLOBAL_COOLDOWN_MS || 45_000);
const modelCooldownUntil = new Map();
let globalCooldownUntil = 0;

function nowMs() {
  return Date.now();
}

function jitterMs(baseMs = 300) {
  return Math.floor(Math.random() * Math.max(1, baseMs));
}

function createRateLimitError(message, retryAfterSec = 30) {
  const err = new Error(message || 'AI provider rate limited the request.');
  err.status = 429;
  err.retryable = true;
  err.retryAfterSec = Math.max(1, Math.ceil(Number(retryAfterSec) || 30));
  return err;
}

function sanitizeProviderErrorMessage(input) {
  const msg = String(input || 'AI analysis failed.');
  return msg.replace(/key=[^&\s"']+/gi, 'key=[REDACTED]');
}

function getAvailableCandidates(candidates) {
  const now = nowMs();
  return candidates.filter((modelId) => {
    const until = Number(modelCooldownUntil.get(modelId) || 0);
    return until <= now;
  });
}

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
  const now = nowMs();
  if (globalCooldownUntil > now) {
    const retryAfterSec = Math.ceil((globalCooldownUntil - now) / 1000);
    throw createRateLimitError(
      'AI service is temporarily rate limited. Please retry shortly.',
      retryAfterSec
    );
  }

  const availableCandidates = getAvailableCandidates(candidates);
  if (!availableCandidates.length) {
    const retryAt = candidates.reduce((maxUntil, modelId) => {
      const until = Number(modelCooldownUntil.get(modelId) || 0);
      return Math.max(maxUntil, until);
    }, 0);
    const retryAfterSec = Math.ceil(Math.max(1000, retryAt - nowMs()) / 1000);
    throw createRateLimitError(
      'All configured AI models are temporarily cooling down after rate limits.',
      retryAfterSec
    );
  }

  let lastErr;
  let anyRateLimited = false;
  let maxRetryAfterSec = 0;

  for (const modelId of availableCandidates) {
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
           console.error(`[gemini] Client error for model ${modelId}: ${sanitizeProviderErrorMessage(e.message)}`);
           if (status === 429) {
             anyRateLimited = true;
             const cooldownMs = MODEL_COOLDOWN_MS + jitterMs(5000);
             const modelCooldown = nowMs() + cooldownMs;
             modelCooldownUntil.set(modelId, modelCooldown);
             const retryAfterSec = Math.ceil(cooldownMs / 1000);
             maxRetryAfterSec = Math.max(maxRetryAfterSec, retryAfterSec);
             console.warn(`[gemini] Quota exceeded for ${modelId}, trying next model...`);
             break; // Try next model
           } else {
             throw e; // Other 4xx errors are not retryable
           }
        }

        // Only retry on 503 Service Unavailable or other potential transient server issues.
        const isRetryableServerError = status >= 500;
        if (isRetryableServerError && attempt < 2) {
          const waitMs = backoff + jitterMs(250);
          console.warn(`[gemini] Server error for ${modelId}, retrying in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          backoff *= 2; // Exponential backoff
          attempt++;
        } else {
          // If it's another type of error or retries are exhausted, stop for this model.
          break;
        }
      }
    }
  }

  if (anyRateLimited) {
    globalCooldownUntil = Math.max(globalCooldownUntil, nowMs() + GLOBAL_COOLDOWN_MS);
    throw createRateLimitError(
      'AI service is currently rate limited by the provider. Falling back to deterministic logic where possible.',
      maxRetryAfterSec || Math.ceil(GLOBAL_COOLDOWN_MS / 1000)
    );
  }

  // If all models and retries fail, throw the last captured error.
  throw lastErr || new Error("AI generation failed with all candidate models.");
}

async function generateWithGroq(prompt) {
  const groqApiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY is not configured.');
  }

  const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });

  const bodyText = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const msg = String(payload?.error?.message || bodyText || `Groq request failed (${response.status})`);
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) {
    throw new Error('Groq returned an empty response.');
  }
  return String(content);
}

async function generateWithOpenRouter(prompt) {
  const openRouterApiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!openRouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:8080',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'Engineering Data Agent',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });

  const bodyText = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const msg = String(payload?.error?.message || bodyText || `OpenRouter request failed (${response.status})`);
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) {
    throw new Error('OpenRouter returned an empty response.');
  }
  return String(content);
}

function spawnSyncSafe(command, args, cwd) {
  try {
    const proc = require('child_process').spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 60000,
    });
    if (proc.error) {
      return { success: false, error: String(proc.error.message || proc.error) };
    }
    if (proc.status !== 0) {
      return { success: false, error: String(proc.stderr || proc.stdout || `Command failed (${proc.status})`) };
    }
    return { success: true, stdout: proc.stdout || '', stderr: proc.stderr || '' };
  } catch (e) {
    return { success: false, error: String(e?.message || e) };
  }
}

async function generateWithAiRouter(prompt) {
  try {
    const geminiResult = await generateWithFallback(prompt);
    return {
      answer: geminiResult?.response?.text?.() || '',
      provider: 'gemini',
      degraded: false,
    };
  } catch (geminiErr) {
    console.warn('[ai-router] Gemini failed. Falling back to OpenRouter.', sanitizeProviderErrorMessage(geminiErr?.message));
  }

  try {
    const openRouterAnswer = await generateWithOpenRouter(prompt);
    return {
      answer: openRouterAnswer,
      provider: 'openrouter',
      degraded: false,
    };
  } catch (openRouterErr) {
    console.error('[ai-router] OpenRouter fallback failed.', sanitizeProviderErrorMessage(openRouterErr?.message));
  }

  try {
    const groqAnswer = await generateWithGroq(prompt);
    return {
      answer: groqAnswer,
      provider: 'groq',
      degraded: false,
    };
  } catch (groqErr) {
    console.error('[ai-router] Groq fallback failed.', sanitizeProviderErrorMessage(groqErr?.message));
  }

  return {
    answer: SAFE_AI_FALLBACK_MESSAGE,
    provider: 'safe-fallback',
    degraded: true,
  };
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
    const sessionDir = getSessionDir(sessionId);
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
    fs.writeFileSync(getSessionCsvPath(sessionId), csvString);
    writeSessionMeta(sessionId, { markedRows: [] });

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

app.get('/api/session/:sessionId/data', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { offset = 0, limit = 100 } = req.query || {};
    const { records, columns } = parseCsvFromSession(sessionId);
    return res.json(createSessionDataPayload(sessionId, records, columns, offset, limit));
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: String(err?.message || err) });
  }
});

app.post('/api/session/:sessionId/marks', async (req, res) => {
  try {
    const { sessionId } = req.params;
    parseCsvFromSession(sessionId);
    const markedRows = Array.isArray(req.body?.marked_rows)
      ? req.body.marked_rows.map((v) => Number(v)).filter(Number.isFinite)
      : [];
    writeSessionMeta(sessionId, { markedRows });
    return res.json({ success: true, markedRows });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: String(err?.message || err) });
  }
});

app.post('/api/session/:sessionId/edits', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const edits = Array.isArray(req.body?.edits) ? req.body.edits : [];
    const { records, columns } = parseCsvFromSession(sessionId);
    for (const edit of edits) {
      const rowIndex = Number(edit?.row_index);
      const column = String(edit?.column || '');
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= records.length || !column) continue;
      records[rowIndex][column] = edit?.value == null ? '' : String(edit.value);
    }
    const nextColumns = writeSessionRecords(sessionId, records, columns);
    return res.json({ success: true, editsApplied: edits.length, columns: nextColumns });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: String(err?.message || err) });
  }
});

app.post('/api/session/:sessionId/formula', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { formula, target_column: targetColumn, new_column_name: newColumnName } = req.body || {};
    const outputColumn = String(newColumnName || targetColumn || '').trim();
    if (!outputColumn) {
      return res.status(400).json({ error: 'Choose target column or new column name.' });
    }
    const { records, columns } = parseCsvFromSession(sessionId);

    let nextRecords;
    const normalizedFormula = String(formula || '').trim();
    if (/^=?np\.where\s*\(/i.test(normalizedFormula)) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-'));
      const scriptPath = path.join(tempDir, 'apply_formula.py');
      const payloadPath = path.join(tempDir, 'payload.json');
      fs.writeFileSync(
        scriptPath,
        [
          'import json',
          'import pandas as pd',
          'import numpy as np',
          'from pathlib import Path',
          'payload = json.loads(Path("payload.json").read_text(encoding="utf-8"))',
          'df = pd.DataFrame(payload["records"])',
          'formula = str(payload["formula"]).strip()',
          'if formula.startswith("="):',
          '    formula = formula[1:]',
          'target = payload["outputColumn"]',
          'df[target] = eval(formula, {"np": np, "pd": pd}, {"df": df})',
          'Path("result.json").write_text(df.to_json(orient="records"), encoding="utf-8")',
        ].join('\n')
      );
      fs.writeFileSync(payloadPath, JSON.stringify({ records, formula: normalizedFormula, outputColumn }, null, 2));
      const py = spawnSyncSafe(PYTHON_PATH, [scriptPath], tempDir);
      if (!py.success) {
        cleanupDir(tempDir);
        return res.status(400).json({ error: py.error });
      }
      nextRecords = JSON.parse(fs.readFileSync(path.join(tempDir, 'result.json'), 'utf8'));
      cleanupDir(tempDir);
    } else {
      nextRecords = applySimpleFormula(records, normalizedFormula, outputColumn);
    }

    const nextColumns = writeSessionRecords(sessionId, nextRecords, columns.includes(outputColumn) ? columns : [...columns, outputColumn]);
    return res.json({ success: true, column: outputColumn, columns: nextColumns });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: String(err?.message || err) });
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
7. The Python runner provides optional helpers for exact editable chart metadata:
   - set_chart_spec(spec)
   - update_chart_spec(patch)
   - register_chart_spec(spec)
   Use them whenever possible so chart semantics are preserved for editable import.
8. If you break these rules, the system will fail.
`;
    } else {
      prompt = `${historyContext}You are an expert data analyst. A pandas DataFrame named 'df' is in memory with columns: ${columns.join(', ')}.
The user's request is: "${question}"

Please provide a concise, data-driven answer in Markdown format.
- Use the 'df' DataFrame for any calculations. Do not load the data yourself.
- If you provide tables, use Markdown.
`;
    }

    const routed = await generateWithAiRouter(prompt);
    res.json({
      answer: routed.answer,
      provider: routed.provider,
      degraded: Boolean(routed.degraded),
    });
  } catch (err) {
    console.error('[analyze] AI error', err);
    const msg = sanitizeProviderErrorMessage((err && err.message) ? String(err.message) : 'AI analysis failed.');
    const status = (err && err.status) ? err.status : 500;
    return res.status(500).json({ error: msg, retryable: false });
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
    py.on('error', (err) => {
      setImmediate(() => cleanupDir(tempDir));
      return res.status(500).json({
        error: 'Failed to start Python visualization runner.',
        details: String(err?.message || err),
        pythonPath: PYTHON_PATH,
      });
    });
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

async function handleExecPython(req, res) {
  const { code, sessionId, session_id } = req.body || {};
  const resolvedSessionId = sessionId || session_id;

  if (!resolvedSessionId) {
    return res.status(400).json({ success: false, error: "Missing sessionId" });
  }

  try {
    const sessionDir = getSessionDir(resolvedSessionId);
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
_registered_chart_spec = None

def _coerce_chart_spec(spec):
    if spec is None:
        return None
    if isinstance(spec, dict):
        return dict(spec)
    raise TypeError("chart spec must be a dict")

def set_chart_spec(spec):
    global _registered_chart_spec
    _registered_chart_spec = _coerce_chart_spec(spec)
    return _registered_chart_spec

def update_chart_spec(patch):
    global _registered_chart_spec
    patch = _coerce_chart_spec(patch) or {}
    if _registered_chart_spec is None:
        _registered_chart_spec = {}
    _registered_chart_spec.update(patch)
    return _registered_chart_spec

def register_chart_spec(spec):
    return set_chart_spec(spec)

def _safe_list(values):
    out = []
    for v in values:
        try:
            if hasattr(v, "item"):
                v = v.item()
            if isinstance(v, (float, int, str, bool)) or v is None:
                out.append(v)
            else:
                out.append(str(v))
        except Exception:
            out.append(None)
    return out

def _normalize_artist_label(label, fallback="Series"):
    text = str(label or "").strip()
    if not text or text == "_nolegend_":
        return fallback
    return text

def _color_to_hex(value):
    try:
        if value is None:
            return None
        if hasattr(value, "__len__") and len(value) >= 3:
            r, g, b = value[:3]
            return "#{:02x}{:02x}{:02x}".format(
                int(max(0, min(1, float(r))) * 255),
                int(max(0, min(1, float(g))) * 255),
                int(max(0, min(1, float(b))) * 255),
            )
    except Exception:
        return None
    return None

def _tick_texts(ticks):
    try:
        return [str(t.get_text() or "").strip() for t in ticks if str(t.get_text() or "").strip()]
    except Exception:
        return []

def _infer_columns_from_texts(texts, available_columns):
    found = []
    columns_lower = [(str(col).lower(), str(col)) for col in available_columns]
    for text in texts:
        haystack = str(text or "").lower()
        if not haystack:
            continue
        for lower, original in columns_lower:
            if lower and lower in haystack and original not in found:
                found.append(original)
    return found

def _extract_line_traces(ax):
    traces = []
    for idx, line in enumerate(ax.get_lines()):
        try:
            x = _safe_list(line.get_xdata().tolist() if hasattr(line.get_xdata(), "tolist") else list(line.get_xdata()))
            y = _safe_list(line.get_ydata().tolist() if hasattr(line.get_ydata(), "tolist") else list(line.get_ydata()))
            if not x and not y:
                continue
            traces.append({
                "type": "line",
                "name": _normalize_artist_label(line.get_label(), f"Series {idx + 1}"),
                "x": x,
                "y": y,
                "color": _color_to_hex(line.get_color()) if hasattr(line, "get_color") else None,
                "linestyle": str(line.get_linestyle() or "-"),
            })
        except Exception:
            continue
    return traces

def _extract_scatter_traces(ax):
    traces = []
    scatter_index = 0
    for collection in ax.collections:
        if type(collection).__name__ != "PathCollection":
            continue
        try:
            offsets = collection.get_offsets()
        except Exception:
            offsets = None
        if offsets is None or not len(offsets):
            continue
        scatter_index += 1
        x = _safe_list([o[0] for o in offsets])
        y = _safe_list([o[1] for o in offsets])
        face = None
        try:
            colors = collection.get_facecolor()
            face = colors[0] if len(colors) else None
        except Exception:
            face = None
        traces.append({
            "type": "scatter",
            "name": _normalize_artist_label(getattr(collection, "get_label", lambda: "")(), f"Points {scatter_index}"),
            "x": x,
            "y": y,
            "color": _color_to_hex(face),
        })
    return traces

def _extract_bar_traces(ax):
    groups = {}
    group_order = []
    for patch in ax.patches:
        if type(patch).__name__ != "Rectangle":
            continue
        try:
            if patch == ax.patch:
                continue
        except Exception:
            pass
        try:
            width = float(patch.get_width())
            height = float(patch.get_height())
            if abs(width) < 1e-12 and abs(height) < 1e-12:
                continue
            label = _normalize_artist_label(patch.get_label(), "")
            color = _color_to_hex(patch.get_facecolor())
            key = (label or color or f"Series {len(group_order) + 1}", color or "")
            if key not in groups:
                groups[key] = {
                    "type": "bar",
                    "name": key[0],
                    "x": [],
                    "y": [],
                    "color": color,
                }
                group_order.append(key)
            vertical = abs(height) >= abs(width)
            x_val = patch.get_x() + patch.get_width() / 2.0 if vertical else patch.get_width()
            y_val = patch.get_height() if vertical else patch.get_y() + patch.get_height() / 2.0
            groups[key]["x"].append(x_val)
            groups[key]["y"].append(y_val)
        except Exception:
            continue
    traces = []
    for key in group_order:
        entry = groups[key]
        try:
            pairs = sorted(zip(entry["x"], entry["y"]), key=lambda item: item[0])
            entry["x"] = _safe_list([p[0] for p in pairs])
            entry["y"] = _safe_list([p[1] for p in pairs])
        except Exception:
            pass
        traces.append(entry)
    return traces

def _extract_box_groups(ax, xtick_labels, ytick_labels):
    groups = []
    path_patches = [patch for patch in ax.patches if type(patch).__name__ == "PathPatch"]
    labels = xtick_labels if len(xtick_labels) >= len(path_patches) else ytick_labels
    for idx, patch in enumerate(path_patches):
        try:
            transformed = patch.get_transform().transform(patch.get_path().vertices)
            data_verts = ax.transData.inverted().transform(transformed)
            xs = [float(v[0]) for v in data_verts]
            ys = [float(v[1]) for v in data_verts]
            groups.append({
                "label": labels[idx] if idx < len(labels) else f"Group {idx + 1}",
                "x_center": sum(xs) / len(xs) if xs else idx + 1,
                "q1": min(ys) if ys else None,
                "q3": max(ys) if ys else None,
            })
        except Exception:
            groups.append({
                "label": labels[idx] if idx < len(labels) else f"Group {idx + 1}",
            })
    return groups

def _extract_violin_groups(ax, xtick_labels, ytick_labels):
    groups = []
    poly_collections = [collection for collection in ax.collections if type(collection).__name__ == "PolyCollection"]
    labels = xtick_labels if len(xtick_labels) >= len(poly_collections) else ytick_labels
    for idx, collection in enumerate(poly_collections):
        try:
            paths = collection.get_paths()
            verts = []
            for path in paths[:1]:
                transformed = collection.get_transform().transform(path.vertices)
                verts.extend(ax.transData.inverted().transform(transformed))
            xs = [float(v[0]) for v in verts]
            ys = [float(v[1]) for v in verts]
            groups.append({
                "label": labels[idx] if idx < len(labels) else f"Group {idx + 1}",
                "x_center": sum(xs) / len(xs) if xs else idx + 1,
                "min": min(ys) if ys else None,
                "max": max(ys) if ys else None,
            })
        except Exception:
            groups.append({
                "label": labels[idx] if idx < len(labels) else f"Group {idx + 1}",
            })
    return groups

def _infer_panel_chart_type(ax, title_text, line_traces, scatter_traces, bar_traces, box_groups, violin_groups):
    title = str(title_text or "").lower()
    if "fft" in title and bar_traces:
        return "fft_bar"
    if any(token in title for token in ["spc", "xbar", "control chart", "control limits"]):
        return "spc"
    if "hist" in title and bar_traces:
        return "histogram"
    if ("violin" in title or title.endswith(" violin")) and violin_groups:
        return "violin"
    if ("box" in title or "boxplot" in title) and box_groups:
        return "box"
    if violin_groups and not bar_traces and not scatter_traces:
        return "violin"
    if box_groups and not bar_traces and len(line_traces) >= max(4, len(box_groups)):
        return "box"
    if bar_traces:
        return "grouped_bar" if len(bar_traces) > 1 else "bar"
    if len(line_traces) > 1:
        return "multi_series_line"
    if line_traces:
        return "line"
    if len(scatter_traces) > 1:
        return "multi_series_scatter"
    if scatter_traces:
        return "scatter"
    if getattr(ax, "images", None):
        return "heatmap"
    if any(type(collection).__name__ == "LineCollection" for collection in ax.collections):
        return "contour"
    return "unknown"

def _extract_axis_panel(ax, panel_index, available_columns):
    title = ax.get_title() or ""
    x_label = ax.get_xlabel() or ""
    y_label = ax.get_ylabel() or ""
    xtick_labels = _tick_texts(ax.get_xticklabels())
    ytick_labels = _tick_texts(ax.get_yticklabels())
    legend = ax.get_legend()
    legend_labels = [str(t.get_text() or "").strip() for t in legend.get_texts()] if legend else []

    line_traces = _extract_line_traces(ax)
    scatter_traces = _extract_scatter_traces(ax)
    bar_traces = _extract_bar_traces(ax)
    box_groups = _extract_box_groups(ax, xtick_labels, ytick_labels)
    violin_groups = _extract_violin_groups(ax, xtick_labels, ytick_labels)
    chart_type = _infer_panel_chart_type(ax, title, line_traces, scatter_traces, bar_traces, box_groups, violin_groups)

    if chart_type in ("grouped_bar", "fft_bar", "bar", "histogram"):
        traces = bar_traces
    elif chart_type in ("multi_series_line", "spc", "line"):
        traces = line_traces
    elif chart_type in ("multi_series_scatter", "scatter"):
        traces = scatter_traces
    else:
        traces = line_traces + scatter_traces + bar_traces

    matched_columns = _infer_columns_from_texts(
        [title, x_label, y_label] + legend_labels + xtick_labels + ytick_labels,
        available_columns,
    )

    return {
        "index": panel_index,
        "title": title,
        "x_label": x_label,
        "y_label": y_label,
        "chart_type": chart_type,
        "xtick_labels": xtick_labels,
        "ytick_labels": ytick_labels,
        "legend_labels": legend_labels,
        "matched_columns": matched_columns,
        "box_groups": box_groups,
        "violin_groups": violin_groups,
        "traces": traces,
    }

def _extract_matplotlib_chart_spec():
    try:
        if _registered_chart_spec is not None:
            return dict(_registered_chart_spec)
        if not plt.get_fignums():
            return None
        fig = plt.gcf()
        if not fig.axes:
            return None
        available_columns = list(df.columns) if 'df' in globals() else []
        panels = []
        for idx, ax in enumerate(fig.axes):
            panel = _extract_axis_panel(ax, idx, available_columns)
            if panel and (panel.get("traces") or panel.get("box_groups") or panel.get("violin_groups")):
                panels.append(panel)
        if not panels:
            return None
        first = panels[0]
        all_columns = []
        for panel in panels:
            for column in panel.get("matched_columns", []):
                if column not in all_columns:
                    all_columns.append(column)
        return {
            "kind": "matplotlib",
            "title": first.get("title") or "",
            "x_label": first.get("x_label") or "",
            "y_label": first.get("y_label") or "",
            "chart_type": first.get("chart_type") or "unknown",
            "data_columns": all_columns,
            "traces": first.get("traces") or [],
            "panels": panels,
        }
    except Exception:
        return None

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
    output['chartSpec'] = _extract_matplotlib_chart_spec()

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
    py.on('error', (err) => {
      return res.status(500).json({
        success: false,
        error: 'Failed to start Python runner.',
        details: String(err?.message || err),
        pythonPath: PYTHON_PATH,
      });
    });

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
}

// --- 3. Execute AI-Generated Python Code Safely ---
app.post('/api/exec-python', handleExecPython);
app.post('/script/run', handleExecPython);

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

const PORT = Number(process.env.PORT || 5100);
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
