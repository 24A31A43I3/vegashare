/* ============================================================
   VegaShare — script.js
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Utils ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const MAX_SIZE = 200 * 1024 * 1024; // 200MB limit for batch total

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "—";
    if (sec < 60) return Math.ceil(sec) + "s";
    const m = Math.floor(sec / 60);
    return m + "m " + Math.round(sec % 60) + "s";
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

  /* ---------- Theme (Default Light + User Toggle) ---------- */
  const themeBtn = $("#themeToggle");
  const storedTheme = localStorage.getItem("vega-theme");

  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", String(mode === "dark"));
    }
  }

  const initialTheme = storedTheme || "light";
  applyTheme(initialTheme);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(current);
      localStorage.setItem("vega-theme", current);
    });
  }

  /* ---------- Navigation ---------- */
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

  /* Bottom nav active state tracking */
  const bottomLinks = $$(".bottom-nav a[href^='#']");
  const sections = ["home", "download", "upload", "faq", "about"].map((id) => document.getElementById(id));
  
  window.addEventListener("scroll", () => {
    const y = window.scrollY + window.innerHeight / 3;
    let active = sections[0];
    sections.forEach((s) => { if (s && s.offsetTop <= y) active = s; });
    bottomLinks.forEach((l) => l.classList.toggle("is-active", active && l.getAttribute("href") === "#" + active.id));
  }, { passive: true });

  /* ---------- Scroll reveal ---------- */
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

  /* ---------- Ripple effect ---------- */
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

  /* ---------- Features ---------- */
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
    ["lock", "Encrypted Sharing", "TLS in transit plus optional password protection."],
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

  /* ---------- FAQ accordion ---------- */
  const FAQS = [
    ["Do I need an account to use VegaShare?", "Never. Uploading files or sharing text is completely anonymous — the 4-digit code is the only thing needed."],
    ["Can I share plain text or code snippets?", "Yes! Use the 'Share Text / Clipboard' tab to quickly send text, links, WiFi passwords, or code snippets."],
    ["What is the maximum file size?", "You can upload multiple files up to 200 MB total per batch."],
    ["What happens when content expires?", "Files, text notes, and metadata are permanently erased from the server."],
    ["Are my items encrypted?", "All transfers use TLS encryption, and optional password protection ensures only keyholders can open items."]
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

  /* ---------- Sharing Mode Tabs (Files vs Text) ---------- */
  const tabFiles = $("#tabFiles");
  const tabText = $("#tabText");
  const paneDrop = $("#paneDrop");
  const paneText = $("#paneText");
  let activeMode = "files"; // "files" | "text"

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

  /* ---------- Text / Clipboard Sharing Logic ---------- */
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
        toast("Unable to read clipboard automatically. Press Ctrl+V / Cmd+V.");
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

  /* ---------- Multiple Files Upload Flow ---------- */
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const filePreview = $("#filePreview");
  const fileList = $("#fileList");
  const fileSummary = $("#fileSummary");
  const uploadHint = $("#uploadHint");
  const clearFilesBtn = $("#clearFiles");
  const panes = { drop: $("#paneDrop"), text: $("#paneText"), progress: $("#paneProgress"), success: $("#paneSuccess") };
  
  let currentFiles = []; 
  let timer = null;

  function showPane(name) {
    $("#paneDrop").hidden = true;
    $("#paneText").hidden = true;
    $("#paneProgress").hidden = true;
    $("#paneSuccess").hidden = true;
    
    if (name === "drop") {
      if (activeMode === "files") $("#paneDrop").hidden = false;
      else $("#paneText").hidden = false;
    } else {
      if (panes[name]) panes[name].hidden = false;
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
        setHint("Batch exceeds maximum total size of 200 MB.", true);
        break;
      }
      currentFiles.push(f);
      totalSize += f.size;
      setHint("");
    }

    renderFileList();
  }

  if (clearFilesBtn) {
    clearFilesBtn.addEventListener("click", () => {
      currentFiles = [];
      if (fileInput) fileInput.value = "";
      renderFileList();
      setHint("");
    });
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

  const pasteBtn = $("#pasteBtn");
  if (pasteBtn) {
    pasteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          const pasted = [];
          for (const item of items) {
            const type = item.types.find((t) => t !== "text/plain");
            if (type) {
              const blob = await item.getType(type);
              pasted.push(new File([blob], "clipboard." + type.split("/")[1], { type }));
            }
          }
          if (pasted.length) return addFiles(pasted);
        }
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          return addFiles([new File([text], "clipboard.txt", { type: "text/plain" })]);
        }
        setHint("Clipboard is empty.", true);
      } catch (err) {
        setHint("Clipboard access blocked — try pasting manually.", true);
      }
    });
  }

  /* Start Share Button Execution */
  const startBtn = $("#startUpload");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (activeMode === "files") {
        if (!currentFiles.length) {
          setHint("Please select or drop at least one file.", true);
          return;
        }
      } else {
        if (!textInput || !textInput.value.trim()) {
          setHint("Please enter or paste text to share.", true);
          return;
        }
      }

      setHint("");
      const progName = $("#progName");
      const progSize = $("#progSize");

      if (activeMode === "files") {
        const totalBatchSize = currentFiles.reduce((acc, f) => acc + f.size, 0);
        if (progName) progName.textContent = currentFiles.length === 1 ? currentFiles[0].name : `${currentFiles.length} Files Batch`;
        if (progSize) progSize.textContent = formatBytes(totalBatchSize);
      } else {
        if (progName) progName.textContent = "Text Note / Snippet";
        if (progSize) progSize.textContent = `${textInput.value.length} chars`;
      }

      showPane("progress");

      let loaded = 0;
      const targetSize = activeMode === "files" ? currentFiles.reduce((acc, f) => acc + f.size, 0) : 10000;
      const bar = $("#progBar");
      
      timer = setInterval(() => {
        const speed = (900 + Math.random() * 2600) * 1024;
        loaded = Math.min(targetSize, loaded + speed * 0.2);
        const pct = Math.round((loaded / targetSize) * 100);
        if (bar) bar.style.width = pct + "%";
        
        const progPct = $("#progPct");
        const progSpeed = $("#progSpeed");
        const progEta = $("#progEta");
        
        if (progPct) progPct.textContent = pct + "%";
        if (progSpeed) progSpeed.textContent = formatBytes(speed) + "/s";
        if (progEta) progEta.textContent = formatTime((targetSize - loaded) / speed);
        
        if (pct >= 100) { 
          clearInterval(timer); 
          timer = null; 
          finishUpload(); 
        }
      }, 150);
    });
  }

  const cancelBtn = $("#cancelUpload");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (timer) clearInterval(timer);
      timer = null;
      const bar = $("#progBar");
      if (bar) bar.style.width = "0%";
      showPane("drop");
      toast("Sharing cancelled");
    });
  }

  function finishUpload() {
    const expiryEl = $("#expiry");
    const maxDlEl = $("#maxDownloads");
    const onceToggle = $("#onceToggle");
    const qrToggle = $("#qrToggle");

    const expiry = expiryEl ? expiryEl.value : "15";
    const max = maxDlEl ? maxDlEl.value : "5";
    const once = onceToggle ? onceToggle.classList.contains("is-on") : false;
    const code = String(Math.floor(1000 + Math.random() * 9000));

    const codeDigits = $("#codeDigits");
    const shareLink = $("#shareLink");
    const expiresIn = $("#expiresIn");
    const remDl = $("#remDl");
    const qrWrap = $("#qrWrap");

    if (codeDigits) codeDigits.innerHTML = code.split("").map((d) => "<b>" + d + "</b>").join("");
    if (shareLink) shareLink.value = window.location.origin + "/d/" + code;
    if (expiresIn) expiresIn.textContent = EXPIRY_LABEL[expiry] || expiry + " Minutes";
    if (remDl) remDl.textContent = once ? "1 / 1" : max + " / " + max;
    if (qrWrap && qrToggle) qrWrap.hidden = !qrToggle.classList.contains("is-on");
    
    showPane("success");
  }

  const newUploadBtn = $("#newUpload");
  if (newUploadBtn) {
    newUploadBtn.addEventListener("click", () => {
      currentFiles = [];
      if (fileInput) fileInput.value = "";
      if (textInput) textInput.value = "";
      if (textCharCount) textCharCount.textContent = "0 characters";
      renderFileList();
      const bar = $("#progBar");
      if (bar) bar.style.width = "0%";
      setHint("");
      showPane("drop");
    });
  }

  /* Copy Button Handlers */
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
        toast("Copy failed — select manually.");
      }
    });
  });

  /* ---------- Retrieval / Download Flow ---------- */
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
    codeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = codeInputs.map((i) => i.value).join("");
      const hint = $("#dlHint");
      const prevCard = $("#previewCard");
      const fileRetrieved = $("#retrievedFileContent");
      const textRetrieved = $("#retrievedTextContent");
      const retrievedTextVal = $("#retrievedTextVal");

      if (code.length < 4) {
        if (hint) {
          hint.textContent = "Enter all four digits of your code.";
          hint.classList.add("is-error");
        }
        if (prevCard) prevCard.hidden = true;
        return;
      }

      if (hint) {
        hint.textContent = "Content found for code " + code + ".";
        hint.classList.remove("is-error");
      }
      if (prevCard) prevCard.hidden = false;

      // Sample lookup logic switch based on code
      if (code.endsWith("0")) {
        // Show Text result
        if (fileRetrieved) fileRetrieved.hidden = true;
        if (textRetrieved) textRetrieved.hidden = false;
        if (retrievedTextVal) retrievedTextVal.value = "Sample text retrieved for code " + code + ":\nhttps://vegashare.app\nWiFi Password: SecurePass123!";
      } else {
        // Show File result
        if (fileRetrieved) fileRetrieved.hidden = false;
        if (textRetrieved) textRetrieved.hidden = true;
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

  /* ---------- Footer Year ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();