/**********************
 * Left or Right (Anime / Songs)
 * - UI/DA identique BlindRanking
 * - Pas d'historique / pas de recap
 * - Anime : duel préférence -> le choisi devient champion (à gauche) + nouvel adversaire
 * - Songs : duel préférence -> 2 vidéos visibles direct (gauche/droite)
 *          autoplay best-effort non-mute de la gauche
 *          volume global
 *          anti-bug media + retries: 1 essai + 5 retries (2/4/6/8/10s)
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

// retries: 1 essai + 5 retries => 0, 2s, 4s, 6s, 8s, 10s
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

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
      const artistsArr = Array.isArray(it.artists) ? it.artists : [];
      const artists = artistsArr.join(", ");
      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",
        url,
        // anime meta
        animeTitle: anime._title,
        image: anime.image || "",
        year: anime._year,
        members: anime._members,
        score: anime._score,
        type: anime._type,
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
const roundCountEl = document.getElementById("roundCount");

const roundLabel = document.getElementById("roundLabel");

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
let filteredPool = [];

// ====== GAME STATE ======
let totalDuels = 10;
let duelIndex = 1;
let champion = null;   // gauche
let challenger = null; // droite

// anti stale media
let duelToken = 0;
let mediaToken = 0;

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
  [leftVid, rightVid].forEach(p => {
    if (!p) return;
    p.muted = false;
    p.volume = vol;
  });
  volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== MEDIA LOADER (retries + anti-stall) ======
function hardResetMedia(player) {
  try { player.pause(); } catch {}
  player.removeAttribute("src");
  player.load();
}
function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadMediaWithRetries(player, url, localDuel, localMedia, { autoplay = true } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    player.onloadedmetadata = null;
    player.oncanplay = null;
    player.onplaying = null;
    player.onwaiting = null;
    player.onstalled = null;
    player.onerror = null;
  };

  const isStillValid = () => (localDuel === duelToken && localMedia === mediaToken);

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
    if (autoplay) {
      player.muted = false;
      player.play?.().catch(() => {});
    }
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

// ====== INIT CUSTOM UI ======
function initCustomUI() {
  // Mode pills
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

  // Song pills (songs)
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
    const minNeeded = Math.max(2, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    totalDuels = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);
    startGame();
  });

  // Duel clicks
  leftPick.addEventListener("click", () => handlePick("left"));
  rightPick.addEventListener("click", () => handlePick("right"));

  updateModeVisibility();
  syncLabels();
}

function updateModeVisibility() {
  songsRow.style.display = (currentMode === "songs") ? "flex" : "none";
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
      year: a._year,
      members: a._members,
      score: a._score,
      type: a._type
    }));
  }

  // songs mode
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map(b => b.dataset.song);
  if (allowedSongs.length === 0) return [];

  let pool = allSongs.filter(s =>
    s.year >= yearMin && s.year <= yearMax &&
    allowedTypes.includes(s.type) &&
    allowedSongs.includes(s.songType)
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
  const minNeeded = Math.max(2, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;
  const label = (currentMode === "songs") ? "Songs" : "Animes";

  previewCountEl.textContent = ok
    ? `🎮 ${label} disponibles : ${pool.length} (OK)`
    : `🎮 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== PICK HELPERS ======
function pickRandom(pool, avoidKey = null) {
  if (!pool || pool.length === 0) return null;
  const shuffled = shuffleInPlace([...pool]);
  for (const it of shuffled) {
    if (avoidKey && it._key === avoidKey) continue;
    return it;
  }
  return shuffled[0];
}

// ====== GAME ======
function resetGameUI() {
  duelToken++;
  mediaToken++;

  // stop media
  [leftVid, rightVid].forEach(v => {
    try { v.pause(); } catch {}
    v.removeAttribute("src");
    v.load();
  });

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  leftPick.disabled = false;
  rightPick.disabled = false;
}

function setupModeUI() {
  const isSongs = currentMode === "songs";
  volumeRow.style.display = isSongs ? "flex" : "none";
  if (isSongs) applyVolume();
}

function updateTopLabels() {
  roundLabel.textContent = `${modeLabel()} — Duel ${duelIndex} / ${totalDuels}`;
}

function updatePrompt() {
  promptLine.textContent = currentMode === "songs"
    ? "Choisis ton Song préféré (autoplay gauche)"
    : "Choisis ton Anime préféré";
}

function showMediaForMode() {
  const isSongs = currentMode === "songs";
  // images
  leftImg.style.display = isSongs ? "none" : "block";
  rightImg.style.display = isSongs ? "none" : "block";
  // videos
  leftVid.style.display = isSongs ? "block" : "none";
  rightVid.style.display = isSongs ? "block" : "none";
}

function renderDuel() {
  updateTopLabels();
  updatePrompt();
  showMediaForMode();

  leftTitle.textContent = (currentMode === "songs") ? formatSongTitle(champion) : (champion?.title || "");
  rightTitle.textContent = (currentMode === "songs") ? formatSongTitle(challenger) : (challenger?.title || "");

  if (currentMode === "anime") {
    leftImg.src = champion?.image || "";
    rightImg.src = challenger?.image || "";
    resultDiv.textContent = "";
    nextBtn.style.display = "none";
    return;
  }

  // songs: 2 vidéos direct
  const localDuel = ++duelToken;
  const localMedia = ++mediaToken;

  // poster via image anime (quand possible)
  leftVid.poster = champion?.image || "";
  rightVid.poster = challenger?.image || "";

  // reset
  [leftVid, rightVid].forEach(v => {
    try { v.pause(); } catch {}
    v.removeAttribute("src");
    v.load();
    v.muted = false;
  });

  applyVolume();

  // load with retries
  if (champion?.url) loadMediaWithRetries(leftVid, champion.url, localDuel, localMedia, { autoplay: true });
  if (challenger?.url) loadMediaWithRetries(rightVid, challenger.url, localDuel, localMedia, { autoplay: false });
}

function startGame() {
  resetGameUI();
  showGame();
  setupModeUI();

  filteredPool = applyFilters();
  const minNeeded = Math.max(2, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  duelIndex = 1;

  champion = pickRandom(filteredPool);
  challenger = pickRandom(filteredPool, champion?._key || null);

  if (!champion || !challenger) {
    resultDiv.textContent = "❌ Impossible de créer un duel.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  renderDuel();
}

// ====== PICK ======
function handlePick(side) {
  if (!champion || !challenger) return;

  leftPick.disabled = true;
  rightPick.disabled = true;

  // stop songs sound on pick (plus propre)
  if (currentMode === "songs") {
    try { leftVid.pause(); } catch {}
    try { rightVid.pause(); } catch {}
  }

  const chosen = (side === "left") ? champion : challenger;
  champion = chosen;

  resultDiv.textContent = "✅ Choix validé !";

  if (duelIndex >= totalDuels) {
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Suivant";
  nextBtn.onclick = () => {
    duelIndex++;
    challenger = pickRandom(filteredPool, champion?._key || null);
    if (!challenger) {
      resultDiv.textContent = "❌ Impossible de piocher un adversaire.";
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => { showCustomization(); updatePreview(); };
      return;
    }
    renderDuel();
    leftPick.disabled = false;
    rightPick.disabled = false;
    resultDiv.textContent = "";
    nextBtn.style.display = "none";
  };
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
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();
    applyVolume();
  })
  .catch(e => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    console.error(e);
  });
