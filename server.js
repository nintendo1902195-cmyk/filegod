const express = require('express');
const multer = require('multer');
const uuid = require('uuid').v4;
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Allow cross-origin requests from frontend
app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Upload folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer setup
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Codes file
const CODES_FILE = 'codes.json';

function loadCodes() {
  try {
    return JSON.parse(fs.readFileSync(CODES_FILE));
  } catch {
    return {};
  }
}

function saveCodes(codes) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2));
}

// Upload route
app.post('/upload', upload.single('file'), (req, res) => {
  const code = uuid();
  const codes = loadCodes();

  const units = {
    minutes: 60 * 1000,
    hours: 3600000,
    days: 86400000,
    weeks: 604800000,
    months: 2592000000,
    years: 31536000000
  };

  const {
    expiresIn,
    expiresUnit,
    maxDownloads,
    password,
    customFilename
  } = req.body;

  const expiresAt = expiresIn
    ? Date.now() + parseInt(expiresIn) * (units[expiresUnit] || units.minutes)
    : null;

  codes[code] = {
    filename: req.file.filename,
    customName: customFilename || null,
    password: password || null,
    maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
    downloadCount: 0,
    expiresAt
  };

  saveCodes(codes);
  res.send(code);
});

// Download route
app.get('/download/:code', (req, res) => {
  const codes = loadCodes();
  const codeData = codes[req.params.code];
  if (!codeData) return res.status(404).send('Invalid code');

  const filePath = path.join(uploadDir, codeData.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing');

  // Check expiration
  if (codeData.expiresAt && Date.now() > codeData.expiresAt)
    return res.status(410).send('File expired');

  // Check password
  const inputPass = req.query.password || '';
  if (codeData.password && codeData.password !== inputPass)
    return res.status(403).send('Wrong password');

  // Check max downloads
  if (
    codeData.maxDownloads &&
    codeData.downloadCount >= codeData.maxDownloads
  ) {
    return res.status(429).send('Download limit exceeded');
  }

  // Serve file
  res.download(
    filePath,
    codeData.customName || codeData.filename,
    (err) => {
      if (err) console