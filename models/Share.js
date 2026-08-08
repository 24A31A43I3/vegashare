const mongoose = require("mongoose");

const shareSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      length: 4,
    },
    type: {
      type: String,
      enum: ["files", "text"],
      required: true,
    },
    textContent: {
      type: String, // Encrypted hex string
    },
    // Binary data stored directly inside MongoDB Atlas (Zero local disk usage)
    files: [
      {
        originalName: String,
        data: Buffer,
        size: Number,
        mimetype: String,
      },
    ],
    // Encryption Metadata for Client-Side AES-256-GCM
    cryptoSalt: {
      type: String,
      required: true,
    },
    cryptoIv: {
      type: String,
      required: true,
    },
    maxDownloads: {
      type: Number,
      default: 5,
    },
    downloadsCount: {
      type: Number,
      default: 0,
    },
    oneTimeAccess: {
      type: Boolean,
      default: false,
    },
    expireAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// MongoDB Atlas TTL Index: Automatically purges document when expireAt time is reached
shareSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Share", shareSchema);