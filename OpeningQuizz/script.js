/**********************
 * Guess The Opening — version “anti-bug audio” + timer basé sur le temps média
 * ✅ Ajouts:
 *  - Token d’annulation (anti race-condition) quand on change de round / retry
 *  - Retries (0s, +3s, +10s) avec cache-bust ?t=...
 *  - Détection de “stall” (chargement infini sans onerror) => retry
 *  - On charge 1 seule fois par round (plus stable), puis on seek (Début/Refrain/Complet)
 *  - Limite 15s basée sur currentTime (pas setTimeout) => pas de “15s mangées” pendant le buffering
 *  - Petit status “Chargement…” injecté en JS (sans modifier le HTML)
 **********************/

const MAX_SCORE = 3000;

// scoring
const SCORE_TRY1 = 3000;
const SCORE_TRY2 = 2000;
const SCORE_TRY3 = 1500;
const SCORE_TRY3_WITH_6 = 1000;
const SCORE_TRY3_WITH_3 = 500;

const MIN_REQUIRED_SONGS = 64;

// retries like Tournament
const RETRY_DELAYS = [0, 3000, 10000];
const STALL_TIMEOUT_MS = 8000; // si au bout de 8s pas prêt => retry

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
  const parts = s.split(/\s+/);
  const y = parseInt(parts[1] || parts[0] || "0", 10);
  return Number.isFinite(y) ? y : 0;
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

function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

// ====== Songs extraction (structure: anime.song.openings/endings/inserts) ======
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
const audioPlayer = document.getElementById("audioPlayer");

const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== Status (injecté, pas besoin de toucher le HTML) ======
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
  return mediaStatusEl;
}
function setMediaStatus(msg) {
  const el = ensureMediaStatusEl();
  if (!el) return;
  el.textContent = msg || "";
}

// ====== Data ======
let allAnimes = [];
let allSongs = [];
let filteredSongs = [];

// ====== Session (Rounds) ======
let totalRounds = 5;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentSong = null;
let tries = 0;
let failedAnswers = [];

let indice6Used = false;
let indice3Used = false;
let indiceActive = false;

const tryDurations = [15, 15, null]; // 3e écoute complète
let currentStart = 0;

// ✅ token anti “anciens callbacks”
let roundToken = 0;

// ====== WebM support (audio) ======
const CAN_PLAY_WEBM_AUDIO = (() => {
  const a = document.createElement("audio");
  if (!a.canPlayType) return false;
  const t1 = a.canPlayType('audio/webm; codecs="opus"');
  const t2 = a.canPlayType("audio/webm");
  const t3 = a.canPlayType("video/webm");
  return (t1 && t1 !== "") || (t2 && t2 !== "") || (t3 && t3 !== "");
})();

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

// ====== Segment limiter (coupe après X secondes de "temps média", pas temps réel) ======
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

function setSegmentLimit(startSeconds, durationSeconds) {
  clearSegmentLimiter();

  segmentLimiter.active = true;
  segmentLimiter.endTime = startSeconds + durationSeconds;

  const check = () => {
    if (audioPlayer.currentTime >= segmentLimiter.endTime - 0.06) {
      try { audioPlayer.pause(); } catch {}
      clearSegmentLimiter();
    }
  };

  segmentLimiter.handlerTimeUpdate = check;
  segmentLimiter.handlerSeeked = check;

  audioPlayer.addEventListener("timeupdate", segmentLimiter.handlerTimeUpdate);
  audioPlayer.addEventListener("seeked", segmentLimiter.handlerSeeked);
}

// ====== Filters ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song); // OP/ED/IN

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

  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    if (!CAN_PLAY_WEBM_AUDIO) {
      alert("⚠️ Ton navigateur ne supporte pas WebM (souvent Safari/iOS). Ce mini-jeu ne peut pas lire les openings.");
      return;
    }

    filteredSongs = applyFilters();
    if (filteredSongs.length < MIN_REQUIRED_SONGS) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "5", 10), 1, 50);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound(0);
  });

  syncLabels();
}

// ====== Playback helpers ======
let loaderTimers = { stall: null, delay: null };

