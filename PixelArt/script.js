/**********************
 * Pixel Art
 * - 3 manches : difficile -> moyen -> facile
 * - Avance sur guess raté OU bouton "Suivant"
 * - 7 effets random par round
 * - Recalibrage difficulté (ancien moyen => hard, ancien facile => medium, + nouveau easy)
 **********************/

const MAX_SCORE = 3000;
const STAGE_SCORES = [3000, 2000, 1000];
const STAGE_NAMES = ["Difficile", "Moyen", "Facile"];
const MIN_TITLES_TO_START = 64;

const EFFECTS = [
  { id: "pixel",    label: "Pixel" },
  { id: "blurzoom", label: "Flou + Dézoom" },
  { id: "mosaic",   label: "Mosaïque" },
  { id: "grid",     label: "Quadrillage" },   // V + H
  { id: "poster",   label: "Poster / Contraste" },
  { id: "puzzle",   label: "Puzzle" },        // morceaux déplacés + masques
  { id: "glitch",   label: "Glitch" },        // canvas glitch slices + masks
];

// ====== UI: menu + theme ======
document.getElementById("back-to-menu").addEventListener("click", () => {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
});

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") document.body.classList.add("light");
});

// ====== Helpers ======
function getDisplayTitle(a) {
  return (
    a.title_english ||
    a.title_mal_default ||
    a.title_original ||
    a.title ||
    (a.animethemes && a.animethemes.name) ||
    "Titre inconnu"
  );
}

function getYear(a) {
  const s = (a.season || "").trim();
  const parts = s.split(/\s+/);
  const y = parseInt(parts[1] || parts[0] || "0", 10);
  return Number.isFinite(y) ? y : 0;
}

