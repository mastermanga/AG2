/**********************
 * TopPick (Anime / Songs)
 * - Même personnalisation que Blind Ranking
 * - Chaque round: règle random (Garde 1 / Supprime 1 / Garde 3 / Supprime 3)
 * - Chaque round: filtre “contenu” auto (année/studio/tag/score/pop + songYear + artiste)
 *   - 1 fois sur 5 => Libre (aucun filtre contenu)
 * - 6 items révélés progressivement
 *   - Anime: 1er item à t=0, puis 1 item / 1s
 *   - Songs: play auto non mute à 50s pendant 20s DE VIDÉO (currentTime), stop, suivant...
 * - Pas de points
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

// ====== CONST ======
const MIN_REQUIRED = 64;

// Songs preview
const SONG_START_SEC = 50;
const SONG_PLAY_SEC = 20; // ✅ 20s DE VIDEO

// retries: 1 essai + 5 retries => 0, 2s, 4s, 6s, 8s, 10s
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

// sécurité anti-blocage total (si ça ne joue jamais)
const MAX_WALL_SNIPPET_MS = 60000;

// 1 fois sur 5 : pas de filtre contenu
const FREE_THEME_PROBA = 0.20;

// Règles de round
const THEMES = [
  { key: "KEEP1", label: "Garde 1", required: 1, mode: "keep", desc: "Choisis 1 favori à garder." },
  { key: "DEL1",  label: "Supprime 1", required: 1, mode: "delete", desc: "Choisis 1 à supprimer." },
  { key: "KEEP3", label: "Garde 3", required: 3, mode: "keep", desc: "Choisis 3 favoris à garder." },
  { key: "DEL3",  label: "Supprime 3", required: 3, mode: "delete", desc: "Choisis 3 à supprimer." }, // ✅ AJOUT
];

// ====== HELPERS ======
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
function getYearFromSeasonStr(seasonStr, fallback = 0) {
  const s = (seasonStr ? String(seasonStr) : "").trim();
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
function songTypeLabel(t) {
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "IN";
}
function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = (s.songNumber ? ` ${s.songNumber}` : "");
  const name = (s.songName ? ` — ${s.songName}` : "");
  const art = (s.songArtists ? ` — ${s.songArtists}` : "");
  return `${s.animeTitle || "Anime"} ${type}${num}${name}${art}`;
}
function formatItemLabel(it) {
  if (!it) return "";
  if (it.kind === "song") return formatSongTitle(it);
  return it.title || "";
}

// ✅ songs extraction: ajoute songYear + artistsArr + anime meta tags
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

      const songYear = getYearFromSeasonStr(it.season, anime._year);

      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",
        artistsArr,
        songYear,

        animeTitle: anime._title,
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,
        animeStudio: anime._studio || "",
        animeTags: [...(anime._genres || []), ...(anime._themes || [])],

        image: anime.image || "",
        url,
        _key: `${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
      });
    }
  }
  return out;
}

function pickNFromPool(pool, n) {
  const used = new Set();
  const out = [];
  const shuffled = shuffleInPlace([...pool]);
  for (const it of shuffled) {
    if (out.length >= n) break;
    if (used.has(it._key)) continue;
    used.add(it._key);
    out.push(it);
  }
  return out;
}

function randomRuleTheme() {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

/* ==========================
   AUTO “THEME CONTENU” / ROUND
   ========================== */
