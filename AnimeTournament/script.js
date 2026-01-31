// =======================
// Anime Tournament — script.js (COMPLET + Parcours + Thème contenu amélioré)
// - Thème contenu (pool “élastique”) pour choisir les 32 items
// - "Libre" a la même chance que chaque autre critère
// - Si un critère ne peut pas produire assez => tentatives/agrandissements ; fallback "Libre" en dernier recours
// - STUDIO/TAG/ARTIST/ANIME (songs): pool “agrandi” en cumulant plusieurs valeurs (même critère) jusqu'à atteindre 32
// - YEAR / SONG YEAR / ANIME YEAR: fenêtre 0 puis ±1 puis ±2 ... jusqu'à atteindre 32
// - Popularité: band Top A–B% (bins 5%) + élargissement ±5, ±10 ... si besoin
// - Score: tolérance ±0 puis ±0.1 puis ±0.2 ...
// - Pour tous les critères: on prend TOUT ce qui match, puis random pick 32 dans ce pool
// - Songs: start à 45s, durée 30s (extrait), autoplay gauche
// - Parcours: si ?parcours=1 -> auto-start + continue + postMessage
// =======================

// =======================
// CONFIG
// =======================
const DATA_URL = "../data/licenses_only.json";
const TOTAL_MATCH_ITEMS = 32;

const MIN_REQUIRED_TITLES = 32;
const MIN_REQUIRED_SONGS = 32;

const THEME_POOL_SIZE = 32;

// Songs snippet
const SONG_START_SEC = 45;
const SONG_PLAY_SEC = 30;

// retries vidéos
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const LOAD_TIMEOUT_MS = 6000;

// =======================
// PARCOURS (URL PARAMS)
// =======================
const urlParams = new URLSearchParams(window.location.search);
const IS_PARCOURS = urlParams.get("parcours") === "1";
const FORCED_MODE = urlParams.get("mode"); // "anime" | "songs"
const PARAM_TYPES = urlParams.get("types"); // ex: "TV,Movie"
const PARAM_SONGS = urlParams.get("songs"); // ex: "opening,ending,insert"
const PARAM_POP = urlParams.get("popPercent") || urlParams.get("pop") || urlParams.get("popularity");
const PARAM_SCORE = urlParams.get("scorePercent") || urlParams.get("score");
const PARAM_YMIN = urlParams.get("yearMin") || urlParams.get("yMin");
const PARAM_YMAX = urlParams.get("yearMax") || urlParams.get("yMax");

// ✅ Parcours: fallback config globale si tu l'utilises ailleurs
const PARCOURS_CFG_KEY = "AG_parcours_filters";
let parcoursSent = false;

