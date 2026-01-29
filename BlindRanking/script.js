/**********************
 * Blind Ranking (Anime / Songs) — script.js (COMPLET + MODIFS)
 * ✅ Songs: pas de poster (écran noir)
 * ✅ Songs: extrait start 30s + durée 30s
 * ✅ Thèmes contenus "pool agrandi" (reste sur le même thème)
 * ✅ Popularité: Top% calculé sur GLOBAL (tous les animes), pas sur pool filtré
 * ✅ Songs: "Année song" (Spring 2012 => 2012) + thème "Anime" (songs du même anime)
 **********************/

// =======================
// PARCOURS SUPPORT
// =======================
const URL_PARAMS = new URLSearchParams(window.location.search);

function truthyParam(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function detectParcours() {
  const from = (URL_PARAMS.get("from") || "").trim().toLowerCase();
  if (from === "parcours") return true;
  if (truthyParam(URL_PARAMS.get("parcours"))) return true;

  const keys = [
    "AG2_PARCOURS_ACTIVE",
    "ag2_parcours_active",
    "parcours_active",
    "AG2_PARCOURS",
  ];
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

function parseCsvParam(p) {
  if (!p) return [];
  return String(p).split(",").map(x => x.trim()).filter(Boolean);
}
function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function normalizeConfigObject(raw) {
  if (!raw || typeof raw !== "object") return null;

  const modeParam = String(raw.mode || raw.gameMode || raw.blindRankingMode || "").trim().toLowerCase();
  const mode =
    (modeParam === "songs" || modeParam === "song" || modeParam === "musique") ? "songs" :
    (modeParam === "anime" || modeParam === "animes") ? "anime" :
    null;

  const popPercent = Number.isFinite(+raw.popPercent) ? +raw.popPercent : (Number.isFinite(+raw.pop) ? +raw.pop : null);
  const scorePercent = Number.isFinite(+raw.scorePercent) ? +raw.scorePercent : (Number.isFinite(+raw.score) ? +raw.score : null);
  const yearMin = Number.isFinite(+raw.yearMin) ? +raw.yearMin : (Number.isFinite(+raw.yMin) ? +raw.yMin : null);
  const yearMax = Number.isFinite(+raw.yearMax) ? +raw.yearMax : (Number.isFinite(+raw.yMax) ? +raw.yMax : null);

  const types = Array.isArray(raw.types) ? raw.types : (Array.isArray(raw.allowedTypes) ? raw.allowedTypes : []);
  const songKinds = Array.isArray(raw.songKinds) ? raw.songKinds : (Array.isArray(raw.allowedSongs) ? raw.allowedSongs : []);

  const rounds = Number.isFinite(+raw.rounds) ? +raw.rounds :
                 (Number.isFinite(+raw.count) ? +raw.count :
                 (Number.isFinite(+raw.roundCount) ? +raw.roundCount : null));

  return {
    source: "localStorage",
    autostart: !!raw.autostart || !!raw.parcours,
    mode,
    popPercent,
    scorePercent,
    yearMin,
    yearMax,
    types: types.map(String),
    songKinds: songKinds.map(String),
    rounds,
  };
}

function readConfigFromLocalStorage() {
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
    const cfg = normalizeConfigObject(raw);
    if (cfg) return cfg;
  }
  return null;
}

function readConfigFromUrl() {
  const modeParam = (URL_PARAMS.get("mode") || URL_PARAMS.get("blindMode") || "").trim().toLowerCase();
  const mode =
    (modeParam === "songs" || modeParam === "song" || modeParam === "musique") ? "songs" :
    (modeParam === "anime" || modeParam === "animes") ? "anime" :
    null;

  const pop = parseInt(URL_PARAMS.get("pop") || URL_PARAMS.get("popPercent") || "", 10);
  const score = parseInt(URL_PARAMS.get("score") || URL_PARAMS.get("scorePercent") || "", 10);
  const yearMin = parseInt(URL_PARAMS.get("yearMin") || URL_PARAMS.get("ymin") || "", 10);
  const yearMax = parseInt(URL_PARAMS.get("yearMax") || URL_PARAMS.get("ymax") || "", 10);
  const rounds = parseInt(URL_PARAMS.get("count") || URL_PARAMS.get("rounds") || URL_PARAMS.get("roundCount") || "", 10);

  const types = parseCsvParam(URL_PARAMS.get("types"));
  const songs = parseCsvParam(URL_PARAMS.get("songs") || URL_PARAMS.get("songKinds"));

  const hasSomething =
    mode !== null ||
    Number.isFinite(pop) ||
    Number.isFinite(score) ||
    Number.isFinite(yearMin) ||
    Number.isFinite(yearMax) ||
    Number.isFinite(rounds) ||
    types.length ||
    songs.length ||
    truthyParam(URL_PARAMS.get("autostart")) ||
    truthyParam(URL_PARAMS.get("parcours"));

  if (!hasSomething) return null;

  return {
    source: "url",
    autostart: truthyParam(URL_PARAMS.get("autostart")) || truthyParam(URL_PARAMS.get("parcours")),
    mode,
    popPercent: Number.isFinite(pop) ? pop : null,
    scorePercent: Number.isFinite(score) ? score : null,
    yearMin: Number.isFinite(yearMin) ? yearMin : null,
    yearMax: Number.isFinite(yearMax) ? yearMax : null,
    types,
    songKinds: songs,
    rounds: Number.isFinite(rounds) ? rounds : null,
  };
}

function readGlobalConfig() {
  const urlCfg = readConfigFromUrl();
  if (urlCfg) return urlCfg;
  const lsCfg = readConfigFromLocalStorage();
  if (lsCfg) return lsCfg;
  return null;
}

const GLOBAL_CFG = readGlobalConfig();

function notifyParcoursFinished(detail) {
  try {
    window.dispatchEvent(new CustomEvent("ag2:minigame:finished", { detail }));
  } catch {}
  try {
    window.parent?.postMessage({ type: "ag2:minigame:finished", detail }, "*");
  } catch {}
}

// =======================
// MENU & THEME
// =======================
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = RETURN_URL || "../index.html";
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") document.body.classList.add("light");
});

