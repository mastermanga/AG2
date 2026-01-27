/**********************
 * Guess The Opening — version “anti-bug média” + Parcours support
 * - Préchargement + retries + anti-stall
 * - Timer basé sur currentTime (pas setTimeout)
 * - Player VIDEO visible uniquement au reveal (fin round)
 * - MODE PARCOURS:
 *    - lit AG_parcours_filters (personnalisation globale)
 *    - lit ?count= pour le nombre de rounds
 *    - en fin de série => bouton "Continuer le parcours" => postMessage score
 **********************/

const MAX_SCORE = 3000;

// scoring
const SCORE_TRY1 = 3000;
const SCORE_TRY2 = 2000;
const SCORE_TRY3 = 1500;
const SCORE_TRY3_WITH_6 = 1000;
const SCORE_TRY3_WITH_3 = 500;

const MIN_REQUIRED_SONGS = 64;

// retry / anti-bug
const RETRY_DELAYS = [0, 2000, 6000]; // 3 tentatives
const STALL_TIMEOUT_MS = 6000;        // relance si ça buffer trop longtemps

// Segments
const TRY_DURATIONS = [20, 20, null]; // 3e écoute complète
const REFRAIN_START = 45;             // refrain ~50s

// =====================
// PARCOURS MODE
// =====================
const PARCOURS_CFG_KEY = "AG_parcours_filters";
const QS = new URLSearchParams(window.location.search);
const IS_PARCOURS = QS.get("parcours") === "1";
const PARCOURS_COUNT = clampInt(parseInt(QS.get("count") || "1", 10), 1, 100);
let parcoursSent = false;

