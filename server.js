const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const uuid = require("uuid").v4;

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
const codesFile = "codes.json";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(codesFile)) fs.writeFileSync(codesFile, "{}");

const units = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  months: 2_592_000_000,
  years: 31_536_000_000
};

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

function loadCodes() {
  try {
    return JSON.parse(fs.readFileSync(codesFile));
  } catch {
    return {};
  }
}

function saveCodes(data) {
  try {
    fs.writeFileSync(codesFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("❌ Failed to save codes:", err);
  }
}

app.post("/upload", upload.array("files"), (req, res) => {
  const codes = loadCodes();
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

  const uploaded = [];

  for (const file of req.files || []) {
    const code = uuid();
    codes[code] = {
      filename: file.filename,
      customName: customFilename || null,
      password: password || null,
      expiresAt,
      maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
      downloadCount: 0
    };
    uploaded.push(code);
  }

  saveCodes(codes);
  res.json({ codes: uploaded });
});

app.get("/download/:code", (req, res) => {
  const codes = loadCodes();
  const info = codes[req.params.code];
  if (!info) return res.status(404).send("Invalid code");

  const filePath = path.join(uploadDir, info.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("File missing");

  if (info.expiresAt && Date.now() > info.expiresAt)
    return res.status(410).send("File expired");

  if (info.password && info.password !== (req.query.password || ""))
    return res.status(403).send("Wrong password");

  if (info.maxDownloads && info.downloadCount >= info.maxDownloads)
    return res.status(429).send("Download limit reached");

  res.download(filePath, info.customName || info.filename, () => {
    const codesNow = loadCodes();
    const record = codesNow[req.params.code];
    if (!record) return;
    record.downloadCount = (record.downloadCount || 0) + 1;

    const reachedLimit = record.maxDownloads && record.downloadCount >= record.maxDownloads;
    if (reachedLimit) {
      fs.unlink(path.join(uploadDir, record.filename), () => {});
      delete codesNow[req.params.code];
    }

    saveCodes(codesNow);
  });
});

app.head("/download/:code", (req, res) => {
  const codes = loadCodes();
  const info = codes[req.params.code];
  if (!info) return res.status(404).end();

  const filePath = path.join(uploadDir, info.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  if (info.expiresAt && Date.now() > info.expiresAt) return res.status(410).end();
  if (info.password && info.password !== (req.query.password || "")) return res.status(403).end();
  if (info.maxDownloads && info.downloadCount >= info.maxDownloads) return res.status(429).end();

  res.status(200).end();
});

app.listen(port, () => console.log(`💾 FileGod live on port ${port}`));
