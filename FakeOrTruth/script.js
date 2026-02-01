/**********************
 * Fake Or Truth — Image A + Audio B (45s -> 20s)
 * ✅ 25% Truth / 75% Fake
 * ✅ Truth = match parfait (A === B : même song)
 * ✅ Fake = sinon (même anime autre song OU anime différent)
 * ✅ Reveal = Vidéo A si Truth, sinon Vidéo B (tooltip laissé tel quel)
 * ✅ Robust audio load/seek/buffer + autoplay fallback click
 *
 * ✅ MODE PARCOURS (comme Anime Tournament)
 * - ?parcours=1 => auto-start, cache Menu + cache réglages
 * - Paramètres via URL (prioritaire) sinon localStorage "AG_parcours_filters"
 * - Fin: bouton "Continuer le parcours" + postMessage score/total
 * - Pool insuffisant: écran abort + "Continuer le parcours" (score 0)
 **********************/

const MAX_SCORE = 3000;
const MIN_REQUIRED_SONGS = 64;

// Extrait: 45s -> 20s
const LISTEN_START = 45;
const LISTEN_DURATION = 20;

// Probabilité de match (Truth)
const TRUTH_PROB = 0.25;

// Retries + timeouts
const RETRY_DELAYS = [0, 1200, 2500, 4500]; // 4 tentatives max
const LOAD_TIMEOUT_MS = 11000;
const SEEK_TIMEOUT_MS = 9000;

const BUFFER_AHEAD_SEC = 0.75;
const BUFFER_WAIT_MS = 2500;

// Stall
const STALL_TIMEOUT_MS = 12000;
const STALL_POLL_MS = 500;

// Anti “round infini”: reroll si trop d'échecs
const MAX_REROLLS_PER_ROUND = 5;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* =======================
   PARCOURS (URL PARAMS)
======================= */
const urlParams = new URLSearchParams(window.location.search);
const IS_PARCOURS = urlParams.get("parcours") === "1";

const PARAM_TYPES = urlParams.get("types"); // ex: "TV,Movie"
const PARAM_SONGS = urlParams.get("songs"); // ex: "OP,ED" ou "opening,ending"
const PARAM_POP = urlParams.get("popPercent") || urlParams.get("pop") || urlParams.get("popularity");
const PARAM_SCORE = urlParams.get("scorePercent") || urlParams.get("score");
const PARAM_YMIN = urlParams.get("yearMin") || urlParams.get("yMin");
const PARAM_YMAX = urlParams.get("yearMax") || urlParams.get("yMax");
const PARAM_ROUNDS = urlParams.get("rounds") || urlParams.get("roundCount");

const PARCOURS_CFG_KEY = "AG_parcours_filters";
let parcoursSent = false;

