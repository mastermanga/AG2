/**********************
 * Pixel Art (Fix)
 * - 3 manches : difficile -> moyen -> facile
 * - Pas de timer : avance sur guess raté OU bouton "Suivant"
 * - Effet random par round (reste le même sur les 3 manches)
 * - Fix : jamais d’image “en clair” pendant le jeu (classe .ready)
 * - Fix : overlays mosaic/blinds (pas de display:none inline)
 * - Effets beaucoup plus forts en manche 1
 **********************/

const MAX_SCORE = 3000;
const STAGE_SCORES = [3000, 2000, 1000];
const STAGE_NAMES = ["Difficile", "Moyen", "Facile"];
const MIN_TITLES_TO_START = 64;

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
let stage = 0; // 0..2
let gameEnded = false;

// art nodes
let artWrap = null;
let artImg = null;
let artImgA = null;
let artImgB = null;
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
  artWrap.className = "art-wrap"; // pas de .ready => rien n’apparait

  artImg = document.createElement("img");
  artImg.className = "art-img base";
  artImg.alt = "Cover anime";

  // glitch layers (cachées par CSS sauf .effect-glitch)
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

function resetVisualState() {
  if (!artWrap) return;

  // reset classes (on garde juste art-wrap, la visibilité se fait via .ready)
  artWrap.className = "art-wrap";

  // reset vars
  [
    "--blur","--scale","--dx","--dy","--zblur",
    "--gs","--ct","--br","--sat","--gAlpha","--ghue","--gdx","--gdy","--gblur"
  ].forEach(v => artWrap.style.removeProperty(v));

  // hide glitch layers
  artImgA.style.opacity = "0";
  artImgB.style.opacity = "0";
  artImgB.style.transform = "";

  // remove show classes (sans casser le DOM)
  overlayMosaic.querySelectorAll(".tile.show").forEach(x => x.classList.remove("show"));
  overlayBlinds.querySelectorAll(".strip.show").forEach(x => x.classList.remove("show"));
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

// ====== Load images ======
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // utile pour canvas si le serveur autorise
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
  feedback.className = "";

  zoomDx = (Math.random() * 2 - 1) * 120;
  zoomDy = (Math.random() * 2 - 1) * 120;

  try {
    const loaded = await loadImage(currentAnime.image);

    // set all sources
    artImg.src = loaded.src;
    artImgA.src = loaded.src;
    artImgB.src = loaded.src;
    artWrap._loadedImage = loaded;

    // build overlays only if needed
    buildOverlaysOnce();

    // APPLY effect + show (ready)
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

function buildOverlaysOnce() {
  overlayMosaic.innerHTML = "";
  overlayBlinds.innerHTML = "";
  mosaicOrder = [];
  blindsOrder = [];

  if (currentEffect.id === "mosaic") {
    const cols = 6, rows = 8; // 48 cases => plus dur
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

  if (currentEffect.id === "blinds") {
    const strips = 16; // plus dur
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

// ====== Apply stage ======
function applyStage() {
  if (!currentAnime || !currentEffect || !artWrap) return;

  resetVisualState();

  // score + info
  setScoreBar(currentPotentialScore());
  infoLine.textContent = `Manche ${stage + 1}/3 — ${STAGE_NAMES[stage]} — Effet : ${currentEffect.label}`;

  // set effect class
  artWrap.classList.add(`effect-${currentEffect.id}`);

  // bouton suivant
  if (!gameEnded) {
    nextBtn.textContent = "Suivant";
    nextBtn.onclick = () => advanceStage("skip");
  }

  const id = currentEffect.id;

  // ===== intensités plus violentes =====
  if (id === "blur") {
    const blur = [46, 22, 8][stage];
    artWrap.style.setProperty("--blur", `${blur}px`);
  }

  if (id === "zoom") {
    const scale = [7.2, 3.6, 1.6][stage];
    const mult  = [1.0, 0.55, 0.20][stage];
    const zblur = [3.5, 1.5, 0][stage];
    artWrap.style.setProperty("--scale", `${scale}`);
    artWrap.style.setProperty("--dx", `${zoomDx * mult}px`);
    artWrap.style.setProperty("--dy", `${zoomDy * mult}px`);
    artWrap.style.setProperty("--zblur", `${zblur}px`);
  }

  if (id === "mosaic") {
    const revealN = [1, 8, 22][stage]; // sur 48
    const tiles = overlayMosaic.querySelectorAll(".tile");
    for (let i = 0; i < Math.min(revealN, mosaicOrder.length); i++) {
      const idx = mosaicOrder[i];
      if (tiles[idx]) tiles[idx].classList.add("show");
    }
  }

  if (id === "blinds") {
    const revealN = [1, 4, 10][stage]; // sur 16
    const strips = overlayBlinds.querySelectorAll(".strip");
    for (let i = 0; i < Math.min(revealN, blindsOrder.length); i++) {
      const idx = blindsOrder[i];
      if (strips[idx]) strips[idx].classList.add("show");
    }
  }

  if (id === "glitch") {
    const gs    = [1.0, 0.75, 0.20][stage];
    const ct    = [2.35, 1.70, 1.12][stage];
    const br    = [0.72, 0.90, 1.00][stage];
    const sat   = [0.35, 0.75, 1.00][stage];
    const gblur = [2.2, 1.0, 0][stage];

    artWrap.style.setProperty("--gs", `${gs}`);
    artWrap.style.setProperty("--ct", `${ct}`);
    artWrap.style.setProperty("--br", `${br}`);
    artWrap.style.setProperty("--sat", `${sat}`);
    artWrap.style.setProperty("--gblur", `${gblur}px`);

    const gAlpha = [0.60, 0.34, 0.12][stage];
    artWrap.style.setProperty("--gAlpha", `${gAlpha}`);

    const off = [16, 8, 2][stage];
    artWrap.style.setProperty("--gdx", `${off}px`);
    artWrap.style.setProperty("--gdy", `${-off}px`);
    artWrap.style.setProperty("--ghue", `${[75, 35, 0][stage]}deg`);

    artImgA.style.opacity = "1";
    artImgB.style.opacity = "1";
    artImgB.style.transform = `translate(${-off}px, ${off}px)`;
  }

  if (id === "pixel" || id === "poster") {
    artWrap.classList.add("use-canvas");
    const img = artWrap._loadedImage;

    try {
      if (id === "pixel") {
        // plus pixelisé (plus petit = plus dur)
        const samples = [6, 14, 34][stage];
        renderPixelated(img, samples);
      } else {
        // poster très rude
        const levels = [2, 4, 8][stage];
        renderPosterize(img, levels);
      }
    } catch (e) {
      // fallback dur: blur si posterize bloqué par CORS
      currentEffect = EFFECTS.find(x => x.id === "blur") || currentEffect;
      applyStage();
      return;
    }
  }

  // FIN : on rend visible tout le bloc (évite le flash clair)
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
  resetVisualState();
  artWrap.className = "art-wrap ready";

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

/
