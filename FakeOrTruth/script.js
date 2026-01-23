/**********************
 * Fake Or Truth — Sync A/V (AUTO START)
 * - Vidéo = Song A ; Audio = Song B
 * - Auto-start dès que A+B prêts
 * - Une seule écoute : 45s -> 75s (30s)
 * - Réponse : Match / Pas match
 * - Reveal : vidéo A AVEC son vrai audio (controls)
 * - Distribution :
 *    1/3 A = B
 *    1/3 A != B & anime différent
 *    1/3 A != B mais même anime (si possible sinon fallback anime différent)
 * - Loader robuste : retry “pair” (A+B) + anti-loop
 **********************/

const MAX_SCORE = 3000;
const MIN_REQUIRED_SONGS = 64;

// retry pair (A+B)
const RETRY_DELAYS = [0, 2000, 6000];
const LOAD_TIMEOUT_MS = 14000;

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

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
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

const btnMatch = document.getElementById("btnMatch");
const btnNoMatch = document.getElementById("btnNoMatch");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");
const roundLabel = document.getElementById("roundLabel");

const videoPlayer = document.getElementById("videoPlayer");
const audioPlayer = document.getElementById("audioPlayer");

const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== Status ======
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

// ====== WebM support ======
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

let listenLocked = true;   // tant que lecture pas faite
let roundToken = 0;

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
  if (!audioPlayer || !volumeSlider) return;
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "50", 10)));
  audioPlayer.volume = v / 100;
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== UI show/hide ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== Playback helpers ======
function hardReset(el) {
  try { el.pause(); } catch {}
  el.removeAttribute("src");
  el.load();
}

function stopPlayback() {
  try { videoPlayer.pause(); } catch {}
  try { audioPlayer.pause(); } catch {}
}

function lockPlayersForGame() {
  // jeu : vidéo muette, audio B ok
  videoPlayer.muted = true;
  videoPlayer.controls = false;
  videoPlayer.removeAttribute("controls");

  audioPlayer.muted = false;
  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");
  audioPlayer.style.display = "none";

  applyVolume();
}

function revealVideoAWithItsAudio() {
  // reveal : vidéo A avec son audio
  stopPlayback();
  try { audioPlayer.removeAttribute("src"); audioPlayer.load(); } catch {}

  videoPlayer.muted = false;
  videoPlayer.controls = true;
  videoPlayer.setAttribute("controls", "controls");
  try { videoPlayer.currentTime = 0; } catch {}
}

// ====== Promises events ======
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

async function seekSafe(el, t, localToken) {
  if (localToken !== roundToken) return false;

  // clamp si duration connue
  const dur = Number.isFinite(el.duration) ? el.duration : NaN;
  let target = t;
  if (Number.isFinite(dur)) target = Math.max(0, Math.min(dur - 0.25, t));

  try { el.currentTime = target; } catch {}

  // attendre seeked (ou canplay si seeked ne vient pas)
  try {
    await waitEvent(el, "seeked", ["error"], 9000, localToken);
    return true;
  } catch {
    // fallback : si readyState ok, on accepte
    return el.readyState >= 3;
  }
}

// ====== Segment stop “ensemble” ======
let segmentActive = false;
let segmentEnd = 0;
function clearSegment() {
  segmentActive = false;
  segmentEnd = 0;
  videoPlayer.removeEventListener("timeupdate", onSegmentTick);
  audioPlayer.removeEventListener("timeupdate", onSegmentTick);
}
function onSegmentTick() {
  if (!segmentActive) return;
  const tv = videoPlayer.currentTime || 0;
  const ta = audioPlayer.currentTime || 0;
  const t = Math.max(tv, ta);
  if (t >= segmentEnd - 0.05) {
    try { videoPlayer.pause(); } catch {}
    try { audioPlayer.pause(); } catch {}
    clearSegment();
    setMediaStatus("✅ À toi : Match ou Pas match ?");
    listenLocked = false;
    btnMatch.disabled = false;
    btnNoMatch.disabled = false;
  }
}
function armSegment(start, dur) {
  clearSegment();
  segmentActive = true;
  segmentEnd = start + dur;
  videoPlayer.addEventListener("timeupdate", onSegmentTick);
  audioPlayer.addEventListener("timeupdate", onSegmentTick);
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
  if (!A || !A.url) return null;

  const r = Math.floor(Math.random() * 3); // 0,1,2

  if (r === 0) return { A, B: A, isMatch: true };
  if (r === 2) {
    const Bsame = pickSameAnimeDifferentSong(A);
    if (Bsame) return { A, B: Bsame, isMatch: false };
    return { A, B: pickDifferentAnimeSong(A), isMatch: false };
  }
  return { A, B: pickDifferentAnimeSong(A), isMatch: false };
}

// ====== Reset / Round ======
function resetControls() {
  listenLocked = true;

  resultDiv.textContent = "";
  resultDiv.className = "";

  btnMatch.disabled = true;
  btnNoMatch.disabled = true;

  nextBtn.style.display = "none";
  nextBtn.onclick = null;

  stopPlayback();
  clearSegment();
  lockPlayersForGame();

  updateScoreBar(MAX_SCORE);

  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
  setMediaStatus("");
}