function loadParcoursCfg() {
  try {
    const raw = localStorage.getItem(PARCOURS_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ✅ Fake Or Truth: score = totalScore, total = totalRounds * MAX_SCORE
function sendParcoursScore(score = 0, total = MAX_SCORE) {
  if (parcoursSent) return;
  parcoursSent = true;

  try {
    parent.postMessage(
      {
        parcoursScore: {
          label: "Fake Or Truth",
          score,
          total,
        },
      },
      "*"
    );
  } catch (e) {
    console.warn("postMessage parcours failed:", e);
  }
}

/* =======================
   FALLBACK IMAGE
======================= */
const FALLBACK_IMAGE = (() => {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0b1220"/>
        <stop offset="1" stop-color="#123a5a"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#g)"/>
    <text x="50%" y="50%" fill="#eaffff" font-size="54" font-family="Segoe UI, Arial" text-anchor="middle" dominant-baseline="middle">
      Image indisponible
    </text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
})();

/* =======================
   UI: menu + theme
======================= */
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

/* =======================
   Helpers
======================= */
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

function getAnimeImage(a) {
  const candidates = [
    a?.images?.webp?.large_image_url,
    a?.images?.webp?.image_url,
    a?.images?.jpg?.large_image_url,
    a?.images?.jpg?.image_url,
    a?.image_url,
    a?.image,
    a?.cover,
    a?.cover_image,
  ].filter(Boolean);
  return candidates[0] || "";
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

function isTimeBuffered(el, t, margin = 0.25) {
  try {
    const b = el.buffered;
    for (let i = 0; i < b.length; i++) {
      if (b.start(i) <= t && b.end(i) >= t + margin) return true;
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
  return el.readyState >= 3 && isTimeBuffered(el, baseT, Math.min(0.2, aheadSec));
}

function isNotAllowedError(reason) {
  if (!reason) return false;
  const name = reason.name || "";
  const msg = String(reason.message || "");
  return name === "NotAllowedError" || /notallowed/i.test(msg);
}

function normStr(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/* =======================
   Songs extraction
======================= */
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
        animeImage: anime._image,

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

function formatAnimeLineFromSong(s) {
  const y = s.animeYear ? ` (${s.animeYear})` : "";
  const t = s.animeType ? ` • ${s.animeType}` : "";
  return `${s.animeTitle}${y}${t}`;
}

/* =======================
   DOM refs
======================= */
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
const songALineEl = document.getElementById("songALine");
const containerEl = document.getElementById("container");

const imageAEl = document.getElementById("imageA");
const videoPlayer = document.getElementById("videoPlayer"); // reveal A ou B
const audioPlayer = document.getElementById("audioPlayer"); // audio B

const btnTruth = document.getElementById("btnTruth");
const btnFake = document.getElementById("btnFake");

const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ✅ Anti-flash parcours (script chargé en bas => DOM déjà présent)
if (IS_PARCOURS) {
  const backBtn = document.getElementById("back-to-menu");
  if (backBtn) backBtn.style.display = "none";
  if (customPanel) customPanel.style.display = "none";
  if (gamePanel) gamePanel.style.display = "block";
}

/* =======================
   Support WebM (reveal)
======================= */
const CAN_PLAY_WEBM_VIDEO = (() => {
  const v = document.createElement("video");
  if (!v.canPlayType) return false;
  const t1 = v.canPlayType('video/webm; codecs="vp9, opus"');
  const t2 = v.canPlayType('video/webm; codecs="vp8, opus"');
  const t3 = v.canPlayType("video/webm");
  return (t1 && t1 !== "") || (t2 && t2 !== "") || (t3 && t3 !== "");
})();

/* =======================
   Data
======================= */
let allAnimes = [];
let allSongs = [];
let filteredSongs = [];

/* =======================
   Session
======================= */
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

/* =======================
   Round state
======================= */
let imageSong = null; // A
let audioSong = null; // B
let isMatch = false; // Truth = match parfait (A=B)

// extra: utile pour feedback Fake
let fakeIsSameAnime = false;

let roundToken = 0;
let rerollsLeft = MAX_REROLLS_PER_ROUND;

/* =======================
   Status
======================= */
function setMediaStatus(msg) {
  mediaStatusEl.textContent = msg || "";
}

/* =======================
   UI show/hide
======================= */
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

/* =======================
   Score bar
======================= */
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

/* =======================
   Volume
======================= */
function applyVolume() {
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "50", 10)));
  const vol = v / 100;
  audioPlayer.volume = vol;
  videoPlayer.volume = vol;
  volumeVal.textContent = `${v}%`;
}
volumeSlider.addEventListener("input", applyVolume);

/* =======================
   Media primitives
======================= */
function hardReset(el) {
  try {
    el.pause();
  } catch {}
  el.removeAttribute("src");
  el.load();
}

function stopPlayback() {
  try {
    audioPlayer.pause();
  } catch {}
  try {
    videoPlayer.pause();
  } catch {}
}

function resetVisualsForRound() {
  // mode jeu: image visible, vidéo cachée
  imageAEl.style.display = "block";
  videoPlayer.style.display = "none";
  videoPlayer.controls = false;
  videoPlayer.removeAttribute("controls");
  videoPlayer.muted = false;

  // audio caché (mais joue)
  audioPlayer.style.display = "none";
}

function setImageForA(songA) {
  const src = songA?.animeImage || "";
  imageAEl.src = src || FALLBACK_IMAGE;
  imageAEl.alt = songA?.animeTitle ? `Anime: ${songA.animeTitle}` : "Image A";

  imageAEl.onerror = () => {
    imageAEl.src = FALLBACK_IMAGE;
  };
}

/* =======================
   waitEvent
======================= */
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

/* =======================
   Seek & load audio
======================= */
async function ensurePinnedAt(el, t, localToken) {
  if (localToken !== roundToken) return false;

  if (el.readyState >= 3 && isTimeBuffered(el, t, 0.2)) {
    try {
      el.pause();
    } catch {}
    return true;
  }

  try {
    el.currentTime = t;
  } catch {}

  try {
    await waitEvent(el, "seeked", ["error"], SEEK_TIMEOUT_MS, localToken);
  } catch {}

  if (localToken !== roundToken) return false;

  if (el.readyState >= 3 && isTimeBuffered(el, t, 0.12)) {
    try {
      el.pause();
    } catch {}
    return true;
  }

  try {
    await waitEvent(el, "canplay", ["error"], SEEK_TIMEOUT_MS, localToken);
  } catch {
    return false;
  }

  if (localToken !== roundToken) return false;
  try {
    el.pause();
  } catch {}
  return el.readyState >= 3;
}

async function loadMeta(el, url, attempt, label, localToken) {
  if (localToken !== roundToken) return false;

  hardReset(el);

  const src = attempt === 0 ? url : withCacheBuster(url);
  el.preload = "metadata";
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

async function loadAndPinAudio(url, attempt, localToken) {
  const okMeta = await loadMeta(audioPlayer, url, attempt, "Audio B", localToken);
  if (!okMeta || localToken !== roundToken) return false;

  const okPin = await ensurePinnedAt(audioPlayer, LISTEN_START, localToken);
  if (!okPin || localToken !== roundToken) return false;

  try {
    audioPlayer.pause();
  } catch {}
  return true;
}

/* =======================
   Segment + Stall watchdog (audio only)
======================= */
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

function finishRoundFailure(reasonText) {
  btnTruth.disabled = true;
  btnFake.disabled = true;

  resultDiv.innerHTML = `
    ❌ Duel annulé (problème média).<br>
    <em>${reasonText || "Impossible de charger après plusieurs tentatives."}</em>
    <div style="margin-top:8px;">Score : <b>0</b> / 3000</div>
  `;
  resultDiv.className = "incorrect";
  updateScoreBar(0);

  endRoundAndMaybeNext(0);
}

function rerollDuel(localToken, msg) {
  if (localToken !== roundToken) return;

  if (rerollsLeft <= 0) {
    finishRoundFailure("Trop d’échecs média d’affilée (serveur/charge).");
    return;
  }
  rerollsLeft--;

  stopPlayback();
  clearSegment();
  resetVisualsForRound();

  setMediaStatus(msg || "🔁 Nouveau duel…");

  const pair = choosePair();
  if (!pair) {
    finishRoundFailure("Impossible de choisir un nouveau duel.");
    return;
  }

  imageSong = pair.A;
  audioSong = pair.B;
  isMatch = pair.isMatch;
  fakeIsSameAnime = pair.fakeIsSameAnime;

  // annule tout ce qui traîne
  roundToken++;
  autoStartRound(roundToken);
}

function armSegment(localToken) {
  clearSegment();
  segmentActive = true;
  segmentEnd = LISTEN_START + LISTEN_DURATION;

  lastProgressT = audioPlayer.currentTime || 0;
  lastProgressWall = performance.now();

  stallWatchId = setInterval(() => {
    if (!segmentActive) return;
    if (localToken !== roundToken) return;

    const t = audioPlayer.currentTime || 0;
    const now = performance.now();

    if (t > lastProgressT + 0.08) {
      lastProgressT = t;
      lastProgressWall = now;
      return;
    }

    if (now - lastProgressWall > STALL_TIMEOUT_MS) {
      rerollDuel(localToken, "⏳ Lecture audio bloquée… nouveau duel.");
    }
  }, STALL_POLL_MS);

  endCheckId = setInterval(() => {
    if (!segmentActive) return;
    if (localToken !== roundToken) return;

    const t = audioPlayer.currentTime || 0;
    if (t >= segmentEnd - 0.05) {
      try {
        audioPlayer.pause();
      } catch {}
      clearSegment();
      setMediaStatus("✅ À toi : Truth (match parfait A=B) ou Fake (sinon) ?");
      btnTruth.disabled = false;
      btnFake.disabled = false;
    }
  }, 120);
}

/* =======================
   Pair selection (25/75)
======================= */
function sameAnime(a, b) {
  if (!a || !b) return false;
  if (a.animeMalId && b.animeMalId) return a.animeMalId === b.animeMalId;
  return a.animeTitleLower && b.animeTitleLower && a.animeTitleLower === b.animeTitleLower;
}

function sameSong(a, b) {
  if (!a || !b) return false;

  // si URL identique, match parfait
  if (a.url && b.url && a.url === b.url) return true;

  if (!sameAnime(a, b)) return false;

  const nA = safeNum(a.songNumber) || 1;
  const nB = safeNum(b.songNumber) || 1;

  return a.songType === b.songType && nA === nB && normStr(a.songName) === normStr(b.songName);
}

function pickSongSameAnimeDifferentSong(base) {
  const same = filteredSongs.filter((s) => sameAnime(s, base) && !sameSong(s, base) && s?.url);
  return same.length ? pickRandom(same) : null;
}

function pickSongDifferentAnime(base) {
  for (let i = 0; i < 180; i++) {
    const cand = pickRandom(filteredSongs);
    if (!cand?.url) continue;
    if (!sameAnime(cand, base)) return cand;
  }
  // fallback si pool trop "mono"
  return pickRandom(filteredSongs);
}

function choosePair() {
  const A = pickRandom(filteredSongs);
  if (!A?.url) return null;

  const truth = Math.random() < TRUTH_PROB;

  if (truth) {
    // ✅ match parfait
    return { A, B: A, isMatch: true, fakeIsSameAnime: false };
  }

  // Fake = soit même anime mais autre song, soit anime différent (50/50)
  const sameAnimeButWrong = Math.random() < 0.5;

  let B = null;
  let fakeSame = false;

  if (sameAnimeButWrong) {
    B = pickSongSameAnimeDifferentSong(A);
    if (!B) {
      B = pickSongDifferentAnime(A);
      fakeSame = false;
    } else {
      fakeSame = true;
    }
  } else {
    B = pickSongDifferentAnime(A);
    fakeSame = false;
  }

  if (!B?.url) return null;

  // sécurité: éviter exact-match accidentel
  if (sameSong(A, B)) {
    B = pickSongDifferentAnime(A);
    fakeSame = false;
    if (!B?.url) return null;
  }

  return { A, B, isMatch: false, fakeIsSameAnime: fakeSame };
}

/* =======================
   Round flow
======================= */
function resetControls() {
  btnTruth.disabled = true;
  btnFake.disabled = true;

  nextBtn.style.display = "none";
  nextBtn.onclick = null;
  nextBtn.disabled = false;

  resultDiv.textContent = "";
  resultDiv.className = "";

  setMediaStatus("");
  if (songALineEl) songALineEl.textContent = "";

  stopPlayback();
  clearSegment();

  hardReset(audioPlayer);
  hardReset(videoPlayer);

  resetVisualsForRound();
  updateScoreBar(MAX_SCORE);

  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
}

function startNewRound() {
  roundToken++;
  const localToken = roundToken;

  rerollsLeft = MAX_REROLLS_PER_ROUND;
  resetControls();

  // reveal vidéo a besoin de webm vidéo
  if (!CAN_PLAY_WEBM_VIDEO) {
    setMediaStatus("⚠️ WebM non supporté (vidéo reveal impossible sur ce navigateur).");
    finishRoundFailure("WebM vidéo non supporté.");
    return;
  }

  const pair = choosePair();
  if (!pair) return startNewRound();

  imageSong = pair.A;
  audioSong = pair.B;
  isMatch = pair.isMatch;
  fakeIsSameAnime = pair.fakeIsSameAnime;

  autoStartRound(localToken);
}

// ====== cœur : load audio + play segment (image visible) ======
async function autoStartRound(localToken) {
  if (localToken !== roundToken) return;

  // 1) Image A
  setImageForA(imageSong);

  // ✅ Affiche le titre complet du Song A pendant le round
  if (songALineEl) {
    songALineEl.textContent = `A : ${formatRevealLine(imageSong)}`;
  }

  // 2) Charger + pin audio B
  let ok = false;
  let attempt = 0;

  while (!ok && attempt < RETRY_DELAYS.length) {
    if (localToken !== roundToken) return;
    await delay(RETRY_DELAYS[attempt]);

    ok = await loadAndPinAudio(audioSong.url, attempt, localToken);
    if (localToken !== roundToken) return;
    if (ok) break;
    attempt++;
  }

  if (!ok) {
    rerollDuel(localToken, "⚠️ Audio B indisponible → nouveau duel…");
    return;
  }

  // 3) Buffer gating
  setMediaStatus("🔄 Préparation…");
  const okBuf = await waitBufferAhead(audioPlayer, LISTEN_START, BUFFER_AHEAD_SEC, BUFFER_WAIT_MS, localToken);
  if (localToken !== roundToken) return;

  if (!okBuf) {
    rerollDuel(localToken, "⏳ Audio trop lent → nouveau duel…");
    return;
  }

  // 4) Start playback (autoplay fallback)
  stopPlayback();
  clearSegment();
  resetVisualsForRound();

  try {
    audioPlayer.currentTime = LISTEN_START;
  } catch {}

  applyVolume();
  armSegment(localToken);

  const playRes = await Promise.allSettled([audioPlayer.play()]);
  if (localToken !== roundToken) return;

  const reasons = playRes.filter((r) => r.status === "rejected").map((r) => r.reason);
  if (reasons.some(isNotAllowedError)) {
    setMediaStatus("▶️ Clique dans la carte pour lancer");
    const onTap = async () => {
      containerEl.removeEventListener("click", onTap);
      if (localToken !== roundToken) return;

      try {
        applyVolume();
        await audioPlayer.play();
        setMediaStatus("▶️ Lecture…");
      } catch {
        stopPlayback();
        clearSegment();
        rerollDuel(localToken, "⚠️ Impossible de lancer → nouveau duel…");
      }
    };
    containerEl.addEventListener("click", onTap, { once: true });
    return;
  }

  if (playRes[0].status === "rejected") {
    stopPlayback();
    clearSegment();
    rerollDuel(localToken, "⚠️ Erreur play audio → nouveau duel…");
    return;
  }

  setMediaStatus("▶️ Lecture…");
}

/* =======================
   Reveal (inchangé ici)
======================= */
async function revealVideoWithAudio(localToken) {
  if (localToken !== roundToken) return;

  stopPlayback();
  clearSegment();

  const revealSong = imageSong; // (tooltip laissé tel quel)

  // cache-buster pour éviter vieux cache si tu spam
  hardReset(videoPlayer);
  videoPlayer.src = withCacheBuster(revealSong.url);
  videoPlayer.preload = "metadata";
  videoPlayer.load();

  // switch visuel
  imageAEl.style.display = "none";
  videoPlayer.style.display = "block";
  videoPlayer.controls = true;
  videoPlayer.setAttribute("controls", "controls");
  videoPlayer.muted = false;
  applyVolume();

  setMediaStatus("🎬 Reveal : Vidéo A");

  try {
    await waitEvent(videoPlayer, "loadedmetadata", ["error"], LOAD_TIMEOUT_MS, localToken);
  } catch {
    setMediaStatus("⚠️ Reveal vidéo impossible (chargement).");
    return;
  }
  if (localToken !== roundToken) return;

  try {
    videoPlayer.currentTime = LISTEN_START;
  } catch {}

  const res = await Promise.allSettled([videoPlayer.play()]);
  if (localToken !== roundToken) return;

  const reasons = res.filter((r) => r.status === "rejected").map((r) => r.reason);
  if (reasons.some(isNotAllowedError)) {
    setMediaStatus("▶️ Clique pour lancer le reveal");
    const onTap = async () => {
      containerEl.removeEventListener("click", onTap);
      if (localToken !== roundToken) return;
      try {
        await videoPlayer.play();
        setMediaStatus(isMatch ? "🎬 Reveal : Vidéo A (Truth)" : "🎬 Reveal : Vidéo B");
      } catch {
        setMediaStatus("⚠️ Reveal vidéo bloqué.");
      }
    };
    containerEl.addEventListener("click", onTap, { once: true });
    return;
  }

  if (res[0].status === "rejected") {
    setMediaStatus("⚠️ Reveal vidéo bloqué.");
  }
}

/* =======================
   Answer / End (✅ Parcours)
======================= */
function endRoundAndMaybeNext(roundScore) {
  totalScore += roundScore;

  const totalMax = totalRounds * MAX_SCORE;

  if (currentRound >= totalRounds) {
    resultDiv.innerHTML += `
      <div style="margin-top:10px; font-weight:900; opacity:0.95;">
        ✅ Série terminée !<br>
        Score total : <b>${totalScore}</b> / <b>${totalMax}</b>
      </div>
    `;

    nextBtn.style.display = "block";
    nextBtn.disabled = false;

    if (IS_PARCOURS) {
      nextBtn.textContent = "Continuer le parcours";
      nextBtn.onclick = () => {
        nextBtn.disabled = true;
        sendParcoursScore(totalScore, totalMax);
      };
    } else {
      nextBtn.textContent = "Retour réglages";
      nextBtn.onclick = () => {
        showCustomization();
        stopPlayback();
        setMediaStatus("");
        resultDiv.textContent = "";
      };
    }
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.disabled = false;
  nextBtn.textContent = "Round suivant";
  nextBtn.onclick = () => {
    currentRound += 1;
    startNewRound();
  };
}

function checkAnswer(userSaysTruth) {
  if (!imageSong || !audioSong) return;

  const localToken = roundToken;

  // Truth = match parfait A=B
  const good = userSaysTruth === isMatch;

  // reveal demandé
  revealVideoWithAudio(localToken);

  btnTruth.disabled = true;
  btnFake.disabled = true;

  const verdict = isMatch
    ? "✅ TRUTH (MATCH PARFAIT A=B)"
    : fakeIsSameAnime
    ? "❌ FAKE (même anime, song différent)"
    : "❌ FAKE (anime différent)";

  if (good) {
    const score = MAX_SCORE;
    resultDiv.innerHTML = `
      🎉 Bonne réponse !<br><b>${verdict}</b>
      <em>A : ${formatRevealLine(imageSong)}</em>
      <em>B : ${formatRevealLine(audioSong)}</em>
      <div style="margin-top:8px;">Score : <b>${score}</b> / 3000</div>
    `;
    resultDiv.className = "correct";
    updateScoreBar(score);
    launchFireworks();
    endRoundAndMaybeNext(score);
  } else {
    resultDiv.innerHTML = `
      ❌ Mauvaise réponse.<br>
      Réponse correcte : <b>${verdict}</b>
      <em>A : ${formatRevealLine(imageSong)}</em>
      <em>B : ${formatRevealLine(audioSong)}</em>
      <div style="margin-top:8px;">Score : <b>0</b> / 3000</div>
    `;
    resultDiv.className = "incorrect";
    updateScoreBar(0);
    endRoundAndMaybeNext(0);
  }
}

btnTruth.addEventListener("click", () => checkAnswer(true));
btnFake.addEventListener("click", () => checkAnswer(false));

/* =======================
   Tooltip help (inchangé)
======================= */
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

/* =======================
   Fireworks
======================= */
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

/* =======================
   PARCOURS helpers (UI apply + abort)
======================= */
function ensureAtLeastOneActive(selector, fallbackDataAttr, fallbackValues = []) {
  const pills = Array.from(document.querySelectorAll(selector));
  if (!pills.length) return;

  const active = pills.filter((p) => p.classList.contains("active"));
  if (active.length) return;

  let did = false;
  if (fallbackValues.length) {
    pills.forEach((p) => {
      const v = p.dataset[fallbackDataAttr];
      const on = fallbackValues.includes(v);
      if (on) {
        p.classList.add("active");
        p.setAttribute("aria-pressed", "true");
        did = true;
      }
    });
  }
  if (!did && pills[0]) {
    pills[0].classList.add("active");
    pills[0].setAttribute("aria-pressed", "true");
  }
}

function normalizeSongParamToken(tok) {
  const t = String(tok || "").trim().toLowerCase();
  if (!t) return "";
  if (t === "op" || t === "opening") return "OP";
  if (t === "ed" || t === "ending") return "ED";
  if (t === "in" || t === "insert") return "IN";
  return "";
}

function applyParcoursParamsToUI() {
  const cfg = loadParcoursCfg();
  const has = (x) => x != null && x !== "";

  const trySetInt = (el, val, min, max) => {
    if (!el || !has(val)) return;
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return;
    el.value = String(Math.max(min, Math.min(max, n)));
  };

  // sliders (URL > localStorage)
  trySetInt(popEl, has(PARAM_POP) ? PARAM_POP : cfg?.popPercent, 5, 100);
  trySetInt(scoreEl, has(PARAM_SCORE) ? PARAM_SCORE : cfg?.scorePercent, 5, 100);
  trySetInt(yearMinEl, has(PARAM_YMIN) ? PARAM_YMIN : cfg?.yearMin, 1950, 2026);
  trySetInt(yearMaxEl, has(PARAM_YMAX) ? PARAM_YMAX : cfg?.yearMax, 1950, 2026);

  // rounds
  if (roundCountEl) {
    const src = has(PARAM_ROUNDS) ? PARAM_ROUNDS : cfg?.rounds;
    const n = parseInt(src, 10);
    if (Number.isFinite(n)) roundCountEl.value = String(clampInt(n, 1, 100));
  }

  // types pills
  const typesList = has(PARAM_TYPES)
    ? PARAM_TYPES.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(cfg?.types)
    ? cfg.types
    : null;

  if (typesList && typesList.length) {
    const want = new Set(typesList);
    document.querySelectorAll("#typePills .pill[data-type]").forEach((p) => {
      const t = p.dataset.type;
      const on = want.has(t);
      p.classList.toggle("active", on);
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // songs pills
  const rawSongs = has(PARAM_SONGS)
    ? PARAM_SONGS.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(cfg?.songs)
    ? cfg.songs.map((x) => String(x))
    : null;

  if (rawSongs && rawSongs.length) {
    const mapped = rawSongs.map(normalizeSongParamToken).filter(Boolean);
    const want = new Set(mapped);

    document.querySelectorAll("#songPills .pill[data-song]").forEach((p) => {
      const s = String(p.dataset.song || "").toUpperCase(); // OP/ED/IN
      const on = want.has(s);
      p.classList.toggle("active", on);
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // sécurité
  ensureAtLeastOneActive("#typePills .pill[data-type]", "type", ["TV", "Movie"]);
  ensureAtLeastOneActive("#songPills .pill[data-song]", "song", ["OP"]);

  // clamp année + refresh labels + preview
  clampYearSliders();
  if (popValEl) popValEl.textContent = popEl.value;
  if (scoreValEl) scoreValEl.textContent = scoreEl.value;
  if (yearMinValEl) yearMinValEl.textContent = yearMinEl.value;
  if (yearMaxValEl) yearMaxValEl.textContent = yearMaxEl.value;

  updatePreview();
}

function parcoursAbort(message, score = 0, total = MAX_SCORE) {
  showGame();
  stopPlayback();
  clearSegment();

  btnTruth.disabled = true;
  btnFake.disabled = true;

  setMediaStatus(message || "❌ Impossible de démarrer.");
  resultDiv.className = "incorrect";
  resultDiv.innerHTML = `
    ❌ ${message || "Impossible de démarrer."}<br>
    <div style="margin-top:8px;">Score : <b>${score}</b> / <b>${total}</b></div>
  `;
  updateScoreBar(0);

  nextBtn.style.display = "block";
  nextBtn.textContent = "Continuer le parcours";
  nextBtn.disabled = false;
  nextBtn.onclick = () => {
    nextBtn.disabled = true;
    sendParcoursScore(score, total);
  };
}

/* =======================
   Custom UI init
======================= */
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
      if (!any) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }
      updatePreview();
    });
  });

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

/* =======================
   Filters + Preview
======================= */
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);

  if (!allowedTypes.length || !allowedSongs.length) return [];

  let pool = allSongs.filter(
    (s) =>
      s.animeYear >= yearMin &&
      s.animeYear <= yearMax &&
      allowedTypes.includes(s.animeType) &&
      allowedSongs.includes(s.songType)
  );

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

/* =======================
   Load dataset
======================= */
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
        _image: getAnimeImage(a),
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();

    resetVisualsForRound();
    applyVolume();
    updateScoreBar(MAX_SCORE);

    // ✅ Parcours: applique params + autostart
    if (IS_PARCOURS) {
      const backBtn = document.getElementById("back-to-menu");
      if (backBtn) backBtn.style.display = "none";

      applyParcoursParamsToUI();

      totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
      currentRound = 1;
      totalScore = 0;

      filteredSongs = applyFilters();
      const totalMax = totalRounds * MAX_SCORE;

      if (filteredSongs.length < MIN_REQUIRED_SONGS) {
        parcoursAbort(`Pool insuffisant : ${filteredSongs.length} songs (min ${MIN_REQUIRED_SONGS}).`, 0, totalMax);
        return;
      }

      showGame();
      startNewRound();
    } else {
      showCustomization();
    }
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
  });
