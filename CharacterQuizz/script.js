/**********************
 * Character Quizz
 * - Dataset: ../data/licenses_only.json
 * - Personnalisation: popularité/score/années/types + rounds
 * - Pas de daily
 * - Affiche 6 personnages (tirés UNIQUEMENT de "characters")
 * - Ordre d’apparition: du + obscur au + connu (on prend les 6 derniers groupes du tableau "characters",
 *   puis on tire 1 perso aléatoire dans chaque groupe, et on révèle du groupe 1 -> 6)
 * - Score max 3000, -500 par personnage révélé (auto toutes les 8s ou après un essai)
 **********************/

const MAX_SCORE = 3000;
const STEP_PENALTY = 500;     // -500 par reveal
const REVEAL_INTERVAL = 8000; // 8s (comme ton tooltip)

/* ======================
   MENU + THEME
====================== */
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

/* ======================
   HELPERS (dataset)
====================== */
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

/* ======================
   DOM refs
====================== */
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

const container = document.getElementById("character-container");
const feedback = document.getElementById("feedback");
const timerDisplay = document.getElementById("timer");

const input = document.getElementById("characterInput");
const submitBtn = document.getElementById("submit-btn");
const restartBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");

const roundLabel = document.getElementById("roundLabel");

/* ======================
   UI show/hide
====================== */
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
  document.body.classList.remove("game-started");
}

function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
  document.body.classList.add("game-started");
}

/* ======================
   Score bar
====================== */
function getScoreBarColor(score) {
  if (score >= 2500) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= 1500) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score >= 1000) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  if (score > 0) return "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  return "linear-gradient(90deg,#444,#333 90%)";
}

function updateScoreBar(score = MAX_SCORE) {
  const bar = document.getElementById("score-bar");
  const label = document.getElementById("score-bar-label");
  const percent = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));
  label.textContent = `${score} / ${MAX_SCORE}`;
  bar.style.width = percent + "%";
  bar.style.background = getScoreBarColor(score);
}

/* ======================
   Fireworks
====================== */
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

/* ======================
   Character selection logic
   - UTILISE UNIQUEMENT anime.characters
   - on considère que "characters" est trié du moins important -> plus important
   - on coupe en 6 groupes, mais le surplus va aux derniers groupes (les plus connus)
   - on tire 1 perso aléatoire par groupe
   - révélation du 1er groupe au 6e (du + obscur au + connu)
====================== */
function splitCharactersInto6(characters) {
  const N = characters.length;

  // Si moins de 6 persos: groupes avec trous
  if (N < 6) {
    const groups = [];
    for (let i = 0; i < 6; i++) groups.push(i < N ? [characters[i]] : []);
    return groups;
  }

  const baseSize = Math.floor(N / 6);
  const surplus = N % 6;

  const sizes = Array(6).fill(baseSize);
  // surplus -> derniers groupes (plus connus)
  for (let i = 0; i < surplus; i++) sizes[5 - i] += 1;

  const groups = [];
  let start = 0;
  for (let i = 0; i < 6; i++) {
    groups.push(characters.slice(start, start + sizes[i]));
    start += sizes[i];
  }
  return groups;
}

function pickOneRandomPerGroup(characters) {
  const groups = splitCharactersInto6(characters);
  return groups
    .map((g) => {
      if (!g || g.length === 0) return null;
      if (g.length === 1) return g[0];
      return g[Math.floor(Math.random() * g.length)];
    })
    .filter(Boolean);
}

/* ======================
   Data
====================== */
let allAnimes = [];
let filteredAnimes = [];

/* ======================
   Session (Rounds)
====================== */
let totalRounds = 5;
let currentRound = 1;
let totalScore = 0;

/* ======================
   Round state
====================== */
let currentAnime = null;
let visibleCharacters = [];
let revealedCount = 0;
let gameEnded = false;

let countdown = 8;
let countdownInterval = null;

/* ======================
   Filters (same spirit as OpeningQuizz)
====================== */
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  // 1) filtre de base
  let pool = allAnimes.filter((a) => {
    return a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type);
  });

  // 2) top pop% par members
  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // 3) top score% par score
  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  // 4) doit avoir au moins 1 personnage avec image (sinon injouable)
  pool = pool.filter((a) => Array.isArray(a.characters) && a.characters.some((c) => c && c.image));

  return pool;
}

function updatePreview() {
  const pool = applyFilters();
  const ok = pool.length >= 1; // ici, pas de min 64
  previewCountEl.textContent = ok ? `👤 Titres disponibles : ${pool.length} (OK)` : `👤 Titres disponibles : ${pool.length}`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

/* ======================
   Custom UI init
====================== */
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

  // type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    filteredAnimes = applyFilters();
    if (filteredAnimes.length < 1) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "5", 10), 1, 50);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

/* ======================
   Round flow
====================== */
function resetRoundUI() {
  container.innerHTML = "";
  feedback.textContent = "";
  feedback.className = "";
  suggestions.innerHTML = "";

  revealedCount = 0;
  gameEnded = false;

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;

  restartBtn.style.display = "none";
  restartBtn.textContent = currentRound < totalRounds ? "Suivant" : "Terminer";

  timerDisplay.textContent = "";

  clearInterval(countdownInterval);
  countdownInterval = null;

  updateScoreBar(MAX_SCORE);

  if (roundLabel) {
    roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;
  }
}

function startNewRound() {
  resetRoundUI();

  // pick anime
  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];

  // pick 6 characters (from characters only)
  const chars = Array.isArray(currentAnime.characters) ? currentAnime.characters : [];
  visibleCharacters = pickOneRandomPerGroup(chars);

  // render (hidden)
  visibleCharacters.forEach((char, i) => {
    const img = document.createElement("img");
    img.src = char.image;
    img.alt = char.name || "Character";
    img.className = "character-img";
    img.id = "char-" + i;
    img.style.display = "none";
    container.appendChild(img);
  });

  // reveal first immediately
  revealNextCharacter();
}

