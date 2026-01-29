/**********************
 * Keep or Next (Anime / Songs) — script.js (COMPLET MODIFIÉ)
 * ✅ Thème contenu par round (caché pendant le round, révélé après le choix)
 * ✅ Thèmes = ceux du Tournament + ajustements demandés
 *   - Anime: FREE, YEAR(± progressif), STUDIO(agrandi), TAG(agrandi), SCORE_NEAR, POP_NEAR(% global)
 *   - Songs: + SONG_YEAR(± progressif), ARTIST(agrandi), SAME_ANIME(agrandi), YEAR anime (± progressif)
 * ✅ Preview/menu reste MIN 64 (inchangé)
 * ✅ Parcours: fin = continuer parcours (return=... sinon history.back())
 *
 * Autres features conservées:
 * - Mode Parcours: auto-start
 * - Sécurité: au moins 1 type actif + (si songs) au moins 1 song-type actif
 * - Volume persistant
 * - Loader media + retries
 * - Songs : start at 45s, play 30s
 **********************/

// ====== MENU & THEME ======
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
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

// ====== HELPERS / CONFIG ======
const MIN_REQUIRED = 64; // ✅ menu preview/start reste 64
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;
const MAX_WALL_SNIPPET_MS = 60000;

// ✅ Clip settings (Songs)
const CLIP_START_S = 45;
const CLIP_DURATION_S = 30;
const CLIP_EPS = 0.05;

// ✅ Volume persistence
const VOLUME_KEY_MAIN = "keepnext_volume";
const VOLUME_KEY_FALLBACK = "tournament_volume";

// ✅ Theme content
const THEME_MIN = 2;
const THEME_MAX_TRIES = 140;
const YEAR_MAX_K = 12; // ±0..±12 (suffisant, fallback FREE sinon)

// ====== SMALL UTILS ======
function norm(s) { return String(s || "").trim().toLowerCase(); }

function includesStudio(studio, needle) {
  const s = norm(studio);
  const n = norm(needle);
  if (!s || !n) return false;
  return s.includes(n);
}

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}
function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickTwoDistinct(arr) {
  if (!arr || arr.length < 2) return { a: null, b: null };
  if (arr.length === 2) return { a: arr[0], b: arr[1] };
  const a = pickRandom(arr);
  let b = pickRandom(arr);
  let guard = 0;
  while (b && a && b._key === a._key && guard++ < 30) b = pickRandom(arr);
  if (b && a && b._key === a._key) b = arr.find(x => x._key !== a._key) || b;
  return { a, b };
}

function normalizeAnimeList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.animes)) return json.animes;
  return [];
}

