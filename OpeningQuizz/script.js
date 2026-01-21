/**********************
 * Guess The Opening — version “anti-bug audio”
 * + timer basé sur le temps média (pas sur un setTimeout)
 **********************/

const MAX_SCORE = 3000;

// scoring
const SCORE_TRY1 = 3000;
const SCORE_TRY2 = 2000;
const SCORE_TRY3 = 1500;
const SCORE_TRY3_WITH_6 = 1000;
const SCORE_TRY3_WITH_3 = 500;

const MIN_REQUIRED_SONGS = 64;

// ✅ retries (tu as mis 6000)
const RETRY_DELAYS = [0, 2000, 6000];
const STALL_TIMEOUT_MS = 6000;

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
function getDisplayTitle(a) {
  return (
    a?.title_english ||
    a?.title_mal_default ||
    a?.title_original ||
    a?.title ||
    (a?.animethemes && a.animethemes.name) ||
    "Titre inconnu"
  );
}

function getYear(a) {
  const s = String(a?.season || "").trim(); // ex: "spring 2013"
  const parts = s.split(/\s+/);
  const y = parseInt(parts[1] || parts[0] || "0", 10);
  return Number.isFinite(y) ? y : 0;
}

function clampYearSliders() {
  const minEl = document.getElementById("yearMin");
  const maxEl = document.getElementById("yearMax");
  if (!minEl || !maxEl) return;

  let a = parseInt(minEl.value, 10);
  let b = parseInt(maxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    minEl.value = String(a);
    maxEl.value = String(b);
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

function buildAttemptUrl(url, attempt) {
  if (attempt === 1) return url;
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "cb=" + Date.now() + "_" + attempt;
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
const audioPlayer = document.getElementById("audioPlayer");

const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== Status injecté ======
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
let totalRounds = 1; // ✅ default 1
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

let roundToken = 0; // change à chaque round
let playToken = 0;  // change à chaque playSegment()

// ====== WebM support ======
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
  if (forceScore !== null) score = forceScore;
  else {
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
volumeSlider?.addEventListener("input", applyVolume);

// ====== Segment limiter (temps média) ======
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

function startSegmentLimiter(endTime, token) {
  clearSegmentLimiter();
  segmentLimiter.active = true;
  segmentLimiter.endTime = endTime;

  segmentLimiter.handlerTimeUpdate = () => {
    if (token !== playToken) return;
    if (!audioPlayer) return;
    if (audioPlayer.currentTime >= segmentLimiter.endTime) {
      audioPlayer.pause();
      try { audioPlayer.currentTime = segmentLimiter.endTime; } catch {}
      clearSegmentLimiter();
    }
  };

  segmentLimiter.handlerSeeked = () => {
    if (token !== playToken) return;
    if (!audioPlayer) return;
    if (audioPlayer.currentTime > segmentLimiter.endTime) {
      try { audioPlayer.currentTime = segmentLimiter.endTime; } catch {}
      audioPlayer.pause();
      clearSegmentLimiter();
    }
  };

  audioPlayer.addEventListener("timeupdate", segmentLimiter.handlerTimeUpdate);
  audioPlayer.addEventListener("seeked", segmentLimiter.handlerSeeked);
}

// ====== Anti-bug load / retries ======
function hardResetAudio() {
  if (!audioPlayer) return;
  try { audioPlayer.pause(); } catch {}
  clearSegmentLimiter();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
}

function waitForEventOnce(el, eventName, tokenCheckFn) {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("media_error"));
    };
    const cleanup = () => {
      el.removeEventListener(eventName, onOk);
      el.removeEventListener("error", onErr);
    };

    el.addEventListener(eventName, () => {
      if (tokenCheckFn && !tokenCheckFn()) return;
      onOk();
    }, { once: true });

    el.addEventListener("error", () => {
      if (tokenCheckFn && !tokenCheckFn()) return;
      onErr();
    }, { once: true });
  });
}

function waitTimeout(ms, tokenCheckFn) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      if (tokenCheckFn && !tokenCheckFn()) return;
      reject(new Error("timeout"));
    }, ms);
  });
}