function norm(s){ return (s || "").toString().trim().toLowerCase(); }
function hasTag(it, tag) {
  const t = norm(tag);
  const arr = Array.isArray(it.tags) ? it.tags : [];
  return arr.some(x => norm(x) === t);
}
function includesStudio(studio, needle) {
  const s = norm(studio);
  const n = norm(needle);
  if (!s || !n) return false;
  return s.includes(n);
}
function nearbyPool(pool, getNum, target, want = 6) {
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
function pickRoundContentThemeAuto(basePool, mode) {
  const MIN = 6;
  const MAX_TRIES = 60;

  const getAnimeYear = (it) => mode === "songs" ? (it.animeYear || 0) : (it.year || 0);
  const getSongYear  = (it) => (it.songYear || it.animeYear || 0);
  const getStudio    = (it) => mode === "songs" ? (it.animeStudio || "") : (it.studio || "");
  const getScore     = (it) => mode === "songs" ? (it.animeScore || 0) : (it.score || 0);
  const getPop       = (it) => mode === "songs" ? (it.animeMembers || 0) : (it.members || 0);

  const criteriaAnime = ["YEAR","STUDIO","TAG","SCORE_NEAR","POP_NEAR"];
  const criteriaSongs = ["YEAR","SONG_YEAR","STUDIO","TAG","SCORE_NEAR","POP_NEAR","ARTIST"];
  const list = (mode === "songs") ? criteriaSongs : criteriaAnime;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const seed = basePool[Math.floor(Math.random() * basePool.length)];
    if (!seed) break;

    const crit = list[Math.floor(Math.random() * list.length)];
    let pool = [];
    let label = "Libre";

    if (crit === "YEAR") {
      const y = getAnimeYear(seed);
      if (!y) continue;
      pool = basePool.filter(it => getAnimeYear(it) === y);
      label = `Année anime : ${y}`;
    }

    if (crit === "SONG_YEAR" && mode === "songs") {
      const y = getSongYear(seed);
      if (!y) continue;
      pool = basePool.filter(it => getSongYear(it) === y);
      label = `Année song : ${y}`;
    }

    if (crit === "STUDIO") {
      const st = getStudio(seed);
      if (!st) continue;
      pool = basePool.filter(it => includesStudio(getStudio(it), st));
      label = `Studio : ${st}`;
    }

    if (crit === "TAG") {
      const tags = Array.isArray(seed.tags) ? seed.tags : [];
      if (!tags.length) continue;
      const t = tags[Math.floor(Math.random() * tags.length)];
      pool = basePool.filter(it => hasTag(it, t));
      label = `Tag : ${t}`;
    }

    if (crit === "SCORE_NEAR") {
      const sc = getScore(seed);
      if (!sc) continue;
      pool = nearbyPool(basePool, getScore, sc, MIN);
      label = `Score proche`;
    }

    if (crit === "POP_NEAR") {
      const pop = getPop(seed);
      if (!pop) continue;
      pool = nearbyPool(basePool, getPop, pop, MIN);
      label = `Popularité proche`;
    }

    if (crit === "ARTIST" && mode === "songs") {
      const arts = Array.isArray(seed.artistsArr) ? seed.artistsArr.filter(Boolean) : [];
      if (!arts.length) continue;
      const a = arts[Math.floor(Math.random() * arts.length)];
      pool = basePool.filter(it =>
        Array.isArray(it.artistsArr) && it.artistsArr.some(x => norm(x) === norm(a))
      );
      label = `Artiste : ${a}`;
    }

    if (pool.length >= MIN) return { label, pool, crit };
  }

  return { label: "Libre", pool: basePool, crit: "FREE" };
}

/* ==========================
   DOM
   ========================== */
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
const choiceList = document.getElementById("choice-list");

const themeNameEl = document.getElementById("themeName");
const themeDescEl = document.getElementById("themeDesc");
const revealStatusEl = document.getElementById("revealStatus");
const pickStatusEl = document.getElementById("pickStatus");
const resultDiv = document.getElementById("result");

const confirmBtn = document.getElementById("confirmBtn");
const nextBtn = document.getElementById("nextBtn");

const playerZone = document.getElementById("player-zone");
const nowPlaying = document.getElementById("nowPlaying");
const songPlayer = document.getElementById("songPlayer");

const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== URL (PARCOURS) compat ======
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
const forcedMode = urlParams.get("mode"); // "anime" | "songs"

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime";
let filteredPool = [];

// ====== GAME STATE ======
let totalRounds = 1;
let currentRound = 1;

let currentRuleTheme = null;
let currentContentTheme = null;

let roundItems = []; // 6 items

let revealDone = false;
let selectionEnabled = false;
let selectedKeys = new Set();
let lockedAfterValidate = false;

// tokens
let roundToken = 0;
let mediaToken = 0;

let revealTimer = null;
let wallTimer = null;

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
  volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== MEDIA LOADER (retries + anti-stall) ======