function clampYearSliders() {
  const minEl = document.getElementById("yearMin");
  const maxEl = document.getElementById("yearMax");
  let a = parseInt(minEl.value, 10);
  let b = parseInt(maxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    minEl.value = a;
    maxEl.value = b;
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

function normalizeTitle(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ====== DOM refs ======
const customPanel = document.getElementById("custom-panel");
const gamePanel = document.getElementById("game-panel");

const popEl = document.getElementById("popPercent");
const scoreEl = document.getElementById("scorePercent");
const yearMinEl = document.getElementById("yearMin");
const yearMaxEl = document.getElementById("yearMax");

const popValEl = document.getElementById("popPercentVal");
const scoreValEl = document.getElementById("scorePercentVal");
const yearMinValEl = document.getElementById("yearMinVal");
const yearMaxValEl = document.getElementById("yearMaxVal");

const previewCountEl = document.getElementById("previewCount");
const applyBtn = document.getElementById("applyFiltersBtn");
const roundCountEl = document.getElementById("roundCount");

// game refs
const container = document.getElementById("character-container");
const feedback = document.getElementById("feedback");
const infoLine = document.getElementById("timer");

const input = document.getElementById("characterInput");
const submitBtn = document.getElementById("submit-btn");
const nextBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");
const roundLabel = document.getElementById("roundLabel");

// score bar
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

// ====== Data ======
let allAnimes = [];
let filteredAnimes = [];

// ====== Session ======
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentAnime = null;
let currentEffect = null;
let stage = 0;
let gameEnded = false;

// art nodes
let artWrap = null;
let artImg = null;
let artCanvas = null;

let overlayMosaic = null;
let overlayGridV = null;
let overlayGridH = null;
let overlayPuzzle = null;

// orders / maps (stables par round)
let mosaicOrder = [];
let gridVOrder = [];
let gridHOrder = [];

let puzzlePerm = [];
let puzzleKeepOrder = [];
let puzzleHideOrder = [];

let zoomDx = 0;
let zoomDy = 0;

// ====== UI show/hide ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== Slider fill ======
function setRangePct(el) {
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || "0");
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty("--pct", `${Math.max(0, Math.min(100, pct))}%`);
}

// ====== Score bar ======
function getScoreBarColor(score) {
  if (score >= 2500) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= 1500) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score >= 1000) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  if (score > 0) return "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  return "linear-gradient(90deg,#444,#333 90%)";
}
function setScoreBar(score) {
  const s = Math.max(0, Math.min(MAX_SCORE, score));
  const pct = Math.max(0, Math.min(100, (s / MAX_SCORE) * 100));
  scoreBar.style.width = pct + "%";
  scoreBar.style.background = getScoreBarColor(s);
  scoreBarLabel.textContent = `${s} / ${MAX_SCORE}`;
}
function currentPotentialScore() {
  return STAGE_SCORES[Math.max(0, Math.min(2, stage))];
}

// ====== Filters ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")]
    .map(b => b.dataset.type);

  if (allowedTypes.length === 0) return [];

  let pool = allAnimes.filter(a =>
    a._year >= yearMin &&
    a._year <= yearMax &&
    allowedTypes.includes(a._type) &&
    typeof a.image === "string" && a.image.trim().length > 0
  );

  if (pool.length === 0) return [];

  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

// ====== Preview ======
function updatePreview() {
  const pool = applyFilters();
  const count = pool.length;
  const ok = count >= MIN_TITLES_TO_START;

  previewCountEl.textContent = `🖼️ Titres disponibles : ${count} (${ok ? "OK" : "Min 64"})`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
  applyBtn.setAttribute("aria-disabled", (!ok).toString());
}

// ====== Custom UI init ======
function initCustomUI() {
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;

    setRangePct(popEl);
    setRangePct(scoreEl);
    setRangePct(yearMinEl);
    setRangePct(yearMaxEl);

    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach(el => el.addEventListener("input", syncLabels));

  document.querySelectorAll("#typePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    filteredAnimes = applyFilters();
    if (filteredAnimes.length < MIN_TITLES_TO_START) {
      updatePreview();
      return;
    }

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Art DOM ======
function ensureArtDOM() {
  container.innerHTML = "";

  artWrap = document.createElement("div");
  artWrap.className = "art-wrap";

  artImg = document.createElement("img");
  artImg.className = "art-img base";
  artImg.alt = "Cover anime";

  artCanvas = document.createElement("canvas");
  artCanvas.id = "artCanvas";

  overlayMosaic = document.createElement("div");
  overlayMosaic.id = "overlayMosaic";
  overlayMosaic.className = "overlay";

  overlayGridV = document.createElement("div");
  overlayGridV.id = "overlayGridV";
  overlayGridV.className = "overlay";

  overlayGridH = document.createElement("div");
  overlayGridH.id = "overlayGridH";
  overlayGridH.className = "overlay";

  overlayPuzzle = document.createElement("div");
  overlayPuzzle.id = "overlayPuzzle";
  overlayPuzzle.className = "overlay";

  artWrap.appendChild(artImg);
  artWrap.appendChild(artCanvas);
  artWrap.appendChild(overlayMosaic);
  artWrap.appendChild(overlayGridV);
  artWrap.appendChild(overlayGridH);
  artWrap.appendChild(overlayPuzzle);

  container.appendChild(artWrap);
}

function resetVisualState() {
  if (!artWrap) return;

  artWrap.className = "art-wrap";
  artWrap.classList.remove("ready");

  // reset overlays
  [overlayMosaic, overlayGridV, overlayGridH, overlayPuzzle].forEach(ov => {
    ov.style.display = "none";
    ov.innerHTML = "";
  });

  mosaicOrder = [];
  gridVOrder = [];
  gridHOrder = [];

  puzzlePerm = [];
  puzzleKeepOrder = [];
  puzzleHideOrder = [];
}

// ====== Round UI ======
function resetRoundUI() {
  roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
  feedback.textContent = "";
  feedback.className = "";
  infoLine.textContent = "";
  suggestions.innerHTML = "";

  stage = 0;
  gameEnded = false;

  input.value = "";
  input.disabled = true;
  submitBtn.disabled = true;

  nextBtn.disabled = true;
  nextBtn.textContent = "Suivant";
  nextBtn.onclick = null;

  setScoreBar(STAGE_SCORES[0]);
}

// ====== Load image ======
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

async function startNewRound() {
  resetRoundUI();
  ensureArtDOM();
  resetVisualState();

  currentAnime = pickRandom(filteredAnimes);
  currentEffect = pickRandom(EFFECTS);

  feedback.textContent = "⏳ Chargement de l'image...";

  zoomDx = (Math.random() * 2 - 1) * 140;
  zoomDy = (Math.random() * 2 - 1) * 140;

  try {
    const loaded = await loadImage(currentAnime.image);

    artImg.src = loaded.src;
    artWrap._loadedImage = loaded;

    buildEffectOverlay();
    applyStage();

    feedback.textContent = "";
    input.disabled = false;
    nextBtn.disabled = false;
    input.focus();
  } catch (e) {
    feedback.textContent = "❌ Erreur: impossible de charger l'image.";
    feedback.className = "error";
    gameEnded = true;

    input.disabled = true;
    submitBtn.disabled = true;

    nextBtn.disabled = false;
    nextBtn.textContent = "Round suivant";
    nextBtn.onclick = () => {
      if (currentRound >= totalRounds) showFinalRecap();
      else { currentRound++; startNewRound(); }
    };
  }
}

function buildEffectOverlay() {
  const src = artImg.src;

  if (currentEffect.id === "mosaic") {
    const cols = 8, rows = 10; // 80 tuiles
    overlayMosaic.style.display = "grid";
    overlayMosaic.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    overlayMosaic.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.style.backgroundImage = `url("${src}")`;
        tile.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
        tile.style.backgroundPosition = `${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`;
        overlayMosaic.appendChild(tile);
        mosaicOrder.push(r * cols + c);
      }
    }
    shuffleInPlace(mosaicOrder);
  }

  if (currentEffect.id === "grid") {
    const v = 16;
    const h = 12;

    overlayGridV.style.display = "grid";
    overlayGridV.style.gridTemplateColumns = `repeat(${v}, 1fr)`;
    overlayGridV.style.gridTemplateRows = `1fr`;

    overlayGridH.style.display = "grid";
    overlayGridH.style.gridTemplateColumns = `1fr`;
    overlayGridH.style.gridTemplateRows = `repeat(${h}, 1fr)`;

    for (let i = 0; i < v; i++) {
      const strip = document.createElement("div");
      strip.className = "strip";
      strip.style.backgroundImage = `url("${src}")`;
      strip.style.backgroundSize = `${v * 100}% 100%`;
      strip.style.backgroundPosition = `${(i / (v - 1)) * 100}% 50%`;
      overlayGridV.appendChild(strip);
      gridVOrder.push(i);
    }

    for (let j = 0; j < h; j++) {
      const strip = document.createElement("div");
      strip.className = "strip";
      strip.style.backgroundImage = `url("${src}")`;
      strip.style.backgroundSize = `100% ${h * 100}%`;
      strip.style.backgroundPosition = `50% ${(j / (h - 1)) * 100}%`;
      overlayGridH.appendChild(strip);
      gridHOrder.push(j);
    }

    shuffleInPlace(gridVOrder);
    shuffleInPlace(gridHOrder);
  }

  if (currentEffect.id === "puzzle") {
    const cols = 4, rows = 6;
    const n = cols * rows;

    overlayPuzzle.style.display = "grid";
    overlayPuzzle.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    overlayPuzzle.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    overlayPuzzle.style.gap = "6px";
    overlayPuzzle.style.padding = "8px";

    puzzlePerm = Array.from({ length: n }, (_, i) => i);
    shuffleInPlace(puzzlePerm);

    puzzleKeepOrder = Array.from({ length: n }, (_, i) => i);
    puzzleHideOrder = Array.from({ length: n }, (_, i) => i);
    shuffleInPlace(puzzleKeepOrder);
    shuffleInPlace(puzzleHideOrder);

    for (let i = 0; i < n; i++) {
      const piece = document.createElement("div");
      piece.className = "piece";

      const r = Math.floor(i / cols);
      const c = i % cols;

      piece.style.backgroundImage = `url("${src}")`;
      piece.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
      piece.style.backgroundPosition = `${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`;

      overlayPuzzle.appendChild(piece);
    }
  }
}

// ====== Apply stage ======
function applyStage() {
  if (!currentAnime || !currentEffect || !artWrap) return;

  artWrap.className = "art-wrap";
  artWrap.classList.remove("ready");

  // score + info
  setScoreBar(currentPotentialScore());
  infoLine.textContent = `Manche ${stage + 1}/3 — ${STAGE_NAMES[stage]} — Effet : ${currentEffect.label}`;

  // bouton suivant
  if (!gameEnded) {
    nextBtn.textContent = "Suivant";
    nextBtn.onclick = () => advanceStage("skip");
  }

  const id = currentEffect.id;
  artWrap.classList.add(`effect-${id}`);

  // ===== Difficile/Moyen/Facile recalibré =====
  // Pixel : ancien [4,8,18] -> nouveau [8,18,36]
  if (id === "pixel") {
    artWrap.classList.add("use-canvas");
    try {
      const samples = [8, 18, 36][stage];
      renderPixelated(artWrap._loadedImage, samples);
    } catch (e) {
      // fallback
      currentEffect = EFFECTS.find(x => x.id === "blurzoom") || currentEffect;
      applyStage();
      return;
    }
  }

  // BlurZoom : ancien très violent -> baisse (hard=ancien moyen)
  if (id === "blurzoom") {
    const blur  = [18, 7, 2.4][stage];
    const scale = [3.8, 1.55, 1.12][stage];
    const mult  = [0.55, 0.18, 0.06][stage];

    artWrap.style.setProperty("--blur", `${blur}px`);
    artWrap.style.setProperty("--scale", `${scale}`);
    artWrap.style.setProperty("--dx", `${zoomDx * mult}px`);
    artWrap.style.setProperty("--dy", `${zoomDy * mult}px`);
  }

  // Mosaic : hard=ancien moyen, medium=ancien facile, + nouveau easy
  if (id === "mosaic") {
    const revealN = [14, 42, 68][stage]; // sur 80
    const tiles = overlayMosaic.querySelectorAll(".tile");
    tiles.forEach(t => t.classList.remove("show"));
    for (let i = 0; i < Math.min(revealN, mosaicOrder.length); i++) {
      const idx = mosaicOrder[i];
      if (tiles[idx]) tiles[idx].classList.add("show");
    }
  }

  // Grid V/H : hard plus caché
  if (id === "grid") {
    const vShow = [3, 8, 12][stage];
    const hShow = [2, 7, 10][stage];

    const vStrips = overlayGridV.querySelectorAll(".strip");
    const hStrips = overlayGridH.querySelectorAll(".strip");
    vStrips.forEach(s => s.classList.remove("show"));
    hStrips.forEach(s => s.classList.remove("show"));

    for (let i = 0; i < Math.min(vShow, gridVOrder.length); i++) {
      const idx = gridVOrder[i];
      if (vStrips[idx]) vStrips[idx].classList.add("show");
    }
    for (let j = 0; j < Math.min(hShow, gridHOrder.length); j++) {
      const idx = gridHOrder[j];
      if (hStrips[idx]) hStrips[idx].classList.add("show");
    }
  }

  // Poster/Contraste : durci + anti-image-plate + nouveau easy
  if (id === "poster") {
    artWrap.classList.add("use-canvas");
    try {
      const opts = [
        // Difficile (plus “mystère” mais jamais uni)
        { px: 14, levels: 6, contrast: 1.55, brightness: 0.92, gamma: 0.88, sat: 0.35, noise: 14, dither: 0.55, vignette: 0.38 },
        // Moyen
        { px: 24, levels: 9, contrast: 1.25, brightness: 0.98, gamma: 0.95, sat: 0.65, noise: 10, dither: 0.35, vignette: 0.28 },
        // Facile (nouveau)
        { px: 40, levels: 14, contrast: 1.08, brightness: 1.02, gamma: 1.00, sat: 0.88, noise: 6, dither: 0.18, vignette: 0.16 },
      ][stage];

      renderPosterMystery(artWrap._loadedImage, opts);
    } catch (e) {
      currentEffect = EFFECTS.find(x => x.id === "blurzoom") || currentEffect;
      applyStage();
      return;
    }
  }

  // Puzzle : hard = plus de pièces cachées + scramble
  if (id === "puzzle") {
    const cols = 4, rows = 6;
    const n = cols * rows;

    // progression stable + plus caché en hard
    const correctRatio = [0.65, 0.85, 0.95][stage];
    const visibleRatio = [0.55, 0.82, 0.97][stage];
    const jitter = [10, 5, 0][stage];
    const rotMax = [6, 3, 0][stage];

    const keepCount = Math.floor(n * correctRatio);
    const hideCount = Math.floor(n * (1 - visibleRatio));

    const keepSet = new Set(puzzleKeepOrder.slice(0, keepCount));
    const hideSet = new Set(puzzleHideOrder.slice(0, hideCount));

    const pieces = overlayPuzzle.querySelectorAll(".piece");
    for (let i = 0; i < n; i++) {
      const piece = pieces[i];
      if (!piece) continue;

      const hidden = hideSet.has(i);
      piece.style.opacity = hidden ? "0" : "1";
      piece.style.pointerEvents = "none";

      // si caché: on garde la place mais invisible (grand “trou” noir)
      if (hidden) {
        piece.style.transform = "none";
        piece.style.gridRow = `${Math.floor(i / cols) + 1}`;
        piece.style.gridColumn = `${(i % cols) + 1}`;
        continue;
      }

      // destination
      const dest = keepSet.has(i) ? i : puzzlePerm[i];
      const dr = Math.floor(dest / cols);
      const dc = dest % cols;

      piece.style.gridRow = `${dr + 1}`;
      piece.style.gridColumn = `${dc + 1}`;

      const rx = (Math.random() * 2 - 1) * jitter;
      const ry = (Math.random() * 2 - 1) * jitter;
      const rot = (Math.random() * 2 - 1) * rotMax;
      piece.style.transform = `translate(${rx}px, ${ry}px) rotate(${rot}deg)`;
    }
  }

  // Glitch : canvas slices + scanlines + masks (moins “simple”)
  if (id === "glitch") {
    artWrap.classList.add("use-canvas");
    try {
      const opts = [
        { slices: 14, maxShift: 34, blur: 1.1, sat: 0.55, contrast: 1.35, brightness: 0.90, hueJitter: 55, masks: 5, scanlineEvery: 3, scanAlpha: 0.12 },
        { slices: 10, maxShift: 20, blur: 0.6, sat: 0.80, contrast: 1.18, brightness: 0.98, hueJitter: 30, masks: 3, scanlineEvery: 4, scanAlpha: 0.09 },
        { slices: 6,  maxShift: 10, blur: 0.2, sat: 1.00, contrast: 1.06, brightness: 1.03, hueJitter: 14, masks: 1, scanlineEvery: 6, scanAlpha: 0.06 },
      ][stage];

      renderGlitchCanvas(artWrap._loadedImage, opts);
    } catch (e) {
      currentEffect = EFFECTS.find(x => x.id === "blurzoom") || currentEffect;
      applyStage();
      return;
    }
  }

  // prêt
  artWrap.classList.add("ready");
}

function advanceStage(reason) {
  if (gameEnded) return;

  if (stage < 2) {
    stage += 1;
    feedback.textContent = (reason === "wrong")
      ? "❌ Mauvaise réponse — manche suivante."
      : "⏭️ Manche suivante.";
    feedback.className = "error";

    input.value = "";
    submitBtn.disabled = true;
    suggestions.innerHTML = "";
    applyStage();
    input.focus();
  } else {
    loseRound(reason === "wrong" ? "❌ Mauvaise réponse." : "⏭️ Passé.");
  }
}

// ====== End round ======
function endRound(roundScore, won, messageHtml) {
  gameEnded = true;

  // afficher en clair à la fin
  artWrap.className = "art-wrap ready";
  artImg.style.opacity = "1";

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);
  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  nextBtn.disabled = false;
  nextBtn.textContent = (currentRound < totalRounds) ? "Round suivant" : "Voir le score total";
  nextBtn.onclick = () => {
    if (currentRound >= totalRounds) showFinalRecap();
    else { currentRound += 1; startNewRound(); }
  };
}