function loadParcoursConfig() {
  try {
    const raw = localStorage.getItem(PARCOURS_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizedParcoursCfg(cfg) {
  const out = cfg && typeof cfg === "object" ? cfg : {};
  const popPercent = clampInt(parseInt(out.popPercent ?? "30", 10), 5, 100);
  const scorePercent = clampInt(parseInt(out.scorePercent ?? "100", 10), 5, 100);

  let yearMin = clampInt(parseInt(out.yearMin ?? "1950", 10), 1900, 2100);
  let yearMax = clampInt(parseInt(out.yearMax ?? "2026", 10), 1900, 2100);
  if (yearMin > yearMax) [yearMin, yearMax] = [yearMax, yearMin];

  const types = Array.isArray(out.types) && out.types.length ? out.types : ["TV", "Movie"];
  // OpeningQuizz => Songs uniquement, donc on utilise cfg.songs (OP/ED/IN)
  const songs = Array.isArray(out.songs) && out.songs.length ? out.songs : ["OP"];

  return { popPercent, scorePercent, yearMin, yearMax, types, songs };
}

function sendParcoursScore() {
  if (parcoursSent) return;
  parcoursSent = true;

  try {
    parent.postMessage(
      {
        parcoursScore: {
          label: "Opening Quizz",
          score: totalScore,
          total: totalRounds * MAX_SCORE,
        },
      },
      "*"
    );
  } catch (e) {
    // si jamais parent indispo
    console.warn("postMessage parcours failed:", e);
  }
}

// ====== UI: menu + theme ======
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

// ====== Helpers ======
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
  const s = (a.season || "").trim();
  const m = s.match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : 0;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

function clampYearSliders() {
  if (!yearMinEl || !yearMaxEl) return;
  let a = parseInt(yearMinEl.value, 10);
  let b = parseInt(yearMaxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    yearMinEl.value = a;
    yearMaxEl.value = b;
  }
}

// ====== Songs extraction ======
function extractSongsFromAnime(anime) {
  const songs = [];
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
      const artist = artistsArr.join(", ");

      songs.push({
        animeMalId: anime.mal_id ?? null,
        animeTitle: anime._title,
        animeTitleLower: anime._titleLower,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

        songType: b.type, // OP/ED/IN
        songNumber: safeNum(it.number) || 1,
        songName: it.name || "",
        songArtist: artist || "",
        songSeason: it.season || anime.season || "",

        url,
      });
    }
  }
  return songs;
}

function formatRevealLine(s) {
  const typeLabel = s.songType === "OP" ? "Opening" : s.songType === "ED" ? "Ending" : "Insert";
  const num = s.songNumber ? ` ${s.songNumber}` : "";
  const partName = s.songName ? ` : ${s.songName}` : "";
  const by = s.songArtist ? ` - ${s.songArtist}` : "";
  return `${s.animeTitle} ${typeLabel}${num}${partName}${by}`;
}

// ====== DOM refs ======
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

const openingInput = document.getElementById("openingInput");
const suggestionsDiv = document.getElementById("suggestions");

const playTry1Btn = document.getElementById("playTry1");
const playTry2Btn = document.getElementById("playTry2");
const playTry3Btn = document.getElementById("playTry3");

const indiceButtonsWrap = document.getElementById("indice-buttons");
const btnIndice6 = document.getElementById("btnIndice6");
const btnIndice3 = document.getElementById("btnIndice3");

const failedAttemptsDiv = document.getElementById("failedAttempts");
const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");
const roundLabel = document.getElementById("roundLabel");

const playerWrapper = document.getElementById("playerWrapper");
// ⚠️ c’est une VIDEO (id gardé pour compat)
const audioPlayer = document.getElementById("audioPlayer");

const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== Status “anti-bug” ======
let mediaStatusEl = document.getElementById("mediaStatus");
function ensureMediaStatusEl() {
  if (mediaStatusEl) return mediaStatusEl;
  const container = document.getElementById("container");
  if (!container) return null;

  const el = document.createElement("div");
  el.id = "mediaStatus";
  el.style.margin = "6px 0 10px 0";
  el.style.fontWeight = "900";
  el.style.opacity = "0.9";
  el.style.fontSize = "0.95rem";
  el.style.minHeight = "1.2em";
  el.style.textAlign = "center";
  el.style.userSelect = "none";

  container.insertBefore(el, container.querySelector(".input-container") || null);
  mediaStatusEl = el;
  return el;
}
function setMediaStatus(msg) {
  const el = ensureMediaStatusEl();
  if (!el) return;
  el.textContent = msg || "";
}

// ====== Support WebM ======
const CAN_PLAY_WEBM = (() => {
  const v = document.createElement("video");
  if (!v.canPlayType) return false;
  const t1 = v.canPlayType('video/webm; codecs="vp9, opus"');
  const t2 = v.canPlayType('video/webm; codecs="vp8, opus"');
  const t3 = v.canPlayType("video/webm");
  return (t1 && t1 !== "") || (t2 && t2 !== "") || (t3 && t3 !== "");
})();

// ====== Data ======
let allAnimes = [];
let allSongs = [];
let filteredSongs = [];

// ====== Session (Rounds) ======
let totalRounds = 1; // default 1
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentSong = null;
let tries = 0;
let failedAnswers = [];

let indice6Used = false;
let indice3Used = false;
let indiceActive = false;

// tokens anti-bug
let roundToken = 0;
let mediaToken = 0;

// ====== UI show/hide ======
function showCustomization() {
  if (customPanel) customPanel.style.display = "block";
  if (gamePanel) gamePanel.style.display = "none";
}
function showGame() {
  if (customPanel) customPanel.style.display = "none";
  if (gamePanel) gamePanel.style.display = "block";
}

// ====== Score bar ======
function getScoreBarColor(score) {
  if (score >= 2500) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= 1500) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score >= 1000) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  if (score > 0) return "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  return "linear-gradient(90deg,#444,#333 90%)";
}

function updateScoreBar(forceScore = null) {
  const bar = document.getElementById("score-bar");
  const label = document.getElementById("score-bar-label");
  if (!bar || !label) return;

  let score = 3000;
  if (forceScore !== null) {
    score = forceScore;
  } else {
    if (tries <= 1) score = 3000;
    else if (tries === 2) score = 2000;
    else if (tries === 3 && indice3Used) score = 500;
    else if (tries === 3 && indice6Used) score = 1000;
    else if (tries === 3) score = 1500;
    else score = 0;
  }

  const percent = Math.max(0, Math.min(100, (score / 3000) * 100));
  label.textContent = `${score} / 3000`;
  bar.style.width = percent + "%";
  bar.style.background = getScoreBarColor(score);
}