function hardResetMedia() {
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();
}
function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}
function loadMediaWithRetries(url, localRound, localMedia, { onReady } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    songPlayer.onloadedmetadata = null;
    songPlayer.oncanplay = null;
    songPlayer.onplaying = null;
    songPlayer.onwaiting = null;
    songPlayer.onstalled = null;
    songPlayer.onerror = null;
  };

  const isStillValid = () => (localRound === roundToken && localMedia === mediaToken);

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
    onReady?.();
  };

  const triggerRetry = () => {
    if (!isStillValid() || done) return;
    cleanup();
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
  return cleanup;
}

// ====== UI INIT ======
function initCustomUI() {
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
      updatePreview();
    });
  });

  document.querySelectorAll("#songPills .pill").forEach(btn => {
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
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach(el => el.addEventListener("input", syncLabels));

  applyBtn.addEventListener("click", () => {
    filteredPool = applyFilters();
    const minNeeded = Math.max(6, MIN_REQUIRED);
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
    let pool = allAnimes.filter(a => a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type));
    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    return pool.map(a => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      title: a._title,
      image: a.image || "",
      year: a._year,
      studio: a._studio || "",
      members: a._members,
      score: a._score,
      tags: [...(a._genres || []), ...(a._themes || [])],
    }));
  }

  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map(b => b.dataset.song);
  if (allowedSongs.length === 0) return [];

  let pool = allSongs.filter(s =>
    s.animeYear >= yearMin && s.animeYear <= yearMax &&
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
    artistsArr: Array.isArray(s.artistsArr) ? s.artistsArr : [],
    songType: s.songType,
    url: s.url,
    image: s.image || "",

    animeYear: s.animeYear || 0,
    songYear: s.songYear || s.animeYear || 0,
    animeStudio: s.animeStudio || "",
    animeMembers: s.animeMembers || 0,
    animeScore: s.animeScore || 0,
    tags: Array.isArray(s.animeTags) ? s.animeTags : [],
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
  const minNeeded = Math.max(6, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;
  const label = (currentMode === "songs") ? "Songs" : "Titres";

  previewCountEl.textContent = ok
    ? `🎵 ${label} disponibles : ${pool.length} (OK)`
    : `🎵 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== ROUND UI ======
function clearRevealTimer() {
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
}
function clearWallTimer() {
  if (wallTimer) { clearTimeout(wallTimer); wallTimer = null; }
}
function stopMedia() {
  mediaToken++;
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();
}

function resetRoundUI() {
  clearRevealTimer();
  clearWallTimer();
  stopMedia();

  revealDone = false;
  selectionEnabled = false;
  selectedKeys.clear();
  lockedAfterValidate = false;

  resultDiv.textContent = "";

  themeNameEl.style.display = "none";
  themeDescEl.style.display = "none";
  revealStatusEl.style.display = "none";
  pickStatusEl.style.display = "none";

  confirmBtn.disabled = true;
  confirmBtn.classList.add("disabled");
  nextBtn.style.display = "none";

  playerZone.style.display = (currentMode === "songs") ? "block" : "none";
  volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  if (currentMode === "songs") applyVolume();
}

function renderPlaceholders() {
  choiceList.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const li = document.createElement("li");
    li.classList.add("tp-item", "tp-locked");
    li.dataset.index = String(i);

    const ph = document.createElement("div");
    ph.className = "placeholder";
    li.appendChild(ph);

    const span = document.createElement("span");
    span.textContent = `#${i + 1}`;
    li.appendChild(span);

    choiceList.appendChild(li);
  }
}

function setThemeUI(ruleTheme, contentTheme) {
  const cLabel = contentTheme?.label || "Libre";
  themeNameEl.textContent = `🎲 Règle : ${ruleTheme.label}`;
  themeDescEl.textContent = `${ruleTheme.desc} • 🎯 Filtre : ${cLabel}`;
}

function updatePickStatus() {
  if (!currentRuleTheme) return;
  const need = currentRuleTheme.required;
  const got = selectedKeys.size;

  pickStatusEl.textContent = (currentRuleTheme.mode === "delete")
    ? `❌ À supprimer : ${got} / ${need}`
    : `✅ À garder : ${got} / ${need}`;

  const ok = got === need;
  pickStatusEl.classList.toggle("good", ok);
  pickStatusEl.classList.toggle("bad", !ok);

  confirmBtn.disabled = !ok || !selectionEnabled || lockedAfterValidate;
  confirmBtn.classList.toggle("disabled", confirmBtn.disabled);
}

