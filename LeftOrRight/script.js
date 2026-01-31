/**********************
 * Left or Right (Anime / Songs) — Duels indépendants
 * ✅ Thème contenu à CHAQUE DUEL (round indépendant)
 * ✅ Feedback visuel de choix (néon vert + loser grisé)
 * ✅ Gestion vidéo type Tournament (token session + retry + snippetended)
 *
 * ✅ PARCOURS (ajout, sans casser standard)
 * - si ?parcours=1 : masque menu + masque réglages + auto-start
 * - applique params URL + fallback localStorage AG_parcours_filters
 * - fin: bouton "Continuer le parcours" + postMessage parcoursScore
 **********************/

/* =======================
   PARCOURS (URL PARAMS)
   ======================= */
const urlParams = new URLSearchParams(window.location.search);
const IS_PARCOURS = urlParams.get("parcours") === "1";

const FORCED_MODE = urlParams.get("mode"); // "anime" | "songs"
const PARAM_TYPES = urlParams.get("types"); // ex: "TV,Movie"
const PARAM_SONGS = urlParams.get("songs"); // ex: "opening,ending,insert" OU "OP,ED,IN"
const PARAM_POP = urlParams.get("popPercent") || urlParams.get("pop") || urlParams.get("popularity");
const PARAM_SCORE = urlParams.get("scorePercent") || urlParams.get("score");
const PARAM_YMIN = urlParams.get("yearMin") || urlParams.get("yMin");
const PARAM_YMAX = urlParams.get("yearMax") || urlParams.get("yMax");
// optionnel: nombre de duels
const PARAM_DUELS = urlParams.get("duels") || urlParams.get("roundCount") || urlParams.get("rounds");

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

