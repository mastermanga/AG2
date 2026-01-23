// script.js
/**********************
 * Fake Or Truth — Anti-bug media (A pinned) + Sync improvements
 * ✅ Start à 1s (au lieu de 0) + 20s
 * ✅ 6 tentatives: 0,2,4,6,8,10s
 * ✅ Soft buffer gating: ne re-télécharge plus A “pour rien”
 * ✅ Warmup muet + start muted + wait advance + snap sync + audio unmute
 * ✅ Reveal: vidéo A avec le bon audio (A), depuis 0s
 * ✅ Score: 1000 points / round
 **********************/

const MAX_SCORE = 1000;
const MIN_REQUIRED_SONGS = 64;

// ✅ START À 1s
const LISTEN_START = 1;
const LISTEN_DURATION = 20;

// ✅ 6 tentatives
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];

const LOAD_TIMEOUT_MS = 16000;
const SEEK_TIMEOUT_MS = 8000;

// buffer gating adaptatif
const BUFFER_AHEAD_PRIMARY = 1.2;
const BUFFER_AHEAD_FALLBACK = 0.7;
const BUFFER_AHEAD_DROP_AFTER = 2;

// si un navigateur buffer bizarrement près de 0 (moins utile à 1s, mais safe)
const START_BUFFER_TOLERANCE_SEC = 0.95;

const BUFFER_WAIT_MS = 6500;

// warmup
const WARMUP_SEC = 0.25;
const WARMUP_TIMEOUT_MS = 1400;

const MIN_SYNC_DELAY_MS = 450;

// start gating (progress)
const START_ADVANCE_DELTA = 0.10;
const START_ADVANCE_TIMEOUT_MS = 3800;

// stall
const STALL_TIMEOUT_MS = 14000;
const STALL_POLL_MS = 500;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

// buffer check
function isTimeBuffered(el, t, ahead = 0.25) {
  try {
    const b = el.buffered;
    const tol = (t <= 0.05) ? START_BUFFER_TOLERANCE_SEC : 0.25;
    for (let i = 0; i < b.length; i++) {
      const s = b.start(i);
      const e = b.end(i);
      if (s <= (t + tol) && e >= (t + ahead)) return true;
    }
  } catch {}
  return false;
}

async function waitBufferAhead(el, baseT, aheadSec, maxWaitMs, localToken) {
  const end = performance.now() + maxWaitMs;
  while (performance.now() < end) {
    if (localToken !== roundToken) return false;
    if (el.readyState >= 3 && isTimeBuffered(el, baseT, aheadSec)) return true;
    await delay(120);
  }
  return el.readyState >= 3 && isTimeBuffered(el, baseT, Math.min(0.20, aheadSec));
}

function computeAhead() {
  const severity = Math.max(pinnedA.attempt, pinnedB.attempt);
  return severity >= BUFFER_AHEAD_DROP_AFTER ? BUFFER_AHEAD_FALLBACK : BUFFER_AHEAD_PRIMARY;
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

const roundLabel = document.getElementById("roundLabel");
const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

const mediaStatusEl = document.getElementById("mediaStatus");
const containerEl = document.getElementById("container");

const videoPlayer = document.getElementById("videoPlayer");
const audioPlayer = document.getElementById("audioPlayer");

const btnTruth = document.getElementById("btnTruth");
const btnFake = document.getElementById("btnFake");

const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

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

// ====== Session ======
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let videoSong = null; // A
let audioSong = null; // B
let isMatch = false;

let roundToken = 0;

let pinnedA = { ok: false, attempt: 0, url: "" };
let pinnedB = { ok: false, attempt: 0, url: "" };

// ====== Status ======
function setMediaStatus(msg) {
  mediaStatusEl.textContent = msg || "";
}

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
  if (score >= MAX_SCORE * 0.85) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= MAX_SCORE * 0.6) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score > 0) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
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

// ====== Volume ======
function applyVolume() {
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "50", 10)));
  audioPlayer.volume = v / 100;
  volumeVal.textContent = `${v}%`;
}
volumeSlider.addEventListener("input", applyVolume);