function markRevealDone() {
  revealDone = true;
  selectionEnabled = true;

  themeNameEl.style.display = "block";
  themeDescEl.style.display = "block";

  revealStatusEl.style.display = "block";
  revealStatusEl.classList.remove("bad");
  revealStatusEl.classList.add("good");
  revealStatusEl.textContent = "✅ Révélation terminée — à toi de jouer !";

  pickStatusEl.style.display = "block";
  updatePickStatus();
}

// ====== REVEAL (ANIME) ======
function revealAnimeProgressively(items, localRound) {
  let i = 0;

  const step = () => {
    if (localRound !== roundToken) { clearRevealTimer(); return; }
    if (i >= items.length) { clearRevealTimer(); markRevealDone(); return; }
    revealCard(i, items[i], localRound);
    i++;
  };

  requestAnimationFrame(() => step());
  revealTimer = setInterval(step, 1000);
}

// ====== REVEAL (SONGS) ======
async function revealSongsSequence(items, localRound) {
  for (let i = 0; i < items.length; i++) {
    if (localRound !== roundToken) return;
    revealCard(i, items[i], localRound);
    await playSongSnippet(items[i], localRound).catch(() => {});
  }
  if (localRound !== roundToken) return;
  markRevealDone();
}

function revealCard(index, item, localRound) {
  if (localRound !== roundToken) return;
  const li = choiceList.querySelector(`li[data-index="${index}"]`);
  if (!li) return;

  li.innerHTML = "";
  li.classList.remove("tp-locked");
  li.dataset.key = item._key;
  li.dataset.revealed = "1";

  const img = document.createElement("img");
  img.src = item.image || "";
  img.alt = (item.kind === "song") ? (item.animeTitle || "Cover") : (item.title || "Cover");
  img.loading = "lazy";
  img.decoding = "async";
  li.appendChild(img);

  const span = document.createElement("span");
  span.textContent = formatItemLabel(item);
  li.appendChild(span);

  applySelectionStyles(li);
}

function applySelectionStyles(li) {
  li.classList.remove("tp-selected-keep", "tp-selected-delete");
  const key = li.dataset.key;
  if (!key || !selectedKeys.has(key) || !currentRuleTheme) return;
  if (currentRuleTheme.mode === "delete") li.classList.add("tp-selected-delete");
  else li.classList.add("tp-selected-keep");
}

// ====== SONG SNIPPET (20s DE VIDÉO) ======
function playSongSnippet(item, localRound) {
  return new Promise((resolve) => {
    if (currentMode !== "songs" || !item?.url) { resolve(); return; }

    clearWallTimer();
    stopMedia();

    nowPlaying.textContent = `🎵 Extrait : ${formatItemLabel(item)}`;

    mediaToken++;
    const localMedia = mediaToken;

    wallTimer = setTimeout(() => {
      cleanupAll();
      resolve();
    }, MAX_WALL_SNIPPET_MS);

    let endTime = null;
    let cleanupLoad = null;

    const onTimeUpdate = () => {
      if (localRound !== roundToken || localMedia !== mediaToken) return;
      if (endTime == null) return;
      if (songPlayer.currentTime >= endTime) stopSnippet();
    };
    const onEnded = () => stopSnippet();

    const cleanupAll = () => {
      clearWallTimer();
      songPlayer.removeEventListener("timeupdate", onTimeUpdate);
      songPlayer.removeEventListener("ended", onEnded);
      try { songPlayer.pause(); } catch {}
      cleanupLoad?.();
    };

    const stopSnippet = () => {
      if (localRound !== roundToken || localMedia !== mediaToken) {
        cleanupAll();
        resolve();
        return;
      }
      cleanupAll();
      resolve();
    };

    cleanupLoad = loadMediaWithRetries(item.url, localRound, localMedia, {
      onReady: () => {
        if (localRound !== roundToken || localMedia !== mediaToken) {
          cleanupAll();
          resolve();
          return;
        }

        applyVolume();
        songPlayer.muted = false;

        let start = SONG_START_SEC;
        const dur = songPlayer.duration;
        if (Number.isFinite(dur) && dur > 1) {
          start = Math.min(SONG_START_SEC, Math.max(0, dur - 0.25));
          endTime = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
        } else {
          endTime = start + SONG_PLAY_SEC;
        }

        songPlayer.addEventListener("timeupdate", onTimeUpdate);
        songPlayer.addEventListener("ended", onEnded);

        try { songPlayer.currentTime = start; } catch {}
        songPlayer.play?.().catch(() => {});
      }
    });
  });
}

