const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = 3000;
const MAX_STORAGE = 100 * 1024 * 1024 * 1024; // 100 GB

const upload = multer({ dest: 'uploads/' });
let codes = {};

app.use(express.static('public'));
app.use(express.json());

if (fs.existsSync('codes.json')) {
  codes = JSON.parse(fs.readFileSync('codes.json'));
}

function getUsedStorage() {
  const files = fs.readdirSync('uploads/');
  return files.reduce((total, file) => {
    const { size } = fs.statSync(path.join('uploads', file));
    return total + size;
  }, 0);
}

app.post('/upload', upload.single('file'), (req, res) => {
  const used = getUsedStorage();

  if (used + req.file.size > MAX_STORAGE) {
    fs.unlinkSync(req.file.path);
    return res.status(413).send('Storage limit reached (100GB). Try again later.');
  }

  const code = uuidv4().slice(0, 8);
  codes[code] = req.file.filename;
  fs.writeFileSync('codes.json', JSON.stringify(codes, null, 2));
  res.send(`File uploaded! Your code: ${code}`);
});

app.get('/retrieve/:code', (req, res) => {
  const file = codes[req.params.code];
  if (file) {
    res.download(path.join(__dirname, 'uploads', file));
  } else {
    res.status(404).send('Invalid code.');
  }
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
