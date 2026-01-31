// ===============================
// ANIDLE — script.js (UPGRADED + PARCOURS READY)
// ✅ Supporte Mode Parcours : ?parcours=1&count=XX
// ✅ Récupère la personnalisation globale depuis localStorage["AG_parcours_filters"]
// ✅ Ignore le menu de personnalisation en parcours (lance direct)
// ✅ En fin d'étape : parent.postMessage({parcoursScore:{label,score,total}}, "*")
// ✅ Autocomplete filtrée par indices + navigation clavier
// ✅ Indices alignés (via HTML .indices-grid)
// ✅ Sauvegarde config locale en mode normal
// ===============================

/* ===============================
   CONSTANTES
================================= */
const MAX_SCORE = 3000;
const TENTATIVE_COST = 150;
const INDICE_COST = 300;

const MIN_REQUIRED = 64;

// Rounds en parcours (count)
const ROUNDS_MIN = 1;
const ROUNDS_MAX = 100;

// Clé config globale Parcours
const PARCOURS_CFG_KEY = "AG_parcours_filters";

// Clé config locale (mode normal)
const LOCAL_CFG_KEY = "ANIDLE_filters_v1";

/* ===============================
   MODE PARCOURS (URL)
================================= */
const urlParams = new URLSearchParams(window.location.search);
const IS_PARCOURS = urlParams.get("parcours") === "1";

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
const PARCOURS_COUNT = IS_PARCOURS ? clampInt(urlParams.get("count"), ROUNDS_MIN, ROUNDS_MAX, 1) : 1;

/* ===============================
   THEME + MENU
================================= */
const backBtn = document.getElementById("back-to-menu");
if (backBtn) {
  if (IS_PARCOURS) {
    backBtn.style.display = "none";
  } else {
    backBtn.addEventListener("click", () => {
      window.location.href = "../index.html";
    });
  }
}

document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});
window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") document.body.classList.add("light");
});

/* ===============================
   TOOLTIP AIDE
================================= */
document.addEventListener("pointerdown", (e) => {
  const wrap = e.target.closest(".info-wrap");

  if (wrap && e.target.closest(".info-icon")) {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.toggle("open");
    return;
  }
  document.querySelectorAll(".info-wrap.open").forEach((w) => w.classList.remove("open"));
});

/* ===============================
   HELPERS DATASET
================================= */
function normalizeAnimeList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.animes)) return json.animes;
  return [];
}
function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}
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
  const s = String(a.season || "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function normStr(s) {
  return String(s || "").trim().toLowerCase();
}

/* ===============================
   UI HELPERS
================================= */
function clampYearSliders() {
  const minEl = document.getElementById("yearMin");
  const maxEl = document.getElementById("yearMax");
  if (!minEl || !maxEl) return;

  let a = parseInt(minEl.value, 10);
  let b = parseInt(maxEl.value, 10);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = 0;

  if (a > b) {
    [a, b] = [b, a];
    minEl.value = String(a);
    maxEl.value = String(b);
  }
}

function clampRoundsValue() {
  const el = document.getElementById("roundCount");
  if (!el) return 1;
  let v = parseInt(el.value, 10);
  if (!Number.isFinite(v) || v < ROUNDS_MIN) v = ROUNDS_MIN;
  if (v > ROUNDS_MAX) v = ROUNDS_MAX;
  el.value = String(v);
  return v;
}

function setPillActive(btn, isActive) {
  btn.classList.toggle("active", !!isActive);
  btn.setAttribute("aria-pressed", isActive ? "true" : "false");
}

