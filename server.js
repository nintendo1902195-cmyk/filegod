const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const uuid = require("uuid").v4;
const axios = require("axios"); // Added for VirusTotal API

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
const codesFile = "codes.json";

// VirusTotal API setup
const VIRUSTOTAL_API_KEY = "c3d01487f74daf577a66030da8c819a49b93c39137190fd0084788e039a5d9cd"; // Replace with your API key
const VIRUSTOTAL_API_URL = "https://www.virustotal.com/api/v3/files";

// Make sure folders and codes.json exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(codesFile)) fs.writeFileSync(codesFile, "{}");
fs.writeFileSync(path.join(uploadDir, ".keep"), ""); // Keeps uploads folder visible in Glitch

const units = {
  minutes: 60000,
  hours: 3600000,
  days: 86400000,
  weeks: 604800000,
  months: 2592000000,
  years: 31536000000,
};

app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    console.log("📥 Saving:", file.originalname);
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

function loadCodes() {
  try {
    return JSON.parse(fs.readFileSync(codesFile));
  } catch {
    return {};
  }
}

function saveCodes(codes) {
  try {
    fs.writeFileSync(codesFile, JSON.stringify(codes, null, 2));
    console.log("✅ Codes saved:", Object.keys(codes).length);
  } catch (err) {
    console.error("❌ Failed to save codes:", err);
  }
}

// Function to scan files with VirusTotal
async function scanFileWithVirusTotal(filePath) {
  try {
    const fileStream = fs.createReadStream(filePath);
    const response = await axios.post(VIRUSTOTAL_API_URL, fileStream, {
      headers: {
        "x-apikey": VIRUSTOTAL_API_KEY,
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    console.error("❌ VirusTotal scan failed:", error.response?.data || error.message);
    throw new Error("VirusTotal scan failed");
  }
}

// Upload endpoint with VirusTotal integration
app.post("/upload", upload.array("files"), async (req, res) => {
  const codes = loadCodes();
  const { expiresIn, expiresUnit, password, maxDownloads, customFilename } = req.body;

  const expiresAt = expiresIn
    ? Date.now() + parseInt(expiresIn) * (units[expiresUnit] || units.minutes)
    : null;

  const codesCreated = [];

  for (const file of req.files || []) {
    const filePath = path.join(uploadDir, file.filename);

    // Scan the file with VirusTotal
    try {
      const scanResult = await scanFileWithVirusTotal(filePath);
      const maliciousCount = scanResult.data.attributes.last_analysis_stats.malicious;

      if (maliciousCount > 0) {
        console.log(`🚨 Malicious file detected: ${file.filename}`);
        fs.unlinkSync(filePath); // Delete the malicious file
        return res.status(400).json({ error: "Malicious file detected", file: file.filename });
      }
    } catch (err) {
      return res.status(500).json({ error: "VirusTotal scan failed", details: err.message });
    }

    // Save file metadata if it's clean
    const code = uuid();
    codes[code] = {
      filename: file.filename,
      customName: customFilename || null,
      password: password || null,
      expiresAt,
      maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
      downloadCount: 0,
    };
    codesCreated.push(code);
  }

  saveCodes(codes);
  res.json({ codes: codesCreated });
});

// Download endpoint
app.get("/download/:code", (req, res) => {
  const codes = loadCodes();
  const info = codes[req.params.code];
  if (!info) return res.status(404).send("Invalid code");

  const filePath = path.join(uploadDir, info.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("File missing");

  if (info.expiresAt && Date.now() > info.expiresAt)
    return res.status(410).send("Expired");

  if (info.password && info.password !== (req.query.password || ""))
    return res.status(403).send("Wrong password");

  if (info.maxDownloads && info.downloadCount >= info.maxDownloads)
    return res.status(429).send("Download limit reached");

  res.download(filePath, info.customName || info.filename, () => {
    const updated = loadCodes();
    const entry = updated[req.params.code];
    if (!entry) return;
    entry.downloadCount += 1;

    const shouldDelete = entry.maxDownloads && entry.downloadCount >= entry.maxDownloads;
    if (shouldDelete) {
      fs.unlink(filePath, () => {});
      delete updated[req.params.code];
    }

    saveCodes(updated);
  });
});

// Head endpoint for checking file status
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

// Start the server
app.listen(port, () => console.log(`💾 FileGod running on port ${port}`));