function extractTagName(x) {
  if (!x) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object") return x.name || x.title || x.tag || "";
  return "";
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
function yearFromSeasonStr(seasonStr, fallback = 0) {
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

// ====== SONG LABELS ======
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

// ✅ mapping pills -> dataset songType
function mapSongPillToCode(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "opening" || s === "op") return "OP";
  if (s === "ending" || s === "ed") return "ED";
  if (s === "insert" || s === "in") return "IN";
  const raw = String(v || "").trim();
  return raw;
}

// ====== EXTRACT SONGS (avec meta anime + songYear + artistsArr) ======
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
      const seasonStr = String(it.season || "").trim();
      const songYear = yearFromSeasonStr(seasonStr, anime._year);

      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",
        artistsArr,

        songSeason: seasonStr,
        songYear,          // ✅ pour SONG_YEAR

        animeTitle: anime._title,
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,
        studio: anime._studio || "",
        tags: Array.isArray(anime._tags) ? anime._tags : [],

        image: anime.image || "",

        url,
        _key: `song|${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
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
const turnCountEl = document.getElementById("turnCount");

const roundLabel = document.getElementById("roundLabel");
const themePill = document.getElementById("themePill");

const leftCard = document.getElementById("leftCard");
const rightCard = document.getElementById("rightCard");

const leftImg = document.getElementById("left-img");
const leftName = document.getElementById("left-name");
const leftPlayerZone = document.getElementById("left-player-zone");
const leftPlayer = document.getElementById("leftPlayer");

const sleepOverlay = document.getElementById("sleepOverlay");
const rightImg = document.getElementById("right-img");
const rightName = document.getElementById("right-name");
const rightPlayerZone = document.getElementById("right-player-zone");
const rightPlayer = document.getElementById("rightPlayer");

const keepBtn = document.getElementById("keepBtn");
const nextChoiceBtn = document.getElementById("nextChoiceBtn");

const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

// ====== PARCOURS (compat) ======
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
const forcedMode = urlParams.get("mode"); // "anime" | "songs" éventuel

// optionnel: filtres via URL
const qpPop = urlParams.get("pop");
const qpScore = urlParams.get("score");
const qpYearMin = urlParams.get("ymin") || urlParams.get("yearMin");
const qpYearMax = urlParams.get("ymax") || urlParams.get("yearMax");
const qpTypes = urlParams.get("types"); // "TV,Movie"
const qpSongs = urlParams.get("songs"); // "opening,ending" ou "OP,ED"

// ✅ retour parcours (si fourni)
const qpReturn = urlParams.get("return");

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ✅ pool global pop (pour label Top X–Y%)
let POP_GLOBAL_VALUES = []; // members desc
function buildGlobalPopRef() {
  POP_GLOBAL_VALUES = allAnimes
    .map(a => safeNum(a._members))
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => b - a);
}

// ====== SETTINGS ======
let currentMode = "anime";
let filteredPool = [];

// ====== GAME STATE ======
let totalTurns = 1;
let currentTurn = 1;

let leftItem = null;
let rightItem = null;

let currentTheme = null; // { crit, label, hint }

// tokens anti-bug media
let roundToken = 0;
let mediaTokenLeft = 0;
let mediaTokenRight = 0;

// wall timers (anti-blocage)
let wallTimerLeft = null;
let wallTimerRight = null;

// ====== UI SHOW/HIDE ======
function showCustomization() {
  if (customPanel) customPanel.style.display = "block";
  if (gamePanel) gamePanel.style.display = "none";
}
function showGame() {
  if (customPanel) customPanel.style.display = "none";
  if (gamePanel) gamePanel.style.display = "block";
}

// ====== DEFAULT PILLS ======
function ensureDefaultTypes() {
  const pills = Array.from(document.querySelectorAll("#typePills .pill"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => {
    const t = b.dataset.type;
    const on = (t === "TV" || t === "Movie");
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function ensureDefaultSongs() {
  const pills = Array.from(document.querySelectorAll("#songPills .pill"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => {
    const s = (b.dataset.song || "").toLowerCase();
    const on = (s === "opening" || s === "op" || s === "OP");
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// ====== VOLUME (persistant) ======
function loadSavedVolumePercent() {
  const raw =
    localStorage.getItem(VOLUME_KEY_MAIN) ??
    localStorage.getItem(VOLUME_KEY_FALLBACK) ??
    "30";
  const p = parseInt(raw, 10);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 30;
}

function saveVolumePercent(p) {
  const v = String(Math.max(0, Math.min(100, p)));
  localStorage.setItem(VOLUME_KEY_MAIN, v);
  localStorage.setItem(VOLUME_KEY_FALLBACK, String(Math.max(0, Math.min(1, (parseInt(v, 10) || 30) / 100))));
}

function applyVolume() {
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider?.value || "30", 10)));
  [leftPlayer, rightPlayer].forEach((p) => {
    if (!p) return;
    try {
      p.muted = false;
      p.volume = v / 100;
    } catch {}
  });
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) {
  volumeSlider.addEventListener("input", () => {
    applyVolume();
    saveVolumePercent(parseInt(volumeSlider.value || "30", 10));
  });
}

// ====== MEDIA LOADER ======
function hardResetMedia(player) {
  try { player.pause(); } catch {}
  player.removeAttribute("src");
  player.load();
}
function withCacheBuster(url) {
  const [base, frag] = url.split("#");
  const sep = base.includes("?") ? "&" : "?";
  const busted = base + sep + "t=" + Date.now();
  return frag ? busted + "#" + frag : busted;
}

function loadMediaWithRetries(player, url, localRound, localMedia, { onReady } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    player.onloadedmetadata = null;
    player.oncanplay = null;
    player.onloadeddata = null;
    player.onplaying = null;
    player.onwaiting = null;
    player.onstalled = null;
    player.onerror = null;
  };

  const tokenNow = () => (player === leftPlayer ? mediaTokenLeft : mediaTokenRight);
  const isStillValid = () => (localRound === roundToken && localMedia === tokenNow());

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
    cleanup();
    if (typeof onReady === "function") onReady();
  };

  const triggerRetry = () => {
    if (!isStillValid() || done) return;
    cleanup();
    attemptIndex++;
    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      try { player.pause(); } catch {}
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

    try { hardResetMedia(player); } catch {}
    player.preload = "metadata";
    player.muted = false;
    player.src = src;
    player.load();

    player.onloadedmetadata = () => { if (!isStillValid() || done) return; markReady(); };
    player.oncanplay = () => { if (!isStillValid() || done) return; markReady(); };
    player.onloadeddata = () => { if (!isStillValid() || done) return; markReady(); };

    player.onwaiting = () => { if (!isStillValid() || done) return; startStallTimer(); };
    player.onstalled = () => { if (!isStillValid() || done) return; startStallTimer(); };

    player.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    };

    player.onerror = () => { if (!isStillValid() || done) return; triggerRetry(); };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
  return cleanup;
}

function clearWallTimerFor(player) {
  if (player === leftPlayer) {
    if (wallTimerLeft) clearTimeout(wallTimerLeft);
    wallTimerLeft = null;
  } else {
    if (wallTimerRight) clearTimeout(wallTimerRight);
    wallTimerRight = null;
  }
}

function playClip(player, localRound, localMedia, { autoplay = true } = {}) {
  const tokenNow = () => (player === leftPlayer ? mediaTokenLeft : mediaTokenRight);
  const isStillValid = () => (localRound === roundToken && localMedia === tokenNow());

  player.ontimeupdate = null;
  player.onended = null;
  player.onplay = null;

  clearWallTimerFor(player);

  const wall = setTimeout(() => {
    if (!isStillValid()) return;
    try { player.pause(); } catch {}
  }, MAX_WALL_SNIPPET_MS);

  if (player === leftPlayer) wallTimerLeft = wall;
  else wallTimerRight = wall;

  let start = CLIP_START_S;
  const dur = player.duration;

  let endTime = start + CLIP_DURATION_S;
  if (Number.isFinite(dur) && dur > 1) {
    start = Math.min(CLIP_START_S, Math.max(0, dur - 0.25));
    endTime = Math.min(start + CLIP_DURATION_S, Math.max(0, dur - 0.05));
  }

  const stopSnippet = () => {
    if (!isStillValid()) return;
    clearWallTimerFor(player);
    try { player.pause(); } catch {}
    try { player.currentTime = start; } catch {}
  };

  player.ontimeupdate = () => {
    if (!isStillValid()) return;
    if (player.currentTime >= (endTime - CLIP_EPS)) stopSnippet();
  };
  player.onended = () => stopSnippet();

  const trySeek = () => {
    if (!isStillValid()) return;
    try { player.currentTime = start; } catch {}
  };

  trySeek();

  if (autoplay) {
    player.muted = false;
    const p = player.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  let tries = 0;
  const seeker = setInterval(() => {
    if (!isStillValid()) { clearInterval(seeker); return; }
    const ct = Number.isFinite(player.currentTime) ? player.currentTime : 0;

    if (Math.abs(ct - start) < 0.8) { clearInterval(seeker); return; }

    tries++;
    trySeek();

    if (tries >= 15) { clearInterval(seeker); }
  }, 120);

  player.onplay = () => {
    if (!isStillValid()) return;
    const ct = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    if (ct < (start - 1)) trySeek();
  };
}

function stopAllMedia() {
  mediaTokenLeft++;
  mediaTokenRight++;

  clearWallTimerFor(leftPlayer);
  clearWallTimerFor(rightPlayer);

  leftPlayer.ontimeupdate = null;
  leftPlayer.onended = null;
  leftPlayer.onplay = null;

  rightPlayer.ontimeupdate = null;
  rightPlayer.onended = null;
  rightPlayer.onplay = null;

  try { leftPlayer.pause(); } catch {}
  try { rightPlayer.pause(); } catch {}

  leftPlayer.removeAttribute("src"); leftPlayer.load();
  rightPlayer.removeAttribute("src"); rightPlayer.load();
}

// ====== UI INIT ======
function updateModeVisibility() {
  if (songsRow) songsRow.style.display = (currentMode === "songs") ? "flex" : "none";
  if (volumeRow) volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
}

function updateModePillsFromState() {
  document.querySelectorAll("#modePills .pill").forEach((b) => {
    const active = b.dataset.mode === currentMode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  updateModeVisibility();
}

function applyParcoursParamsToUIIfAny() {
  if (forcedMode === "anime" || forcedMode === "songs") {
    currentMode = forcedMode;
    updateModePillsFromState();
  }

  if (qpPop && popEl) popEl.value = String(clampInt(parseInt(qpPop, 10), 1, 100));
  if (qpScore && scoreEl) scoreEl.value = String(clampInt(parseInt(qpScore, 10), 1, 100));
  if (qpYearMin && yearMinEl) yearMinEl.value = String(parseInt(qpYearMin, 10) || yearMinEl.value);
  if (qpYearMax && yearMaxEl) yearMaxEl.value = String(parseInt(qpYearMax, 10) || yearMaxEl.value);

  if (qpTypes) {
    const wanted = new Set(qpTypes.split(",").map(s => s.trim()).filter(Boolean));
    const pills = Array.from(document.querySelectorAll("#typePills .pill"));
    if (pills.length) {
      pills.forEach((b) => {
        const t = b.dataset.type;
        const on = wanted.has(t);
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  if (qpSongs) {
    const wantedRaw = new Set(qpSongs.split(",").map(s => s.trim()).filter(Boolean));
    const wanted = new Set(Array.from(wantedRaw).map(mapSongPillToCode));

    const pills = Array.from(document.querySelectorAll("#songPills .pill"));
    if (pills.length) {
      pills.forEach((b) => {
        const code = mapSongPillToCode(b.dataset.song);
        const on = wanted.has(code) || wantedRaw.has(b.dataset.song);
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  if (volumeSlider) {
    const pv = loadSavedVolumePercent();
    volumeSlider.value = String(pv);
    if (volumeVal) volumeVal.textContent = `${pv}%`;
  }
  applyVolume();
}

function initCustomUI() {
  document.querySelectorAll("#modePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modePills .pill").forEach((b) => {
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

  document.getElementById("typePills")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;

    if (btn.classList.contains("active")) {
      const actives = Array.from(document.querySelectorAll("#typePills .pill.active"));
      if (actives.length === 1) return;
    }

    btn.classList.toggle("active");
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
    ensureDefaultTypes();
    updatePreview();
  });

  document.getElementById("songPills")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;

    if (btn.classList.contains("active")) {
      const actives = Array.from(document.querySelectorAll("#songPills .pill.active"));
      if (actives.length === 1) return;
    }

    btn.classList.toggle("active");
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
    ensureDefaultSongs();
    updatePreview();
  });

  function syncLabels() {
    clampYearSliders();
    if (popValEl) popValEl.textContent = popEl.value;
    if (scoreValEl) scoreValEl.textContent = scoreEl.value;
    if (yearMinValEl) yearMinValEl.textContent = yearMinEl.value;
    if (yearMaxValEl) yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el?.addEventListener("input", syncLabels));
  turnCountEl?.addEventListener("input", updatePreview);

  applyBtn?.addEventListener("click", () => {
    ensureDefaultTypes();
    if (currentMode === "songs") ensureDefaultSongs();

    filteredPool = applyFilters();
    totalTurns = clampInt(parseInt(turnCountEl?.value || "1", 10), 1, 100);

    const minNeeded = Math.max(2, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    showGame();
    startGame();
  });

  keepBtn?.addEventListener("click", () => handleChoice("keep"));
  nextChoiceBtn?.addEventListener("click", () => handleChoice("next"));

  if (volumeSlider) {
    const pv = loadSavedVolumePercent();
    volumeSlider.value = String(pv);
    if (volumeVal) volumeVal.textContent = `${pv}%`;
  }

  ensureDefaultTypes();
  ensureDefaultSongs();
  updateModeVisibility();
  syncLabels();
}

// ====== FILTERS ======
function applyFilters() {
  clampYearSliders();
  ensureDefaultTypes();
  if (currentMode === "songs") ensureDefaultSongs();

  const popPercent = parseInt(popEl?.value || "30", 10);
  const scorePercent = parseInt(scoreEl?.value || "100", 10);
  const yearMin = parseInt(yearMinEl?.value || "1950", 10);
  const yearMax = parseInt(yearMaxEl?.value || "2026", 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")]
    .map((b) => b.dataset.type)
    .filter(Boolean);

  if (allowedTypes.length === 0) return [];

  if (currentMode === "anime") {
    let pool = allAnimes.filter((a) =>
      a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type)
    );

    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    // ✅ on garde la meta pour thèmes
    return pool.map((a) => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      title: a._title,
      image: a.image || "",

      _year: a._year,
      _type: a._type,
      _members: a._members,
      _score: a._score,
      _studio: a._studio || "",
      tags: Array.isArray(a._tags) ? a._tags : [],
    }));
  }

  const allowedSongPills = [...document.querySelectorAll("#songPills .pill.active")]
    .map((b) => b.dataset.song)
    .filter(Boolean);

  if (allowedSongPills.length === 0) return [];

  const allowedSongCodes = new Set(allowedSongPills.map(mapSongPillToCode));
  let pool = allSongs.filter((s) =>
    s.animeYear >= yearMin &&
    s.animeYear <= yearMax &&
    allowedTypes.includes(s.animeType) &&
    allowedSongCodes.has(String(s.songType || "").trim())
  );

  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool.map((s) => ({
    kind: "song",
    _key: s._key,

    animeTitle: s.animeTitle || "Anime",
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    artistsArr: Array.isArray(s.artistsArr) ? s.artistsArr : [],

    songType: s.songType,
    songSeason: s.songSeason || "",
    songYear: safeNum(s.songYear) || 0,

    url: s.url,
    image: s.image || "",

    // ✅ meta anime portée par song
    _year: safeNum(s.animeYear) || 0,
    _type: s.animeType || "Unknown",
    _members: safeNum(s.animeMembers) || 0,
    _score: safeNum(s.animeScore) || 0,
    _studio: s.studio || "",
    tags: Array.isArray(s.tags) ? s.tags : [],
  }));
}

// ====== PREVIEW ======
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
  const minNeeded = Math.max(2, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;

  const label = (currentMode === "songs") ? "Songs" : "Titres";
  if (previewCountEl) {
    previewCountEl.textContent = ok
      ? `📚 ${label} disponibles : ${pool.length} (OK)`
      : `📚 ${label} disponibles : ${pool.length} (Min ${minNeeded})`;

    previewCountEl.classList.toggle("good", ok);
    previewCountEl.classList.toggle("bad", !ok);
  }

  if (applyBtn) {
    applyBtn.disabled = !ok;
    applyBtn.classList.toggle("disabled", !ok);
  }
}

// ====== THEME HELPERS ======
function popBracketFromMembers(members) {
  const vals = POP_GLOBAL_VALUES;
  const n = vals.length;
  const v = safeNum(members);
  if (!n || !v) return null;

  // rank = 1 + nb de valeurs strictement > v
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vals[mid] > v) lo = mid + 1;
    else hi = mid;
  }
  const rank = lo + 1;
  const raw = Math.ceil((rank / n) * 100);

  let start = Math.floor((raw - 1) / 5) * 5;
  let end = start + 5;
  start = Math.max(0, Math.min(95, start));
  end = Math.max(5, Math.min(100, end));

  const label = (start === 0) ? "Top 1–5%" : `Top ${start}–${end}%`;
  return { start, end, raw, label };
}

function popToleranceFromStart(start) {
  // ex: start=5 -> 5 ; start=20 -> 10 ; start=30 -> 15
  return Math.max(5, Math.floor(start / 10) * 5);
}

function nearbyPool(pool, getNum, target, want = 24) {
  const arr = [...pool].sort((a, b) => getNum(a) - getNum(b));
  let best = 0, bestD = Infinity;

  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(getNum(arr[i]) - target);
    if (d < bestD) { bestD = d; best = i; }
  }

  let L = best, R = best;
  const w = Math.max(2, Math.min(want, arr.length));
  while ((R - L + 1) < w && (L > 0 || R < arr.length - 1)) {
    if (L > 0) L--;
    if ((R - L + 1) < w && R < arr.length - 1) R++;
  }

  return arr.slice(L, R + 1);
}

// agrandi générique (union sur une clé)
function buildUnionPoolByValues(basePool, {
  seedValue,
  valueFromItem,
  matchesValue,
  labelPrefix,
  pickExtraValueFromSeed,
  safetyMax = 220
}) {
  const used = [];
  const usedKey = new Set();
  const mapByKey = new Map();

  const addValue = (val) => {
    const v = String(val || "").trim();
    const k = norm(v);
    if (!k || usedKey.has(k)) return;

    usedKey.add(k);
    used.push(v);

    for (const it of basePool) {
      if (matchesValue(it, v)) {
        const key = it._key || JSON.stringify(it);
        if (!mapByKey.has(key)) mapByKey.set(key, it);
      }
    }
  };

  addValue(seedValue);

  const candidates = shuffleInPlace([...basePool]);
  let safety = 0;

  while (mapByKey.size < THEME_MIN && safety < safetyMax && candidates.length) {
    safety++;
    const seed = candidates.pop();
    const extra = pickExtraValueFromSeed(seed);
    addValue(extra);
  }

  const out = Array.from(mapByKey.values());
  if (out.length < THEME_MIN) return null;

  const label = `${labelPrefix} : ${used.join(" + ")}`;
  return { pool: out, label };
}

function pickContentThemeForRound(basePool, modeLocal) {
  const criteriaAnime = ["FREE", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR"];
  const criteriaSongs = ["FREE", "SONG_YEAR", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR", "ARTIST", "SAME_ANIME"];
  const criteria = (modeLocal === "songs") ? criteriaSongs : criteriaAnime;

  for (let attempt = 0; attempt < THEME_MAX_TRIES; attempt++) {
    const crit = criteria[Math.floor(Math.random() * criteria.length)];

    if (crit === "FREE") {
      return { crit: "FREE", label: "Libre", pool: basePool };
    }

    const seed = pickRandom(basePool);
    if (!seed) continue;

    // YEAR (anime) progressive ±0..±k
    if (crit === "YEAR") {
      const y = safeNum(seed._year);
      if (!y) continue;

      for (let k = 0; k <= YEAR_MAX_K; k++) {
        const pool = basePool.filter(it => {
          const yy = safeNum(it._year);
          return yy && Math.abs(yy - y) <= k;
        });
        if (pool.length >= THEME_MIN) {
          return { crit, label: `Année : ${y} ± ${k}`, pool };
        }
      }
      continue;
    }

    // SONG_YEAR progressive
    if (crit === "SONG_YEAR" && modeLocal === "songs") {
      const y = safeNum(seed.songYear);
      if (!y) continue;

      for (let k = 0; k <= YEAR_MAX_K; k++) {
        const pool = basePool.filter(it => {
          const yy = safeNum(it.songYear);
          return yy && Math.abs(yy - y) <= k;
        });
        if (pool.length >= THEME_MIN) {
          return { crit, label: `Année song : ${y} ± ${k}`, pool };
        }
      }
      continue;
    }

    // STUDIO (agrandi)
    if (crit === "STUDIO") {
      const st = String(seed._studio || "").trim();
      if (!st) continue;

      const built = buildUnionPoolByValues(basePool, {
        seedValue: st,
        valueFromItem: it => it._studio,
        matchesValue: (it, v) => includesStudio(it._studio || "", v),
        labelPrefix: "Studios",
        pickExtraValueFromSeed: (s) => (s?._studio || ""),
        safetyMax: 180
      });
      if (!built) continue;
      return { crit, label: built.label, pool: built.pool };
    }

    // TAG (agrandi)
    if (crit === "TAG") {
      const tags = Array.isArray(seed.tags) ? seed.tags : [];
      if (!tags.length) continue;

      const seedTag = pickRandom(tags);
      if (!seedTag) continue;

      const built = buildUnionPoolByValues(basePool, {
        seedValue: seedTag,
        matchesValue: (it, v) => {
          const arr = Array.isArray(it.tags) ? it.tags : [];
          const key = norm(v);
          return arr.some(x => norm(x) === key);
        },
        labelPrefix: "Tags",
        pickExtraValueFromSeed: (s) => {
          const arr = Array.isArray(s?.tags) ? s.tags : [];
          return pickRandom(arr) || "";
        },
        safetyMax: 220
      });
      if (!built) continue;
      return { crit, label: built.label, pool: built.pool };
    }

    // SCORE_NEAR
    if (crit === "SCORE_NEAR") {
      const sc = safeNum(seed._score);
      if (!sc) continue;

      const pool = nearbyPool(basePool, it => safeNum(it._score), sc, 24);
      if (pool.length < THEME_MIN) continue;

      let delta = 0;
      for (const it of pool) delta = Math.max(delta, Math.abs(safeNum(it._score) - sc));
      delta = Math.round(delta * 10) / 10;

      return { crit, label: `Score : ${Math.round(sc * 10) / 10} ± ${delta}`, pool };
    }

    // POP_NEAR (% global) + tol selon tranche + expansion +5
    if (crit === "POP_NEAR") {
      const pop = safeNum(seed._members);
      if (!pop) continue;

      const seedB = popBracketFromMembers(pop);
      if (!seedB) continue;

      const baseTol = popToleranceFromStart(seedB.start);

      for (let extra = 0; extra <= 60; extra += 5) {
        const tol = baseTol + extra;
        const low = Math.max(0, seedB.start - tol);
        const high = Math.min(95, seedB.start + tol);

        const pool = basePool.filter(it => {
          const b = popBracketFromMembers(safeNum(it._members));
          if (!b) return false;
          return b.start >= low && b.start <= high;
        });

        if (pool.length >= THEME_MIN) {
          return { crit, label: `Popularité : ${seedB.label} ± ${tol}`, pool };
        }
      }

      continue;
    }

    // ARTIST (songs agrandi)
    if (crit === "ARTIST" && modeLocal === "songs") {
      const arts = Array.isArray(seed.artistsArr) ? seed.artistsArr.filter(Boolean) : [];
      if (!arts.length) continue;

      const seedArtist = pickRandom(arts);
      if (!seedArtist) continue;

      const built = buildUnionPoolByValues(basePool, {
        seedValue: seedArtist,
        matchesValue: (it, v) => {
          const arr = Array.isArray(it.artistsArr) ? it.artistsArr : [];
          const key = norm(v);
          return arr.some(x => norm(x) === key);
        },
        labelPrefix: "Artistes",
        pickExtraValueFromSeed: (s) => {
          const arr = Array.isArray(s?.artistsArr) ? s.artistsArr : [];
          return pickRandom(arr) || "";
        },
        safetyMax: 260
      });
      if (!built) continue;
      return { crit, label: built.label, pool: built.pool };
    }

    // SAME_ANIME (songs agrandi)
    if (crit === "SAME_ANIME" && modeLocal === "songs") {
      const seedAnime = String(seed.animeTitle || "").trim();
      if (!seedAnime) continue;

      const built = buildUnionPoolByValues(basePool, {
        seedValue: seedAnime,
        matchesValue: (it, v) => String(it.animeTitle || "").trim() === String(v || "").trim(),
        labelPrefix: "Animes",
        pickExtraValueFromSeed: (s) => String(s?.animeTitle || "").trim(),
        safetyMax: 220
      });
      if (!built) continue;
      return { crit, label: built.label, pool: built.pool };
    }
  }

  // fallback
  return { crit: "FREE", label: "Libre", pool: basePool };
}

// ====== GAME ======
function clearChoiceEffects() {
  leftCard?.classList.remove("chosen", "rejected");
  rightCard?.classList.remove("chosen", "rejected");
}

function hideTheme() {
  if (!themePill) return;
  themePill.textContent = "";
  themePill.style.display = "none";
}
function showTheme(label) {
  if (!themePill) return;
  themePill.textContent = `🎯 Thème contenu : ${label || "Libre"}`;
  themePill.style.display = "block";
}

function resetGameUI() {
  currentTurn = 1;
  leftItem = null;
  rightItem = null;
  currentTheme = null;

  clearChoiceEffects();

  if (resultDiv) resultDiv.textContent = "";
  if (nextBtn) nextBtn.style.display = "none";

  if (keepBtn) keepBtn.disabled = false;
  if (nextChoiceBtn) nextChoiceBtn.disabled = false;

  hideTheme();
  stopAllMedia();
  hideRightCard();
}

function prepareRound() {
  // 1) pick theme (pool >= 2)
  currentTheme = pickContentThemeForRound(filteredPool, currentMode);

  // 2) pick left/right from theme pool
  const themePool = Array.isArray(currentTheme?.pool) ? currentTheme.pool : filteredPool;
  const { a, b } = pickTwoDistinct(shuffleInPlace([...themePool]));
  leftItem = a;
  rightItem = b;
}

function startGame() {
  roundToken++;
  resetGameUI();

  if (isParcours) {
    totalTurns = clampInt(parcoursCount, 1, 100);
  }

  const minNeeded = Math.max(2, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    if (resultDiv) resultDiv.textContent = "❌ Pas assez d’items avec ces filtres.";
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = isParcours ? "Retour parcours" : "Retour réglages";
      nextBtn.onclick = () => {
        stopAllMedia();
        if (isParcours) continueParcours();
        else { showCustomization(); updatePreview(); }
      };
    }
    return;
  }

  prepareRound();
  renderTurn();
}

function clearChoiceThemeForNewTurn() {
  hideTheme();
  if (resultDiv) resultDiv.textContent = "";
  clearChoiceEffects();
}

function setCardContent(side, item, { revealed = true, autoplay = true } = {}) {
  const isSongs = (currentMode === "songs");
  const isLeft = side === "left";

  const img = isLeft ? leftImg : rightImg;
  const nameEl = isLeft ? leftName : rightName;
  const pZone = isLeft ? leftPlayerZone : rightPlayerZone;
  const player = isLeft ? leftPlayer : rightPlayer;

  if (!item) {
    nameEl.textContent = "";
    nameEl.style.display = "none";
    img.style.display = "none";
    pZone.style.display = "none";
    try { player.pause(); } catch {}
    player.poster = "";
    player.removeAttribute("src");
    player.load();
    return;
  }

  nameEl.textContent = revealed ? formatItemLabel(item) : "";
  nameEl.style.display = revealed ? "block" : "none";

  if (isSongs) {
    img.style.display = "none";
    img.removeAttribute("src");

    pZone.style.display = revealed ? "block" : "none";

    if (revealed && item?.url) {
      player.poster = "";
      applyVolume();

      if (isLeft) mediaTokenLeft++;
      else mediaTokenRight++;

      const localRound = roundToken;
      const localMedia = isLeft ? mediaTokenLeft : mediaTokenRight;

      try { player.pause(); } catch {}
      player.ontimeupdate = null;
      player.onended = null;
      player.onplay = null;

      player.removeAttribute("src");
      player.load();
      player.muted = false;

      loadMediaWithRetries(player, item.url, localRound, localMedia, {
        onReady: () => {
          if (localRound !== roundToken) return;
          const tokenNow = isLeft ? mediaTokenLeft : mediaTokenRight;
          if (localMedia !== tokenNow) return;

          applyVolume();
          player.muted = false;
          playClip(player, localRound, localMedia, { autoplay });
        }
      });
    } else {
      try { player.pause(); } catch {}
      player.ontimeupdate = null;
      player.onended = null;
      player.onplay = null;

      player.poster = "";
      player.removeAttribute("src");
      player.load();
      clearWallTimerFor(player);
    }
  } else {
    pZone.style.display = "none";
    try { player.pause(); } catch {}
    player.ontimeupdate = null;
    player.onended = null;
    player.onplay = null;

    player.poster = "";
    player.removeAttribute("src");
    player.load();
    clearWallTimerFor(player);

    if (revealed && item?.image) {
      img.src = item.image;
      img.style.display = "block";
    } else {
      img.style.display = "none";
    }
  }
}

function hideRightCard() {
  if (sleepOverlay) sleepOverlay.style.display = "flex";
  if (rightImg) rightImg.style.display = "none";
  if (rightName) rightName.style.display = "none";
  if (rightPlayerZone) rightPlayerZone.style.display = "none";

  mediaTokenRight++;

  clearWallTimerFor(rightPlayer);

  rightPlayer.ontimeupdate = null;
  rightPlayer.onended = null;
  rightPlayer.onplay = null;

  try { rightPlayer.pause(); } catch {}
  rightPlayer.poster = "";
  rightPlayer.removeAttribute("src");
  rightPlayer.load();
}

function revealRightCard(item) {
  if (sleepOverlay) sleepOverlay.style.display = "none";
  setCardContent("right", item, { revealed: true, autoplay: true });
}

function renderTurn() {
  clearChoiceThemeForNewTurn();

  if (roundLabel) roundLabel.textContent = `Tour ${currentTurn} / ${totalTurns}`;
  if (nextBtn) nextBtn.style.display = "none";

  if (keepBtn) keepBtn.disabled = false;
  if (nextChoiceBtn) nextChoiceBtn.disabled = false;

  setCardContent("left", leftItem, { revealed: true, autoplay: true });
  hideRightCard();

  if (volumeRow) volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
}

function continueParcours() {
  stopAllMedia();
  // 1) si le parcours passe un return=... on l’utilise
  if (qpReturn) {
    window.location.href = qpReturn;
    return;
  }
  // 2) sinon retour arrière (souvent la page "parcours")
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  // 3) fallback
  window.location.href = "../index.html";
}

function handleChoice(choice) {
  if (!leftItem || !rightItem) return;

  if (keepBtn) keepBtn.disabled = true;
  if (nextChoiceBtn) nextChoiceBtn.disabled = true;

  try { leftPlayer.pause(); } catch {}
  leftPlayer.onplay = null;

  if (choice === "keep") {
    leftCard?.classList.add("chosen");
    rightCard?.classList.add("rejected");
    if (resultDiv) resultDiv.textContent = "✅ KEEP";
  } else {
    rightCard?.classList.add("chosen");
    leftCard?.classList.add("rejected");
    if (resultDiv) resultDiv.textContent = "➡️ NEXT";
  }

  revealRightCard(rightItem);

  // ✅ Reveal thème seulement après le choix
  showTheme(currentTheme?.label || "Libre");

  const isLast = currentTurn >= totalTurns;

  if (nextBtn) {
    nextBtn.style.display = "block";

    if (!isLast) {
      nextBtn.textContent = "Tour suivant";
      nextBtn.onclick = () => {
        stopAllMedia();
        currentTurn++;
        prepareRound();
        renderTurn();
      };
    } else {
      if (isParcours) {
        nextBtn.textContent = "Continuer parcours";
        nextBtn.onclick = () => continueParcours();
      } else {
        nextBtn.textContent = "Retour réglages";
        nextBtn.onclick = () => {
          stopAllMedia();
          showCustomization();
          updatePreview();
        };
      }
    }
  }
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
      const genres = Array.isArray(a.genres) ? a.genres.map(extractTagName).filter(Boolean) : [];
      const themes = Array.isArray(a.themes) ? a.themes.map(extractTagName).filter(Boolean) : [];
      const studio = (typeof a.studio === "string" && a.studio.trim()) ? a.studio.trim() : "";

      return {
        ...a,
        _title: title,
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
        _studio: studio,
        _tags: [...genres, ...themes],
      };
    });

    // ✅ global ref pop (avant filtres menu)
    buildGlobalPopRef();

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();

    if (isParcours) {
      applyParcoursParamsToUIIfAny();
      updateModePillsFromState();
    }

    updatePreview();

    if (isParcours) {
      ensureDefaultTypes();
      if (currentMode === "songs") ensureDefaultSongs();

      filteredPool = applyFilters();
      const minNeeded = Math.max(2, MIN_REQUIRED);

      totalTurns = clampInt(parcoursCount, 1, 100);

      if (filteredPool.length >= minNeeded) {
        showGame();
        startGame();
      } else {
        showCustomization();
        updatePreview();
      }
    } else {
      showCustomization();
    }

    applyVolume();
  })
  .catch((e) => {
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
