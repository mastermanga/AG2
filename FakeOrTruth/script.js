/**********************
 * Sound Match — Sync A/V
 * - Vidéo = Song A ; Audio = Song B
 * - Une seule écoute : start 45s, durée 30s
 * - Réponse : Match / Pas match
 * - Reveal : vidéo A AVEC son vrai audio (contrôles)
 * - Distribution :
 *    1/3 A = B
 *    1/3 A != B & anime différent
 *    1/3 A != B mais même anime (si possible sinon fallback anime différent)
 * - Anti-bug média : retries + stall + sync start (ne démarre que si les 2 sont prêts)
 **********************/

const MAX_SCORE = 3000;
const MIN_REQUIRED_SONGS = 64;

// retry / anti-stall
const RETRY_DELAYS = [0, 2000, 6000];
const STALL_TIMEOUT_MS = 6000;

// ✅ Une seule écoute
const LISTEN_START = 45;
const LISTEN_DURATION = 30;

// ====== UI: menu + theme ======
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
  let a = parseInt(yearMinEl.value, 10);
  let b = parseInt(yearMaxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    yearMinEl.value = a;
    yearMaxEl.value = b;
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

        songType: b.type,
        songNumber: safeNum(it.number) || 1,
        songName: it.name || "",
        songArtist: artist || "",

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

const playOnceBtn = document.getElementById("playOnce");
const btnMatch = document.getElementById("btnMatch");
const btnNoMatch = document.getElementById("btnNoMatch");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");
const roundLabel = document.getElementById("roundLabel");

const videoPlayer = document.getElementById("videoPlayer");
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

  container.insertBefore(el, container.querySelector("#videoWrapper") || null);
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
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let videoSong = null; // A
let audioSong = null; // B
let isMatch = false;

let listenUsed = false;
let roundReady = false;

// tokens anti-bug
let roundToken = 0;
let mediaToken = 0;

// ====== UI show/hide ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
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

  const score = forceScore === null ? MAX_SCORE : forceScore;
  const percent = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));
  label.textContent = `${score} / ${MAX_SCORE}`;
  bar.style.width = percent + "%";
  bar.style.background = getScoreBarColor(score);
}

// ====== Volume (audio B pendant le jeu) ======
function applyVolume() {
  if (!audioPlayer || !volumeSlider) return;
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "50", 10)));
  audioPlayer.volume = v / 100;
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== Segment limiter (basé sur currentTime) ======
function createLimiter(mediaEl) {
  return {
    el: mediaEl,
    active: false,
    endTime: 0,
    handlerTimeUpdate: null,
    handlerSeeked: null,
  };
}
const limiterVideo = createLimiter(videoPlayer);
const limiterAudio = createLimiter(audioPlayer);

function clearLimiter(lim) {
  if (!lim.active) return;
  if (lim.handlerTimeUpdate) lim.el.removeEventListener("timeupdate", lim.handlerTimeUpdate);
  if (lim.handlerSeeked) lim.el.removeEventListener("seeked", lim.handlerSeeked);
  lim.active = false;
  lim.endTime = 0;
  lim.handlerTimeUpdate = null;
  lim.handlerSeeked = null;
}

function armLimiter(lim, startTime, durationSec) {
  clearLimiter(lim);
  if (durationSec == null) return;

  const endTime = startTime + durationSec;
  lim.active = true;
  lim.endTime = endTime;

  const onTimeUpdate = () => {
    if (!lim.active) return;
    if (lim.el.currentTime >= lim.endTime - 0.05) {
      try { lim.el.pause(); } catch {}
      clearLimiter(lim);
      // on ne clear pas le status ici : on peut afficher "réponds maintenant"
    }
  };

  const onSeeked = () => {
    if (!lim.active) return;
    if (lim.el.currentTime >= lim.endTime - 0.05) {
      try { lim.el.pause(); } catch {}
      clearLimiter(lim);
    }
  };

  lim.handlerTimeUpdate = onTimeUpdate;
  lim.handlerSeeked = onSeeked;

  lim.el.addEventListener("timeupdate", onTimeUpdate);
  lim.el.addEventListener("seeked", onSeeked);
}

