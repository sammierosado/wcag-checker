const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { scanUrl, scanHtml } = require('./lib/scanWeb');
const { scanPdf } = require('./lib/scanPdf');
const { renderReport } = require('./lib/report');

const PORT = process.env.PORT || 5173;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/scan-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Provide a full URL starting with http:// or https://' });
  }
  try {
    const result = await scanUrl(url);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/scan-html', async (req, res) => {
  const { html } = req.body || {};
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Provide HTML as a string' });
  }
  try {
    const result = await scanHtml(html);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/scan-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a PDF file as form field "pdf"' });
  try {
    const result = await scanPdf(req.file.path, req.file.originalname);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.post('/report', (req, res) => {
  const result = req.body;
  if (!result || !result.violations) {
    return res.status(400).send('Invalid scan result payload');
  }
  const html = renderReport(result);
  const name = (result.source?.source || 'report').replace(/[^a-z0-9\-_.]/gi, '_').slice(0, 60);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="wcag-report-${name}.html"`);
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`WCAG Checker running at http://localhost:${PORT}`);
});
