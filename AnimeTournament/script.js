// =======================
// Anime Tournament — script.js (COMPLET + FIX PARCOURS)
// - Thème contenu (pool EXACT 64) pour choisir les 32 items
// - "Libre" a la même chance que chaque autre critère (anime: 1/6 ; songs: 1/7)
// - Si un critère ne peut pas produire 64 => fallback "Libre"
// - STUDIO: pool “agrandi” en cumulant plusieurs studios jusqu'à atteindre 64 (sinon Libre)
// - Songs: start à 45s, durée 20s (extrait), autoplay gauche
//
// ✅ FIX PARCOURS
// - Autostart UNIQUEMENT après chargement dataset
// - Apply config parcours au DOM (sliders + pills + mode + rounds)
// - Si parcours => pas d'écran personnalisation du tournoi (autostart direct)
// - Back-to-menu => return URL si fourni
// =======================

// =======================
// CONFIG
// =======================
const DATA_URL = "../data/licenses_only.json";
const TOTAL_MATCH_ITEMS = 32;

const MIN_REQUIRED_TITLES = 64;
const MIN_REQUIRED_SONGS = 64;

const THEME_POOL_SIZE = 64;

// Songs snippet
const SONG_START_SEC = 45;
const SONG_PLAY_SEC = 20;

// retries vidéos
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const LOAD_TIMEOUT_MS = 6000;

// =======================
// PARCOURS SUPPORT (FIX)
// =======================
const URL_PARAMS = new URLSearchParams(window.location.search);

function truthyParam(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function detectParcours() {
  const from = (URL_PARAMS.get("from") || "").trim().toLowerCase();
  if (from === "parcours") return true;
  if (truthyParam(URL_PARAMS.get("parcours"))) return true;

  const keys = ["AG2_PARCOURS_ACTIVE", "ag2_parcours_active", "parcours_active", "AG2_PARCOURS"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (truthyParam(v)) return true;
  }
  return false;
}

const IS_PARCOURS = detectParcours();

function getReturnUrl() {
  const u = URL_PARAMS.get("return");
  if (u) {
    try { return decodeURIComponent(u); } catch { return u; }
  }
  const keys = ["AG2_PARCOURS_RETURN", "ag2_parcours_return", "parcours_return"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && String(v).trim()) return v;
  }
  return "../index.html";
}
const RETURN_URL = getReturnUrl();

function normalizeCfg(raw) {
  if (!raw || typeof raw !== "object") return null;

  const modeParam = String(raw.mode || raw.gameMode || "").trim().toLowerCase();
  const mode =
    modeParam === "songs" || modeParam === "song" || modeParam === "musique" ? "songs" :
    modeParam === "anime" || modeParam === "animes" ? "anime" : null;

  const popPercent = Number.isFinite(+raw.popPercent) ? +raw.popPercent : (Number.isFinite(+raw.pop) ? +raw.pop : null);
  const scorePercent = Number.isFinite(+raw.scorePercent) ? +raw.scorePercent : (Number.isFinite(+raw.score) ? +raw.score : null);
  const yearMin = Number.isFinite(+raw.yearMin) ? +raw.yearMin : (Number.isFinite(+raw.yMin) ? +raw.yMin : null);
  const yearMax = Number.isFinite(+raw.yearMax) ? +raw.yearMax : (Number.isFinite(+raw.yMax) ? +raw.yMax : null);
  const rounds = Number.isFinite(+raw.rounds) ? +raw.rounds : (Number.isFinite(+raw.count) ? +raw.count : null);

  const types = Array.isArray(raw.types) ? raw.types : (Array.isArray(raw.allowedTypes) ? raw.allowedTypes : []);
  const songKinds = Array.isArray(raw.songKinds) ? raw.songKinds : (Array.isArray(raw.allowedSongs) ? raw.allowedSongs : []);

  return {
    autostart: !!raw.autostart || !!raw.parcours,
    mode,
    popPercent,
    scorePercent,
    yearMin,
    yearMax,
    rounds,
    types: types.map(String),
    songKinds: songKinds.map(String),
  };
}

function readCfgFromLocalStorage() {
  const keys = [
    "AG2_PERSONALISATION",
    "AG2_PERSONNALISATION",
    "AG2_GLOBAL_PERSONALISATION",
    "AG2_PARCOURS_PERSONALISATION",
    "parcoursPersonalisation",
    "parcours_personalisation",
    "AG2_PARCOURS_CONFIG",
    "parcoursConfig",
  ];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (!v) continue;
    const raw = safeJsonParse(v);
    const cfg = normalizeCfg(raw);
    if (cfg) return cfg;
  }
  return null;
}

function parseCsvParam(p) {
  if (!p) return [];
  return String(p).split(",").map(x => x.trim()).filter(Boolean);
}

function readCfgFromUrl() {
  const modeParam = (URL_PARAMS.get("mode") || "").trim().toLowerCase();
  const mode =
    modeParam === "songs" || modeParam === "song" ? "songs" :
    modeParam === "anime" || modeParam === "animes" ? "anime" : null;

  const pop = parseInt(URL_PARAMS.get("pop") || URL_PARAMS.get("popPercent") || "", 10);
  const score = parseInt(URL_PARAMS.get("score") || URL_PARAMS.get("scorePercent") || "", 10);
  const yearMin = parseInt(URL_PARAMS.get("yearMin") || URL_PARAMS.get("ymin") || "", 10);
  const yearMax = parseInt(URL_PARAMS.get("yearMax") || URL_PARAMS.get("ymax") || "", 10);
  const rounds = parseInt(URL_PARAMS.get("count") || URL_PARAMS.get("rounds") || "", 10);

  const types = parseCsvParam(URL_PARAMS.get("types"));
  const songs = parseCsvParam(URL_PARAMS.get("songs") || URL_PARAMS.get("songKinds"));

  const has = mode || Number.isFinite(pop) || Number.isFinite(score) || Number.isFinite(yearMin) || Number.isFinite(yearMax)
    || Number.isFinite(rounds) || types.length || songs.length || truthyParam(URL_PARAMS.get("autostart")) || truthyParam(URL_PARAMS.get("parcours"));

  if (!has) return null;

  return {
    autostart: truthyParam(URL_PARAMS.get("autostart")) || truthyParam(URL_PARAMS.get("parcours")),
    mode,
    popPercent: Number.isFinite(pop) ? pop : null,
    scorePercent: Number.isFinite(score) ? score : null,
    yearMin: Number.isFinite(yearMin) ? yearMin : null,
    yearMax: Number.isFinite(yearMax) ? yearMax : null,
    rounds: Number.isFinite(rounds) ? rounds : null,
    types,
    songKinds: songs,
  };
}