function loadParcoursCfg() {
  try {
    const raw = localStorage.getItem(PARCOURS_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ✅ Pour parcours: Tournament = 1 étape (1/1 si terminé, 0/1 si abort)
function sendParcoursScore(score = 1, total = 1) {
  if (parcoursSent) return;
  parcoursSent = true;

  try {
    parent.postMessage(
      {
        parcoursScore: {
          label: "Anime Tournament",
          score,
          total,
        },
      },
      "*"
    );
  } catch (e) {
    console.warn("postMessage parcours failed:", e);
  }
}

// ✅ Anti-flash parcours (script chargé en bas => DOM déjà présent)
if (IS_PARCOURS) {
  document.body.classList.add("game-started");

  const backBtn = document.getElementById("back-to-menu");
  if (backBtn) backBtn.style.display = "none";

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "none";

  const game = document.getElementById("game-panel");
  if (game) game.style.display = "block";
}

// =======================
// GLOBAL STATE
// =======================
let ALL_TITLES = [];
let items = []; // 32 items sélectionnés (animes OU songs)
let mode = "anime"; // "anime" | "songs"

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
let CURRENT_CONTENT_THEME = null; // { crit, label }
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

// compat (au cas où)
function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
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

// =======================
// BASIC UI
// =======================
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
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
// THEME INDICATOR (✅ utilise #theme-indicator)
// =======================
function getThemeEl() {
  return document.getElementById("theme-indicator") || document.getElementById("content-theme");
}

function ensureThemeEl() {
  let el = getThemeEl();
  if (el) return el;

  // fallback si jamais l'HTML n'a pas #theme-indicator
  const roundBox = document.getElementById("round-indicator");
  if (!roundBox) return null;

  el = document.createElement("div");
  el.id = "theme-indicator";
  el.className = "theme-indicator";
  roundBox.insertAdjacentElement("afterend", el);
  return el;
}

function updateThemeStrip() {
  const el = ensureThemeEl();
  if (!el) return;

  const inGame = document.body.classList.contains("game-started");
  el.style.display = inGame ? "flex" : "none";

  const label = CURRENT_CONTENT_THEME?.label || "Libre";
  el.textContent = `🎯 Thème contenu : ${label}`;
}

// =======================
// ✅ END BUTTON (unique)
// - Parcours: "Continuer le parcours"
// - Standard: "✅ Terminer" => retourne aux réglages
// =======================
function getEndBtn() {
  return document.getElementById("next-match-btn");
}
function hideEndBtn() {
  const btn = getEndBtn();
  if (!btn) return;
  btn.style.display = "none";
  btn.onclick = null;
  btn.disabled = false;
}
function showEndBtn(label, onClick) {
  const btn = getEndBtn();
  if (!btn) return;

  btn.textContent = label;
  btn.disabled = false;

  // ✅ important: ton CSS met display:none, donc on force inline-flex
  btn.style.display = "inline-flex";
  btn.onclick = typeof onClick === "function" ? onClick : null;
}

// =======================
// PANEL vs GAME
// =======================
function showCustomization() {
  document.body.classList.remove("game-started");

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "";

  const duel = document.getElementById("duel-container");
  const roundBox = document.getElementById("round-indicator");
  const themeEl = getThemeEl();
  const classement = document.getElementById("classement");

  if (duel) duel.style.display = "none";
  if (roundBox) roundBox.style.display = "none";
  if (themeEl) themeEl.style.display = "none";
  if (classement) classement.style.display = "none";

  updateVolumeVisibility();
  hideEndBtn();
}

function showGame() {
  document.body.classList.add("game-started");

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "none";

  const duel = document.getElementById("duel-container");
  if (duel) duel.style.display = "";

  const roundBox = document.getElementById("round-indicator");
  if (roundBox) roundBox.style.display = "";

  const themeEl = ensureThemeEl();
  if (themeEl) themeEl.style.display = "flex";

  const classement = document.getElementById("classement");
  if (classement) classement.style.display = "none";

  updateVolumeVisibility();
  updateThemeStrip();
  hideEndBtn();
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
// PARCOURS -> appliquer params à l’UI (si présents)
// + fallback localStorage AG_parcours_filters
// =======================
function applyParcoursParamsToUI() {
  const cfg = loadParcoursCfg();
  const has = (x) => x != null && x !== "";

  // mode forcé (URL > localStorage)
  const modeFromCfg = (cfg && (cfg.mode || cfg.tournamentMode)) || null;
  const wantedMode =
    FORCED_MODE === "anime" || FORCED_MODE === "songs"
      ? FORCED_MODE
      : modeFromCfg === "anime" || modeFromCfg === "songs"
      ? modeFromCfg
      : null;

  if (wantedMode) {
    mode = wantedMode;
    syncModeButtons();
  }

  // sliders
  const popEl = document.getElementById("popPercent");
  const scoreEl = document.getElementById("scorePercent");
  const yMinEl = document.getElementById("yearMin");
  const yMaxEl = document.getElementById("yearMax");

  const trySetInt = (el, val, min, max) => {
    if (!el || !has(val)) return;
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return;
    el.value = String(clamp(n, min, max));
  };

  // URL > cfg
  trySetInt(popEl, has(PARAM_POP) ? PARAM_POP : cfg?.popPercent, 1, 100);
  trySetInt(scoreEl, has(PARAM_SCORE) ? PARAM_SCORE : cfg?.scorePercent, 1, 100);
  trySetInt(yMinEl, has(PARAM_YMIN) ? PARAM_YMIN : cfg?.yearMin, 1900, 2100);
  trySetInt(yMaxEl, has(PARAM_YMAX) ? PARAM_YMAX : cfg?.yearMax, 1900, 2100);

  // types pills (URL > cfg.types)
  const typesList = has(PARAM_TYPES)
    ? PARAM_TYPES.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(cfg?.types)
    ? cfg.types
    : null;

  if (typesList && typesList.length) {
    const want = new Set(typesList);
    const pills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
    if (pills.length) {
      pills.forEach((p) => {
        const t = p.dataset.type;
        const on = want.has(t);
        p.classList.toggle("active", on);
        p.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  // songs pills (URL > cfg.songs)
  const songsList = has(PARAM_SONGS)
    ? PARAM_SONGS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : Array.isArray(cfg?.songs)
    ? cfg.songs.map((x) => String(x).toLowerCase())
    : null;

  if (songsList && songsList.length) {
    const want = new Set(songsList);
    const pills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
    if (pills.length) {
      pills.forEach((p) => {
        const s = (p.dataset.song || "").toLowerCase();
        const on = want.has(s);
        p.classList.toggle("active", on);
        p.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  // sécurité
  ensureDefaultTypes();
  ensureDefaultSongs();
  clampYearSliders();
  refreshPreview();
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

  const types = new Set([...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type));
  const songKinds = new Set([...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song));

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
  let arr = data.filter((a) => o.types.has(a._type) && a._year >= o.yMin && a._year <= o.yMax);

  arr.sort((a, b) => b._members - a._members);
  arr = arr.slice(0, Math.ceil(arr.length * o.pop));

  arr.sort((a, b) => b._score - a._score);
  arr = arr.slice(0, Math.ceil(arr.length * o.score));

  return arr;
}

// =======================
// BUILD SONGS (meta + artists + year)
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
        label: `${t._title} ${kindHuman} ${s.number ?? ""} : ${s.name ?? ""}${artistsLabel}`.replace(/\s+/g, " ").trim(),

        // meta anime
        animeId: t.mal_id || null,
        animeTitle: t._title || "",

        _members: t._members,
        _score: t._score,
        _year: t._year,
        _type: t._type,
        _studio: t._studio || "",
        tags: Array.isArray(t._tags) ? t._tags : [],

        // meta song
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
  const titles = data.filter((a) => o.types.has(a._type) && a._year >= o.yMin && a._year <= o.yMax);

  let songs = buildSongsWithMeta(titles, o);

  songs.sort((a, b) => b._members - a._members);
  songs = songs.slice(0, Math.ceil(songs.length * o.pop));

  songs.sort((a, b) => b._score - a._score);
  songs = songs.slice(0, Math.ceil(songs.length * o.score));

  return songs;
}

// =======================
// THEME CONTENU — pools "agrandis" + 2 critères songs (ANIME / ANIME_YEAR)
// =======================
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

function summarizeForLabel(arr, max = 3) {
  const clean = (arr || []).map((x) => String(x || "").trim()).filter(Boolean);
  if (clean.length <= max) return clean.join(" + ");
  return clean.slice(0, max).join(" + ") + ` + ${clean.length - max} autres`;
}

function buildYearWindowPool(basePool, getYearFn, centerYear, minSize = THEME_POOL_SIZE) {
  const y0 = Number.isFinite(+centerYear) ? +centerYear : 0;
  if (!y0) return null;

  for (let delta = 0; delta <= 120; delta++) {
    const pool = basePool.filter((it) => {
      const y = +getYearFn(it) || 0;
      return y && Math.abs(y - y0) <= delta;
    });
    if (pool.length >= minSize || pool.length === basePool.length) {
      return { pool, delta };
    }
  }
  return null;
}

function buildScoreWindowPool(basePool, getScoreFn, centerScore, minSize = THEME_POOL_SIZE) {
  const sc0 = Number.isFinite(+centerScore) ? +centerScore : 0;
  if (!sc0) return null;

  for (let step = 0; step <= 10.0; step += 0.1) {
    const delta = Math.round(step * 10) / 10;
    const pool = basePool.filter((it) => {
      const sc = +getScoreFn(it) || 0;
      return sc && Math.abs(sc - sc0) <= delta;
    });
    if (pool.length >= minSize || pool.length === basePool.length) {
      return { pool, delta };
    }
  }
  return null;
}

function topPercentFromValue(sortedDesc, value) {
  const vals = sortedDesc || [];
  const n = vals.length;
  const v = +value || 0;
  if (!n || !v) return 100;

  let lo = 0,
    hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vals[mid] > v) lo = mid + 1;
    else hi = mid;
  }
  const rank = lo + 1;
  return clamp(Math.ceil((rank / n) * 100), 1, 100);
}

function buildPopPercentBandPool(basePool, getPopFn, globalSortedDesc, seedValue, minSize = THEME_POOL_SIZE) {
  const seedP = topPercentFromValue(globalSortedDesc, seedValue);

  const baseStart = Math.floor((seedP - 1) / 5) * 5;
  const baseEnd = baseStart + 5;

  const cache = new Map();
  const getP = (it) => {
    const k = it?._key || JSON.stringify(it);
    if (cache.has(k)) return cache.get(k);
    const p = topPercentFromValue(globalSortedDesc, getPopFn(it));
    cache.set(k, p);
    return p;
  };

  for (let expand = 0; expand <= 100; expand += 5) {
    const s0 = clamp(baseStart - expand, 0, 95);
    const e0 = clamp(baseEnd + expand, 5, 100);
    const lo = s0 === 0 ? 1 : s0;
    const hi = e0;

    const pool = basePool.filter((it) => {
      const p = getP(it);
      return p >= lo && p <= hi;
    });

    if (pool.length >= minSize || pool.length === basePool.length) {
      return { pool, lo, hi };
    }
  }
  return null;
}

function buildCumulativePool(basePool, getValueFromItem, matchesValueFn, seedValue, minSize = THEME_POOL_SIZE, safetyMax = 600) {
  const usedValues = [];
  const usedKey = new Set();
  const mapByKey = new Map();

  const addValue = (val) => {
    const v = String(val || "").trim();
    const key = norm(v);
    if (!key || usedKey.has(key)) return;

    usedKey.add(key);
    usedValues.push(v);

    for (const it of basePool) {
      if (matchesValueFn(it, v, key)) {
        const k = it._key || JSON.stringify(it);
        if (!mapByKey.has(k)) mapByKey.set(k, it);
      }
    }
  };

  addValue(seedValue);

  const candidates = shuffle([...basePool]);
  let safety = 0;

  while (mapByKey.size < minSize && safety < safetyMax && candidates.length) {
    safety++;
    const seed = candidates.pop();
    addValue(getValueFromItem(seed));
  }

  const out = Array.from(mapByKey.values());
  if (out.length < minSize) return null;

  return { pool: out, values: usedValues };
}

function buildTagCumulativePool(basePool, getTagsFn, seedTag, minSize = THEME_POOL_SIZE) {
  const getValueFromItem = (it) => {
    const tags = getTagsFn(it);
    if (!Array.isArray(tags) || !tags.length) return "";
    return tags[Math.floor(Math.random() * tags.length)];
  };
  const matches = (it, v, key) => {
    const tags = getTagsFn(it);
    return Array.isArray(tags) && tags.some((x) => norm(x) === key);
  };
  return buildCumulativePool(basePool, getValueFromItem, matches, seedTag, minSize, 900);
}

function buildArtistCumulativePool(basePool, getArtistsFn, seedArtist, minSize = THEME_POOL_SIZE) {
  const getValueFromItem = (it) => {
    const arr = getArtistsFn(it);
    if (!Array.isArray(arr) || !arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
  };
  const matches = (it, v, key) => {
    const arr = getArtistsFn(it);
    return Array.isArray(arr) && arr.some((x) => norm(x) === key);
  };
  return buildCumulativePool(basePool, getValueFromItem, matches, seedArtist, minSize, 1200);
}

function buildStudioCumulativePool(basePool, getStudioFn, seedStudio, minSize = THEME_POOL_SIZE) {
  const getValueFromItem = (it) => getStudioFn(it);
  const matches = (it, v) => includesStudio(getStudioFn(it), v);
  return buildCumulativePool(basePool, getValueFromItem, matches, seedStudio, minSize, 900);
}

function buildAnimeCumulativePool(basePool, getAnimeKeyFn, getAnimeLabelFn, seedItem, minSize = THEME_POOL_SIZE) {
  const usedLabels = [];
  const usedKey = new Set();
  const mapByKey = new Map();

  const addAnime = (key, label) => {
    const k0 = String(key || "").trim();
    const k = norm(k0);
    if (!k || usedKey.has(k)) return;

    usedKey.add(k);
    usedLabels.push(String(label || k0 || "Anime").trim());

    for (const it of basePool) {
      const kk = norm(String(getAnimeKeyFn(it) || "").trim());
      if (kk && kk === k) {
        const itKey = it._key || JSON.stringify(it);
        if (!mapByKey.has(itKey)) mapByKey.set(itKey, it);
      }
    }
  };

  const seedKey = getAnimeKeyFn(seedItem);
  const seedLabel = getAnimeLabelFn(seedItem);
  addAnime(seedKey, seedLabel);

  const candidates = shuffle([...basePool]);
  let safety = 0;

  while (mapByKey.size < minSize && safety < 1400 && candidates.length) {
    safety++;
    const s = candidates.pop();
    addAnime(getAnimeKeyFn(s), getAnimeLabelFn(s));
  }

  const out = Array.from(mapByKey.values());
  if (out.length < minSize) return null;

  return { pool: out, labels: usedLabels };
}

function pickContentTheme64(basePool, modeLocal) {
  if (!Array.isArray(basePool) || basePool.length < THEME_POOL_SIZE) {
    return { crit: "FREE", label: "Libre", pool: Array.isArray(basePool) ? basePool : [] };
  }

  const criteriaAnime = ["FREE", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR"];
  const criteriaSongs = ["FREE", "SONG_YEAR", "ANIME_YEAR", "ANIME", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR", "ARTIST"];
  const criteria = modeLocal === "songs" ? criteriaSongs : criteriaAnime;

  const getYear = (it) => it?._year || it?.year || 0;
  const getStudio = (it) => it?._studio || it?.studio || "";
  const getScore = (it) => it?._score || it?.score || 0;
  const getPop = (it) => it?._members || it?.members || 0;

  const getSongYear = (it) => (Number.isFinite(+it?.songYear) ? +it.songYear : 0);
  const getTagsArr = (it) => (Array.isArray(it?.tags) ? it.tags : Array.isArray(it?._tags) ? it._tags : []);
  const getArtistsArr = (it) => (Array.isArray(it?.artistsArr) ? it.artistsArr : []);

  const getAnimeKey = (it) => {
    if (it?.animeId != null && it.animeId !== "") return String(it.animeId);
    const t = String(it?.animeTitle || "").trim();
    return t ? t : "";
  };
  const getAnimeLabel = (it) => String(it?.animeTitle || it?.title || it?._title || it?.animeId || "Anime").trim();

  const globalSortedMembersDesc = ALL_TITLES
    .map((t) => +t?._members || 0)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b - a);

  const MAX_TRIES = 200;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const crit = criteria[Math.floor(Math.random() * criteria.length)];

    if (crit === "FREE") {
      return { crit: "FREE", label: "Libre", pool: basePool };
    }

    const seed = basePool[Math.floor(Math.random() * basePool.length)];
    if (!seed) continue;

    if (crit === "YEAR") {
      const y = getYear(seed);
      const built = buildYearWindowPool(basePool, getYear, y, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = built.delta === 0 ? `Année : ${y}` : `Année : ${y} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "SONG_YEAR" && modeLocal === "songs") {
      const y = getSongYear(seed);
      const built = buildYearWindowPool(basePool, getSongYear, y, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = built.delta === 0 ? `Année song : ${y}` : `Année song : ${y} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "ANIME_YEAR" && modeLocal === "songs") {
      const y = getYear(seed);
      const built = buildYearWindowPool(basePool, getYear, y, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = built.delta === 0 ? `Année anime : ${y}` : `Année anime : ${y} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "ANIME" && modeLocal === "songs") {
      const built = buildAnimeCumulativePool(basePool, getAnimeKey, getAnimeLabel, seed, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = `Animes : ${summarizeForLabel(built.labels, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "STUDIO") {
      const seedStudio = getStudio(seed);
      if (!String(seedStudio || "").trim()) continue;

      const built = buildStudioCumulativePool(basePool, getStudio, seedStudio, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = `Studios : ${summarizeForLabel(built.values, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "TAG") {
      const tags = getTagsArr(seed);
      if (!Array.isArray(tags) || !tags.length) continue;

      const seedTag = tags[Math.floor(Math.random() * tags.length)];
      if (!String(seedTag || "").trim()) continue;

      const built = buildTagCumulativePool(basePool, getTagsArr, seedTag, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = `Tags : ${summarizeForLabel(built.values, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "ARTIST" && modeLocal === "songs") {
      const arts = getArtistsArr(seed).filter(Boolean);
      if (!arts.length) continue;

      const seedArtist = arts[Math.floor(Math.random() * arts.length)];
      if (!String(seedArtist || "").trim()) continue;

      const built = buildArtistCumulativePool(basePool, getArtistsArr, seedArtist, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = `Artistes : ${summarizeForLabel(built.values, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "SCORE_NEAR") {
      const sc = getScore(seed);
      if (!sc) continue;

      const built = buildScoreWindowPool(basePool, getScore, sc, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = built.delta === 0 ? `Score : ${round1(sc)}` : `Score : ${round1(sc)} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "POP_NEAR") {
      const pop = getPop(seed);
      if (!pop) continue;

      const built = buildPopPercentBandPool(basePool, getPop, globalSortedMembersDesc, pop, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label =
        built.lo === 1 && built.hi === 5 ? `Popularité : Top 1–5%` : `Popularité : Top ${built.lo}–${built.hi}%`;
      return { crit, label, pool: built.pool };
    }
  }

  return { crit: "FREE", label: "Libre", pool: basePool };
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
// LOAD DATA
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
    refreshPreview();
    updateVolumeVisibility();
    updateThemeStrip();
    hideEndBtn(); // ✅ sécurité

    // ✅ Parcours: cacher le bouton menu + autostart
    if (IS_PARCOURS) {
      const backBtn = document.getElementById("back-to-menu");
      if (backBtn) backBtn.style.display = "none";

      applyParcoursParamsToUI();
      startGame();
    } else {
      showCustomization();
    }
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });

// =======================
// Parcours helpers (no alert)
// =======================
function parcoursAbort(message, score = 0, total = 1) {
  showGame();
  updateThemeStrip();

  const duel = document.getElementById("duel-container");
  if (duel) {
    duel.innerHTML = "";
    duel.style.display = "none"; // ✅ évite le gros bloc vide
  }

  const classement = document.getElementById("classement");
  if (classement) {
    classement.innerHTML = "";
    classement.style.display = "none";
  }

  const roundBox = document.getElementById("round-indicator");
  if (roundBox) roundBox.textContent = message;

  showEndBtn("Continuer le parcours", () => {
    const btn = getEndBtn();
    if (btn) btn.disabled = true;
    sendParcoursScore(score, total);
  });
}

// =======================
// START GAME (avec thème contenu)
// =======================
function startGame() {
  if (!ALL_TITLES.length) return;

  resetTournament();

  const o = readOptions();

  if (mode === "anime") {
    const titles = filterTitles(ALL_TITLES, o);
    const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);

    if (titles.length < minTitlesNeeded) {
      if (IS_PARCOURS) {
        parcoursAbort(`❌ Pool insuffisant : ${titles.length} titres (min ${minTitlesNeeded}).`, 0, 1);
        return;
      }
      alert(`Pas assez de titres (${titles.length}/${minTitlesNeeded}).`);
      showCustomization();
      return;
    }

    CURRENT_BASE_POOL = titles;

    const theme = pickContentTheme64(titles, "anime");
    CURRENT_CONTENT_THEME = { crit: theme.crit, label: theme.label };

    const picked = pickUniqueN(theme.pool, TOTAL_MATCH_ITEMS);
    if (picked.length < TOTAL_MATCH_ITEMS) {
      if (IS_PARCOURS) {
        parcoursAbort("❌ Impossible de sélectionner 32 items uniques.", 0, 1);
        return;
      }
      alert("Impossible de sélectionner 32 items uniques.");
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
      if (IS_PARCOURS) {
        parcoursAbort(`❌ Pool insuffisant : ${songs.length} songs (min ${minSongsNeeded}).`, 0, 1);
        return;
      }
      alert(`Pas assez de songs (${songs.length}/${minSongsNeeded}).`);
      showCustomization();
      return;
    }

    CURRENT_BASE_POOL = songs;

    const theme = pickContentTheme64(songs, "songs");
    CURRENT_CONTENT_THEME = { crit: theme.crit, label: theme.label };

    const picked = pickUniqueN(theme.pool, TOTAL_MATCH_ITEMS);
    if (picked.length < TOTAL_MATCH_ITEMS) {
      if (IS_PARCOURS) {
        parcoursAbort("❌ Impossible de sélectionner 32 items uniques.", 0, 1);
        return;
      }
      alert("Impossible de sélectionner 32 items uniques.");
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
// TOURNAMENT CORE
// =======================
function initTournament() {
  if (!items || items.length < 2) {
    if (IS_PARCOURS) {
      parcoursAbort("❌ Pas assez d'items pour démarrer.", 0, 1);
      return;
    }
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

  box.textContent = `Round ${roundNumber} — Match ${currentIndex}/${totalThisRound} — Mode: ${
    mode === "anime" ? "Animes" : "Songs"
  }`;

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
// VIDEO LOAD (no waiting/stalled as fail) + token
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
  let endedOnce = false;

  const safeSeek = (t) => {
    try {
      video.currentTime = t;
    } catch {}
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
    if (!armed || endedOnce) return;

    if (video.currentTime >= endSec) {
      endedOnce = true;
      try {
        video.pause();
      } catch {}
      try {
        video.dispatchEvent(new Event("snippetended"));
      } catch {}
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

      const onWaiting = () => {
        if (status) status.textContent = "⏳ Buffering…";
      };
      const onPlaying = () => {
        if (status) status.textContent = "✅ Lecture";
      };
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

        video.dataset.snipStart = String(start);
        video.dataset.snipEnd = String(end);

        try {
          video.currentTime = start;
        } catch {}
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

  // ✅ en jeu: duel visible
  box.style.display = "";

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
  hideEndBtn();

  if (mode === "songs") {
    const left = cardEls.find((c) => c.idx === currentMatch.a);
    const right = cardEls.find((c) => c.idx === currentMatch.b);

    let rightReady = false;
    let pendingStartRight = false;

    const startRight = async () => {
      if (session !== LOAD_SESSION) return;
      if (!right?.video || !rightReady || !right.video.isConnected) {
        pendingStartRight = true;
        return;
      }

      const st = parseFloat(right.video.dataset.snipStart || String(SONG_START_SEC));
      if (Number.isFinite(st)) {
        try {
          right.video.currentTime = st;
        } catch {}
      }

      const status = getOrCreateStatusEl(right.video);

      try {
        await right.video.play();
        if (status) status.textContent = "✅ Lecture";
      } catch {
        if (status) status.textContent = "▶️ Clique sur la vidéo pour lancer";
      }
    };

    if (left?.video && left?.url) {
      left.video.addEventListener("snippetended", startRight, { once: true });
      left.video.addEventListener("ended", startRight, { once: true });

      await loadVideoWithRetry(left.video, left.url, { autoplay: true, session, snippet: true });
      applyGlobalVolumeToVideo(left.video);
    }

    if (right?.video && right?.url) {
      const ok = await loadVideoWithRetry(right.video, right.url, { autoplay: false, session, snippet: true });
      rightReady = !!ok && right.video.isConnected;
      applyGlobalVolumeToVideo(right.video);

      if (pendingStartRight) startRight();
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

  // ✅ cache le duel pour éviter le gros bloc vide
  const duel = document.getElementById("duel-container");
  if (duel) {
    duel.innerHTML = "";
    duel.style.display = "none";
  }

  renderClassement(ranking);

  const roundBox = document.getElementById("round-indicator");
  if (roundBox) roundBox.textContent = "🏁 Tournoi terminé !";

  if (IS_PARCOURS) {
    showEndBtn("Continuer le parcours", () => {
      const btn = getEndBtn();
      if (btn) btn.disabled = true;
      sendParcoursScore(1, 1);
    });
  } else {
    // ✅ Standard: 1 seul bouton => retourne réglages
    showEndBtn("✅ Terminer", () => {
      resetTournament();
      showCustomization();
      refreshPreview();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

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
  const roundBox = document.getElementById("round-indicator");
  const themeStrip = getThemeEl();

  if (duel) {
    duel.innerHTML = "";
    duel.style.display = "none";
  }
  if (classement) {
    classement.innerHTML = "";
    classement.style.display = "none";
  }
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
  hideEndBtn();
}
