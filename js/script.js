/* ============================================================
   VegaShare — js/script.js (E2EE + Node.js / Express Backend)
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Utils ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit matching backend configuration

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
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

  /* User-friendly helper to safely parse API responses */
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
  const sections = ["home", "download", "upload", "faq", "about"].map((id) => document.getElementById(id));
  
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

  /* ---------- Features & FAQ Components ---------- */
  const ICONS = {
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    mask: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    gauge: '<path d="M12 4v0a8 8 0 1 0 8 8"/><path d="m12 12 5-4"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    cloud: '<path d="M6 18h11a4 4 0 0 0 .3-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 0 7Z"/>',
    devices: '<rect x="3" y="4" width="13" height="11" rx="2"/><rect x="16" y="9" width="5" height="11" rx="1.5"/>'
  };

  const FEATURES = [
    ["bolt", "Fast Transfer", "Share multiple files or clipboard text notes in seconds."],
    ["mask", "Anonymous", "No accounts, no emails, no tracking. Just a 4-digit retrieval code."],
    ["clock", "Temporary Storage", "Pick an expiry from 15 minutes to 24 hours."],
    ["lock", "Encrypted Sharing", "Client-side AES-GCM encryption before payload upload."],
    ["gauge", "Access Limits", "Cap downloads/views from 5 to 50, or make it one-time only."],
    ["trash", "Auto Delete", "Files and text are purged permanently the moment they expire."],
    ["cloud", "Cloud Ready", "Seamlessly integrates into any Express + MongoDB stack."],
    ["devices", "Cross Platform", "Mobile-first, optimized for desktop, tablet, and mobile."]
  ];

  const featuresContainer = $("#features");
  if (featuresContainer) {
    featuresContainer.innerHTML = FEATURES.map(([ico, title, text]) => `
      <article class="feature reveal">
        <span class="feature__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[ico]}</svg></span>
        <h3>${title}</h3><p>${text}</p>
      </article>`).join("");
    $$("#features .reveal").forEach(observe);
  }

  const FAQS = [
    ["Do I need an account to use VegaShare?", "Never. Uploading files or sharing text is completely anonymous — the 4-digit code is the only thing needed."],
    ["Can I share plain text or code snippets?", "Yes! Use the 'Share Text / Clipboard' tab to send encrypted text notes."],
    ["What is the maximum file size?", "You can upload files up to 15 MB total per batch."],
    ["What happens when content expires?", "Files, text notes, and database records are permanently purged."],
    ["Are my items encrypted?", "Yes! Data is encrypted in your browser using AES-256-GCM before transmission."]
  ];

  const faqContainer = $("#faqList");
  if (faqContainer) {
    faqContainer.innerHTML = FAQS.map(([q, a], i) => `
      <div class="faq__item reveal">
        <button class="faq__q" type="button" aria-expanded="false" aria-controls="faq-a-${i}">
          <span>${q}</span><span class="chev" aria-hidden="true"></span>
        </button>
        <div class="faq__a" id="faq-a-${i}" role="region"><p>${a}</p></div>
      </div>`).join("");
    $$("#faqList .reveal").forEach(observe);

    $$(".faq__q").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.parentElement;
        const panel = item.querySelector(".faq__a");
        const open = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", String(open));
        panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
      });
    });
  }

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
        const shareLink = $("#shareLink");
        const expiresIn = $("#expiresIn");
        const remDl = $("#remDl");

        if (codeDigits) codeDigits.innerHTML = data.code.split("").map((d) => `<b>${d}</b>`).join("");
        if (shareLink) shareLink.value = data.shareLink;
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
      const shareLink = $("#shareLink");
      const value = btn.dataset.copy === "code"
        ? (codeDigits ? codeDigits.textContent.trim() : "")
        : (shareLink ? shareLink.value : "");
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

        // Decrypt Encrypted Text Payload
        if (data.type === "text") {
          $("#retrievedFileContent").hidden = true;
          $("#retrievedTextContent").hidden = false;

          const hexBuffer = new Uint8Array(data.textContent.match(/.{1,2}/g).map(byte => parseInt(byte, 16))).buffer;
          const decryptedBuffer = await decryptData(hexBuffer, code, data.cryptoSalt, data.cryptoIv);
          
          $("#retrievedTextVal").value = new TextDecoder().decode(decryptedBuffer);
        } 
        // Decrypt Encrypted File Payload
        else {
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

  /* ---------- Dynamic Footer Year ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();