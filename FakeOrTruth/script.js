/**********************
 * Fake Or Truth — Image A + Audio B (45s -> 20s)
 * ✅ 25% Truth / 75% Fake
 * ✅ Reveal = Vidéo B + Audio B
 * ✅ Robust audio load/seek/buffer + autoplay fallback click
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
  return el.readyState >= 3 && isTimeBuffered(el, baseT, Math.min(0.20, aheadSec));
}

function isNotAllowedError(reason) {
  if (!reason) return false;
  const name = reason.name || "";
  const msg = String(reason.message || "");
  return name === "NotAllowedError" || /notallowed/i.test(msg);
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

const imageAEl = document.getElementById("imageA");
const videoPlayer = document.getElementById("videoPlayer");   // reveal B
const audioPlayer = document.getElementById("audioPlayer");   // audio B

const btnTruth = document.getElementById("btnTruth");
const btnFake = document.getElementById("btnFake");

const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== Support WebM (pour reveal vidéo) ======
const CAN_PLAY_WEBM_VIDEO = (() => {
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
let imageSong = null; // A (sert à l'image/anime)
let audioSong = null; // B (sert à l'audio + reveal vidéo)
let isMatch = false;  // Truth = même anime ?

let roundToken = 0;
let rerollsLeft = MAX_REROLLS_PER_ROUND;

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

// ====== Volume ======
function applyVolume() {
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "50", 10)));
  const vol = v / 100;
  audioPlayer.volume = vol;
  videoPlayer.volume = vol;
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
  try { audioPlayer.pause(); } catch {}
  try { videoPlayer.pause(); } catch {}
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

// ====== Seek & load audio ======
async function ensurePinnedAt(el, t, localToken) {
  if (localToken !== roundToken) return false;

  if (el.readyState >= 3 && isTimeBuffered(el, t, 0.20)) {
    try { el.pause(); } catch {}
    return true;
  }

  try { el.currentTime = t; } catch {}

  try { await waitEvent(el, "seeked", ["error"], SEEK_TIMEOUT_MS, localToken); } catch {}

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

  try { audioPlayer.pause(); } catch {}
  return true;
}

// ====== Segment + Stall watchdog (audio only) ======
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
      try { audioPlayer.pause(); } catch {}
      clearSegment();
      setMediaStatus("✅ À toi : Truth (même anime) ou Fake (anime différent) ?");
      btnTruth.disabled = false;
      btnFake.disabled = false;
    }
  }, 120);
}

// ====== Pair selection (25/75) ======
function sameAnime(a, b) {
  if (!a || !b) return false;
  if (a.animeMalId && b.animeMalId) return a.animeMalId === b.animeMalId;
  return a.animeTitleLower && b.animeTitleLower && a.animeTitleLower === b.animeTitleLower;
}

function pickSongSameAnime(base) {
  const same = filteredSongs.filter(s => sameAnime(s, base));
  return same.length ? pickRandom(same) : base;
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
    const B = pickSongSameAnime(A);
    return { A, B, isMatch: true };
  } else {
    const B = pickSongDifferentAnime(A);
    return { A, B, isMatch: false };
  }
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

  // reveal vidéo B a besoin de webm vidéo
  if (!CAN_PLAY_WEBM_VIDEO) {
    setMediaStatus("⚠️ WebM non supporté (vidéo reveal impossible sur ce navigateur).");
    // Le jeu audio peut encore marcher, mais tu as demandé reveal vidéo B.
    // On stop ici pour éviter confusion.
    finishRoundFailure("WebM vidéo non supporté.");
    return;
  }

  const pair = choosePair();
  if (!pair) return startNewRound();

  imageSong = pair.A;
  audioSong = pair.B;
  isMatch = pair.isMatch;

  autoStartRound(localToken);
}

// ====== cœur : load audio + play segment (image visible) ======
async function autoStartRound(localToken) {
  if (localToken !== roundToken) return;

  // 1) Image A
  setImageForA(imageSong);

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

  try { audioPlayer.currentTime = LISTEN_START; } catch {}

  applyVolume();
  armSegment(localToken);

  const playRes = await Promise.allSettled([audioPlayer.play()]);
  if (localToken !== roundToken) return;

  const reasons = playRes.filter(r => r.status === "rejected").map(r => r.reason);
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

// ====== Reveal : Vidéo B + Audio B ======
async function revealVideoBWithAudio(localToken) {
  if (localToken !== roundToken) return;

  stopPlayback();
  clearSegment();

  // cache-buster pour éviter vieux cache si tu spam
  hardReset(videoPlayer);
  videoPlayer.src = withCacheBuster(audioSong.url);
  videoPlayer.preload = "metadata";
  videoPlayer.load();

  // switch visuel
  imageAEl.style.display = "none";
  videoPlayer.style.display = "block";
  videoPlayer.controls = true;
  videoPlayer.setAttribute("controls", "controls");
  videoPlayer.muted = false;
  applyVolume();

  setMediaStatus("🎬 Reveal : Vidéo B");

  try {
    await waitEvent(videoPlayer, "loadedmetadata", ["error"], LOAD_TIMEOUT_MS, localToken);
  } catch {
    setMediaStatus("⚠️ Reveal vidéo impossible (chargement).");
    return;
  }
  if (localToken !== roundToken) return;

  try { videoPlayer.currentTime = LISTEN_START; } catch {}

  const res = await Promise.allSettled([videoPlayer.play()]);
  if (localToken !== roundToken) return;

  const reasons = res.filter(r => r.status === "rejected").map(r => r.reason);
  if (reasons.some(isNotAllowedError)) {
    setMediaStatus("▶️ Clique pour lancer le reveal");
    const onTap = async () => {
      containerEl.removeEventListener("click", onTap);
      if (localToken !== roundToken) return;
      try {
        await videoPlayer.play();
        setMediaStatus("🎬 Reveal : Vidéo B");
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

// ====== Answer ======
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
  if (!imageSong || !audioSong) return;

  const localToken = roundToken;
  const good = (userSaysMatch === isMatch);

  // reveal demandé: vidéo B + audio B
  revealVideoBWithAudio(localToken);

  btnTruth.disabled = true;
  btnFake.disabled = true;

  const verdict = isMatch ? "✅ TRUTH (MÊME ANIME)" : "❌ FAKE (ANIME DIFFÉRENT)";

  if (good) {
    const score = MAX_SCORE;
    resultDiv.innerHTML = `
      🎉 Bonne réponse !<br><b>${verdict}</b>
      <em>Image (A) : ${formatAnimeLineFromSong(imageSong)}</em>
      <em>Vidéo/Audio (B) : ${formatRevealLine(audioSong)}</em>
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
      <em>Image (A) : ${formatAnimeLineFromSong(imageSong)}</em>
      <em>Vidéo/Audio (B) : ${formatRevealLine(audioSong)}</em>
      <div style="margin-top:8px;">Score : <b>0</b> / 3000</div>
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
        _image: getAnimeImage(a),
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();

    resetVisualsForRound();
    applyVolume();
    updateScoreBar(MAX_SCORE);
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
  });