function ensureDefaultTypes() {
  const pills = Array.from(document.querySelectorAll(".pill[data-type]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  // sécurité: si rien n'est sélectionné, on active TV + Movie
  pills.forEach((b) => {
    const t = b.dataset.type;
    const should = t === "TV" || t === "Movie";
    setPillActive(b, should);
  });
}

/* ===============================
   MODE (prévu futur) — Anidle = anime only
================================= */
let contentMode = "anime";
function initModeUI() {
  const modeBtns = Array.from(document.querySelectorAll("#modePills .pill[data-mode]"));
  if (!modeBtns.length) return;

  modeBtns.forEach((b) => {
    const m = b.dataset.mode;
    setPillActive(b, m === contentMode);
    if (b.disabled) b.setAttribute("aria-disabled", "true");

    b.addEventListener("click", () => {
      if (b.disabled) return;
      const next = b.dataset.mode;
      if (!next || next === contentMode) return;
      contentMode = next;
      modeBtns.forEach((x) => setPillActive(x, x.dataset.mode === contentMode));
      updatePreview();
    });
  });
}

/* ===============================
   GLOBAL DATA
================================= */
let allAnimes = [];
let filteredBase = [];
let targetAnime = null;

/* ===============================
   MULTI-ROUNDS STATE
================================= */
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

/* ===============================
   GAME STATE
================================= */
let attemptCount = 0;
let gameOver = false;

let indicesActivated = { studio: false, saison: false, genres: false, score: false };
let indicesAvailable = { studio: false, saison: false, genres: false, score: false };

let indicesGenresFound = [];
let indicesYearAtActivation = null;
let indicesStudioAtActivation = null;
let indicesScoreRange = null;
let indicesGenresFoundSet = new Set();
let indicesScoreRangeActivation = [0, 0];

/* ===============================
   UI TOGGLE (perso vs jeu)
================================= */
function showCustomization() {
  document.body.classList.remove("game-started");
}
function showGame() {
  document.body.classList.add("game-started");
}

/* ===============================
   CONFIG (Parcours + Local)
================================= */
function loadParcoursConfig() {
  try {
    const raw = localStorage.getItem(PARCOURS_CFG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    return cfg && typeof cfg === "object" ? cfg : null;
  } catch {
    return null;
  }
}

function getParcoursConfigWithFallback() {
  const cfg = loadParcoursConfig() || {};
  const yearMin = Number.isFinite(+cfg.yearMin) ? +cfg.yearMin : 1950;
  const yearMax = Number.isFinite(+cfg.yearMax) ? +cfg.yearMax : 2026;

  const types = Array.isArray(cfg.types) ? cfg.types.filter(Boolean) : [];
  const safeTypes = types.length ? types : ["TV", "Movie"];

  return {
    popPercent: Number.isFinite(+cfg.popPercent) ? +cfg.popPercent : 30,
    scorePercent: Number.isFinite(+cfg.scorePercent) ? +cfg.scorePercent : 100,
    yearMin: Math.min(yearMin, yearMax),
    yearMax: Math.max(yearMin, yearMax),
    types: safeTypes,
  };
}

// local (normal)
function saveLocalConfig(cfg) {
  try { localStorage.setItem(LOCAL_CFG_KEY, JSON.stringify(cfg)); } catch {}
}
function loadLocalConfig() {
  try {
    const raw = localStorage.getItem(LOCAL_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function applyLocalConfigToUI(cfg) {
  if (!cfg || typeof cfg !== "object") return;

  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");
  const rounds = document.getElementById("roundCount");

  if (pop && Number.isFinite(+cfg.popPercent)) pop.value = String(clampInt(cfg.popPercent, 5, 100, 30));
  if (score && Number.isFinite(+cfg.scorePercent)) score.value = String(clampInt(cfg.scorePercent, 5, 100, 100));
  if (yMin && Number.isFinite(+cfg.yearMin)) yMin.value = String(clampInt(cfg.yearMin, 1950, 2026, 1950));
  if (yMax && Number.isFinite(+cfg.yearMax)) yMax.value = String(clampInt(cfg.yearMax, 1950, 2026, 2026));
  if (rounds && Number.isFinite(+cfg.roundCount)) rounds.value = String(clampInt(cfg.roundCount, 1, 100, 1));

  const types = Array.isArray(cfg.types) ? cfg.types : [];
  if (types.length) {
    document.querySelectorAll(".pill[data-type]").forEach((b) => {
      const on = types.includes(b.dataset.type);
      setPillActive(b, on);
    });
  }

  clampYearSliders();
  ensureDefaultTypes();
}

/* ===============================
   APPLY FILTERS (core)
================================= */
function applyFiltersCore({ popPercent, scorePercent, yearMin, yearMax, types }) {
  if (!types || !types.length) return [];

  let pool = allAnimes.filter((a) => a._year >= yearMin && a._year <= yearMax && types.includes(a._type));

  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

function applyFiltersFromUI() {
  const popPercent = parseInt(document.getElementById("popPercent")?.value || "30", 10);
  const scorePercent = parseInt(document.getElementById("scorePercent")?.value || "100", 10);
  const yearMin = parseInt(document.getElementById("yearMin")?.value || "1950", 10);
  const yearMax = parseInt(document.getElementById("yearMax")?.value || "2026", 10);

  const allowedTypes = [...document.querySelectorAll(".pill[data-type].active")].map((b) => b.dataset.type);
  if (!allowedTypes.length) return [];

  return applyFiltersCore({
    popPercent,
    scorePercent,
    yearMin: Math.min(yearMin, yearMax),
    yearMax: Math.max(yearMin, yearMax),
    types: allowedTypes,
  });
}

function applyFiltersFromConfig(cfg) {
  const popPercent = clampInt(cfg.popPercent, 5, 100, 30);
  const scorePercent = clampInt(cfg.scorePercent, 5, 100, 100);
  const yearMin = clampInt(cfg.yearMin, 1900, 2100, 1950);
  const yearMax = clampInt(cfg.yearMax, 1900, 2100, 2026);
  const types = Array.isArray(cfg.types) && cfg.types.length ? cfg.types : ["TV", "Movie"];

  return applyFiltersCore({
    popPercent,
    scorePercent,
    yearMin: Math.min(yearMin, yearMax),
    yearMax: Math.max(yearMin, yearMax),
    types,
  });
}

/* ===============================
   PREVIEW COUNT (NORMAL)
================================= */
function updatePreview() {
  const preview = document.getElementById("previewCount");
  const btn = document.getElementById("applyFiltersBtn");

  ensureDefaultTypes();
  const pool = applyFiltersFromUI();
  const ok = pool.length >= MIN_REQUIRED;

  if (preview) {
    preview.textContent = `📚 Titres disponibles : ${pool.length} ${ok ? "(OK)" : `(Min ${MIN_REQUIRED})`}`;
    preview.classList.toggle("good", ok);
    preview.classList.toggle("bad", !ok);
  }
  if (btn) btn.disabled = !ok;
}

/* ===============================
   INIT PERSONNALISATION (NORMAL)
================================= */
function initPersonalisationUI() {
  initModeUI();

  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yMinVal = document.getElementById("yearMinVal");
  const yMaxVal = document.getElementById("yearMaxVal");

  const roundInput = document.getElementById("roundCount");
  if (roundInput) {
    roundInput.addEventListener("input", () => clampRoundsValue());
    clampRoundsValue();
  }

  const saved = loadLocalConfig();
  if (saved) applyLocalConfigToUI(saved);

  function syncLabels() {
    clampYearSliders();
    if (popVal && pop) popVal.textContent = pop.value;
    if (scoreVal && score) scoreVal.textContent = score.value;
    if (yMinVal && yMin) yMinVal.textContent = yMin.value;
    if (yMaxVal && yMax) yMaxVal.textContent = yMax.value;
    updatePreview();
  }

  [pop, score, yMin, yMax].forEach((el) => el && el.addEventListener("input", syncLabels));

  document.querySelectorAll(".pill[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = !btn.classList.contains("active");
      setPillActive(btn, next);

      const active = document.querySelectorAll(".pill[data-type].active");
      if (active.length === 0) ensureDefaultTypes();

      updatePreview();
    });
  });

  ensureDefaultTypes();

  document.getElementById("applyFiltersBtn")?.addEventListener("click", () => {
    filteredBase = applyFiltersFromUI();

    if (filteredBase.length < MIN_REQUIRED) {
      alert(`Pas assez de titres pour lancer (${filteredBase.length}/${MIN_REQUIRED}).`);
      return;
    }

    // save config locale
    const yearMin = parseInt(yMin?.value || "1950", 10);
    const yearMax = parseInt(yMax?.value || "2026", 10);
    const types = [...document.querySelectorAll(".pill[data-type].active")].map((b) => b.dataset.type);
    saveLocalConfig({
      popPercent: parseInt(pop?.value || "30", 10),
      scorePercent: parseInt(score?.value || "100", 10),
      yearMin: Math.min(yearMin, yearMax),
      yearMax: Math.max(yearMin, yearMax),
      types,
      roundCount: clampRoundsValue(),
    });

    totalRounds = clampRoundsValue();
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewGame();
  });

  syncLabels();
  showCustomization();
}

/* ===============================
   INIT PARCOURS
================================= */
function showParcoursConfigError(msg) {
  showGame();

  const container = document.getElementById("successContainer") || document.getElementById("results") || document.body;
  if (!container) return;

  const box = document.createElement("div");
  box.className = "parcours-error-box";
  box.innerHTML = `
    <div class="parcours-error-title">❌ Parcours impossible</div>
    <div class="parcours-error-msg">${msg}</div>
    <div class="parcours-error-actions">
      <button class="menu-btn" id="parcoursGoBackBtn" style="padding:0.75rem 1.2rem;">↩️ Retour au Parcours</button>
    </div>
  `;

  if (container === document.body) document.body.prepend(box);
  else {
    container.innerHTML = "";
    container.appendChild(box);
    if (container.style) container.style.display = "block";
  }

  document.getElementById("parcoursGoBackBtn")?.addEventListener("click", () => {
    try { window.top.location.href = "../Parcours/index.html"; }
    catch { window.location.href = "../Parcours/index.html"; }
  });
}

function initParcoursRun() {
  const cfg = getParcoursConfigWithFallback();
  filteredBase = applyFiltersFromConfig(cfg);

  if (filteredBase.length < MIN_REQUIRED) {
    showParcoursConfigError(
      `Ta personnalisation globale donne seulement <b>${filteredBase.length}</b> titres pour Anidle (min ${MIN_REQUIRED}).<br>
       Ajuste la personnalisation globale du Parcours (années/types/popularité/score) puis relance.`
    );
    return;
  }

  totalRounds = PARCOURS_COUNT;
  currentRound = 1;
  totalScore = 0;

  showGame();
  startNewGame();
}

/* ===============================
   SCORE BAR
================================= */
function computeRoundScore() {
  const indiceCount = Object.values(indicesActivated).filter(Boolean).length;
  let score = MAX_SCORE - attemptCount * TENTATIVE_COST - indiceCount * INDICE_COST;
  score = Math.max(0, Math.min(score, MAX_SCORE));
  return score;
}

function resetScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");
  if (scoreBar) scoreBar.style.width = "100%";
  if (scoreBarLabel) scoreBarLabel.textContent = `${MAX_SCORE} / ${MAX_SCORE}`;
}

function updateScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");

  const score = computeRoundScore();
  const width = (score / MAX_SCORE) * 100;

  if (scoreBar) scoreBar.style.width = width + "%";
  if (scoreBarLabel) scoreBarLabel.textContent = `${score} / ${MAX_SCORE}`;

  const percent = score / MAX_SCORE;
  if (scoreBar) {
    if (percent > 0.66) scoreBar.style.background = "linear-gradient(90deg,#7ee787,#3b82f6 90%)";
    else if (percent > 0.33) scoreBar.style.background = "linear-gradient(90deg,#ffd700,#ff9800 90%)";
    else scoreBar.style.background = "linear-gradient(90deg,#ef4444,#f59e42 90%)";

    if (score < 1000) scoreBar.classList.add("danger-pulse");
    else scoreBar.classList.remove("danger-pulse");
  }
}

/* ===============================
   START GAME
================================= */
function startNewGame() {
  if (!filteredBase.length) return;

  targetAnime = filteredBase[Math.floor(Math.random() * filteredBase.length)];

  attemptCount = 0;
  gameOver = false;

  indicesActivated = { studio: false, saison: false, genres: false, score: false };
  indicesAvailable = { studio: false, saison: false, genres: false, score: false };

  indicesGenresFound = [];
  indicesGenresFoundSet = new Set();
  indicesYearAtActivation = null;
  indicesStudioAtActivation = null;
  indicesScoreRange = null;
  indicesScoreRangeActivation = [0, 0];

  // reset suggestion state
  closeSuggestions(true);

  const input = document.getElementById("animeInput");
  const results = document.getElementById("results");
  const counter = document.getElementById("counter");
  const successContainer = document.getElementById("successContainer");
  const aide = document.getElementById("aideContainer");

  if (input) {
    input.value = "";
    input.disabled = false;
    input.setAttribute("aria-expanded", "false");
  }
  if (results) results.innerHTML = "";
  if (counter) counter.textContent = "Tentatives : 0 (-150)";
  if (successContainer) {
    successContainer.style.display = "none";
    successContainer.innerHTML = "";
  }
  if (aide) aide.innerHTML = "";

  ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = true;
      btn.classList.remove("used");
    }
  });

  resetScoreBar();
  updateAideList();
  updateScoreBar();
}

