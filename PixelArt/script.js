/**********************
 * Pixel Art
 * - Dataset: ../data/licenses_only.json
 * - Personnalisation: popularité/score/années/types + rounds
 * - Devine l’anime via sa cover (image) modifiée
 * - 3 manches: Difficile -> Moyen -> Facile
 * - Pas de timer: progression si guess raté OU bouton "Suivant"
 * - Effet random au début de chaque round (reste le même sur les 3 manches)
 **********************/

const MAX_SCORE = 3000;
const STAGE_SCORES = [3000, 2000, 1000]; // manche 1/2/3
const STAGE_NAMES = ["Difficile", "Moyen", "Facile"];
const MIN_TITLES_TO_START = 64;

// 7 effets
const EFFECTS = [
  { id: "pixel",  label: "Pixel" },
  { id: "blur",   label: "Flou" },
  { id: "zoom",   label: "Zoom" },
  { id: "mosaic", label: "Mosaïque" },
  { id: "poster", label: "Poster" },
  { id: "blinds", label: "Volets" },
  { id: "glitch", label: "Glitch" },
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
    .replace(/[\u0300-\u036f]/g, "")  // accents
    .replace(/[^a-z0-9\s]/g, " ")     // ponctuation
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
const timerDisplay = document.getElementById("timer");

const input = document.getElementById("characterInput");
const submitBtn = document.getElementById("submit-btn");
const nextBtn = document.getElementById("restart-btn"); // sert de "Suivant" pendant le round
const suggestions = document.getElementById("suggestions");
const roundLabel = document.getElementById("roundLabel");

// score bar
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

// ====== Data ======
let allAnimes = [];
let filteredAnimes = [];

// ====== Session (Rounds) ======
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentAnime = null;
let gameEnded = false;

let stage = 0; // 0..2
let currentEffect = null;

let artWrap = null;
let artImg = null;
let artImgA = null; // glitch layer
let artImgB = null; // glitch layer
let artCanvas = null;
let overlayMosaic = null;
let overlayBlinds = null;

let mosaicOrder = [];
let blindsOrder = [];
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

// ====== Slider fill helper ======
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

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map(
    (b) => b.dataset.type
  );
  if (allowedTypes.length === 0) return [];

  let pool = allAnimes.filter((a) => {
    return (
      a._year >= yearMin &&
      a._year <= yearMax &&
      allowedTypes.includes(a._type) &&
      typeof a.image === "string" &&
      a.image.trim().length > 0
    );
  });

  if (pool.length === 0) return [];

  // Popularité (members)
  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // Score
  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  // sécurité image
  pool = pool.filter(a => typeof a.image === "string" && a.image);

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

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) =>
    el.addEventListener("input", syncLabels)
  );

  // type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
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

  // glitch layers (toujours présents, mais invisibles sauf si glitch)
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

  overlayBlinds = document.createElement("div");
  overlayBlinds.id = "overlayBlinds";

  artWrap.appendChild(artImg);
  artWrap.appendChild(artImgA);
  artWrap.appendChild(artImgB);
  artWrap.appendChild(artCanvas);
  artWrap.appendChild(overlayMosaic);
  artWrap.appendChild(overlayBlinds);

  container.appendChild(artWrap);
}

function clearEffectClasses() {
  if (!artWrap) return;
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

  overlayMosaic.style.display = "none";
  overlayBlinds.style.display = "none";
  overlayMosaic.innerHTML = "";
  overlayBlinds.innerHTML = "";

  // glitch layers off
  artImgA.style.opacity = "0";
  artImgB.style.opacity = "0";
}

// ====== Round UI ======
function resetRoundUI() {
  roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
  feedback.textContent = "";
  feedback.className = "";
  timerDisplay.textContent = "";
  suggestions.innerHTML = "";

  stage = 0;
  gameEnded = false;

  input.value = "";
  input.disabled = true;  // débloqué après chargement image
  submitBtn.disabled = true;

  nextBtn.disabled = true;
  nextBtn.style.display = "inline-block";
  nextBtn.textContent = "Suivant";

  setScoreBar(STAGE_SCORES[0]);
}