async function loadAudioWithRetries(url, startTime, tokenLocal) {
  if (!audioPlayer) throw new Error("no_audio");
  if (!url) throw new Error("no_url");

  if (!CAN_PLAY_WEBM_AUDIO) {
    throw new Error("webm_not_supported");
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (tokenLocal !== playToken) throw new Error("cancelled");

    const delay = RETRY_DELAYS[attempt - 1] ?? 0;
    if (delay > 0) {
      setMediaStatus(`🔄 Nouvelle tentative (${attempt}/3)…`);
      await new Promise((r) => setTimeout(r, delay));
      if (tokenLocal !== playToken) throw new Error("cancelled");
    } else {
      setMediaStatus("⏳ Chargement…");
    }

    hardResetAudio();
    const attemptUrl = buildAttemptUrl(url, attempt);
    audioPlayer.preload = "auto";
    audioPlayer.src = attemptUrl;
    audioPlayer.load();

    try {
      // on attend au minimum "loadedmetadata" puis "canplay"
      await Promise.race([
        waitForEventOnce(audioPlayer, "loadedmetadata", () => tokenLocal === playToken),
        waitTimeout(STALL_TIMEOUT_MS, () => tokenLocal === playToken),
      ]);

      if (tokenLocal !== playToken) throw new Error("cancelled");

      // set start time après metadata
      try { audioPlayer.currentTime = startTime; } catch {}

      await Promise.race([
        waitForEventOnce(audioPlayer, "canplay", () => tokenLocal === playToken),
        waitTimeout(STALL_TIMEOUT_MS, () => tokenLocal === playToken),
      ]);

      if (tokenLocal !== playToken) throw new Error("cancelled");

      setMediaStatus("");
      return; // ✅ ok
    } catch (e) {
      // essaye suivant
      if (attempt === 3) throw e;
    }
  }
}

// ====== Buttons state ======
function updateListenButtons() {
  // Début: grisé dès qu'on est >= 1
  if (playTry1Btn) playTry1Btn.disabled = tries >= 1;
  // Refrain: dispo seulement si tries === 1
  if (playTry2Btn) playTry2Btn.disabled = tries !== 1;
  // Complet: dispo seulement si tries === 2
  if (playTry3Btn) playTry3Btn.disabled = tries !== 2;
}

// ====== Playback ======
function stopPlayback() {
  clearSegmentLimiter();
  try { audioPlayer.pause(); } catch {}
}

async function playSegment(tryNum) {
  if (!currentSong) return;

  if (tryNum !== tries + 1) {
    alert("Vous devez écouter les extraits dans l'ordre.");
    return;
  }

  // nouvelle session de play
  playToken++;

  tries = tryNum;
  updateScoreBar();

  // indices uniquement à la 3e écoute
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
    document.getElementById("indice-options-list")?.remove();
  }

  // start times: refrain ~50s
  currentStart = 0;
  if (tries === 2) currentStart = 50;
  if (tries === 3) currentStart = 0;

  // player caché pendant la partie
  if (playerWrapper) playerWrapper.style.display = "none";
  if (audioPlayer) {
    audioPlayer.controls = false;
    audioPlayer.removeAttribute("controls");
  }

  stopPlayback();

  // lock buttons pendant chargement
  if (playTry1Btn) playTry1Btn.disabled = true;
  if (playTry2Btn) playTry2Btn.disabled = true;
  if (playTry3Btn) playTry3Btn.disabled = true;

  const local = playToken;

  try {
    await loadAudioWithRetries(currentSong.url, currentStart, local);
    if (local !== playToken) return;

    applyVolume();

    // lance la lecture
    try {
      await audioPlayer.play();
    } catch {
      throw new Error("play_failed");
    }

    // ✅ limiter basé sur le temps média
    const duration = tryDurations[tries - 1];
    if (duration != null) {
      const endTime = currentStart + duration;
      startSegmentLimiter(endTime, local);
    }

    // input dispo après 1ère écoute
    if (openingInput) openingInput.disabled = false;

    // ✅ met à jour l’état des boutons (Début reste grisé)
    updateListenButtons();
  } catch (e) {
    console.error(e);
    if (!CAN_PLAY_WEBM_AUDIO) {
      setMediaStatus("⚠️ WebM audio non supporté sur ce navigateur (Safari/iOS).");
    } else {
      setMediaStatus("❌ Impossible de charger ce son. Essaie un autre round.");
    }
    if (resultDiv) {
      resultDiv.textContent = "❌ Impossible de lire cette vidéo/audio.";
      resultDiv.className = "incorrect";
    }
  }
}

// ====== Indices (3e écoute) ======
btnIndice6?.addEventListener("click", () => {
  if (indice6Used || indice3Used || !indiceActive) return;
  indice6Used = true;
  indiceActive = false;
  btnIndice6.classList.add("used");
  if (btnIndice3) btnIndice3.disabled = true;
  showIndiceOptions(6);
  updateScoreBar();
});