function sendParcoursScore(score = 1, total = 1) {
  if (parcoursSent) return;
  parcoursSent = true;

  try {
    parent.postMessage(
      {
        parcoursScore: {
          label: "Left or Right",
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

// ✅ Anti-flash + UX parcours (script chargé en bas => DOM déjà présent)
if (IS_PARCOURS) {
  document.body.classList.add("parcours");

  const backBtn = document.getElementById("back-to-menu");
  if (backBtn) backBtn.style.display = "none";

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "none";

  const game = document.getElementById("game-panel");
  if (game) game.style.display = "block";
}

// ====== MENU & THEME ======
document.getElementById("back-to-menu").addEventListener("click", () => {
  // Standard: inchangé
  window.location.href = "../index.html";
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") document.body.classList.add("light");
});

// ====== TOOLTIP ======
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

// =======================
// SETTINGS THEME CONTENU
// =======================
const THEME_MIN_SIZE = 2; // un duel = 2 items
const THEME_POOL_SIZE = 2;

// ✅ Clip settings (Songs)
const CLIP_START_S = 45;
const CLIP_DURATION_S = 30; // 30s
const CLIP_EPS = 0.05;

// retries: 0, 2s, 4s, 6s, 8s, 10s
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const LOAD_TIMEOUT_MS = 6000;

// ====== HELPERS ======
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
  let a = parseInt(yearMinEl.value, 10);
  let b = parseInt(yearMaxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    yearMinEl.value = a;
    yearMaxEl.value = b;
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
function extractTagNames(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") out.push(it);
    else if (typeof it.name === "string") out.push(it.name);
  }
  return out.map((x) => String(x).trim()).filter(Boolean);
}

function songTypeLabel(t) {
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "IN";
}
function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = s.songNumber ? `${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const art = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${s.animeTitle || "Anime"} ${type}${num}${name}${art}`;
}

// ====== SONG EXTRACTION ======
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
        artistsArr,
        songSeason,
        songYear,
        url,

        // anime meta (hérité)
        animeId: anime.mal_id || null,
        animeTitle: anime._title || "",
        image: anime.image || "",
        year: anime._year,
        members: anime._members,
        score: anime._score,
        type: anime._type,

        studio: anime._studio || "",
        tags: Array.isArray(anime._tags) ? anime._tags : [],

        _key: `song|${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
      });
    }
  }
  return out;
}

// =======================
// THEME CONTENU — outils (minSize = 2)
// =======================
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

function clamp(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

function topPercentFromValue(sortedDesc, value) {
  const vals = sortedDesc || [];
  const n = vals.length;
  const v = +value || 0;
  if (!n || !v) return 100;

  let lo = 0, hi = n;
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

function buildCumulativePool(basePool, getValueFromItem, matchesValueFn, seedValue, minSize = THEME_POOL_SIZE, safetyMax = 300) {
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

  const candidates = shuffleInPlace([...basePool]);
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
  return buildCumulativePool(basePool, getValueFromItem, matches, seedTag, minSize, 600);
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
  return buildCumulativePool(basePool, getValueFromItem, matches, seedArtist, minSize, 900);
}

function buildStudioCumulativePool(basePool, getStudioFn, seedStudio, minSize = THEME_POOL_SIZE) {
  const getValueFromItem = (it) => getStudioFn(it);
  const matches = (it, v) => includesStudio(getStudioFn(it), v);
  return buildCumulativePool(basePool, getValueFromItem, matches, seedStudio, minSize, 600);
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

  addAnime(getAnimeKeyFn(seedItem), getAnimeLabelFn(seedItem));

  const candidates = shuffleInPlace([...basePool]);
  let safety = 0;

  while (mapByKey.size < minSize && safety < 900 && candidates.length) {
    safety++;
    const s = candidates.pop();
    addAnime(getAnimeKeyFn(s), getAnimeLabelFn(s));
  }

  const out = Array.from(mapByKey.values());
  if (out.length < minSize) return null;

  return { pool: out, labels: usedLabels };
}

// ✅ pick thème (Libre = même chance)
function pickContentThemeEachRound(basePool, modeLocal, allTitlesForPop) {
  if (!Array.isArray(basePool) || basePool.length < THEME_MIN_SIZE) {
    return { crit: "FREE", label: "Libre", pool: Array.isArray(basePool) ? basePool : [] };
  }

  const criteriaAnime = ["FREE", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR"];
  const criteriaSongs = ["FREE", "SONG_YEAR", "ANIME_YEAR", "ANIME", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR", "ARTIST"];
  const criteria = modeLocal === "songs" ? criteriaSongs : criteriaAnime;

  const getYear0 = (it) => it?._year || it?.year || 0;
  const getStudio0 = (it) => it?._studio || it?.studio || "";
  const getScore0 = (it) => it?._score || it?.score || 0;
  const getPop0 = (it) => it?._members || it?.members || 0;

  const getSongYear = (it) => (Number.isFinite(+it?.songYear) ? +it.songYear : 0);
  const getTagsArr = (it) => (Array.isArray(it?.tags) ? it.tags : (Array.isArray(it?._tags) ? it._tags : []));
  const getArtistsArr = (it) => (Array.isArray(it?.artistsArr) ? it.artistsArr : []);

  const getAnimeKey = (it) => {
    if (it?.animeId != null && it.animeId !== "") return String(it.animeId);
    const t = String(it?.animeTitle || "").trim();
    return t ? t : "";
  };
  const getAnimeLabel = (it) => String(it?.animeTitle || it?.title || it?._title || it?.animeId || "Anime").trim();

  const globalSortedMembersDesc = (allTitlesForPop || [])
    .map((t) => +t?._members || 0)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b - a);

  const MAX_TRIES = 80;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const crit = criteria[Math.floor(Math.random() * criteria.length)];

    if (crit === "FREE") return { crit: "FREE", label: "Libre", pool: basePool };

    const seed = basePool[Math.floor(Math.random() * basePool.length)];
    if (!seed) continue;

    if (crit === "YEAR") {
      const y = getYear0(seed);
      const built = buildYearWindowPool(basePool, getYear0, y, THEME_POOL_SIZE);
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
      const y = getYear0(seed);
      const built = buildYearWindowPool(basePool, getYear0, y, THEME_POOL_SIZE);
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
      const seedStudio = getStudio0(seed);
      if (!String(seedStudio || "").trim()) continue;
      const built = buildStudioCumulativePool(basePool, getStudio0, seedStudio, THEME_POOL_SIZE);
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
      const sc = getScore0(seed);
      if (!sc) continue;
      const built = buildScoreWindowPool(basePool, getScore0, sc, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = built.delta === 0 ? `Score : ${round1(sc)}` : `Score : ${round1(sc)} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "POP_NEAR") {
      const pop = getPop0(seed);
      if (!pop) continue;
      const built = buildPopPercentBandPool(basePool, getPop0, globalSortedMembersDesc, pop, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = (built.lo === 1 && built.hi === 5) ? `Popularité : Top 1–5%` : `Popularité : Top ${built.lo}–${built.hi}%`;
      return { crit, label, pool: built.pool };
    }
  }

  return { crit: "FREE", label: "Libre", pool: basePool };
}

// ✅ Pick 2 items + thème (round indépendant)
function pickPairWithTheme(basePool, modeLocal, allTitlesForPop) {
  const MAX = 100;

  for (let i = 0; i < MAX; i++) {
    const theme = pickContentThemeEachRound(basePool, modeLocal, allTitlesForPop);
    const picked = pickUniqueN(theme.pool, 2);
    if (picked.length >= 2) return { theme, left: picked[0], right: picked[1] };
  }

  const fallback = pickUniqueN(basePool, 2);
  if (fallback.length >= 2) return { theme: { crit: "FREE", label: "Libre", pool: basePool }, left: fallback[0], right: fallback[1] };
  return null;
}

// ====== DOM ======
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

const roundLabel = document.getElementById("roundLabel");
const contentThemeLabel = document.getElementById("contentThemeLabel");

const promptLine = document.getElementById("promptLine");
const leftPick = document.getElementById("leftPick");
const rightPick = document.getElementById("rightPick");

const leftImg = document.getElementById("leftImg");
const rightImg = document.getElementById("rightImg");
const leftVid = document.getElementById("leftVid");
const rightVid = document.getElementById("rightVid");

const leftTitle = document.getElementById("leftTitle");
const rightTitle = document.getElementById("rightTitle");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

// volume songs
const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime"; // anime | songs
let totalDuels = 10;
let duelIndex = 1;

// current duel
let leftItem = null;
let rightItem = null;
let currentTheme = { crit: "FREE", label: "Libre" };

// ✅ token session (comme Tournament)
let LOAD_SESSION = 0;

// ====== UI SHOW/HIDE ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== VOLUME ======
function applyVolume() {
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "30", 10)));
  const vol = v / 100;
  [leftVid, rightVid].forEach((p) => {
    if (!p) return;
    p.muted = false;
    p.volume = vol;
  });
  volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// =======================
