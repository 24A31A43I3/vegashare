/**
 * VegaShare Final script.js
 * Features: Stacking notifications, Live individual download tracking,
 * Persistent UI across tab switches, and Mobile-friendly UX.
 */

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : '/api';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const textInput = document.getElementById('text-input');
const generateBtn = document.getElementById('generate-btn');
const sharesContainer = document.getElementById('active-shares-container');
const sendError = document.getElementById('send-error');
const codeInput = document.getElementById('code-input');
const getBtn = document.getElementById('get-btn');
const receiveResult = document.getElementById('receive-result');
const receiveError = document.getElementById('receive-error');
const textResult = document.getElementById('text-result');
const fileResult = document.getElementById('file-result');
const receivedText = document.getElementById('received-text');
const copyBtn = document.getElementById('copy-btn');
const fileInfo = document.getElementById('file-info');
const downloadLink = document.getElementById('download-link');

// --- 1. Tab Switching Logic ---
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.tab;
    
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    button.classList.add('active');
    document.getElementById(`${targetTab}-tab`).classList.add('active');
    
    // Clear only retrieval messages, persistent uploads stay visible
    receiveResult.style.display = 'none';
    receiveError.style.display = 'none';
  });
});

// --- 2. File Input Handling ---
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    if (file.size > MAX_FILE_SIZE) {
      showError('send', `File too large (Max 15MB).`);
      fileInput.value = '';
      fileLabel.textContent = 'Click to choose a file';
    } else {
      fileLabel.textContent = `Selected: ${file.name}`;
      textInput.value = ''; 
      sendError.style.display = 'none';
    }
  }
});

// --- 3. Send / Upload Logic (Stacking Feature) ---
generateBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  const file = fileInput.files[0];
  
  if (!text && !file) return showError('send', 'Please provide text or a file to share.');
  
  setLoading('generate', true);

  try {
    let response;
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      response = await fetch(`${API_URL}/upload-item`, { method: 'POST', body: formData });
    } else {
      response = await fetch(`${API_URL}/upload-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    }

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    
    // Create a new persistent card for this specific share
    createShareCard(data.code, file ? file.name : "Text Snippet");

    // Clear inputs for the next share
    textInput.value = '';
    fileInput.value = '';
    fileLabel.textContent = 'Click to choose a file (Max 15MB)';

  } catch (error) {
    showError('send', error.message);
  } finally {
    setLoading('generate', false);
  }
});

// --- 4. Dynamic Share Card & Live Tracking ---
function createShareCard(code, label) {
    const card = document.createElement('div');
    card.className = 'share-notification animate-in';
    card.innerHTML = `
        <div class="share-header">
            <span class="share-title">📦 ${label}</span>
            <button class="close-notify" title="Dismiss">✕</button>
        </div>
        <p class="result-label" style="text-align:center; margin-bottom:5px;">Retrieval Code:</p>
        <div class="mini-code">${code}</div>
        <div class="live-stats">
            Downloads: <span class="d-count">0</span>
        </div>
        <p class="result-hint">Expires in 30 minutes</p>
    `;

    sharesContainer.prepend(card); 

    // Handle Dismiss button with Animation
    card.querySelector('.close-notify').onclick = () => {
        card.classList.add('removing');
        setTimeout(() => card.remove(), 300);
    };

    // Independent Live Polling for this specific card
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`${API_URL}/get-stats?code=${code}`);
            const stats = await res.json();
            if (stats.success) {
                card.querySelector('.d-count').textContent = stats.downloadCount;
            } else {
                card.style.opacity = '0.6';
                card.querySelector('.live-stats').textContent = "Expired/Deleted";
                card.querySelector('.live-stats').style.color = "#9ca3af";
                clearInterval(interval);
            }
        } catch (e) {
            clearInterval(interval);
        }
    }, 5000);

    // Auto-remove card after 30 minutes
    setTimeout(() => {
        clearInterval(interval);
        if(card.parentElement) {
            card.classList.add('removing');
            setTimeout(() => card.remove(), 300);
        }
    }, 30 * 60 * 1000);
}

// --- 5. Receive / Retrieval Logic ---
getBtn.addEventListener('click', async () => {
  const code = codeInput.value.trim();
  if (!code || code.length !== 4) return showError('receive', 'Please enter a valid 4-digit code.');
  
  setLoading('get', true);
  try {
    const response = await fetch(`${API_URL}/get-item?code=${code}`);
    const data = await response.json();
    
    if (!data.success) throw new Error(data.error || 'Item not found or expired');
    
    receiveResult.style.display = 'block';
    
    if (data.itemType === 'text') {
      textResult.style.display = 'block';
      fileResult.style.display = 'none';
      receivedText.value = data.content;
    } else {
      fileResult.style.display = 'block';
      textResult.style.display = 'none';
      fileInfo.textContent = `File ready: ${data.fileName}`;
      downloadLink.href = data.fileUrl;
      downloadLink.setAttribute('download', data.fileName);
    }
  } catch (error) {
    showError('receive', error.message);
  } finally {
    setLoading('get', false);
  }
});

// --- 6. Helper Functions ---
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(receivedText.value);
  const originalText = copyBtn.textContent;
  copyBtn.textContent = 'Copied! ✓';
  copyBtn.style.background = "#059669"; 
  setTimeout(() => { 
    copyBtn.textContent = originalText;
    copyBtn.style.background = ""; 
  }, 2000);
});

function setLoading(type, isLoading) {
  const btn = type === 'generate' ? generateBtn : getBtn;
  const spinner = btn.querySelector('.spinner');
  const btnText = btn.querySelector('.btn-text');
  
  btn.disabled = isLoading;
  if(spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
  if(btnText) btnText.style.display = isLoading ? 'none' : 'inline-block';
}

function showError(tab, msg) {
  const el = tab === 'send' ? sendError : receiveError;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}