async function startNewRound() {
  resetRoundUI();
  ensureArtDOM();
  clearEffectClasses();

  currentAnime = pickRandom(filteredAnimes);
  currentEffect = pickRandom(EFFECTS);

  feedback.textContent = "⏳ Chargement de l'image...";
  feedback.className = "";

  // random zoom offsets (mêmes sur les 3 manches)
  zoomDx = (Math.random() * 2 - 1) * 70; // px (approx)
  zoomDy = (Math.random() * 2 - 1) * 70;

  try {
    await loadRoundImage(currentAnime.image);
    prepareEffectLayers();
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

async function loadRoundImage(src) {
  // on charge avec crossOrigin (utile pour canvas quand possible)
  const loaded = await loadImage(src);

  // on alimente toutes les couches <img> (CSS effects / glitch)
  artImg.src = loaded.src;
  artImgA.src = loaded.src;
  artImgB.src = loaded.src;

  // petit cache : stocker la "source image" pour canvas
  artWrap._loadedImage = loaded;
}

function prepareEffectLayers() {
  // préparer ordre mosaic/blinds (progression stable)
  mosaicOrder = [];
  blindsOrder = [];

  // Mosaic: grid 5x7 (35)
  if (currentEffect.id === "mosaic") {
    const cols = 5, rows = 7;
    overlayMosaic.style.display = "grid";
    overlayMosaic.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    overlayMosaic.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.style.backgroundImage = `url("${artImg.src}")`;
        tile.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
        tile.style.backgroundPosition = `${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`;
        overlayMosaic.appendChild(tile);
        mosaicOrder.push(r * cols + c);
      }
    }
    shuffleInPlace(mosaicOrder);
  }

  // Blinds: 12 strips (vertical)
  if (currentEffect.id === "blinds") {
    const strips = 12;
    overlayBlinds.style.display = "grid";
    overlayBlinds.style.gridTemplateColumns = `repeat(${strips}, 1fr)`;
    overlayBlinds.style.gridTemplateRows = `1fr`;

    for (let i = 0; i < strips; i++) {
      const strip = document.createElement("div");
      strip.className = "strip";
      strip.style.backgroundImage = `url("${artImg.src}")`;
      strip.style.backgroundSize = `${strips * 100}% 100%`;
      strip.style.backgroundPosition = `${(i / (strips - 1)) * 100}% 50%`;
      overlayBlinds.appendChild(strip);
      blindsOrder.push(i);
    }
    shuffleInPlace(blindsOrder);
  }
}

// ====== Apply stage (manche) ======
function applyStage() {
  if (!currentAnime || !currentEffect || !artWrap) return;

  // score potentiel
  setScoreBar(currentPotentialScore());

  // label info
  timerDisplay.textContent = `Manche ${stage + 1}/3 — ${STAGE_NAMES[stage]} — Effet : ${currentEffect.label}`;

  // reset classes
  clearEffectClasses();
  artWrap.classList.add(`effect-${currentEffect.id}`);

  // bouton next
  if (!gameEnded) {
    nextBtn.textContent = "Suivant";
    nextBtn.onclick = () => advanceStage("skip");
  }

  const id = currentEffect.id;

  // intensités 3 niveaux
  if (id === "blur") {
    const blur = [20, 10, 3][stage];
    artWrap.style.setProperty("--blur", `${blur}px`);
    return;
  }

  if (id === "zoom") {
    const scale = [4.0, 2.3, 1.2][stage];
    const mult = [1.0, 0.6, 0.25][stage];
    artWrap.style.setProperty("--scale", `${scale}`);
    artWrap.style.setProperty("--dx", `${zoomDx * mult}px`);
    artWrap.style.setProperty("--dy", `${zoomDy * mult}px`);
    return;
  }

  if (id === "mosaic") {
    // reveal N tiles
    const revealN = [4, 12, 26][stage]; // sur 35
    const tiles = overlayMosaic.querySelectorAll(".tile");
    tiles.forEach(t => t.classList.remove("show"));
    for (let i = 0; i < Math.min(revealN, mosaicOrder.length); i++) {
      const idx = mosaicOrder[i];
      if (tiles[idx]) tiles[idx].classList.add("show");
    }
    return;
  }

  if (id === "blinds") {
    // reveal N strips
    const revealN = [2, 5, 9][stage]; // sur 12
    const strips = overlayBlinds.querySelectorAll(".strip");
    strips.forEach(s => s.classList.remove("show"));
    for (let i = 0; i < Math.min(revealN, blindsOrder.length); i++) {
      const idx = blindsOrder[i];
      if (strips[idx]) strips[idx].classList.add("show");
    }
    return;
  }

  if (id === "glitch") {
    // base filter
    const gs  = [1.0, 0.55, 0.15][stage];
    const ct  = [1.75, 1.35, 1.10][stage];
    const br  = [0.85, 0.95, 1.00][stage];
    const sat = [0.70, 0.90, 1.00][stage];

    artWrap.style.setProperty("--gs", `${gs}`);
    artWrap.style.setProperty("--ct", `${ct}`);
    artWrap.style.setProperty("--br", `${br}`);
    artWrap.style.setProperty("--sat", `${sat}`);

    // layers on
    artImgA.style.opacity = "1";
    artImgB.style.opacity = "1";

    const gAlpha = [0.35, 0.22, 0.10][stage];
    artWrap.style.setProperty("--gAlpha", `${gAlpha}`);

    // slight offset + hue variation
    const off = [8, 4, 1][stage];
    artWrap.style.setProperty("--gdx", `${off}px`);
    artWrap.style.setProperty("--gdy", `${-off}px`);
    artWrap.style.setProperty("--ghue", `${[55, 25, 0][stage]}deg`);

    // give layer B opposite shift
    artImgB.style.transform = `translate(${-off}px, ${off}px)`;
    artImgB.style.filter = `hue-rotate(${-([55,25,0][stage])}deg) contrast(1.15) saturate(1.25)`;
    artImgB.style.mixBlendMode = "screen";
    artImgA.style.mixBlendMode = "screen";
    return;
  }

  // Canvas effects (pixel/poster) -> si CORS bloque, on fallback automatique vers blur
  if (id === "pixel" || id === "poster") {
    artWrap.classList.add("use-canvas");
    const img = artWrap._loadedImage;

    try {
      if (id === "pixel") {
        const samples = [18, 42, 95][stage];
        renderPixelated(img, samples);
      } else {
        const levels = [3, 7, 16][stage];
        renderPosterize(img, levels);
      }
    } catch (e) {
      // fallback
      currentEffect = EFFECTS.find(x => x.id === "blur") || currentEffect;
      applyStage();
    }
    return;
  }
}