// ====== Volume ======
function applyVolume() {
  if (!audioPlayer || !volumeSlider) return;
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "50", 10)));
  audioPlayer.volume = v / 100;
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== Segment limiter (basé sur currentTime) ======
let segmentLimiter = {
  active: false,
  endTime: 0,
  handlerTimeUpdate: null,
  handlerSeeked: null,
};

function clearSegmentLimiter() {
  if (!segmentLimiter.active) return;
  if (segmentLimiter.handlerTimeUpdate) {
    audioPlayer.removeEventListener("timeupdate", segmentLimiter.handlerTimeUpdate);
  }
  if (segmentLimiter.handlerSeeked) {
    audioPlayer.removeEventListener("seeked", segmentLimiter.handlerSeeked);
  }
  segmentLimiter.active = false;
  segmentLimiter.endTime = 0;
  segmentLimiter.handlerTimeUpdate = null;
  segmentLimiter.handlerSeeked = null;
}

function armSegmentLimiter(startTime, durationSec) {
  clearSegmentLimiter();
  if (durationSec == null) return;

  const endTime = startTime + durationSec;
  segmentLimiter.active = true;
  segmentLimiter.endTime = endTime;

  const onTimeUpdate = () => {
    if (!segmentLimiter.active) return;
    if (audioPlayer.currentTime >= segmentLimiter.endTime - 0.05) {
      try { audioPlayer.pause(); } catch {}
      clearSegmentLimiter();
      setMediaStatus("");
    }
  };

  const onSeeked = () => {
    if (!segmentLimiter.active) return;
    if (audioPlayer.currentTime >= segmentLimiter.endTime - 0.05) {
      try { audioPlayer.pause(); } catch {}
      clearSegmentLimiter();
      setMediaStatus("");
    }
  };

  segmentLimiter.handlerTimeUpdate = onTimeUpdate;
  segmentLimiter.handlerSeeked = onSeeked;

  audioPlayer.addEventListener("timeupdate", onTimeUpdate);
  audioPlayer.addEventListener("seeked", onSeeked);
}