/* ===============================
   INDICES BUTTONS
================================= */
document.getElementById("btnIndiceStudio")?.addEventListener("click", function () {
  if (!indicesAvailable.studio || indicesActivated.studio) return;
  indicesActivated.studio = true;
  indicesStudioAtActivation = targetAnime?.studio || null;
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceSaison")?.addEventListener("click", function () {
  if (!indicesAvailable.saison || indicesActivated.saison) return;
  indicesActivated.saison = true;
  indicesYearAtActivation = String(targetAnime?._year || "");
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceGenres")?.addEventListener("click", function () {
  if (!indicesAvailable.genres || indicesActivated.genres) return;
  indicesActivated.genres = true;
  indicesGenresFound = [...indicesGenresFoundSet];
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceScore")?.addEventListener("click", function () {
  if (!indicesAvailable.score || indicesActivated.score) return;
  indicesActivated.score = true;
  indicesScoreRange = indicesScoreRangeActivation.slice();
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

/* ===============================
   POOL FILTRÉ PAR INDICES
================================= */
function getIndiceFilteredPool() {
  let filtered = filteredBase;

  if (indicesActivated.studio && indicesStudioAtActivation) {
    filtered = filtered.filter((a) => (a.studio || "") === indicesStudioAtActivation);
  }
  if (indicesActivated.saison && indicesYearAtActivation) {
    filtered = filtered.filter((a) => String(a._year) === String(indicesYearAtActivation));
  }
  if (indicesActivated.genres && indicesGenresFound.length > 0) {
    filtered = filtered.filter((a) => {
      const allG = [...(a.genres || []), ...(a.themes || [])];
      return indicesGenresFound.every((x) => allG.includes(x));
    });
  }
  if (indicesActivated.score && indicesScoreRange) {
    filtered = filtered.filter((a) => a._score >= indicesScoreRange[0] && a._score <= indicesScoreRange[1]);
  }

  return filtered;
}

/* ===============================
   AUTOCOMPLETE (filtrée + clavier)
================================= */
let suggestItems = [];
let suggestIndex = -1;

function closeSuggestions(hard = false) {
  const box = document.getElementById("suggestions");
  const input = document.getElementById("animeInput");
  if (!box || !input) return;

  box.innerHTML = "";
  suggestItems = [];
  suggestIndex = -1;

  if (hard) input.value = input.value; // no-op (force stable)
  input.setAttribute("aria-expanded", "false");
}

function renderSuggestions(list, query) {
  const box = document.getElementById("suggestions");
  const input = document.getElementById("animeInput");
  if (!box || !input) return;

  box.innerHTML = "";
  suggestItems = list.slice();
  suggestIndex = -1;

  if (!suggestItems.length) {
    input.setAttribute("aria-expanded", "false");
    return;
  }

  input.setAttribute("aria-expanded", "true");

  suggestItems.forEach((anime, i) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.setAttribute("role", "option");
    div.dataset.index = String(i);

    // petit highlight simple
    const t = anime._title;
    const q = normStr(query);
    if (q && normStr(t).includes(q)) {
      const idx = normStr(t).indexOf(q);
      const before = t.slice(0, idx);
      const mid = t.slice(idx, idx + q.length);
      const after = t.slice(idx + q.length);
      div.innerHTML = `${before}<span class="suggestion-hit">${mid}</span>${after}`;
    } else {
      div.textContent = t;
    }

    div.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      submitGuess(anime);
    });

    box.appendChild(div);
  });
}