// VIDEO MANAGEMENT (style Tournament)
// =======================
function withCacheBuster(url) {
  const [base, frag] = url.split("#");
  const sep = base.includes("?") ? "&" : "?";
  const busted = base + sep + "t=" + Date.now();
  return frag ? busted + "#" + frag : busted;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

// snippet limiter
function installSnippetLimiter(video, startSec, endSec, session) {
  if (!video) return () => {};

  let endedOnce = false;
  let playingArmed = false;
  let wallTimer = null;

  const safeSeek = (t) => { try { video.currentTime = t; } catch {} };

  const clearWall = () => {
    if (wallTimer) { clearTimeout(wallTimer); wallTimer = null; }
  };

  const finish = () => {
    if (endedOnce) return;
    endedOnce = true;
    clearWall();
    try { video.pause(); } catch {}
    try { video.dispatchEvent(new Event("snippetended")); } catch {}
    cleanup();
  };

  const onPlaying = () => {
    if (session !== LOAD_SESSION) return;
    if (playingArmed) return;
    playingArmed = true;

    clearWall();
    wallTimer = setTimeout(() => {
      if (session !== LOAD_SESSION) return;
      finish();
    }, 60000);
  };

  const onPlay = () => {
    if (session !== LOAD_SESSION) return;
    const ct = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    if (ct < startSec - 0.25 || ct > endSec + 0.25) safeSeek(startSec);
  };

  const onTime = () => {
    if (session !== LOAD_SESSION) return;
    if (endedOnce) return;
    if (video.currentTime >= (endSec - CLIP_EPS)) finish();
  };

  const onEnded = () => {
    if (session !== LOAD_SESSION) return;
    finish();
  };

  video.addEventListener("playing", onPlaying);
  video.addEventListener("play", onPlay);
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("ended", onEnded);

  const cleanup = () => {
    clearWall();
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("play", onPlay);
    video.removeEventListener("timeupdate", onTime);
    video.removeEventListener("ended", onEnded);
  };

  return cleanup;
}

function stopVideo(video) {
  if (!video) return;
  try { video.pause(); } catch {}

  if (typeof video._cleanupSnippet === "function") {
    try { video._cleanupSnippet(); } catch {}
  }
  video._cleanupSnippet = null;

  try {
    video.removeAttribute("src");
    video.load();
  } catch {}
}

async function loadVideoWithRetry(video, url, { autoplay = false, session = 0, snippet = false } = {}) {
  if (!video || !url) return false;

  video.preload = "metadata";
  video.playsInline = true;

  stopVideo(video);
  applyVolume();

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (session !== LOAD_SESSION) return false;

    const delay = RETRY_DELAYS[attempt];
    if (delay) await sleep(delay);

    if (session !== LOAD_SESSION) return false;

    try {
      stopVideo(video);

      const src = attempt === 0 ? url : withCacheBuster(url);
      video.src = src;
      video.load();

      await waitEventOrTimeout(
        video,
        { ok: ["loadedmetadata", "loadeddata", "canplay"], fail: ["error", "abort"] },
        LOAD_TIMEOUT_MS
      );

      if (session !== LOAD_SESSION) return false;

      if (snippet) {
        const dur = video.duration;
        let start = CLIP_START_S;
        let end = CLIP_START_S + CLIP_DURATION_S;

        if (Number.isFinite(dur) && dur > 1) {
          start = Math.min(CLIP_START_S, Math.max(0, dur - 0.25));
          end = Math.min(start + CLIP_DURATION_S, Math.max(0, dur - 0.05));
        }

        video.dataset.clipStart = String(start);
        video.dataset.clipEnd = String(end);

        try { video.currentTime = start; } catch {}
        video._cleanupSnippet = installSnippetLimiter(video, start, end, session);
      }

      if (autoplay) {
        try { await video.play(); } catch {}
      }

      return true;
    } catch {
      // retry
    }
  }

  return false;
}