function clearLoaderTimers() {
  if (loaderTimers.stall) clearTimeout(loaderTimers.stall);
  if (loaderTimers.delay) clearTimeout(loaderTimers.delay);
  loaderTimers.stall = null;
  loaderTimers.delay = null;
}

function hardResetAudioElement() {
  try { audioPlayer.pause(); } catch {}
  audioPlayer.removeAttribute("src");
  try { audioPlayer.load(); } catch {}
}

// ✅ stop: coupe limiter + pause
function stopPlayback() {
  clearSegmentLimiter();
  try { audioPlayer.pause(); } catch {}
}

// ✅ charge l’audio avec retries + anti-stall + cache-bust
function loadAudioWithRetries(url, token, onReady, onFail) {
  if (!url) {
    onFail?.("missing-url");
    return;
  }

  let attempt = 1;
  let ready = false;

  clearLoaderTimers();
  audioPlayer.oncanplay = null;
  audioPlayer.onloadedmetadata = null;
  audioPlayer.onerror = null;
  audioPlayer.onstalled = null;
  audioPlayer.onwaiting = null;

  const markReady = () => {
    if (token !== roundToken) return;
    if (ready) return;
    ready = true;
    clearLoaderTimers();
    setMediaStatus("");
    onReady?.();
  };

  const scheduleAttempt = (delayMs) => {
    clearLoaderTimers();
    loaderTimers.delay = setTimeout(() => {
      if (token !== roundToken) return;

      hardResetAudioElement();

      if (attempt === 1) setMediaStatus("⏳ Chargement…");
      else setMediaStatus(`🔄 Nouvelle tentative (${attempt}/3)…`);

      const finalUrl =
        attempt === 1 ? url : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();

      audioPlayer.preload = "auto";
      audioPlayer.src = finalUrl;
      try { audioPlayer.load(); } catch {}

      loaderTimers.stall = setTimeout(() => {
        if (token !== roundToken) return;
        if (ready) return;
        doRetry("stall");
      }, STALL_TIMEOUT_MS);
    }, delayMs);
  };

  const doRetry = (reason) => {
    if (token !== roundToken) return;
    if (ready) return;

    if (attempt === 1) {
      attempt = 2;
      scheduleAttempt(RETRY_DELAYS[1]);
    } else if (attempt === 2) {
      attempt = 3;
      scheduleAttempt(RETRY_DELAYS[2]);
    } else {
      clearLoaderTimers();
      setMediaStatus("❌ Media indisponible (serveur ou lien).");
      onFail?.(reason || "error");
    }
  };

  audioPlayer.onwaiting = () => {
    if (token !== roundToken) return;
    if (!ready) setMediaStatus("⏳ Chargement…");
  };

  audioPlayer.onstalled = () => doRetry("stalled");
  audioPlayer.onerror = () => doRetry("error");

  audioPlayer.oncanplay = () => markReady();
  audioPlayer.onloadedmetadata = () => {
    if (token !== roundToken) return;
    // stall timer gère les cas “metadata ok mais pas playable”
  };

  scheduleAttempt(RETRY_DELAYS[0]);
}

// ====== Indices reset ======
function resetIndice() {
  indice6Used = false;
  indice3Used = false;
  indiceActive = false;

  indiceButtonsWrap.style.display = "none";
  btnIndice6.classList.remove("used");
  btnIndice3.classList.remove("used");
  btnIndice6.disabled = false;
  btnIndice3.disabled = false;

  const old = document.getElementById("indice-options-list");
  if (old) old.remove();
}

// ====== Round init/reset ======
function resetControls() {
  tries = 0;
  failedAnswers = [];
  failedAttemptsDiv.innerText = "";
  resultDiv.textContent = "";
  resultDiv.className = "";

  openingInput.value = "";
  openingInput.disabled = true;

  suggestionsDiv.innerHTML = "";

  playTry1Btn.disabled = true;
  playTry2Btn.disabled = true;
  playTry3Btn.disabled = true;

  nextBtn.style.display = "none";

  resetIndice();
  stopPlayback();

  playerWrapper.style.display = "none";
  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");

  updateScoreBar(3000);

  if (roundLabel) {
    roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
  }

  setMediaStatus("");
}

