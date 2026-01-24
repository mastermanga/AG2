/**********************
 * Pixel Art (Harder + Grid VH + Puzzle déplacé)
 * - 3 manches : difficile -> moyen -> facile
 * - Avance sur guess raté OU bouton "Suivant"
 * - 7 effets random par round
 **********************/

const MAX_SCORE = 3000;
const STAGE_SCORES = [3000, 2000, 1000];
const STAGE_NAMES = ["Difficile", "Moyen", "Facile"];
const MIN_TITLES_TO_START = 64;

// 7 effets (pixel + blurzoom + mosaic + gridVH + poster + puzzle + glitch)
const EFFECTS = [
  { id: "pixel",    label: "Pixel" },
  { id: "blurzoom", label: "Flou + Dézoom" },
  { id: "mosaic",   label: "Mosaïque" },
  { id: "grid",     label: "Quadrillage" },   // V + H
  { id: "poster",   label: "Poster" },
  { id: "puzzle",   label: "Puzzle" },        // morceaux déplacés
  { id: "glitch",   label: "Glitch" },
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
let artImgA = null;
let artImgB = null;
let artCanvas = null;

let overlayMosaic = null;
let overlayGridV = null;
let overlayGridH = null;
let overlayPuzzle = null;

// orders / maps
let mosaicOrder = [];
let gridVOrder = [];
let gridHOrder = [];
let puzzlePerm = []; // destination cell per piece (stage 1)
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

  artImgA = document.createElement("img");
  artImgA.className = "art-img glitch-layer";
  artImgA.alt = "";

  artImgB = document.createElement("img");
  artImgB.className = "art-img glitch-layer";
  artImgB.alt = "";

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
  artWrap.appendChild(artImgA);
  artWrap.appendChild(artImgB);
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

  [
    "--blur","--scale","--dx","--dy",
    "--gs","--ct","--br","--sat","--gAlpha","--ghue","--gdx","--gdy","--gblur"
  ].forEach(v => artWrap.style.removeProperty(v));

  artImgA.style.opacity = "0";
  artImgB.style.opacity = "0";
  artImgB.style.transform = "";

  // reset overlays
  [overlayMosaic, overlayGridV, overlayGridH, overlayPuzzle].forEach(ov => {
    ov.style.display = "none";
    ov.innerHTML = "";
  });

  mosaicOrder = [];
  gridVOrder = [];
  gridHOrder = [];
  puzzlePerm = [];
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
    artImgA.src = loaded.src;
    artImgB.src = loaded.src;
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
  // On construit uniquement ce qu’il faut pour l’effet choisi
  const src = artImg.src;

  if (currentEffect.id === "mosaic") {
    const cols = 8, rows = 10; // 80 tuiles => plus dur
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
    // Quadrillage V + H (bandes verticales + horizontales)
    const v = 16; // vertical stripes
    const h = 12; // horizontal stripes

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
    // Puzzle déplacé: on met les morceaux dans de mauvaises cases
    const cols = 4, rows = 6;
    const n = cols * rows;

    overlayPuzzle.style.display = "grid";
    overlayPuzzle.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    overlayPuzzle.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    overlayPuzzle.style.gap = "6px";
    overlayPuzzle.style.padding = "8px";

    // permutation de destination
    puzzlePerm = Array.from({ length: n }, (_, i) => i);
    shuffleInPlace(puzzlePerm);

    for (let i = 0; i < n; i++) {
      const piece = document.createElement("div");
      piece.className = "piece";

      // contenu = morceau i (position d’origine)
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

  // reset classes but keep overlays already built
  artWrap.className = "art-wrap";
  artWrap.style.removeProperty("--blur");
  artWrap.style.removeProperty("--scale");
  artWrap.style.removeProperty("--dx");
  artWrap.style.removeProperty("--dy");

  artWrap.style.removeProperty("--gs");
  artWrap.style.removeProperty("--ct");
  artWrap.style.removeProperty("--br");
  artWrap.style.removeProperty("--sat");
  artWrap.style.removeProperty("--gAlpha");
  artWrap.style.removeProperty("--ghue");
  artWrap.style.removeProperty("--gdx");
  artWrap.style.removeProperty("--gdy");
  artWrap.style.removeProperty("--gblur");

  artImgA.style.opacity = "0";
  artImgB.style.opacity = "0";
  artImgB.style.transform = "";

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

  // ==== Intensités HARD ====
  if (id === "blurzoom") {
    // stage 1: énorme blur + zoom serré
    const blur  = [40, 18, 7][stage];
    const scale = [8.5, 3.8, 1.55][stage];
    const mult  = [1.0, 0.55, 0.18][stage];
    artWrap.style.setProperty("--blur", `${blur}px`);
    artWrap.style.setProperty("--scale", `${scale}`);
    artWrap.style.setProperty("--dx", `${zoomDx * mult}px`);
    artWrap.style.setProperty("--dy", `${zoomDy * mult}px`);
  }

  if (id === "mosaic") {
    // stage 1: quasi rien visible
    const revealN = [2, 14, 42][stage]; // sur 80
    const tiles = overlayMosaic.querySelectorAll(".tile");
    tiles.forEach(t => t.classList.remove("show"));
    for (let i = 0; i < Math.min(revealN, mosaicOrder.length); i++) {
      const idx = mosaicOrder[i];
      if (tiles[idx]) tiles[idx].classList.add("show");
    }
  }

  if (id === "grid") {
    // Quadrillage = bandes verticales + horizontales
    const vShow = [1, 4, 8][stage];
    const hShow = [1, 3, 7][stage];

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

  if (id === "puzzle") {
    // Stage 1: presque tout mal placé
    // Stage 2: 50% corrigé
    // Stage 3: 80% corrigé
    const keepRatio = [0.10, 0.50, 0.80][stage];

    const pieces = overlayPuzzle.querySelectorAll(".piece");
    const cols = 4, rows = 6;
    const n = cols * rows;

    // indices qu’on garde à la bonne place
    const keepCount = Math.floor(n * keepRatio);
    const idxs = Array.from({ length: n }, (_, i) => i);
    shuffleInPlace(idxs);
    const keepSet = new Set(idxs.slice(0, keepCount));

    for (let i = 0; i < n; i++) {
      const piece = pieces[i];
      if (!piece) continue;

      // destination (cell index)
      const dest = keepSet.has(i) ? i : puzzlePerm[i];

      // placer la pièce dans la grille (déplacement réel)
      const dr = Math.floor(dest / cols);
      const dc = dest % cols;

      piece.style.gridRow = `${dr + 1}`;
      piece.style.gridColumn = `${dc + 1}`;

      // petit jitter en stage 1/2 pour rendre plus “puzzle”
      const jitter = [10, 5, 0][stage];
      const rx = (Math.random() * 2 - 1) * jitter;
      const ry = (Math.random() * 2 - 1) * jitter;
      const rot = (Math.random() * 2 - 1) * (stage === 0 ? 6 : stage === 1 ? 3 : 0);
      piece.style.transform = `translate(${rx}px, ${ry}px) rotate(${rot}deg)`;
    }
  }

  if (id === "glitch") {
    // plus violent (mais jouable)
    const gs    = [1.0, 0.70, 0.20][stage];
    const ct    = [2.6, 1.8, 1.12][stage];
    const br    = [0.65, 0.88, 1.00][stage];
    const sat   = [0.25, 0.65, 1.00][stage];
    const gblur = [2.8, 1.2, 0][stage];

    artWrap.style.setProperty("--gs", `${gs}`);
    artWrap.style.setProperty("--ct", `${ct}`);
    artWrap.style.setProperty("--br", `${br}`);
    artWrap.style.setProperty("--sat", `${sat}`);
    artWrap.style.setProperty("--gblur", `${gblur}px`);

    const gAlpha = [0.65, 0.35, 0.12][stage];
    artWrap.style.setProperty("--gAlpha", `${gAlpha}`);

    const off = [22, 10, 2][stage];
    artWrap.style.setProperty("--gdx", `${off}px`);
    artWrap.style.setProperty("--gdy", `${-off}px`);
    artWrap.style.setProperty("--ghue", `${[90, 35, 0][stage]}deg`);

    artImgA.style.opacity = "1";
    artImgB.style.opacity = "1";
    artImgB.style.transform = `translate(${-off}px, ${off}px)`;
  }

  if (id === "pixel") {
    artWrap.classList.add("use-canvas");
    try {
      const samples = [4, 8, 18][stage]; // plus dur
      renderPixelated(artWrap._loadedImage, samples);
    } catch (e) {
      // fallback si CORS bloque: blurzoom
      currentEffect = EFFECTS.find(x => x.id === "blurzoom") || currentEffect;
      applyStage();
      return;
    }
  }

  if (id === "poster") {
    artWrap.classList.add("use-canvas");
    try {
      // poster + petite pixelation (très dur)
      const levels = [2, 3, 6][stage];
      const px = [10, 18, 34][stage];
      renderPosterPixel(artWrap._loadedImage, levels, px);
    } catch (e) {
      currentEffect = EFFECTS.find(x => x.id === "blurzoom") || currentEffect;
      applyStage();
      return;
    }
  }

  // afficher une fois que tout est prêt
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

// ====== Canvas effects ======
function fitCanvasToWrap() {
  const rect = artWrap.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  artCanvas.width = Math.floor(rect.width * dpr);
  artCanvas.height = Math.floor(rect.height * dpr);
}

function renderPixelated(img, samples) {
  fitCanvasToWrap();
  const ctx = artCanvas.getContext("2d");
  const w = artCanvas.width;
  const h = artCanvas.height;

  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d");

  const ratio = h / w;
  off.width = Math.max(3, samples);
  off.height = Math.max(3, Math.floor(samples * ratio));

  offCtx.imageSmoothingEnabled = true;
  offCtx.clearRect(0, 0, off.width, off.height);
  offCtx.drawImage(img, 0, 0, off.width, off.height);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);
}

function renderPosterPixel(img, levels, px) {
  // 1) d’abord on pixelise (petit offscreen)
  fitCanvasToWrap();
  const w = artCanvas.width;
  const h = artCanvas.height;

  const ratio = h / w;
  const smallW = Math.max(6, px);
  const smallH = Math.max(6, Math.floor(px * ratio));

  const off = document.createElement("canvas");
  off.width = smallW;
  off.height = smallH;
  const offCtx = off.getContext("2d");
  offCtx.imageSmoothingEnabled = true;
  offCtx.drawImage(img, 0, 0, smallW, smallH);

  // 2) on upscale sans smoothing
  const ctx = artCanvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);

  // 3) posterize dur
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const step = 255 / Math.max(1, (levels - 1));

  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
  ctx.putImageData(imageData, 0, 0);
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