function startNewRound() {
  roundToken++;
  const localToken = roundToken;

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

  // AUTO START
  autoStartPlayback(localToken);
}

// ====== ✅ AUTO START LOADER “PAIR” ======
async function autoStartPlayback(localToken) {
  // on tente A+B ensemble
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (localToken !== roundToken) return;

    if (attempt > 0) {
      setMediaStatus(`🔄 Rechargement… (${attempt + 1}/${RETRY_DELAYS.length})`);
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      if (localToken !== roundToken) return;
    } else {
      setMediaStatus("⏳ Chargement A + B…");
    }

    try {
      // reset
      hardReset(videoPlayer);
      hardReset(audioPlayer);

      // src (bust à partir de la 2e tentative)
      const vsrc = attempt === 0 ? videoSong.url : withCacheBuster(videoSong.url);
      const asrc = attempt === 0 ? audioSong.url : withCacheBuster(audioSong.url);

      videoPlayer.preload = "auto";
      audioPlayer.preload = "auto";
      videoPlayer.src = vsrc;
      audioPlayer.src = asrc;
      videoPlayer.load();
      audioPlayer.load();

      // attendre metadata des 2
      await Promise.all([
        waitEvent(videoPlayer, "loadedmetadata", ["error"], LOAD_TIMEOUT_MS, localToken),
        waitEvent(audioPlayer, "loadedmetadata", ["error"], LOAD_TIMEOUT_MS, localToken),
      ]);

      if (localToken !== roundToken) return;

      // seek 45s sur les 2
      setMediaStatus("⏳ Buffer (45s)…");
      const okSeek = await Promise.all([
        seekSafe(videoPlayer, LISTEN_START, localToken),
        seekSafe(audioPlayer, LISTEN_START, localToken),
      ]);
      if (!okSeek[0] || !okSeek[1]) throw new Error("seek-failed");
      if (localToken !== roundToken) return;

      lockPlayersForGame();
      applyVolume();

      // arm segment stop
      armSegment(LISTEN_START, LISTEN_DURATION);

      // try play
      setMediaStatus("▶️ Lecture…");
      const pV = videoPlayer.play();
      const pA = audioPlayer.play();

      const res = await Promise.allSettled([pV, pA]);
      if (localToken !== roundToken) return;

      const rejected = res.some(r => r.status === "rejected");
      if (!rejected) {
        // petit “nudge” anti-désync
        setTimeout(() => {
          if (localToken !== roundToken) return;
          const dv = (audioPlayer.currentTime || 0) - (videoPlayer.currentTime || 0);
          if (Math.abs(dv) > 0.12) {
            try { audioPlayer.currentTime = videoPlayer.currentTime; } catch {}
          }
        }, 700);

        // pendant la lecture, on peut déjà répondre (si tu veux)
        btnMatch.disabled = false;
        btnNoMatch.disabled = false;
        listenLocked = false;
        return; // ✅ succès, on sort
      }

      // autoplay bloqué => fallback “clique n’importe où”
      setMediaStatus("▶️ Clique n’importe où pour lancer");
      const container = document.getElementById("container");
      const onTap = async () => {
        container.removeEventListener("click", onTap);
        if (localToken !== roundToken) return;
        try {
          await Promise.all([videoPlayer.play(), audioPlayer.play()]);
          setMediaStatus("▶️ Lecture…");
          btnMatch.disabled = false;
          btnNoMatch.disabled = false;
          listenLocked = false;
        } catch {
          // si vraiment impossible, on retente un autre duel
          startNewRound();
        }
      };
      container.addEventListener("click", onTap, { once: true });
      return;
    } catch {
      // tente suivante
    }
  }

  // échec total => on change de duel
  setMediaStatus("❌ Trop lent / indisponible. Changement…");
  startNewRound();
}

// ====== Answer ======
function blockInputsAll() {
  btnMatch.disabled = true;
  btnNoMatch.disabled = true;
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

  // si tu veux forcer "doit avoir entendu", décommente :
  // if (listenLocked) return;

  const good = (userSaysMatch === isMatch);

  stopPlayback();
  clearSegment();
  revealVideoAWithItsAudio();
  blockInputsAll();

  if (good) {
    const score = MAX_SCORE;
    resultDiv.innerHTML = `
      🎉 Bonne réponse !<br>
      <b>${isMatch ? "✅ TRUTH (MATCH)" : "❌ FAKE (NO MATCH)"}</b>
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
    Réponse correcte : <b>${isMatch ? "✅ TRUTH (MATCH)" : "❌ FAKE (NO MATCH)"}</b>
    <em>Vidéo (A) : ${formatRevealLine(videoSong)}</em>
    <em>Audio (B) : ${formatRevealLine(audioSong)}</em>
    <div style="margin-top:8px;">Score : <b>0</b> / 3000</div>
  `;
  resultDiv.className = "incorrect";
  updateScoreBar(0);
  endRoundAndMaybeNext(0);
}

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
    applyVolume();
    lockPlayersForGame();
    updateScoreBar(MAX_SCORE);
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
  });