function readGlobalCfg() {
  return readCfgFromUrl() || readCfgFromLocalStorage();
}
const GLOBAL_CFG = readGlobalCfg();

// ✅ autostart “pending” tant que dataset pas chargé
let AUTO_START_PENDING = false;

// =======================
// GLOBAL STATE
// =======================
let ALL_TITLES = [];
let items = [];              // 32 items sélectionnés (animes OU songs)
let mode = "anime";          // "anime" | "songs"

let losses = [];
let eliminationOrder = [];
let aliveWB = [];
let aliveLB = [];

let roundNumber = 1;
let roundMatches = [];
let roundMatchIndex = 0;
let currentMatch = null;

// anti-concurrence chargements
let LOAD_SESSION = 0;

// volume global
let GLOBAL_VOLUME = 0.5;

// thème contenu
let CURRENT_CONTENT_THEME = null; // { crit, label, poolSize }
let CURRENT_BASE_POOL = null;

// =======================
// HELPERS DATA
// =======================
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

function getYearFromSeason(a) {
  const s = String(a.season || "").trim();
  if (!s) return 0;
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}
function getYearFromSeasonStr(seasonStr, fallback = 0) {
  const s = String(seasonStr || "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : (fallback || 0);
}

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

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

function round1(x) {
  return Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
}

// =======================
// BASIC UI
// =======================
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = RETURN_URL || "../index.html";
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
});

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
  }
});

// Tooltip aide (clic mobile)
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

// =======================
// VOLUME (Songs only)
// =======================
function loadSavedVolume() {
  const v = parseFloat(localStorage.getItem("tournament_volume") || "0.5");
  GLOBAL_VOLUME = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}
function saveVolume(v) {
  localStorage.setItem("tournament_volume", String(v));
}
function applyGlobalVolumeToVideo(video) {
  if (!video) return;
  try {
    video.muted = false;
    video.volume = GLOBAL_VOLUME;
  } catch {}
}
function applyGlobalVolumeToAllVideos() {
  document.querySelectorAll("#duel-container video, #classement video").forEach((v) => {
    applyGlobalVolumeToVideo(v);
  });
}
function initVolumeUI() {
  loadSavedVolume();

  const bar = document.getElementById("volumeBar");
  const slider = document.getElementById("volumeSlider");
  const val = document.getElementById("volumeVal");

  if (!bar || !slider || !val) return;

  slider.value = String(Math.round(GLOBAL_VOLUME * 100));
  val.textContent = String(Math.round(GLOBAL_VOLUME * 100));

  slider.addEventListener("input", () => {
    const p = parseInt(slider.value, 10);
    const vv = (Number.isFinite(p) ? p : 50) / 100;
    GLOBAL_VOLUME = Math.min(1, Math.max(0, vv));
    val.textContent = String(Math.round(GLOBAL_VOLUME * 100));
    saveVolume(GLOBAL_VOLUME);
    applyGlobalVolumeToAllVideos();
  });
}
function updateVolumeVisibility() {
  const bar = document.getElementById("volumeBar");
  if (!bar) return;
  const shouldShow = document.body.classList.contains("game-started") && mode === "songs";
  bar.style.display = shouldShow ? "flex" : "none";
}

// =======================
// THEME STRIP
// =======================
function ensureThemeStrip() {
  let el = document.getElementById("content-theme");
  const roundBox = document.getElementById("round-indicator");
  if (el || !roundBox) return el;

  el = document.createElement("div");
  el.id = "content-theme";
  el.className = "main-block";
  el.style.maxWidth = "920px";
  el.style.padding = "0.85rem 1.2rem";
  el.style.margin = "0 auto 0.8rem auto";
  el.style.fontWeight = "900";
  el.style.fontSize = "1.02rem";
  el.style.letterSpacing = "0.3px";
  el.style.textAlign = "center";

  roundBox.insertAdjacentElement("afterend", el);
  return el;
}

function updateThemeStrip() {
  const el = ensureThemeStrip();
  if (!el) return;

  const inGame = document.body.classList.contains("game-started");
  el.style.display = inGame ? "" : "none";

  const label = CURRENT_CONTENT_THEME?.label || "Libre";
  el.textContent = `🎯 Thème contenu : ${label}`;
}

// =======================
// PANEL vs GAME
// =======================
function showCustomization() {
  document.body.classList.remove("game-started");

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "";

  const gameEls = [
    document.getElementById("round-indicator"),
    document.getElementById("content-theme"),
    document.getElementById("volumeBar"),
    document.getElementById("duel-container"),
    document.getElementById("next-match-btn"),
    document.getElementById("classement"),
  ];
  gameEls.forEach((el) => {
    if (el) el.style.display = "none";
  });
}