function startNewRound(pickTry = 0) {
  if (pickTry > 12) {
    alert("❌ Trop de liens indisponibles d'affilée. Essaie d’élargir tes filtres ou reviens plus tard.");
    showCustomization();
    return;
  }

  resetControls();

  currentSong = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
  if (!currentSong || !currentSong.url) {
    startNewRound(pickTry + 1);
    return;
  }

  roundToken++;
  const token = roundToken;

  loadAudioWithRetries(
    currentSong.url,
    token,
    () => {
      if (token !== roundToken) return;
      if (tries === 0) playTry1Btn.disabled = false;
      openingInput.disabled = true;
    },
    () => {
      if (token !== roundToken) return;
      startNewRound(pickTry + 1);
    }
  );
}

// ====== Playback / segments ======
function playSegment(tryNum) {
  if (!currentSong) return;

  if (tryNum !== tries + 1) {
    alert("Vous devez écouter les extraits dans l'ordre.");
    return;
  }

  if (!audioPlayer.src) {
    setMediaStatus("⏳ Chargement…");
    return;
  }

  tries = tryNum;
  updateScoreBar();
  openingInput.disabled = false;

  // indices uniquement à la 3e écoute
  if (tries === 3) {
    indiceButtonsWrap.style.display = "flex";
    indiceActive = true;
    btnIndice6.disabled = indice6Used || indice3Used;
    btnIndice3.disabled = indice6Used || indice3Used;
    btnIndice6.classList.toggle("used", indice6Used);
    btnIndice3.classList.toggle("used", indice3Used);
  } else {
    indiceButtonsWrap.style.display = "none";
    indiceActive = false;
    const old = document.getElementById("indice-options-list");
    if (old) old.remove();
  }

  // start times: refrain ~50s
  currentStart = 0;
  if (tries === 2) currentStart = 50;
  if (tries === 3) currentStart = 0;

  // player caché pendant la partie
  playerWrapper.style.display = "none";
  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");

  stopPlayback();

  // seek sans changer src
  try { audioPlayer.currentTime = currentStart; } catch {}

  applyVolume();

  // ✅ Limite basée sur le temps média (donc pas mangée par le buffering)
  const duration = tryDurations[tries - 1];
  if (duration != null) setSegmentLimit(currentStart, duration);
  else clearSegmentLimiter();

  audioPlayer.play().catch(() => {
    setMediaStatus("❌ Impossible de lire ce média.");
    resultDiv.textContent = "❌ Impossible de lire cette vidéo/audio.";
    resultDiv.className = "incorrect";
  });

  // ✅ états des boutons (Début reste grisé après)
  playTry1Btn.disabled = true;
  playTry2Btn.disabled = tries !== 1;
  playTry3Btn.disabled = tries !== 2;
}

// ====== Indices (3e écoute) ======
btnIndice6.addEventListener("click", () => {
  if (indice6Used || indice3Used || !indiceActive) return;
  indice6Used = true;
  indiceActive = false;
  btnIndice6.classList.add("used");
  btnIndice3.disabled = true;
  showIndiceOptions(6);
  updateScoreBar();
});