// ====== Media primitives ======
function hardReset(el) {
  try { el.pause(); } catch {}
  el.removeAttribute("src");
  el.load();
}
function stopPlayback() {
  try { videoPlayer.pause(); } catch {}
  try { audioPlayer.pause(); } catch {}
}
function lockForRound() {
  videoPlayer.muted = true;
  videoPlayer.controls = false;
  videoPlayer.removeAttribute("controls");

  audioPlayer.muted = false;
  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");
  audioPlayer.style.display = "none";

  applyVolume();
}

// ✅ Reveal: vidéo A + audio A depuis 0s
function revealVideoAWithAudio() {
  stopPlayback();
  // coupe l'audio B
  try { audioPlayer.removeAttribute("src"); audioPlayer.load(); } catch {}

  videoPlayer.muted = false;
  videoPlayer.controls = true;
  videoPlayer.setAttribute("controls", "controls");

  try { videoPlayer.currentTime = 0; } catch {}
}

// ====== waitEvent ======
function waitEvent(el, okEvent, badEvents, timeoutMs, localToken) {
  return new Promise((resolve, reject) => {
    let timer = null;

    const cleanup = () => {
      el.removeEventListener(okEvent, onOk);
      badEvents.forEach((ev) => el.removeEventListener(ev, onBad));
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const valid = () => localToken === roundToken;

    const onOk = () => {
      if (!valid()) return;
      cleanup();
      resolve(true);
    };

    const onBad = () => {
      if (!valid()) return;
      cleanup();
      reject(new Error("media-error"));
    };

    el.addEventListener(okEvent, onOk, { once: true });
    badEvents.forEach((ev) => el.addEventListener(ev, onBad, { once: true }));

    timer = setTimeout(() => {
      if (!valid()) return;
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
}

// ====== Warmup muet ======
async function warmupPlayMuted(el, localToken) {
  if (localToken !== roundToken) return false;

  const prevMuted = el.muted;
  const prevRate = el.playbackRate;

  try {
    el.muted = true;
    el.playbackRate = 1.0;

    const p = el.play();
    if (p && typeof p.then === "function") await p;

    const target = (LISTEN_START || 0) + WARMUP_SEC;
    const end = performance.now() + WARMUP_TIMEOUT_MS;

    while (performance.now() < end) {
      if (localToken !== roundToken) return false;
      if ((el.currentTime || 0) >= target) break;
      await delay(50);
    }

    try { el.pause(); } catch {}
    try { el.currentTime = LISTEN_START; } catch {}
    return true;
  } catch {
    try { el.pause(); } catch {}
    try { el.currentTime = LISTEN_START; } catch {}
    return false;
  } finally {
    el.muted = prevMuted;
    el.playbackRate = prevRate;
  }
}

// ====== Seek & pin ======
async function ensurePinnedAt(el, t, localToken) {
  if (localToken !== roundToken) return false;

  if (el.readyState >= 3 && isTimeBuffered(el, t, 0.20)) {
    try { el.pause(); } catch {}
    return true;
  }

  try { el.currentTime = t; } catch {}

  try {
    await waitEvent(el, "seeked", ["error"], Math.min(2500, SEEK_TIMEOUT_MS), localToken);
  } catch {}

  if (localToken !== roundToken) return false;

  if (el.readyState >= 3 && isTimeBuffered(el, t, 0.12)) {
    try { el.pause(); } catch {}
    return true;
  }

  try {
    await waitEvent(el, "canplay", ["error"], SEEK_TIMEOUT_MS, localToken);
  } catch {
    return false;
  }

  if (localToken !== roundToken) return false;
  try { el.pause(); } catch {}
  return el.readyState >= 3;
}

async function loadMeta(el, url, attempt, label, localToken) {
  if (localToken !== roundToken) return false;

  hardReset(el);
  const src = attempt === 0 ? url : withCacheBuster(url);

  el.preload = "auto";
  el.src = src;
  el.load();

  setMediaStatus(`⏳ Chargement ${label} (${attempt + 1}/${RETRY_DELAYS.length})…`);
  try {
    await waitEvent(el, "loadedmetadata", ["error"], LOAD_TIMEOUT_MS, localToken);
    return localToken === roundToken;
  } catch {
    return false;
  }
}

async function loadAndPin(el, url, attempt, label, localToken) {
  const okMeta = await loadMeta(el, url, attempt, label, localToken);
  if (!okMeta || localToken !== roundToken) return false;

  const okPin = await ensurePinnedAt(el, LISTEN_START, localToken);
  if (!okPin || localToken !== roundToken) return false;

  await warmupPlayMuted(el, localToken);
  try { el.pause(); } catch {}
  return true;
}

// ====== buffer gating SOFT ======
async function ensureBufferReady(el, label, localToken) {
  if (localToken !== roundToken) return false;

  const ahead1 = computeAhead();
  let ok = await waitBufferAhead(el, LISTEN_START, ahead1, BUFFER_WAIT_MS, localToken);
  if (localToken !== roundToken) return false;
  if (ok) return true;

  ok = await waitBufferAhead(el, LISTEN_START, BUFFER_AHEAD_FALLBACK, BUFFER_WAIT_MS, localToken);
  if (localToken !== roundToken) return false;
  if (ok) return true;

  setMediaStatus(`🔄 Rebuffer ${label}…`);
  const repin = await ensurePinnedAt(el, LISTEN_START, localToken);
  if (localToken !== roundToken) return false;
  if (!repin) return false;

  await warmupPlayMuted(el, localToken);
  ok = await waitBufferAhead(el, LISTEN_START, BUFFER_AHEAD_FALLBACK, BUFFER_WAIT_MS, localToken);
  if (localToken !== roundToken) return false;
  return ok;
}

// ====== Segment + Stall watchdog ======
let segmentActive = false;
let segmentEnd = 0;
let stallWatchId = null;
let endCheckId = null;

let lastProgressT = 0;
let lastProgressWall = 0;

function clearSegment() {
  segmentActive = false;
  segmentEnd = 0;

  if (stallWatchId) clearInterval(stallWatchId);
  stallWatchId = null;

  if (endCheckId) clearInterval(endCheckId);
  endCheckId = null;
}

function handleStall(localToken) {
  if (localToken !== roundToken) return;
  if (!segmentActive) return;

  stopPlayback();
  clearSegment();

  const aBad = videoPlayer.readyState < 3 || !isTimeBuffered(videoPlayer, videoPlayer.currentTime || 0, 0.10);
  const bBad = audioPlayer.readyState < 3 || !isTimeBuffered(audioPlayer, audioPlayer.currentTime || 0, 0.10);

  if (bBad && !aBad) {
    pinnedB.ok = false;
    pinnedB.attempt = Math.min(pinnedB.attempt + 1, RETRY_DELAYS.length);
    setMediaStatus("⏳ Buffer trop long… relance audio.");
  } else if (aBad && !bBad) {
    pinnedA.ok = false;
    pinnedA.attempt = Math.min(pinnedA.attempt + 1, RETRY_DELAYS.length);
    setMediaStatus("⏳ Buffer trop long… relance vidéo.");
  } else {
    pinnedB.ok = false;
    pinnedB.attempt = Math.min(pinnedB.attempt + 1, RETRY_DELAYS.length);
    setMediaStatus("⏳ Buffer trop long… relance audio.");
  }

  autoStartPinned(localToken);
}

function armSegment(localToken) {
  clearSegment();
  segmentActive = true;
  segmentEnd = LISTEN_START + LISTEN_DURATION;

  lastProgressT = Math.max(videoPlayer.currentTime || 0, audioPlayer.currentTime || 0);
  lastProgressWall = performance.now();

  stallWatchId = setInterval(() => {
    if (!segmentActive) return;
    if (localToken !== roundToken) return;

    const t = Math.max(videoPlayer.currentTime || 0, audioPlayer.currentTime || 0);
    const now = performance.now();

    if (t > lastProgressT + 0.08) {
      lastProgressT = t;
      lastProgressWall = now;
      return;
    }

    if (now - lastProgressWall > STALL_TIMEOUT_MS) {
      handleStall(localToken);
    }
  }, STALL_POLL_MS);

  endCheckId = setInterval(() => {
    if (!segmentActive) return;
    if (localToken !== roundToken) return;

    const t = Math.max(videoPlayer.currentTime || 0, audioPlayer.currentTime || 0);
    if (t >= segmentEnd - 0.05) {
      try { videoPlayer.pause(); } catch {}
      try { audioPlayer.pause(); } catch {}
      clearSegment();
      setMediaStatus("✅ À toi : Truth (match) ou Fake (pas match) ?");
      btnTruth.disabled = false;
      btnFake.disabled = false;
    }
  }, 120);
}

// ====== Pair selection (1/3 rules) ======
function pickDifferentAnimeSong(base) {
  for (let i = 0; i < 160; i++) {
    const cand = pickRandom(filteredSongs);
    if (!cand?.url) continue;
    if (cand.url === base.url) continue;
    if (cand.animeMalId && base.animeMalId && cand.animeMalId === base.animeMalId) continue;
    if (cand.animeTitleLower === base.animeTitleLower) continue;
    return cand;
  }
  return pickRandom(filteredSongs);
}

function pickSameAnimeDifferentSong(base) {
  const same = filteredSongs.filter(s =>
    (s.animeMalId && base.animeMalId && s.animeMalId === base.animeMalId) &&
    s.url !== base.url
  );
  return same.length ? pickRandom(same) : null;
}

function choosePair() {
  const A = pickRandom(filteredSongs);
  if (!A?.url) return null;

  const r = Math.floor(Math.random() * 3);
  if (r === 0) return { A, B: A, isMatch: true };

  if (r === 2) {
    const same = pickSameAnimeDifferentSong(A);
    if (same) return { A, B: same, isMatch: false };
    return { A, B: pickDifferentAnimeSong(A), isMatch: false };
  }

  return { A, B: pickDifferentAnimeSong(A), isMatch: false };
}

// ====== Round flow ======
function resetControls() {
  btnTruth.disabled = true;
  btnFake.disabled = true;

  nextBtn.style.display = "none";
  nextBtn.onclick = null;

  resultDiv.textContent = "";
  resultDiv.className = "";

  setMediaStatus("");
  stopPlayback();
  clearSegment();

  lockForRound();
  updateScoreBar(MAX_SCORE);

  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
}

function finishRoundFailure(reasonText) {
  btnTruth.disabled = true;
  btnFake.disabled = true;

  resultDiv.innerHTML = `
    ❌ Duel annulé (problème média).<br>
    <em>${reasonText || "Impossible de charger après plusieurs tentatives."}</em>
    <div style="margin-top:8px;">Score : <b>0</b> / ${MAX_SCORE}</div>
  `;
  resultDiv.className = "incorrect";
  updateScoreBar(0);

  endRoundAndMaybeNext(0);
}

function startNewRound() {
  roundToken++;
  const localToken = roundToken;

  resetControls();

  if (!CAN_PLAY_WEBM) {
    setMediaStatus("⚠️ WebM non supporté sur ce navigateur (Safari/iOS).");
    finishRoundFailure("WebM non supporté.");
    return;
  }

  const pair = choosePair();
  if (!pair) return startNewRound();

  videoSong = pair.A;
  audioSong = pair.B;
  isMatch = pair.isMatch;

  pinnedA = { ok: false, attempt: 0, url: videoSong.url };
  pinnedB = { ok: false, attempt: 0, url: audioSong.url };

  autoStartPinned(localToken);
}

// ====== START SYNC helpers ======
function isNotAllowedError(reason) {
  if (!reason) return false;
  const name = reason.name || "";
  const msg = String(reason.message || "");
  return name === "NotAllowedError" || /notallowed/i.test(msg);
}

async function waitBothAdvance(localToken, baseTime, delta, timeoutMs) {
  const end = performance.now() + timeoutMs;
  const target = baseTime + delta;

  while (performance.now() < end) {
    if (localToken !== roundToken) return { ok: false };
    const tv = videoPlayer.currentTime || 0;
    const ta = audioPlayer.currentTime || 0;
    if (tv >= target && ta >= target) return { ok: true };
    await delay(60);
  }

  const tv = videoPlayer.currentTime || 0;
  const ta = audioPlayer.currentTime || 0;
  return { ok: false, vOk: tv >= (baseTime + 0.02), aOk: ta >= (baseTime + 0.02) };
}

function snapVideoToAudio() {
  const tv = videoPlayer.currentTime || 0;
  const ta = audioPlayer.currentTime || 0;
  const dv = ta - tv;

  if (Math.abs(dv) > 0.10) {
    try { videoPlayer.currentTime = ta; } catch {}
  }
}

function microRateCorrector(localToken) {
  const start = performance.now();
  const timer = setInterval(() => {
    if (localToken !== roundToken) { clearInterval(timer); return; }
    const tv = videoPlayer.currentTime || 0;
    const ta = audioPlayer.currentTime || 0;
    const dv = ta - tv;

    if (dv > 0.07) videoPlayer.playbackRate = 1.06;
    else if (dv < -0.07) videoPlayer.playbackRate = 0.94;
    else videoPlayer.playbackRate = 1.0;

    if (performance.now() - start > 900) {
      videoPlayer.playbackRate = 1.0;
      clearInterval(timer);
    }
  }, 120);
}

function computeAhead() {
  const severity = Math.max(pinnedA.attempt, pinnedB.attempt);
  return severity >= BUFFER_AHEAD_DROP_AFTER ? BUFFER_AHEAD_FALLBACK : BUFFER_AHEAD_PRIMARY;
}

// ====== cœur pinned + gating + start ======
async function autoStartPinned(localToken) {
  if (localToken !== roundToken) return;

  // tentative 0: charge A+B en parallèle
  if (!pinnedA.ok && !pinnedB.ok && pinnedA.attempt === 0 && pinnedB.attempt === 0) {
    setMediaStatus("⏳ Préchargement A+B…");

    const [ra, rb] = await Promise.allSettled([
      loadAndPin(videoPlayer, videoSong.url, 0, "Vidéo A", localToken),
      loadAndPin(audioPlayer, audioSong.url, 0, "Audio B", localToken),
    ]);

    if (localToken !== roundToken) return;

    const okA = ra.status === "fulfilled" && ra.value === true;
    const okB = rb.status === "fulfilled" && rb.value === true;

    pinnedA.ok = okA;
    pinnedB.ok = okB;

    if (!okA) pinnedA.attempt = 1;
    if (!okB) pinnedB.attempt = 1;
  }

  // retry A uniquement
  while (!pinnedA.ok && pinnedA.attempt < RETRY_DELAYS.length) {
    if (localToken !== roundToken) return;
    await delay(RETRY_DELAYS[pinnedA.attempt]);
    const okA = await loadAndPin(videoPlayer, videoSong.url, pinnedA.attempt, "Vidéo A", localToken);
    if (localToken !== roundToken) return;
    if (okA) { pinnedA.ok = true; break; }
    pinnedA.attempt++;
  }

  if (!pinnedA.ok) {
    setMediaStatus("❌ Vidéo A impossible.");
    return finishRoundFailure("Vidéo A : échec après 6 tentatives.");
  }

  // retry B uniquement
  while (!pinnedB.ok && pinnedB.attempt < RETRY_DELAYS.length) {
    if (localToken !== roundToken) return;
    await delay(RETRY_DELAYS[pinnedB.attempt]);
    const okB = await loadAndPin(audioPlayer, audioSong.url, pinnedB.attempt, "Audio B", localToken);
    if (localToken !== roundToken) return;
    if (okB) { pinnedB.ok = true; break; }
    pinnedB.attempt++;
  }

  if (!pinnedB.ok) {
    setMediaStatus("❌ Audio B impossible.");
    return finishRoundFailure("Audio B : échec après 6 tentatives.");
  }

  // buffer gating soft
  setMediaStatus("🔄 Synchronisation…");
  const syncT0 = performance.now();

  const okBufA = await ensureBufferReady(videoPlayer, "Vidéo A", localToken);
  if (localToken !== roundToken) return;
  if (!okBufA) {
    pinnedA.ok = false;
    pinnedA.attempt = Math.min(pinnedA.attempt + 1, RETRY_DELAYS.length);
    return autoStartPinned(localToken);
  }

  const okBufB = await ensureBufferReady(audioPlayer, "Audio B", localToken);
  if (localToken !== roundToken) return;
  if (!okBufB) {
    pinnedB.ok = false;
    pinnedB.attempt = Math.min(pinnedB.attempt + 1, RETRY_DELAYS.length);
    return autoStartPinned(localToken);
  }

  // start muted + wait both advance + snap sync + unmute audio
  stopPlayback();
  clearSegment();
  lockForRound();

  const prevVMuted = videoPlayer.muted;
  const prevAMuted = audioPlayer.muted;

  videoPlayer.muted = true;
  audioPlayer.muted = true;

  try { videoPlayer.currentTime = LISTEN_START; } catch {}
  try { audioPlayer.currentTime = LISTEN_START; } catch {}

  armSegment(localToken);

  const res = await Promise.allSettled([videoPlayer.play(), audioPlayer.play()]);
  if (localToken !== roundToken) return;

  const reasons = res.filter(r => r.status === "rejected").map(r => r.reason);
  if (reasons.some(isNotAllowedError)) {
    setMediaStatus("▶️ Clique dans la carte pour lancer");
    const onTap = async () => {
      containerEl.removeEventListener("click", onTap);
      if (localToken !== roundToken) return;

      try {
        videoPlayer.muted = true;
        audioPlayer.muted = true;

        await Promise.all([videoPlayer.play(), audioPlayer.play()]);

        const adv = await waitBothAdvance(localToken, LISTEN_START, START_ADVANCE_DELTA, START_ADVANCE_TIMEOUT_MS);
        if (!adv.ok) throw new Error("advance-timeout");

        snapVideoToAudio();
        microRateCorrector(localToken);

        const left = MIN_SYNC_DELAY_MS - (performance.now() - syncT0);
        if (left > 0) await delay(left);

        videoPlayer.muted = true;
        audioPlayer.muted = false;
        applyVolume();
        setMediaStatus("▶️ Lecture…");
      } catch {
        stopPlayback();
        clearSegment();
        videoPlayer.muted = prevVMuted;
        audioPlayer.muted = prevAMuted;
        finishRoundFailure("Autoplay bloqué / impossible de lancer.");
      }
    };
    containerEl.addEventListener("click", onTap, { once: true });
    return;
  }

  const vFail = res[0].status === "rejected";
  const aFail = res[1].status === "rejected";

  if (vFail || aFail) {
    stopPlayback();
    clearSegment();
  }

  if (vFail) {
    pinnedA.ok = false;
    pinnedA.attempt = Math.min(pinnedA.attempt + 1, RETRY_DELAYS.length);
    videoPlayer.muted = prevVMuted;
    audioPlayer.muted = prevAMuted;
    return autoStartPinned(localToken);
  }

  if (aFail) {
    pinnedB.ok = false;
    pinnedB.attempt = Math.min(pinnedB.attempt + 1, RETRY_DELAYS.length);
    videoPlayer.muted = prevVMuted;
    audioPlayer.muted = prevAMuted;
    return autoStartPinned(localToken);
  }

  const adv = await waitBothAdvance(localToken, LISTEN_START, START_ADVANCE_DELTA, START_ADVANCE_TIMEOUT_MS);
  if (localToken !== roundToken) return;

  if (!adv.ok) {
    stopPlayback();
    clearSegment();

    if (adv.vOk === false) {
      pinnedA.ok = false;
      pinnedA.attempt = Math.min(pinnedA.attempt + 1, RETRY_DELAYS.length);
    }
    if (adv.aOk === false) {
      pinnedB.ok = false;
      pinnedB.attempt = Math.min(pinnedB.attempt + 1, RETRY_DELAYS.length);
    }

    videoPlayer.muted = prevVMuted;
    audioPlayer.muted = prevAMuted;
    return autoStartPinned(localToken);
  }

  snapVideoToAudio();
  microRateCorrector(localToken);

  const left = MIN_SYNC_DELAY_MS - (performance.now() - syncT0);
  if (left > 0) await delay(left);

  videoPlayer.muted = true;
  audioPlayer.muted = false;
  applyVolume();

  setMediaStatus("▶️ Lecture…");
}

// ====== Answer / Score ======
function endRoundAndMaybeNext(roundScore) {
  totalScore += roundScore;

  if (currentRound >= totalRounds) {
    resultDiv.innerHTML += `
      <div style="margin-top:10px; font-weight:900; opacity:0.95;">
        ✅ Série terminée !<br>
        Score total : <b>${totalScore}</b> / <b>${totalRounds * MAX_SCORE}</b>
      </div>
    `;

    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      stopPlayback();
      setMediaStatus("");
      resultDiv.textContent = "";
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

  const good = (userSaysMatch === isMatch);

  stopPlayback();
  clearSegment();
  revealVideoAWithAudio();

  btnTruth.disabled = true;
  btnFake.disabled = true;

  const verdict = isMatch ? "✅ TRUTH (MATCH)" : "❌ FAKE (NO MATCH)";

  if (good) {
    const score = MAX_SCORE;
    resultDiv.innerHTML = `
      🎉 Bonne réponse !<br><b>${verdict}</b>
      <em>Vidéo (A) : ${formatRevealLine(videoSong)}</em>
      <em>Audio (B) : ${formatRevealLine(audioSong)}</em>
      <div style="margin-top:8px;">Score : <b>${score}</b> / ${MAX_SCORE}</div>
    `;
    resultDiv.className = "correct";
    updateScoreBar(score);
    launchFireworks();
    endRoundAndMaybeNext(score);
  } else {
    resultDiv.innerHTML = `
      ❌ Mauvaise réponse.<br>
      Réponse correcte : <b>${verdict}</b>
      <em>Vidéo (A) : ${formatRevealLine(videoSong)}</em>
      <em>Audio (B) : ${formatRevealLine(audioSong)}</em>
      <div style="margin-top:8px;">Score : <b>0</b> / ${MAX_SCORE}</div>
    `;
    resultDiv.className = "incorrect";
    updateScoreBar(0);
    endRoundAndMaybeNext(0);
  }
}

btnTruth.addEventListener("click", () => checkAnswer(true));
btnFake.addEventListener("click", () => checkAnswer(false));

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
      const any = document.querySelectorAll("#typePills .pill.active").length > 0;
      if (!any) { btn.classList.add("active"); btn.setAttribute("aria-pressed", "true"); }
      updatePreview();
    });
  });

  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      const any = document.querySelectorAll("#songPills .pill.active").length > 0;
      if (!any) { btn.classList.add("active"); btn.setAttribute("aria-pressed", "true"); }
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

// ====== Filters + Preview ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);

  if (!allowedTypes.length || !allowedSongs.length) return [];

  let pool = allSongs.filter((s) => (
    s.animeYear >= yearMin &&
    s.animeYear <= yearMax &&
    allowedTypes.includes(s.animeType) &&
    allowedSongs.includes(s.songType)
  ));

  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

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

    lockForRound();
    applyVolume();
    updateScoreBar(MAX_SCORE);
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
  });
