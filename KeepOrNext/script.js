/**********************
 * Keep or Next (Anime / Songs) — script.js (COMPLET MODIFIÉ)
 * ✅ Fix pool Songs (mapping pills opening/ending/insert -> OP/ED/IN)
 * ✅ Mode Parcours: auto-start (skip personnalisation du mini-jeu)
 * ✅ Sécurité: au moins 1 type actif + (si songs) au moins 1 song-type actif
 * ✅ Volume persistant (localStorage) + appliqué aux 2 players
 * ✅ Nettoyages handlers/tokens un peu plus stricts (anti-bugs mobile)
 *
 * - Default tours = 1
 * - Cartes + slot media plus grands
 * - Droite cachée = même taille (slot fixe) + 💤 centré
 * - Pas de gros texte résultat (juste un mini hint)
 * - Effet visuel choix : chosen/rejected
 * - Tours indépendants
 * - Songs : vidéo non mutée + volume global
 * - Loader media + retries (0/2/4/6/8/10s)
 * - Songs : start at 45s, play 20s
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

// ====== HELPERS ======
const MIN_REQUIRED = 64;
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

// sécurité anti-blocage (si ça ne joue jamais)
const MAX_WALL_SNIPPET_MS = 60000;

// ✅ Clip settings (Songs)
const CLIP_START_S = 45;
const CLIP_DURATION_S = 20;
const CLIP_EPS = 0.05;

// ✅ Volume persistence
const VOLUME_KEY_MAIN = "keepnext_volume";
const VOLUME_KEY_FALLBACK = "tournament_volume"; // si tu veux partager avec Tournament

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
  const s = ((a && a.season) ? String(a.season) : "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
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

// ====== SONG TYPE / LABEL ======
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
  // au cas où ton HTML met déjà OP/ED/IN
  if (s === "op" || s === "opening") return "OP";
  if (s === "ed" || s === "ending") return "ED";
  if (s === "in" || s === "insert") return "IN";
  // valeur brute
  const raw = String(v || "").trim();
  return raw;
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

      const artistsArr = Array.isArray(it.artists) ? it.artists : [];
      const artists = artistsArr.join(", ");

      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",

        animeTitle: anime._title,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

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
const turnCountEl = document.getElementById("turnCount");

const roundLabel = document.getElementById("roundLabel");

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

// (optionnel) si ton global passe aussi les filtres dans l’URL
const qpPop = urlParams.get("pop");
const qpScore = urlParams.get("score");
const qpYearMin = urlParams.get("ymin") || urlParams.get("yearMin");
const qpYearMax = urlParams.get("ymax") || urlParams.get("yearMax");
const qpTypes = urlParams.get("types"); // ex "TV,Movie"
const qpSongs = urlParams.get("songs"); // ex "opening,ending" ou "OP,ED"

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime";
let filteredPool = [];

// ====== GAME STATE ======
let totalTurns = 1; // ✅ default 1
let currentTurn = 1;

let leftItem = null;
let rightItem = null;

let bag = [];
let bagIndex = 0;

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

// ====== DEFAULT PILLS (sécurité) ======
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
    const on = (s === "opening" || s === "op");
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
  // si tu veux partager aussi avec Tournament:
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

// ✅ Loader générique : retries + anti-stall + callback onReady
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

// ✅ Clip: seek start puis play, stop après 20s DE VIDEO.
function playClip(player, localRound, localMedia, { autoplay = true } = {}) {
  const tokenNow = () => (player === leftPlayer ? mediaTokenLeft : mediaTokenRight);
  const isStillValid = () => (localRound === roundToken && localMedia === tokenNow());

  // clean anciens handlers
  player.ontimeupdate = null;
  player.onended = null;
  player.onplay = null;

  clearWallTimerFor(player);

  // anti-blocage
  const wall = setTimeout(() => {
    if (!isStillValid()) return;
    try { player.pause(); } catch {}
  }, MAX_WALL_SNIPPET_MS);

  if (player === leftPlayer) wallTimerLeft = wall;
  else wallTimerRight = wall;

  // calc start/end (clamp si durée connue)
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

  // 1) seek d’abord
  trySeek();

  // 2) puis play (autoplay)
  if (autoplay) {
    player.muted = false;
    const p = player.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  // 3) re-seek rapide si ça reste proche de 0
  let tries = 0;
  const seeker = setInterval(() => {
    if (!isStillValid()) { clearInterval(seeker); return; }
    const ct = Number.isFinite(player.currentTime) ? player.currentTime : 0;

    if (Math.abs(ct - start) < 0.8) { clearInterval(seeker); return; }

    tries++;
    trySeek();

    if (tries >= 15) { clearInterval(seeker); }
  }, 120);

  // si user clique play plus tard
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
  // mode
  if (forcedMode === "anime" || forcedMode === "songs") {
    currentMode = forcedMode;
    updateModePillsFromState();
  }

  // sliders (si fournis)
  if (qpPop && popEl) popEl.value = String(clampInt(parseInt(qpPop, 10), 1, 100));
  if (qpScore && scoreEl) scoreEl.value = String(clampInt(parseInt(qpScore, 10), 1, 100));
  if (qpYearMin && yearMinEl) yearMinEl.value = String(parseInt(qpYearMin, 10) || yearMinEl.value);
  if (qpYearMax && yearMaxEl) yearMaxEl.value = String(parseInt(qpYearMax, 10) || yearMaxEl.value);

  // types (si fournis)
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

  // songs (si fournis)
  if (qpSongs) {
    const wantedRaw = new Set(qpSongs.split(",").map(s => s.trim()).filter(Boolean));
    const wanted = new Set(Array.from(wantedRaw).map(mapSongPillToCode)); // normalise

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

  // volume init (si pas déjà)
  if (volumeSlider) {
    const pv = loadSavedVolumePercent();
    volumeSlider.value = String(pv);
    if (volumeVal) volumeVal.textContent = `${pv}%`;
  }
  applyVolume();
}

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
      currentMode = btn.dataset.mode;
      updateModeVisibility();
      updatePreview();
    });
  });

  // Type pills (au moins 1)
  document.getElementById("typePills")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;

    // si on essaie d’éteindre le dernier -> refuse
    if (btn.classList.contains("active")) {
      const actives = Array.from(document.querySelectorAll("#typePills .pill.active"));
      if (actives.length === 1) return;
    }

    btn.classList.toggle("active");
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
    ensureDefaultTypes();
    updatePreview();
  });

  // Song pills (au moins 1)
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

  // Sliders
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

  // Apply
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

  // init volume slider from storage
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

    return pool.map((a) => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      title: a._title,
      image: a.image || ""
    }));
  }

  // songs mode
  const allowedSongPills = [...document.querySelectorAll("#songPills .pill.active")]
    .map((b) => b.dataset.song)
    .filter(Boolean);

  if (allowedSongPills.length === 0) return [];

  const allowedSongCodes = new Set(allowedSongPills.map(mapSongPillToCode)); // ✅ FIX
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
    _key: `song|${s._key}`,
    animeTitle: s.animeTitle || "Anime",
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    songType: s.songType,
    url: s.url,
    image: s.animeImage || ""
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

// ====== BAG ======
function refillBag() {
  bag = shuffleInPlace([...filteredPool]);
  bagIndex = 0;
}
function drawOne(excludeKey = null) {
  if (!bag.length || bagIndex >= bag.length) refillBag();

  const maxTries = Math.max(20, bag.length * 2);
  for (let t = 0; t < maxTries; t++) {
    if (bagIndex >= bag.length) refillBag();
    const it = bag[bagIndex++];
    if (!excludeKey || it._key !== excludeKey) return it;
  }

  if (!filteredPool.length) return null;
  let it = filteredPool[Math.floor(Math.random() * filteredPool.length)];
  if (excludeKey && it._key === excludeKey && filteredPool.length > 1) {
    it = filteredPool.find((x) => x._key !== excludeKey) || it;
  }
  return it;
}
function drawPair() {
  const a = drawOne(null);
  const b = drawOne(a?._key || null);
  return { a, b };
}

// ====== GAME ======
function clearChoiceEffects() {
  leftCard?.classList.remove("chosen", "rejected");
  rightCard?.classList.remove("chosen", "rejected");
}

function resetGameUI() {
  currentTurn = 1;
  leftItem = null;
  rightItem = null;

  clearChoiceEffects();

  if (resultDiv) resultDiv.textContent = "";
  if (nextBtn) nextBtn.style.display = "none";

  if (keepBtn) keepBtn.disabled = false;
  if (nextChoiceBtn) nextChoiceBtn.disabled = false;

  stopAllMedia();
  hideRightCard();
}

function startGame() {
  roundToken++;
  resetGameUI();

  // ✅ parcours force count
  if (isParcours) {
    totalTurns = clampInt(parcoursCount, 1, 100);
  }

  const minNeeded = Math.max(2, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    if (resultDiv) resultDiv.textContent = "❌ Pas assez d’items avec ces filtres.";
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => {
        stopAllMedia();
        showCustomization();
        updatePreview();
      };
    }
    return;
  }

  refillBag();
  const p = drawPair();
  leftItem = p.a;
  rightItem = p.b;

  renderTurn();
}

function setCardContent(side, item, { revealed = true, autoplay = true } = {}) {
  const isSongs = (currentMode === "songs");
  const isLeft = side === "left";

  const img = isLeft ? leftImg : rightImg;
  const nameEl = isLeft ? leftName : rightName;
  const pZone = isLeft ? leftPlayerZone : rightPlayerZone;
  const player = isLeft ? leftPlayer : rightPlayer;

  // (sécurité)
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
    // jamais d'image avant la vidéo en Songs
    img.style.display = "none";
    img.removeAttribute("src");

    pZone.style.display = revealed ? "block" : "none";

    if (revealed && item?.url) {
      // pas de poster non plus
      player.poster = "";

      applyVolume();

      // tokens
      if (isLeft) mediaTokenLeft++;
      else mediaTokenRight++;

      const localRound = roundToken;
      const localMedia = isLeft ? mediaTokenLeft : mediaTokenRight;

      // reset + load
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

          // seek+play snippet
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
    // mode anime (image)
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
  clearChoiceEffects();

  if (roundLabel) roundLabel.textContent = `Tour ${currentTurn} / ${totalTurns}`;
  if (resultDiv) resultDiv.textContent = "";
  if (nextBtn) nextBtn.style.display = "none";

  if (keepBtn) keepBtn.disabled = false;
  if (nextChoiceBtn) nextChoiceBtn.disabled = false;

  setCardContent("left", leftItem, { revealed: true, autoplay: true });
  hideRightCard();

  if (volumeRow) volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
}

function handleChoice(choice) {
  if (!leftItem || !rightItem) return;

  if (keepBtn) keepBtn.disabled = true;
  if (nextChoiceBtn) nextChoiceBtn.disabled = true;

  // éviter double audio au reveal
  try { leftPlayer.pause(); } catch {}
  leftPlayer.onplay = null;

  // effet visuel choix
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

  const isLast = currentTurn >= totalTurns;

  if (nextBtn) {
    nextBtn.style.display = "block";
    if (!isLast) {
      nextBtn.textContent = "Tour suivant";
      nextBtn.onclick = () => {
        stopAllMedia();

        const p = drawPair();
        leftItem = p.a;
        rightItem = p.b;

        currentTurn++;
        renderTurn();
      };
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
      return {
        ...a,
        _title: title,
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();

    // ✅ applique params parcours si présents (mode/count + éventuellement filtres)
    if (isParcours) {
      applyParcoursParamsToUIIfAny();
      // force mode pills cohérents
      updateModePillsFromState();
    }

    updatePreview();

    // ✅ Parcours: auto-start (skip personnalisation du mini-jeu)
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
        // si vraiment pas assez, on retombe sur l’écran réglages pour voir le problème
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