// ====== MEDIA loader (retries + anti-stall) ======
function hardResetMedia(el) {
  clearLimiter(el === videoPlayer ? limiterVideo : limiterAudio);
  try { el.pause(); } catch {}
  el.removeAttribute("src");
  el.load();
}

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadMediaWithRetries(el, url, localRound, localMedia, onReady, onFail, { preloadOnly = false } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    el.onloadedmetadata = null;
    el.oncanplay = null;
    el.onplaying = null;
    el.onwaiting = null;
    el.onstalled = null;
    el.onerror = null;
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
    if (typeof onReady === "function") onReady();
  };

  const triggerRetry = (msg) => {
    if (!isStillValid() || done) return;

    cleanup();
    attemptIndex++;

    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
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

    try { hardResetMedia(el); } catch {}

    setMediaStatus(attemptIndex === 0 ? "⏳ Chargement..." : `🔄 Nouvelle tentative (${attemptIndex + 1}/${RETRY_DELAYS.length})...`);

    el.preload = "metadata";
    el.src = src;
    el.load();

    el.onloadedmetadata = () => {
      if (!isStillValid() || done) return;
      if (preloadOnly) return markReady();
      markReady();
    };

    el.oncanplay = () => {
      if (!isStillValid() || done) return;
      if (preloadOnly) return markReady();
      markReady();
    };

    el.onwaiting = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };

    el.onstalled = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };

    el.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    el.onerror = () => {
      if (!isStillValid() || done) return;
      triggerRetry();
    };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
  return cleanup;
}

// ====== Sync helpers (LE POINT IMPORTANT) ======
function waitOnce(el, evt, timeoutMs, isValid) {
  return new Promise((resolve, reject) => {
    let timer = null;

    const done = (ok) => {
      cleanup();
      ok ? resolve(true) : reject(new Error("event-failed"));
    };

    const onEvt = () => {
      if (!isValid()) return done(false);
      done(true);
    };

    const cleanup = () => {
      el.removeEventListener(evt, onEvt);
      if (timer) clearTimeout(timer);
      timer = null;
    };

    el.addEventListener(evt, onEvt, { once: true });

    timer = setTimeout(() => {
      if (!isValid()) return done(false);
      done(false);
    }, timeoutMs);
  });
}

async function ensureSeekAndCanPlay(el, startTime, localRound, localMedia) {
  const isValid = () => localRound === roundToken && localMedia === mediaToken;

  // seek
  try { el.currentTime = startTime; } catch {}

  // attendre seeked (si jamais)
  try {
    await waitOnce(el, "seeked", 9000, isValid);
  } catch {
    // si seeked n'arrive pas, on continue mais on re-check canplay
  }

  // attendre buffer suffisant sur la position seekée
  if (el.readyState >= 3) return true;

  try {
    await waitOnce(el, "canplay", 9000, isValid);
    return true;
  } catch {
    return false;
  }
}

// ====== Custom UI init ======
function initCustomUI() {
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
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
    filteredSongs = applyFilters();
    if (filteredSongs.length < MIN_REQUIRED_SONGS) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Filters ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);

  if (allowedTypes.length === 0 || allowedSongs.length === 0) return [];

  let pool = allSongs.filter((s) => {
    return (
      s.animeYear >= yearMin &&
      s.animeYear <= yearMax &&
      allowedTypes.includes(s.animeType) &&
      allowedSongs.includes(s.songType)
    );
  });

  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

// ====== Preview ======
function updatePreview() {
  if (!allSongs.length) {
    previewCountEl.textContent = "⏳ Chargement de la base…";
    previewCountEl.classList.add("bad");
    previewCountEl.classList.remove("good");
    applyBtn.disabled = true;
    return;
  }

  const pool = applyFilters();
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
  clearLimiter(limiterVideo);
  clearLimiter(limiterAudio);
  try { videoPlayer.pause(); } catch {}
  try { audioPlayer.pause(); } catch {}
}

function lockPlayersForGame() {
  // Pendant le jeu : vidéo muette, audio B actif
  videoPlayer.muted = true;
  videoPlayer.controls = false;
  videoPlayer.removeAttribute("controls");

  audioPlayer.muted = false;
  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");

  // audio caché
  audioPlayer.style.display = "none";

  applyVolume();
}

function revealVideoAWithItsAudio() {
  // ✅ Reveal demandé : vidéo A avec SON AUDIO À LUI
  clearLimiter(limiterVideo);
  clearLimiter(limiterAudio);

  try { audioPlayer.pause(); } catch {}
  try { audioPlayer.removeAttribute("src"); audioPlayer.load(); } catch {}

  videoPlayer.muted = false;
  videoPlayer.controls = true;
  videoPlayer.setAttribute("controls", "controls");

  // on remet au début pour que le joueur puisse comparer
  try { videoPlayer.pause(); videoPlayer.currentTime = 0; } catch {}
}