btnIndice3.addEventListener("click", () => {
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

  document.getElementById("container").appendChild(list);
}

// ====== Guess logic ======
function updateFailedAttempts() {
  failedAttemptsDiv.innerText = failedAnswers.map((e) => `❌ ${e}`).join("\n");
}

function finalScore() {
  if (tries === 1) return SCORE_TRY1;
  if (tries === 2) return SCORE_TRY2;
  if (tries === 3 && indice3Used) return SCORE_TRY3_WITH_3;
  if (tries === 3 && indice6Used) return SCORE_TRY3_WITH_6;
  if (tries === 3) return SCORE_TRY3;
  return 0;
}

function revealSongAndPlayer() {
  playerWrapper.style.display = "block";
  audioPlayer.controls = true;
  audioPlayer.setAttribute("controls", "controls");
}

function endRoundAndMaybeNext(roundScore, won) {
  totalScore += roundScore;

  if (currentRound >= totalRounds) {
    const msg = "✅ Série terminée !";
    resultDiv.innerHTML += `<div style="margin-top:10px; font-weight:900; opacity:0.95;">${msg}<br>Score total : <b>${totalScore}</b> / <b>${totalRounds * 3000}</b></div>`;

    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      stopPlayback();
      playerWrapper.style.display = "none";
      openingInput.value = "";
      suggestionsDiv.innerHTML = "";
      resultDiv.textContent = "";
      failedAttemptsDiv.textContent = "";
      setMediaStatus("");
    };
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Round suivant";
  nextBtn.onclick = () => {
    currentRound += 1;
    startNewRound(0);
  };
}

function blockInputsAll() {
  openingInput.disabled = true;
  playTry1Btn.disabled = true;
  playTry2Btn.disabled = true;
  playTry3Btn.disabled = true;
  suggestionsDiv.innerHTML = "";
  indiceButtonsWrap.style.display = "none";
  const old = document.getElementById("indice-options-list");
  if (old) old.remove();
}

function checkAnswer(selectedTitle) {
  if (!currentSong) return;

  const inputVal = selectedTitle.trim().toLowerCase();
  const good = inputVal === currentSong.animeTitleLower;

  if (good) {
    const score = finalScore();
    resultDiv.innerHTML = `🎉 Bravo !<br><b>${currentSong.animeTitle}</b><br><em>${formatRevealLine(currentSong)}</em><br><span style="font-size:1.05em;">Score : <b>${score}</b> / 3000</span>`;
    resultDiv.className = "correct";

    stopPlayback();
    revealSongAndPlayer();
    launchFireworks();

    blockInputsAll();
    updateScoreBar(score);

    endRoundAndMaybeNext(score, true);
    return;
  }

  failedAnswers.push(selectedTitle);
  updateFailedAttempts();

  if (tries >= 3) {
    resultDiv.innerHTML = `🔔 Réponse : <b>${currentSong.animeTitle}</b><br><em>${formatRevealLine(currentSong)}</em>`;
    resultDiv.className = "incorrect";

    stopPlayback();
    revealSongAndPlayer();

    blockInputsAll();
    updateScoreBar(0);

    endRoundAndMaybeNext(0, false);
  } else {
    openingInput.disabled = true;
  }
}

// ====== Autocomplete ======
openingInput.addEventListener("input", function () {
  if (openingInput.disabled) return;
  const val = this.value.toLowerCase().trim();
  suggestionsDiv.innerHTML = "";
  if (!val) return;

  const uniqueTitles = [...new Set(filteredSongs.map((s) => s.animeTitle))];
  const matches = uniqueTitles.filter((t) => t.toLowerCase().includes(val));
  shuffleInPlace(matches);

  matches.slice(0, 6).forEach((title) => {
    const div = document.createElement("div");
    div.textContent = title;
    div.onclick = () => {
      openingInput.value = title;
      suggestionsDiv.innerHTML = "";
      checkAnswer(title);
      openingInput.value = "";
    };
    suggestionsDiv.appendChild(div);
  });
});

openingInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !openingInput.disabled) {
    const val = openingInput.value.trim();
    if (!val) return;
    checkAnswer(val);
    suggestionsDiv.innerHTML = "";
    openingInput.value = "";
  }
});

document.addEventListener("click", (e) => {
  if (e.target !== openingInput) suggestionsDiv.innerHTML = "";
});

// ====== Buttons ======
playTry1Btn.addEventListener("click", () => playSegment(1));
playTry2Btn.addEventListener("click", () => playSegment(2));
playTry3Btn.addEventListener("click", () => playSegment(3));

// ====== Tooltip ======
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
  .then((r) => r.json())
  .then((data) => {
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
    for (const a of allAnimes) {
      allSongs.push(...extractSongsFromAnime(a));
    }

    initCustomUI();
    updatePreview();
    showCustomization();
    applyVolume();

    if (!CAN_PLAY_WEBM_AUDIO) {
      previewCountEl.textContent = "⚠️ WebM non supporté sur ce navigateur (Safari/iOS).";
      previewCountEl.classList.add("bad");
      applyBtn.disabled = true;
    }
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
