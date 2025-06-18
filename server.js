const express = require('express');
const multer = require('multer');
const uuid = require('uuid').v4;
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Static file support (optional, e.g., for index.html)
app.use(express.static('public'));

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Upload route
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const code = uuid();

  let codes = {};
  try {
    codes = JSON.parse(fs.readFileSync('codes.json', 'utf8'));
  } catch {
    // Skip if file doesn't exist or is empty
  }

  codes[code] = req.file.filename;
  fs.writeFileSync('codes.json', JSON.stringify(codes, null, 2));

  console.log(`File uploaded. Code: ${code}`);
  res.send(code); // <-- This makes your frontend stop “waiting”
});

// Download route
app.get('/download/:code', (req, res) => {
  let codes = {};
  try {
    codes = JSON.parse(fs.readFileSync('codes.json', 'utf8'));
  } catch {
    return res.status(500).send('codes.json is missing or broken.');
  }

  const filename = codes[req.params.code];
  if (!filename) return res.status(404).send('Invalid code.');

  const filepath = path.join(uploadDir, filename);
  if (!fs.existsSync(filepath)) return res.status(404).send('File not found.');

  res.download(filepath);
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
