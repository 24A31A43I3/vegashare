require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serves CSS, JS, and Images

// --- 2. MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- 3. Schema Setup ---
const itemSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, required: true, enum: ['text', 'file'] },
  content: { type: String },           
  fileData: { type: Buffer },          
  fileName: { type: String },
  mimeType: { type: String },
  createdAt: { type: Date, default: Date.now, index: { expires: '30m' } } 
});
const Item = mongoose.model('Item', itemSchema);

// --- 4. Multer Configuration (15MB Limit) ---
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } 
});

// Helper: Generate Code
async function generateUniqueCode() {
  let code;
  let isUnique = false;
  while (!isUnique) {
    code = Math.floor(1000 + Math.random() * 9000).toString();
    const existing = await Item.findOne({ code });
    if (!existing) isUnique = true;
  }
  return code;
}

// --- 5. API Routes ---
app.get('/ping', (req, res) => res.status(200).send('pong'));

app.post('/api/upload-item', upload.single('file'), async (req, res) => {
  try {
    const code = await generateUniqueCode();
    let newItem;
    if (req.file) {
      newItem = new Item({
        code, type: 'file', fileData: req.file.buffer,
        fileName: req.file.originalname, mimeType: req.file.mimetype
      });
    } else if (req.body.text) {
      newItem = new Item({ code, type: 'text', content: req.body.text });
    } else {
      return res.status(400).json({ success: false, error: 'No data provided' });
    }
    await newItem.save();
    res.json({ success: true, code });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.get('/api/get-item', async (req, res) => {
  try {
    const { code } = req.query;
    const item = await Item.findOne({ code });
    if (!item) return res.status(404).json({ success: false, error: 'Expired or not found' });
    if (item.type === 'text') {
      return res.json({ success: true, itemType: 'text', content: item.content });
    } else {
      const fileBase64 = `data:${item.mimeType};base64,${item.fileData.toString('base64')}`;
      return res.json({ success: true, itemType: 'file', fileName: item.fileName, fileUrl: fileBase64 });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// --- 6. Catch-all Middleware (Express 5 Fix) ---
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 VegaShare active on port ${PORT}`));