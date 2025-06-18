const express = require('express');
const multer = require('multer');
const uuid = require('uuid').v4;
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 🛡️ Allow CORS so your frontend can access the backend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // You can replace * with your frontend URL for tighter security
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Serve static files (optional, for testing)
app.use(express.static('public'));

// Ensure 'uploads' folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer config for file saving
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// POST /upload → save file and return unique code
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const code = uuid();

  let codes = {};
  try {
    codes = JSON.parse(fs.readFileSync('codes.json', 'utf8'));
  } catch {
    // If file doesn’t exist, start fresh
  }

  codes[code] = req.file.filename;
  fs.writeFileSync('codes.json', JSON.stringify(codes, null, 2));

  console.log(`File uploaded. Code: ${code}`);
  res.send(code); // 🧠 frontend receives this!
});

// GET /download/:code → return file by code
app.get('/download/:code', (req, res) => {
  let codes = {};
  try {
    codes = JSON.parse(fs.readFileSync('codes.json', 'utf8'));
  } catch {
    return res.status(500).send('Error reading codes.json');
  }

  const filename = codes[req.params.code];
  if (!filename) return res.status(404).send('Invalid access code.');

  const filepath = path.join(uploadDir, filename);
  if (!fs.existsSync(filepath)) return res.status(404).send('File not found.');

  res.download(filepath);
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
