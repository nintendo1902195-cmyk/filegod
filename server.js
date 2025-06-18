const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const uuid = require("uuid").v4;

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
const codePath = "codes.json";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// middleware for CORS
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// multer setup
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// utils
function loadCodes() {
  try {
    return JSON.parse(fs.readFileSync(codePath));
  } catch {
    return {};
  }
}
function saveCodes(data) {
  fs.writeFileSync(codePath, JSON.stringify(data, null, 2));
}
const units = {
  minutes: 60_000,
  hours: 3600000,
  days: 86400000,
  weeks: 604800000,
  months: 2592000000,
  years: 31536000000
};

// upload route
app.post("/upload", upload.array("files"), (req, res) => {
  const {
    expiresIn,
    expiresUnit,
    password,
    maxDownloads,
    customFilename
  } = req.body;

  const expiresAt = expiresIn
    ? Date.now() + parseInt(expiresIn) * (units[expiresUnit] || units.minutes)
    : null;

  const codes = loadCodes();
  const codeList = [];

  for (const file of req.files) {
    const code = uuid();
    codes[code] = {
      filename: file.filename,
      customName: customFilename || null,
      password: password || null,
      expiresAt,
      maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
      downloadCount: 0
    };
    codeList.push(code);
  }

  saveCodes(codes);
  res.json({ codes: codeList });
});

// download route
app.get("/download/:code", (req, res) => {
  const codes = loadCodes();
  const info = codes[req.params.code];
  if (!info) return res.status(404).send("Invalid code");

  const filePath = path.join(uploadDir, info.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("File gone");

  if (info.expiresAt && Date.now() > info.expiresAt)
    return res.status(410).send("Expired");

  const supplied = req.query.password || "";
  if (info.password && info.password !== supplied)
    return res.status(403).send("Wrong password");

  if (info.maxDownloads && info.downloadCount >= info.maxDownloads)
    return res.status(429).send("Too many downloads");

  res.download(filePath, info.customName || info.filename, (err) => {
    if (err) return;
    const codesNow = loadCodes();
    const data = codesNow[req.params.code];
    if (!data) return;
    data.downloadCount += 1;

    const shouldDelete =
      data.maxDownloads && data.downloadCount >= data.maxDownloads;

    if (shouldDelete) {
      fs.unlink(path.join(uploadDir, data.filename), () => {});
      delete codesNow[req.params.code];
    }

    saveCodes(codesNow);
  });
});

// head route for frontend fetch check
app.head("/download/:code", (req, res) => {
  const codes = loadCodes();
  const info = codes[req.params.code];
  if (!info) return res.status(404).end();

  if (info.expiresAt && Date.now() > info.expiresAt) return res.status(410).end();

  const filePath = path.join(uploadDir, info.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const supplied = req.query.password || "";
  if (info.password && info.password !== supplied) return res.status(403).end();

  if (info.maxDownloads && info.downloadCount >= info.maxDownloads)
    return res.status(429).end();

  res.status(200).end();
});

app.listen(port, () => console.log(`💾 FileGod server on port ${port}`));