function winRound() {
  const score = currentPotentialScore();
  if (score > 0) launchFireworks();

  const msg = `🎉 Bonne réponse !<br><b>${currentAnime._title}</b><br>
    Score : <b>${score}</b> / ${MAX_SCORE}<br>
    Manche : <b>${stage + 1}/3</b> — Effet : <b>${currentEffect.label}</b>`;

  endRound(score, true, msg);
}

function loseRound(prefix) {
  const msg = `${prefix} ❌<br>Réponse : <b>${currentAnime._title}</b><br>Score : <b>0</b> / ${MAX_SCORE}`;
  endRound(0, false, msg);
}

function showFinalRecap() {
  const gameContainer = document.getElementById("container");
  gameContainer.innerHTML = `
    <div style="width:100%;max-width:520px;text-align:center;">
      <div style="font-size:1.35rem;font-weight:900;opacity:0.95;margin-bottom:10px;">🏆 Série terminée !</div>
      <div style="font-size:1.15rem;font-weight:900;margin-bottom:14px;">
        Score total : <b>${totalScore}</b> / <b>${totalRounds * MAX_SCORE}</b>
      </div>
      <button id="backToSettings" class="menu-btn" style="font-size:1.05rem;padding:0.85rem 1.6rem;">
        Retour réglages
      </button>
    </div>
  `;
  document.getElementById("backToSettings").onclick = () => window.location.reload();
}

