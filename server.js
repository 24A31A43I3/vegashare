const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const Share = require("./models/Share");
const app = express();

// Enable trust proxy for Render load balancers (Ensures accurate rate-limiting by IP)
app.set("trust proxy", 1);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// ----------------------------------------------------
// SECURITY: RATE LIMITERS (Prevents Brute-Force & DoS)
// ----------------------------------------------------
// Strict limiter for payload retrieval (Prevents 4-digit PIN brute-forcing)
const retrieveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 attempts per IP per 15-minute window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many retrieval attempts. Please wait 15 minutes." },
});

// General limiter for upload creation
const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 shares created per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload limit reached. Please try again later." },
});

// 100% In-Memory Upload Config (Zero local disk usage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB strict file limit
});

// Helper: Secure 4-digit Code Generator Fallback
async function generateUniqueCode() {
  let code;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    code = Math.floor(1000 + Math.random() * 9000).toString();
    const found = await Share.findOne({ code });
    if (!found) exists = false;
    attempts++;
  }
  if (exists) throw new Error("Unable to generate unique PIN code. Try again.");
  return code;
}

// ----------------------------------------------------
// KEEP-ALIVE & HEALTH CHECK (Prevents Render Idle Sleep)
// ----------------------------------------------------
app.get("/api/health", (req, res) => {
  res.status(200).send("OK");
});

const SERVER_URL = process.env.RENDER_EXTERNAL_URL;
if (SERVER_URL) {
  const PING_INTERVAL = 14 * 60 * 1000; // Ping every 14 minutes
  setInterval(async () => {
    try {
      await fetch(`${SERVER_URL}/api/health`);
      console.log("[Keep-Alive] Server self-ping successful.");
    } catch (err) {
      console.error("[Keep-Alive] Ping failed:", err.message);
    }
  }, PING_INTERVAL);
}

// ----------------------------------------------------
// API 1: CREATE SHARE (Receives Encrypted Payloads)
// ----------------------------------------------------
app.post("/api/share", shareLimiter, upload.array("files"), async (req, res) => {
  try {
    const { code, type, textContent, expiryMinutes, maxDownloads, oneTimeAccess, cryptoSalt, cryptoIv } = req.body;

    if (!cryptoSalt || !cryptoIv) {
      return res.status(400).json({ error: "Missing end-to-end encryption metadata." });
    }

    // SECURITY: Strictly bound expiry minutes (15 mins to 24 hours max)
    let minutesToExpiry = parseInt(expiryMinutes, 10) || 15;
    if (minutesToExpiry < 1 || minutesToExpiry > 1440) {
      minutesToExpiry = 15;
    }
    const expireAt = new Date(Date.now() + minutesToExpiry * 60 * 1000);

    // SECURITY: Strictly bound max downloads (1 to 50 max)
    let limitDownloads = parseInt(maxDownloads, 10) || 5;
    if (limitDownloads < 1 || limitDownloads > 50) {
      limitDownloads = 5;
    }

    // Code assignment & uniqueness validation
    let finalCode = code;
    if (!finalCode || finalCode.length !== 4 || !/^\d{4}$/.test(finalCode)) {
      finalCode = await generateUniqueCode();
    } else {
      const existing = await Share.findOne({ code: finalCode });
      if (existing) {
        finalCode = await generateUniqueCode();
      }
    }

    const shareData = {
      code: finalCode,
      type: type === "text" ? "text" : "files",
      expireAt,
      cryptoSalt,
      cryptoIv,
      maxDownloads: limitDownloads,
      oneTimeAccess: oneTimeAccess === "true" || oneTimeAccess === true,
    };

    if (shareData.type === "text") {
      if (!textContent || typeof textContent !== "string") {
        return res.status(400).json({ error: "Text content cannot be empty." });
      }
      shareData.textContent = textContent;
    } else {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded." });
      }

      shareData.files = req.files.map((file) => ({
        originalName: file.originalname,
        data: file.buffer,
        size: file.size,
        mimetype: file.mimetype,
      }));
    }

    const newShare = new Share(shareData);
    await newShare.save();

    res.status(201).json({
      success: true,
      code: newShare.code,
      expireAt: newShare.expireAt,
      shareLink: `${req.protocol}://${req.get("host")}/#download?code=${newShare.code}`,
    });
  } catch (err) {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File exceeds strict 15 MB limit." });
    }
    // SECURITY: Log actual error internally, hide stack traces from clients
    console.error("Error in /api/share:", err);
    res.status(500).json({ error: "An error occurred while creating your share link." });
  }
});

// ----------------------------------------------------
// API 2: RETRIEVE ENCRYPTED PAYLOAD BY PIN
// ----------------------------------------------------
app.post("/api/retrieve", retrieveLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== "string" || !/^\d{4}$/.test(code)) {
      return res.status(400).json({ error: "Enter a valid 4-digit numeric PIN." });
    }

    const share = await Share.findOne({ code });

    if (!share) {
      return res.status(404).json({ error: "Payload expired or PIN code invalid." });
    }

    // Check if download limit reached
    if (share.downloadsCount >= share.maxDownloads) {
      await Share.deleteOne({ _id: share._id });
      return res.status(410).json({ error: "Download limit reached. Content permanently erased." });
    }

    share.downloadsCount += 1;
    await share.save();

    const shouldPurgeNow = share.oneTimeAccess || share.downloadsCount >= share.maxDownloads;

    res.json({
      success: true,
      type: share.type,
      cryptoSalt: share.cryptoSalt,
      cryptoIv: share.cryptoIv,
      textContent: share.type === "text" ? share.textContent : null,
      files:
        share.type === "files"
          ? share.files.map((f) => ({
              originalName: f.originalName,
              size: f.size,
              mimetype: f.mimetype,
              data: f.data.toString("hex"),
            }))
          : null,
      downloadsRemaining: share.maxDownloads - share.downloadsCount,
      expireAt: share.expireAt,
    });

    if (shouldPurgeNow) {
      await Share.deleteOne({ _id: share._id });
    }
  } catch (err) {
    // SECURITY: Log real error, return safe message
    console.error("Error in /api/retrieve:", err);
    res.status(500).json({ error: "An error occurred while retrieving content." });
  }
});

// ----------------------------------------------------
// CATCH-ALL ROUTE (Express 5 Named Wildcard Fix)
// ----------------------------------------------------
app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Database & Server Startup
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB Atlas successfully.");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`VegaShare is live on http://localhost:${PORT}`));
  })
  .catch((err) => console.error("Database connection error:", err.message));