// ====== Tirage 1/3 - 1/3 - 1/3 ======
function pickDifferentAnimeSong(base) {
  for (let i = 0; i < 80; i++) {
    const cand = pickRandom(filteredSongs);
    if (!cand || !cand.url) continue;
    if (cand.url === base.url) continue;
    if (cand.animeMalId && base.animeMalId && cand.animeMalId === base.animeMalId) continue;
    if (cand.animeTitleLower === base.animeTitleLower) continue;
    return cand;
  }
  // fallback
  return pickRandom(filteredSongs);
}

function pickSameAnimeDifferentSong(base) {
  const same = filteredSongs.filter(s =>
    (s.animeMalId && base.animeMalId && s.animeMalId === base.animeMalId) &&
    s.url !== base.url
  );
  if (same.length) return pickRandom(same);
  return null;
}

function choosePair() {
  const A = pickRandom(filteredSongs);
  if (!A || !A.url) return null;

  const r = Math.floor(Math.random() * 3); // 0,1,2

  // 0 => match
  if (r === 0) {
    return { A, B: A, isMatch: true, rule: "match" };
  }

  // 2 => même anime mais song différent (si possible)
  if (r === 2) {
    const Bsame = pickSameAnimeDifferentSong(A);
    if (Bsame) return { A, B: Bsame, isMatch: false, rule: "sameAnimeDifferentSong" };
    // fallback => anime différent
    const Bdiff = pickDifferentAnimeSong(A);
    return { A, B: Bdiff, isMatch: false, rule: "differentAnime" };
  }

  // 1 => anime différent
  const B = pickDifferentAnimeSong(A);
  return { A, B, isMatch: false, rule: "differentAnime" };
}

// ====== Round init/reset ======
function resetControls() {
  listenUsed = false;
  roundReady = false;

  resultDiv.textContent = "";
  resultDiv.className = "";

  btnMatch.disabled = true;
  btnNoMatch.disabled = true;

  playOnceBtn.disabled = true;

  nextBtn.style.display = "none";
  nextBtn.onclick = null;

  stopPlayback();
  lockPlayersForGame();

  updateScoreBar(MAX_SCORE);

  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
  setMediaStatus("");
}

function startNewRound() {
  roundToken++;
  mediaToken++;
  resetControls();

  if (!CAN_PLAY_WEBM) {
    setMediaStatus("⚠️ WebM non supporté sur ce navigateur (Safari/iOS).");
    return;
  }

  const pair = choosePair();
  if (!pair) return startNewRound();

  videoSong = pair.A;
  audioSong = pair.B;
  isMatch = pair.isMatch;

  const localRound = roundToken;
  const localMedia = mediaToken;

  // ✅ préchargement des 2 (on n’active le bouton écoute QUE quand les 2 sont prêts)
  setMediaStatus("⏳ Préchargement A + B...");
  let readyCount = 0;
  let failed = false;

  const onReadyOne = () => {
    if (failed) return;
    readyCount++;
    if (readyCount >= 2) {
      if (localRound !== roundToken || localMedia !== mediaToken) return;
      roundReady = true;
      setMediaStatus("✅ Prêt ! Clique sur Écouter.");
      playOnceBtn.disabled = false;
      lockPlayersForGame();
    }
  };

  const onFailAny = () => {
    if (failed) return;
    failed = true;
    if (localRound !== roundToken || localMedia !== mediaToken) return;
    setMediaStatus("❌ Erreur média. Changement...");
    startNewRound();
  };

  loadMediaWithRetries(videoPlayer, videoSong.url, localRound, localMedia, onReadyOne, onFailAny, { preloadOnly: true });
  loadMediaWithRetries(audioPlayer, audioSong.url, localRound, localMedia, onReadyOne, onFailAny, { preloadOnly: true });
}

