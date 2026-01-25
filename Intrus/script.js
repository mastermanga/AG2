/**********************
 * Intrus (Anime / Songs)
 * - 4 items, 1 intrus
 * - Anime: A direct, puis +1 image / seconde, puis thème + choix
 * - Songs: écoute A→D (player caché), puis thème + choix
 * - Après réponse en Songs: on révèle image + label complet sur les 4 cartes
 *
 * THEMES CONTENU
 * - Anime: YEAR, STUDIO, POP25, SCOREBIN
 * - Songs: LICENSE, YEAR, ARTIST, SONG_TYPE
 *
 * Thème affiché: UNIQUEMENT le nom (pas de valeur).
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

// Songs snippet
const SONG_START_SEC = 45;
const SONG_PLAY_SEC = 30;

// retries: 1 essai + 5 retries => 0, 2s, 4s, 6s, 8s, 10s
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;
const MAX_WALL_SNIPPET_MS = 75000;

const LETTERS = ["A", "B", "C", "D"];

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
function norm(s){ return (s || "").toString().trim().toLowerCase(); }

// score bins anime
function scoreBin(v){
  const x = safeNum(v);
  if (x <= 5) return 0;        // 0.0 → 5.0
  if (x <= 7.5) return 1;      // 5.1 → 7.5
  return 2;                    // 7.6 → 10.0
}

// pop25 band (0..3) — 0 = top 25% (plus populaire), 3 = 76-100% (moins populaire)
function computePopBands(items, getMembers){
  const arr = [...items].sort((a,b) => getMembers(b) - getMembers(a));
  const n = arr.length || 1;
  const bandByKey = new Map();
  for (let i = 0; i < arr.length; i++) {
    const pct = i / n;
    const band = Math.min(3, Math.floor(pct * 4));
    bandByKey.set(arr[i]._key, band);
  }
  return bandByKey;
}

// ====== SONG LABEL FORMAT ======
function songTypeLabel(t){
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "IN";
}
function formatSongFullLabel(s){
  const anime = s.animeTitle || "Anime";
  const type = songTypeLabel(s.songType);
  const num = s.songNumber ? ` ${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const artists = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${anime} ${type}${num}${name}${artists}`;
}

// ====== songs extraction (✅ ajoute image + artists string) ======
function extractSongsFromAnime(anime) {
  const out = [];
  const song = anime.song || {};
  const buckets = [
    { key: "openings", type: "OP" },
    { key: "endings", type: "ED" },
    { key: "inserts", type: "IN" },
  ];

  const licenseId = anime.license_id || anime.mal_id || 0;

  for (const b of buckets) {
    const arr = Array.isArray(song[b.key]) ? song[b.key] : [];
    for (const it of arr) {
      const url = it.video || it.url || "";
      if (!url || typeof url !== "string" || url.length < 6) continue;

      const artistsArr = Array.isArray(it.artists) ? it.artists.filter(Boolean) : [];
      const songArtists = artistsArr.join(", ");
      const songYear = getYearFromSeasonStr(it.season, anime._year);

      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        artistsArr,
        songArtists,
        songYear,

        animeTitle: anime._title,
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

        image: anime.image || "",

        licenseId,
        url,
        _key: `song|${b.type}|${it.number || ""}|${it.name || ""}|${url}|${licenseId}`,
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

const roundLabel = document.getElementById("roundLabel");
const choiceList = document.getElementById("choice-list");

const themeNameEl = document.getElementById("themeName");
const themeDescEl = document.getElementById("themeDesc");
const revealStatusEl = document.getElementById("revealStatus");
const pickStatusEl = document.getElementById("pickStatus");
const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

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
let scoreCorrect = 0;
let scoreTotal = 0;

let currentThemeKey = null;
let currentIntrusIndex = 0;
let roundItems = [];
let selectionEnabled = false;
let answered = false;

let roundToken = 0;
let mediaToken = 0;
let revealTimer = null;
let wallTimer = null;

const usedKeysGlobal = new Set();

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
    songPlayer.controls = false;
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

// ====== RESET ROUND ======
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

  selectionEnabled = false;
  answered = false;

  resultDiv.textContent = "";
  themeNameEl.style.display = "none";
  themeDescEl.style.display = "none";
  pickStatusEl.style.display = "none";

  revealStatusEl.style.display = "none";
  revealStatusEl.classList.remove("good");
  revealStatusEl.classList.add("bad");

  nextBtn.style.display = "none";

  volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  if (currentMode === "songs") applyVolume();
}

function updateRoundLabel() {
  roundLabel.textContent = `Round ${currentRound} / ${totalRounds} — Score ${scoreCorrect}/${scoreTotal}`;
}

// ====== THEME DISPLAY (only theme name) ======
const THEME_LABELS = {
  // Anime
  YEAR: "Année",
  STUDIO: "Studio",
  POP25: "Popularité",
  SCOREBIN: "Score",
  // Songs
  LICENSE: "Licence",
  YEAR_SONG: "Année",
  ARTIST: "Artiste",
  SONG_TYPE: "Type",
  YEAR: "Année",
};
function showThemeOnly(themeKey) {
  const label = THEME_LABELS[themeKey] || "Thème";
  themeNameEl.textContent = `🎯 Thème : ${label}`;
  themeDescEl.textContent = `Un seul choix est l’intrus.`;
  themeNameEl.style.display = "block";
  themeDescEl.style.display = "block";

  pickStatusEl.textContent = "✅ Choisis l’intrus (bouton sous la carte).";
  pickStatusEl.classList.remove("bad");
  pickStatusEl.classList.add("good");
  pickStatusEl.style.display = "block";
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

  // ✅ on garde aussi les infos d’affichage pour reveal après réponse
  return pool.map(s => ({
    kind: "song",
    _key: s._key,
    url: s.url,
    licenseId: s.licenseId || 0,

    songType: s.songType,
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    artistsArr: Array.isArray(s.artistsArr) ? s.artistsArr : [],

    songYear: s.songYear || 0,
    animeYear: s.animeYear || 0,

    animeTitle: s.animeTitle || "Anime",
    image: s.image || "",

    animeMembers: s.animeMembers || 0,
    animeScore: s.animeScore || 0,
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
  const ok = pool.length >= Math.max(8, MIN_REQUIRED);
  const label = (currentMode === "songs") ? "Songs" : "Titres";

  previewCountEl.textContent = ok
    ? `📚 ${label} disponibles : ${pool.length} (OK)`
    : `📚 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== CUSTOM UI ======
function updateModeVisibility() {
  songsRow.style.display = (currentMode === "songs") ? "flex" : "none";
}
function updateModePillsFromState() {
  document.querySelectorAll("#modePills .pill").forEach(b => {
    const active = b.dataset.mode === currentMode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  updateModeVisibility();
}
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
    const minNeeded = Math.max(8, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    scoreCorrect = 0;
    scoreTotal = 0;

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

// ====== ROUND BUILD (3 same + 1 intrus) ======
function groupBy(items, getVal){
  const m = new Map();
  for (const it of items) {
    const v = getVal(it);
    if (v == null) continue;
    const k = String(v);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}
function pickFrom(arr, n, forbidKeysSet = null){
  const copy = shuffleInPlace([...arr]);
  const out = [];
  for (const it of copy) {
    if (out.length >= n) break;
    if (forbidKeysSet && forbidKeysSet.has(it._key)) continue;
    out.push(it);
  }
  return out;
}

function buildRoundAnime(pool){
  const THEMES = ["YEAR", "STUDIO", "POP25", "SCOREBIN"];
  const MAX_TRIES = 120;
  const popBands = computePopBands(pool, it => it.members);

  for (let t = 0; t < MAX_TRIES; t++) {
    const themeKey = THEMES[Math.floor(Math.random() * THEMES.length)];
    let triple = [];
    let intrus = null;

    if (themeKey === "YEAR") {
      const g = groupBy(pool.filter(x => x.year > 0), x => x.year);
      const candidates = [...g.entries()].filter(([,arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [yearKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;
      intrus = pickFrom(pool.filter(x => String(x.year) !== yearKey), 1, new Set(triple.map(x=>x._key)))[0];
      if (!intrus) continue;
    }

    if (themeKey === "STUDIO") {
      const g = groupBy(pool.filter(x => norm(x.studio)), x => norm(x.studio));
      const candidates = [...g.entries()].filter(([k,arr]) => k && arr.length >= 3);
      if (!candidates.length) continue;
      const [stKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;
      intrus = pickFrom(pool.filter(x => norm(x.studio) !== stKey), 1, new Set(triple.map(x=>x._key)))[0];
      if (!intrus) continue;
    }

    if (themeKey === "POP25") {
      const g = new Map();
      for (const it of pool) {
        const band = popBands.get(it._key);
        if (!g.has(band)) g.set(band, []);
        g.get(band).push(it);
      }
      const candidates = [...g.entries()].filter(([,arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [bandKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;
      intrus = pickFrom(pool.filter(x => popBands.get(x._key) !== bandKey), 1, new Set(triple.map(x=>x._key)))[0];
      if (!intrus) continue;
    }

    if (themeKey === "SCOREBIN") {
      const g = groupBy(pool.filter(x => safeNum(x.score) > 0), x => scoreBin(x.score));
      const candidates = [...g.entries()].filter(([,arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [binKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;
      intrus = pickFrom(pool.filter(x => String(scoreBin(x.score)) !== String(binKey)), 1, new Set(triple.map(x=>x._key)))[0];
      if (!intrus) continue;
    }

    const items = shuffleInPlace([...triple, intrus]);
    const intrusIndex = items.findIndex(x => x._key === intrus._key);
    if (intrusIndex < 0) continue;

    const newCount = items.filter(x => !usedKeysGlobal.has(x._key)).length;
    if (usedKeysGlobal.size > 0 && newCount < 2 && pool.length > 120) continue;

    return { items, intrusIndex, themeKey };
  }

  const items = pickFrom(pool, 4);
  return { items, intrusIndex: Math.floor(Math.random() * 4), themeKey: "YEAR" };
}

function buildRoundSongs(pool){
  const THEMES = ["LICENSE", "YEAR", "ARTIST", "SONG_TYPE"];
  const MAX_TRIES = 140;
  const getYearVal = (s) => (s.songYear || s.animeYear || 0);

  for (let t = 0; t < MAX_TRIES; t++) {
    const themeKey = THEMES[Math.floor(Math.random() * THEMES.length)];
    let triple = [];
    let intrus = null;

    if (themeKey === "LICENSE") {
      const g = groupBy(pool.filter(x => x.licenseId), x => x.licenseId);
      const candidates = [...g.entries()].filter(([,arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [licKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;
      intrus = pickFrom(pool.filter(x => String(x.licenseId) !== licKey), 1, new Set(triple.map(x=>x._key)))[0];
      if (!intrus) continue;
    }

    if (themeKey === "YEAR") {
      const g = groupBy(pool.filter(x => getYearVal(x) > 0), x => getYearVal(x));
      const candidates = [...g.entries()].filter(([,arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [yKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;
      intrus = pickFrom(pool.filter(x => String(getYearVal(x)) !== yKey), 1, new Set(triple.map(x=>x._key)))[0];
      if (!intrus) continue;
    }

    if (themeKey === "SONG_TYPE") {
      const g = groupBy(pool.filter(x => x.songType), x => x.songType);
      const candidates = [...g.entries()].filter(([,arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [typeKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;
      intrus = pickFrom(pool.filter(x => String(x.songType) !== typeKey), 1, new Set(triple.map(x=>x._key)))[0];
      if (!intrus) continue;
    }

    if (themeKey === "ARTIST") {
      const map = new Map();
      for (const s of pool) {
        const arts = Array.isArray(s.artistsArr) ? s.artistsArr.filter(Boolean) : [];
        for (const a of arts) {
          const k = norm(a);
          if (!k) continue;
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(s);
        }
      }
      const candidates = [...map.entries()].filter(([,arr]) => arr.length >= 3);
      if (!candidates.length) continue;

      const [artistKey, list] = candidates[Math.floor(Math.random() * candidates.length)];
      triple = pickFrom(list, 3);
      if (triple.length < 3) continue;

      const tripleKeys = new Set(triple.map(x=>x._key));
      intrus = pickFrom(
        pool.filter(s => {
          if (tripleKeys.has(s._key)) return false;
          const arts = Array.isArray(s.artistsArr) ? s.artistsArr : [];
          return !arts.some(a => norm(a) === artistKey);
        }),
        1
      )[0];
      if (!intrus) continue;
    }

    const items = shuffleInPlace([...triple, intrus]);
    const intrusIndex = items.findIndex(x => x._key === intrus._key);
    if (intrusIndex < 0) continue;

    const newCount = items.filter(x => !usedKeysGlobal.has(x._key)).length;
    if (usedKeysGlobal.size > 0 && newCount < 2 && pool.length > 220) continue;

    return { items, intrusIndex, themeKey };
  }

  const items = pickFrom(pool, 4);
  return { items, intrusIndex: Math.floor(Math.random() * 4), themeKey: "LICENSE" };
}

// ====== RENDER LIST ======
function renderInitialCards() {
  choiceList.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const li = document.createElement("li");
    li.className = "intrus-item";
    li.dataset.index = String(i);

    if (currentMode === "anime") {
      const cover = document.createElement("div");
      cover.className = "intrus-cover";
      const ph = document.createElement("div");
      ph.className = "intrus-ph";
      cover.appendChild(ph);
      li.appendChild(cover);

      const title = document.createElement("div");
      title.className = "intrus-title";
      title.textContent = "";
      li.appendChild(title);
    } else {
      const box = document.createElement("div");
      box.className = "intrus-song-box";
      box.textContent = `Song ${LETTERS[i]}`;
      li.appendChild(box);

      const title = document.createElement("div");
      title.className = "intrus-title";
      title.textContent = `Song ${LETTERS[i]}`;
      li.appendChild(title);
    }

    const btn = document.createElement("button");
    btn.className = "intrus-choice-btn";
    btn.textContent = "INTRUS";
    btn.disabled = true;
    btn.addEventListener("click", () => onPick(i));
    li.appendChild(btn);

    choiceList.appendChild(li);
  }
}

function revealAnimeCard(i) {
  const it = roundItems[i];
  const li = choiceList.querySelector(`li[data-index="${i}"]`);
  if (!li || !it) return;

  const cover = li.querySelector(".intrus-cover");
  if (cover) {
    cover.innerHTML = "";
    const img = document.createElement("img");
    img.src = it.image || "";
    img.alt = it.title || `Anime ${LETTERS[i]}`;
    img.loading = "lazy";
    img.decoding = "async";
    cover.appendChild(img);
  }
  const title = li.querySelector(".intrus-title");
  if (title) title.textContent = it.title || "";
}

// ✅ reveal songs details AFTER answer
function revealSongCardAfterAnswer(i) {
  const it = roundItems[i];
  const li = choiceList.querySelector(`li[data-index="${i}"]`);
  if (!li || !it) return;

  // remplace la box par une cover image
  const oldBox = li.querySelector(".intrus-song-box");
  if (oldBox) {
    const cover = document.createElement("div");
    cover.className = "intrus-cover";
    cover.innerHTML = "";

    const img = document.createElement("img");
    img.src = it.image || "";
    img.alt = it.animeTitle || `Song ${LETTERS[i]}`;
    img.loading = "lazy";
    img.decoding = "async";
    cover.appendChild(img);

    oldBox.replaceWith(cover);
  }

  const title = li.querySelector(".intrus-title");
  if (title) title.textContent = formatSongFullLabel(it);
}

function enableChoiceButtons() {
  selectionEnabled = true;
  answered = false;
  [...choiceList.querySelectorAll(".intrus-choice-btn")].forEach(b => b.disabled = false);
}

// ====== REVEAL FLOW ======
function finishRevealAndShowTheme() {
  revealStatusEl.style.display = "block";
  revealStatusEl.classList.remove("bad");
  revealStatusEl.classList.add("good");
  revealStatusEl.textContent = "✅ Tout est révélé — à toi de jouer !";

  showThemeOnly(currentThemeKey);
  enableChoiceButtons();
}

function startRevealAnime(localRound) {
  let idx = 0;
  revealStatusEl.style.display = "block";
  revealStatusEl.classList.add("bad");
  revealStatusEl.textContent = "🖼️ Révélation : 0 / 4";

  const step = () => {
    if (localRound !== roundToken) { clearRevealTimer(); return; }
    if (idx >= 4) { clearRevealTimer(); finishRevealAndShowTheme(); return; }
    revealAnimeCard(idx);
    idx++;
    revealStatusEl.textContent = `🖼️ Révélation : ${idx} / 4`;
  };

  step(); // A direct
  revealTimer = setInterval(step, 1000);
}

function playSongSnippet(item, localRound) {
  return new Promise((resolve) => {
    if (currentMode !== "songs" || !item?.url) { resolve(); return; }

    clearWallTimer();
    stopMedia();

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
        songPlayer.controls = false;

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

async function startRevealSongs(localRound) {
  revealStatusEl.style.display = "block";
  revealStatusEl.classList.add("bad");

  for (let i = 0; i < 4; i++) {
    if (localRound !== roundToken) return;
    revealStatusEl.textContent = `🎧 Écoute en cours… (Song ${LETTERS[i]})`;
    nowPlaying.textContent = `🎧 Écoute : Song ${LETTERS[i]}`;
    await playSongSnippet(roundItems[i], localRound).catch(() => {});
  }

  if (localRound !== roundToken) return;
  finishRevealAndShowTheme();
}

// ====== PICK ======
function disableChoiceButtons() {
  [...choiceList.querySelectorAll(".intrus-choice-btn")].forEach(b => b.disabled = true);
}

function onPick(index) {
  if (!selectionEnabled || answered) return;
  answered = true;
  selectionEnabled = false;

  disableChoiceButtons();
  scoreTotal++;

  const ok = index === currentIntrusIndex;
  if (ok) scoreCorrect++;

  updateRoundLabel();

  // ✅ APRÈS RÉPONSE : reveal songs (image + label complet)
  if (currentMode === "songs") {
    for (let i = 0; i < 4; i++) revealSongCardAfterAnswer(i);
  }

  const chosenLi = choiceList.querySelector(`li[data-index="${index}"]`);
  if (chosenLi) chosenLi.classList.add("intrus-picked");

  const correctLi = choiceList.querySelector(`li[data-index="${currentIntrusIndex}"]`);

  if (ok) {
    if (chosenLi) chosenLi.classList.add("intrus-correct");
    resultDiv.textContent = "✅ Bien joué !";
  } else {
    if (chosenLi) chosenLi.classList.add("intrus-wrong");
    if (correctLi) correctLi.classList.add("intrus-correct");
    resultDiv.textContent = "❌ Raté…";
  }

  for (const it of roundItems) usedKeysGlobal.add(it._key);

  nextBtn.style.display = "inline-block";
  const isLast = currentRound >= totalRounds;
  nextBtn.textContent = isLast ? "Retour réglages" : "Round suivant";
  nextBtn.onclick = () => {
    if (!isLast) {
      currentRound++;
      startRound();
    } else {
      if (isParcours) {
        try { parent.postMessage({ parcoursScore: { label: "Intrus", score: scoreCorrect, total: scoreTotal } }, "*"); } catch {}
      }
      showCustomization();
      updatePreview();
    }
  };
}

// ====== ROUND FLOW ======
function startRound() {
  roundToken++;
  resetRoundUI();
  updateRoundLabel();

  const minNeeded = Math.max(8, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "inline-block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  let built;
  if (currentMode === "songs") built = buildRoundSongs(filteredPool);
  else built = buildRoundAnime(filteredPool);

  roundItems = built.items;
  currentIntrusIndex = built.intrusIndex;
  currentThemeKey = built.themeKey;

  renderInitialCards();

  if (currentMode === "songs") startRevealSongs(roundToken);
  else startRevealAnime(roundToken);
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
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    try {
      songPlayer.controls = false;
      songPlayer.muted = false;
      songPlayer.playsInline = true;
      songPlayer.disablePictureInPicture = true;
    } catch {}

    initCustomUI();
    updatePreview();
    showCustomization();
    applyVolume();

    if (isParcours) {
      filteredPool = applyFilters();
      const minNeeded = Math.max(8, MIN_REQUIRED);
      if (filteredPool.length >= minNeeded) {
        totalRounds = clampInt(parcoursCount, 1, 100);
        currentRound = 1;
        scoreCorrect = 0;
        scoreTotal = 0;
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