// ====== MEDIA loader (retries + anti-stall) ======
function hardResetMedia() {
  clearSegmentLimiter();
  try { audioPlayer.pause(); } catch {}
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
}

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadMediaWithRetries(url, localRound, localMedia, onReady, onFail, { preloadOnly = false } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    audioPlayer.onloadedmetadata = null;
    audioPlayer.oncanplay = null;
    audioPlayer.onplaying = null;
    audioPlayer.onwaiting = null;
    audioPlayer.onstalled = null;
    audioPlayer.onerror = null;
  };

  const isStillValid = () => localRound === roundToken && localMedia === mediaToken;

  const startStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!isStillValid() || done) return;
      triggerRetry("🔄 Rechargement (stall)...");
    }, STALL_TIMEOUT_MS);
  };

  const markReady = () => {
    if (!isStillValid() || done) return;
    done = true;
    cleanup();
    setMediaStatus("");
    if (typeof onReady === "function") onReady();
  };

  const triggerRetry = (msg) => {
    if (!isStillValid() || done) return;

    cleanup();
    attemptIndex++;

    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      setMediaStatus("❌ Média indisponible.");
      if (typeof onFail === "function") onFail();
      return;
    }

    setMediaStatus(msg || `🔄 Nouvelle tentative (${attemptIndex + 1}/${RETRY_DELAYS.length})...`);
    setTimeout(() => {
      if (!isStillValid() || done) return;
      doAttempt();
    }, RETRY_DELAYS[attemptIndex]);
  };

  const doAttempt = () => {
    if (!isStillValid() || done) return;

    const src = attemptIndex === 0 ? url : withCacheBuster(url);

    try { hardResetMedia(); } catch {}

    setMediaStatus(attemptIndex === 0 ? "⏳ Chargement..." : `🔄 Nouvelle tentative (${attemptIndex + 1}/${RETRY_DELAYS.length})...`);

    audioPlayer.preload = "metadata";
    audioPlayer.src = src;
    audioPlayer.load();

    audioPlayer.onloadedmetadata = () => {
      if (!isStillValid() || done) return;
      if (preloadOnly) return markReady();
      markReady();
    };

    audioPlayer.oncanplay = () => {
      if (!isStillValid() || done) return;
      if (preloadOnly) return markReady();
      markReady();
    };

    audioPlayer.onwaiting = () => {
      if (!isStillValid() || done) return;
      setMediaStatus("⏳ Chargement...");
      startStallTimer();
    };

    audioPlayer.onstalled = () => {
      if (!isStillValid() || done) return;
      setMediaStatus("⏳ Chargement...");
      startStallTimer();
    };

    audioPlayer.onplaying = () => {
      if (!isStillValid() || done) return;
      setMediaStatus("");
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    audioPlayer.onerror = () => {
      if (!isStillValid() || done) return;
      triggerRetry();
    };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();

  return cleanup;
}

// ====== Filters (UI ou Parcours) ======
function getFiltersFromUI() {
  const popPercent = parseInt(popEl?.value || "30", 10);
  const scorePercent = parseInt(scoreEl?.value || "100", 10);
  const yearMin = parseInt(yearMinEl?.value || "1950", 10);
  const yearMax = parseInt(yearMaxEl?.value || "2026", 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);

  return {
    popPercent,
    scorePercent,
    yearMin,
    yearMax,
    types: allowedTypes.length ? allowedTypes : ["TV", "Movie"],
    songs: allowedSongs.length ? allowedSongs : ["OP"],
  };
}

function applyFilters(cfgOverride = null) {
  const cfg = cfgOverride ? normalizedParcoursCfg(cfgOverride) : getFiltersFromUI();
  const popPercent = cfg.popPercent;
  const scorePercent = cfg.scorePercent;
  const yearMin = cfg.yearMin;
  const yearMax = cfg.yearMax;
  const allowedTypes = cfg.types;
  const allowedSongs = cfg.songs;

  if (!allowedTypes.length || !allowedSongs.length) return [];

  // 1) filtre year/type/songType
  let pool = allSongs.filter((s) => {
    return (
      s.animeYear >= yearMin &&
      s.animeYear <= yearMax &&
      allowedTypes.includes(s.animeType) &&
      allowedSongs.includes(s.songType)
    );
  });

  // 2) top pop% (members)
  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // 3) top score% (score)
  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

// ====== Preview (standalone) ======
function updatePreview() {
  if (!previewCountEl || !applyBtn) return;

  if (!allSongs.length) {
    previewCountEl.textContent = "⏳ Chargement de la base…";
    previewCountEl.classList.add("bad");
    previewCountEl.classList.remove("good");
    applyBtn.disabled = true;
    return;
  }

  const pool = applyFilters(null);
  const ok = pool.length >= MIN_REQUIRED_SONGS;

  previewCountEl.textContent = ok
    ? `🎵 Songs disponibles : ${pool.length} (OK)`
    : `🎵 Songs disponibles : ${pool.length} (Min ${MIN_REQUIRED_SONGS})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== Playback helpers ======
function stopPlayback() {
  clearSegmentLimiter();
  try { audioPlayer.pause(); } catch {}
}

function hidePlayerDuringGame() {
  if (!playerWrapper) return;
  playerWrapper.style.display = "none";
  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");
}

function revealVideoPlayerAtEnd() {
  clearSegmentLimiter();
  if (!playerWrapper) return;

  playerWrapper.style.display = "block";
  audioPlayer.controls = true;
  audioPlayer.setAttribute("controls", "controls");

  try {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  } catch {}
}

function updateListenButtons() {
  if (!playTry1Btn || !playTry2Btn || !playTry3Btn) return;

  if (tries === 0) {
    playTry1Btn.disabled = true;
    playTry2Btn.disabled = true;
    playTry3Btn.disabled = true;
    return;
  }
  if (tries === 1) {
    playTry1Btn.disabled = true;
    playTry2Btn.disabled = false;
    playTry3Btn.disabled = true;
    return;
  }
  if (tries === 2) {
    playTry1Btn.disabled = true;
    playTry2Btn.disabled = true;
    playTry3Btn.disabled = false;
    return;
  }
  playTry1Btn.disabled = true;
  playTry2Btn.disabled = true;
  playTry3Btn.disabled = true;
}

// ====== Indices (3e écoute) ======
btnIndice6?.addEventListener("click", () => {
  if (indice6Used || indice3Used || !indiceActive) return;
  indice6Used = true;
  indiceActive = false;
  btnIndice6.classList.add("used");
  btnIndice3.disabled = true;
  showIndiceOptions(6);
  updateScoreBar();
});

btnIndice3?.addEventListener("click", () => {
  if (indice6Used || indice3Used || !indiceActive) return;
  indice3Used = true;
  indiceActive = false;
  btnIndice3.classList.add("used");
  btnIndice6.disabled = true;
  showIndiceOptions(3);
  updateScoreBar();
});

function showIndiceOptions(nb) {
  const old = document.getElementById("indice-options-list");
  if (old) old.remove();

  let titles = [...new Set(filteredSongs.map((s) => s.animeTitle))];
  titles = titles.filter((t) => t !== currentSong.animeTitle);
  shuffleInPlace(titles);

  const propositions = titles.slice(0, nb - 1);
  propositions.push(currentSong.animeTitle);
  shuffleInPlace(propositions);

  const list = document.createElement("div");
  list.id = "indice-options-list";

  propositions.forEach((title) => {
    const btn = document.createElement("button");
    btn.textContent = title;
    btn.className = "indice-btn";
    btn.onclick = () => {
      checkAnswer(title);
      list.remove();
      openingInput.value = "";
    };
    list.appendChild(btn);
  });

  document.getElementById("container")?.appendChild(list);
}

function resetIndice() {
  indice6Used = false;
  indice3Used = false;
  indiceActive = false;

  if (indiceButtonsWrap) indiceButtonsWrap.style.display = "none";
  btnIndice6?.classList.remove("used");
  btnIndice3?.classList.remove("used");
  if (btnIndice6) btnIndice6.disabled = false;
  if (btnIndice3) btnIndice3.disabled = false;

  const old = document.getElementById("indice-options-list");
  if (old) old.remove();
}

// ====== Round init/reset ======
function resetControls() {
  tries = 0;
  failedAnswers = [];
  if (failedAttemptsDiv) failedAttemptsDiv.innerText = "";
  if (resultDiv) {
    resultDiv.textContent = "";
    resultDiv.className = "";
  }

  if (openingInput) {
    openingInput.value = "";
    openingInput.disabled = true;
  }

  if (suggestionsDiv) suggestionsDiv.innerHTML = "";

  if (playTry1Btn) playTry1Btn.disabled = true;
  if (playTry2Btn) playTry2Btn.disabled = true;
  if (playTry3Btn) playTry3Btn.disabled = true;

  if (nextBtn) nextBtn.style.display = "none";

  resetIndice();
  stopPlayback();
  hidePlayerDuringGame();

  updateScoreBar(3000);

  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
}

function startNewRound() {
  roundToken++;
  mediaToken++;

  resetControls();

  if (!CAN_PLAY_WEBM) {
    setMediaStatus("⚠️ WebM non supporté sur ce navigateur (Safari/iOS).");
    return;
  }

  currentSong = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
  if (!currentSong || !currentSong.url) {
    startNewRound();
    return;
  }

  setMediaStatus("⏳ Préchargement...");
  const localRound = roundToken;
  const localMedia = mediaToken;

  loadMediaWithRetries(
    currentSong.url,
    localRound,
    localMedia,
    () => {
      if (localRound !== roundToken || localMedia !== mediaToken) return;
      setMediaStatus("");
      if (openingInput) openingInput.disabled = true;
      if (playTry1Btn) playTry1Btn.disabled = false;
      if (playTry2Btn) playTry2Btn.disabled = true;
      if (playTry3Btn) playTry3Btn.disabled = true;
      applyVolume();
    },
    () => {
      if (localRound !== roundToken || localMedia !== mediaToken) return;
      startNewRound();
    },
    { preloadOnly: true }
  );
}

// ====== Play segment ======
function finalScore() {
  if (tries === 1) return SCORE_TRY1;
  if (tries === 2) return SCORE_TRY2;
  if (tries === 3 && indice3Used) return SCORE_TRY3_WITH_3;
  if (tries === 3 && indice6Used) return SCORE_TRY3_WITH_6;
  if (tries === 3) return SCORE_TRY3;
  return 0;
}

function playSegment(tryNum) {
  if (!currentSong) return;

  if (tryNum !== tries + 1) {
    alert("Vous devez écouter les extraits dans l'ordre.");
    return;
  }

  mediaToken++;

  tries = tryNum;
  updateScoreBar();
  if (openingInput) openingInput.disabled = false;

  if (tries === 3) {
    if (indiceButtonsWrap) indiceButtonsWrap.style.display = "flex";
    indiceActive = true;
    if (btnIndice6) btnIndice6.disabled = indice6Used || indice3Used;
    if (btnIndice3) btnIndice3.disabled = indice6Used || indice3Used;
    btnIndice6?.classList.toggle("used", indice6Used);
    btnIndice3?.classList.toggle("used", indice3Used);
  } else {
    if (indiceButtonsWrap) indiceButtonsWrap.style.display = "none";
    indiceActive = false;
    const old = document.getElementById("indice-options-list");
    if (old) old.remove();
  }

  let startTime = 0;
  if (tries === 2) startTime = REFRAIN_START;
  if (tries === 3) startTime = 0;

  hidePlayerDuringGame();
  stopPlayback();
  setMediaStatus("⏳ Chargement...");

  updateListenButtons();

  const localRound = roundToken;
  const localMedia = mediaToken;

  loadMediaWithRetries(
    currentSong.url,
    localRound,
    localMedia,
    () => {
      if (localRound !== roundToken || localMedia !== mediaToken) return;

      try { audioPlayer.currentTime = startTime; } catch {}
      applyVolume();

      const dur = TRY_DURATIONS[tries - 1];
      armSegmentLimiter(startTime, dur);

      audioPlayer
        .play()
        .then(() => {
          if (localRound !== roundToken || localMedia !== mediaToken) return;
          setMediaStatus("");
        })
        .catch(() => {
          if (localRound !== roundToken || localMedia !== mediaToken) return;
          setMediaStatus("❌ Impossible de lire ce média.");
        });

      updateListenButtons();
    },
    () => {
      if (localRound !== roundToken || localMedia !== mediaToken) return;
      setMediaStatus("❌ Média indisponible. Changement de song…");
      startNewRound();
    },
    { preloadOnly: false }
  );
}

// ====== Guess logic ======
function updateFailedAttempts() {
  if (!failedAttemptsDiv) return;
  failedAttemptsDiv.innerText = failedAnswers.map((e) => `❌ ${e}`).join("\n");
}

function blockInputsAll() {
  if (openingInput) openingInput.disabled = true;
  if (playTry1Btn) playTry1Btn.disabled = true;
  if (playTry2Btn) playTry2Btn.disabled = true;
  if (playTry3Btn) playTry3Btn.disabled = true;
  if (suggestionsDiv) suggestionsDiv.innerHTML = "";
  if (indiceButtonsWrap) indiceButtonsWrap.style.display = "none";
  const old = document.getElementById("indice-options-list");
  if (old) old.remove();
}

function endRoundAndMaybeNext(roundScore) {
  totalScore += roundScore;

  if (!nextBtn || !resultDiv) return;

  if (currentRound >= totalRounds) {
    resultDiv.innerHTML += `
      <div style="margin-top:10px; font-weight:900; opacity:0.95;">
        ✅ Série terminée !<br>
        Score total : <b>${totalScore}</b> / <b>${totalRounds * 3000}</b>
      </div>
    `;

    nextBtn.style.display = "block";

    if (IS_PARCOURS) {
      nextBtn.textContent = "Continuer le parcours";
      nextBtn.onclick = () => {
        nextBtn.disabled = true;
        sendParcoursScore();
      };
    } else {
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => {
        showCustomization();
        stopPlayback();
        if (playerWrapper) playerWrapper.style.display = "none";
        if (openingInput) openingInput.value = "";
        if (suggestionsDiv) suggestionsDiv.innerHTML = "";
        resultDiv.textContent = "";
        if (failedAttemptsDiv) failedAttemptsDiv.textContent = "";
        setMediaStatus("");
      };
    }
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Round suivant";
  nextBtn.onclick = () => {
    currentRound += 1;
    startNewRound();
  };
}

function checkAnswer(selectedTitle) {
  if (!currentSong || !resultDiv) return;

  const inputVal = selectedTitle.trim().toLowerCase();
  const good = inputVal === currentSong.animeTitleLower;

  if (good) {
    const score = finalScore();
    resultDiv.innerHTML = `🎉 Bravo !<br><b>${currentSong.animeTitle}</b><br><em>${formatRevealLine(
      currentSong
    )}</em><br><span style="font-size:1.05em;">Score : <b>${score}</b> / 3000</span>`;
    resultDiv.className = "correct";

    stopPlayback();
    revealVideoPlayerAtEnd();
    launchFireworks();

    blockInputsAll();
    updateScoreBar(score);

    endRoundAndMaybeNext(score);
    return;
  }

  failedAnswers.push(selectedTitle);
  updateFailedAttempts();

  if (tries >= 3) {
    resultDiv.innerHTML = `🔔 Réponse : <b>${currentSong.animeTitle}</b><br><em>${formatRevealLine(currentSong)}</em>`;
    resultDiv.className = "incorrect";

    stopPlayback();
    revealVideoPlayerAtEnd();

    blockInputsAll();
    updateScoreBar(0);

    endRoundAndMaybeNext(0);
  } else {
    if (openingInput) openingInput.disabled = true;
  }
}

// ====== Autocomplete ======
openingInput?.addEventListener("input", function () {
  if (openingInput.disabled) return;
  const val = this.value.toLowerCase().trim();
  if (suggestionsDiv) suggestionsDiv.innerHTML = "";
  if (!val) return;

  const uniqueTitles = [...new Set(filteredSongs.map((s) => s.animeTitle))];
  const matches = uniqueTitles.filter((t) => t.toLowerCase().includes(val));
  shuffleInPlace(matches);

  matches.slice(0, 6).forEach((title) => {
    const div = document.createElement("div");
    div.textContent = title;
    div.onclick = () => {
      openingInput.value = title;
      if (suggestionsDiv) suggestionsDiv.innerHTML = "";
      checkAnswer(title);
      openingInput.value = "";
    };
    suggestionsDiv?.appendChild(div);
  });
});

openingInput?.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !openingInput.disabled) {
    const val = openingInput.value.trim();
    if (!val) return;
    checkAnswer(val);
    if (suggestionsDiv) suggestionsDiv.innerHTML = "";
    openingInput.value = "";
  }
});

document.addEventListener("click", (e) => {
  if (e.target !== openingInput && suggestionsDiv) suggestionsDiv.innerHTML = "";
});

// ====== Buttons ======
playTry1Btn?.addEventListener("click", () => playSegment(1));
playTry2Btn?.addEventListener("click", () => playSegment(2));
playTry3Btn?.addEventListener("click", () => playSegment(3));

// ====== Tooltip help ======
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

// ====== Fireworks ======
function launchFireworks() {
  const canvas = document.getElementById("fireworks");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  function createParticle(x, y) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 5 + 2;
    return { x, y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: 60 };
  }
  for (let i = 0; i < 80; i++) particles.push(createParticle(canvas.width / 2, canvas.height / 2));

  function animate() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 50%)`;
      ctx.fill();
      p.x += p.dx;
      p.y += p.dy;
      p.dy += 0.05;
      p.life--;
    });

    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }

    if (particles.length > 0) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

