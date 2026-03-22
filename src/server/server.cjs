require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Gemini AI setup
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const genai = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genai.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// --- 1. CSV Upload & Preview ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const content = fs.readFileSync(file.path, 'utf8');
    const records = parse(content, { columns: true });
    fs.unlinkSync(file.path);
    res.json({ preview: records.slice(0, 5), columns: Object.keys(records[0]), data: records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse file.' });
  }
});

// --- 2. AI Analysis (Gemini) ---
app.post('/api/analyze', async (req, res) => {
  const { question, data } = req.body;
  try {
    const prompt = `You are an expert data analyst. Given this data:\n${JSON.stringify(data).slice(0, 8000)}\nAnswer this: ${question}\nIf code is needed, provide only Python code in triple backticks.`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    res.json({ answer: responseText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI analysis failed.' });
  }
});

// --- 3. Execute AI-Generated Python Code Safely ---
app.post('/api/exec-python', async (req, res) => {
  const { code, data } = req.body;
  // Save CSV to temp file
  const tempDir = fs.mkdtempSync('pyexec-');
  const csvPath = path.join(tempDir, 'data.csv');
  fs.writeFileSync(csvPath, data);

  // Save code to temp file
  const codePath = path.join(tempDir, 'script.py');
  fs.writeFileSync(codePath, `
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import plotly.express as px
import sys
import json

df = pd.read_csv('${csvPath.replace(/\\/g, '\\\\')}')
output = {}
try:
${code.split('\n').map(l => '    ' + l).join('\n')}
    output['success'] = True
except Exception as e:
    output['error'] = str(e)
    output['success'] = False

# Save matplotlib plot if exists
import os
if plt.get_fignums():
    plt.savefig('${path.join(tempDir, 'plot.png').replace(/\\/g, '\\\\')}')
    output['plot'] = 'plot.png'
    plt.close('all')

print(json.dumps(output))
  `);

  // Run the script
  const py = spawn('python', [codePath]);
  let stdout = '';
  let stderr = '';
  py.stdout.on('data', (data) => { stdout += data.toString(); });
  py.stderr.on('data', (data) => { stderr += data.toString(); });
  py.on('close', (code) => {
    let result = {};
    try { result = JSON.parse(stdout); } catch { result = { error: stdout || stderr, success: false }; }
    // Attach plot if exists
    if (result.plot && fs.existsSync(path.join(tempDir, 'plot.png'))) {
      const img = fs.readFileSync(path.join(tempDir, 'plot.png'), { encoding: 'base64' });
      result.plotData = `data:image/png;base64,${img}`;
    }
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    res.json(result);
  });
});

// --- 4. Generate PPTX from Slides ---
app.post('/api/generate-pptx', async (req, res) => {
  const { slides } = req.body; // [{title, text, imageBase64}]
  // Save slides to temp file
  const tempDir = fs.mkdtempSync('pptx-');
  const slidesPath = path.join(tempDir, 'slides.json');
  fs.writeFileSync(slidesPath, JSON.stringify(slides));

  // Python script to generate PPTX
  const codePath = path.join(tempDir, 'makepptx.py');
  fs.writeFileSync(codePath, `
import json
from pptx import Presentation
from pptx.util import Inches, Pt
import base64
import io
from PIL import Image

with open('${slidesPath.replace(/\\/g, '\\\\')}', 'r') as f:
    slides = json.load(f)

prs = Presentation()
for slide in slides:
    s = prs.slides.add_slide(prs.slide_layouts[1])
    s.shapes.title.text = slide.get('title', 'Slide')
    tx = s.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(8), Inches(3))
    tf = tx.text_frame
    tf.text = slide.get('text', '')
    if slide.get('imageBase64'):
        imgdata = base64.b64decode(slide['imageBase64'].split(',')[1])
        img = Image.open(io.BytesIO(imgdata))
        img_path = 'img.png'
        img.save(img_path)
        s.shapes.add_picture(img_path, Inches(1), Inches(3.5), width=Inches(6))
prs.save('output.pptx')
  `);

  // Run the script
  const py = spawn('python', [codePath], { cwd: tempDir });
  py.on('close', () => {
    const pptxPath = path.join(tempDir, 'output.pptx');
    if (fs.existsSync(pptxPath)) {
      res.download(pptxPath, 'AI_Report.pptx', () => {
        fs.rmSync(tempDir, { recursive: true, force: true });
      });
    } else {
      res.status(500).json({ error: 'Failed to generate PPTX.' });
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// --- 5. (Optional) PPTX Preview as Images (Advanced) ---
// You can add a similar endpoint using python-pptx + pdf2image if you want slide previews.

app.listen(5000, () => console.log('API running on http://localhost:5000'));