// ====== SELECTION ======
choiceList.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  if (!selectionEnabled || lockedAfterValidate) return;
  if (li.classList.contains("tp-locked")) return;
  if (li.dataset.revealed !== "1") return;

  const key = li.dataset.key;
  if (!key || !currentRuleTheme) return;

  const need = currentRuleTheme.required;

  if (selectedKeys.has(key)) selectedKeys.delete(key);
  else {
    if (selectedKeys.size >= need) return;
    selectedKeys.add(key);
  }

  [...choiceList.querySelectorAll("li")].forEach(applySelectionStyles);
  updatePickStatus();
});

confirmBtn.addEventListener("click", () => {
  if (!currentRuleTheme || lockedAfterValidate) return;
  if (!selectionEnabled) return;
  if (selectedKeys.size !== currentRuleTheme.required) return;

  lockedAfterValidate = true;
  confirmBtn.disabled = true;
  confirmBtn.classList.add("disabled");

  clearRevealTimer();
  clearWallTimer();
  stopMedia();

  [...choiceList.querySelectorAll("li")].forEach(li => {
    const key = li.dataset.key;
    if (!key) return;
    li.querySelectorAll(".tp-badge").forEach(b => b.remove());

    if (!selectedKeys.has(key)) return;

    const badge = document.createElement("div");
    badge.className = "tp-badge";
    badge.textContent = (currentRuleTheme.mode === "delete") ? "❌ SUPPRIMÉ" : "✅ GARDÉ";
    li.appendChild(badge);
  });

  if (currentRuleTheme.mode === "delete") {
    resultDiv.textContent = (currentRuleTheme.required === 1)
      ? "✅ Validé — le titre sélectionné est supprimé."
      : "✅ Validé — tes 3 titres sélectionnés sont supprimés.";
  } else {
    resultDiv.textContent = (currentRuleTheme.required === 1)
      ? "✅ Validé — ton favori est gardé."
      : "✅ Validé — tes 3 favoris sont gardés.";
  }

  nextBtn.style.display = "inline-block";
  const isLast = currentRound >= totalRounds;
  nextBtn.textContent = isLast ? "Retour réglages" : "Round suivant";
  nextBtn.onclick = () => {
    if (!isLast) {
      currentRound++;
      startRound();
    } else {
      showCustomization();
      updatePreview();
      if (isParcours) {
        try { parent.postMessage({ parcoursScore: { label: "TopPick", score: 0, total: 0 } }, "*"); } catch {}
      }
    }
  };
});

// ====== ROUND FLOW ======
function startRound() {
  roundToken++;
  resetRoundUI();

  const minNeeded = Math.max(6, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "inline-block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  currentRuleTheme = randomRuleTheme();

  // ✅ 1 fois sur 5 : pas de thème contenu
  if (Math.random() < FREE_THEME_PROBA) {
    currentContentTheme = { label: "Libre", pool: filteredPool, crit: "FREE" };
  } else {
    currentContentTheme = pickRoundContentThemeAuto(filteredPool, currentMode);
  }

  setThemeUI(currentRuleTheme, currentContentTheme);

  // pool finale pour tirer les 6
  const finalPool = (currentContentTheme?.pool && currentContentTheme.pool.length >= 6)
    ? currentContentTheme.pool
    : filteredPool;

  roundItems = pickNFromPool(finalPool, 6);
  if (roundItems.length < 6) {
    resultDiv.textContent = "❌ Impossible de sélectionner 6 items uniques avec ces filtres.";
    nextBtn.style.display = "inline-block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
  renderPlaceholders();

  if (currentMode === "songs") revealSongsSequence(roundItems, roundToken);
  else revealAnimeProgressively(roundItems, roundToken);
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
      return {
        ...a,
        _title: title,
        _titleLower: title.toLowerCase(),
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
        _studio: a.studio || "",
        _genres: Array.isArray(a.genres) ? a.genres : [],
        _themes: Array.isArray(a.themes) ? a.themes : [],
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();
    applyVolume();

    if (isParcours) {
      filteredPool = applyFilters();
      const minNeeded = Math.max(6, MIN_REQUIRED);
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