// ====== INIT CUSTOM UI ======
function initCustomUI() {
  // Mode pills
  document.querySelectorAll("#modePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modePills .pill").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      currentMode = btn.dataset.mode; // anime | songs
      updateModeVisibility();
      updatePreview();
    });
  });

  // Type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Song pills (songs)
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));
  roundCountEl.addEventListener("input", () => updatePreview());

  // Apply (standard inchangé)
  applyBtn.addEventListener("click", () => {
    const pool = applyFilters();
    totalDuels = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);
    if (!pool || pool.length < 2) return;
    startGame();
  });

  // Duel clicks
  leftPick.addEventListener("click", () => handlePick("left"));
  rightPick.addEventListener("click", () => handlePick("right"));

  updateModeVisibility();
  syncLabels();
}

function updateModeVisibility() {
  songsRow.style.display = currentMode === "songs" ? "flex" : "none";
}

function modeLabel() {
  return currentMode === "songs" ? "Songs" : "Anime";
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);
  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  if (currentMode === "anime") {
    let pool = allAnimes.filter((a) => a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type));

    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    return pool.map((a) => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      title: a._title,
      image: a.image || "",
      year: a._year,
      members: a._members,
      score: a._score,
      type: a._type,

      studio: a._studio || "",
      tags: Array.isArray(a._tags) ? a._tags : [],
      _year: a._year,
      _members: a._members,
      _score: a._score,
      _studio: a._studio || "",
      _tags: Array.isArray(a._tags) ? a._tags : [],
    }));
  }

  // songs mode
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);
  if (allowedSongs.length === 0) return [];

  let pool = allSongs.filter(
    (s) => s.year >= yearMin && s.year <= yearMax && allowedTypes.includes(s.type) && allowedSongs.includes(s.songType)
  );

  pool.sort((a, b) => b.members - a.members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b.score - a.score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

// ====== PREVIEW ======
function updatePreview() {
  if (!allAnimes.length) {
    previewCountEl.textContent = "⏳ Chargement de la base…";
    previewCountEl.classList.add("bad");
    previewCountEl.classList.remove("good");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    return;
  }

  const pool = applyFilters();
  const duelsWanted = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);

  const ok = pool.length >= 2;
  const label = currentMode === "songs" ? "Songs" : "Animes";

  previewCountEl.textContent = ok
    ? `📚 ${label} disponibles : ${pool.length} (OK) — Duels demandés: ${duelsWanted}`
    : `📚 ${label} disponibles : ${pool.length} (Min 2)`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== GAME UI ======
function resetDuelUI() {
  LOAD_SESSION++;

  stopVideo(leftVid);
  stopVideo(rightVid);

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  leftPick.disabled = false;
  rightPick.disabled = false;

  [leftPick, rightPick].forEach((btn) => {
    btn.classList.remove("lor-chosen", "lor-loser", "lor-locked");
  });
}

function setupModeUI() {
  const isSongs = currentMode === "songs";
  volumeRow.style.display = isSongs ? "flex" : "none";
  if (isSongs) applyVolume();
}

function updateTopLabels() {
  roundLabel.textContent = `${modeLabel()} — Duel ${duelIndex} / ${totalDuels}`;
}

function updateThemeLabel() {
  if (!contentThemeLabel) return;
  const label = currentTheme?.label || "Libre";
  contentThemeLabel.textContent = `🎯 Thème contenu : ${label}`;
}

function updatePrompt() {
  promptLine.textContent = currentMode === "songs" ? "Choisis ton Song préféré" : "Choisis ton Anime préféré";
}

function showMediaForMode() {
  const isSongs = currentMode === "songs";
  leftImg.style.display = isSongs ? "none" : "block";
  rightImg.style.display = isSongs ? "none" : "block";
  leftVid.style.display = isSongs ? "block" : "none";
  rightVid.style.display = isSongs ? "block" : "none";
}

// ====== DUEL GENERATION ======
function generateNewDuelPair() {
  const basePool = applyFilters();
  if (!basePool || basePool.length < 2) return false;

  const pack = pickPairWithTheme(basePool, currentMode, allAnimes);
  if (!pack) return false;

  currentTheme = { crit: pack.theme.crit, label: pack.theme.label };
  leftItem = pack.left;
  rightItem = pack.right;
  return true;
}

async function renderDuel() {
  updateTopLabels();
  updateThemeLabel();
  updatePrompt();
  showMediaForMode();

  leftTitle.textContent = currentMode === "songs" ? formatSongTitle(leftItem) : (leftItem?.title || "");
  rightTitle.textContent = currentMode === "songs" ? formatSongTitle(rightItem) : (rightItem?.title || "");

  if (currentMode === "anime") {
    stopVideo(leftVid);
    stopVideo(rightVid);
    leftImg.src = leftItem?.image || "";
    rightImg.src = rightItem?.image || "";
    resultDiv.textContent = "";
    nextBtn.style.display = "none";
    leftPick.disabled = false;
    rightPick.disabled = false;
    return;
  }

  const session = LOAD_SESSION;

  stopVideo(leftVid);
  stopVideo(rightVid);
  applyVolume();

  let rightReady = false;
  let leftFinished = false;

  const startRightIfPossible = async () => {
    if (session !== LOAD_SESSION) return;
    if (!leftFinished || !rightReady) return;

    const st = parseFloat(rightVid.dataset.clipStart || String(CLIP_START_S));
    if (Number.isFinite(st)) {
      try { rightVid.currentTime = st; } catch {}
    }

    applyVolume();
    try { await rightVid.play(); } catch {}
  };

  const onLeftDone = () => {
    if (session !== LOAD_SESSION) return;
    leftFinished = true;
    startRightIfPossible();
  };

  leftVid.addEventListener("snippetended", onLeftDone, { once: true });
  leftVid.addEventListener("ended", onLeftDone, { once: true });

  const rightPromise = (rightItem?.url)
    ? loadVideoWithRetry(rightVid, rightItem.url, { autoplay: false, session, snippet: true })
    : Promise.resolve(false);

  rightPromise.then((ok) => {
    if (session !== LOAD_SESSION) return;
    rightReady = !!ok;
    startRightIfPossible();
  });

  if (leftItem?.url) {
    const okLeft = await loadVideoWithRetry(leftVid, leftItem.url, { autoplay: true, session, snippet: true });
    if (session !== LOAD_SESSION) return;
    if (!okLeft) onLeftDone();
  } else {
    onLeftDone();
  }

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  leftPick.disabled = false;
  rightPick.disabled = false;
}

/* =======================
   ✅ PARCOURS: Abort UI
   ======================= */
function parcoursAbort(message, score = 0, total = 1) {
  // force écran jeu (sans impacter standard)
  if (IS_PARCOURS) {
    document.body.classList.add("parcours");
    const backBtn = document.getElementById("back-to-menu");
    if (backBtn) backBtn.style.display = "none";
  }

  LOAD_SESSION++;
  stopVideo(leftVid);
  stopVideo(rightVid);

  showGame();
  setupModeUI();

  // message visible
  resultDiv.textContent = message;
  nextBtn.style.display = "block";
  nextBtn.textContent = "Continuer le parcours";
  nextBtn.onclick = () => {
    nextBtn.disabled = true;
    sendParcoursScore(score, total);
  };

  // verrouille les choix
  leftPick.disabled = true;
  rightPick.disabled = true;
}

/* =======================
   FIN DE JEU
   ======================= */
function finishGame(message) {
  LOAD_SESSION++;
  stopVideo(leftVid);
  stopVideo(rightVid);

  resultDiv.textContent = message;
  nextBtn.style.display = "block";

  if (IS_PARCOURS) {
    nextBtn.textContent = "Continuer le parcours";
    nextBtn.onclick = () => {
      nextBtn.disabled = true;
      sendParcoursScore(1, 1);
    };
    // pas de retour réglages en parcours
    showGame();
    return;
  }

  // Standard : inchangé
  nextBtn.textContent = "Retour réglages";
  nextBtn.onclick = () => {
    showCustomization();
    updatePreview();
  };
}

// ====== GAME FLOW ======
function startGame() {
  resetDuelUI();
  showGame();
  setupModeUI();

  totalDuels = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);
  duelIndex = 1;

  const ok = generateNewDuelPair();
  if (!ok) {
    if (IS_PARCOURS) {
      parcoursAbort("❌ Pas assez d’items (min 2) avec ces réglages.", 0, 1);
      return;
    }
    finishGame("❌ Pas assez d’items (min 2) avec ces réglages.");
    return;
  }

  renderDuel();
}

