/**********************
 * Blind Ranking (Anime / Songs)
 * - Thème contenu: pool 64 + affichage "🎯 Thème contenu : ..."
 * - Songs: extrait 45s -> 20s
 * - Grille ranking: JAMAIS de vidéo (uniquement image cover)
 * - Loader anti-bug media + retries: 1 + 5 retries (2/4/6/8/10s)
 **********************/

// ====== MENU & THEME ======
document.getElementById("back-to-menu").addEventListener("click", () => {
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
    document.querySelectorAll(".info-wrap.open").forEach(w => w.classList.remove("open"));
  }
});

// ====== HELPERS ======
const MIN_REQUIRED = 64;
const THEME_POOL_SIZE = 64;

// Songs snippet
const SONG_START_SEC = 45;
const SONG_PLAY_SEC = 20;

// retries: 1 essai + 5 retries => 0, 2s, 4s, 6s, 8s, 10s
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
    (a.animethemes && a.animethemes.name) ||
    "Titre inconnu"
  );
}

function getYear(a) {
  const s = ((a && a.season) ? String(a.season) : "").trim(); // ex "spring 2013"
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

// ====== SONG LABEL ======
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

        songType: b.type, // OP/ED/IN
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",
        songArtistsArr: artistsArr,
        songSeason,
        songYear,

        // anime meta (pour thèmes)
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

        // media
        url,
        _key: `${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
      });
    }
  }
  return out;
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

// ====== URL (PARCOURS) compat ======
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
const forcedMode = urlParams.get("mode"); // "anime" | "songs" éventuel

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime"; // anime | songs
let filteredPool = [];

// ====== THEME CONTENU ======
let currentTheme = null; // { crit, label, pool: [64] }

// ====== GAME STATE ======
let totalRounds = 1;
let currentRound = 1;

let selectedItems = [];
let currentIndex = 0;
let rankings = new Array(10).fill(null);

// tokens anti-bug media
let roundToken = 0;
let mediaToken = 0;

// snippet cleanup
let snippetCleanup = null;

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
  if (!songPlayer) return;
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "30", 10)));
  songPlayer.muted = false;
  songPlayer.volume = v / 100;
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== THEME UI ======
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

// ====== THEME LOGIC (pool 64) ======
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
  for (const it of shuffleInPlace([...pool])) {
    if (out.length >= n) break;
    const k = it?._key || JSON.stringify(it);
    if (used.has(k)) continue;
    used.add(k);
    out.push(it);
  }
  return out;
}

function popularityTopPercent(pool, seed, getPop) {
  const sorted = [...pool].sort((a, b) => getPop(b) - getPop(a));
  const idx = sorted.findIndex(x => (x?._key && seed?._key && x._key === seed._key));
  const rank = (idx >= 0) ? (idx + 1) : 1;
  const raw = Math.ceil((rank / Math.max(1, sorted.length)) * 100);
  const pct = Math.max(5, Math.min(100, Math.round(raw / 5) * 5));
  return pct;
}

function hasTag(it, tag) {
  const t = norm(tag);
  const tags = Array.isArray(it._tags) ? it._tags : (Array.isArray(it.animeTags) ? it.animeTags : []);
  return tags.some(x => norm(x) === t);
}

// STUDIO: pool “agrandi” en cumulant des studios jusqu'à 64
function buildStudioPool64(basePool, getStudioFn, minSize = THEME_POOL_SIZE) {
  const usedStudios = new Set();
  const mapByKey = new Map();

  const candidates = shuffleInPlace([...basePool]);
  let safety = 0;

  const addStudio = (studio) => {
    if (!studio) return;
    const key = norm(studio);
    if (!key || usedStudios.has(key)) return;
    usedStudios.add(key);

    for (const it of basePool) {
      if (includesStudio(getStudioFn(it), studio)) {
        const k = it._key || JSON.stringify(it);
        if (!mapByKey.has(k)) mapByKey.set(k, it);
      }
    }
  };

  while (mapByKey.size < minSize && safety < 140 && candidates.length) {
    safety++;
    const seed = candidates.pop();
    addStudio(getStudioFn(seed));
  }

  const out = Array.from(mapByKey.values());
  if (out.length < minSize) return null;
  return pickUniqueN(out, minSize);
}

function pickContentTheme64(basePool, modeLocal) {
  if (!Array.isArray(basePool) || basePool.length < THEME_POOL_SIZE) {
    return { crit: "FREE", label: "Libre", pool: pickUniqueN(basePool || [], THEME_POOL_SIZE) };
  }

  const criteriaAnime = ["FREE", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR"]; // 6
  const criteriaSongs = ["FREE", "SONG_SEASON", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR", "ARTIST"]; // 7
  const criteria = (modeLocal === "songs") ? criteriaSongs : criteriaAnime;

  const getYear = (it) => it?._year || it?.year || 0;
  const getStudio = (it) => it?._studio || it?.studio || it?.animeStudio || "";
  const getScore = (it) => (modeLocal === "songs") ? (it?.animeScore || 0) : (it?._score || 0);
  const getPop = (it) => (modeLocal === "songs") ? (it?.animeMembers || 0) : (it?._members || 0);

  const getSongSeason = (it) => String(it?.songSeason || "").trim();
  const getArtistsArr = (it) => Array.isArray(it?.songArtistsArr) ? it.songArtistsArr : [];

  const MAX_TRIES = 90;

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
      const tags = Array.isArray(seed._tags) ? seed._tags : (Array.isArray(seed.animeTags) ? seed.animeTags : []);
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

// ====== MEDIA LOADER (retries + anti-stall) ======
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
    // si on relance après pause fin -> restart snippet
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
  if (!dur || dur <= 1) {
    return { start: SONG_START_SEC, end: SONG_START_SEC + SONG_PLAY_SEC };
  }

  // si vidéo assez longue -> start 45
  if (dur >= SONG_START_SEC + 1) {
    const start = SONG_START_SEC;
    const end = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
    return { start, end };
  }

  // sinon -> on prend les ~20 dernières secondes
  const start = Math.max(0, dur - SONG_PLAY_SEC - 0.25);
  const end = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
  return { start, end };
}

function hardResetMedia() {
  clearSnippetLimiter();
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();
}

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadMediaWithRetries(url, localRound, localMedia, { autoplay = true, snippet = false } = {}) {
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

    // snippet (45s -> 20s)
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
    songPlayer.src = src;
    songPlayer.load();

    songPlayer.onloadedmetadata = () => {
      if (!isStillValid() || done) return;
      markReady();
    };

    songPlayer.oncanplay = () => {
      if (!isStillValid() || done) return;
      markReady();
    };

    songPlayer.onwaiting = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };

    songPlayer.onstalled = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };

    songPlayer.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    songPlayer.onerror = () => {
      if (!isStillValid() || done) return;
      triggerRetry();
    };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
  return cleanupLoader;
}

// ====== UI INIT ======
function initCustomUI() {
  // Pills mode
  document.querySelectorAll("#modePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modePills .pill").forEach(b => {
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
  document.querySelectorAll("#typePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Song pills
  document.querySelectorAll("#songPills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Sliders sync
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach(el => el.addEventListener("input", syncLabels));

  // Apply
  applyBtn.addEventListener("click", () => {
    filteredPool = applyFilters();
    const minNeeded = Math.max(10, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;

    if (isParcours) {
      totalRounds = clampInt(parcoursCount, 1, 100);
      if (forcedMode === "anime" || forcedMode === "songs") currentMode = forcedMode;
      updateModePillsFromState();
    }

    showGame();
    startRound();
  });

  // Rank buttons events
  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(btn => {
    btn.addEventListener("click", () => {
      const r = parseInt(btn.dataset.rank, 10);
      assignRank(r);
    });
  });

  // defaults forced mode
  if (forcedMode === "anime" || forcedMode === "songs") {
    currentMode = forcedMode;
    updateModePillsFromState();
  }

  updateModeVisibility();
  syncLabels();
}

function updateModePillsFromState() {
  document.querySelectorAll("#modePills .pill").forEach(b => {
    const active = b.dataset.mode === currentMode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  updateModeVisibility();
}

function updateModeVisibility() {
  songsRow.style.display = (currentMode === "songs") ? "flex" : "none";
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

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
      title: a._title,
      image: a.image || "",

      // meta thème
      _year: a._year,
      _members: a._members,
      _score: a._score,
      _type: a._type,
      _studio: a._studio || "",
      _tags: Array.isArray(a._tags) ? a._tags : [],
    }));
  }

  // songs mode
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map(b => b.dataset.song);
  if (allowedSongs.length === 0) return [];

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

    // meta thème (basée anime)
    animeYear: s.animeYear,
    animeMembers: s.animeMembers,
    animeScore: s.animeScore,
    animeType: s.animeType,
    animeStudio: s.animeStudio || "",
    animeTags: Array.isArray(s.animeTags) ? s.animeTags : [],
  }));
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
  const minNeeded = Math.max(10, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;

  const label = (currentMode === "songs") ? "Songs" : "Titres";
  previewCountEl.textContent = ok
    ? `📚 ${label} disponibles : ${pool.length} (OK)`
    : `📚 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== GAME ======
function resetGameUI() {
  rankings = new Array(10).fill(null);
  currentIndex = 0;
  selectedItems = [];

  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = false);

  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  mediaToken++;
  hardResetMedia();

  volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
}