function rankSuggestions(pool, q) {
  const query = normStr(q);
  if (!query) return [];

  const matches = pool.filter((a) => a._titleLower.includes(query));

  matches.sort((a, b) => {
    const at = a._titleLower;
    const bt = b._titleLower;

    const aStart = at.startsWith(query) ? 0 : 1;
    const bStart = bt.startsWith(query) ? 0 : 1;
    if (aStart !== bStart) return aStart - bStart;

    const aPos = at.indexOf(query);
    const bPos = bt.indexOf(query);
    if (aPos !== bPos) return aPos - bPos;

    // tie-break léger
    return (b._members - a._members);
  });

  return matches.slice(0, 8);
}

document.getElementById("animeInput")?.addEventListener("input", function () {
  if (gameOver) return;

  const q = this.value.trim();
  if (!q) {
    closeSuggestions();
    return;
  }

  const pool = getIndiceFilteredPool();
  const ranked = rankSuggestions(pool, q);
  renderSuggestions(ranked, q);
});

document.getElementById("animeInput")?.addEventListener("keydown", function (e) {
  const box = document.getElementById("suggestions");
  const has = suggestItems.length > 0;

  if (e.key === "Escape") {
    closeSuggestions();
    return;
  }

  if (!has) {
    if (e.key === "Enter") {
      e.preventDefault();
      guessFromInput();
    }
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    suggestIndex = Math.min(suggestIndex + 1, suggestItems.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    suggestIndex = Math.max(suggestIndex - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (suggestIndex >= 0 && suggestItems[suggestIndex]) submitGuess(suggestItems[suggestIndex]);
    else guessFromInput();
    return;
  } else {
    return;
  }

  if (!box) return;
  [...box.querySelectorAll(".suggestion-item")].forEach((el, i) => {
    el.classList.toggle("active", i === suggestIndex);
  });

  const active = box.querySelector(".suggestion-item.active");
  if (active) active.scrollIntoView({ block: "nearest" });
});

document.addEventListener("pointerdown", (e) => {
  const input = document.getElementById("animeInput");
  const box = document.getElementById("suggestions");
  if (!input || !box) return;

  const inside = e.target === input || box.contains(e.target);
  if (!inside) closeSuggestions();
});

/* ===============================
   GUESS
================================= */
function guessFromInput() {
  if (gameOver) return;

  const inputEl = document.getElementById("animeInput");
  if (!inputEl) return;

  const val = normStr(inputEl.value);
  const pool = getIndiceFilteredPool();

  // exact match
  let guessed = pool.find((a) => a._titleLower === val);

  // fallback: si pas exact, on prend la meilleure suggestion affichée (si existe)
  if (!guessed && suggestItems.length) guessed = suggestItems[0];

  if (!guessed) {
    alert("Anime non trouvé !");
    return;
  }

  submitGuess(guessed);
}

function submitGuess(guessedAnime) {
  if (gameOver || !guessedAnime || !targetAnime) return;

  const inputEl = document.getElementById("animeInput");
  const counter = document.getElementById("counter");
  const results = document.getElementById("results");

  if (!inputEl || !results) return;

  attemptCount++;
  if (counter) counter.textContent = `Tentatives : ${attemptCount} (-150)`;

  // 1) Studio
  if (!indicesActivated.studio && guessedAnime.studio && guessedAnime.studio === targetAnime.studio) {
    indicesAvailable.studio = true;
    document.getElementById("btnIndiceStudio") && (document.getElementById("btnIndiceStudio").disabled = false);
  }

  // 2) Année
  if (!indicesActivated.saison && String(guessedAnime._year) === String(targetAnime._year)) {
    indicesAvailable.saison = true;
    document.getElementById("btnIndiceSaison") && (document.getElementById("btnIndiceSaison").disabled = false);
  }

  // 3) Genres/Thèmes
  const allGuessed = [...(guessedAnime.genres || []), ...(guessedAnime.themes || [])];
  const allTarget = [...(targetAnime.genres || []), ...(targetAnime.themes || [])];

  allGuessed.forEach((g) => {
    if (allTarget.includes(g) && !indicesGenresFoundSet.has(g)) indicesGenresFoundSet.add(g);
  });

  if (!indicesActivated.genres && indicesGenresFoundSet.size > 0) {
    indicesAvailable.genres = true;
    document.getElementById("btnIndiceGenres") && (document.getElementById("btnIndiceGenres").disabled = false);
  }

  // 4) Score (+/-0.30)
  const gScore = guessedAnime._score;
  const tScore = targetAnime._score || 0;

  let isClose = false;
  if (gScore === tScore) {
    isClose = true;
    indicesScoreRangeActivation = [gScore - 0.3, gScore + 0.3];
  } else if (Math.abs(gScore - tScore) <= 0.3) {
    isClose = true;
    indicesScoreRangeActivation = [Math.min(gScore, tScore) - 0.3, Math.max(gScore, tScore) + 0.3];
  }

  if (!indicesActivated.score && isClose) {
    indicesAvailable.score = true;
    document.getElementById("btnIndiceScore") && (document.getElementById("btnIndiceScore").disabled = false);
  }

  // --- Affichage résultat ---
  if (attemptCount === 1) {
    const header = document.createElement("div");
    header.className = "header-row";

    const defs = [
      { label: "Image", cls: "header-cell header-image" },
      { label: "Titre", cls: "header-cell header-title" },
      { label: "Année", cls: "header-cell header-season" },
      { label: "Studio", cls: "header-cell header-studio" },
      { label: "Genres / Thèmes", cls: "header-cell header-genre" },
      { label: "Score", cls: "header-cell header-score" },
    ];

    defs.forEach((d) => {
      const cell = document.createElement("div");
      cell.className = d.cls;
      cell.textContent = d.label;
      header.appendChild(cell);
    });

    results.appendChild(header);
  }

  const row = document.createElement("div");
  row.classList.add("row");

  // Image
  const cellImage = document.createElement("div");
  cellImage.classList.add("cell", "cell-image");
  const img = document.createElement("img");
  img.src = guessedAnime.image;
  img.alt = guessedAnime._title;
  img.style.width = "100px";
  cellImage.appendChild(img);
  row.appendChild(cellImage);

  // Title
  const cellTitle = document.createElement("div");
  cellTitle.classList.add("cell", "cell-title");
  const isTitleMatch = guessedAnime.mal_id === targetAnime.mal_id;
  cellTitle.classList.add(isTitleMatch ? "green" : "red");
  cellTitle.textContent = guessedAnime._title;
  row.appendChild(cellTitle);

  // Year
  const cellYear = document.createElement("div");
  cellYear.classList.add("cell", "cell-season");
  if (guessedAnime._year === targetAnime._year) {
    cellYear.classList.add("green");
    cellYear.textContent = `✅ ${guessedAnime._year}`;
  } else {
    cellYear.classList.add("red");
    cellYear.textContent = guessedAnime._year < targetAnime._year ? `🔼 ${guessedAnime._year}` : `${guessedAnime._year} 🔽`;
  }
  row.appendChild(cellYear);

  // Studio
  const cellStudio = document.createElement("div");
  cellStudio.classList.add("cell", "cell-studio");
  const isStudioMatch = (guessedAnime.studio || "") === (targetAnime.studio || "");
  cellStudio.classList.add(isStudioMatch ? "green" : "red");
  cellStudio.textContent = guessedAnime.studio || "—";
  row.appendChild(cellStudio);

  // Genres
  const cellGenres = document.createElement("div");
  cellGenres.classList.add("cell", "cell-genre");

  if (isTitleMatch) {
    cellGenres.classList.add("green");
    cellGenres.innerHTML = allGuessed.length ? allGuessed.join("<br>") : "—";
  } else {
    const guessedSet = new Set(allGuessed.map(normStr).filter(Boolean));
    const targetSet = new Set(allTarget.map(normStr).filter(Boolean));
    const common = [...guessedSet].filter((x) => targetSet.has(x));

    const isExactSame = guessedSet.size === targetSet.size && [...guessedSet].every((x) => targetSet.has(x));

    if (isExactSame) cellGenres.classList.add("green");
    else if (common.length > 0) cellGenres.classList.add("orange");
    else cellGenres.classList.add("red");

    cellGenres.innerHTML = allGuessed.length ? allGuessed.join("<br>") : "—";
  }
  row.appendChild(cellGenres);

  // Score
  const cellScore = document.createElement("div");
  cellScore.classList.add("cell", "cell-score");
  if (gScore === tScore) {
    cellScore.classList.add("green");
    cellScore.textContent = `✅ ${gScore}`;
  } else if (Math.abs(gScore - tScore) <= 0.3) {
    cellScore.classList.add("orange");
    cellScore.textContent = gScore < tScore ? `🟧🔼 ${gScore}` : `🟧 ${gScore} 🔽`;
  } else {
    cellScore.classList.add("red");
    cellScore.textContent = gScore < tScore ? `🔼 ${gScore}` : `${gScore} 🔽`;
  }
  row.appendChild(cellScore);

  // ✅ Dernier guess en haut (juste sous le header)
   const headerRow = results.querySelector(".header-row");
   if (headerRow) {
     const firstGuessRow = headerRow.nextElementSibling; // 1ère ligne de guess existante
     results.insertBefore(row, firstGuessRow);           // on insère avant => donc tout en haut
   } else {
     results.appendChild(row);
   }

  // cleanup
  inputEl.value = "";
  closeSuggestions();
  updateAideList();
  updateScoreBar();

  if (isTitleMatch) {
    gameOver = true;
    inputEl.disabled = true;

    ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = true;
    });

    showSuccessMessage();
    launchFireworks();
  }
}