btnIndice3?.addEventListener("click", () => {
  if (indice6Used || indice3Used || !indiceActive) return;
  indice3Used = true;
  indiceActive = false;
  btnIndice3.classList.add("used");
  if (btnIndice6) btnIndice6.disabled = true;
  showIndiceOptions(3);
  updateScoreBar();
});

function showIndiceOptions(nb) {
  document.getElementById("indice-options-list")?.remove();

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
      if (openingInput) openingInput.value = "";
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

  document.getElementById("indice-options-list")?.remove();
}

// ====== Round init/reset ======
function resetControls() {
  tries = 0;
  failedAnswers = [];
  if (failedAttemptsDiv) failedAttemptsDiv.innerText = "";
  if (resultDiv) { resultDiv.textContent = ""; resultDiv.className = ""; }
  setMediaStatus("");

  if (openingInput) {
    openingInput.value = "";
    openingInput.disabled = true;
  }
  if (suggestionsDiv) suggestionsDiv.innerHTML = "";

  if (nextBtn) nextBtn.style.display = "none";

  resetIndice();
  stopPlayback();

  if (playerWrapper) playerWrapper.style.display = "none";
  if (audioPlayer) {
    audioPlayer.controls = false;
    audioPlayer.removeAttribute("controls");
  }

  updateScoreBar(3000);

  // label round
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  // boutons écoute (début activé après préchargement)
  if (playTry1Btn) playTry1Btn.disabled = true;
  if (playTry2Btn) playTry2Btn.disabled = true;
  if (playTry3Btn) playTry3Btn.disabled = true;
}

async function preloadCurrentSong(tokenLocal) {
  if (!currentSong || !audioPlayer) return false;

  // petit préchargement (metadata)
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (tokenLocal !== roundToken) return false;

    const delay = RETRY_DELAYS[attempt - 1] ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (tokenLocal !== roundToken) return false;

    setMediaStatus(attempt === 1 ? "⏳ Préchargement…" : `🔄 Préchargement (${attempt}/3)…`);

    hardResetAudio();
    audioPlayer.preload = "metadata";
    audioPlayer.src = buildAttemptUrl(currentSong.url, attempt);
    audioPlayer.load();

    try {
      await Promise.race([
        waitForEventOnce(audioPlayer, "loadedmetadata", () => tokenLocal === roundToken),
        waitTimeout(STALL_TIMEOUT_MS, () => tokenLocal === roundToken),
      ]);
      if (tokenLocal !== roundToken) return false;

      setMediaStatus("");
      return true;
    } catch (e) {
      if (attempt === 3) return false;
    }
  }
  return false;
}

async function startNewRound() {
  roundToken++;
  playToken++; // annule les plays en cours
  resetControls();

  currentSong = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
  applyVolume();

  // précharge metadata, sinon on relance un autre son
  const ok = await preloadCurrentSong(roundToken);
  if (!ok) {
    // si ça fail, on tente un autre round
    return startNewRound();
  }

  // une fois préchargé, on active le bouton Début
  if (playTry1Btn) playTry1Btn.disabled = false;
}

// ====== Guess logic ======
function updateFailedAttempts() {
  if (!failedAttemptsDiv) return;
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
  if (!playerWrapper || !audioPlayer) return;
  playerWrapper.style.display = "block";
  audioPlayer.controls = true;
  audioPlayer.setAttribute("controls", "controls");
}

function endRoundAndMaybeNext(roundScore) {
  totalScore += roundScore;

  if (currentRound >= totalRounds) {
    if (resultDiv) {
      resultDiv.innerHTML += `<div style="margin-top:10px; font-weight:900; opacity:0.95;">
        ✅ Série terminée !<br>
        Score total : <b>${totalScore}</b> / <b>${totalRounds * 3000}</b>
      </div>`;
    }

    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => {
        showCustomization();
        stopPlayback();
        if (playerWrapper) playerWrapper.style.display = "none";
        if (openingInput) openingInput.value = "";
        if (suggestionsDiv) suggestionsDiv.innerHTML = "";
        if (resultDiv) resultDiv.textContent = "";
        if (failedAttemptsDiv) failedAttemptsDiv.textContent = "";
      };
    }
    return;
  }

  if (nextBtn) {
    nextBtn.style.display = "block";
    nextBtn.textContent = "Round suivant";
    nextBtn.onclick = () => {
      currentRound += 1;
      startNewRound();
    };
  }
}

function blockInputsAll() {
  if (openingInput) openingInput.disabled = true;
  if (suggestionsDiv) suggestionsDiv.innerHTML = "";
  if (indiceButtonsWrap) indiceButtonsWrap.style.display = "none";
  document.getElementById("indice-options-list")?.remove();

  if (playTry1Btn) playTry1Btn.disabled = true;
  if (playTry2Btn) playTry2Btn.disabled = true;
  if (playTry3Btn) playTry3Btn.disabled = true;
}

