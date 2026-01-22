/**********************
 * Left or Right (Anime / Opening / Stat)
 * - Pas de récap / historique (aucune liste)
 * - UI centrée + choix plus grands
 * - Opening : 2 vidéos direct (gauche/droite)
 *   - autoplay non-mute sur la gauche
 *   - anti-bug media + retries 2/4/6/8/10s
 * - Stat :
 *   - thème aléatoire (Popularité/Score/Saison), jamais le même 2 fois d’affilée
 *   - pas de stats trop proches
 *   - +300 par bon choix, 1 erreur = fin
 *   - si un anime gagne 3 duels d’affilée -> on retire le gagnant et on garde le perdant comme champion
 *   - pas de rappel des valeurs (ni gauche/droite)
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

function songTypeLabel(t) { return t === "OP" ? "OP" : (t === "ED" ? "ED" : "IN"); }
function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = s.songNumber ? `${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const art = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${s.animeTitle || "Anime"} ${type}${num}${name}${art}`;
}
function formatItemLabel(it) {
  if (!it) return "";
  if (it.kind === "opening") return formatSongTitle(it);
  return it.title || "";
}

function extractOpeningsFromAnime(anime) {
  const out = [];
  const song = anime.song || {};
  const arr = Array.isArray(song.openings) ? song.openings : [];
  for (const it of arr) {
    const url = it.video || it.url || "";
    if (!url || typeof url !== "string" || url.length < 6) continue;
    const artistsArr = Array.isArray(it.artists) ? it.artists : [];
    const artists = artistsArr.join(", ");
    out.push({
      kind: "opening",
      songType: "OP",
      songName: it.name || "",
      songNumber: safeNum(it.number) || 1,
      songArtists: artists || "",
      animeTitle: anime._title,
      image: anime.image || "",
      year: anime._year,
      members: anime._members,
      score: anime._score,
      type: anime._type,
      url,
      _key: `OP|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
    });
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

const previewCountEl = document.getElementById("previewCount");
const applyBtn = document.getElementById("applyFiltersBtn");
const roundCountEl = document.getElementById("roundCount");

const roundLabel = document.getElementById("roundLabel");
const scoreBox = document.getElementById("scoreBox");

const promptLine = document.getElementById("promptLine");
const leftPick = document.getElementById("leftPick");
const rightPick = document.getElementById("rightPick");

const leftImg = document.getElementById("leftImg");
const rightImg = document.getElementById("rightImg");
const leftVideo = document.getElementById("leftVideo");
const rightVideo = document.getElementById("rightVideo");

const leftTitle = document.getElementById("leftTitle");
const rightTitle = document.getElementById("rightTitle");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

// Volume (Opening)
const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// évite qu’un clic sur les contrôles vidéo déclenche un choix
["click","pointerdown","mousedown","touchstart"].forEach(evt => {
  leftVideo.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
  rightVideo.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
});

// ====== DATA ======
let allAnimes = [];
let allOpenings = [];

// ====== SETTINGS ======
let currentMode = "anime"; // anime | opening | stat
let filteredPool = [];

// ====== GAME STATE ======
let totalDuels = 10;
let duelIndex = 1;

let score = 0; // stat only
let champion = null;   // gauche
let challenger = null; // droite

let lastThemeKey = null;     // stat only
let currentThemeKey = null;  // stat only
let championStreak = 0;      // stat only
let bannedKeyOnce = null;    // stat only

// tokens anti-bug media
let duelToken = 0;
let mediaToken = 0;

// ====== STAT THEMES ======
const STAT_THEMES = [
  { key: "members", label: "Popularité" },
  { key: "score",   label: "Score" },
  { key: "year",    label: "Saison" },
];

function themeByKey(k) {
  return STAT_THEMES.find(t => t.key === k) || STAT_THEMES[0];
}
function pickNewTheme(exceptKey) {
  const choices = STAT_THEMES.map(t => t.key).filter(k => k !== exceptKey);
  return choices[Math.floor(Math.random() * choices.length)];
}
function getStatValue(it, key) {
  if (!it) return 0;
  if (key === "members") return safeNum(it.members);
  if (key === "score") return safeNum(it.score);
  if (key === "year") return safeNum(it.year);
  return 0;
}
function minDiffForTheme(key, a, b) {
  const va = getStatValue(a, key);
  const vb = getStatValue(b, key);
  const mx = Math.max(va, vb);

  if (key === "members") return Math.max(50000, Math.round(mx * 0.07));
  if (key === "score") return 0.15;
  if (key === "year") return 2;
  return 0;
}
function winnerSideByTheme(leftIt, rightIt, key) {
  const L = getStatValue(leftIt, key);
  const R = getStatValue(rightIt, key);
  if (L === R) return "tie";
  return L > R ? "left" : "right";
}

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
  volumeVal.textContent = `${v}%`;
  const vol = v / 100;

  leftVideo.muted = false;
  rightVideo.muted = false;
  leftVideo.volume = vol;
  rightVideo.volume = vol;
}
volumeSlider.addEventListener("input", applyVolume);

// ====== MEDIA LOADER (retries + anti-stall) ======
function hardResetMedia(videoEl) {
  try { videoEl.pause(); } catch {}
  videoEl.removeAttribute("src");
  videoEl.load();
}
function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}
function loadMediaWithRetries(videoEl, url, localDuel, localMedia, { autoplay = true } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    videoEl.onloadedmetadata = null;
    videoEl.oncanplay = null;
    videoEl.onplaying = null;
    videoEl.onwaiting = null;
    videoEl.onstalled = null;
    videoEl.onerror = null;
  };

  const isStillValid = () => localDuel === duelToken && localMedia === mediaToken;

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
      videoEl.muted = false;
      videoEl.play?.().catch(() => {});
    }
  };

  const triggerRetry = () => {
    if (!isStillValid() || done) return;
    cleanup();
    attemptIndex++;
    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      try { videoEl.pause(); } catch {}
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
    try { hardResetMedia(videoEl); } catch {}

    videoEl.preload = "metadata";
    videoEl.muted = false;
    videoEl.src = src;
    videoEl.load();

    videoEl.onloadedmetadata = () => { if (!isStillValid() || done) return; markReady(); };
    videoEl.oncanplay = () => { if (!isStillValid() || done) return; markReady(); };
    videoEl.onwaiting = () => { if (!isStillValid() || done) return; startStallTimer(); };
    videoEl.onstalled = () => { if (!isStillValid() || done) return; startStallTimer(); };
    videoEl.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    };
    videoEl.onerror = () => { if (!isStillValid() || done) return; triggerRetry(); };

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
      currentMode = btn.dataset.mode; // anime | opening | stat
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

  // Click + clavier
  const bindPick = (el, side) => {
    el.addEventListener("click", () => handlePick(side));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePick(side);
      }
    });
  };
  bindPick(leftPick, "left");
  bindPick(rightPick, "right");

  syncLabels();
}

function modeLabel() {
  if (currentMode === "anime") return "Anime";
  if (currentMode === "opening") return "Opening";
  return "Stat";
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);
  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map(b => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  if (currentMode === "opening") {
    let pool = allOpenings.filter(o =>
      o.year >= yearMin && o.year <= yearMax && allowedTypes.includes(o.type)
    );
    pool.sort((a, b) => b.members - a.members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));
    pool.sort((a, b) => b.score - a.score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));
    return pool;
  }

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

  const label = (currentMode === "opening") ? "Openings" : "Titres";
  previewCountEl.textContent = ok
    ? `🎵 ${label} disponibles : ${pool.length} (OK)`
    : `🎵 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== PICK HELPERS ======
function pickRandom(pool, avoidKey = null, avoidKey2 = null) {
  if (!pool || pool.length === 0) return null;
  const shuffled = shuffleInPlace([...pool]);
  for (const it of shuffled) {
    const k = it._key;
    if (avoidKey && k === avoidKey) continue;
    if (avoidKey2 && k === avoidKey2) continue;
    return it;
  }
  return shuffled[0];
}

function pickChallengerWithGap(pool, champ, themeKey, bannedKey) {
  if (!pool || pool.length < 2) return null;
  const champKey = champ?._key || null;

  const tries = 60;
  for (let i = 0; i < tries; i++) {
    const it = pickRandom(pool, champKey, bannedKey);
    if (!it) continue;
    const diff = Math.abs(getStatValue(it, themeKey) - getStatValue(champ, themeKey));
    const required = minDiffForTheme(themeKey, champ, it);
    if (diff >= required) return it;
  }
  return pickRandom(pool, champKey, bannedKey);
}

// ====== GAME ======
function stopAllMedia() {
  try { leftVideo.pause(); } catch {}
  try { rightVideo.pause(); } catch {}
  leftVideo.removeAttribute("src");
  rightVideo.removeAttribute("src");
  leftVideo.load();
  rightVideo.load();
}

function setupModeUI() {
  const isOpening = currentMode === "opening";
  const isStat = currentMode === "stat";

  scoreBox.style.display = isStat ? "block" : "none";
  volumeRow.style.display = isOpening ? "flex" : "none";

  // opening: show videos, hide imgs
  leftVideo.style.display = isOpening ? "block" : "none";
  rightVideo.style.display = isOpening ? "block" : "none";
  leftImg.style.display = isOpening ? "none" : "block";
  rightImg.style.display = isOpening ? "none" : "block";

  if (!isOpening) stopAllMedia();
  if (isOpening) applyVolume();
}

function updateTopLabels() {
  roundLabel.textContent = `${modeLabel()} — Duel ${duelIndex} / ${totalDuels}`;
  if (currentMode === "stat") scoreBox.textContent = `🔥 Score : ${score}`;
}

function updatePrompt() {
  if (currentMode === "stat") {
    if (currentThemeKey === "year") {
      promptLine.textContent = "Trouver l’anime le plus récent";
    } else if (currentThemeKey === "score") {
      promptLine.textContent = "Trouver l’anime le mieux noté";
    } else {
      promptLine.textContent = "Trouver l’anime le plus populaire";
    }
    return;
  }

  if (currentMode === "opening") {
    promptLine.textContent = "Choisis ton Opening préféré";
  } else {
    promptLine.textContent = "Choisis ton Anime préféré";
  }
}

function renderDuel() {
  updateTopLabels();
  updatePrompt();

  leftTitle.textContent = formatItemLabel(champion);
  rightTitle.textContent = formatItemLabel(challenger);

  leftImg.src = champion?.image || "";
  rightImg.src = challenger?.image || "";

  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  if (currentMode === "opening") {
    stopAllMedia();

    leftVideo.poster = champion?.image || "";
    rightVideo.poster = challenger?.image || "";

    duelToken++;
    mediaToken++;
    const localDuel = duelToken;
    const localMedia = mediaToken;

    // gauche autoplay (best-effort)
    if (champion?.url) loadMediaWithRetries(leftVideo, champion.url, localDuel, localMedia, { autoplay: true });
    // droite pas d’autoplay (évite 2 sons)
    if (challenger?.url) loadMediaWithRetries(rightVideo, challenger.url, localDuel, localMedia, { autoplay: false });
  }
}

function startGame() {
  showGame();
  duelIndex = 1;

  score = 0;
  championStreak = 0;
  lastThemeKey = null;
  currentThemeKey = null;
  bannedKeyOnce = null;

  filteredPool = applyFilters();
  const minNeeded = Math.max(2, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  champion = pickRandom(filteredPool);
  if (currentMode === "stat") {
    currentThemeKey = pickNewTheme(lastThemeKey);
    challenger = pickChallengerWithGap(filteredPool, champion, currentThemeKey, bannedKeyOnce);
  } else {
    challenger = pickRandom(filteredPool, champion?._key || null);
  }

  setupModeUI();
  renderDuel();
}

// ====== PICK ======
function handlePick(side) {
  if (!champion || !challenger) return;

  // stop audio quand on clique
  if (currentMode === "opening") {
    try { leftVideo.pause(); } catch {}
    try { rightVideo.pause(); } catch {}
  }

  if (currentMode === "stat") {
    const leftIt = champion;
    const rightIt = challenger;
    const winSide = winnerSideByTheme(leftIt, rightIt, currentThemeKey);

    const correct = (winSide !== "tie") ? (side === winSide) : true;
    const winner = (winSide === "left") ? leftIt : rightIt;
    const loser  = (winSide === "left") ? rightIt : leftIt;

    if (!correct) {
      resultDiv.textContent = "❌ Mauvais !";
      nextBtn.style.display = "block";
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => { showCustomization(); updatePreview(); };
      return;
    }

    score += 300;
    resultDiv.textContent = "✅ Correct !";

    const wasChampionKey = champion?._key || null;
    champion = winner;

    if ((champion?._key || null) === wasChampionKey) championStreak++;
    else championStreak = 1;

    bannedKeyOnce = null;
    if (championStreak >= 3) {
      bannedKeyOnce = champion?._key || null;
      champion = loser;
      championStreak = 0;
      resultDiv.textContent += " — 🔁 Swap anti-boucle (3 wins) !";
    }

    if (duelIndex >= totalDuels) {
      updateTopLabels();
      nextBtn.style.display = "block";
      nextBtn.textContent = "Terminer";
      nextBtn.onclick = () => {
        resultDiv.textContent = `✅ Terminé ! Score final : ${score} / ${totalDuels * 300}`;
        nextBtn.textContent = "Retour réglages";
        nextBtn.onclick = () => { showCustomization(); updatePreview(); };
      };
      return;
    }

    nextBtn.style.display = "block";
    nextBtn.textContent = "Suivant";
    nextBtn.onclick = () => {
      duelIndex++;
      lastThemeKey = currentThemeKey;
      currentThemeKey = pickNewTheme(lastThemeKey);
      challenger = pickChallengerWithGap(filteredPool, champion, currentThemeKey, bannedKeyOnce);
      setupModeUI();
      renderDuel();
    };

    updateTopLabels();
    return;
  }

  // ====== ANIME / OPENING : préférence ======
  const chosen = (side === "left") ? champion : challenger;
  champion = chosen;

  resultDiv.textContent = "✅ Choix validé !";

  if (duelIndex >= totalDuels) {
    resultDiv.textContent = "✅ Terminé !";
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
    setupModeUI();
    renderDuel();
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

    allOpenings = [];
    for (const a of allAnimes) allOpenings.push(...extractOpeningsFromAnime(a));

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