/* ===============================
   AIDE LIST (sécurisée + limit)
================================= */
function updateAideList() {
  const aideDiv = document.getElementById("aideContainer");
  if (!aideDiv) return;

  const pool = getIndiceFilteredPool().slice();
  shuffleInPlace(pool);

  const MAX_AIDE = 60;
  const list = pool.slice(0, MAX_AIDE);

  aideDiv.innerHTML = "";

  const h3 = document.createElement("h3");
  h3.textContent = "🔍 Suggestions";
  aideDiv.appendChild(h3);

  const meta = document.createElement("div");
  meta.className = "aide-meta";
  meta.textContent = `Pool actuel : ${pool.length} titres`;
  aideDiv.appendChild(meta);

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "aide-empty";
    empty.textContent = "Aucune suggestion avec ces indices.";
    aideDiv.appendChild(empty);
    return;
  }

  const ul = document.createElement("ul");
  list.forEach((a) => {
    const li = document.createElement("li");
    li.textContent = a._title;
    li.addEventListener("click", () => submitGuess(a));
    ul.appendChild(li);
  });
  aideDiv.appendChild(ul);
}

/* ===============================
   CONFETTIS
================================= */
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
  for (let i = 0; i < 110; i++) particles.push(createParticle(canvas.width / 2, canvas.height / 2));

  function animate() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.10)";
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

    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    if (particles.length > 0) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