// =======================
// TOOLTIP
// =======================
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
    document.querySelectorAll(".info-wrap.open").forEach(w => w.classList.remove("open"));
  }
});

// =======================
// HELPERS
// =======================
const MIN_REQUIRED = 10;
const THEME_POOL_SIZE = 10;

// ✅ Songs snippet
const SONG_START_SEC = 45;
const SONG_PLAY_SEC = 30;

const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

function normalizeAnimeList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.animes)) return json.animes;
  return [];
}

function getDisplayTitle(a) {
  return (
    a.title_english ||
    a.title_mal_default ||
    a.title_original ||
    a.title ||
    "Titre inconnu"
  );
}

function getYear(a) {
  const s = ((a && a.season) ? String(a.season) : "").trim();
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

function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function round1(x) {
  return Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
}

function norm(s) {
  return (s || "").toString().trim().toLowerCase();
}

function includesStudio(studio, needle) {
  const s = norm(studio);
  const n = norm(needle);
  if (!s || !n) return false;
  return s.includes(n);
}

function pickUniqueN(pool, n) {
  const out = [];
  const used = new Set();
  for (const it of shuffleInPlace([...pool])) {
    if (out.length >= n) break;
    const k = it?._key || JSON.stringify(it);
    if (used.has(k)) continue;
    used.add(k);
    out.push(it);
  }
  return out;
}

function hasTag(it, tag) {
  const t = norm(tag);
  const tags = Array.isArray(it._tags) ? it._tags : (Array.isArray(it.animeTags) ? it.animeTags : []);
  return tags.some(x => norm(x) === t);
}

// =======================
// SONG LABEL
// =======================
function songTypeLabel(t) {
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "IN";
}

function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = s.songNumber ? ` ${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const art = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${s.animeTitle || "Anime"} ${type}${num}${name}${art}`;
}

function formatItemLabel(it) {
  if (!it) return "";
  if (it.kind === "song") return formatSongTitle(it);
  return it.title || "";
}

