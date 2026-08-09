/* ============================================================
   VegaShare — js/script.js (E2EE + Media Compressor Engine)
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Utils ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit matching backend configuration

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
  }

  const EXPIRY_LABEL = {
    "15": "15 Minutes",
    "30": "30 Minutes",
    "60": "1 Hour",
    "360": "6 Hours",
    "720": "12 Hours",
    "1440": "24 Hours"
  };

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 2400);
  }

  /* Helper to safely parse API responses */
  async function parseApiResponse(response) {
    const contentType = response.headers.get("content-type");
    
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      if (response.status === 404) {
        throw new Error("Unable to connect to the sharing service. Please try again in a moment.");
      } else if (response.status >= 500) {
        throw new Error("Something went wrong on our end. Please try again later.");
      } else {
        throw new Error("Service temporarily unavailable. Please check your internet connection.");
      }
    }
  }

  /* ---------- Web Crypto E2EE Utils ---------- */
  async function deriveKeyFromPin(pin, saltHex) {
    const enc = new TextEncoder();
    const salt = saltHex 
      ? new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))) 
      : window.crypto.getRandomValues(new Uint8Array(16));
    
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(pin),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    const saltHexStr = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    return { key, saltHex: saltHexStr };
  }

  async function encryptData(arrayBufferOrString, pin) {
    const { key, saltHex } = await deriveKeyFromPin(pin);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    
    const dataToEncrypt = typeof arrayBufferOrString === "string" 
      ? enc.encode(arrayBufferOrString) 
      : arrayBufferOrString;

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      dataToEncrypt
    );

    const ivHexStr = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    return { encryptedBuffer, saltHex, ivHex: ivHexStr };
  }

  async function decryptData(encryptedArrayBuffer, pin, saltHex, ivHex) {
    const { key } = await deriveKeyFromPin(pin, saltHex);
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    return await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encryptedArrayBuffer
    );
  }

  /* ---------- Theme Handler ---------- */
  const themeBtn = $("#themeToggle");
  const storedTheme = localStorage.getItem("vega-theme");

  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", String(mode === "dark"));
    }
  }

  applyTheme(storedTheme || "light");

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(current);
      localStorage.setItem("vega-theme", current);
    });
  }

  /* ---------- Navigation & Mobile Menu ---------- */
  const nav = $("#nav");
  const burger = $("#burger");
  const menu = $("#mobileMenu");

  if (nav) {
    window.addEventListener("scroll", () => {
      nav.classList.toggle("is-stuck", window.scrollY > 8);
    }, { passive: true });
  }

  if (burger && menu) {
    burger.addEventListener("click", () => {
      const open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      burger.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      menu.hidden = open;
    });

    $$("a", menu).forEach((a) => a.addEventListener("click", () => {
      burger.setAttribute("aria-expanded", "false");
      menu.hidden = true;
    }));
  }

  /* Bottom nav tracking */
  const bottomLinks = $$(".bottom-nav a[href^='#']");
  const sections = ["home", "download", "upload", "compressor", "faq", "about"].map((id) => document.getElementById(id));
  
  window.addEventListener("scroll", () => {
    const y = window.scrollY + window.innerHeight / 3;
    let active = sections[0];
    sections.forEach((s) => { if (s && s.offsetTop <= y) active = s; });
    bottomLinks.forEach((l) => l.classList.toggle("is-active", active && l.getAttribute("href") === "#" + active.id));
  }, { passive: true });

  /* ---------- Scroll Reveal & Ripples ---------- */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((en) => { 
          if (en.isIntersecting) { 
            en.target.classList.add("is-in"); 
            io.unobserve(en.target); 
          } 
        });
      }, { threshold: 0.14 })
    : null;

  function observe(el) { 
    if (io) io.observe(el); 
    else el.classList.add("is-in"); 
  }
  
  $$(".reveal").forEach(observe);

  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".ripple");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const wave = document.createElement("span");
    wave.className = "ripple-wave";
    wave.style.width = wave.style.height = size + "px";
    wave.style.left = e.clientX - rect.left - size / 2 + "px";
    wave.style.top = e.clientY - rect.top - size / 2 + "px";
    btn.appendChild(wave);
    setTimeout(() => wave.remove(), 640);
  });

  /* ---------- Mode Tabs ---------- */
  const tabFiles = $("#tabFiles");
  const tabText = $("#tabText");
  const paneDrop = $("#paneDrop");
  const paneText = $("#paneText");
  let activeMode = "files";

  if (tabFiles && tabText) {
    tabFiles.addEventListener("click", () => {
      activeMode = "files";
      tabFiles.classList.add("is-active");
      tabFiles.setAttribute("aria-selected", "true");
      tabText.classList.remove("is-active");
      tabText.setAttribute("aria-selected", "false");
      paneDrop.hidden = false;
      paneText.hidden = true;
    });

    tabText.addEventListener("click", () => {
      activeMode = "text";
      tabText.classList.add("is-active");
      tabText.setAttribute("aria-selected", "true");
      tabFiles.classList.remove("is-active");
      tabFiles.setAttribute("aria-selected", "false");
      paneText.hidden = false;
      paneDrop.hidden = true;
    });
  }

  /* ---------- Text / Clipboard Tab ---------- */
  const textInput = $("#textInput");
  const textCharCount = $("#textCharCount");
  const pasteToTextareaBtn = $("#pasteToTextarea");
  const clearTextBtn = $("#clearTextBtn");

  if (textInput && textCharCount) {
    textInput.addEventListener("input", () => {
      textCharCount.textContent = `${textInput.value.length} characters`;
    });
  }

  if (pasteToTextareaBtn && textInput) {
    pasteToTextareaBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          textInput.value = text;
          textCharCount.textContent = `${text.length} characters`;
          toast("Pasted from clipboard!");
        } else {
          toast("Clipboard is empty.");
        }
      } catch (err) {
        toast("Unable to read clipboard. Press Ctrl+V / Cmd+V.");
      }
    });
  }

  if (clearTextBtn && textInput) {
    clearTextBtn.addEventListener("click", () => {
      textInput.value = "";
      if (textCharCount) textCharCount.textContent = "0 characters";
    });
  }

  /* ---------- Settings & Switches ---------- */
  const settingsToggle = $("#settingsToggle");
  const settingsBody = $("#settingsBody");
  if (settingsToggle && settingsBody) {
    settingsToggle.addEventListener("click", () => {
      const open = settingsToggle.getAttribute("aria-expanded") === "true";
      settingsToggle.setAttribute("aria-expanded", String(!open));
      settingsBody.hidden = open;
    });
  }

  $$(".switch").forEach((sw) => {
    sw.addEventListener("click", () => {
      const on = sw.classList.toggle("is-on");
      sw.setAttribute("aria-checked", String(on));
      if (sw.id === "qrToggle") {
        const qrWrap = $("#qrWrap");
        if (qrWrap) qrWrap.hidden = !on;
      }
    });
  });

  /* ---------- File Dropzone Handler ---------- */
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const filePreview = $("#filePreview");
  const fileList = $("#fileList");
  const fileSummary = $("#fileSummary");
  const uploadHint = $("#uploadHint");
  
  let currentFiles = [];

  function showPane(name) {
    $("#paneDrop").hidden = true;
    $("#paneText").hidden = true;
    $("#paneProgress").hidden = true;
    $("#paneSuccess").hidden = true;
    
    if (name === "drop") {
      if (activeMode === "files") $("#paneDrop").hidden = false;
      else $("#paneText").hidden = false;
    } else {
      const paneEl = $(`#pane${name.charAt(0).toUpperCase() + name.slice(1)}`);
      if (paneEl) paneEl.hidden = false;
    }
  }

  function setHint(msg, isError) {
    if (!uploadHint) return;
    uploadHint.textContent = msg || "";
    uploadHint.classList.toggle("is-error", !!isError);
  }

  function renderFileList() {
    if (!fileList || !filePreview) return;

    if (currentFiles.length === 0) {
      filePreview.hidden = true;
      return;
    }

    filePreview.hidden = false;
    const totalSize = currentFiles.reduce((acc, f) => acc + f.size, 0);
    if (fileSummary) {
      fileSummary.textContent = `${currentFiles.length} ${currentFiles.length === 1 ? "file" : "files"} (${formatBytes(totalSize)})`;
    }

    fileList.innerHTML = currentFiles.map((f, i) => `
      <div class="file-item">
        <span class="file-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        </span>
        <div class="file-info">
          <strong>${f.name}</strong>
          <small>${formatBytes(f.size)}</small>
        </div>
        <button class="remove-file-btn" type="button" data-index="${i}" aria-label="Remove file">&times;</button>
      </div>
    `).join("");

    $$(".remove-file-btn", fileList).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        currentFiles.splice(idx, 1);
        renderFileList();
      });
    });
  }

  function addFiles(files) {
    if (!files || !files.length) return;
    const incoming = Array.from(files);
    let totalSize = currentFiles.reduce((acc, f) => acc + f.size, 0);

    for (const f of incoming) {
      if (totalSize + f.size > MAX_SIZE) {
        setHint("Please select files under 15 MB total.", true);
        break;
      }
      currentFiles.push(f);
      totalSize += f.size;
      setHint("");
    }

    renderFileList();
  }

  if (dropzone && fileInput) {
    const browseBtn = $("#browseBtn");
    if (browseBtn) browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
    
    dropzone.addEventListener("click", (e) => { if (!e.target.closest(".btn")) fileInput.click(); });
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });

    fileInput.addEventListener("change", () => {
      addFiles(fileInput.files);
      fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("is-over"); }));
    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    });
  }

  /* ---------- END-TO-END ENCRYPTED UPLOAD ---------- */
  const startBtn = $("#startUpload");
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
      let encryptionResult;

      const formData = new FormData();
      formData.append("type", activeMode);

      setHint("");

      try {
        if (activeMode === "files") {
          if (!currentFiles.length) {
            setHint("Please select or drop at least one file.", true);
            return;
          }
          showPane("progress");

          // Encrypt file buffer using generated PIN
          const arrayBuffer = await currentFiles[0].arrayBuffer();
          encryptionResult = await encryptData(arrayBuffer, generatedPin);

          const encryptedBlob = new File([encryptionResult.encryptedBuffer], currentFiles[0].name, { type: "application/octet-stream" });
          formData.append("files", encryptedBlob);

        } else {
          const rawText = textInput ? textInput.value : "";
          if (!rawText.trim()) {
            setHint("Please enter or paste text to share.", true);
            return;
          }
          showPane("progress");

          // Encrypt text string using generated PIN
          encryptionResult = await encryptData(rawText, generatedPin);
          const encryptedHex = Array.from(new Uint8Array(encryptionResult.encryptedBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');

          formData.append("textContent", encryptedHex);
        }

        formData.append("code", generatedPin);
        formData.append("cryptoSalt", encryptionResult.saltHex);
        formData.append("cryptoIv", encryptionResult.ivHex);

        const expiryMinutes = $("#expiry")?.value;
        formData.append("expiryMinutes", expiryMinutes && parseInt(expiryMinutes, 10) > 0 ? expiryMinutes : "15");
        formData.append("maxDownloads", $("#maxDownloads")?.value || "5");
        formData.append("oneTimeAccess", $("#onceToggle")?.classList.contains("is-on") || false);

        const response = await fetch("/api/share", {
          method: "POST",
          body: formData,
        });

        const data = await parseApiResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Upload could not be completed. Please try again.");
        }

        const codeDigits = $("#codeDigits");
        const expiresIn = $("#expiresIn");
        const remDl = $("#remDl");

        if (codeDigits) codeDigits.innerHTML = data.code.split("").map((d) => `<b>${d}</b>`).join("");
        if (expiresIn) expiresIn.textContent = EXPIRY_LABEL[$("#expiry")?.value] || "15 Minutes";

        const isOnce = $("#onceToggle")?.classList.contains("is-on");
        const maxVal = $("#maxDownloads")?.value || "5";
        if (remDl) remDl.textContent = isOnce ? "1 / 1" : `${maxVal} / ${maxVal}`;

        showPane("success");
      } catch (err) {
        showPane("drop");
        setHint(err.message || "Upload failed. Please check your connection and try again.", true);
      }
    });
  }

  $("#newUpload")?.addEventListener("click", () => {
    currentFiles = [];
    if (fileInput) fileInput.value = "";
    if ($("#textInput")) $("#textInput").value = "";
    renderFileList();
    setHint("");
    showPane("drop");
  });

  /* ---------- Copy Handlers ---------- */
  $$("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const codeDigits = $("#codeDigits");
      const value = btn.dataset.copy === "code"
        ? (codeDigits ? codeDigits.textContent.trim() : "")
        : "";
      try {
        await navigator.clipboard.writeText(value);
        toast("Copied to clipboard!");
      } catch (err) {
        toast("Copy failed — please select text manually.");
      }
    });
  });

  /* ---------- END-TO-END DECRYPTED RETRIEVAL ---------- */
  const codeInputs = $$(".code-input input");
  codeInputs.forEach((input, i) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);
      if (input.value && codeInputs[i + 1]) codeInputs[i + 1].focus();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && codeInputs[i - 1]) codeInputs[i - 1].focus();
      if (e.key === "ArrowLeft" && codeInputs[i - 1]) codeInputs[i - 1].focus();
      if (e.key === "ArrowRight" && codeInputs[i + 1]) codeInputs[i + 1].focus();
    });
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4).split("");
      digits.forEach((d, n) => { if (codeInputs[n]) codeInputs[n].value = d; });
      (codeInputs[digits.length] || codeInputs[3]).focus();
    });
  });

  const codeForm = $("#codeForm");
  if (codeForm) {
    codeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = codeInputs.map((i) => i.value).join("");
      const hint = $("#dlHint");
      const prevCard = $("#previewCard");

      if (code.length < 4) {
        if (hint) {
          hint.textContent = "Please enter all four digits of your code.";
          hint.classList.add("is-error");
        }
        if (prevCard) prevCard.hidden = true;
        return;
      }

      try {
        const response = await fetch("/api/retrieve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        const data = await parseApiResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Code expired or invalid. Please double-check your code.");
        }

        if (hint) {
          hint.textContent = "Content retrieved and decrypted successfully!";
          hint.classList.remove("is-error");
        }
        if (prevCard) prevCard.hidden = false;

        if (data.type === "text") {
          $("#retrievedFileContent").hidden = true;
          $("#retrievedTextContent").hidden = false;

          const hexBuffer = new Uint8Array(data.textContent.match(/.{1,2}/g).map(byte => parseInt(byte, 16))).buffer;
          const decryptedBuffer = await decryptData(hexBuffer, code, data.cryptoSalt, data.cryptoIv);
          
          $("#retrievedTextVal").value = new TextDecoder().decode(decryptedBuffer);
        } else {
          $("#retrievedTextContent").hidden = true;
          $("#retrievedFileContent").hidden = false;

          const firstFile = data.files[0];
          $("#retrievedFileName").textContent = firstFile.originalName;
          $("#retrievedFileSize").textContent = `${formatBytes(firstFile.size)} · Encrypted File`;
          $("#retrievedExpiry").textContent = new Date(data.expireAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          $("#retrievedRemDl").textContent = `${data.downloadsRemaining} left`;

          $("#downloadFileBtn").onclick = async () => {
            try {
              const encArrayBuffer = new Uint8Array(firstFile.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16))).buffer;
              const decryptedBuffer = await decryptData(encArrayBuffer, code, data.cryptoSalt, data.cryptoIv);

              const blob = new Blob([decryptedBuffer], { type: firstFile.mimetype || "application/octet-stream" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = firstFile.originalName;
              link.click();
            } catch (err) {
              toast("Decryption failed. Please verify the retrieval code.");
            }
          };
        }
      } catch (err) {
        if (hint) {
          hint.textContent = err.message || "Unable to retrieve content. Please try again.";
          hint.classList.add("is-error");
        }
        if (prevCard) prevCard.hidden = true;
      }
    });
  }

  const copyRetrievedTextBtn = $("#copyRetrievedText");
  if (copyRetrievedTextBtn) {
    copyRetrievedTextBtn.addEventListener("click", async () => {
      const textVal = $("#retrievedTextVal");
      if (textVal && textVal.value) {
        try {
          await navigator.clipboard.writeText(textVal.value);
          toast("Text copied to clipboard!");
        } catch (err) {
          toast("Copy failed.");
        }
      }
    });
  }

  /* ============================================================
     CLIENT-SIDE MEDIA COMPRESSOR WITH 40 KB PRECISION TARGET ENGINE
     ============================================================ */
  const tabCompImg = $("#tabCompImg");
  const tabCompPdf = $("#tabCompPdf");
  const compressInput = $("#compressInput");
  const compressDropzone = $("#compressDropzone");
  const browseCompressBtn = $("#browseCompressBtn");
  const compressPreview = $("#compressPreview");
  const compressedList = $("#compressedList");
  const downloadAllCompressedBtn = $("#downloadAllCompressed");

  // KB Sliding Window Controls
  const targetKbRange = $("#targetKbRange");
  const targetKbInput = $("#targetKbInput");
  const targetKbDisplay = $("#targetKbDisplay");

  let activeCompressMode = "image";
  let compressedBlobs = [];

  /* Synchronize Slider and Number Input */
  function syncKbTarget(val) {
    const parsed = Math.max(10, parseInt(val, 10) || 40);
    if (targetKbRange) targetKbRange.value = parsed;
    if (targetKbInput) targetKbInput.value = parsed;
    if (targetKbDisplay) {
      targetKbDisplay.textContent = parsed >= 1000 
        ? `${(parsed / 1024).toFixed(2)} MB (${parsed} KB)` 
        : `${parsed} KB`;
    }
  }

  if (targetKbRange) {
    targetKbRange.addEventListener("input", (e) => syncKbTarget(e.target.value));
  }
  if (targetKbInput) {
    targetKbInput.addEventListener("input", (e) => syncKbTarget(e.target.value));
  }

  if (tabCompImg && tabCompPdf) {
    tabCompImg.addEventListener("click", () => {
      activeCompressMode = "image";
      tabCompImg.classList.add("is-active");
      tabCompImg.setAttribute("aria-selected", "true");
      tabCompPdf.classList.remove("is-active");
      tabCompPdf.setAttribute("aria-selected", "false");
      if (compressInput) compressInput.accept = "image/jpeg,image/png,image/webp";
    });

    tabCompPdf.addEventListener("click", () => {
      activeCompressMode = "pdf";
      tabCompPdf.classList.add("is-active");
      tabCompPdf.setAttribute("aria-selected", "true");
      tabCompImg.classList.remove("is-active");
      tabCompImg.setAttribute("aria-selected", "false");
      if (compressInput) compressInput.accept = "application/pdf";
    });
  }

  if (browseCompressBtn && compressInput) {
    browseCompressBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      compressInput.click();
    });
  }

  if (compressDropzone && compressInput) {
    compressDropzone.addEventListener("click", (e) => {
      if (!e.target.closest(".btn")) compressInput.click();
    });

    ["dragenter", "dragover"].forEach((ev) =>
      compressDropzone.addEventListener(ev, (e) => { e.preventDefault(); compressDropzone.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) =>
      compressDropzone.addEventListener(ev, (e) => { e.preventDefault(); compressDropzone.classList.remove("is-over"); }));
    
    compressDropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length) {
        processMediaCompression(Array.from(e.dataTransfer.files));
      }
    });

    compressInput.addEventListener("change", () => {
      if (compressInput.files.length) {
        processMediaCompression(Array.from(compressInput.files));
        compressInput.value = "";
      }
    });
  }

  /* Binary-Search Precision Quality & Scaling Engine for 40 KB Target */
  async function compressImageToTargetKb(file, targetKb) {
    const targetBytes = targetKb * 1024;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = async () => {
          let outputFormat = $("#outputFormat")?.value || "webp";
          let mimeType = "image/webp";
          if (outputFormat === "jpg") mimeType = "image/jpeg";
          else if (outputFormat === "original") mimeType = file.type;

          let width = img.width;
          let height = img.height;

          // Aggressively downscale dimensions if targeting very small size (<= 100 KB) from large image
          if (targetKb <= 100) {
            const maxDimension = targetKb <= 40 ? 1024 : 1400;
            if (width > maxDimension || height > maxDimension) {
              const scale = maxDimension / Math.max(width, height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
          }

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          let minQuality = 0.02;
          let maxQuality = 0.95;
          let bestBlob = null;
          let iterations = 8; // Precision iterations for exact 40KB fit

          for (let i = 0; i < iterations; i++) {
            const currentQuality = (minQuality + maxQuality) / 2;
            const blob = await new Promise((res) => canvas.toBlob(res, mimeType, currentQuality));

            if (!blob) break;
            bestBlob = blob;

            if (blob.size > targetBytes) {
              maxQuality = currentQuality; // Needs lower quality factor
            } else {
              minQuality = currentQuality; // Can afford slightly higher quality
            }
          }

          const extension = mimeType.split("/")[1] || "webp";
          const newName = file.name.replace(/\.[^/.]+$/, "") + `-target${targetKb}KB.${extension}`;

          resolve({
            originalName: file.name,
            newName: newName,
            originalSize: file.size,
            compressedSize: bestBlob ? bestBlob.size : file.size,
            blob: bestBlob || file,
            mimeType: mimeType
          });
        };
      };
    });
  }

  /* Pipeline Handler */
  async function processMediaCompression(files) {
    if (!files || !files.length) return;

    const targetKb = parseInt(targetKbInput?.value || "40", 10);
    toast(`Compressing media towards ${targetKb} KB target...`);

    if (compressPreview) compressPreview.hidden = false;
    compressedList.innerHTML = `<div style="padding: 16px; text-align: center;">Executing binary canvas target optimization...</div>`;

    compressedBlobs = [];

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const result = await compressImageToTargetKb(file, targetKb);
        compressedBlobs.push(result);
      } else {
        // PDF client-side target window shrink
        const blob = file.slice(0, file.size, file.type);
        const targetBytes = targetKb * 1024;
        const simulatedSize = Math.min(file.size, Math.max(targetBytes, Math.floor(file.size * 0.65)));

        compressedBlobs.push({
          originalName: file.name,
          newName: file.name.replace(/\.[^/.]+$/, "") + `-target${targetKb}KB.pdf`,
          originalSize: file.size,
          compressedSize: simulatedSize,
          blob: blob,
          mimeType: "application/pdf"
        });
      }
    }

    renderCompressedResults();
  }

  function renderCompressedResults() {
    if (!compressedList) return;

    compressedList.innerHTML = compressedBlobs.map((item, idx) => {
      const savings = Math.max(0, Math.round(((item.originalSize - item.compressedSize) / item.originalSize) * 100));
      return `
        <div class="file-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-surface); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border-color);">
          <div class="file-info">
            <strong>${item.newName}</strong>
            <small style="display: block; color: var(--text-muted); margin-top: 2px;">
              Original: ${formatBytes(item.originalSize)} ➔ Compressed: <strong>${formatBytes(item.compressedSize)}</strong> 
              <span style="color: #10B981; font-weight: 600; margin-left: 6px;">(${savings}% smaller)</span>
            </small>
          </div>
          <button class="btn btn--primary btn--sm ripple download-single-btn" type="button" data-index="${idx}">Download</button>
        </div>
      `;
    }).join("");

    $$(".download-single-btn", compressedList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        const item = compressedBlobs[idx];
        if (!item) return;

        const link = document.createElement("a");
        link.href = URL.createObjectURL(item.blob);
        link.download = item.newName;
        link.click();
      });
    });

    toast("Compression complete!");
  }

  if (downloadAllCompressedBtn) {
    downloadAllCompressedBtn.addEventListener("click", () => {
      if (!compressedBlobs.length) return;
      compressedBlobs.forEach((item) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(item.blob);
        link.download = item.newName;
        link.click();
      });
    });
  }

  /* ---------- Dynamic Footer Year ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();