/**********************
 * Left or Right (Anime / Opening / Stat)
 * - UI identique BlindRanking
 * - Anime & Opening : duel préférence -> le choisi devient champion (à gauche) + nouvel adversaire
 * - Opening : autoplay non-mute de la gauche + anti-bug media + retries (2/4/6/8/10s)
 * - Stat :
 *   - thème aléatoire (Popularité / Score / Saison), jamais le même 2 fois d’affilée
 *   - il faut choisir la valeur la + haute ; 1 erreur = fin ; +300 / bon choix
 *   - le plus haut reste champion ; nouvel adversaire
 *   - si un anime gagne 3 duels d’affilée -> on retire le gagnant et on garde le perdant comme champion (anti-boucle)
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
const historyList = document.getElementById("history-list");

const promptLine = document.getElementById("promptLine");
const leftPick = document.getElementById("leftPick");
const rightPick = document.getElementById("rightPick");
const leftImg = document.getElementById("leftImg");
const rightImg = document.getElementById("rightImg");
const leftTitle = document.getElementById("leftTitle");
const rightTitle = document.getElementById("rightTitle");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

// Opening player area
const listenRow = document.getElementById("listenRow");
const listenLeftBtn = document.getElementById("listenLeftBtn");
const listenRightBtn = document.getElementById("listenRightBtn");
const playerZone = document.getElementById("player-zone");
const songPlayer = document.getElementById("songPlayer");
const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

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
let champion = null;   // toujours affiché à gauche
let challenger = null; // à droite

let lastThemeKey = null; // stat only
let currentThemeKey = null; // stat only

let championStreak = 0; // stat only (victoires consécutives du champion réel)
let bannedKeyOnce = null; // stat only (anti boucle après swap 3 wins)

// anti-repeat soft
let usedKeys = new Set();

// tokens anti-bug media
let duelToken = 0;
let mediaToken = 0;

// ====== STAT THEMES ======
const STAT_THEMES = [
  { key: "members", label: "Popularité", fmt: (v) => Number(v).toLocaleString("fr-FR") },
  { key: "score",   label: "Score",      fmt: (v) => (Math.round(Number(v) * 100) / 100).toFixed(2) },
  { key: "year",    label: "Saison",     fmt: (v) => String(v || "?") },
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

// évite des stats trop proches
function minDiffForTheme(key, a, b) {
  const va = getStatValue(a, key);
  const vb = getStatValue(b, key);
  const mx = Math.max(va, vb);

  if (key === "members") {
    // au moins 50k ou ~7% de la plus grande valeur (pour éviter des duels “quasi identiques”)
    return Math.max(50000, Math.round(mx * 0.07));
  }
  if (key === "score") return 0.15; // 0.15 de diff mini
  if (key === "year") return 2;     // 2 ans mini
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
function loadMediaWithRetries(url, localDuel, localMedia, { autoplay = true } = {}) {
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
      songPlayer.muted = false;
      songPlayer.play?.().catch(() => {});
    }
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

  // Listen buttons (opening)
  listenLeftBtn.addEventListener("click", () => setListenSide("left"));
  listenRightBtn.addEventListener("click", () => setListenSide("right"));

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
    // openings pool
    let pool = allOpenings.filter(o =>
      o.year >= yearMin && o.year <= yearMax && allowedTypes.includes(o.type)
    );

    pool.sort((a, b) => b.members - a.members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    pool.sort((a, b) => b.score - a.score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    return pool;
  }

  // anime/stat pool
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
    const k = it._key || it._key === "" ? it._key : it._key;
    if (avoidKey && k === avoidKey) continue;
    if (avoidKey2 && k === avoidKey2) continue;
    return it;
  }
  return shuffled[0];
}

function pickChallengerWithGap(pool, champ, themeKey, bannedKey) {
  if (!pool || pool.length < 2) return null;
  const champKey = champ?._key || null;
  const need = minDiffForTheme(themeKey, champ, champ);

  // on tente fort, puis on relâche
  const tries = 60;
  for (let i = 0; i < tries; i++) {
    const it = pickRandom(pool, champKey, bannedKey);
    if (!it) continue;
    const diff = Math.abs(getStatValue(it, themeKey) - getStatValue(champ, themeKey));
    const required = minDiffForTheme(themeKey, champ, it);
    if (diff >= required) return it;
  }

  // fallback : accepte presque tout, mais différent
  return pickRandom(pool, champKey, bannedKey);
}

// ====== GAME ======
function resetGameUI() {
  duelToken++;
  mediaToken++;
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();

  historyList.innerHTML = "";
  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  leftPick.disabled = false;
  rightPick.disabled = false;
}

function setupModeUI() {
  const isOpening = currentMode === "opening";
  const isStat = currentMode === "stat";

  listenRow.style.display = isOpening ? "block" : "none";
  playerZone.style.display = isOpening ? "block" : "none";
  volumeRow.style.display = isOpening ? "flex" : "none";
  scoreBox.style.display = isStat ? "block" : "none";

  if (isOpening) {
    applyVolume();
  } else {
    try { songPlayer.pause(); } catch {}
    songPlayer.removeAttribute("src");
    songPlayer.load();
  }
}

function updateTopLabels() {
  roundLabel.textContent = `${modeLabel()} — Duel ${duelIndex} / ${totalDuels}`;
  if (currentMode === "stat") scoreBox.textContent = `🔥 Score : ${score}`;
}

function updatePrompt() {
  if (currentMode === "stat") {
    const t = themeByKey(currentThemeKey);
    promptLine.textContent = `Thème : ${t.label} — trouve la valeur la plus haute`;
  } else if (currentMode === "opening") {
    promptLine.textContent = `Choisis ton Opening préféré (autoplay gauche)`;
  } else {
    promptLine.textContent = `Choisis ton Anime préféré`;
  }
}

function renderDuel() {
  updateTopLabels();
  updatePrompt();

  leftImg.src = champion?.image || "";
  rightImg.src = challenger?.image || "";
  leftTitle.textContent = formatItemLabel(champion);
  rightTitle.textContent = formatItemLabel(challenger);

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  leftPick.disabled = false;
  rightPick.disabled = false;

  // Opening : autoplay non-mute gauche
  if (currentMode === "opening") {
    setListenSide("left", true);
  } else {
    // sécurité: stop media
    try { songPlayer.pause(); } catch {}
    songPlayer.removeAttribute("src");
    songPlayer.load();
  }
}

function startGame() {
  resetGameUI();
  showGame();
  setupModeUI();

  usedKeys = new Set();
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

  // init champ/challenger
  champion = pickRandom(filteredPool);
  if (currentMode === "stat") {
    currentThemeKey = pickNewTheme(lastThemeKey);
    challenger = pickChallengerWithGap(filteredPool, champion, currentThemeKey, bannedKeyOnce);
  } else {
    challenger = pickRandom(filteredPool, champion?._key || null);
  }

  renderDuel();
}

// ====== OPENING LISTEN LEFT/RIGHT ======
let listeningSide = "left";

function setListenSide(side, force = false) {
  if (currentMode !== "opening") return;
  if (listeningSide === side && !force) return;
  listeningSide = side;

  listenLeftBtn.classList.toggle("active", side === "left");
  listenRightBtn.classList.toggle("active", side === "right");
  listenLeftBtn.setAttribute("aria-pressed", side === "left" ? "true" : "false");
  listenRightBtn.setAttribute("aria-pressed", side === "right" ? "true" : "false");

  const it = (side === "left") ? champion : challenger;
  if (!it || !it.url) return;

  duelToken++;
  mediaToken++;
  const localDuel = duelToken;
  const localMedia = mediaToken;

  songPlayer.poster = it.image || "";
  songPlayer.muted = false;
  applyVolume();

  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();

  loadMediaWithRetries(it.url, localDuel, localMedia, { autoplay: true });
}

// ====== HISTORY ======
function addHistoryEntry({ ok, label, img }) {
  const li = document.createElement("li");

  const im = document.createElement("img");
  im.src = img || "";
  im.alt = "Historique";
  im.loading = "lazy";
  im.decoding = "async";
  li.appendChild(im);

  const sp = document.createElement("span");
  sp.textContent = label;
  li.appendChild(sp);

  historyList.appendChild(li);
}

function revealStatLine(key, L, R) {
  const t = themeByKey(key);
  const lv = getStatValue(L, key);
  const rv = getStatValue(R, key);
  return `${t.label} — Gauche: ${t.fmt(lv)} | Droite: ${t.fmt(rv)}`;
}

// ====== PICK ======
function handlePick(side) {
  if (!champion || !challenger) return;

  leftPick.disabled = true;
  rightPick.disabled = true;

  // stop opening after click (moins bruyant)
  if (currentMode === "opening") {
    try { songPlayer.pause(); } catch {}
  }

  if (currentMode === "stat") {
    const leftIt = champion;
    const rightIt = challenger;
    const winSide = winnerSideByTheme(leftIt, rightIt, currentThemeKey);

    const correct = (winSide !== "tie") ? (side === winSide) : true;
    const winner = (winSide === "left") ? leftIt : rightIt;
    const loser  = (winSide === "left") ? rightIt : leftIt;

    const statLine = revealStatLine(currentThemeKey, leftIt, rightIt);

    if (!correct) {
      // fin immédiate
      resultDiv.textContent = `❌ Mauvais ! ${statLine}`;
      addHistoryEntry({
        ok: false,
        img: winner?.image || "",
        label: `Duel ${duelIndex}: ❌ (${themeByKey(currentThemeKey).label})`
      });

      nextBtn.style.display = "block";
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => { showCustomization(); updatePreview(); };
      return;
    }

    // bon
    score += 300;
    resultDiv.textContent = `✅ Correct ! ${statLine}`;

    addHistoryEntry({
      ok: true,
      img: winner?.image || "",
      label: `Duel ${duelIndex}: ✅ (${themeByKey(currentThemeKey).label})`
    });

    // le plus haut reste (winner)
    const wasChampionKey = champion?._key || null;
    champion = winner;
    challenger = null;

    // streak : si le champion actuel a gagné encore
    if ((champion?._key || null) === wasChampionKey) championStreak++;
    else championStreak = 1;

    // règle 3 wins -> on retire le gagnant et on garde le perdant
    bannedKeyOnce = null;
    if (championStreak >= 3) {
      bannedKeyOnce = champion?._key || null; // on évite de le re-piocher tout de suite
      champion = loser;
      championStreak = 0;
      resultDiv.textContent += " — 🔁 Swap anti-boucle (3 wins) !";
    }

    // fin si on a fait tous les duels
    if (duelIndex >= totalDuels) {
      updateTopLabels();
      nextBtn.style.display = "block";
      nextBtn.textContent = "Terminer";
      nextBtn.onclick = () => {
        resultDiv.textContent = `✅ Terminé ! Score final : ${score} / ${totalDuels * 300}`;
        nextBtn.textContent = "Retour réglages";
        nextBtn.onclick = () => { showCustomization(); updatePreview(); };
      };
      updateTopLabels();
      return;
    }

    // prochain duel : nouveau thème (différent) + nouvel adversaire
    nextBtn.style.display = "block";
    nextBtn.textContent = "Suivant";
    nextBtn.onclick = () => {
      duelIndex++;
      lastThemeKey = currentThemeKey;
      currentThemeKey = pickNewTheme(lastThemeKey);
      challenger = pickChallengerWithGap(filteredPool, champion, currentThemeKey, bannedKeyOnce);
      renderDuel();
    };

    updateTopLabels();
    return;
  }

  // ====== ANIME / OPENING (préférence) ======
  const chosen = (side === "left") ? champion : challenger;
  const chosenLabel = formatItemLabel(chosen);

  addHistoryEntry({
    ok: true,
    img: chosen?.image || "",
    label: `Duel ${duelIndex}: ✅ ${chosenLabel}`
  });

  // le choisi devient champion (à gauche)
  champion = chosen;

  // fin si tous duels joués
  if (duelIndex >= totalDuels) {
    resultDiv.textContent = `✅ Terminé ! Champion final : ${formatItemLabel(champion)}`;
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Suivant";
  nextBtn.onclick = () => {
    duelIndex++;

    // nouvel adversaire
    challenger = pickRandom(filteredPool, champion?._key || null);

    renderDuel();
  };

  resultDiv.textContent = "✅ Choix validé !";
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
