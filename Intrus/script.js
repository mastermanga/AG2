/**********************
 * Intrus (Anime / Songs)
 * - 4 items (A-D), 1 intrus
 * - Mode Anime: affiches visibles, boutons INTRUS
 * - Mode Songs: pas d'image, pas de vidéo visible (Song A/B/C/D)
 *   -> écoute 4 extraits (A->D), puis le thème s'affiche, puis choix
 * - Thèmes (UNIQUEMENT ceux validés)
 *   Anime: TAG, YEAR, STUDIO, POP_QUARTILE(25%), SCORE_BIN(0-5 / 5.1-7.5 / 7.6-10)
 *   Songs: LICENSE, SONG_YEAR (prio), STUDIO, ARTIST, SONG_TYPE
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
const ROUND_ITEMS = 4;

// Songs snippet (selon ton dernier réglage global)
const SONG_START_SEC = 45;
const SONG_PLAY_SEC = 30;

// retries: 1 essai + 5 retries => 0, 2s, 4s, 6s, 8s, 10s
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;
// sécurité anti-blocage total (si ça ne joue jamais)
const MAX_WALL_SNIPPET_MS = 65000;

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
function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function sampleDistinct(arr, n) {
  const a = [...arr];
  shuffleInPlace(a);
  return a.slice(0, n);
}
function norm(s){ return (s || "").toString().trim().toLowerCase(); }

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

// ====== Songs extraction (ajoute songYear + artistsArr + licenseId) ======
function extractSongsFromAnime(anime) {
  const out = [];
  const song = anime.song || {};
  const buckets = [
    { key: "openings", type: "OP" },
    { key: "endings", type: "ED" },
    { key: "inserts", type: "IN" },
  ];

  const licenseId = (anime.license_id ?? anime.mal_id ?? "");
  const licenseTitle = anime._title || anime.title || "Licence";

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
        songYear, // ✅ prio

        licenseId,
        licenseTitle,

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

const playerZone = document.getElementById("player-zone");
const nowPlaying = document.getElementById("nowPlaying");
const songPlayer = document.getElementById("songPlayer");

const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== URL (compat parcours) ======
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

let roundItems = [];
let intrusKey = null;
let roundThemeTitle = "";
let roundThemeDesc = "";

let selectionEnabled = false;
let lockedAfterPick = false;

let scoreGood = 0;

// tokens
let roundToken = 0;
let mediaToken = 0;

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
function clearWallTimer() {
  if (wallTimer) { clearTimeout(wallTimer); wallTimer = null; }
}
function hardResetMedia() {
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();
}
function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}
function stopMedia() {
  mediaToken++;
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();
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
    const minNeeded = Math.max(ROUND_ITEMS, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    scoreGood = 0;

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
    (s.animeYear || 0) >= yearMin && (s.animeYear || 0) <= yearMax &&
    allowedTypes.includes(s.animeType) &&
    allowedSongs.includes(s.songType)
  );

  pool.sort((a, b) => (b.animeMembers || 0) - (a.animeMembers || 0));
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => (b.animeScore || 0) - (a.animeScore || 0));
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool.map(s => ({
    kind: "song",
    _key: `song|${s._key}`,
    url: s.url,

    // affichage (révélé après le choix)
    animeTitle: s.animeTitle || "Anime",
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    artistsArr: Array.isArray(s.artistsArr) ? s.artistsArr : [],
    songType: s.songType,

    // thème
    licenseId: s.licenseId,
    licenseTitle: s.licenseTitle,

    songYear: s.songYear || 0,     // ✅ prio
    animeYear: s.animeYear || 0,   // fallback
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
  const minNeeded = Math.max(ROUND_ITEMS, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;
  const label = (currentMode === "songs") ? "Songs" : "Titres";

  previewCountEl.textContent = ok
    ? `🎲 ${label} disponibles : ${pool.length} (OK)`
    : `🎲 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== THEMES (Intrus) ======
function scoreBinLabel(bin) {
  if (bin === 1) return "0.0 → 5.0";
  if (bin === 2) return "5.1 → 7.5";
  return "7.6 → 10.0";
}
function scoreToBin(score) {
  const s = safeNum(score);
  if (s <= 5) return 1;
  if (s <= 7.5) return 2;
  return 3;
}
function quartileLabel(q) {
  if (q === 1) return "Top 25% (très populaire)";
  if (q === 2) return "26% → 50%";
  if (q === 3) return "51% → 75%";
  return "76% → 100% (moins populaire)";
}
function computePopularityQuartiles(animePool) {
  // animePool: items avec members
  const arr = [...animePool].sort((a,b) => (b.members || 0) - (a.members || 0));
  const N = arr.length || 1;
  const map = new Map();
  for (let i = 0; i < arr.length; i++) {
    const p = (i + 1) / N;         // 0..1 (rank)
    const q = Math.ceil(p * 4);    // 1..4
    map.set(arr[i]._key, clampInt(q, 1, 4));
  }
  return map;
}

function build3Plus1({ groupItems, outItems }) {
  if (!groupItems || groupItems.length < 3) return null;
  if (!outItems || outItems.length < 1) return null;

  const three = sampleDistinct(groupItems, 3);
  const intrus = pickOne(outItems.filter(x => !three.some(t => t._key === x._key)));
  if (!intrus) return null;

  const items = shuffleInPlace([...three, intrus]);
  return { items, intrusKey: intrus._key };
}

function tryGenerateAnimeRound(pool) {
  const themeKeys = ["TAG","YEAR","STUDIO","POP25","SCOREBIN"];
  for (let attempt = 0; attempt < 80; attempt++) {
    const theme = pickOne(themeKeys);

    if (theme === "TAG") {
      const tagMap = new Map();
      for (const it of pool) {
        const tags = Array.isArray(it.tags) ? it.tags : [];
        for (const t of tags) {
          const k = norm(t);
          if (!k) continue;
          if (!tagMap.has(k)) tagMap.set(k, { raw: t, items: [] });
          tagMap.get(k).items.push(it);
        }
      }
      const candidates = [...tagMap.values()].filter(x => x.items.length >= 3);
      if (!candidates.length) continue;
      const chosen = pickOne(candidates);

      const outItems = pool.filter(it => !(Array.isArray(it.tags) && it.tags.some(t => norm(t) === norm(chosen.raw))));
      const res = build3Plus1({ groupItems: chosen.items, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Tag",
        themeDesc: `3 animes partagent : ${chosen.raw}`,
        ...res
      };
    }

    if (theme === "YEAR") {
      const m = new Map();
      for (const it of pool) {
        const y = it.year || 0;
        if (!y) continue;
        if (!m.has(y)) m.set(y, []);
        m.get(y).push(it);
      }
      const years = [...m.entries()].filter(([y, arr]) => arr.length >= 3);
      if (!years.length) continue;
      const [y, groupItems] = pickOne(years);

      const outItems = pool.filter(it => (it.year || 0) !== y);
      const res = build3Plus1({ groupItems, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Année",
        themeDesc: `3 animes sortis en ${y}`,
        ...res
      };
    }

    if (theme === "STUDIO") {
      const m = new Map();
      for (const it of pool) {
        const st = (it.studio || "").trim();
        const k = norm(st);
        if (!k) continue;
        if (!m.has(k)) m.set(k, { raw: st, items: [] });
        m.get(k).items.push(it);
      }
      const candidates = [...m.values()].filter(x => x.items.length >= 3);
      if (!candidates.length) continue;

      const chosen = pickOne(candidates);
      const outItems = pool.filter(it => norm(it.studio) !== norm(chosen.raw));
      const res = build3Plus1({ groupItems: chosen.items, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Studio",
        themeDesc: `3 animes du studio : ${chosen.raw}`,
        ...res
      };
    }

    if (theme === "POP25") {
      const qMap = computePopularityQuartiles(pool);
      const groups = new Map();
      for (const it of pool) {
        const q = qMap.get(it._key);
        if (!q) continue;
        if (!groups.has(q)) groups.set(q, []);
        groups.get(q).push(it);
      }
      const candidates = [...groups.entries()].filter(([q, arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [q, groupItems] = pickOne(candidates);

      const outItems = pool.filter(it => qMap.get(it._key) !== q);
      const res = build3Plus1({ groupItems, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Popularité",
        themeDesc: `3 animes dans la tranche : ${quartileLabel(q)}`,
        ...res
      };
    }

    if (theme === "SCOREBIN") {
      const groups = new Map();
      for (const it of pool) {
        const b = scoreToBin(it.score);
        if (!groups.has(b)) groups.set(b, []);
        groups.get(b).push(it);
      }
      const candidates = [...groups.entries()].filter(([b, arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [b, groupItems] = pickOne(candidates);

      const outItems = pool.filter(it => scoreToBin(it.score) !== b);
      const res = build3Plus1({ groupItems, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Score",
        themeDesc: `3 animes avec un score dans : ${scoreBinLabel(b)}`,
        ...res
      };
    }
  }
  return null;
}

function getSongYear(it) {
  const sy = it.songYear || 0;
  if (sy) return sy;
  return it.animeYear || 0;
}

function tryGenerateSongRound(pool) {
  const themeKeys = ["LICENSE","SONG_YEAR","STUDIO","ARTIST","SONG_TYPE"];
  for (let attempt = 0; attempt < 100; attempt++) {
    const theme = pickOne(themeKeys);

    if (theme === "LICENSE") {
      const m = new Map();
      for (const it of pool) {
        const id = it.licenseId;
        if (id == null || id === "") continue;
        if (!m.has(id)) m.set(id, { title: it.licenseTitle || it.animeTitle || "Licence", items: [] });
        m.get(id).items.push(it);
      }
      const candidates = [...m.entries()].filter(([,v]) => v.items.length >= 3);
      if (!candidates.length) continue;
      const [, chosen] = pickOne(candidates);

      const outItems = pool.filter(it => it.licenseId !== chosen.items[0].licenseId);
      const res = build3Plus1({ groupItems: chosen.items, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Licence",
        themeDesc: `3 songs de la licence : ${chosen.title}`,
        ...res
      };
    }

    if (theme === "SONG_YEAR") {
      const m = new Map();
      for (const it of pool) {
        const y = getSongYear(it);
        if (!y) continue;
        if (!m.has(y)) m.set(y, []);
        m.get(y).push(it);
      }
      const candidates = [...m.entries()].filter(([y, arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [y, groupItems] = pickOne(candidates);

      const outItems = pool.filter(it => getSongYear(it) !== y);
      const res = build3Plus1({ groupItems, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Année",
        themeDesc: `3 songs sorties en ${y} (songYear prio)`,
        ...res
      };
    }

    if (theme === "STUDIO") {
      const m = new Map();
      for (const it of pool) {
        const st = (it.animeStudio || "").trim();
        const k = norm(st);
        if (!k) continue;
        if (!m.has(k)) m.set(k, { raw: st, items: [] });
        m.get(k).items.push(it);
      }
      const candidates = [...m.values()].filter(v => v.items.length >= 3);
      if (!candidates.length) continue;
      const chosen = pickOne(candidates);

      const outItems = pool.filter(it => norm(it.animeStudio) !== norm(chosen.raw));
      const res = build3Plus1({ groupItems: chosen.items, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Studio",
        themeDesc: `3 songs issues d’animes du studio : ${chosen.raw}`,
        ...res
      };
    }

    if (theme === "ARTIST") {
      const m = new Map();
      for (const it of pool) {
        const arts = Array.isArray(it.artistsArr) ? it.artistsArr.filter(Boolean) : [];
        for (const a of arts) {
          const k = norm(a);
          if (!k) continue;
          if (!m.has(k)) m.set(k, { raw: a, items: [] });
          m.get(k).items.push(it);
        }
      }
      const candidates = [...m.values()].filter(v => v.items.length >= 3);
      if (!candidates.length) continue;
      const chosen = pickOne(candidates);

      const outItems = pool.filter(it => !(Array.isArray(it.artistsArr) && it.artistsArr.some(x => norm(x) === norm(chosen.raw))));
      const res = build3Plus1({ groupItems: chosen.items, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Artiste",
        themeDesc: `3 songs avec l’artiste : ${chosen.raw}`,
        ...res
      };
    }

    if (theme === "SONG_TYPE") {
      const m = new Map();
      for (const it of pool) {
        const t = it.songType;
        if (!t) continue;
        if (!m.has(t)) m.set(t, []);
        m.get(t).push(it);
      }
      const candidates = [...m.entries()].filter(([t, arr]) => arr.length >= 3);
      if (!candidates.length) continue;
      const [t, groupItems] = pickOne(candidates);

      const outItems = pool.filter(it => it.songType !== t);
      const res = build3Plus1({ groupItems, outItems });
      if (!res) continue;

      return {
        themeTitle: "Thème : Type",
        themeDesc: `3 songs de type : ${songTypeLabel(t)}`,
        ...res
      };
    }
  }
  return null;
}

// ====== ROUND UI ======
function resetRoundUI() {
  selectionEnabled = false;
  lockedAfterPick = false;

  clearWallTimer();
  stopMedia();

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  nextBtn.onclick = null;

  themeNameEl.style.display = "none";
  themeDescEl.style.display = "none";

  revealStatusEl.style.display = "none";
  pickStatusEl.style.display = "none";

  playerZone.style.display = (currentMode === "songs") ? "block" : "none";
  volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  if (currentMode === "songs") applyVolume();

  renderCardsSkeleton();
}

function renderCardsSkeleton() {
  choiceList.innerHTML = "";
  const letters = ["A","B","C","D"];

  for (let i = 0; i < ROUND_ITEMS; i++) {
    const li = document.createElement("li");
    li.className = "intrus-card";
    li.dataset.index = String(i);

    const cover = document.createElement("div");
    cover.className = "intrus-cover";
    li.appendChild(cover);

    const title = document.createElement("span");
    title.className = "intrus-title";
    title.textContent = (currentMode === "songs") ? `Song ${letters[i]}` : "—";
    li.appendChild(title);

    const btn = document.createElement("button");
    btn.className = "intrus-choice-btn";
    btn.textContent = "INTRUS";
    btn.disabled = true;
    btn.dataset.key = "";
    btn.addEventListener("click", () => onPickIntrus(btn.dataset.key));
    li.appendChild(btn);

    choiceList.appendChild(li);
  }
}

function renderRoundItems(items) {
  const letters = ["A","B","C","D"];

  for (let i = 0; i < ROUND_ITEMS; i++) {
    const it = items[i];
    const li = choiceList.querySelector(`li[data-index="${i}"]`);
    if (!li || !it) continue;

    const cover = li.querySelector(".intrus-cover");
    const title = li.querySelector(".intrus-title");
    const btn = li.querySelector(".intrus-choice-btn");

    btn.dataset.key = it._key;

    cover.innerHTML = "";
    li.classList.remove("intrus-picked","intrus-correct","intrus-wrong");

    if (currentMode === "songs") {
      cover.classList.remove("intrus-cover");
      cover.classList.add("intrus-song-box");
      cover.textContent = `Song ${letters[i]}`;
      title.textContent = `Song ${letters[i]}`;
    } else {
      // anime
      cover.classList.remove("intrus-song-box");
      cover.classList.add("intrus-cover");

      const img = document.createElement("img");
      img.src = it.image || "";
      img.alt = it.title || "Anime";
      img.loading = "lazy";
      img.decoding = "async";
      cover.appendChild(img);

      title.textContent = it.title || "Anime";
    }
  }
}

function showThemeAndEnablePick() {
  themeNameEl.textContent = `🎯 ${roundThemeTitle}`;
  themeDescEl.textContent = roundThemeDesc;

  themeNameEl.style.display = "block";
  themeDescEl.style.display = "block";

  selectionEnabled = true;

  pickStatusEl.style.display = "block";
  pickStatusEl.classList.remove("bad");
  pickStatusEl.classList.add("good");
  pickStatusEl.textContent = "✅ Choisis l’intrus (bouton sous la carte).";

  // active boutons
  choiceList.querySelectorAll(".intrus-choice-btn").forEach(b => {
    b.disabled = false;
  });
}

function lockPick() {
  selectionEnabled = false;
  lockedAfterPick = true;
  choiceList.querySelectorAll(".intrus-choice-btn").forEach(b => b.disabled = true);
}

function revealSongsLabelsAfterPick() {
  // après le choix, on révèle le vrai nom (optionnel mais pratique)
  for (let i = 0; i < ROUND_ITEMS; i++) {
    const it = roundItems[i];
    const li = choiceList.querySelector(`li[data-index="${i}"]`);
    if (!li || !it || it.kind !== "song") continue;

    const title = li.querySelector(".intrus-title");
    title.textContent = formatSongTitle(it);
  }
}

function onPickIntrus(key) {
  if (!selectionEnabled || lockedAfterPick) return;
  if (!key) return;

  lockPick();

  // mark picked
  const pickedLi = [...choiceList.querySelectorAll("li")].find(li => li.querySelector(".intrus-choice-btn")?.dataset.key === key);
  if (pickedLi) pickedLi.classList.add("intrus-picked");

  const ok = key === intrusKey;

  if (pickedLi) pickedLi.classList.add(ok ? "intrus-correct" : "intrus-wrong");

  // mark correct intrus
  const correctLi = [...choiceList.querySelectorAll("li")].find(li => li.querySelector(".intrus-choice-btn")?.dataset.key === intrusKey);
  if (correctLi) correctLi.classList.add("intrus-correct");

  if (currentMode === "songs") revealSongsLabelsAfterPick();

  if (ok) {
    scoreGood++;
    resultDiv.textContent = `✅ Bien joué ! (${scoreGood} / ${currentRound})`;
  } else {
    resultDiv.textContent = `❌ Raté… (${scoreGood} / ${currentRound})`;
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
        try {
          parent.postMessage({ parcoursScore: { label: "Intrus", score: scoreGood, total: totalRounds } }, "*");
        } catch {}
      }
    }
  };
}

// ====== SONG SNIPPET (lecture cachée) ======
function playSongSnippet(item, localRound, index) {
  return new Promise((resolve) => {
    if (currentMode !== "songs" || !item?.url) { resolve(); return; }

    clearWallTimer();
    stopMedia();

    const letter = ["A","B","C","D"][index] || "?";
    revealStatusEl.style.display = "block";
    revealStatusEl.classList.add("bad");
    revealStatusEl.classList.remove("good");
    revealStatusEl.textContent = `🎧 Écoute en cours… (Song ${letter})`;

    nowPlaying.textContent = `🎵 Écoute : Song ${letter}`;

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
        songPlayer.play?.().catch(() => {
          // si autoplay bloqué, on ne reste pas bloqué
          stopSnippet();
        });
      }
    });
  });
}

async function playSongsSequence(items, localRound) {
  for (let i = 0; i < items.length; i++) {
    if (localRound !== roundToken) return;
    await playSongSnippet(items[i], localRound, i).catch(() => {});
  }
}

// ====== ROUND FLOW ======
function startRound() {
  roundToken++;
  resetRoundUI();

  const minNeeded = Math.max(ROUND_ITEMS, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "inline-block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  // Génération round
  const gen = (currentMode === "songs")
    ? tryGenerateSongRound(filteredPool)
    : tryGenerateAnimeRound(filteredPool);

  if (!gen) {
    resultDiv.textContent = "❌ Impossible de générer un round (pool trop contraint).";
    nextBtn.style.display = "inline-block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  roundItems = gen.items;
  intrusKey = gen.intrusKey;
  roundThemeTitle = gen.themeTitle;
  roundThemeDesc = gen.themeDesc;

  roundLabel.textContent = `Round ${currentRound} / ${totalRounds} — Score ${scoreGood}/${currentRound-1}`;

  renderRoundItems(roundItems);

  // Anime: on peut afficher le thème directement
  if (currentMode === "anime") {
    revealStatusEl.style.display = "none";
    showThemeAndEnablePick();
    return;
  }

  // Songs: écouter d'abord, puis afficher thème + activer choix
  (async () => {
    const localRound = roundToken;

    revealStatusEl.style.display = "block";
    revealStatusEl.classList.add("bad");
    revealStatusEl.classList.remove("good");
    revealStatusEl.textContent = "🎧 Écoute des 4 extraits…";

    await playSongsSequence(roundItems, localRound);

    if (localRound !== roundToken) return;

    revealStatusEl.classList.remove("bad");
    revealStatusEl.classList.add("good");
    revealStatusEl.textContent = "✅ Écoutes terminées — thème affiché !";

    showThemeAndEnablePick();
  })();
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
      const minNeeded = Math.max(ROUND_ITEMS, MIN_REQUIRED);
      if (filteredPool.length >= minNeeded) {
        totalRounds = clampInt(parcoursCount, 1, 100);
        currentRound = 1;
        scoreGood = 0;
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
