/* ============================================================
   VegaShare — pages.js (Lightweight JS for Terms, Privacy & Contact Pages)
   Handles theme toggling, sticky navigation, mobile menu,
   scroll animations, ripple effects, and dynamic copyright year.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- DOM Selectors ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- Theme Handler (Default Light + User Storage) ---------- */
  const themeBtn = $("#themeToggle");
  const storedTheme = localStorage.getItem("vega-theme");

  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", String(mode === "dark"));
    }
  }

  // Force light mode by default unless saved otherwise
  const initialTheme = storedTheme || "light";
  applyTheme(initialTheme);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(current);
      localStorage.setItem("vega-theme", current);
    });
  }

  /* ---------- Sticky Nav & Mobile Burger Menu ---------- */
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

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) burger.click();
    });
  }

  /* ---------- Scroll Animations (IntersectionObserver) ---------- */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((en) => { 
          if (en.isIntersecting) { 
            en.target.classList.add("is-in"); 
            io.unobserve(en.target); 
          } 
        });
      }, { threshold: 0.1 })
    : null;

  function observe(el) { 
    if (io) io.observe(el); 
    else el.classList.add("is-in"); 
  }
  
  $$(".reveal").forEach(observe);

  /* ---------- Button Ripple Effect ---------- */
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

  /* ---------- Footer Dynamic Year ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();