function currentPotentialScore() {
  // revealedCount = nb déjà affichés
  // score basé sur le nombre déjà révélé (coût par perso révélé)
  const score = Math.max(MAX_SCORE - (revealedCount - 1) * STEP_PENALTY, 0);
  return score;
}

function revealNextCharacter() {
  if (gameEnded) return;

  if (revealedCount < visibleCharacters.length) {
    const img = document.getElementById("char-" + revealedCount);
    if (img) img.style.display = "block";

    // revealedCount augmente après affichage
    revealedCount++;

    // score potentiel à ce moment (après reveal)
    const score = Math.max(MAX_SCORE - (revealedCount - 1) * STEP_PENALTY, 0);
    updateScoreBar(score);

    resetTimer();
  } else {
    // plus de persos -> perdu si pas déjà fini
    loseRound();
  }
}

/* ======================
   Timer (8s)
====================== */
function resetTimer() {
  countdown = 8;
  timerDisplay.textContent = `Temps restant : ${countdown} s`;
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;

      if (!gameEnded) {
        if (revealedCount >= visibleCharacters.length) loseRound();
        else revealNextCharacter();
      }
    } else {
      timerDisplay.textContent = `Temps restant : ${countdown} s`;
    }
  }, 1000);
}

/* ======================
   Autocomplete
====================== */
function buildUniqueTitles() {
  // titres des animes filtrés
  return [...new Set(filteredAnimes.map((a) => a._title))];
}

input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  submitBtn.disabled = true;

  if (!val) return;

  const titles = buildUniqueTitles();
  const found = titles
    .filter((t) => t.toLowerCase().includes(val))
    .slice(0, 7);

  found.forEach((title) => {
    const div = document.createElement("div");
    div.innerHTML = `<span>${title.replace(new RegExp(val, "i"), (m) => `<b>${m}</b>`)}</span>`;
    div.addEventListener("mousedown", function (e) {
      e.preventDefault();
      input.value = title;
      suggestions.innerHTML = "";
      submitBtn.disabled = false;
      input.focus();
    });
    suggestions.appendChild(div);
  });

  submitBtn.disabled = !titles.map((t) => t.toLowerCase()).includes(val);
});

input.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) {
    checkGuess();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".input-container")) suggestions.innerHTML = "";
});

/* ======================
   Guess logic
====================== */
function revealAllCharacters() {
  for (let i = 0; i < visibleCharacters.length; i++) {
    const img = document.getElementById("char-" + i);
    if (img) img.style.display = "block";
  }
}

function endRound(roundScore, won) {
  gameEnded = true;

  clearInterval(countdownInterval);
  countdownInterval = null;

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  totalScore += roundScore;

  // bouton next
  restartBtn.style.display = "inline-block";
  restartBtn.textContent = currentRound < totalRounds ? "Round suivant" : "Terminer";

  // timer text
  timerDisplay.textContent = "Round terminé.";

  // si fin de série: affiche total + bouton retour réglages
  if (currentRound >= totalRounds) {
    const extra = document.createElement("div");
    extra.style.marginTop = "10px";
    extra.style.fontWeight = "900";
    extra.style.opacity = "0.95";
    extra.innerHTML = `✅ Série terminée !<br>Score total : <b>${totalScore}</b> / <b>${totalRounds * MAX_SCORE}</b>`;
    feedback.appendChild(extra);

    restartBtn.textContent = "Retour réglages";
  }
}

function winRound() {
  const score = Math.max(MAX_SCORE - (revealedCount - 1) * STEP_PENALTY, 0);
  updateScoreBar(score);
  if (score > 0) launchFireworks();

  revealAllCharacters();

  feedback.textContent = `🎉 Bonne réponse ! C'était bien "${currentAnime._title}" | Score : ${score} / ${MAX_SCORE}`;
  feedback.className = "success";

  endRound(score, true);
}

function loseRound() {
  updateScoreBar(0);
  revealAllCharacters();

  feedback.textContent = `❌ Perdu. C'était "${currentAnime._title}" | Score : 0 / ${MAX_SCORE}`;
  feedback.className = "error";

  endRound(0, false);
}

function checkGuess() {
  if (gameEnded) return;

  const guess = input.value.trim();
  if (!guess) {
    feedback.textContent = "⚠️ Tu dois écrire un nom d'anime.";
    feedback.className = "error";
    return;
  }

  const normalizedGuess = guess.toLowerCase();
  const answer = currentAnime._titleLower;

  if (normalizedGuess === answer) {
    winRound();
  } else {
    feedback.textContent = "❌ Mauvaise réponse.";
    feedback.className = "error";

    // chaque essai déclenche un reveal immédiat (comme avant)
    if (revealedCount < visibleCharacters.length) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      revealNextCharacter();
    } else {
      loseRound();
    }
  }

  input.value = "";
  submitBtn.disabled = true;
  input.focus();
  suggestions.innerHTML = "";
}

/* ======================
   Buttons
====================== */
submitBtn.addEventListener("click", () => checkGuess());

restartBtn.addEventListener("click", () => {
  if (currentRound >= totalRounds) {
    // retour réglages
    showCustomization();
    // reset "soft"
    suggestions.innerHTML = "";
    input.value = "";
    feedback.textContent = "";
    timerDisplay.textContent = "";
    container.innerHTML = "";
    updatePreview();
    return;
  }

  currentRound += 1;
  startNewRound();
});

/* ======================
   Tooltip (icône info)
====================== */
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

/* ======================
   Load dataset
====================== */
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

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