function pick10FromPool(pool) {
  const used = new Set();
  const out = [];
  const shuffled = shuffleInPlace([...pool]);

  for (const it of shuffled) {
    if (out.length >= 10) break;
    if (used.has(it._key)) continue;
    used.add(it._key);
    out.push(it);
  }
  return out;
}

function startRound() {
  roundToken++;
  resetGameUI();

  roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  const minNeeded = Math.max(10, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };
    return;
  }

  // ✅ thème contenu (pool 64) -> puis on pick 10 dedans
  currentTheme = pickContentTheme64(filteredPool, currentMode);
  updateThemeLabel();

  const themePool = Array.isArray(currentTheme?.pool) ? currentTheme.pool : [];
  if (themePool.length < 10) {
    resultDiv.textContent = "❌ Thème invalide (pool trop petit).";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };
    return;
  }

  selectedItems = pick10FromPool(themePool);

  if (selectedItems.length < 10) {
    resultDiv.textContent = "❌ Impossible de sélectionner 10 items uniques.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };
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

  itemName.textContent = formatItemLabel(item);

  if (currentMode === "songs") {
    animeImg.style.display = "none";
    playerZone.style.display = "block";
    volumeRow.style.display = "flex";

    songPlayer.poster = item.image || "";

    if (item.url) {
      mediaToken++;
      const localRound = roundToken;
      const localMedia = mediaToken;

      hardResetMedia();

      songPlayer.muted = false;
      applyVolume();

      // ✅ snippet ON
      loadMediaWithRetries(item.url, localRound, localMedia, { autoplay: true, snippet: true });
    } else {
      hardResetMedia();
    }
  } else {
    volumeRow.style.display = "none";
    playerZone.style.display = "none";
    hardResetMedia();

    if (item.image) {
      animeImg.src = item.image;
      animeImg.style.display = "block";
    } else {
      animeImg.style.display = "none";
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

  const btn = rankButtonsWrap.querySelector(`button[data-rank="${rank}"]`);
  if (btn) btn.disabled = true;

  updateRankingList();

  currentIndex++;
  displayCurrentItem();
}

function updateRankingList() {
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
  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = true);
  try { songPlayer.pause(); } catch {}

  resultDiv.textContent = "✅ Partie terminée !";
  nextBtn.style.display = "block";

  const isLast = currentRound >= totalRounds;

  if (!isLast) {
    nextBtn.textContent = "Round suivant";
    nextBtn.onclick = () => {
      currentRound++;
      startRound();
    };
  } else {
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };

    if (isParcours) {
      try {
        parent.postMessage({
          parcoursScore: { label: "Blind Ranking", score: 0, total: 0 }
        }, "*");
      } catch {}
    }
  }
}

// ====== LOAD DATA ======
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
      return {
        ...a,
        _title: title,
        _titleLower: title.toLowerCase(),
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
        _studio: a.studio || "",
        _tags: [...genres, ...themes],
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();

    applyVolume();

    // parcours auto-start
    if (isParcours) {
      filteredPool = applyFilters();
      const minNeeded = Math.max(10, MIN_REQUIRED);
      if (filteredPool.length >= minNeeded) {
        totalRounds = clampInt(parcoursCount, 1, 100);
        currentRound = 1;
        showGame();
        startRound();
      }
    }
  })
  .catch(e => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    console.error(e);
  });