function checkAnswer(selectedTitle) {
  if (!currentSong) return;

  const inputVal = selectedTitle.trim().toLowerCase();
  const good = inputVal === currentSong.animeTitleLower;

  if (good) {
    const score = finalScore();
    if (resultDiv) {
      resultDiv.innerHTML = `🎉 Bravo !<br><b>${currentSong.animeTitle}</b><br>
        <em>${formatRevealLine(currentSong)}</em><br>
        <span style="font-size:1.05em;">Score : <b>${score}</b> / 3000</span>`;
      resultDiv.className = "correct";
    }

    stopPlayback();
    revealSongAndPlayer();
    launchFireworks();

    blockInputsAll();
    updateScoreBar(score);

    endRoundAndMaybeNext(score);
    return;
  }

  failedAnswers.push(selectedTitle);
  updateFailedAttempts();

  if (tries >= 3) {
    if (resultDiv) {
      resultDiv.innerHTML = `🔔 Réponse : <b>${currentSong.animeTitle}</b><br><em>${formatRevealLine(currentSong)}</em>`;
      resultDiv.className = "incorrect";
    }

    stopPlayback();
    revealSongAndPlayer();

    blockInputsAll();
    updateScoreBar(0);

    endRoundAndMaybeNext(0);
  } else {
    // doit écouter le segment suivant avant de retenter
    if (openingInput) openingInput.disabled = true;
    updateListenButtons();
  }
}

// ====== Autocomplete ======
openingInput?.addEventListener("input", function () {
  if (openingInput.disabled) return;
  const val = this.value.toLowerCase().trim();
  if (!suggestionsDiv) return;

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

// ====== Filters ======
function applyFilters() {
  if (!popEl || !scoreEl || !yearMinEl || !yearMaxEl) return [];

  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song); // OP/ED/IN

  if (allowedTypes.length === 0 || allowedSongs.length === 0) return [];

  // 1) filtre year/type + songType
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

function updatePreview() {
  const pool = applyFilters();
  const ok = pool.length >= MIN_REQUIRED_SONGS;

  if (previewCountEl) {
    previewCountEl.textContent = ok
      ? `🎵 Songs disponibles : ${pool.length} (OK)`
      : `🎵 Songs disponibles : ${pool.length} (Min ${MIN_REQUIRED_SONGS})`;
    previewCountEl.classList.toggle("good", ok);
    previewCountEl.classList.toggle("bad", !ok);
  }

  if (applyBtn) {
    applyBtn.disabled = !ok;
    applyBtn.classList.toggle("disabled", !ok);
  }
}

function initCustomUI() {
  function syncLabels() {
    clampYearSliders();
    if (popValEl && popEl) popValEl.textContent = popEl.value;
    if (scoreValEl && scoreEl) scoreValEl.textContent = scoreEl.value;
    if (yearMinValEl && yearMinEl) yearMinValEl.textContent = yearMinEl.value;
    if (yearMaxValEl && yearMaxEl) yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el?.addEventListener("input", syncLabels));

  // type pills (assure au moins 1 actif)
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

  // song pills (assure au moins 1 actif)
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

  applyBtn?.addEventListener("click", () => {
    filteredSongs = applyFilters();
    if (filteredSongs.length < MIN_REQUIRED_SONGS) return;

    // ✅ 1..100
    totalRounds = clampInt(parseInt(roundCountEl?.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Load dataset (robuste) ======
(async function loadDataset() {
  try {
    if (previewCountEl) previewCountEl.textContent = "⌛ Chargement de la base…";

    // si ouvert en file:// → fetch bloqué
    if (location.protocol === "file:") {
      throw new Error("Tu ouvres la page en file:// (fetch JSON bloqué). Lance un serveur local.");
    }

    const r = await fetch("../data/licenses_only.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ../data/licenses_only.json`);

    const data = await r.json();
    const list = Array.isArray(data) ? data : (Array.isArray(data?.animes) ? data.animes : []);
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("Dataset vide ou format inattendu (attendu: [] ou {animes:[]}).");
    }

    allAnimes = list.map((a) => {
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
  } catch (e) {
    console.error(e);
    if (previewCountEl) {
      previewCountEl.textContent = `❌ Base non chargée : ${e.message}`;
      previewCountEl.classList.remove("good");
      previewCountEl.classList.add("bad");
    }
    if (applyBtn) applyBtn.disabled = true;
  }
})();