// ====== PICK ======
function handlePick(side) {
  if (!leftItem || !rightItem) return;

  leftPick.disabled = true;
  rightPick.disabled = true;

  leftPick.classList.add("lor-locked");
  rightPick.classList.add("lor-locked");

  const chosenBtn = side === "left" ? leftPick : rightPick;
  const otherBtn = side === "left" ? rightPick : leftPick;

  chosenBtn.classList.add("lor-chosen");
  otherBtn.classList.add("lor-loser");

  if (currentMode === "songs") {
    try { leftVid.pause(); } catch {}
    try { rightVid.pause(); } catch {}
    if (typeof leftVid._cleanupSnippet === "function") { try { leftVid._cleanupSnippet(); } catch {} }
    if (typeof rightVid._cleanupSnippet === "function") { try { rightVid._cleanupSnippet(); } catch {} }
    leftVid._cleanupSnippet = null;
    rightVid._cleanupSnippet = null;
  }

  const chosen = side === "left" ? leftItem : rightItem;
  resultDiv.textContent = `✅ Choix validé : ${currentMode === "songs" ? formatSongTitle(chosen) : (chosen.title || "")}`;

  if (duelIndex >= totalDuels) {
    finishGame("✅ Terminé !");
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Suivant";
  nextBtn.disabled = false;
  nextBtn.onclick = () => {
    duelIndex++;

    resetDuelUI();

    const ok = generateNewDuelPair();
    if (!ok) {
      // en pratique rare si pool >= 2 ; on considère terminé
      if (IS_PARCOURS) {
        finishGame("✅ Terminé (pas assez d’items pour continuer).");
        return;
      }
      finishGame("✅ Terminé (pas assez d’items pour continuer).");
      return;
    }

    renderDuel();
  };
}

/* =======================
   ✅ PARCOURS: appliquer params à l'UI
   ======================= */
function applyParcoursParamsToUI() {
  if (!IS_PARCOURS) return;

  const cfg = loadParcoursCfg();
  const has = (x) => x != null && x !== "";

  // --- Mode (URL > cfg) ---
  const modeFromCfg = (cfg && (cfg.mode || cfg.leftOrRightMode)) || null;
  const wantedMode =
    (FORCED_MODE === "anime" || FORCED_MODE === "songs")
      ? FORCED_MODE
      : (modeFromCfg === "anime" || modeFromCfg === "songs")
      ? modeFromCfg
      : null;

  if (wantedMode) {
    currentMode = wantedMode;
    document.querySelectorAll("#modePills .pill").forEach((b) => {
      const on = b.dataset.mode === wantedMode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // --- Sliders (URL > cfg) ---
  const trySetInt = (el, val, min, max) => {
    if (!el || !has(val)) return;
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return;
    el.value = String(Math.max(min, Math.min(max, n)));
  };

  trySetInt(popEl, has(PARAM_POP) ? PARAM_POP : cfg?.popPercent, 1, 100);
  trySetInt(scoreEl, has(PARAM_SCORE) ? PARAM_SCORE : cfg?.scorePercent, 1, 100);
  trySetInt(yearMinEl, has(PARAM_YMIN) ? PARAM_YMIN : cfg?.yearMin, 1900, 2100);
  trySetInt(yearMaxEl, has(PARAM_YMAX) ? PARAM_YMAX : cfg?.yearMax, 1900, 2100);
  trySetInt(roundCountEl, has(PARAM_DUELS) ? PARAM_DUELS : cfg?.duels, 1, 100);

  // --- Types pills (URL > cfg.types) ---
  const typesList = has(PARAM_TYPES)
    ? PARAM_TYPES.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(cfg?.types)
    ? cfg.types
    : null;

  if (typesList && typesList.length) {
    const want = new Set(typesList);
    const pills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
    pills.forEach((p) => {
      const t = p.dataset.type;
      const on = want.has(t);
      p.classList.toggle("active", on);
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // assure au moins 1 type
  const typeActive = document.querySelectorAll("#typePills .pill.active").length;
  if (!typeActive) {
    document.querySelectorAll("#typePills .pill[data-type]").forEach((p) => {
      const t = p.dataset.type;
      const on = t === "TV" || t === "Movie";
      p.classList.toggle("active", on);
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // --- Songs pills (URL > cfg.songs) ---
  const normalizeSongsTokenToCode = (x) => {
    const s = String(x || "").trim().toLowerCase();
    if (!s) return null;
    if (s === "op" || s === "opening") return "OP";
    if (s === "ed" || s === "ending") return "ED";
    if (s === "in" || s === "insert") return "IN";
    // déjà au bon format ?
    if (s === "op" || s === "ed" || s === "in") return s.toUpperCase();
    return null;
  };

  const songsListRaw = has(PARAM_SONGS)
    ? PARAM_SONGS.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(cfg?.songs)
    ? cfg.songs
    : null;

  if (songsListRaw && songsListRaw.length) {
    const wantCodes = new Set(
      songsListRaw.map(normalizeSongsTokenToCode).filter(Boolean)
    );

    const pills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
    pills.forEach((p) => {
      const code = String(p.dataset.song || "").toUpperCase(); // OP/ED/IN
      const on = wantCodes.has(code);
      p.classList.toggle("active", on);
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // assure au moins 1 song si mode songs
  if (currentMode === "songs") {
    const songActive = document.querySelectorAll("#songPills .pill.active").length;
    if (!songActive) {
      document.querySelectorAll("#songPills .pill[data-song]").forEach((p) => {
        const code = String(p.dataset.song || "").toUpperCase();
        const on = code === "OP";
        p.classList.toggle("active", on);
        p.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  // clamp + labels + preview
  clampYearSliders();
  updateModeVisibility();

  popValEl.textContent = popEl.value;
  scoreValEl.textContent = scoreEl.value;
  yearMinValEl.textContent = yearMinEl.value;
  yearMaxValEl.textContent = yearMaxEl.value;

  updatePreview();
}

// ====== LOAD DATA ======
fetch("../data/licenses_only.json")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then((json) => {
    const raw = normalizeAnimeList(json);

    allAnimes = (Array.isArray(raw) ? raw : []).map((a) => {
      const title = getDisplayTitle(a);
      const genres = extractTagNames(a.genres);
      const themes = extractTagNames(a.themes);
      const tags = [...genres, ...themes];

      return {
        ...a,
        _title: title,
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
        _studio: (typeof a.studio === "string" ? a.studio : (a.studio?.name || "")) || "",
        _tags: tags,
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    applyVolume();

    if (IS_PARCOURS) {
      // applique params + autostart
      applyParcoursParamsToUI();

      // check pool
      const pool = applyFilters();
      totalDuels = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);

      if (!pool || pool.length < 2) {
        parcoursAbort("❌ Pool insuffisant : min 2 items avec ces réglages.", 0, 1);
        return;
      }

      startGame();
    } else {
      // Standard : inchangé
      showCustomization();
    }
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    console.error(e);

    if (IS_PARCOURS) {
      parcoursAbort("❌ Erreur chargement base : " + e.message, 0, 1);
    }
  });
