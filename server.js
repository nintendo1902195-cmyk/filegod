const express = require('express');
const multer = require('multer');
const uuid = require('uuid').v4;
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from public/ (optional)
app.use(express.static('public'));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Set up multer for file handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// POST /upload route
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const code = uuid();
  let codes = {};
  try {
    codes = JSON.parse(fs.readFileSync('codes.json'));
  } catch (err) {
    console.warn('codes.json not found or invalid. Starting fresh.');
  }

  codes[code] = req.file.filename;
  fs.writeFileSync('codes.json', JSON.stringify(codes, null, 2));

  res.send(code);
});

// GET /download/:code route
app.get('/download/:code', (req, res) => {
  let codes = {};
  try {
    codes = JSON.parse(fs.readFileSync('codes.json'));
  } catch (err) {
    return res.status(500).send('Unable to read codes.');
  }

  const filename = codes[req.params.code];
  if (!filename) return res.status(404).send('Invalid code.');

  const filepath = path.join(__dirname, 'uploads', filename);
  if (!fs.existsSync(filepath)) return res.status(404).send('File not found.');

  res.download(filepath);
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
