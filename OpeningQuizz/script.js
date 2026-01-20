/**********************
 * Guess The Opening
 * Dataset: ../data/licenses_only.json
 * - Personnalisation (comme tournoi): popularité/score/années/types + songs (OP/ED/IN)
 * - Default: ONLY OPENINGS (ED/IN off)
 * - Pas de daily
 * - Player caché pendant la partie, reveal seulement à la fin
 **********************/

const MAX_SCORE = 3000;
const MIN_REQUIRED_SONGS = 62;

// scoring (identique logique)
const SCORE_TRY1 = 3000;
const SCORE_TRY2 = 2000;
const SCORE_TRY3 = 1500;
const SCORE_TRY3_WITH_6 = 1000;
const SCORE_TRY3_WITH_3 = 500;

// ====== MENU + THEME ======
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

// ====== HELPERS ======
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
  const s = (a.season || "").trim(); // ex: "spring 2013"
  const parts = s.split(/\s+/);
  const y = parseInt(parts[1] || parts[0] || "0", 10);
  return Number.isFinite(y) ? y : 0;
}

function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
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

function formatRevealLine(song) {
  const typeLabel = song.songType === "OP" ? "Opening" : song.songType === "ED" ? "Ending" : "Insert";
  const num = song.songNumber ? ` ${song.songNumber}` : "";
  const partName = song.songName ? ` : ${song.songName}` : "";
  const artists = (song.songArtists && song.songArtists.length)
    ? ` — ${song.songArtists.join(", ")}`
    : "";
  return `${song.animeTitle} — ${typeLabel}${num}${partName}${artists}`;
}

// ====== DOM REFS ======
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

const playerWrapper = document.getElementById("playerWrapper"); // conteneur de l'audio/vidéo
const audioPlayer = document.getElementById("audioPlayer");     // <video id="audioPlayer"> (caché)

// ====== DATA ======
let allAnimes = [];
let allSongs = [];
let filteredSongs = [];

// ====== ROUND STATE ======
let currentSong = null;
let tries = 0;
let failedAnswers = [];

let indice6Used = false;
let indice3Used = false;
let indiceActive = false;

let stopTimer = null;
const tryDurations = [15, 15, null]; // 3e écoute complète
let currentStart = 0;

// ====== SHOW/HIDE (perso vs jeu) ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== SCORE BAR ======
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

function finalScore() {
  if (tries === 1) return SCORE_TRY1;
  if (tries === 2) return SCORE_TRY2;
  if (tries === 3 && indice3Used) return SCORE_TRY3_WITH_3;
  if (tries === 3 && indice6Used) return SCORE_TRY3_WITH_6;
  if (tries === 3) return SCORE_TRY3;
  return 0;
}

// ====== SONG EXTRACTION (structure confirmée) ======
function extractSongsFromAnime(anime) {
  const songs = [];
  const songBlock = anime.song || {};

  const pushList = (list, type) => {
    if (!Array.isArray(list)) return;
    for (const s of list) {
      if (!s || typeof s.video !== "string" || !s.video) continue;

      songs.push({
        animeMalId: anime.mal_id ?? null,
        animeTitle: anime._title,
        animeTitleLower: anime._titleLower,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

        songType: type, // OP/ED/IN
        songNumber: safeNum(s.number) || 1,
        songName: s.name || "",
        songArtists: Array.isArray(s.artists) ? s.artists : [],
        songSeason: s.season || anime.season || "",
        url: s.video
      });
    }
  };

  pushList(songBlock.openings, "OP");
  pushList(songBlock.endings, "ED");
  pushList(songBlock.inserts, "IN");

  return songs;
}

// ====== AUDIO PLAYBACK ======
function stopPlayback() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  try {
    audioPlayer.pause();
  } catch {}
}

function playSegment(tryNum) {
  if (!currentSong) return;

  if (tryNum !== tries + 1) {
    alert("Vous devez écouter les extraits dans l'ordre.");
    return;
  }

  tries = tryNum;
  updateScoreBar();

  // input activé après 1ère écoute
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

  // start: refrain ~50s sur try2
  currentStart = 0;
  if (tries === 2) currentStart = 50;
  if (tries === 3) currentStart = 0;

  // player caché pendant la partie
  playerWrapper.style.display = "none";
  audioPlayer.controls = false;

  stopPlayback();

  audioPlayer.src = currentSong.url;
  audioPlayer.currentTime = currentStart;

  audioPlayer.play().catch(() => {
    resultDiv.textContent = "❌ Impossible de lire cette vidéo/audio.";
    resultDiv.className = "incorrect";
  });

  const duration = tryDurations[tries - 1];
  if (duration != null) {
    stopTimer = setTimeout(() => {
      audioPlayer.pause();
    }, duration * 1000);
  }

  // boutons
  playTry1Btn.disabled = true;
  playTry2Btn.disabled = tries !== 1;
  playTry3Btn.disabled = tries !== 2;
}