function extractSongsFromAnime(anime) {
  const out = [];
  const song = anime.song || {};
  const buckets = [
    { key: "openings", type: "OP" },
    { key: "endings", type: "ED" },
    { key: "inserts", type: "IN" },
  ];

  for (const b of buckets) {
    const arr = Array.isArray(song[b.key]) ? song[b.key] : [];
    for (const it of arr) {
      const url = it.video || it.url || "";
      if (!url || typeof url !== "string" || url.length < 6) continue;

      const artistsArr = Array.isArray(it.artists) ? it.artists.filter(Boolean) : [];
      const artists = artistsArr.join(", ");

      const songSeason = String(it.season || "").trim();
      const songYear = getYearFromSeasonStr(songSeason, anime._year);

      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",
        songArtistsArr: artistsArr,
        songSeason,
        songYear,

        animeMalId: anime.mal_id ?? null,
        animeTitle: anime._title,
        animeTitleLower: anime._titleLower,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,
        animeStudio: anime._studio || "",
        animeTags: Array.isArray(anime._tags) ? anime._tags : [],

        url,
        _key: `${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
      });
    }
  }
  return out;
}

// =======================
// DOM
// =======================
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

const songsRow = document.getElementById("songsRow");
const previewCountEl = document.getElementById("previewCount");
const applyBtn = document.getElementById("applyFiltersBtn");
const roundCountEl = document.getElementById("roundCount");

const rankingList = document.getElementById("ranking-list");
const animeImg = document.getElementById("anime-img");
const itemName = document.getElementById("item-name");

const playerZone = document.getElementById("player-zone");
const songPlayer = document.getElementById("songPlayer");

const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

const rankButtonsWrap = document.getElementById("rankButtons");
const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");
const roundLabel = document.getElementById("roundLabel");
const themeLabel = document.getElementById("themeLabel");

// =======================
// ✅ DEBUG: affiche erreurs dans le jeu
// =======================
window.addEventListener("error", (e) => {
  console.error("JS error:", e.error || e.message);
  if (resultDiv) resultDiv.textContent = "❌ Erreur JS : " + (e.message || "inconnue");
  if (nextBtn) nextBtn.style.display = "block";
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Promise rejection:", e.reason);
  if (resultDiv) resultDiv.textContent = "❌ Promise rejetée : " + (e.reason?.message || e.reason || "inconnue");
  if (nextBtn) nextBtn.style.display = "block";
});

// =======================
// DATA
// =======================
let allAnimes = [];
let allSongs = [];

// Popularité globale (Top% sur le GLOBAL ~2000)
let GLOBAL_POP_PCT_BY_MAL = new Map(); // mal_id => topPct (arrondi 5%)
let GLOBAL_POP_SORTED = []; // [{mal_id, members}]

// =======================
// SETTINGS
// =======================
let currentMode = "anime";
let filteredPool = [];

// =======================
// THEME
// =======================
let currentTheme = null;

// =======================
// GAME STATE
// =======================
let totalRounds = 1;
let currentRound = 1;

let selectedItems = [];
let currentIndex = 0;
let rankings = new Array(10).fill(null);

let roundsRecap = [];

// anti-bug media tokens
let roundToken = 0;
let mediaToken = 0;

let snippetCleanup = null;

// =======================
// UI SHOW/HIDE
// =======================
function showCustomization() {
  if (customPanel) customPanel.style.display = "block";
  if (gamePanel) gamePanel.style.display = "none";
}
function showGame() {
  if (customPanel) customPanel.style.display = "none";
  if (gamePanel) gamePanel.style.display = "block";
}

// =======================
// VOLUME
// =======================
function applyVolume() {
  if (!songPlayer || !volumeSlider) return;
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "30", 10)));
  songPlayer.muted = false;
  songPlayer.volume = v / 100;
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
volumeSlider?.addEventListener("input", applyVolume);

// =======================
// THEME UI
// =======================
function updateThemeLabel() {
  if (!themeLabel) return;
  if (!currentTheme || !currentTheme.label) {
    themeLabel.style.display = "none";
    themeLabel.textContent = "";
    return;
  }
  themeLabel.style.display = "";
  themeLabel.textContent = `🎯 Thème contenu : ${currentTheme.label}`;
}

// =======================
// DEFAULTS (pills)
// =======================
function ensureDefaultTypes() {
  const pills = Array.from(document.querySelectorAll("#typePills .pill"));
  if (!pills.length) return;
  const active = pills.filter(b => b.classList.contains("active"));
  if (active.length) return;

  let did = false;
  pills.forEach(b => {
    const t = (b.dataset.type || "").toUpperCase();
    const on = (t === "TV" || t === "MOVIE");
    if (on) did = true;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  if (!did) {
    pills[0].classList.add("active");
    pills[0].setAttribute("aria-pressed", "true");
  }
}

function ensureDefaultSongs() {
  const pills = Array.from(document.querySelectorAll("#songPills .pill"));
  if (!pills.length) return;
  const active = pills.filter(b => b.classList.contains("active"));
  if (active.length) return;

  let did = false;
  pills.forEach(b => {
    const s = norm(b.dataset.song || "");
    const on = (s === "op" || s === "opening");
    if (on) did = true;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  if (!did) {
    pills[0].classList.add("active");
    pills[0].setAttribute("aria-pressed", "true");
  }
}

function ensureDefaultModePill() {
  const pills = Array.from(document.querySelectorAll("#modePills .pill"));
  if (!pills.length) return;
  const active = pills.find(b => b.classList.contains("active"));
  if (active) return;

  const animeBtn = pills.find(b => (b.dataset.mode || "") === "anime");
  const btn = animeBtn || pills[0];
  pills.forEach(b => {
    b.classList.toggle("active", b === btn);
    b.setAttribute("aria-pressed", b === btn ? "true" : "false");
  });
  currentMode = (btn.dataset.mode || "anime");
}

function updateModeVisibility() {
  if (songsRow) songsRow.style.display = (currentMode === "songs") ? "flex" : "none";
}

function updateModePillsFromState() {
  document.querySelectorAll("#modePills .pill").forEach(b => {
    const active = b.dataset.mode === currentMode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  updateModeVisibility();
}

// =======================
// APPLY GLOBAL CFG TO UI
// =======================
function normalizeSongKindToCode(k) {
  const s = norm(k);
  if (s === "op" || s === "opening" || s === "openings") return "OP";
  if (s === "ed" || s === "ending" || s === "endings") return "ED";
  if (s === "in" || s === "insert" || s === "inserts") return "IN";
  const up = String(k || "").trim().toUpperCase();
  if (up === "OP" || up === "ED" || up === "IN") return up;
  return null;
}

function applyConfigToUI(cfg) {
  if (!cfg) return;

  if (cfg.mode === "anime" || cfg.mode === "songs") {
    currentMode = cfg.mode;
    updateModePillsFromState();
  }

  if (popEl && Number.isFinite(+cfg.popPercent)) popEl.value = String(clampInt(+cfg.popPercent, 5, 100));
  if (scoreEl && Number.isFinite(+cfg.scorePercent)) scoreEl.value = String(clampInt(+cfg.scorePercent, 5, 100));
  if (yearMinEl && Number.isFinite(+cfg.yearMin)) yearMinEl.value = String(+cfg.yearMin);
  if (yearMaxEl && Number.isFinite(+cfg.yearMax)) yearMaxEl.value = String(+cfg.yearMax);

  if (roundCountEl && Number.isFinite(+cfg.rounds)) {
    roundCountEl.value = String(clampInt(+cfg.rounds, 1, 100));
  }

  const wantedTypes = (Array.isArray(cfg.types) ? cfg.types : []).map(x => String(x).trim().toLowerCase());
  const typePills = Array.from(document.querySelectorAll("#typePills .pill"));
  if (typePills.length && wantedTypes.length) {
    typePills.forEach(b => {
      const t = String(b.dataset.type || "").trim().toLowerCase();
      const on = wantedTypes.includes(t);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  ensureDefaultTypes();

  const wantedSongCodes = (Array.isArray(cfg.songKinds) ? cfg.songKinds : [])
    .map(normalizeSongKindToCode)
    .filter(Boolean);

  const songPills = Array.from(document.querySelectorAll("#songPills .pill"));
  if (songPills.length && wantedSongCodes.length) {
    songPills.forEach(b => {
      const pillCode = normalizeSongKindToCode(b.dataset.song || "") || String(b.dataset.song || "").trim().toUpperCase();
      const on = wantedSongCodes.includes(pillCode);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  ensureDefaultSongs();

  clampYearSliders();

  if (popValEl && popEl) popValEl.textContent = popEl.value;
  if (scoreValEl && scoreEl) scoreValEl.textContent = scoreEl.value;
  if (yearMinValEl && yearMinEl) yearMinValEl.textContent = yearMinEl.value;
  if (yearMaxValEl && yearMaxEl) yearMaxValEl.textContent = yearMaxEl.value;

  updateModeVisibility();
}

// =======================
// POPULARITÉ GLOBALE (Top% sur allAnimes)
// =======================
function buildGlobalPopularityIndex() {
  GLOBAL_POP_PCT_BY_MAL = new Map();

  const items = allAnimes
    .filter(a => Number.isFinite(a?._members) && a._members > 0 && (a.mal_id != null))
    .map(a => ({ mal_id: a.mal_id, members: a._members }));

  items.sort((a, b) => b.members - a.members);
  GLOBAL_POP_SORTED = items;

  const N = Math.max(1, items.length);
  for (let i = 0; i < items.length; i++) {
    const rank = i + 1;
    const rawPct = Math.ceil((rank / N) * 100); // 1..100
    const pct5 = clampInt(Math.round(rawPct / 5) * 5, 5, 100);
    GLOBAL_POP_PCT_BY_MAL.set(items[i].mal_id, pct5);
  }
}

function getGlobalTopPctFromAnimeId(malId, fallbackMembers = 0) {
  if (malId != null && GLOBAL_POP_PCT_BY_MAL.has(malId)) return GLOBAL_POP_PCT_BY_MAL.get(malId);

  // fallback: approx via members
  const m = safeNum(fallbackMembers);
  if (!GLOBAL_POP_SORTED.length || !m) return 100;

  // approx rank: first index where members <= m
  let lo = 0, hi = GLOBAL_POP_SORTED.length - 1, ans = GLOBAL_POP_SORTED.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (GLOBAL_POP_SORTED[mid].members <= m) { ans = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  const rank = ans + 1;
  const rawPct = Math.ceil((rank / Math.max(1, GLOBAL_POP_SORTED.length)) * 100);
  return clampInt(Math.round(rawPct / 5) * 5, 5, 100);
}

// =======================
// THEME LOGIC — POOL AGRANDI (reste sur le même thème)
// =======================
function pickRandomFrom(pool, predicate = null, maxTry = 120) {
  if (!Array.isArray(pool) || !pool.length) return null;
  for (let i = 0; i < maxTry; i++) {
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (!predicate || predicate(it)) return it;
  }
  return null;
}

function uniqueUnionByKey(a, b) {
  const map = new Map();
  for (const it of (a || [])) {
    const k = it?._key || JSON.stringify(it);
    if (!map.has(k)) map.set(k, it);
  }
  for (const it of (b || [])) {
    const k = it?._key || JSON.stringify(it);
    if (!map.has(k)) map.set(k, it);
  }
  return Array.from(map.values());
}

function themeFree(basePool) {
  return { crit: "FREE", label: "Libre", pool: pickUniqueN(basePool, THEME_POOL_SIZE) };
}

function themeYearAnime(basePool) {
  const seed = pickRandomFrom(basePool, it => safeNum(it?._year) > 0);
  if (!seed) return null;
  const Y = safeNum(seed._year);
  let k = 0;
  let pool = [];

  while (k <= 20) {
    pool = basePool.filter(it => {
      const y = safeNum(it?._year);
      return y >= (Y - k) && y <= (Y + k);
    });
    if (pool.length >= THEME_POOL_SIZE) break;
    k++;
  }

  return { crit: "YEAR", label: `Année : ${Y} ± ${k}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
}

function themeYearSong(basePool) {
  const seed = pickRandomFrom(basePool, it => safeNum(it?.songYear || it?.animeYear) > 0);
  if (!seed) return null;
  const Y = safeNum(seed.songYear || seed.animeYear);
  let k = 0;
  let pool = [];

  while (k <= 20) {
    pool = basePool.filter(it => {
      const y = safeNum(it?.songYear || it?.animeYear);
      return y >= (Y - k) && y <= (Y + k);
    });
    if (pool.length >= THEME_POOL_SIZE) break;
    k++;
  }

  return { crit: "SONG_YEAR", label: `Année song : ${Y} ± ${k}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
}

function themeScoreNear(basePool, modeLocal) {
  const getScore = (it) => (modeLocal === "songs") ? safeNum(it?.animeScore) : safeNum(it?._score);
  const seed = pickRandomFrom(basePool, it => getScore(it) > 0);
  if (!seed) return null;

  const S = round1(getScore(seed));
  const deltas = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0];
  let used = deltas[deltas.length - 1];
  let pool = [];

  for (const d of deltas) {
    used = d;
    pool = basePool.filter(it => {
      const sc = getScore(it);
      return sc >= (S - d) && sc <= (S + d);
    });
    if (pool.length >= THEME_POOL_SIZE) break;
  }

  return { crit: "SCORE_NEAR", label: `Score : ${S} ± ${used}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
}

function themePopNearGlobal(basePool, modeLocal) {
  const getMalId = (it) => (modeLocal === "songs")
    ? (it?.animeMalId ?? null)
    : (it?.malId ?? it?.mal_id ?? null);

  const getMembers = (it) => (modeLocal === "songs")
    ? safeNum(it?.animeMembers)
    : safeNum(it?._members);

  const seed = pickRandomFrom(basePool, it => getMembers(it) > 0);
  if (!seed) return null;

  const malId = getMalId(seed);

  // ✅ Top% calculé sur le GLOBAL (tous les animes)
  const P = getGlobalTopPctFromAnimeId(malId, getMembers(seed));

  // ✅ bucket de base affiché: 25–30, 40–45, etc.
  // cas spécial: top 5 => 5–10 (car 0–5 n'existe pas)
  const baseLo = (P <= 5) ? 5 : (P - 5);
  const baseHi = (P <= 5) ? 10 : P;

  let window = 5;
  let pool = [];

  while (window <= 50) {
    // ✅ expansion autour du bucket (pas autour de P)
    const lo = clampInt(baseLo - window, 5, 100);
    const hi = clampInt(baseHi + window, 5, 100);

    pool = basePool.filter(it => {
      const p = getGlobalTopPctFromAnimeId(getMalId(it), getMembers(it));
      return p >= lo && p <= hi;
    });

    if (pool.length >= THEME_POOL_SIZE) break;
    window += 5;
  }

  return {
    crit: "POP_NEAR",
    // ✅ label au format demandé
    label: `Popularité : Top ${baseLo}–${baseHi}% ± ${window}% (global)`,
    pool: pickUniqueN(pool, THEME_POOL_SIZE),
  };
}


function themeStudioMix(basePool, modeLocal) {
  const getStudio = (it) => (modeLocal === "songs") ? (it?.animeStudio || "") : (it?._studio || "");
  const seed = pickRandomFrom(basePool, it => norm(getStudio(it)).length > 0);
  if (!seed) return null;

  const studios = [];
  const used = new Set();
  let pool = [];

  const addStudio = (st) => {
    const key = norm(st);
    if (!key || used.has(key)) return;
    used.add(key);
    studios.push(st);

    const addPool = basePool.filter(it => includesStudio(getStudio(it), st));
    pool = uniqueUnionByKey(pool, addPool);
  };

  addStudio(getStudio(seed));

  let safety = 0;
  while (pool.length < THEME_POOL_SIZE && safety < 40) {
    safety++;
    const other = pickRandomFrom(basePool, it => norm(getStudio(it)).length > 0 && !used.has(norm(getStudio(it))));
    if (!other) break;
    addStudio(getStudio(other));
  }

  if (pool.length < THEME_POOL_SIZE) return null;
  return { crit: "STUDIO", label: `Studio : ${studios.join(" + ")}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
}

function themeTagMix(basePool, modeLocal) {
  const getTags = (it) => (modeLocal === "songs")
    ? (Array.isArray(it?.animeTags) ? it.animeTags : [])
    : (Array.isArray(it?._tags) ? it._tags : []);

  const seed = pickRandomFrom(basePool, it => getTags(it).length > 0);
  if (!seed) return null;

  const tags = [];
  const used = new Set();
  let pool = [];

  const pickTagFrom = (it) => {
    const arr = getTags(it).filter(Boolean);
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const addTag = (t) => {
    const key = norm(t);
    if (!key || used.has(key)) return;
    used.add(key);
    tags.push(t);

    const addPool = basePool.filter(it => hasTag(it, t));
    pool = uniqueUnionByKey(pool, addPool);
  };

  addTag(pickTagFrom(seed));

  let safety = 0;
  while (pool.length < THEME_POOL_SIZE && safety < 60) {
    safety++;
    const other = pickRandomFrom(basePool, it => getTags(it).length > 0);
    if (!other) break;
    const t = pickTagFrom(other);
    if (!t || used.has(norm(t))) continue;
    addTag(t);
  }

  if (pool.length < THEME_POOL_SIZE) return null;
  return { crit: "TAG", label: `Tag : ${tags.join(" + ")}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
}

function themeArtistMixSongs(basePool) {
  const seed = pickRandomFrom(basePool, it => Array.isArray(it?.songArtistsArr) && it.songArtistsArr.length);
  if (!seed) return null;

  const artists = [];
  const used = new Set();
  let pool = [];

  const pickArtistFrom = (it) => {
    const arr = Array.isArray(it?.songArtistsArr) ? it.songArtistsArr.filter(Boolean) : [];
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const addArtist = (a) => {
    const key = norm(a);
    if (!key || used.has(key)) return;
    used.add(key);
    artists.push(a);

    const addPool = basePool.filter(it => {
      const arr = Array.isArray(it?.songArtistsArr) ? it.songArtistsArr : [];
      return arr.some(x => norm(x) === key);
    });
    pool = uniqueUnionByKey(pool, addPool);
  };

  addArtist(pickArtistFrom(seed));

  let safety = 0;
  while (pool.length < THEME_POOL_SIZE && safety < 60) {
    safety++;
    const other = pickRandomFrom(basePool, it => Array.isArray(it?.songArtistsArr) && it.songArtistsArr.length);
    if (!other) break;
    const a = pickArtistFrom(other);
    if (!a || used.has(norm(a))) continue;
    addArtist(a);
  }

  if (pool.length < THEME_POOL_SIZE) return null;
  return { crit: "ARTIST", label: `Artiste : ${artists.join(" + ")}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
}

function themeAnimeSongs(basePool) {
  const seed = pickRandomFrom(basePool, it => (it?.animeMalId != null) || norm(it?.animeTitle).length > 0);
  if (!seed) return null;

  const ids = [];
  const labels = [];
  const used = new Set();
  let pool = [];

  const getAnimeKey = (it) => {
    if (it?.animeMalId != null) return `mal:${it.animeMalId}`;
    return `title:${norm(it?.animeTitle || "")}`;
  };

  const getAnimeLabel = (it) => it?.animeTitle || "Anime";

  const addAnime = (it) => {
    const key = getAnimeKey(it);
    if (!key || used.has(key)) return;
    used.add(key);
    ids.push(key);
    labels.push(getAnimeLabel(it));

    const addPool = basePool.filter(s => getAnimeKey(s) === key);
    pool = uniqueUnionByKey(pool, addPool);
  };

  addAnime(seed);

  let safety = 0;
  while (pool.length < THEME_POOL_SIZE && safety < 50) {
    safety++;
    const other = pickRandomFrom(basePool, it => {
      const k = getAnimeKey(it);
      return k && !used.has(k);
    });
    if (!other) break;
    addAnime(other);
  }

  if (pool.length < THEME_POOL_SIZE) return null;
  return { crit: "ANIME", label: `Anime : ${labels.join(" + ")}`, pool: pickUniqueN(pool, THEME_POOL_SIZE) };
}

function pickContentThemeExpanded(basePool, modeLocal) {
  if (!Array.isArray(basePool) || basePool.length < THEME_POOL_SIZE) {
    return themeFree(basePool || []);
  }

  const criteriaAnime = ["FREE", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR"];
  const criteriaSongs = ["FREE", "SONG_YEAR", "ANIME", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR", "ARTIST"];
  const criteria = (modeLocal === "songs") ? criteriaSongs : criteriaAnime;

  const MAX_TRIES = 120;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const crit = criteria[Math.floor(Math.random() * criteria.length)];

    let t = null;
    if (crit === "FREE") t = themeFree(basePool);
    else if (crit === "YEAR" && modeLocal !== "songs") t = themeYearAnime(basePool);
    else if (crit === "SONG_YEAR" && modeLocal === "songs") t = themeYearSong(basePool);
    else if (crit === "ANIME" && modeLocal === "songs") t = themeAnimeSongs(basePool);
    else if (crit === "STUDIO") t = themeStudioMix(basePool, modeLocal);
    else if (crit === "TAG") t = themeTagMix(basePool, modeLocal);
    else if (crit === "SCORE_NEAR") t = themeScoreNear(basePool, modeLocal);
    else if (crit === "POP_NEAR") t = themePopNearGlobal(basePool, modeLocal);
    else if (crit === "ARTIST" && modeLocal === "songs") t = themeArtistMixSongs(basePool);

    if (t && Array.isArray(t.pool) && t.pool.length >= THEME_POOL_SIZE) return t;
  }

  // sécurité: si vraiment aucun thème ne marche (quasi impossible si basePool>=10)
  return themeFree(basePool);
}

// =======================
// MEDIA LOADER (retries + anti-stall)
// =======================
function clearSnippetLimiter() {
  if (snippetCleanup) {
    try { snippetCleanup(); } catch {}
    snippetCleanup = null;
  }
}

function installSnippetLimiter(video, startSec, endSec, localRound, localMedia) {
  clearSnippetLimiter();
  let armed = false;

  const isStillValid = () => localRound === roundToken && localMedia === mediaToken;
  const safeSeek = (t) => { try { video.currentTime = t; } catch {} };

  const onPlay = () => {
    if (!isStillValid()) return;
    if (video.currentTime >= endSec - 0.1 || video.currentTime < startSec - 0.25 || video.currentTime > endSec + 0.25) {
      safeSeek(startSec);
    }
    armed = true;
  };

  const onTime = () => {
    if (!isStillValid()) return;
    if (!armed) return;
    if (video.currentTime >= endSec) {
      try { video.pause(); } catch {}
    }
  };

  video.addEventListener("play", onPlay);
  video.addEventListener("timeupdate", onTime);

  snippetCleanup = () => {
    video.removeEventListener("play", onPlay);
    video.removeEventListener("timeupdate", onTime);
  };

  return snippetCleanup;
}

function computeSnippetBounds(videoDuration) {
  const dur = Number.isFinite(videoDuration) ? videoDuration : null;
  if (!dur || dur <= 1) return { start: SONG_START_SEC, end: SONG_START_SEC + SONG_PLAY_SEC };

  if (dur >= SONG_START_SEC + 1) {
    const start = SONG_START_SEC;
    const end = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
    return { start, end };
  }

  const start = Math.max(0, dur - SONG_PLAY_SEC - 0.25);
  const end = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
  return { start, end };
}

function hardResetMedia() {
  clearSnippetLimiter();
  if (!songPlayer) return;
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  // ✅ pas de poster => écran noir
  try { songPlayer.removeAttribute("poster"); } catch {}
  songPlayer.load();
}

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadMediaWithRetries(url, localRound, localMedia, { autoplay = true, snippet = false } = {}) {
  if (!songPlayer) return () => {};

  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanupLoader = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    songPlayer.onloadedmetadata = null;
    songPlayer.oncanplay = null;
    songPlayer.onplaying = null;
    songPlayer.onwaiting = null;
    songPlayer.onstalled = null;
    songPlayer.onerror = null;
  };

  const isStillValid = () => localRound === roundToken && localMedia === mediaToken;

  const startStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!isStillValid() || done) return;
      triggerRetry();
    }, STALL_TIMEOUT_MS);
  };

  const markReady = () => {
    if (!isStillValid() || done) return;
    done = true;

    cleanupLoader();

    if (snippet) {
      const { start, end } = computeSnippetBounds(songPlayer.duration);
      try { songPlayer.currentTime = start; } catch {}
      installSnippetLimiter(songPlayer, start, end, localRound, localMedia);
    } else {
      clearSnippetLimiter();
    }

    if (autoplay) {
      songPlayer.muted = false;
      songPlayer.play?.().catch(() => {});
    }
  };

  const triggerRetry = () => {
    if (!isStillValid() || done) return;

    cleanupLoader();
    attemptIndex++;

    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      try { songPlayer.pause(); } catch {}
      return;
    }

    setTimeout(() => {
      if (!isStillValid() || done) return;
      doAttempt();
    }, RETRY_DELAYS[attemptIndex]);
  };

  const doAttempt = () => {
    if (!isStillValid() || done) return;

    const src = attemptIndex === 0 ? url : withCacheBuster(url);

    try { hardResetMedia(); } catch {}

    songPlayer.preload = "metadata";
    songPlayer.muted = false;
    // ✅ pas de poster (écran noir)
    try { songPlayer.removeAttribute("poster"); } catch {}
    songPlayer.src = src;
    songPlayer.load();

    songPlayer.onloadedmetadata = () => { if (!isStillValid() || done) return; markReady(); };
    songPlayer.oncanplay = () => { if (!isStillValid() || done) return; markReady(); };

    songPlayer.onwaiting = () => { if (!isStillValid() || done) return; startStallTimer(); };
    songPlayer.onstalled = () => { if (!isStillValid() || done) return; startStallTimer(); };

    songPlayer.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    };

    songPlayer.onerror = () => { if (!isStillValid() || done) return; triggerRetry(); };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
  return cleanupLoader;
}

// =======================
// UI INIT
// =======================
function initCustomUI() {
  ensureDefaultModePill();
  ensureDefaultTypes();
  ensureDefaultSongs();

  document.querySelectorAll("#modePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modePills .pill").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      currentMode = btn.dataset.mode;
      updateModeVisibility();
      updatePreview();
    });
  });

  document.querySelectorAll("#typePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      ensureDefaultTypes();
      updatePreview();
    });
  });

  document.querySelectorAll("#songPills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      ensureDefaultSongs();
      updatePreview();
    });
  });

  function syncLabels() {
    clampYearSliders();
    if (popValEl && popEl) popValEl.textContent = popEl.value;
    if (scoreValEl && scoreEl) scoreValEl.textContent = scoreEl.value;
    if (yearMinValEl && yearMinEl) yearMinValEl.textContent = yearMinEl.value;
    if (yearMaxValEl && yearMaxEl) yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach(el => el?.addEventListener("input", syncLabels));

  applyBtn?.addEventListener("click", () => {
    filteredPool = applyFilters();
    if (filteredPool.length < MIN_REQUIRED) return;

    const cfgRounds = Number.isFinite(+GLOBAL_CFG?.rounds) ? +GLOBAL_CFG.rounds : null;
    const urlRounds = parseInt(URL_PARAMS.get("count") || "", 10);
    const forcedRounds = Number.isFinite(urlRounds) ? urlRounds : cfgRounds;

    if (IS_PARCOURS && Number.isFinite(forcedRounds)) {
      totalRounds = clampInt(forcedRounds, 1, 100);
    } else {
      totalRounds = clampInt(parseInt(roundCountEl?.value || "1", 10), 1, 100);
    }

    currentRound = 1;
    roundsRecap = [];

    showGame();
    startRound();
  });

  [...rankButtonsWrap?.querySelectorAll("button[data-rank]") || []].forEach(btn => {
    btn.addEventListener("click", () => {
      const r = parseInt(btn.dataset.rank, 10);
      assignRank(r);
    });
  });

  updateModeVisibility();
  syncLabels();
}

// =======================
// FILTERS
// =======================
function applyFilters() {
  ensureDefaultTypes();
  ensureDefaultSongs();

  const popPercent = parseInt(popEl?.value || "30", 10);
  const scorePercent = parseInt(scoreEl?.value || "100", 10);
  const yearMin = parseInt(yearMinEl?.value || "1950", 10);
  const yearMax = parseInt(yearMaxEl?.value || "2026", 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map(b => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  if (currentMode === "anime") {
    let pool = allAnimes.filter(a =>
      a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type)
    );
    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));
    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    return pool.map(a => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      malId: a.mal_id ?? null,
      title: a._title,
      image: a.image || "",
      _year: a._year,
      _members: a._members,
      _score: a._score,
      _type: a._type,
      _studio: a._studio || "",
      _tags: Array.isArray(a._tags) ? a._tags : [],
    }));
  }

  const allowedSongsRaw = [...document.querySelectorAll("#songPills .pill.active")].map(b => b.dataset.song);
  if (allowedSongsRaw.length === 0) return [];

  const allowedSongs = allowedSongsRaw.map(normalizeSongKindToCode).filter(Boolean);

  let pool = allSongs.filter(s =>
    s.animeYear >= yearMin &&
    s.animeYear <= yearMax &&
    allowedTypes.includes(s.animeType) &&
    allowedSongs.includes(s.songType)
  );

  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));
  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool.map(s => ({
    kind: "song",
    _key: `song|${s._key}`,
    animeMalId: s.animeMalId ?? null,
    animeTitle: s.animeTitle || "Anime",
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    songArtistsArr: Array.isArray(s.songArtistsArr) ? s.songArtistsArr : [],
    songType: s.songType,
    songSeason: s.songSeason || "",
    songYear: s.songYear || 0,
    url: s.url,
    image: s.animeImage || "",

    animeYear: s.animeYear,
    animeMembers: s.animeMembers,
    animeScore: s.animeScore,
    animeType: s.animeType,
    animeStudio: s.animeStudio || "",
    animeTags: Array.isArray(s.animeTags) ? s.animeTags : [],
  }));
}

// =======================
// PREVIEW
// =======================
function updatePreview() {
  if (!allAnimes.length) {
    if (previewCountEl) {
      previewCountEl.textContent = "⏳ Chargement de la base…";
      previewCountEl.classList.add("bad");
      previewCountEl.classList.remove("good");
    }
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.classList.add("disabled");
    }
    return;
  }

  const pool = applyFilters();
  const ok = pool.length >= MIN_REQUIRED;
  const label = (currentMode === "songs") ? "Songs" : "Titres";

  if (previewCountEl) {
    previewCountEl.textContent = ok
      ? `📚 ${label} disponibles : ${pool.length} (OK)`
      : `📚 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;
    previewCountEl.classList.toggle("good", ok);
    previewCountEl.classList.toggle("bad", !ok);
  }

  if (applyBtn) {
    applyBtn.disabled = !ok;
    applyBtn.classList.toggle("disabled", !ok);
  }
}

// =======================
// GAME
// =======================
function resetGameUI() {
  rankings = new Array(10).fill(null);
  currentIndex = 0;
  selectedItems = [];

  [...rankButtonsWrap?.querySelectorAll("button[data-rank]") || []].forEach(b => b.disabled = false);

  if (resultDiv) resultDiv.textContent = "";
  if (nextBtn) nextBtn.style.display = "none";

  mediaToken++;
  hardResetMedia();

  if (volumeRow) volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
}

function pick10FromPool(pool) {
  return pickUniqueN(pool, 10); // ✅ full random, unique
}

function startRound() {
  roundToken++;
  resetGameUI();
  updateRankingList(); // placeholders immédiats

  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  if (!filteredPool || filteredPool.length < MIN_REQUIRED) {
    if (resultDiv) resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = IS_PARCOURS ? "Continuer" : "Retour réglages";
      nextBtn.onclick = () => {
        window.location.href = RETURN_URL || "../index.html";
      };
    }
    return;
  }

  currentTheme = pickContentThemeExpanded(filteredPool, currentMode);
  updateThemeLabel();

  const themePool = Array.isArray(currentTheme?.pool) ? currentTheme.pool : [];
  if (themePool.length < 10) {
    if (resultDiv) resultDiv.textContent = "❌ Thème invalide (pool trop petit).";
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = IS_PARCOURS ? "Continuer" : "Retour réglages";
      nextBtn.onclick = () => { window.location.href = RETURN_URL || "../index.html"; };
    }
    return;
  }

  selectedItems = pick10FromPool(themePool);
  if (selectedItems.length < 10) {
    if (resultDiv) resultDiv.textContent = "❌ Impossible de sélectionner 10 items uniques.";
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = IS_PARCOURS ? "Continuer" : "Retour réglages";
      nextBtn.onclick = () => { window.location.href = RETURN_URL || "../index.html"; };
    }
    return;
  }

  updateRankingList();
  displayCurrentItem();
}

function displayCurrentItem() {
  const item = selectedItems[currentIndex];
  if (!item) {
    finishRound();
    return;
  }

  if (itemName) itemName.textContent = formatItemLabel(item);

  if (currentMode === "songs") {
    if (animeImg) animeImg.style.display = "none";
    if (playerZone) playerZone.style.display = "block";
    if (volumeRow) volumeRow.style.display = "flex";

    // ✅ pas de poster => écran noir
    try { songPlayer?.removeAttribute("poster"); } catch {}

    if (item.url && songPlayer) {
      mediaToken++;
      const localRound = roundToken;
      const localMedia = mediaToken;

      hardResetMedia();
      songPlayer.muted = false;
      applyVolume();

      loadMediaWithRetries(item.url, localRound, localMedia, { autoplay: true, snippet: true });
    } else {
      hardResetMedia();
    }
  } else {
    if (volumeRow) volumeRow.style.display = "none";
    if (playerZone) playerZone.style.display = "none";
    hardResetMedia();

    if (animeImg) {
      if (item.image) {
        animeImg.src = item.image;
        animeImg.style.display = "block";
      } else {
        animeImg.style.display = "none";
      }
    }
  }
}

function assignRank(rank) {
  if (rankings[rank - 1] !== null) {
    alert("Ce rang a déjà été attribué !");
    return;
  }

  const item = selectedItems[currentIndex];
  rankings[rank - 1] = item;

  const btn = rankButtonsWrap?.querySelector(`button[data-rank="${rank}"]`);
  if (btn) btn.disabled = true;

  updateRankingList();
  currentIndex++;
  displayCurrentItem();
}

function updateRankingList() {
  if (!rankingList) return;
  rankingList.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const li = document.createElement("li");
    const it = rankings[i];

    if (it) {
      const img = document.createElement("img");
      img.src = it.image || "";
      img.alt = it.kind === "song" ? (it.animeTitle || "") : (it.title || "");
      img.loading = "lazy";
      img.decoding = "async";
      li.appendChild(img);

      const span = document.createElement("span");
      span.textContent = `Rang ${i + 1}: ${formatItemLabel(it)}`;
      li.appendChild(span);
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      li.appendChild(ph);

      const span = document.createElement("span");
      span.textContent = `Rang ${i + 1}`;
      li.appendChild(span);
    }

    rankingList.appendChild(li);
  }
}

function finishRound() {
  [...rankButtonsWrap?.querySelectorAll("button[data-rank]") || []].forEach(b => b.disabled = true);
  try { songPlayer?.pause(); } catch {}

  const rankingLabels = rankings.map(it => (it ? formatItemLabel(it) : null));
  roundsRecap.push({
    round: currentRound,
    mode: currentMode,
    theme: currentTheme ? { crit: currentTheme.crit, label: currentTheme.label } : null,
    ranking: rankingLabels,
  });

  if (resultDiv) resultDiv.textContent = "✅ Partie terminée !";
  if (!nextBtn) return;

  nextBtn.style.display = "block";
  const isLast = currentRound >= totalRounds;

  if (!isLast) {
    nextBtn.textContent = "Round suivant";
    nextBtn.onclick = () => {
      currentRound++;
      startRound();
    };
  } else {
    notifyParcoursFinished({
      game: "blind_ranking",
      rounds: totalRounds,
      recap: roundsRecap,
    });

    if (IS_PARCOURS) {
      nextBtn.textContent = "Continuer";
      nextBtn.onclick = () => { window.location.href = RETURN_URL || "../index.html"; };
    } else {
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => {
        showCustomization();
        updatePreview();
      };
    }
  }
}

// =======================
// LOAD DATA
// =======================
fetch("../data/licenses_only.json")
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then(json => {
    const raw = normalizeAnimeList(json);

    allAnimes = (Array.isArray(raw) ? raw : []).map(a => {
      const title = getDisplayTitle(a);
      const genres = Array.isArray(a.genres) ? a.genres : [];
      const themes = Array.isArray(a.themes) ? a.themes : [];

      const tagNames = [...genres, ...themes]
        .map(g => (typeof g === "string" ? g : g?.name))
        .filter(Boolean);

      return {
        ...a,
        _title: title,
        _titleLower: title.toLowerCase(),
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
        _studio: a.studio || "",
        _tags: tagNames,
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    // ✅ build global pop index
    buildGlobalPopularityIndex();

    initCustomUI();

    applyConfigToUI(GLOBAL_CFG);

    updatePreview();
    applyVolume();

    const shouldAutoStart =
      !!GLOBAL_CFG?.autostart ||
      truthyParam(URL_PARAMS.get("autostart")) ||
      IS_PARCOURS;

    if (shouldAutoStart) {
      if (customPanel) customPanel.style.display = "none";
      showGame();

      filteredPool = applyFilters();

      const urlRounds = parseInt(URL_PARAMS.get("count") || "", 10);
      const forcedRounds =
        Number.isFinite(urlRounds) ? urlRounds :
        (Number.isFinite(+GLOBAL_CFG?.rounds) ? +GLOBAL_CFG.rounds : 1);

      totalRounds = IS_PARCOURS ? clampInt(forcedRounds, 1, 100) : clampInt(parseInt(roundCountEl?.value || "1", 10), 1, 100);
      currentRound = 1;
      roundsRecap = [];

      if (filteredPool.length >= MIN_REQUIRED) {
        startRound();
      } else {
        if (resultDiv) {
          resultDiv.textContent = `❌ Pool trop petit (${filteredPool.length}/${MIN_REQUIRED}). Vérifie la config (types/songs).`;
        }
        if (nextBtn) {
          nextBtn.style.display = "block";
          nextBtn.textContent = "Continuer";
          nextBtn.onclick = () => { window.location.href = RETURN_URL || "../index.html"; };
        }
      }
    } else {
      showCustomization();
    }
  })
  .catch(e => {
    if (previewCountEl) {
      previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
      previewCountEl.classList.add("bad");
    }
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.classList.add("disabled");
    }
    console.error(e);
  });