// ====== Custom UI init (standalone) ======
function initCustomUI() {
  if (!popEl || !scoreEl || !yearMinEl || !yearMaxEl || !applyBtn) return;

  function syncLabels() {
    clampYearSliders();
    if (popValEl) popValEl.textContent = popEl.value;
    if (scoreValEl) scoreValEl.textContent = scoreEl.value;
    if (yearMinValEl) yearMinValEl.textContent = yearMinEl.value;
    if (yearMaxValEl) yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));

  // type pills (au moins 1)
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");

      const any = document.querySelectorAll("#typePills .pill.active").length > 0;
      if (!any) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }

      updatePreview();
    });
  });

  // song pills (au moins 1)
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");

      const any = document.querySelectorAll("#songPills .pill.active").length > 0;
      if (!any) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }

      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    filteredSongs = applyFilters(null);
    if (filteredSongs.length < MIN_REQUIRED_SONGS) return;

    totalRounds = clampInt(parseInt(roundCountEl?.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Boot Parcours ======
function bootParcoursMode() {
  // cache bouton menu dans l’iframe (évite de sortir du parcours)
  const backBtn = document.getElementById("back-to-menu");
  if (backBtn) backBtn.style.display = "none";

  // on force affichage jeu
  showGame();

  // config globale
  const cfg = normalizedParcoursCfg(loadParcoursConfig());

  filteredSongs = applyFilters(cfg);
  totalRounds = PARCOURS_COUNT;
  currentRound = 1;
  totalScore = 0;

  if (filteredSongs.length < MIN_REQUIRED_SONGS) {
    setMediaStatus(`❌ Pas assez de songs pour jouer (${filteredSongs.length}/${MIN_REQUIRED_SONGS}).`);
    if (resultDiv && nextBtn) {
      resultDiv.className = "incorrect";
      resultDiv.innerHTML = `❌ Pool insuffisant.<br><b>${filteredSongs.length}</b> songs dispo (min ${MIN_REQUIRED_SONGS}).`;
      nextBtn.style.display = "block";
      nextBtn.textContent = "Continuer le parcours";
      nextBtn.onclick = () => {
        nextBtn.disabled = true;
        // score 0/total
        totalScore = 0;
        sendParcoursScore();
      };
    }
    return;
  }

  startNewRound();
}

// ====== Load dataset ======
fetch("../data/licenses_only.json")
  .then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  })
  .then((json) => {
    const data = normalizeAnimeList(json);

    allAnimes = (Array.isArray(data) ? data : []).map((a) => {
      const title = getDisplayTitle(a);
      return {
        ...a,
        _title: title,
        _titleLower: title.toLowerCase(),
        _year: getYear(a),
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();
    applyVolume();

    if (IS_PARCOURS) {
      bootParcoursMode();
    }
  })
  .catch((e) => {
    if (previewCountEl) {
      previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
      previewCountEl.classList.add("bad");
    }
    if (applyBtn) applyBtn.disabled = true;

    // en parcours, on évite de bloquer silencieusement
    if (IS_PARCOURS && resultDiv && nextBtn) {
      setMediaStatus("❌ Erreur dataset.");
      resultDiv.className = "incorrect";
      resultDiv.innerHTML = `❌ Impossible de charger la base.<br>${e.message}`;
      nextBtn.style.display = "block";
      nextBtn.textContent = "Continuer le parcours";
      nextBtn.onclick = () => {
        nextBtn.disabled = true;
        totalRounds = PARCOURS_COUNT;
        totalScore = 0;
        sendParcoursScore();
      };
    }
  });
