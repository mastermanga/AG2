// =======================
// Anime Tournament — script.js (COMPLET)
// + Theme contenu (MIN 64, fallback Libre)
// + Songs: extrait start 45s, durée 20s (stop auto)
// =======================

// =======================
// CONFIG
// =======================
const DATA_URL = "../data/licenses_only.json";
const TOTAL_MATCH_ITEMS = 32;

// min pool thème contenu
const MIN_THEME_POOL = 64;

const MIN_REQUIRED_TITLES = 64;
const MIN_REQUIRED_SONGS = 64;

// Songs snippet
const SONG_START_SEC = 45;
const SONG_PLAY_SEC  = 20;

// retries vidéos
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const LOAD_TIMEOUT_MS = 6000;

// =======================
// GLOBAL STATE
// =======================
let ALL_TITLES = [];
let items = [];              // 32 items sélectionnés (animes OU songs)
let mode = "anime";          // "anime" | "songs"

// thème contenu courant
let CONTENT_THEME = { label: "Libre", crit: "FREE", poolSize: 0 };

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
  const parts = s.split(/\s+/);
  const y = parseInt(parts[1] || parts[0] || "0", 10);
  return Number.isFinite(y) ? y : 0;
}

function getYearFromSeasonStr(seasonStr, fallback = 0) {
  const s = (seasonStr ? String(seasonStr) : "").trim();
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

function clamp01(x){ return Math.min(1, Math.max(0, x)); }

// unique pick
function pickNUnique(pool, n, getKey) {
  const out = [];
  const seen = new Set();
  const shuffled = shuffle([...pool]);
  for (const it of shuffled) {
    if (out.length >= n) break;
    const k = getKey(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

// =======================
// THEME CONTENU HELPERS
// =======================
function norm(s){ return (s || "").toString().trim().toLowerCase(); }

function includesStudio(studio, needle) {
  const s = norm(studio);
  const n = norm(needle);
  if (!s || !n) return false;
  return s.includes(n);
}

function hasTagFromTags(tagsArr, tag) {
  const t = norm(tag);
  const arr = Array.isArray(tagsArr) ? tagsArr : [];
  return arr.some(x => norm(x) === t);
}

function nearbyPool(pool, getNum, target, want = 64) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const arr = [...pool].sort((a,b) => getNum(a) - getNum(b));

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

function parseSeasonToSerial(seasonStr) {
  const s = norm(seasonStr);
  if (!s) return null;

  const m = s.match(/(winter|spring|summer|fall)\s+(\d{4})/i);
  if (!m) return null;

  const season = norm(m[1]);
  const year = parseInt(m[2], 10);
  if (!Number.isFinite(year)) return null;

  const idx = (season === "winter") ? 0
            : (season === "spring") ? 1
            : (season === "summer") ? 2
            : 3;

  return year * 4 + idx;
}

/**
 * Thème contenu:
 * - Anime: 6 critères équiprobables
 * - Songs: 8 critères équiprobables (ajoute ARTIST + SONG_SEASON)
 * - MIN 64: si impossible => fallback Libre
 * - Studio: agrandit en ajoutant des studios via nouveaux seeds jusqu'à 64 sinon Libre
 */
function pickContentThemeAuto(basePool, mode) {
  if (!Array.isArray(basePool) || basePool.length < MIN_THEME_POOL) {
    return { label: "Libre", crit: "FREE_SMALL_BASE", pool: basePool, poolSize: basePool?.length || 0 };
  }

  const isSongs = mode === "songs";

  // critères équiprobables
  const CRIT_ANIME = ["FREE","YEAR","STUDIO","TAG","SCORE_NEAR","POP_NEAR"];
  const CRIT_SONGS = ["FREE","YEAR","SONG_SEASON","STUDIO","TAG","SCORE_NEAR","POP_NEAR","ARTIST"];
  const CRITS = isSongs ? CRIT_SONGS : CRIT_ANIME;

  const crit = CRITS[Math.floor(Math.random() * CRITS.length)];

  // getters
  const getYear   = (it) => isSongs ? (it.animeYear || 0) : (it._year || 0);
  const getStudio = (it) => isSongs ? (it.animeStudio || "") : (it._studio || "");
  const getTags   = (it) => isSongs ? (it.tags || []) : (it._tags || []);
  const getScore  = (it) => isSongs ? (it.animeScore || 0) : (it._score || 0);
  const getPop    = (it) => isSongs ? (it.animeMembers || 0) : (it._members || 0);

  const pickSeed = (predicate, tries = 30) => {
    for (let i = 0; i < tries; i++) {
      const s = basePool[Math.floor(Math.random() * basePool.length)];
      if (s && predicate(s)) return s;
    }
    return null;
  };

  // FREE
  if (crit === "FREE") {
    return { label: "Libre", crit: "FREE", pool: basePool, poolSize: basePool.length };
  }

  // YEAR (±N)
  if (crit === "YEAR") {
    const seed = pickSeed(it => getYear(it) > 0, 40);
    if (!seed) return { label: "Libre", crit: "FREE_NO_YEAR", pool: basePool, poolSize: basePool.length };

    const y0 = getYear(seed);
    let pool = basePool.filter(it => getYear(it) === y0);
    let d = 0;

    while (pool.length < MIN_THEME_POOL && d < 25) {
      d++;
      const a = y0 - d;
      const b = y0 + d;
      pool = basePool.filter(it => {
        const y = getYear(it);
        return y >= a && y <= b;
      });
    }

    if (pool.length < MIN_THEME_POOL) return { label: "Libre", crit: "FREE_YEAR_TOO_SMALL", pool: basePool, poolSize: basePool.length };

    const label = d === 0 ? `Année : ${y0}` : `Année : ${y0} (±${d})`;
    return { label, crit: "YEAR", pool, poolSize: pool.length };
  }

  // STUDIO (multi-seeds => OR)
  if (crit === "STUDIO") {
    const seed = pickSeed(it => !!getStudio(it), 50);
    if (!seed) return { label: "Libre", crit: "FREE_NO_STUDIO", pool: basePool, poolSize: basePool.length };

    const studios = new Set();
    const first = (getStudio(seed) || "").trim();
    if (first) studios.add(first);

    let pool = basePool.filter(it => {
      const st = getStudio(it);
      for (const s of studios) if (includesStudio(st, s)) return true;
      return false;
    });

    let safety = 0;
    while (pool.length < MIN_THEME_POOL && safety < 40) {
      safety++;

      const s2 = pickSeed(it => !!getStudio(it), 20);
      if (!s2) break;

      const st2 = (getStudio(s2) || "").trim();
      const before = studios.size;
      if (st2) studios.add(st2);
      if (studios.size === before) continue;

      pool = basePool.filter(it => {
        const st = getStudio(it);
        for (const s of studios) if (includesStudio(st, s)) return true;
        return false;
      });
    }

    if (pool.length < MIN_THEME_POOL) return { label: "Libre", crit: "FREE_STUDIO_TOO_SMALL", pool: basePool, poolSize: basePool.length };

    const extra = studios.size - 1;
    const label = extra > 0 ? `Studio : ${first} (+${extra})` : `Studio : ${first}`;
    return { label, crit: "STUDIO", pool, poolSize: pool.length };
  }

  // TAG (OR progressif depuis le seed)
  if (crit === "TAG") {
    const seed = pickSeed(it => Array.isArray(getTags(it)) && getTags(it).length > 0, 50);
    if (!seed) return { label: "Libre", crit: "FREE_NO_TAG", pool: basePool, poolSize: basePool.length };

    const tags = [...getTags(seed)].filter(Boolean);
    shuffle(tags);

    const picked = [];
    let pool = [];
    for (const t of tags) {
      picked.push(t);
      pool = basePool.filter(it => {
        const arr = getTags(it);
        return picked.some(pt => hasTagFromTags(arr, pt));
      });
      if (pool.length >= MIN_THEME_POOL) break;
    }

    if (pool.length < MIN_THEME_POOL) return { label: "Libre", crit: "FREE_TAG_TOO_SMALL", pool: basePool, poolSize: basePool.length };

    const label = picked.length === 1 ? `Tag : ${picked[0]}` : `Tag : ${picked[0]} (+${picked.length - 1})`;
    return { label, crit: "TAG", pool, poolSize: pool.length };
  }

  // SCORE_NEAR
  if (crit === "SCORE_NEAR") {
    const seed = pickSeed(it => getScore(it) > 0, 40);
    if (!seed) return { label: "Libre", crit: "FREE_NO_SCORE", pool: basePool, poolSize: basePool.length };

    const pool = nearbyPool(basePool, getScore, getScore(seed), MIN_THEME_POOL);
    if (pool.length < MIN_THEME_POOL) return { label: "Libre", crit: "FREE_SCORE_TOO_SMALL", pool: basePool, poolSize: basePool.length };

    return { label: "Score proche", crit: "SCORE_NEAR", pool, poolSize: pool.length };
  }

  // POP_NEAR
  if (crit === "POP_NEAR") {
    const seed = pickSeed(it => getPop(it) > 0, 40);
    if (!seed) return { label: "Libre", crit: "FREE_NO_POP", pool: basePool, poolSize: basePool.length };

    const pool = nearbyPool(basePool, getPop, getPop(seed), MIN_THEME_POOL);
    if (pool.length < MIN_THEME_POOL) return { label: "Libre", crit: "FREE_POP_TOO_SMALL", pool: basePool, poolSize: basePool.length };

    return { label: "Popularité proche", crit: "POP_NEAR", pool, poolSize: pool.length };
  }

  // SONG_SEASON (songs only) ± saisons
  if (crit === "SONG_SEASON" && isSongs) {
    const seed = pickSeed(it => it.songSeasonSerial != null, 60);
    if (!seed) return { label: "Libre", crit: "FREE_NO_SEASON", pool: basePool, poolSize: basePool.length };

    const s0 = seed.songSeasonSerial;
    let pool = basePool.filter(it => it.songSeasonSerial === s0);
    let d = 0;

    while (pool.length < MIN_THEME_POOL && d < 60) {
      d++;
      const a = s0 - d;
      const b = s0 + d;
      pool = basePool.filter(it => it.songSeasonSerial != null && it.songSeasonSerial >= a && it.songSeasonSerial <= b);
    }

    if (pool.length < MIN_THEME_POOL) return { label: "Libre", crit: "FREE_SEASON_TOO_SMALL", pool: basePool, poolSize: basePool.length };

    const label = d === 0 ? `Saison : ${seed.songSeason}` : `Saison : ${seed.songSeason} (±${d} saisons)`;
    return { label, crit: "SONG_SEASON", pool, poolSize: pool.length };
  }

  // ARTIST (songs only) multi-seeds => OR artistes
  if (crit === "ARTIST" && isSongs) {
    const seed = pickSeed(it => Array.isArray(it.artistsArr) && it.artistsArr.filter(Boolean).length > 0, 80);
    if (!seed) return { label: "Libre", crit: "FREE_NO_ARTIST", pool: basePool, poolSize: basePool.length };

    const artists = new Set();
    const firstArtist = seed.artistsArr.filter(Boolean)[Math.floor(Math.random() * seed.artistsArr.filter(Boolean).length)];
    if (firstArtist) artists.add(firstArtist);

    let pool = basePool.filter(it => Array.isArray(it.artistsArr) && it.artistsArr.some(a => artists.has(a)));

    let safety = 0;
    while (pool.length < MIN_THEME_POOL && safety < 50) {
      safety++;

      const s2 = pickSeed(it => Array.isArray(it.artistsArr) && it.artistsArr.filter(Boolean).length > 0, 30);
      if (!s2) break;

      const arr = s2.artistsArr.filter(Boolean);
      const a2 = arr[Math.floor(Math.random() * arr.length)];
      const before = artists.size;
      if (a2) artists.add(a2);
      if (artists.size === before) continue;

      pool = basePool.filter(it => Array.isArray(it.artistsArr) && it.artistsArr.some(a => artists.has(a)));
    }

    if (pool.length < MIN_THEME_POOL) return { label: "Libre", crit: "FREE_ARTIST_TOO_SMALL", pool: basePool, poolSize: basePool.length };

    const extra = artists.size - 1;
    const label = extra > 0 ? `Artiste : ${firstArtist} (+${extra})` : `Artiste : ${firstArtist}`;
    return { label, crit: "ARTIST", pool, poolSize: pool.length };
  }

  // fallback ultime
  return { label: "Libre", crit: "FREE_FALLBACK", pool: basePool, poolSize: basePool.length };
}

// =======================
// BASIC UI
// =======================
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = "../index.html";
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
    video.muted = false; // ✅ pas de mute
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
    GLOBAL_VOLUME = clamp01(vv);
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
// THEME UI
// =======================
function updateThemeIndicator() {
  const el = document.getElementById("theme-indicator");
  if (!el) return;

  const shouldShow = document.body.classList.contains("game-started");
  el.style.display = shouldShow ? "flex" : "none";

  const label = CONTENT_THEME?.label || "Libre";
  const poolSize = CONTENT_THEME?.poolSize || 0;

  el.textContent = `🎯 Thème contenu : ${label} — Pool: ${poolSize}`;
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
    document.getElementById("theme-indicator"),
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

  const themeBox = document.getElementById("theme-indicator");
  if (themeBox) themeBox.style.display = "";

  const classement = document.getElementById("classement");
  if (classement) classement.style.display = "none";

  const replay = document.getElementById("next-match-btn");
  if (replay) replay.style.display = "none";

  updateThemeIndicator();
  updateVolumeVisibility();
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
// BUILD SONGS (avec meta complète)
// =======================
function buildSongsWithMeta(titles, o) {
  const tracks = [];

  const addList = (t, list, kindKey, kindLabel) => {
    (list || []).forEach((s) => {
      if (!s?.video) return;

      const artistsArr = Array.isArray(s.artists) ? s.artists.filter(Boolean) : [];
      const seasonStr = String(s.season || "").trim();
      const seasonSerial = parseSeasonToSerial(seasonStr);

      tracks.push({
        _key: `song|${s.video}|${kindKey}|${s.number || ""}|${s.name || ""}`,
        video: s.video,
        label: `${t._title} ${kindLabel} ${s.number ?? ""} : ${s.name ?? ""}${
          artistsArr.length ? " by " + artistsArr.join(", ") : ""
        }`.replace(/\s+/g, " ").trim(),

        // compat pour tes top% actuels
        _members: t._members,
        _score: t._score,
        _year: t._year,
        _type: t._type,

        // ✅ meta pour theme contenu (songs)
        songType: kindKey,              // opening / ending / insert
        songSeason: seasonStr || "",
        songSeasonSerial: seasonSerial,
        songYear: getYearFromSeasonStr(seasonStr, t._year),

        artistsArr,

        animeYear: t._year,
        animeStudio: t._studio || "",
        animeMembers: t._members,
        animeScore: t._score,
        animeType: t._type,
        tags: Array.isArray(t._tags) ? t._tags : [],
      });
    });
  };

  titles.forEach((t) => {
    if (o.incOP) addList(t, t.song?.openings, "opening", "Opening");
    if (o.incED) addList(t, t.song?.endings,  "ending",  "Ending");
    if (o.incIN) addList(t, t.song?.inserts,  "insert",  "Insert");
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
        _key: `anime|${a.mal_id || a.license_id || title}`,
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
    showCustomization();
    updateVolumeVisibility();
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });

// =======================
// START GAME
// =======================
function startGame() {
  if (!ALL_TITLES.length) return;

  resetTournament();

  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);

  if (mode === "anime") {
    if (titles.length < minTitlesNeeded) {
      alert(`Pas assez de titres (${titles.length}/${minTitlesNeeded}).`);
      return;
    }

    // ✅ theme contenu
    CONTENT_THEME = pickContentThemeAuto(titles, "anime");

    const finalPool = Array.isArray(CONTENT_THEME.pool) ? CONTENT_THEME.pool : titles;
    const picked = pickNUnique(finalPool, TOTAL_MATCH_ITEMS, (t) => t._key || `anime|${t.mal_id || t._title}`);

    items = picked.map((t) => ({
      _key: t._key,
      image: t.image,
      title: t._title,
    }));

  } else {
    const songs = filterSongs(ALL_TITLES, o);
    const minSongsNeeded = Math.max(MIN_REQUIRED_SONGS, TOTAL_MATCH_ITEMS);

    if (songs.length < minSongsNeeded) {
      alert(`Pas assez de songs (${songs.length}/${minSongsNeeded}).`);
      return;
    }

    // ✅ theme contenu (songs: + season + artist)
    CONTENT_THEME = pickContentThemeAuto(songs, "songs");

    const finalPool = Array.isArray(CONTENT_THEME.pool) ? CONTENT_THEME.pool : songs;
    const picked = pickNUnique(finalPool, TOTAL_MATCH_ITEMS, (s) => s._key || `song|${s.video}`);

    items = picked;
  }

  showGame();
  updateThemeIndicator();
  initTournament();
}

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

  box.textContent = `Round ${roundNumber} — Match ${currentIndex}/${totalThisRound} — Mode: ${mode === "anime" ? "Animes" : "Songs"}`;
}

// =======================
// CLEANUP MEDIA
// =======================
function cleanupCurrentMedia() {
  const box = document.getElementById("duel-container");
  if (!box) return;

  box.querySelectorAll("video").forEach((v) => {
    try {
      if (typeof v._snippetCleanup === "function") v._snippetCleanup();
      v._snippetCleanup = null;

      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {}
  });
}

// =======================
// VIDEO LOAD + token
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

/**
 * ✅ Songs snippet:
 * - start 45s
 * - durée 20s
 * - stop auto à endTime
 */
function setupSongSnippet(video, statusEl, session) {
  if (!video) return () => {};

  let start = SONG_START_SEC;
  let endTime = SONG_START_SEC + SONG_PLAY_SEC;
  let armed = false;

  const computeTimes = () => {
    const dur = video.duration;
    if (Number.isFinite(dur) && dur > 1) {
      start = Math.min(SONG_START_SEC, Math.max(0, dur - 0.25));
      endTime = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
    } else {
      start = SONG_START_SEC;
      endTime = SONG_START_SEC + SONG_PLAY_SEC;
    }
  };

  const arm = () => {
    if (session !== LOAD_SESSION) return;
    computeTimes();
    try { video.currentTime = start; } catch {}
    armed = true;
    if (statusEl) statusEl.textContent = `🎧 Extrait: ${start.toFixed(0)}s → ${endTime.toFixed(0)}s`;
  };

  const onPlay = () => {
    if (session !== LOAD_SESSION) return;
    if (!armed) arm();

    // si le user lance depuis 0, on replace au start
    if (video.currentTime < start - 0.5 || video.currentTime > endTime + 0.2) {
      try { video.currentTime = start; } catch {}
    }
  };

  const onTimeUpdate = () => {
    if (session !== LOAD_SESSION) return;
    if (!armed) return;
    if (video.currentTime >= endTime) {
      try { video.pause(); } catch {}
      if (statusEl) statusEl.textContent = "⏹️ Extrait terminé (rejoue si tu veux)";
    }
  };

  const onLoadedMeta = () => arm();

  video.addEventListener("loadedmetadata", onLoadedMeta);
  video.addEventListener("play", onPlay);
  video.addEventListener("timeupdate", onTimeUpdate);

  // si metadata déjà là
  if (video.readyState >= 1) arm();

  return () => {
    video.removeEventListener("loadedmetadata", onLoadedMeta);
    video.removeEventListener("play", onPlay);
    video.removeEventListener("timeupdate", onTimeUpdate);
  };
}

async function loadVideoWithRetry(video, url, { autoplay = false, session = 0 } = {}) {
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
        if (typeof video._snippetCleanup === "function") video._snippetCleanup();
        video._snippetCleanup = null;

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

      // ✅ songs snippet uniquement sur duels
      if (mode === "songs") {
        video._snippetCleanup = setupSongSnippet(video, status, session);
      }

      const onWaiting = () => { if (status) status.textContent = "⏳ Buffering…"; };
      const onPlaying = () => { if (status) status.textContent = "✅ Lecture"; };
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("stalled", onWaiting);
      video.addEventListener("playing", onPlaying);

      if (autoplay) {
        try {
          // place au start avant play (ça aide certains navigateurs)
          if (mode === "songs") {
            try { video.currentTime = SONG_START_SEC; } catch {}
          }

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

  if (mode === "songs") {
    const left = cardEls.find((c) => c.idx === currentMatch.a);
    if (left?.video && left?.url) {
      await loadVideoWithRetry(left.video, left.url, { autoplay: true, session });
      applyGlobalVolumeToVideo(left.video);
    }

    const right = cardEls.find((c) => c.idx === currentMatch.b);
    if (right?.video && right?.url) {
      await loadVideoWithRetry(right.video, right.url, { autoplay: false, session });
      applyGlobalVolumeToVideo(right.video);
    }

    applyGlobalVolumeToAllVideos();
  }
}

// =======================
// MATCH FLOW
// =======================
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
    replay.textContent = "Rejouer";
    replay.onclick = () => {
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

  if (duel) duel.innerHTML = "";
  if (classement) {
    classement.innerHTML = "";
    classement.style.display = "none";
  }
  if (replay) replay.style.display = "none";
  if (roundBox) roundBox.textContent = "";

  items = [];
  losses = [];
  eliminationOrder = [];
  aliveWB = [];
  aliveLB = [];
  roundNumber = 1;
  roundMatches = [];
  roundMatchIndex = 0;
  currentMatch = null;

  CONTENT_THEME = { label: "Libre", crit: "FREE", poolSize: 0 };
  updateThemeIndicator();
  updateVolumeVisibility();
}