// ====== INDICES (3e écoute) ======
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

// ====== ROUND RESET/START ======
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

  // caché tant que pas fini
  playerWrapper.style.display = "none";
  audioPlayer.controls = false;

  updateScoreBar(3000);
}

function startNewRound() {
  resetControls();

  currentSong = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];

  // on précharge metadata, puis active try1
  audioPlayer.src = currentSong.url;
  audioPlayer.preload = "metadata";

  audioPlayer.onloadedmetadata = () => {
    playTry1Btn.disabled = false;
  };

  audioPlayer.onerror = () => {
    // si song dead => on relance une autre
    startNewRound();
  };
}

// ====== GUESS ======
function updateFailedAttempts() {
  failedAttemptsDiv.innerText = failedAnswers.map((e) => `❌ ${e}`).join("\n");
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

function revealSongAndPlayer() {
  // reveal uniquement FIN
  playerWrapper.style.display = "block";
  audioPlayer.controls = true;
}

function checkAnswer(selectedTitle) {
  if (!currentSong) return;

  const inputVal = selectedTitle.trim().toLowerCase();
  const good = inputVal === currentSong.animeTitleLower;

  if (good) {
    const score = finalScore();

    resultDiv.innerHTML =
      `🎉 Bravo !<br><b>${currentSong.animeTitle}</b>` +
      `<br><em>${formatRevealLine(currentSong)}</em>` +
      `<br><span style="font-size:1.05em;">Score : <b>${score}</b> / 3000</span>`;

    resultDiv.className = "correct";

    stopPlayback();
    revealSongAndPlayer();
    launchFireworks();

    blockInputsAll();

    nextBtn.style.display = "block";
    nextBtn.textContent = "Rejouer";
    nextBtn.onclick = () => startNewRound();

    updateScoreBar(score);
    return;
  }

  failedAnswers.push(selectedTitle);
  updateFailedAttempts();

  if (tries >= 3) {
    resultDiv.innerHTML =
      `🔔 Réponse : <b>${currentSong.animeTitle}</b>` +
      `<br><em>${formatRevealLine(currentSong)}</em>`;
    resultDiv.className = "incorrect";

    stopPlayback();
    revealSongAndPlayer();

    blockInputsAll();

    nextBtn.style.display = "block";
    nextBtn.textContent = "Rejouer";
    nextBtn.onclick = () => startNewRound();

    updateScoreBar(0);
  } else {
    // force écoute suivante
    openingInput.disabled = true;
  }
}

// ====== AUTOCOMPLETE ======
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

// ====== BUTTONS ======
playTry1Btn.addEventListener("click", () => playSegment(1));
playTry2Btn.addEventListener("click", () => playSegment(2));
playTry3Btn.addEventListener("click", () => playSegment(3));

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
    document.querySelectorAll(".info-wrap.open").forEach((w) => w.classList.remove("open"));
  }
});

// ====== FIREWORKS ======
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

// ====== PERSONALISATION UI ======
function initCustomUI() {
  // default songs: OP only (si ton HTML a déjà active sur Opening, on force quand même ici)
  const songBtns = [...document.querySelectorAll("#songPills .pill")];
  if (songBtns.length) {
    songBtns.forEach((b) => {
      const isOP = b.dataset.song === "OP";
      b.classList.toggle("active", isOP);
      b.setAttribute("aria-pressed", isOP ? "true" : "false");
    });
  }

  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));

  // type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // song pills
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    filteredSongs = applyFilters();
    if (filteredSongs.length < MIN_REQUIRED_SONGS) {
      alert(`Pas assez de songs pour lancer (${filteredSongs.length}/${MIN_REQUIRED_SONGS}).`);
      return;
    }
    showGame();
    startNewRound();
  });

  syncLabels();
}

function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value,  समझ 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song); // OP/ED/IN

  if (allowedTypes.length === 0 || allowedSongs.length === 0) return [];

  // 1) filtre par year/type + songType
  let pool = allSongs.filter((s) => {
    return (
      s.animeYear >= yearMin &&
      s.animeYear <= yearMax &&
      allowedTypes.includes(s.animeType) &&
      allowedSongs.includes(s.songType)
    );
  });

  // 2) top pop% par members
  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // 3) top score% par score
  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

function updatePreview() {
  const pool = applyFilters();
  const ok = pool.length >= MIN_REQUIRED_SONGS;

  previewCountEl.textContent = `🎵 Songs disponibles : ${pool.length} ${ok ? "(OK)" : "(trop peu)"}`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
}

// ====== LOAD DATA ======
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
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