function showGame() {
  document.body.classList.add("game-started");

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "none";

  const duel = document.getElementById("duel-container");
  if (duel) duel.style.display = "";

  const roundBox = document.getElementById("round-indicator");
  if (roundBox) roundBox.style.display = "";

  const classement = document.getElementById("classement");
  if (classement) classement.style.display = "none";

  const replay = document.getElementById("next-match-btn");
  if (replay) replay.style.display = "none";

  updateVolumeVisibility();
  updateThemeStrip();
}

// =======================
// MODE (pills #modePills)
// =======================
function syncModeButtons() {
  document.querySelectorAll("#modePills .pill[data-mode]").forEach((btn) => {
    const m = btn.dataset.mode;
    const on = m === mode;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function initModePillsIfAny() {
  const pills = Array.from(document.querySelectorAll("#modePills .pill[data-mode]"));
  if (!pills.length) return;

  pills.forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.mode;
      if (!m || m === mode) return;
      switchMode(m);
    });
  });

  syncModeButtons();
}

function switchMode(m) {
  mode = m; // "anime" | "songs"
  syncModeButtons();
  resetTournament();
  refreshPreview();
  updateVolumeVisibility();
}

// =======================
// DEFAULT UI VALUES
// =======================
function setDefaultUI() {
  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  if (pop) pop.value = "30";
  if (score) score.value = "100";
  if (yMin) yMin.value = "1950";
  if (yMax) yMax.value = "2026";

  // défaut types: TV + Movie
  const typePills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
  if (typePills.length) {
    typePills.forEach((b) => {
      const t = b.dataset.type;
      const on = t === "TV" || t === "Movie";
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // défaut songs: Opening
  const songPills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
  if (songPills.length) {
    songPills.forEach((b) => {
      const s = b.dataset.song;
      const on = s === "opening";
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
}

function ensureDefaultTypes() {
  const pills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => {
    const t = b.dataset.type;
    const on = t === "TV" || t === "Movie";
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function ensureDefaultSongs() {
  const pills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => {
    const s = b.dataset.song;
    const on = s === "opening";
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// =======================
// APPLY PARCOURS CFG -> DOM (FIX)
// =======================
function norm(s) { return (s || "").toString().trim().toLowerCase(); }

function applyCfgToUI(cfg) {
  if (!cfg) return;

  // mode
  if (cfg.mode === "anime" || cfg.mode === "songs") {
    mode = cfg.mode;
    syncModeButtons();
  }

  // sliders
  const popEl = document.getElementById("popPercent");
  const scoreEl = document.getElementById("scorePercent");
  const yMinEl = document.getElementById("yearMin");
  const yMaxEl = document.getElementById("yearMax");
  const roundsEl = document.getElementById("roundCount");

  if (popEl && Number.isFinite(+cfg.popPercent)) popEl.value = String(clampInt(+cfg.popPercent, 5, 100));
  if (scoreEl && Number.isFinite(+cfg.scorePercent)) scoreEl.value = String(clampInt(+cfg.scorePercent, 5, 100));
  if (yMinEl && Number.isFinite(+cfg.yearMin)) yMinEl.value = String(+cfg.yearMin);
  if (yMaxEl && Number.isFinite(+cfg.yearMax)) yMaxEl.value = String(+cfg.yearMax);
  if (roundsEl && Number.isFinite(+cfg.rounds)) roundsEl.value = String(clampInt(+cfg.rounds, 1, 100));

  // types (case-insensitive)
  const wantedTypes = (Array.isArray(cfg.types) ? cfg.types : []).map(x => norm(x));
  const typePills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
  if (typePills.length && wantedTypes.length) {
    typePills.forEach((b) => {
      const t = norm(b.dataset.type || "");
      const on = wantedTypes.includes(t);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  ensureDefaultTypes();

  // songs (opening/ending/insert) via codes OP/ED/IN or words
  const mapSong = (x) => {
    const s = norm(x);
    if (s === "op" || s === "opening" || s === "openings") return "opening";
    if (s === "ed" || s === "ending" || s === "endings") return "ending";
    if (s === "in" || s === "insert" || s === "inserts") return "insert";
    return null;
  };
  const wantedSongs = (Array.isArray(cfg.songKinds) ? cfg.songKinds : []).map(mapSong).filter(Boolean);
  const songPills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
  if (songPills.length && wantedSongs.length) {
    songPills.forEach((b) => {
      const s = norm(b.dataset.song || "");
      const on = wantedSongs.includes(s);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  ensureDefaultSongs();

  // clamp years + refresh labels
  clampYearSliders();
  readOptions(); // met à jour labels
}

// =======================
// UI READ
// =======================
function readOptions() {
  clampYearSliders();
  ensureDefaultTypes();
  ensureDefaultSongs();

  const popEl = document.getElementById("popPercent");
  const scoreEl = document.getElementById("scorePercent");
  const yMinEl = document.getElementById("yearMin");
  const yMaxEl = document.getElementById("yearMax");

  const pop = (parseInt(popEl?.value || "30", 10) || 30) / 100;
  const score = (parseInt(scoreEl?.value || "100", 10) || 100) / 100;
  const yMin = parseInt(yMinEl?.value || "1950", 10) || 0;
  const yMax = parseInt(yMaxEl?.value || "2026", 10) || 9999;

  // affichage valeurs
  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yMinVal = document.getElementById("yearMinVal");
  const yMaxVal = document.getElementById("yearMaxVal");

  if (popVal) popVal.textContent = String(Math.round(pop * 100));
  if (scoreVal) scoreVal.textContent = String(Math.round(score * 100));
  if (yMinVal) yMinVal.textContent = String(yMin);
  if (yMaxVal) yMaxVal.textContent = String(yMax);

  const types = new Set(
    [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type)
  );

  const songKinds = new Set(
    [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song)
  );

  return {
    pop,
    score,
    yMin,
    yMax,
    types,
    incOP: songKinds.has("opening"),
    incED: songKinds.has("ending"),
    incIN: songKinds.has("insert"),
  };
}

// =======================
// FILTER TITLES
// =======================
function filterTitles(data, o) {
  let arr = data.filter(a =>
    o.types.has(a._type) &&
    a._year >= o.yMin &&
    a._year <= o.yMax
  );

  arr.sort((a, b) => b._members - a._members);
  arr = arr.slice(0, Math.ceil(arr.length * o.pop));

  arr.sort((a, b) => b._score - a._score);
  arr = arr.slice(0, Math.ceil(arr.length * o.score));

  return arr;
}

// =======================
// BUILD SONGS (meta + artists + season)
// =======================
function buildSongsWithMeta(titles, o) {
  const tracks = [];

  const addList = (t, list, kindHuman, kindCode) => {
    (list || []).forEach((s) => {
      const url = s?.video || s?.url;
      if (!url) return;

      const artistsArr = Array.isArray(s.artists) ? s.artists.filter(Boolean) : [];
      const artistsLabel = artistsArr.length ? " by " + artistsArr.join(", ") : "";
      const seasonStr = String(s.season || "").trim();
      const songYear = getYearFromSeasonStr(seasonStr, t._year);

      tracks.push({
        _key: `song|${t.mal_id || ""}|${kindCode}|${s.number ?? ""}|${s.name ?? ""}|${url}`,

        video: url,
        label: `${t._title} ${kindHuman} ${s.number ?? ""} : ${s.name ?? ""}${artistsLabel}`
          .replace(/\s+/g, " ")
          .trim(),

        _members: t._members,
        _score: t._score,
        _year: t._year,
        _type: t._type,
        _studio: t._studio || "",
        tags: Array.isArray(t._tags) ? t._tags : [],

        artistsArr,
        songSeason: seasonStr,
        songYear,
        songType: kindCode, // "OP" | "ED" | "IN"
      });
    });
  };

  titles.forEach((t) => {
    if (o.incOP) addList(t, t.song?.openings, "Opening", "OP");
    if (o.incED) addList(t, t.song?.endings, "Ending", "ED");
    if (o.incIN) addList(t, t.song?.inserts, "Insert", "IN");
  });

  return tracks;
}

function filterSongs(data, o) {
  const titles = data.filter(a =>
    o.types.has(a._type) &&
    a._year >= o.yMin &&
    a._year <= o.yMax
  );

  let songs = buildSongsWithMeta(titles, o);

  songs.sort((a, b) => b._members - a._members);
  songs = songs.slice(0, Math.ceil(songs.length * o.pop));

  songs.sort((a, b) => b._score - a._score);
  songs = songs.slice(0, Math.ceil(songs.length * o.score));

  return songs;
}

// =======================
// THEME CONTENU (pool 64)
// =======================
function includesStudio(studio, needle) {
  const s = norm(studio);
  const n = norm(needle);
  if (!s || !n) return false;
  return s.includes(n);
}

function hasTag(it, tag) {
  const t = norm(tag);
  const arr = Array.isArray(it.tags) ? it.tags : (Array.isArray(it._tags) ? it._tags : []);
  return arr.some(x => norm(x) === t);
}

function nearbyPool(pool, getNum, target, want = THEME_POOL_SIZE) {
  const arr = [...pool].sort((a, b) => getNum(a) - getNum(b));
  let best = 0, bestD = Infinity;

  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(getNum(arr[i]) - target);
    if (d < bestD) { bestD = d; best = i; }
  }

  let L = best, R = best;
  while ((R - L + 1) < want && (L > 0 || R < arr.length - 1)) {
    if (L > 0) L--;
    if ((R - L + 1) < want && R < arr.length - 1) R++;
  }

  return arr.slice(L, R + 1);
}

function pickUniqueN(pool, n) {
  const out = [];
  const used = new Set();
  for (const it of shuffle([...pool])) {
    if (out.length >= n) break;
    const k = it?._key || JSON.stringify(it);
    if (used.has(k)) continue;
    used.add(k);
    out.push(it);
  }
  return out;
}

function popularityTopPercent(pool, seedItem, getPop) {
  const sorted = [...pool].sort((a, b) => getPop(b) - getPop(a));
  const idx = sorted.findIndex(x => (x?._key && seedItem?._key && x._key === seedItem._key));
  const rank = (idx >= 0) ? (idx + 1) : 1;
  const raw = Math.ceil((rank / Math.max(1, sorted.length)) * 100);
  const pct = clamp(Math.round(raw / 5) * 5, 5, 100);
  return pct;
}

// STUDIO: cumul de studios jusqu'à atteindre 64
function buildStudioPool64(basePool, pickStudioFn, minSize = THEME_POOL_SIZE) {
  const usedStudios = new Set();
  const mapByKey = new Map();

  const candidates = shuffle([...basePool]);
  let safety = 0;

  const addStudio = (studio) => {
    if (!studio) return;
    const key = norm(studio);
    if (!key || usedStudios.has(key)) return;
    usedStudios.add(key);

    for (const it of basePool) {
      if (includesStudio(pickStudioFn(it), studio)) {
        const k = it._key || JSON.stringify(it);
        if (!mapByKey.has(k)) mapByKey.set(k, it);
      }
    }
  };

  while (mapByKey.size < minSize && safety < 120 && candidates.length) {
    safety++;
    const seed = candidates.pop();
    const st = pickStudioFn(seed);
    addStudio(st);
  }

  const out = Array.from(mapByKey.values());
  if (out.length < minSize) return null;

  return pickUniqueN(out, minSize);
}

function pickContentTheme64(basePool, modeLocal) {
  if (!Array.isArray(basePool) || basePool.length < THEME_POOL_SIZE) {
    return { crit: "FREE", label: "Libre", pool: basePool || [] };
  }

  const criteriaAnime = ["FREE", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR"]; // 6
  const criteriaSongs = ["FREE", "SONG_SEASON", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR", "ARTIST"]; // 7
  const criteria = (modeLocal === "songs") ? criteriaSongs : criteriaAnime;

  const getYear = (it) => it?._year || it?.year || 0;
  const getStudio = (it) => it?._studio || it?.studio || "";
  const getScore = (it) => it?._score || it?.score || 0;
  const getPop = (it) => it?._members || it?.members || 0;

  const getSongSeason = (it) => String(it?.songSeason || "").trim();
  const getArtistsArr = (it) => Array.isArray(it?.artistsArr) ? it.artistsArr : [];

  const MAX_TRIES = 80;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const crit = criteria[Math.floor(Math.random() * criteria.length)];

    if (crit === "FREE") {
      return { crit: "FREE", label: "Libre", pool: pickUniqueN(basePool, THEME_POOL_SIZE) };
    }

    const seed = basePool[Math.floor(Math.random() * basePool.length)];
    if (!seed) continue;

    if (crit === "YEAR") {
      const y = getYear(seed);
      if (!y) continue;
      const pool = basePool.filter(it => getYear(it) === y);
      if (pool.length < THEME_POOL_SIZE) continue;
      return { crit, label: `Année : ${y}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
    }

    if (crit === "SONG_SEASON" && modeLocal === "songs") {
      const season = getSongSeason(seed);
      if (!season) continue;
      const pool = basePool.filter(it => norm(getSongSeason(it)) === norm(season));
      if (pool.length < THEME_POOL_SIZE) continue;
      return { crit, label: `Saison song : ${season}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
    }

    if (crit === "STUDIO") {
      const built = buildStudioPool64(basePool, getStudio, THEME_POOL_SIZE);
      if (!built) continue;
      const st = getStudio(seed) || "Studio";
      return { crit, label: `Studio : ${st}`, pool: built };
    }

    if (crit === "TAG") {
      const tags = Array.isArray(seed._tags) ? seed._tags : (Array.isArray(seed.tags) ? seed.tags : []);
      if (!tags.length) continue;
      const t = tags[Math.floor(Math.random() * tags.length)];
      if (!t) continue;
      const pool = basePool.filter(it => hasTag(it, t));
      if (pool.length < THEME_POOL_SIZE) continue;
      return { crit, label: `Tag : ${t}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
    }

    if (crit === "SCORE_NEAR") {
      const sc = getScore(seed);
      if (!sc) continue;
      const pool = nearbyPool(basePool, getScore, sc, THEME_POOL_SIZE);
      if (pool.length < THEME_POOL_SIZE) continue;

      let delta = 0;
      for (const it of pool) delta = Math.max(delta, Math.abs(getScore(it) - sc));
      delta = round1(delta);

      return { crit, label: `Score proche — ${round1(sc)} ± ${delta}`, pool };
    }

    if (crit === "POP_NEAR") {
      const pop = getPop(seed);
      if (!pop) continue;
      const pool = nearbyPool(basePool, getPop, pop, THEME_POOL_SIZE);
      if (pool.length < THEME_POOL_SIZE) continue;

      const pct = popularityTopPercent(basePool, seed, getPop);
      return { crit, label: `Popularité proche — Top ${pct}%`, pool };
    }

    if (crit === "ARTIST" && modeLocal === "songs") {
      const arts = getArtistsArr(seed).filter(Boolean);
      if (!arts.length) continue;
      const a = arts[Math.floor(Math.random() * arts.length)];
      if (!a) continue;
      const pool = basePool.filter(it => getArtistsArr(it).some(x => norm(x) === norm(a)));
      if (pool.length < THEME_POOL_SIZE) continue;
      return { crit, label: `Artiste : ${a}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
    }
  }

  return { crit: "FREE", label: "Libre", pool: pickUniqueN(basePool, THEME_POOL_SIZE) };
}

// =======================
// PREVIEW COUNT
// =======================
function refreshPreview() {
  if (!ALL_TITLES.length) return;

  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  const box = document.getElementById("previewCount");
  const btn = document.getElementById("applyFiltersBtn");

  const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);
  const minSongsNeeded = Math.max(MIN_REQUIRED_SONGS, TOTAL_MATCH_ITEMS);

  if (mode === "anime") {
    const ok = titles.length >= minTitlesNeeded;
    if (box) {
      box.textContent = `📚 ${titles.length} titres disponibles${ok ? " (OK)" : ` (Min ${minTitlesNeeded})`}`;
      box.classList.toggle("good", ok);
      box.classList.toggle("bad", !ok);
    }
    if (btn) btn.disabled = !ok;
  } else {
    const songs = filterSongs(ALL_TITLES, o);
    const ok = songs.length >= minSongsNeeded;

    if (box) {
      box.textContent = `🎵 ${songs.length} songs disponibles${ok ? " (OK)" : ` (Min ${minSongsNeeded})`}`;
      box.classList.toggle("good", ok);
      box.classList.toggle("bad", !ok);
    }
    if (btn) btn.disabled = !ok;
  }
}

// =======================
// UI EVENTS
// =======================
function wireCustomizationUI() {
  document.querySelectorAll("#custom-panel input").forEach((e) => {
    e.addEventListener("input", refreshPreview);
  });

  // types pills: au moins 1
  document.getElementById("typePills")?.addEventListener("click", (e) => {
    const b = e.target.closest(".pill[data-type]");
    if (!b) return;

    const pills = [...document.querySelectorAll("#typePills .pill[data-type]")];

    if (b.classList.contains("active")) {
      const actives = pills.filter((x) => x.classList.contains("active"));
      if (actives.length === 1) return;
    }

    b.classList.toggle("active");
    b.setAttribute("aria-pressed", b.classList.contains("active") ? "true" : "false");

    ensureDefaultTypes();
    refreshPreview();
  });

  // songs pills: au moins 1
  document.getElementById("songPills")?.addEventListener("click", (e) => {
    const b = e.target.closest(".pill[data-song]");
    if (!b) return;

    const pills = [...document.querySelectorAll("#songPills .pill[data-song]")];

    if (b.classList.contains("active")) {
      const actives = pills.filter((x) => x.classList.contains("active"));
      if (actives.length === 1) return;
    }

    b.classList.toggle("active");
    b.setAttribute("aria-pressed", b.classList.contains("active") ? "true" : "false");

    ensureDefaultSongs();
    refreshPreview();
  });

  document.getElementById("applyFiltersBtn")?.addEventListener("click", startGame);
}

// =======================
// START GAME (avec thème contenu 64) — ✅ guard dataset loaded
// =======================
function startGame() {
  if (!ALL_TITLES.length) {
    // dataset pas prêt -> on retente après chargement
    AUTO_START_PENDING = true;
    return;
  }

  resetTournament();

  const o = readOptions();

  if (mode === "anime") {
    const titles = filterTitles(ALL_TITLES, o);
    const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);

    if (titles.length < minTitlesNeeded) {
      // en parcours: pas d'alert spam, on reste sur menu
      if (!IS_PARCOURS) alert(`Pas assez de titres (${titles.length}/${minTitlesNeeded}).`);
      refreshPreview();
      showCustomization();
      return;
    }

    CURRENT_BASE_POOL = titles;

    const theme = pickContentTheme64(titles, "anime");
    CURRENT_CONTENT_THEME = { crit: theme.crit, label: theme.label, poolSize: theme.pool.length };

    const picked = pickUniqueN(theme.pool, TOTAL_MATCH_ITEMS);
    if (picked.length < TOTAL_MATCH_ITEMS) {
      if (!IS_PARCOURS) alert("Impossible de sélectionner 32 items uniques.");
      showCustomization();
      return;
    }

    items = picked.map((t) => ({
      _key: t._key,
      image: t.image,
      title: t._title,
    }));
  } else {
    const songs = filterSongs(ALL_TITLES, o);
    const minSongsNeeded = Math.max(MIN_REQUIRED_SONGS, TOTAL_MATCH_ITEMS);

    if (songs.length < minSongsNeeded) {
      if (!IS_PARCOURS) alert(`Pas assez de songs (${songs.length}/${minSongsNeeded}).`);
      refreshPreview();
      showCustomization();
      return;
    }

    CURRENT_BASE_POOL = songs;

    const theme = pickContentTheme64(songs, "songs");
    CURRENT_CONTENT_THEME = { crit: theme.crit, label: theme.label, poolSize: theme.pool.length };

    const picked = pickUniqueN(theme.pool, TOTAL_MATCH_ITEMS);
    if (picked.length < TOTAL_MATCH_ITEMS) {
      if (!IS_PARCOURS) alert("Impossible de sélectionner 32 items uniques.");
      showCustomization();
      return;
    }

    items = picked.map((s) => ({
      _key: s._key,
      video: s.video,
      label: s.label,
    }));
  }

  showGame();
  updateThemeStrip();
  initTournament();
}

// =======================
// LOAD DATA (✅ autostart après fetch)
// =======================
fetch(DATA_URL)
  .then((r) => r.json())
  .then((json) => {
    const arr = Array.isArray(json) ? json : [];

    ALL_TITLES = arr.map((a) => {
      const title = getDisplayTitle(a);
      const genres = Array.isArray(a.genres) ? a.genres : [];
      const themes = Array.isArray(a.themes) ? a.themes : [];
      return {
        ...a,
        _key: `anime|${a.mal_id || title}`,
        _title: title,
        _year: getYearFromSeason(a),
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
        _studio: a.studio || "",
        _tags: [...genres, ...themes],
      };
    });

    initVolumeUI();
    setDefaultUI();
    initModePillsIfAny();
    syncModeButtons();
    wireCustomizationUI();

    // ✅ applique config parcours APRÈS defaults (override)
    applyCfgToUI(GLOBAL_CFG);

    refreshPreview();

    const shouldAutoStart =
      IS_PARCOURS ||
      truthyParam(URL_PARAMS.get("autostart")) ||
      truthyParam(URL_PARAMS.get("parcours")) ||
      !!GLOBAL_CFG?.autostart;

    if (shouldAutoStart) {
      // ✅ auto-start sans afficher le menu tournoi
      // (si insuffisant on retombe sur menu via startGame)
      showCustomization(); // état propre (sans game)
      startGame();
      AUTO_START_PENDING = false;
      return;
    }

    showCustomization();
    updateVolumeVisibility();
    updateThemeStrip();
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });

// =======================
// TOURNAMENT CORE
// =======================
function initTournament() {
  if (!items || items.length < 2) {
    const roundBox = document.getElementById("round-indicator");
    if (roundBox) roundBox.textContent = "❌ Pas assez d'items pour démarrer.";
    showCustomization();
    return;
  }

  losses = items.map(() => 0);
  eliminationOrder = [];

  roundNumber = 1;
  recomputePools();
  buildNextRound();
  showNextMatch();
}

function recomputePools() {
  aliveWB = [];
  aliveLB = [];
  losses.forEach((l, i) => {
    if (l < 2) {
      if (l === 0) aliveWB.push(i);
      else aliveLB.push(i);
    }
  });
}

function getAliveAll() {
  const all = [];
  losses.forEach((l, i) => {
    if (l < 2) all.push(i);
  });
  return all;
}

function isTournamentOver() {
  return getAliveAll().length <= 1;
}

function buildNextRound() {
  const m = [];
  pair(aliveWB).forEach((p) => m.push(p));
  pair(aliveLB).forEach((p) => m.push(p));

  if (m.length === 0) {
    const all = getAliveAll();
    pair(all).forEach((p) => m.push(p));
  }

  roundMatches = shuffle(m);
  roundMatchIndex = 0;
}

function pair(pool) {
  const p = shuffle([...pool]);
  const r = [];
  while (p.length >= 2) r.push({ a: p.pop(), b: p.pop() });
  return r;
}

function updateRoundIndicator() {
  const box = document.getElementById("round-indicator");
  if (!box) return;

  const totalThisRound = roundMatches.length || 0;
  const currentIndex = Math.min(roundMatchIndex, totalThisRound);

  box.textContent =
    `Round ${roundNumber} — Match ${currentIndex}/${totalThisRound} — Mode: ${mode === "anime" ? "Animes" : "Songs"}`;

  updateThemeStrip();
}

function showNextMatch() {
  if (isTournamentOver()) {
    finishTournament();
    return;
  }

  if (roundMatchIndex >= roundMatches.length) {
    roundNumber++;
    buildNextRound();

    if (roundMatches.length === 0 && !isTournamentOver()) {
      const all = getAliveAll();
      roundMatches = pair(all);
      roundMatchIndex = 0;
    }
  }

  if (!roundMatches.length) {
    finishTournament();
    return;
  }

  currentMatch = roundMatches[roundMatchIndex++];
  updateRoundIndicator();
  renderMatch();
}

// =======================
// CLEANUP MEDIA
// =======================
function cleanupCurrentMedia() {
  const box = document.getElementById("duel-container");
  if (!box) return;

  box.querySelectorAll("video").forEach((v) => {
    try {
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {}
  });
}

// =======================
// VIDEO LOAD
// =======================
function waitEventOrTimeout(target, events, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;

    const onOk = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(true);
    };

    const onFail = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("video error"));
    };

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(t);
      events.ok.forEach((ev) => target.removeEventListener(ev, onOk));
      events.fail.forEach((ev) => target.removeEventListener(ev, onFail));
    }

    events.ok.forEach((ev) => target.addEventListener(ev, onOk, { once: true }));
    events.fail.forEach((ev) => target.addEventListener(ev, onFail, { once: true }));
  });
}

function getOrCreateStatusEl(video) {
  const parent = video.parentElement;
  if (!parent) return null;

  let st = parent.querySelector(".videoStatus");
  if (!st) {
    st = document.createElement("div");
    st.className = "videoStatus";
    parent.insertBefore(st, video.nextSibling);
  }
  return st;
}

function installSnippetLimiter(video, startSec, endSec, session) {
  if (!video) return;

  let armed = false;

  const safeSeek = (t) => {
    try { video.currentTime = t; } catch {}
  };

  const onPlay = () => {
    if (session !== LOAD_SESSION) return;
    if (!armed || video.currentTime < startSec - 0.25 || video.currentTime > endSec + 0.25) {
      safeSeek(startSec);
      armed = true;
    }
  };

  const onTime = () => {
    if (session !== LOAD_SESSION) return;
    if (!armed) return;
    if (video.currentTime >= endSec) {
      try { video.pause(); } catch {}
    }
  };

  video.addEventListener("play", onPlay);
  video.addEventListener("timeupdate", onTime);

  return () => {
    video.removeEventListener("play", onPlay);
    video.removeEventListener("timeupdate", onTime);
  };
}

async function loadVideoWithRetry(video, url, { autoplay = false, session = 0, snippet = false } = {}) {
  video.preload = "metadata";
  video.playsInline = true;
  video.controls = true;

  applyGlobalVolumeToVideo(video);

  const status = getOrCreateStatusEl(video);

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (session !== LOAD_SESSION) return false;

    const delay = RETRY_DELAYS[attempt];
    if (delay) await new Promise((r) => setTimeout(r, delay));

    if (session !== LOAD_SESSION) return false;

    try {
      if (status) status.textContent = `Chargement… (essai ${attempt + 1}/${RETRY_DELAYS.length})`;

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}

      video.src = url;
      video.load();

      await waitEventOrTimeout(
        video,
        { ok: ["loadedmetadata", "loadeddata", "canplay"], fail: ["error", "abort"] },
        LOAD_TIMEOUT_MS
      );

      if (session !== LOAD_SESSION) return false;

      const onWaiting = () => { if (status) status.textContent = "⏳ Buffering…"; };
      const onPlaying = () => { if (status) status.textContent = "✅ Lecture"; };
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("stalled", onWaiting);
      video.addEventListener("playing", onPlaying);

      let cleanupSnippet = null;
      if (snippet) {
        const dur = video.duration;
        let start = SONG_START_SEC;
        let end = SONG_START_SEC + SONG_PLAY_SEC;

        if (Number.isFinite(dur) && dur > 1) {
          start = Math.min(SONG_START_SEC, Math.max(0, dur - 0.25));
          end = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
        }

        try { video.currentTime = start; } catch {}
        cleanupSnippet = installSnippetLimiter(video, start, end, session);
      }

      if (autoplay) {
        try {
          await video.play();
          if (status) status.textContent = "✅ Lecture";
        } catch {
          if (status) status.textContent = "▶️ Clique sur la vidéo pour lancer";
        }
      } else {
        if (status) status.textContent = "✅ Prêt";
      }

      setTimeout(() => {
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("stalled", onWaiting);
        video.removeEventListener("playing", onPlaying);
      }, 1500);

      if (session !== LOAD_SESSION && cleanupSnippet) cleanupSnippet();

      return true;
    } catch {
      // retry
    }
  }

  if (status) status.textContent = "❌ Vidéo indisponible";
  const fallback = document.createElement("div");
  fallback.textContent = "❌ Vidéo indisponible";
  fallback.style.fontWeight = "900";
  fallback.style.opacity = "0.9";
  video.replaceWith(fallback);
  return false;
}

// =======================
// RENDER MATCH
// =======================
async function renderMatch() {
  const box = document.getElementById("duel-container");
  if (!box) return;

  cleanupCurrentMedia();
  box.innerHTML = "";

  const session = ++LOAD_SESSION;

  const indices = [currentMatch.a, currentMatch.b];
  const cardEls = [];

  for (const idx of indices) {
    const item = items[idx];

    const div = document.createElement("div");
    div.className = mode === "anime" ? "anime" : "opening";

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image;
      img.alt = item.title || "anime";
      img.loading = "eager";

      const title = document.createElement("div");
      title.className = "vote-title";
      title.textContent = item.title || "Titre";
      title.addEventListener("click", () => vote(idx));

      div.appendChild(img);
      div.appendChild(title);
      box.appendChild(div);
      cardEls.push({ idx });
    } else {
      const video = document.createElement("video");

      const title = document.createElement("div");
      title.className = "vote-title";
      title.textContent = item.label || "Song";
      title.addEventListener("click", () => vote(idx));

      div.appendChild(video);
      div.appendChild(title);
      box.appendChild(div);
      cardEls.push({ idx, video, url: item.video });
    }
  }

  updateVolumeVisibility();
  updateThemeStrip();

  if (mode === "songs") {
    const left = cardEls.find((c) => c.idx === currentMatch.a);
    if (left?.video && left?.url) {
      await loadVideoWithRetry(left.video, left.url, { autoplay: true, session, snippet: true });
      applyGlobalVolumeToVideo(left.video);
    }

    const right = cardEls.find((c) => c.idx === currentMatch.b);
    if (right?.video && right?.url) {
      await loadVideoWithRetry(right.video, right.url, { autoplay: false, session, snippet: true });
      applyGlobalVolumeToVideo(right.video);
    }

    applyGlobalVolumeToAllVideos();
  }
}

// =======================
// VOTE
// =======================
function vote(winner) {
  if (!currentMatch) return;

  const loser = winner === currentMatch.a ? currentMatch.b : currentMatch.a;
  losses[loser]++;

  if (losses[loser] === 2) eliminationOrder.push(loser);

  recomputePools();

  if (isTournamentOver()) {
    finishTournament();
    return;
  }

  showNextMatch();
}

// =======================
// FIN + CLASSEMENT
// =======================
function finishTournament() {
  LOAD_SESSION++;
  cleanupCurrentMedia();

  const alive = getAliveAll();
  const winner = alive.length ? alive[0] : null;

  const ranking = [];
  if (winner !== null) ranking.push(winner);
  ranking.push(...eliminationOrder.slice().reverse());

  renderClassement(ranking);

  const replay = document.getElementById("next-match-btn");
  if (replay) {
    replay.style.display = "";
    replay.textContent = IS_PARCOURS ? "Continuer" : "Rejouer";
    replay.onclick = () => {
      if (IS_PARCOURS) {
        window.location.href = RETURN_URL || "../index.html";
        return;
      }
      resetTournament();
      showCustomization();
      refreshPreview();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  const duel = document.getElementById("duel-container");
  if (duel) duel.innerHTML = "";

  const roundBox = document.getElementById("round-indicator");
  if (roundBox) roundBox.textContent = "🏁 Tournoi terminé !";

  updateVolumeVisibility();
  updateThemeStrip();
}

function renderClassement(rankingIdx) {
  const box = document.getElementById("classement");
  if (!box) return;

  box.innerHTML = "";
  box.style.display = "";

  rankingIdx.forEach((idx, i) => {
    const item = items[idx];
    const rank = i + 1;

    const card = document.createElement("div");
    card.className = "classement-item";

    const badge = document.createElement("div");
    badge.className = "rank";
    badge.textContent = `#${rank}`;
    card.appendChild(badge);

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image;
      img.alt = item.title || "anime";
      img.loading = "lazy";
      card.appendChild(img);

      const t = document.createElement("div");
      t.className = "title";
      t.textContent = item.title || "Titre";
      card.appendChild(t);
    } else {
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      v.src = item.video;
      applyGlobalVolumeToVideo(v);
      card.appendChild(v);

      const t = document.createElement("div");
      t.className = "title";
      t.textContent = item.label || "Song";
      card.appendChild(t);
    }

    box.appendChild(card);
  });

  applyGlobalVolumeToAllVideos();
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =======================
// RESET
// =======================
function resetTournament() {
  LOAD_SESSION++;
  cleanupCurrentMedia();

  const duel = document.getElementById("duel-container");
  const classement = document.getElementById("classement");
  const replay = document.getElementById("next-match-btn");
  const roundBox = document.getElementById("round-indicator");
  const themeStrip = document.getElementById("content-theme");

  if (duel) duel.innerHTML = "";
  if (classement) {
    classement.innerHTML = "";
    classement.style.display = "none";
  }
  if (replay) replay.style.display = "none";
  if (roundBox) roundBox.textContent = "";
  if (themeStrip) themeStrip.style.display = "none";

  items = [];
  losses = [];
  eliminationOrder = [];
  aliveWB = [];
  aliveLB = [];
  roundNumber = 1;
  roundMatches = [];
  roundMatchIndex = 0;
  currentMatch = null;

  CURRENT_CONTENT_THEME = null;
  CURRENT_BASE_POOL = null;

  updateVolumeVisibility();
  updateThemeStrip();
}
