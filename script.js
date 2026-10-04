(() => {
  "use strict";

  /* =======================================================
     COLORLAB
     STATE
  ======================================================= */

  const DEFAULT_COLOR = "#81B29A";

  const state = {
    currentHex: DEFAULT_COLOR,
    currentHsl: {
      h: 148,
      s: 24,
      l: 60
    },

    paletteMode: "balanced",
    palette: [],

    saved: loadSaved(),
    savedPalettes: loadSavedPalettes(),

    extractionImage: null,

    contrast: {
      foreground: "#000000",
      background: "#FFFFFF"
    },

    extracted: [],

    mobileNavOpen: false,
    desktopMenuOpen: false
  };


  /* =======================================================
     DOM HELPERS
  ======================================================= */

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    Array.from(parent.querySelectorAll(selector));


  /* =======================================================
     BASIC COLOR UTILITIES
  ======================================================= */

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function componentToHex(value) {
    return Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  }

  function rgbToHex(r, g, b) {
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
  }

  function hexToRgb(hex) {
    if (!isValidHex(hex)) return null;

    const clean = hex
      .replace("#", "")
      .trim();

    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function normalizeHex(hex) {
    if (!hex) return null;

    let value = String(hex).trim();

    if (!value.startsWith("#")) {
      value = `#${value}`;
    }

    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      value =
        "#" +
        value[1] + value[1] +
        value[2] + value[2] +
        value[3] + value[3];
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      return null;
    }

    return value.toUpperCase();
  }

  function isValidHex(hex) {
    return /^#([0-9a-fA-F]{6})$/.test(
      String(hex || "").trim()
    );
  }


  /* =======================================================
     RGB / HSL
  ======================================================= */

  function rgbToHsl(r, g, b) {

    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    let h = 0;
    let s = 0;

    const l = (max + min) / 2;

    if (max !== min) {

      const d = max - min;

      s = l > .5
        ? d / (2 - max - min)
        : d / (max + min);

      switch (max) {

        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;

        case g:
          h = (b - r) / d + 2;
          break;

        default:
          h = (r - g) / d + 4;
          break;

      }

      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }


  function hueToRgb(p, q, t) {

    if (t < 0) t += 1;
    if (t > 1) t -= 1;

    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }

    if (t < 1 / 2) {
      return q;
    }

    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }

    return p;
  }


  function hslToRgb(h, s, l) {

    h = ((h % 360) + 360) % 360 / 360;
    s = clamp(s / 100);
    l = clamp(l / 100);

    if (s === 0) {

      const value = Math.round(l * 255);

      return {
        r: value,
        g: value,
        b: value
      };
    }

    const q =
      l < .5
        ? l * (1 + s)
        : l + s - l * s;

    const p = 2 * l - q;

    return {
      r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hueToRgb(p, q, h) * 255),
      b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
    };
  }


  function hslToHex(h, s, l) {

    const rgb = hslToRgb(h, s, l);

    return rgbToHex(
      rgb.r,
      rgb.g,
      rgb.b
    );
  }


  /* =======================================================
     OKLCH APPROXIMATION
  ======================================================= */

  function srgbToLinear(value) {

    value /= 255;

    return value <= .04045
      ? value / 12.92
      : Math.pow(
          (value + .055) / 1.055,
          2.4
        );
  }


  function rgbToOklab(r, g, b) {

    r = srgbToLinear(r);
    g = srgbToLinear(g);
    b = srgbToLinear(b);

    const l =
      0.4122214708 * r +
      0.5363325363 * g +
      0.0514459929 * b;

    const m =
      0.2119034982 * r +
      0.6806995451 * g +
      0.1073969566 * b;

    const s =
      0.0883024619 * r +
      0.2817188376 * g +
      0.6299787005 * b;

    const lRoot = Math.cbrt(l);
    const mRoot = Math.cbrt(m);
    const sRoot = Math.cbrt(s);

    return {
      L:
        0.2104542553 * lRoot +
        0.7936177850 * mRoot -
        0.0040720468 * sRoot,

      a:
        1.9779984951 * lRoot -
        2.4285922050 * mRoot +
        0.4505937099 * sRoot,

      b:
        0.0259040371 * lRoot +
        0.7827717662 * mRoot -
        0.8086757660 * sRoot
    };
  }


  function rgbToOklch(hex) {

    const rgb = hexToRgb(hex);

    if (!rgb) {
      return {
        L: 0,
        C: 0,
        H: 0
      };
    }

    const lab = rgbToOklab(
      rgb.r,
      rgb.g,
      rgb.b
    );

    const C = Math.sqrt(
      lab.a * lab.a +
      lab.b * lab.b
    );

    let H =
      Math.atan2(
        lab.b,
        lab.a
      ) *
      180 /
      Math.PI;

    if (H < 0) {
      H += 360;
    }

    return {
      L: lab.L,
      C,
      H
    };
  }


  function formatOklch(hex) {

    const value = rgbToOklch(hex);

    return `${value.L.toFixed(2)} ${value.C.toFixed(2)} ${Math.round(value.H)}`;
  }


  /* =======================================================
     CONTRAST
  ======================================================= */

  function relativeLuminance(hex) {

    const rgb = hexToRgb(hex);

    if (!rgb) return 0;

    const channels = [
      rgb.r,
      rgb.g,
      rgb.b
    ].map(channel => {

      const value = channel / 255;

      return value <= .03928
        ? value / 12.92
        : Math.pow(
            (value + .055) / 1.055,
            2.4
          );
    });

    return (
      .2126 * channels[0] +
      .7152 * channels[1] +
      .0722 * channels[2]
    );
  }


  function contrastRatio(foreground, background) {

    const a = relativeLuminance(foreground);
    const b = relativeLuminance(background);

    const lighter = Math.max(a, b);
    const darker = Math.min(a, b);

    return (lighter + .05) / (darker + .05);
  }


  /* =======================================================
     STORAGE
  ======================================================= */

  function loadSaved() {

    try {

      const raw =
        localStorage.getItem("colorlab-saved");

      const parsed =
        raw ? JSON.parse(raw) : [];

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(normalizeHex)
        .filter(Boolean)
        .filter(
          (color, index, array) =>
            array.indexOf(color) === index
        );

    } catch {

      return [];
    }
  }


  function saveSaved() {

    try {
      localStorage.setItem(
        "colorlab-saved",
        JSON.stringify(state.saved)
      );
    } catch {
      /* Storage can be unavailable. */
    }
  }



  function loadSavedPalettes() {
    try {
      const raw = localStorage.getItem("colorlab-saved-palettes");
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(item => Array.isArray(item?.colors))
        .map(item => ({
          colors: item.colors.map(normalizeHex).filter(Boolean).slice(0, 6),
          mode: String(item.mode || "balanced"),
          base: normalizeHex(item.base) || DEFAULT_COLOR
        }))
        .filter(item => item.colors.length);
    } catch {
      return [];
    }
  }

  function saveSavedPalettes() {
    try {
      localStorage.setItem(
        "colorlab-saved-palettes",
        JSON.stringify(state.savedPalettes)
      );
    } catch {
      /* Storage can be unavailable. */
    }
  }

  /* =======================================================
     TOAST / COPY
  ======================================================= */

  let toastTimer = null;

  function showToast(message) {

    const toast = $("#toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  }


  async function copyText(text, button = null, originalLabel = "Copy") {

    const markCopied = () => {
      if (!button) return;
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = originalLabel || button.textContent.trim();
      }
      button.textContent = "✓ Copied";
      clearTimeout(Number(button.dataset.copyTimer || 0));
      button.dataset.copyTimer = String(setTimeout(() => {
        button.textContent = button.dataset.originalLabel || originalLabel;
        delete button.dataset.originalLabel;
      }, 1400));
    };

    try {

      await navigator.clipboard.writeText(text);
      markCopied();
      showToast(`Copied ${text}`);

    } catch {

      const area =
        document.createElement("textarea");

      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";

      document.body.appendChild(area);

      area.select();

      try {
        document.execCommand("copy");
        markCopied();
        showToast(`Copied ${text}`);
      } catch {
        showToast("Copy is unavailable");
      }

      area.remove();
    }
  }


  /* =======================================================
     THEME
  ======================================================= */

  function initializeTheme() {

    const stored =
      localStorage.getItem("colorlab-theme");

    if (stored === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      document.documentElement.dataset.theme = "light";
    }
  }


  function toggleTheme() {

    const current =
      document.documentElement.dataset.theme;

    const next =
      current === "dark"
        ? "light"
        : "dark";

    document.documentElement.dataset.theme = next;

    localStorage.setItem(
      "colorlab-theme",
      next
    );

    showToast(
      next === "dark"
        ? "Dark theme"
        : "Light theme"
    );
  }


  /* =======================================================
     ROUTING
  ======================================================= */

  const validRoutes = [
    "home",
    "studio",
    "palettes",
    "accessibility",
    "extract",
    "saved"
  ];


  function getRoute() {

    const route =
      location.hash
        .replace("#", "")
        .trim()
        .toLowerCase();

    return validRoutes.includes(route)
      ? route
      : "home";
  }


  function navigate(route) {

    if (!validRoutes.includes(route)) {
      route = "home";
    }

    if (location.hash !== `#${route}`) {
      history.pushState(
        null,
        "",
        `#${route}`
      );
    }

    renderRoute(route);
  }


  function renderRoute(route = getRoute()) {

    $$(".app-page").forEach(page => {

      page.classList.toggle(
        "active",
        page.dataset.page === route
      );

    });


    $$("[data-route]").forEach(link => {

      link.classList.toggle(
        "active",
        link.dataset.route === route
      );

    });


    closeDesktopMenu();
    closeMobileNav();

    window.scrollTo({
      top: 0,
      behavior: "auto"
    });


    if (route === "saved") {
      renderSaved();
      renderSavedPalettes();
    }

    if (route === "studio") {
      updateStudioUI();
    }

    if (route === "palettes") {
      renderPalette();
    }

    if (route === "accessibility") {
      updateContrast();
    }
  }


  function handleRouteClick(event) {

    const link =
      event.target.closest("[data-route]");

    if (!link) return;

    const route = link.dataset.route;

    if (!validRoutes.includes(route)) return;

    event.preventDefault();

    navigate(route);
  }


  /* =======================================================
     DESKTOP MENU
  ======================================================= */

  function openDesktopMenu() {

    const shell = $("#desktopMenu");
    const button = $("#desktopMenuButton");

    if (!shell || !button) return;

    state.desktopMenuOpen = true;

    shell.classList.add("is-open");
    button.classList.add("is-open");

    button.setAttribute(
      "aria-expanded",
      "true"
    );

    shell.setAttribute(
      "aria-hidden",
      "false"
    );
  }


  function closeDesktopMenu() {

    const shell = $("#desktopMenu");
    const button = $("#desktopMenuButton");

    if (!shell || !button) return;

    state.desktopMenuOpen = false;

    shell.classList.remove("is-open");
    button.classList.remove("is-open");

    button.setAttribute(
      "aria-expanded",
      "false"
    );

    shell.setAttribute(
      "aria-hidden",
      "true"
    );
  }


  function toggleDesktopMenu() {

    if (state.desktopMenuOpen) {
      closeDesktopMenu();
    } else {
      openDesktopMenu();
    }
  }


  /* =======================================================
     MOBILE NAV
  ======================================================= */

  function openMobileNav() {

    const shell = $(".mobile-nav-shell");
    const button = $("#mobileNavToggle");

    if (!shell || !button) return;

    state.mobileNavOpen = true;

    shell.classList.add("is-expanded");

    button.setAttribute(
      "aria-expanded",
      "true"
    );

    button.setAttribute(
      "aria-label",
      "Close navigation"
    );
  }


  function closeMobileNav() {

    const shell = $(".mobile-nav-shell");
    const button = $("#mobileNavToggle");

    if (!shell || !button) return;

    state.mobileNavOpen = false;

    shell.classList.remove("is-expanded");

    button.setAttribute(
      "aria-expanded",
      "false"
    );

    button.setAttribute(
      "aria-label",
      "Open navigation"
    );
  }


  function toggleMobileNav() {

    if (state.mobileNavOpen) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  }


  /* =======================================================
     HERO LETTER EFFECT
  ======================================================= */

  const heroColors = [
    "#FF4D4D",
    "#00C2FF",
    "#FF8A00",
    "#2ECC71",
    "#A855F7",
    "#FFD166"
  ];

  let heroColorIndex = 0;


  function activateHeroLetter(letter) {

    if (!letter) return;

    const color =
      heroColors[
        heroColorIndex %
        heroColors.length
      ];

    heroColorIndex += 1;

    letter.style.color = color;

    letter.classList.remove("is-active");

    void letter.offsetWidth;

    letter.classList.add("is-active");

    clearTimeout(
      Number(letter.dataset.colorTimer || 0)
    );

    const timer =
      setTimeout(() => {

        letter.style.color = "#FFFFFF";
        letter.classList.remove("is-active");

      }, 1800);

    letter.dataset.colorTimer = String(timer);
  }


  function initializeHeroLetters() {

    const letters = $$(".hero-letter");
    let lastPointerLetter = null;

    letters.forEach(letter => {

      letter.addEventListener(
        "mouseenter",
        () => activateHeroLetter(letter)
      );

      letter.addEventListener(
        "pointerdown",
        event => {
          if (
            event.pointerType === "touch" ||
            event.pointerType === "pen" ||
            event.pointerType === "mouse"
          ) {
            lastPointerLetter = letter;
            activateHeroLetter(letter);
          }
        },
        { passive: true }
      );

    });

    /*
       Touch/pen users can slide across the headline.
       We resolve the letter under the finger instead of relying on
       pointerenter, which is inconsistent while a touch pointer moves.
       No preventDefault() is used, so normal page scrolling remains intact.
    */
    document.addEventListener(
      "pointermove",
      event => {

        if (
          event.pointerType !== "touch" &&
          event.pointerType !== "pen"
        ) return;

        if (!(event.buttons & 1)) return;

        const element =
          document.elementFromPoint(
            event.clientX,
            event.clientY
          );

        const letter =
          element &&
          element.closest(".hero-letter");

        if (!letter || !letters.includes(letter)) return;

        if (letter !== lastPointerLetter) {
          lastPointerLetter = letter;
          activateHeroLetter(letter);
        }
      },
      { passive: true }
    );
  }





    /* =======================================================
     STUDIO STATE
  ======================================================= */

  function setCurrentColor(hex) {

    const normalized =
      normalizeHex(hex);

    if (!normalized) return false;

    const rgb =
      hexToRgb(normalized);

    const hsl =
      rgbToHsl(
        rgb.r,
        rgb.g,
        rgb.b
      );

    state.currentHex = normalized;
    state.currentHsl = hsl;

    updateStudioUI();

    updateHomeColor();

    return true;
  }


  function updateStudioUI() {

    const hex = state.currentHex;
    const rgb = hexToRgb(hex);
    const hsl = state.currentHsl;

    if (!rgb) return;


    const pickerValue = $("#pickerValue");
    const selectedHex = $("#selectedHex");
    const selectedSwatch = $("#selectedSwatch");

    const studioHex = $("#studioHex");
    const studioRgb = $("#studioRgb");
    const studioHsl = $("#studioHsl");
    const studioOklch = $("#studioOklch");

    if (pickerValue) {
      pickerValue.textContent = hex;
    }

    if (selectedHex) {
      selectedHex.textContent = hex;
    }

    if (selectedSwatch) {
      selectedSwatch.style.backgroundColor = hex;
    }

    if (studioHex) {
      studioHex.textContent = hex;
    }

    if (studioRgb) {
      studioRgb.textContent =
        `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    }

    if (studioHsl) {
      studioHsl.textContent =
        `${hsl.h}, ${hsl.s}%, ${hsl.l}%`;
    }

    if (studioOklch) {
      studioOklch.textContent =
        formatOklch(hex);
    }

    const hexInput = $("#hexInput");

    if (
      hexInput &&
      document.activeElement !== hexInput
    ) {
      hexInput.value = hex;
    }

    updatePickerVisuals();
  }


  function updateHomeColor() {

    const preview = $("#homeColorPreview");
    const hex = $("#homeHex");
    const rgbText = $("#homeRgb");
    const hslText = $("#homeHsl");

    if (preview) {
      preview.style.backgroundColor =
        state.currentHex;
    }

    if (hex) {
      hex.textContent =
        state.currentHex;
    }

    const rgb =
      hexToRgb(state.currentHex);

    const hsl =
      state.currentHsl;

    if (rgbText) {
      rgbText.textContent =
        `RGB ${rgb.r}, ${rgb.g}, ${rgb.b}`;
    }

    if (hslText) {
      hslText.textContent =
        `HSL ${hsl.h}, ${hsl.s}%, ${hsl.l}%`;
    }
  }


  /* =======================================================
     COLOR PICKER
  ======================================================= */

  function updatePickerVisuals() {

    const square = $("#colorSquare");
    const squareHandle = $("#squareHandle");

    const hueHandle = $("#hueHandle");

    if (!square || !squareHandle || !hueHandle) {
      return;
    }

    const {
      h,
      s,
      l
    } = state.currentHsl;


    square.style.background =
      `linear-gradient(to bottom, transparent, #000),
       linear-gradient(to right, #fff, hsl(${h} 100% 50%))`;


    const x = s;
    const y = 100 - l;

    squareHandle.style.left =
      `${x}%`;

    squareHandle.style.top =
      `${y}%`;


    const huePercent =
      h / 360 * 100;

    hueHandle.style.top =
      `${huePercent}%`;
  }


  function updateColorFromSquare(event) {

    const square = $("#colorSquare");

    if (!square) return;

    const rect =
      square.getBoundingClientRect();

    const x =
      clamp(
        (event.clientX - rect.left) /
        rect.width
      );

    const y =
      clamp(
        (event.clientY - rect.top) /
        rect.height
      );

    const h =
      state.currentHsl.h;

    const s =
      Math.round(x * 100);

    const l =
      Math.round((1 - y) * 100);

    setCurrentColor(
      hslToHex(h, s, l)
    );
  }


  function updateHue(event) {

    const track = $("#hueTrack");

    if (!track) return;

    const rect =
      track.getBoundingClientRect();

    const y =
      clamp(
        (event.clientY - rect.top) /
        rect.height
      );

    const h =
      Math.round(y * 360);

    const {
      s,
      l
    } = state.currentHsl;

    setCurrentColor(
      hslToHex(h, s, l)
    );
  }


  function initializePicker() {

    const square = $("#colorSquare");
    const hueTrack = $("#hueTrack");

    if (!square || !hueTrack) {
      return;
    }


    let squareDragging = false;
    let hueDragging = false;


    square.addEventListener(
      "pointerdown",
      event => {

        squareDragging = true;

        square.setPointerCapture(
          event.pointerId
        );

        updateColorFromSquare(event);
      }
    );


    square.addEventListener(
      "pointermove",
      event => {

        if (!squareDragging) return;

        updateColorFromSquare(event);
      }
    );


    square.addEventListener(
      "pointerup",
      () => {
        squareDragging = false;
      }
    );


    square.addEventListener(
      "pointercancel",
      () => {
        squareDragging = false;
      }
    );


    hueTrack.addEventListener(
      "pointerdown",
      event => {

        hueDragging = true;

        hueTrack.setPointerCapture(
          event.pointerId
        );

        updateHue(event);
      }
    );


    hueTrack.addEventListener(
      "pointermove",
      event => {

        if (!hueDragging) return;

        updateHue(event);
      }
    );


    hueTrack.addEventListener(
      "pointerup",
      () => {
        hueDragging = false;
      }
    );


    hueTrack.addEventListener(
      "pointercancel",
      () => {
        hueDragging = false;
      }
    );


    square.addEventListener(
      "keydown",
      event => {

        const key = event.key;

        let {
          h,
          s,
          l
        } = state.currentHsl;

        if (key === "ArrowLeft") {
          s -= 2;
        } else if (key === "ArrowRight") {
          s += 2;
        } else if (key === "ArrowUp") {
          l += 2;
        } else if (key === "ArrowDown") {
          l -= 2;
        } else {
          return;
        }

        event.preventDefault();

        setCurrentColor(
          hslToHex(h, s, l)
        );
      }
    );


    hueTrack.addEventListener(
      "keydown",
      event => {

        const key = event.key;

        let {
          h,
          s,
          l
        } = state.currentHsl;

        if (key === "ArrowUp") {
          h -= 2;
        } else if (key === "ArrowDown") {
          h += 2;
        } else {
          return;
        }

        event.preventDefault();

        setCurrentColor(
          hslToHex(h, s, l)
        );
      }
    );
  }


  /* =======================================================
     HEX INPUT
  ======================================================= */

  function applyHexInput() {

    const input = $("#hexInput");
    const error = $("#hexError");

    if (!input) return;

    const normalized =
      normalizeHex(input.value);

    if (!normalized) {

      if (error) {
        error.textContent =
          "Enter a valid HEX value, for example #81B29A.";
      }

      return;
    }

    if (error) {
      error.textContent = "";
    }

    setCurrentColor(normalized);

    showToast("Color applied");
  }


  /* =======================================================
     RANDOM COLOR
  ======================================================= */

  function randomHex() {

    const r =
      Math.floor(Math.random() * 256);

    const g =
      Math.floor(Math.random() * 256);

    const b =
      Math.floor(Math.random() * 256);

    return rgbToHex(r, g, b);
  }


  /* =======================================================
     SAVE COLORS
  ======================================================= */

  function saveColor(hex = state.currentHex) {

    const normalized =
      normalizeHex(hex);

    if (!normalized) return;

    if (!state.saved.includes(normalized)) {

      state.saved.unshift(normalized);

      saveSaved();

      renderSaved();

      showToast("Color saved");

    } else {

      showToast("Already saved");
    }
  }


  function removeSavedColor(hex) {

    state.saved =
      state.saved.filter(
        color => color !== hex
      );

    saveSaved();

    renderSaved();

    showToast("Color removed");
  }


  function renderSaved() {

    const grid = $("#savedGrid");
    const empty = $("#savedEmpty");

    if (!grid || !empty) return;

    grid.innerHTML = "";


    if (state.saved.length === 0) {

      empty.classList.remove("hidden");

      return;
    }


    empty.classList.add("hidden");


    state.saved.forEach(hex => {

      const item =
        document.createElement("article");

      item.className = "saved-item";

      item.innerHTML = `
        <div
          class="saved-item-color"
          style="background:${hex}"
        ></div>

        <div class="saved-item-body">

          <span class="saved-item-hex">
            ${hex}
          </span>

          <div class="saved-item-actions">

            <button
              type="button"
              data-saved-copy="${hex}"
            >
              Copy
            </button>

            <button
              type="button"
              data-saved-use="${hex}"
            >
              Use
            </button>

          </div>

        </div>
      `;

      grid.appendChild(item);
    });
  }



  function savePalette() {
    const colors = state.palette.map(normalizeHex).filter(Boolean);
    if (!colors.length) {
      showToast("Generate a palette first");
      return;
    }

    const duplicate = state.savedPalettes.some(
      item => item.colors.join(",") === colors.join(",")
    );

    if (duplicate) {
      showToast("Palette already saved");
      return;
    }

    const base =
      normalizeHex($("#paletteBase")?.value) ||
      colors[0];

    state.savedPalettes.unshift({
      colors,
      base,
      mode: state.paletteMode
    });

    saveSavedPalettes();
    renderSavedPalettes();
    showToast("Palette saved");
  }

  function removeSavedPalette(index) {
    state.savedPalettes.splice(index, 1);
    saveSavedPalettes();
    renderSavedPalettes();
    showToast("Palette removed");
  }

  function renderSavedPalettes() {
    const grid = $("#savedPaletteGrid");
    const empty = $("#savedPaletteEmpty");
    if (!grid || !empty) return;

    grid.innerHTML = "";
    empty.classList.toggle("hidden", state.savedPalettes.length > 0);

    state.savedPalettes.forEach((palette, index) => {
      const item = document.createElement("article");
      item.className = "saved-palette";

      const strip = palette.colors
        .map(hex => `<span class="saved-palette-swatch" style="background:${hex}" title="${hex}"></span>`)
        .join("");

      const codes = palette.colors.join(" · ");

      item.innerHTML = `
        <div class="saved-palette-strip">${strip}</div>
        <div class="saved-palette-meta">
          <div class="saved-palette-codes">${codes}</div>
          <div class="saved-palette-actions">
            <button type="button" data-palette-copy="${index}">Copy</button>
            <button type="button" data-palette-use="${index}">Use</button>
            <button type="button" data-palette-remove="${index}">Remove</button>
          </div>
        </div>
      `;

      grid.appendChild(item);
    });
  }

  /* =======================================================
     PALETTE GENERATION
  ======================================================= */

  function paletteValues(mode) {

    if (mode === "soft") {

      return [
        { h: 0, s: -15, l: 26 },
        { h: 3, s: -10, l: 15 },
        { h: -2, s: -5, l: 8 },
        { h: 0, s: 0, l: 0 },
        { h: 2, s: -6, l: -9 },
        { h: -3, s: -10, l: -18 }
      ];
    }


    if (mode === "bold") {

      return [
        { h: 24, s: 18, l: 17 },
        { h: 12, s: 12, l: 9 },
        { h: -8, s: 8, l: 4 },
        { h: 0, s: 0, l: 0 },
        { h: 8, s: 12, l: -10 },
        { h: -18, s: 16, l: -18 }
      ];
    }


    return [
      { h: 10, s: 5, l: 20 },
      { h: 4, s: 2, l: 11 },
      { h: -3, s: 0, l: 5 },
      { h: 0, s: 0, l: 0 },
      { h: 5, s: 3, l: -9 },
      { h: -8, s: 6, l: -18 }
    ];
  }


  function generatePalette(baseHex, mode = state.paletteMode) {

    const normalized =
      normalizeHex(baseHex);

    if (!normalized) {
      return [];
    }

    const rgb =
      hexToRgb(normalized);

    const base =
      rgbToHsl(
        rgb.r,
        rgb.g,
        rgb.b
      );

    const values =
      paletteValues(mode);


    return values.map((value, index) => {

      if (index === 3) {
        return normalized;
      }

      const h =
        base.h + value.h;

      const s =
        clamp(
          (base.s + value.s) / 100
        ) * 100;

      const l =
        clamp(
          (base.l + value.l) / 100
        ) * 100;

      return hslToHex(h, s, l);
    });
  }


  function renderPalette() {

    const baseInput = $("#paletteBase");
    const strip = $("#paletteStrip");
    const codes = $("#paletteCodes");
    const title = $("#paletteTitle");

    if (!strip || !codes || !title) {
      return;
    }

    const base =
      normalizeHex(
        baseInput?.value ||
        state.currentHex
      ) || state.currentHex;


    state.palette =
      generatePalette(
        base,
        state.paletteMode
      );


    const modeName =
      state.paletteMode.charAt(0).toUpperCase() +
      state.paletteMode.slice(1);

    title.textContent =
      `${modeName} palette`;


    strip.innerHTML = "";

    state.palette.forEach(hex => {

      const item =
        document.createElement("button");

      item.type = "button";
      item.className = "palette-color";

      item.style.backgroundColor = hex;

      item.innerHTML =
        `<span>${hex}</span>`;

      item.addEventListener(
        "click",
        () => {
          copyText(hex);
        }
      );

      strip.appendChild(item);
    });


    codes.innerHTML = "";

    state.palette.forEach(hex => {

      const row =
        document.createElement("button");

      row.type = "button";
      row.className = "palette-code";

      row.innerHTML = `
        <strong>${hex}</strong>
        <span>Copy</span>
      `;

      row.addEventListener(
        "click",
        () => copyText(hex)
      );

      codes.appendChild(row);
    });
  }




    /* =======================================================
     ACCESSIBILITY
  ======================================================= */

  function updateContrast() {

    const foregroundInput =
      $("#foregroundInput");

    const backgroundInput =
      $("#backgroundInput");

    const foregroundSwatch =
      $("#foregroundSwatch");

    const backgroundSwatch =
      $("#backgroundSwatch");

    const preview =
      $("#contrastPreview");

    const ratioElement =
      $("#contrastRatio");

    const error =
      $("#contrastError");


    if (
      !foregroundInput ||
      !backgroundInput ||
      !ratioElement
    ) {
      return;
    }


    const foreground =
      normalizeHex(
        foregroundInput.value
      );

    const background =
      normalizeHex(
        backgroundInput.value
      );


    if (!foreground || !background) {

      if (error) {
        error.textContent =
          "Enter valid 6-digit HEX values.";
      }

      return;
    }


    if (error) {
      error.textContent = "";
    }


    state.contrast.foreground =
      foreground;

    state.contrast.background =
      background;


    if (foregroundSwatch) {
      foregroundSwatch.style.background =
        foreground;
    }

    if (backgroundSwatch) {
      backgroundSwatch.style.background =
        background;
    }


    if (preview) {

      preview.style.color =
        foreground;

      preview.style.backgroundColor =
        background;
    }


    const ratio =
      contrastRatio(
        foreground,
        background
      );


    ratioElement.textContent =
      `${ratio.toFixed(2)} : 1`;


    updateWcagCard(
      $("#wcagNormalAA"),
      ratio >= 4.5
    );

    updateWcagCard(
      $("#wcagNormalAAA"),
      ratio >= 7
    );

    updateWcagCard(
      $("#wcagLargeAA"),
      ratio >= 3
    );

    updateWcagCard(
      $("#wcagLargeAAA"),
      ratio >= 4.5
    );
  }


  function updateWcagCard(card, passed) {

    if (!card) return;

    card.classList.toggle(
      "pass",
      passed
    );

    const badge =
      $("span", card);

    if (badge) {
      badge.textContent =
        passed ? "PASS" : "FAIL";
    }
  }


  function swapContrastColors() {

    const foreground =
      $("#foregroundInput");

    const background =
      $("#backgroundInput");

    if (!foreground || !background) {
      return;
    }

    const value =
      foreground.value;

    foreground.value =
      background.value;

    background.value =
      value;

    updateContrast();
  }


  /* =======================================================
     IMAGE EXTRACTION
  ======================================================= */

  function openImagePicker() {

    const input =
      $("#imageInput");

    if (input) {
      input.click();
    }
  }


  function clearImage() {

    const input =
      $("#imageInput");

    const preview =
      $("#imagePreviewCard");

    const extracted =
      $("#extractedCard");

    const canvas =
      $("#imageCanvas");

    const grid =
      $("#extractedGrid");

    const count =
      $("#extractedCount");


    if (input) {
      input.value = "";
    }

    if (canvas) {

      const context =
        canvas.getContext("2d");

      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );
    }

    if (grid) {
      grid.innerHTML = "";
    }

    if (count) {
      count.textContent =
        "0 meaningful colors";
    }

    preview?.classList.add("hidden");
    extracted?.classList.add("hidden");

    state.extracted = [];
    state.extractionImage = null;
  }


  function loadImageFile(file) {

    if (!file) return;

    if (!file.type.startsWith("image/")) {

      showToast("Please choose an image");

      return;
    }


    const url =
      URL.createObjectURL(file);

    const image =
      new Image();


    image.onload = () => {

      try {

        state.extractionImage = image;
        drawSourceImage(image);

        extractImageColors(image);

      } finally {

        URL.revokeObjectURL(url);
      }

    };


    image.onerror = () => {

      URL.revokeObjectURL(url);

      showToast("Could not read image");
    };


    image.src = url;
  }


  function drawSourceImage(image) {

    const canvas =
      $("#imageCanvas");

    const preview =
      $("#imagePreviewCard");

    if (!canvas) return;


    const maxSize = 1000;

    const scale =
      Math.min(
        1,
        maxSize /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
      );


    canvas.width =
      Math.max(
        1,
        Math.round(
          image.naturalWidth * scale
        )
      );

    canvas.height =
      Math.max(
        1,
        Math.round(
          image.naturalHeight * scale
        )
      );


    const context =
      canvas.getContext(
        "2d",
        { willReadFrequently: true }
      );


    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );


    preview?.classList.remove("hidden");
  }


  function colorDistance(a, b) {

    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;

    return Math.sqrt(
      dr * dr +
      dg * dg +
      db * db
    );
  }


  function extractImageColors(image) {

    /*
      Dominant-palette extraction:
      1) downsample the image for performance;
      2) build a coarse histogram to discover real color groups;
      3) use those groups as seeds for a small weighted k-means pass;
      4) merge near-identical clusters and discard tiny noise clusters.

      Unlike the previous "take the most frequent RGB buckets" approach,
      this separates nearby shades caused by JPEG/compression/anti-aliasing
      from the actual dominant colors in the image.
    */

    const canvas = document.createElement("canvas");
    const maxSize = 360;

    const scale = Math.min(
      1,
      maxSize / Math.max(image.naturalWidth, image.naturalHeight)
    );

    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;

    const samples = [];
    const histogram = new Map();
    const sampleStep = Math.max(
      1,
      Math.floor((canvas.width * canvas.height) / 18000)
    );

    let pixelIndex = 0;
    let sampleIndex = 0;

    for (let y = 0; y < canvas.height; y += sampleStep) {
      for (let x = 0; x < canvas.width; x += sampleStep) {
        pixelIndex = (y * canvas.width + x) * 4;

        const alpha = pixels[pixelIndex + 3];
        if (alpha < 45) continue;

        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        samples.push({ r, g, b });
        sampleIndex += 1;

        /* 12-level RGB bins are only used for seed discovery. */
        const qr = Math.round(r / 12) * 12;
        const qg = Math.round(g / 12) * 12;
        const qb = Math.round(b / 12) * 12;
        const key = `${qr},${qg},${qb}`;

        histogram.set(key, (histogram.get(key) || 0) + 1);
      }
    }

    if (!samples.length) {
      state.extracted = [];
      renderExtracted();
      return;
    }

    const total = samples.length;

    const bins = Array.from(histogram.entries())
      .map(([key, count]) => {
        const [r, g, b] = key.split(",").map(Number);
        return {
          r: clamp(r, 0, 255),
          g: clamp(g, 0, 255),
          b: clamp(b, 0, 255),
          count
        };
      })
      .sort((a, b) => b.count - a.count);

    /*
      Discover up to 12 genuinely populated color regions. A region needs
      enough pixels to be meaningful, but the threshold is low enough for
      small swatches/logos to survive.
    */
    const seeds = [];
    let coveredShare = 0;

    for (const bin of bins) {
      const share = bin.count / total;
      if (share < 0.003 && seeds.length >= 4) break;

      const farEnough = seeds.every(
        seed => colorDistance(seed, bin) >= 26
      );

      if (farEnough) {
        seeds.push({ r: bin.r, g: bin.g, b: bin.b });
        coveredShare += share;
      }

      /* Stop from chasing compression/noise once the dominant image content
         is represented. There is deliberately no fixed output-color count. */
      if (seeds.length >= 4 && coveredShare >= 0.96) break;
    }

    /* Very simple images can have fewer populated bins than the requested
       seed count. Never invent colors just to hit a fixed number. */
    if (!seeds.length) {
      seeds.push({ r: 128, g: 128, b: 128 });
    }

    const clusters = seeds.map(seed => ({
      r: seed.r,
      g: seed.g,
      b: seed.b,
      count: 0
    }));

    /* Small k-means refinement. The sample count is capped above for speed. */
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const sums = clusters.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

      for (const sample of samples) {
        let nearest = 0;
        let nearestDistance = Infinity;

        for (let i = 0; i < clusters.length; i += 1) {
          const cluster = clusters[i];
          const dr = sample.r - cluster.r;
          const dg = sample.g - cluster.g;
          const db = sample.b - cluster.b;
          const distance = dr * dr + dg * dg + db * db;

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = i;
          }
        }

        const sum = sums[nearest];
        sum.r += sample.r;
        sum.g += sample.g;
        sum.b += sample.b;
        sum.count += 1;
      }

      let moved = 0;

      clusters.forEach((cluster, index) => {
        const sum = sums[index];
        if (!sum.count) return;

        const next = {
          r: sum.r / sum.count,
          g: sum.g / sum.count,
          b: sum.b / sum.count
        };

        moved += colorDistance(cluster, next);
        cluster.r = next.r;
        cluster.g = next.g;
        cluster.b = next.b;
        cluster.count = sum.count;
      });

      if (moved < 0.5) break;
    }

    /* Remove tiny clusters, then merge centers that are visually the same. */
    const meaningful = clusters
      .filter(cluster => cluster.count / total >= 0.004)
      .sort((a, b) => b.count - a.count);

    const merged = [];

    for (const cluster of meaningful) {
      const duplicate = merged.find(
        existing => colorDistance(existing, cluster) < 24
      );

      if (duplicate) {
        const combined = duplicate.count + cluster.count;
        duplicate.r =
          (duplicate.r * duplicate.count + cluster.r * cluster.count) /
          combined;
        duplicate.g =
          (duplicate.g * duplicate.count + cluster.g * cluster.count) /
          combined;
        duplicate.b =
          (duplicate.b * duplicate.count + cluster.b * cluster.count) /
          combined;
        duplicate.count = combined;
      } else {
        merged.push({ ...cluster });
      }
    }

    state.extracted = merged
      .sort((a, b) => b.count - a.count)
      .map(color => ({
        hex: rgbToHex(
          Math.round(color.r),
          Math.round(color.g),
          Math.round(color.b)
        ),
        count: color.count
      }));

    renderExtracted();
  }


  function analyzeCurrentImage() {
    if (!state.extractionImage) {
      showToast("Choose an image first");
      return;
    }

    extractImageColors(state.extractionImage);
  }


  function renderExtracted() {

    const grid =
      $("#extractedGrid");

    const card =
      $("#extractedCard");

    const count =
      $("#extractedCount");


    if (!grid) return;

    grid.innerHTML = "";


    if (count) {

      count.textContent =
        `${state.extracted.length} meaningful ${
          state.extracted.length === 1
            ? "color"
            : "colors"
        }`;
    }


    card?.classList.remove("hidden");


    state.extracted.forEach(
      ({ hex }) => {

        const item =
          document.createElement("article");

        item.className =
          "extracted-item";


        item.innerHTML = `
          <div
            class="extracted-swatch"
            style="background:${hex}"
          ></div>

          <div class="extracted-info">

            <span class="extracted-hex">
              ${hex}
            </span>

            <div class="extracted-actions">

              <button
                type="button"
                data-extract-copy="${hex}"
              >
                Copy
              </button>

              <button
                type="button"
                data-extract-save="${hex}"
              >
                Save
              </button>

            </div>

          </div>
        `;


        grid.appendChild(item);
      }
    );
  }


  function copyExtractedColors() {

    if (!state.extracted.length) {

      showToast("No colors to copy");

      return;
    }


    const text =
      state.extracted
        .map(item => item.hex)
        .join("\n");


    copyText(text);
  }


  /* =======================================================
     PALETTE COPY
  ======================================================= */

  function copyPalette() {

    if (!state.palette.length) {

      showToast("Generate a palette first");

      return;
    }

    copyText(
      state.palette.join("\n")
    );
  }


  /* =======================================================
     EVENT INITIALIZATION
  ======================================================= */

  function initializeEvents() {

    document.addEventListener(
      "click",
      handleRouteClick
    );


    window.addEventListener(
      "hashchange",
      () => renderRoute()
    );


    window.addEventListener(
      "popstate",
      () => renderRoute()
    );


    $("#themeToggle")?.addEventListener(
      "click",
      toggleTheme
    );


    $("#desktopMenuButton")?.addEventListener(
      "click",
      toggleDesktopMenu
    );


    $("#mobileNavToggle")?.addEventListener(
      "click",
      toggleMobileNav
    );


    $("#homeCopyColor")?.addEventListener(
      "click",
      event => copyText(
        state.currentHex,
        event.currentTarget,
        "Copy HEX"
      )
    );


    $("#homeSaveColor")?.addEventListener(
      "click",
      () => saveColor()
    );


    $("#studioRandom")?.addEventListener(
      "click",
      () => {

        setCurrentColor(
          randomHex()
        );

        showToast("Random color generated");
      }
    );


    $("#applyHex")?.addEventListener(
      "click",
      applyHexInput
    );


    $("#hexInput")?.addEventListener(
      "keydown",
      event => {

        if (event.key === "Enter") {
          applyHexInput();
        }
      }
    );


    $$(".quick-color").forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const color =
            button.dataset.color;

          if (setCurrentColor(color)) {
            showToast("Quick color applied");
          }
        }
      );

    });


    $$(".copy-value").forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const targetId =
            button.dataset.copyTarget;

          const target =
            document.getElementById(targetId);

          if (target) {
            copyText(
              target.textContent.trim(),
              button,
              "Copy"
            );
          }
        }
      );

    });


    $("#saveStudioColor")?.addEventListener(
      "click",
      () => saveColor()
    );


    $("#useCurrentPaletteColor")?.addEventListener(
      "click",
      () => {

        const input =
          $("#paletteBase");

        if (input) {
          input.value =
            state.currentHex;
        }

        renderPalette();

        showToast("Current color loaded");
      }
    );


    $("#generatePalette")?.addEventListener(
      "click",
      () => {

        const input =
          $("#paletteBase");

        const error =
          $("#paletteError");

        const color =
          normalizeHex(
            input?.value
          );


        if (!color) {

          if (error) {
            error.textContent =
              "Enter a valid HEX value.";
          }

          return;
        }


        if (error) {
          error.textContent = "";
        }

        renderPalette();

        showToast("Palette generated");
      }
    );


    $$(".mode-button").forEach(button => {

      button.addEventListener(
        "click",
        () => {

          state.paletteMode =
            button.dataset.paletteMode ||
            "balanced";


          $$(".mode-button").forEach(item => {

            item.classList.toggle(
              "active",
              item === button
            );

          });


          renderPalette();
        }
      );

    });


    $("#copyPalette")?.addEventListener(
      "click",
      copyPalette
    );

    $("#savePalette")?.addEventListener(
      "click",
      savePalette
    );


    $("#foregroundInput")?.addEventListener(
      "input",
      updateContrast
    );


    $("#backgroundInput")?.addEventListener(
      "input",
      updateContrast
    );


    $("#swapContrast")?.addEventListener(
      "click",
      swapContrastColors
    );


    $("#uploadZone")?.addEventListener(
      "click",
      openImagePicker
    );


    $("#imageInput")?.addEventListener(
      "change",
      event => {

        const file =
          event.target.files?.[0];

        loadImageFile(file);
      }
    );


    $("#clearImage")?.addEventListener(
      "click",
      clearImage
    );

    $("#analyzeImage")?.addEventListener(
      "click",
      analyzeCurrentImage
    );


    $("#copyExtracted")?.addEventListener(
      "click",
      copyExtractedColors
    );


    $("#clearSaved")?.addEventListener(
      "click",
      () => {

        if (!state.saved.length) {

          showToast("Saved list is already empty");

          return;
        }


        state.saved = [];
        state.savedPalettes = [];

        saveSaved();
        saveSavedPalettes();

        renderSaved();
        renderSavedPalettes();

        showToast("Saved items cleared");
      }
    );


    $("#savedGrid")?.addEventListener(
      "click",
      event => {

        const copyButton =
          event.target.closest(
            "[data-saved-copy]"
          );

        const useButton =
          event.target.closest(
            "[data-saved-use]"
          );


        if (copyButton) {

          copyText(
            copyButton.dataset.savedCopy
          );

          return;
        }


        if (useButton) {

          const color =
            useButton.dataset.savedUse;

          setCurrentColor(color);

          navigate("studio");
        }

      }
    );



    $("#savedPaletteGrid")?.addEventListener(
      "click",
      event => {
        const copyButton = event.target.closest("[data-palette-copy]");
        const useButton = event.target.closest("[data-palette-use]");
        const removeButton = event.target.closest("[data-palette-remove]");

        if (copyButton) {
          const index = Number(copyButton.dataset.paletteCopy);
          const palette = state.savedPalettes[index];
          if (palette) copyText(palette.colors.join("\n"), copyButton, "Copy");
          return;
        }

        if (useButton) {
          const index = Number(useButton.dataset.paletteUse);
          const palette = state.savedPalettes[index];
          if (!palette) return;

          state.paletteMode = palette.mode;
          const input = $("#paletteBase");
          if (input) input.value = palette.base;
          setCurrentColor(palette.base);
          navigate("palettes");
          return;
        }

        if (removeButton) {
          const index = Number(removeButton.dataset.paletteRemove);
          removeSavedPalette(index);
        }
      }
    );

    $("#extractedGrid")?.addEventListener(
      "click",
      event => {

        const copyButton =
          event.target.closest(
            "[data-extract-copy]"
          );

        const saveButton =
          event.target.closest(
            "[data-extract-save]"
          );


        if (copyButton) {

          copyText(
            copyButton.dataset.extractCopy
          );

          return;
        }


        if (saveButton) {

          saveColor(
            saveButton.dataset.extractSave
          );

        }

      }
    );


    initializeDragAndDrop();
  }





    /* =======================================================
     DRAG & DROP
  ======================================================= */

  function initializeDragAndDrop() {

    const zone =
      $("#uploadZone");

    if (!zone) return;


    [
      "dragenter",
      "dragover"
    ].forEach(type => {

      zone.addEventListener(
        type,
        event => {

          event.preventDefault();

          zone.classList.add("dragover");
        }
      );

    });


    [
      "dragleave",
      "drop"
    ].forEach(type => {

      zone.addEventListener(
        type,
        event => {

          event.preventDefault();

          zone.classList.remove("dragover");
        }
      );

    });


    zone.addEventListener(
      "drop",
      event => {

        const file =
          event.dataTransfer?.files?.[0];

        if (file) {
          loadImageFile(file);
        }
      }
    );
  }


  /* =======================================================
     KEYBOARD / OUTSIDE INTERACTION
  ======================================================= */

  document.addEventListener(
    "keydown",
    event => {

      if (event.key === "Escape") {

        closeDesktopMenu();
        closeMobileNav();
      }

    }
  );


  document.addEventListener(
    "click",
    event => {

      const desktopMenu =
        $("#desktopMenu");

      const menuButton =
        $("#desktopMenuButton");

      if (
        state.desktopMenuOpen &&
        desktopMenu &&
        !desktopMenu.contains(event.target) &&
        menuButton &&
        !menuButton.contains(event.target)
      ) {
        closeDesktopMenu();
      }

    }
  );


  /* =======================================================
     STARTUP
  ======================================================= */

  function initialize() {

    initializeTheme();

    initializeEvents();

    initializeHeroLetters();

    initializePicker();

    setCurrentColor(
      DEFAULT_COLOR
    );

    renderSaved();
    renderSavedPalettes();

    const paletteInput =
      $("#paletteBase");

    if (paletteInput) {
      paletteInput.value =
        DEFAULT_COLOR;
    }

    renderPalette();

    updateContrast();

    renderRoute();

  }


  /*
    IMPORTANT:
    This is the ONLY IIFE closing.
    There is a matching opening at the
    very beginning of this file.
  */

  initialize();

})();