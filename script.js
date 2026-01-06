const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : '/api';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const textInput = document.getElementById('text-input');
const generateBtn = document.getElementById('generate-btn');
const sendResult = document.getElementById('send-result');
const sendError = document.getElementById('send-error');
const generatedCode = document.getElementById('generated-code');
const codeInput = document.getElementById('code-input');
const getBtn = document.getElementById('get-btn');
const receiveResult = document.getElementById('receive-result');
const receiveError = document.getElementById('receive-error');
const textResult = document.getElementById('text-result');
const fileResult = document.getElementById('file-result');
const receivedText = document.getElementById('received-text');
const copyBtn = document.getElementById('copy-btn');
const fileInfo = document.getElementById('file-info');

// Tab Switching Logic
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.tab;
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(`${targetTab}-tab`).classList.add('active');
    clearMessages();
  });
});

// File Handling
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && file.size > MAX_FILE_SIZE) {
    showError('send', `File too large (Max 15MB).`);
    fileInput.value = '';
    fileLabel.textContent = 'Choose a file';
  } else if (file) {
    fileLabel.textContent = file.name;
    textInput.value = '';
    sendError.style.display = 'none';
  }
});

// Upload
generateBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  const file = fileInput.files[0];
  if (!text && !file) return showError('send', 'Enter text or a file.');
  
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
    if (!data.success) throw new Error(data.error);
    generatedCode.textContent = data.code;
    sendResult.style.display = 'block';
  } catch (error) {
    showError('send', error.message);
  } finally {
    setLoading('generate', false);
  }
});

// Retrieve
getBtn.addEventListener('click', async () => {
  const code = codeInput.value.trim();
  if (!code || code.length !== 4) return showError('receive', 'Enter 4-digit code.');
  
  setLoading('get', true);
  try {
    const response = await fetch(`${API_URL}/get-item?code=${code}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    
    receiveResult.style.display = 'block';
    if (data.itemType === 'text') {
      textResult.style.display = 'block';
      receivedText.value = data.content;
    } else {
      fileResult.style.display = 'block';
      fileInfo.textContent = `File: ${data.fileName}`;
      const link = document.createElement('a');
      link.href = data.fileUrl;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    showError('receive', error.message);
  } finally {
    setLoading('get', false);
  }
});

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(receivedText.value);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
});

function setLoading(type, loading) {
  const btn = type === 'generate' ? generateBtn : getBtn;
  btn.disabled = loading;
  btn.querySelector('.spinner').style.display = loading ? 'inline-block' : 'none';
  btn.querySelector('.btn-text').style.display = loading ? 'none' : 'inline-block';
}

function showError(tab, msg) {
  const el = tab === 'send' ? sendError : receiveError;
  el.textContent = msg;
  el.style.display = 'block';
}

function clearMessages() {
  [sendResult, sendError, receiveResult, receiveError, textResult, fileResult].forEach(e => e.style.display = 'none');
}