// ====== ✅ Lecture unique (sync) ======
async function playOnceSync() {
  if (!roundReady || listenUsed) return;
  if (!videoSong || !audioSong) return;

  listenUsed = true;
  playOnceBtn.disabled = true;
  btnMatch.disabled = true;
  btnNoMatch.disabled = true;

  // nouveau token “segment”
  mediaToken++;
  const localRound = roundToken;
  const localMedia = mediaToken;

  setMediaStatus("⏳ Synchronisation (seek 45s)...");
  stopPlayback();
  lockPlayersForGame();

  // reload (sans buster) mais avec anti-bug si besoin
  let okV = false, okA = false;

  await new Promise((resolve) => {
    let got = 0;
    const doneOne = () => { got++; if (got === 2) resolve(); };

    loadMediaWithRetries(videoPlayer, videoSong.url, localRound, localMedia, () => { okV = true; doneOne(); }, () => { okV = false; doneOne(); }, { preloadOnly: false });
    loadMediaWithRetries(audioPlayer, audioSong.url, localRound, localMedia, () => { okA = true; doneOne(); }, () => { okA = false; doneOne(); }, { preloadOnly: false });
  });

  if (localRound !== roundToken || localMedia !== mediaToken) return;

  if (!okV || !okA) {
    setMediaStatus("❌ Impossible de charger A/B. Changement...");
    startNewRound();
    return;
  }

  // ✅ étape CRITIQUE : seek + canplay pour LES 2 avant de lancer
  setMediaStatus("⏳ Buffer des 2 médias...");
  const [canV, canA] = await Promise.all([
    ensureSeekAndCanPlay(videoPlayer, LISTEN_START, localRound, localMedia),
    ensureSeekAndCanPlay(audioPlayer, LISTEN_START, localRound, localMedia),
  ]);

  if (localRound !== roundToken || localMedia !== mediaToken) return;

  if (!canV || !canA) {
    setMediaStatus("❌ Buffer insuffisant. Changement...");
    startNewRound();
    return;
  }

  // Limiteurs 30s
  armLimiter(limiterVideo, LISTEN_START, LISTEN_DURATION);
  armLimiter(limiterAudio, LISTEN_START, LISTEN_DURATION);

  // Jeu : vidéo muette, audio B actif
  videoPlayer.muted = true;
  audioPlayer.muted = false;
  applyVolume();

  setMediaStatus("▶️ Lecture (30s)...");
  const p1 = videoPlayer.play();
  const p2 = audioPlayer.play();

  await Promise.allSettled([p1, p2]);

  if (localRound !== roundToken || localMedia !== mediaToken) return;

  // Autoriser réponse (après démarrage)
  btnMatch.disabled = false;
  btnNoMatch.disabled = false;

  // Quand ça s’arrête (limiter), on laisse répondre
  setTimeout(() => {
    if (localRound !== roundToken || localMedia !== mediaToken) return;
    setMediaStatus("✅ À toi : Match ou pas match ?");
  }, 600); // juste pour laisser le status de lecture apparaître
}

// ====== Guess logic ======
function blockInputsAll() {
  btnMatch.disabled = true;
  btnNoMatch.disabled = true;
  playOnceBtn.disabled = true;
}

function endRoundAndMaybeNext(roundScore) {
  totalScore += roundScore;

  if (currentRound >= totalRounds) {
    resultDiv.innerHTML += `
      <div style="margin-top:10px; font-weight:900; opacity:0.95;">
        ✅ Série terminée !<br>
        Score total : <b>${totalScore}</b> / <b>${totalRounds * 3000}</b>
      </div>
    `;

    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      stopPlayback();
      resultDiv.textContent = "";
      setMediaStatus("");
    };
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Round suivant";
  nextBtn.onclick = () => {
    currentRound += 1;
    startNewRound();
  };
}

function checkAnswer(userSaysMatch) {
  if (!videoSong || !audioSong) return;
  if (!listenUsed) return;

  const good = (userSaysMatch === isMatch);

  stopPlayback();

  // ✅ Reveal demandé : vidéo A avec SON audio
  revealVideoAWithItsAudio();

  blockInputsAll();

  if (good) {
    const score = MAX_SCORE;
    resultDiv.innerHTML = `
      🎉 Bonne réponse !<br>
      <b>${isMatch ? "✅ MATCH" : "❌ PAS MATCH"}</b>
      <em>Vidéo (A) : ${formatRevealLine(videoSong)}</em>
      <em>Audio (B) : ${formatRevealLine(audioSong)}</em>
      <div style="margin-top:8px;">Score : <b>${score}</b> / 3000</div>
    `;
    resultDiv.className = "correct";
    updateScoreBar(score);
    launchFireworks();
    endRoundAndMaybeNext(score);
    return;
  }

  resultDiv.innerHTML = `
    ❌ Mauvaise réponse.<br>
    Réponse correcte : <b>${isMatch ? "✅ MATCH" : "❌ PAS MATCH"}</b>
    <em>Vidéo (A) : ${formatRevealLine(videoSong)}</em>
    <em>Audio (B) : ${formatRevealLine(audioSong)}</em>
    <div style="margin-top:8px;">Score : <b>0</b> / 3000</div>
  `;
  resultDiv.className = "incorrect";
  updateScoreBar(0);
  endRoundAndMaybeNext(0);
}

// ====== Buttons ======
playOnceBtn.addEventListener("click", playOnceSync);
btnMatch.addEventListener("click", () => checkAnswer(true));
btnNoMatch.addEventListener("click", () => checkAnswer(false));

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
    lockPlayersForGame();
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
  });
