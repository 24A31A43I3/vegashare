/* ============================================================
   VegaShare — contact.js (Dedicated Security & Form Handler)
   Handles input validation, XSS sanitization, rate-limiting, 
   and secure fetch dispatch to Google Apps Script.
   ============================================================ */
(function () {
  "use strict";

  // ⚠️ Ensure this is the FULL URL starting with https://script.google.com
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxtcpsygN4o70ALVtAD0Azd6y-PZFv-phvL_SGn_z9k76W1Xj2J2Jj8e0Ep15qa2-e5eQ/exec";

  // Security Configuration
  const CONFIG = {
    COOLDOWN_MS: 30000, // 30-second cooldown between form submissions
    MAX_NAME_LEN: 100,
    MAX_SUBJ_LEN: 150,
    MAX_MSG_LEN: 2000,
  };

  const form = document.getElementById("contactForm");
  const submitBtn = document.getElementById("submitBtn");
  const hint = document.getElementById("contactHint");

  if (!form) return;

  /* ---------- Security & Utility Helpers ---------- */

  // Sanitizes text inputs to prevent Cross-Site Scripting (XSS) attacks
  function sanitizeInput(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
      .trim();
  }

  // Strict Email Regex Validation
  function isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  // Phone Number Format Validation (digits, spaces, +, -, parentheses)
  function isValidPhone(phone) {
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,15}$/;
    return phoneRegex.test(phone);
  }

  function setHint(msg, isError) {
    if (!hint) return;
    hint.textContent = msg || "";
    hint.classList.toggle("is-error", !!isError);
  }

  // Rate Limiter / Anti-Spam Cooldown check via localStorage
  function checkCooldown() {
    const lastSubmit = localStorage.getItem("vegashare_contact_last_submit");
    if (lastSubmit) {
      const elapsed = Date.now() - parseInt(lastSubmit, 10);
      if (elapsed < CONFIG.COOLDOWN_MS) {
        const remaining = Math.ceil((CONFIG.COOLDOWN_MS - elapsed) / 1000);
        return remaining;
      }
    }
    return 0;
  }

  /* ---------- Form Submission Handler ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. Verify Deployment Endpoint Configuration
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT") || !APPS_SCRIPT_URL.startsWith("https://")) {
      setHint("Configuration error: Please set a valid Google Apps Script Web App URL in contact.js.", true);
      return;
    }

    // 2. Client-Side Rate-Limiting Check (Anti-Bot Spam)
    const cooldownRemaining = checkCooldown();
    if (cooldownRemaining > 0) {
      setHint(`Please wait ${cooldownRemaining} seconds before sending another message.`, true);
      return;
    }

    // 3. Extract Raw Field Values
    const rawName = document.getElementById("contactName")?.value || "";
    const rawGender = document.getElementById("contactGender")?.value || "";
    const rawEmail = document.getElementById("contactEmail")?.value || "";
    const rawPhone = document.getElementById("contactPhone")?.value || "";
    const rawSubject = document.getElementById("contactSubject")?.value || "";
    const rawMessage = document.getElementById("contactMessage")?.value || "";

    // 4. Input Validations
    if (!rawName || !rawGender || !rawEmail || !rawPhone || !rawSubject || !rawMessage) {
      setHint("Please fill in all required fields.", true);
      return;
    }

    if (!isValidEmail(rawEmail)) {
      setHint("Please provide a valid email address.", true);
      return;
    }

    if (!isValidPhone(rawPhone)) {
      setHint("Please enter a valid phone number.", true);
      return;
    }

    // 5. Length Restrictions
    if (rawName.length > CONFIG.MAX_NAME_LEN || rawSubject.length > CONFIG.MAX_SUBJ_LEN || rawMessage.length > CONFIG.MAX_MSG_LEN) {
      setHint("One or more fields exceed maximum allowed character limits.", true);
      return;
    }

    // 6. XSS Sanitization
    const sanitizedData = {
      name: sanitizeInput(rawName),
      gender: sanitizeInput(rawGender),
      email: rawEmail.trim().toLowerCase(),
      phone: sanitizeInput(rawPhone),
      subject: sanitizeInput(rawSubject),
      message: sanitizeInput(rawMessage),
      clientTimestamp: new Date().toISOString()
    };

    // Lock UI during transmission
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Securing & Sending...";
    }
    setHint("");

    try {
      // 7. Dispatch sanitized payload to Google Apps Script
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", // Required for cross-origin Google Apps Script endpoints
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(sanitizedData)
      });

      // Set cooldown timestamp to prevent rapid resubmissions
      localStorage.setItem("vegashare_contact_last_submit", Date.now().toString());

      setHint("Thank you! Your message was sent securely. Check your email for a confirmation message.", false);
      form.reset();

    } catch (err) {
      setHint("Transmission error. Please check your connection and try again.", true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Message";
      }
    }
  });

})();