// ====== Guess logic ======
function checkGuess() {
  if (!currentAnime || gameEnded) return;

  const guess = input.value.trim();
  if (!guess) {
    feedback.textContent = "⚠️ Tu dois écrire un nom d'anime.";
    feedback.className = "error";
    return;
  }

  const ok = normalizeTitle(guess) === normalizeTitle(currentAnime._title);
  if (ok) return winRound();

  advanceStage("wrong");
}

// ====== Autocomplete ======
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  submitBtn.disabled = true;

  if (!val) return;

  const titles = [...new Set(filteredAnimes.map(a => a._title))];
  const matches = titles.filter(t => t.toLowerCase().includes(val)).slice(0, 7);

  matches.forEach((title) => {
    const div = document.createElement("div");
    div.innerHTML = `<span>${title.replace(new RegExp(val, "i"), (m) => `<b>${m}</b>`)}</span>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = title;
      suggestions.innerHTML = "";
      submitBtn.disabled = false;
      input.focus();
    });
    suggestions.appendChild(div);
  });

  submitBtn.disabled = !titles.map(t => t.toLowerCase()).includes(val);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) checkGuess();
});
submitBtn.addEventListener("click", checkGuess);

// ====== Tooltip ======
document.addEventListener("click", (e) => {
  const icon = e.target.closest(".info-icon");
  if (!icon) return;
  e.preventDefault();
  e.stopPropagation();
  const wrap = icon.closest(".info-wrap");
  if (wrap) wrap.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".info-wrap")) {
    document.querySelectorAll(".info-wrap.open").forEach((w) => w.classList.remove("open"));
  }
});

// ====== Canvas utils ======
function fitCanvasToWrap() {
  const rect = artWrap.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  artCanvas.width = Math.floor(rect.width * dpr);
  artCanvas.height = Math.floor(rect.height * dpr);
}

function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function renderPixelated(img, samples) {
  fitCanvasToWrap();
  const ctx = artCanvas.getContext("2d");
  const w = artCanvas.width;
  const h = artCanvas.height;

  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d");

  const ratio = h / w;
  off.width = Math.max(8, samples);
  off.height = Math.max(8, Math.floor(samples * ratio));

  offCtx.imageSmoothingEnabled = true;
  offCtx.clearRect(0, 0, off.width, off.height);
  drawImageCover(offCtx, img, 0, 0, off.width, off.height);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);
}

function renderPosterMystery(img, opts) {
  fitCanvasToWrap();
  const ctx = artCanvas.getContext("2d", { willReadFrequently: true });
  const w = artCanvas.width;
  const h = artCanvas.height;

  // 1) pixelation douce (mais dure en hard)
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d", { willReadFrequently: true });

  const ratio = h / w;
  off.width = Math.max(16, opts.px);
  off.height = Math.max(16, Math.floor(opts.px * ratio));

  offCtx.imageSmoothingEnabled = true;
  offCtx.clearRect(0, 0, off.width, off.height);
  drawImageCover(offCtx, img, 0, 0, off.width, off.height);

  // upscale sans smoothing
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);

  // 2) poster + contrast + gamma + sat + dithering + noise (anti "couleur unie")
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const levels = Math.max(5, opts.levels);
  const step = 255 / (levels - 1);

  // Bayer 4x4
  const bayer4 = [
    0,  8,  2, 10,
    12, 4, 14, 6,
    3, 11, 1,  9,
    15, 7, 13, 5
  ];
  const ditherStrength = opts.dither ?? 0.3;

  function clamp255(v){ return v < 0 ? 0 : (v > 255 ? 255 : v); }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      let r = data[i], g = data[i+1], b = data[i+2];

      // luminance
      const gray = 0.2126*r + 0.7152*g + 0.0722*b;

      // saturation
      r = gray + (r - gray) * opts.sat;
      g = gray + (g - gray) * opts.sat;
      b = gray + (b - gray) * opts.sat;

      // contrast + brightness (mul)
      r = (r - 128) * opts.contrast + 128;
      g = (g - 128) * opts.contrast + 128;
      b = (b - 128) * opts.contrast + 128;

      r *= opts.brightness;
      g *= opts.brightness;
      b *= opts.brightness;

      // gamma
      r = 255 * Math.pow(clamp255(r)/255, opts.gamma);
      g = 255 * Math.pow(clamp255(g)/255, opts.gamma);
      b = 255 * Math.pow(clamp255(b)/255, opts.gamma);

      // dithering
      const m = bayer4[(x & 3) + ((y & 3) << 2)] / 15; // 0..1
      const d = (m - 0.5) * ditherStrength * step;

      r = r + d;
      g = g + d;
      b = b + d;

      // quantization (posterize)
      r = Math.round(r / step) * step;
      g = Math.round(g / step) * step;
      b = Math.round(b / step) * step;

      // noise
      const n = (Math.random() * 2 - 1) * (opts.noise || 0);
      r += n; g += n; b += n;

      data[i]   = clamp255(r);
      data[i+1] = clamp255(g);
      data[i+2] = clamp255(b);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // 3) vignette légère (rend moins “simple” et masque bords)
  const vg = ctx.createRadialGradient(w*0.5, h*0.45, Math.min(w,h)*0.10, w*0.5, h*0.5, Math.max(w,h)*0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${opts.vignette ?? 0.25})`);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function renderGlitchCanvas(img, opts) {
  fitCanvasToWrap();
  const ctx = artCanvas.getContext("2d");
  const w = artCanvas.width;
  const h = artCanvas.height;

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");

  octx.clearRect(0, 0, w, h);
  octx.imageSmoothingEnabled = true;
  drawImageCover(octx, img, 0, 0, w, h);

  ctx.clearRect(0, 0, w, h);

  // base image un peu “sale”
  ctx.save();
  ctx.filter = `blur(${opts.blur}px) saturate(${opts.sat}) contrast(${opts.contrast}) brightness(${opts.brightness})`;
  ctx.drawImage(off, 0, 0);
  ctx.restore();

  // scanlines
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${opts.scanAlpha})`;
  for (let y = 0; y < h; y += opts.scanlineEvery) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();

  // slices décalés + hue jitter
  for (let i = 0; i < opts.slices; i++) {
    const sliceH = Math.max(6, Math.floor(Math.random() * (h * 0.08)));
    const y = Math.floor(Math.random() * (h - sliceH));
    const dx = Math.floor((Math.random() * 2 - 1) * opts.maxShift);
    const hue = (Math.random() * 2 - 1) * opts.hueJitter;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, w, sliceH);
    ctx.clip();

    ctx.globalCompositeOperation = "screen";
    ctx.filter = `hue-rotate(${hue}deg) saturate(1.35) contrast(1.25)`;
    ctx.drawImage(off, dx, 0);

    ctx.restore();
  }

  // masks noirs (bandes cachées)
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  for (let k = 0; k < opts.masks; k++) {
    const mh = Math.max(10, Math.floor(Math.random() * (h * 0.08)));
    const my = Math.floor(Math.random() * (h - mh));
    ctx.fillRect(0, my, w, mh);
  }
  ctx.restore();
}

window.addEventListener("resize", () => {
  if (!gameEnded && currentAnime && currentEffect && artWrap?.classList.contains("use-canvas")) {
    applyStage();
  }
});

// ====== Fireworks ======
function launchFireworks() {
  const canvas = document.getElementById("fireworks");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  function createParticle(x, y) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 5 + 2;
    return { x, y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: 60 };
  }
  for (let i = 0; i < 80; i++) particles.push(createParticle(canvas.width / 2, canvas.height / 2));

  function animate() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 50%)`;
      ctx.fill();
      p.x += p.dx;
      p.y += p.dy;
      p.dy += 0.05;
      p.life--;
    });

    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }

    if (particles.length > 0) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

// ====== Load dataset ======
fetch("../data/licenses_only.json")
  .then((r) => r.json())
  .then((data) => {
    allAnimes = (Array.isArray(data) ? data : []).map((a) => {
      const title = getDisplayTitle(a);
      return {
        ...a,
        _title: title,
        _year: getYear(a),
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
      };
    });

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