// ====== Stage progression ======
function advanceStage(reason) {
  if (gameEnded) return;

  // stage 0->1->2->lose
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
    // déjà en manche 3 -> perdre
    loseRound(reason === "wrong" ? "❌ Mauvaise réponse." : "⏭️ Passé.");
  }
}

// ====== End round ======
function endRound(roundScore, won, messageHtml) {
  gameEnded = true;

  // afficher l’image normale (sans effet)
  clearEffectClasses();
  artWrap.className = "art-wrap";
  artImg.style.opacity = "1";

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);

  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  nextBtn.disabled = false;
  nextBtn.style.display = "inline-block";
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
  if (ok) {
    winRound();
    return;
  }

  // mauvais -> manche suivante (ou perdu si déjà manche 3)
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
  const matches = titles
    .filter(t => t.toLowerCase().includes(val))
    .slice(0, 7);

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

  // activer submit si titre exact (insensible à la casse)
  submitBtn.disabled = !titles.map(t => t.toLowerCase()).includes(val);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) {
    checkGuess();
  }
});

submitBtn.addEventListener("click", checkGuess);

// nextBtn sert de "Suivant" pendant le round (branché dans applyStage / endRound)

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

  // garder ratio
  const ratio = h / w;
  off.width = Math.max(8, samples);
  off.height = Math.max(8, Math.floor(samples * ratio));

  offCtx.imageSmoothingEnabled = true;
  offCtx.clearRect(0, 0, off.width, off.height);
  offCtx.drawImage(img, 0, 0, off.width, off.height);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);
}

function renderPosterize(img, levels) {
  fitCanvasToWrap();
  const ctx = artCanvas.getContext("2d", { willReadFrequently: true });
  const w = artCanvas.width;
  const h = artCanvas.height;

  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // peut throw si canvas "tainted"
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const step = 255 / Math.max(1, (levels - 1));
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.round(data[i] / step) * step;     // R
    data[i + 1] = Math.round(data[i + 1] / step) * step; // G
    data[i + 2] = Math.round(data[i + 2] / step) * step; // B
    // alpha untouched
  }
  ctx.putImageData(imageData, 0, 0);
}

window.addEventListener("resize", () => {
  // re-render canvas / overlays à la bonne taille
  if (!gameEnded && currentAnime && currentEffect && artWrap) {
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
        _titleLower: title.toLowerCase(),
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