/* ===============================
   VICTOIRE + MULTI-ROUNDS + PARCOURS
================================= */
let parcoursPosted = false;
function postParcoursScore() {
  if (parcoursPosted) return;
  parcoursPosted = true;

  const payload = {
    label: "Anidle",
    score: totalScore,
    total: totalRounds * MAX_SCORE,
  };

  try {
    window.parent?.postMessage({ parcoursScore: payload }, "*");
  } catch (e) {
    console.error("postMessage failed:", e);
  }
}

function showSuccessMessage() {
  const container = document.getElementById("successContainer");
  if (!container) return;

  const roundScore = computeRoundScore();
  totalScore += roundScore;

  const hasNext = currentRound < totalRounds;

  const ctaLabel = hasNext
    ? "➡️ Round suivant"
    : (IS_PARCOURS ? "✅ Continuer le parcours" : "✅ Terminer");

  container.innerHTML = `
    <div id="winMessage" style="margin-bottom: 18px; font-size: 2rem; font-weight: bold; text-align: center;">
      🎇 <span style="font-size:2.3rem;">🥳</span>
      Bravo ! C'était <u>${targetAnime?._title || "?"}</u> en ${attemptCount} tentative${attemptCount > 1 ? "s" : ""}.
      <span style="font-size:2.3rem;">🎉</span>

      <div style="margin-top:10px; font-size:1.2rem; opacity:0.92;">
        Round ${currentRound} / ${totalRounds} — Score du round : <b>${roundScore}</b> / ${MAX_SCORE}
      </div>

      <div style="margin-top:8px; font-size:1.05rem; opacity:0.9;">
        Total : <b>${totalScore}</b> / ${totalRounds * MAX_SCORE}
      </div>

      <div style="margin-top:14px; display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
        <button id="nextRoundBtn" class="menu-btn" style="padding:0.75rem 1.2rem; font-size:1.05rem;">
          ${ctaLabel}
        </button>
      </div>
    </div>
  `;

  container.style.display = "block";
  container.scrollIntoView({ behavior: "smooth", block: "start" });

  const nextBtn = document.getElementById("nextRoundBtn");
  if (!nextBtn) return;

  nextBtn.onclick = () => {
    if (currentRound < totalRounds) {
      currentRound += 1;
      startNewGame();
      return;
    }

    if (IS_PARCOURS) {
      postParcoursScore();
      const input = document.getElementById("animeInput");
      if (input) input.disabled = true;
      nextBtn.disabled = true;
      nextBtn.textContent = "✅ Envoyé";
      return;
    }

    showCustomization();

    const results = document.getElementById("results");
    const aide = document.getElementById("aideContainer");
    const input = document.getElementById("animeInput");
    closeSuggestions();
    if (results) results.innerHTML = "";
    if (aide) aide.innerHTML = "";
    if (input) input.value = "";
  };
}

/* ===============================
   LOAD DATASET + BOOT
================================= */
fetch("../data/licenses_only.json")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then((json) => {
    const raw = normalizeAnimeList(json);

    allAnimes = (Array.isArray(raw) ? raw : []).map((a) => {
      const title = getDisplayTitle(a);
      return {
        ...a,
        _title: title,
        _titleLower: normStr(title),
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
      };
    });

    if (IS_PARCOURS) {
      initParcoursRun();
    } else {
      initPersonalisationUI();
      updatePreview();
      showCustomization();
    }
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
    console.error(e);
  });

