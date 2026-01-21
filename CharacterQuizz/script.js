/**********************
 * Character Quizz (CLASSIC ONLY)
 * - Dataset: ../data/licenses_only.json (format MAL + characters/top_characters)
 * - Personnalisation: popularité/score/années/types + rounds
 * - Pas de daily
 **********************/

const MAX_SCORE = 3000;
const MIN_REQUIRED = 64;

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
  const s = (a.season || "").trim(); // ex "spring 2013"
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

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

// Sélection des persos: on prend une liste (top_characters si dispo, sinon characters),
// puis on la coupe en 6 groupes et on pick 1 random par groupe.
function splitCharacters(characters) {
  const N = characters.length;

  if (N < 6) {
    const groups = [];
    for (let i = 0; i < 6; i++) groups.push(i < N ? [characters[i]] : []);
    return groups;
  }

  const baseSize = Math.floor(N / 6);
  const surplus = N % 6;
  const groupSizes = Array(6).fill(baseSize);

  // surplus sur les derniers groupes (souvent plus "populaires" si la liste est triée)
  for (let i = 0; i < surplus; i++) groupSizes[5 - i] += 1;

  const groups = [];
  let start = 0;
  for (let i = 0; i < 6; i++) {
    groups.push(characters.slice(start, start + groupSizes[i]));
    start += groupSizes[i];
  }
  return groups;
}

function pickRandomPerGroup(characters) {
  const groups = splitCharacters(characters);
  return groups
    .map((g) => {
      if (g.length === 0) return null;
      if (g.length === 1) return g[0];
      return g[Math.floor(Math.random() * g.length)];
    })
    .filter(Boolean);
}

// ====== SCORE BAR ======
function updateScoreBar(score = 3000) {
  const bar = document.getElementById("score-bar");
  const label = document.getElementById("score-bar-label");
  const percent = Math.max(0, Math.min(100, (score / 3000) * 100));

  bar.style.width = percent + "%";
  label.textContent = `${score} / 3000`;

  if (score === 3000) bar.style.background = "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  else if (score >= 2000) bar.style.background = "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  else if (score >= 1000) bar.style.background = "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  else if (score > 0) bar.style.background = "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  else bar.style.background = "linear-gradient(90deg,#444,#333 90%)";
}

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
const roundsInputEl = document.getElementById("roundsCount");

const container = document.getElementById("character-container");
const feedback = document.getElementById("feedback");
const timerDisplay = document.getElementById("timer");
const input = document.getElementById("characterInput");
const submitBtn = document.getElementById("submit-btn");
const restartBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");

// ====== DATA ======
let allAnimes = [];
let filteredBase = []; // pool après personnalisation

// ====== ROUNDS STATE ======
let roundsTotal = 5;
let roundsLeft = 0;
let totalScore = 0;

// ====== GAME STATE ======
let currentAnime = null;
let revealedCount = 0;
let gameEnded = false;

let countdown = 7;
let countdownInterval = null;

let visibleCharacters = []; // persos affichés (6 max)

// ====== UI show/hide ======
function showCustomization() {
  if (customPanel) customPanel.style.display = "block";
  if (gamePanel) gamePanel.style.display = "none";
}

function showGame() {
  if (customPanel) customPanel.style.display = "none";
  if (gamePanel) gamePanel.style.display = "block";
}

// ====== PERSONALISATION UI INIT ======
function initPersonalisationUI() {
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));

  // rounds input guard
  if (roundsInputEl) {
    roundsInputEl.addEventListener("input", () => {
      let v = parseInt(roundsInputEl.value || "1", 10);
      if (!Number.isFinite(v)) v = 1;
      v = Math.max(1, Math.min(50, v));
      roundsInputEl.value = String(v);
    });
  }

  // type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    filteredBase = applyFilters();

    if (filteredBase.length < MIN_REQUIRED) {
      alert(`Pas assez de titres pour lancer (${filteredBase.length}/${MIN_REQUIRED}).`);
      return;
    }

    roundsTotal = Math.max(1, Math.min(50, parseInt(roundsInputEl?.value || "5", 10) || 5));
    roundsLeft = roundsTotal;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  // 1) année + type
  let pool = allAnimes.filter((a) => a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type));

  // 2) popularité top %
  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // 3) score top %
  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

// ====== PREVIEW ======
function updatePreview() {
  const pool = applyFilters();
  const ok = pool.length >= MIN_REQUIRED;

  previewCountEl.textContent = `📚 Titres disponibles : ${pool.length} ${ok ? "(OK)" : "(Min 64)"}`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
}

// ====== ROUND FLOW ======
function pickCharactersForAnime(anime) {
  const list = safeArray(anime.top_characters).length ? anime.top_characters : safeArray(anime.characters);
  const cleaned = list
    .map((c) => ({
      name: String(c?.name || "").trim(),
      image: String(c?.image || "").trim(),
    }))
    .filter((c) => c.name && c.image);

  return pickRandomPerGroup(cleaned).slice(0, 6);
}

function resetRoundUI() {
  container.innerHTML = "";
  feedback.textContent = "";
  feedback.className = "";
  timerDisplay.textContent = "";
  suggestions.innerHTML = "";

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;

  restartBtn.style.display = "none";
  restartBtn.textContent = "Suivant";

  revealedCount = 0;
  gameEnded = false;

  clearInterval(countdownInterval);
  countdownInterval = null;

  updateScoreBar(3000);
}

function startNewRound() {
  if (!filteredBase || filteredBase.length < MIN_REQUIRED) {
    showCustomization();
    return;
  }

  if (roundsLeft <= 0) {
    showFinalRecap();
    return;
  }

  resetRoundUI();

  // pick anime
  currentAnime = filteredBase[Math.floor(Math.random() * filteredBase.length)];

  // pick 6 characters
  visibleCharacters = pickCharactersForAnime(currentAnime);

  // render hidden imgs
  visibleCharacters.forEach((char, i) => {
    const img = document.createElement("img");
    img.src = char.image;
    img.alt = char.name;
    img.className = "character-img";
    img.id = "char-" + i;
    img.style.display = "none";
    container.appendChild(img);
  });

  revealNextCharacter();

  input.focus();
}

// ====== REVEAL + TIMER ======
function revealNextCharacter() {
  if (revealedCount < visibleCharacters.length) {
    const img = document.getElementById("char-" + revealedCount);
    if (img) img.style.display = "block";

    const potentialScore = Math.max(3000 - revealedCount * 500, 0);
    updateScoreBar(potentialScore);

    revealedCount++;
    resetTimer();
  }
}

function resetTimer() {
  countdown = 7;
  timerDisplay.textContent = `Temps restant : ${countdown} s`;
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    countdown--;

    if (countdown <= 0) {
      clearInterval(countdownInterval);

      if (gameEnded) return;

      if (revealedCount >= visibleCharacters.length) {
        // Lose by time
        feedback.textContent = `⏰ Temps écoulé ! Tu as perdu. C'était "${currentAnime._title}".`;
        feedback.className = "error";
        endRound(0, false);
      } else {
        revealNextCharacter();
      }
    } else {
      timerDisplay.textContent = `Temps restant : ${countdown} s`;
    }
  }, 1000);
}

// ====== AUTOCOMPLETE ======
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  submitBtn.disabled = true;

  if (!val) return;

  const uniqueTitles = [...new Set(filteredBase.map((a) => a._title))];
  const matches = uniqueTitles.filter((t) => t.toLowerCase().includes(val));
  shuffleInPlace(matches);

  matches.slice(0, 7).forEach((title) => {
    const div = document.createElement("div");
    div.innerHTML = `<span>${title.replace(new RegExp(val, "i"), (m) => `<b>${m}</b>`)}</span>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = title;
      suggestions.innerHTML = "";
      submitBtn.disabled = false;
      input.focus();
    });
    suggestions.appendChild(div);
  });

  // enable submit only if exact match exists
  const titlesLower = filteredBase.map((a) => a._titleLower);
  submitBtn.disabled = !titlesLower.includes(val);
});

input.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) {
    checkGuess();
  }
});

submitBtn.addEventListener("click", () => checkGuess());

document.addEventListener("click", (e) => {
  if (e.target !== input) suggestions.innerHTML = "";
});

// ====== GUESS ======
function computeRoundScore(isWin) {
  if (!isWin) return 0;
  const malus = (revealedCount - 1) * 500;
  return Math.max(3000 - malus, 0);
}

function revealAllCharacters() {
  for (let i = 0; i < visibleCharacters.length; i++) {
    const img = document.getElementById("char-" + i);
    if (img) img.style.display = "block";
  }
}

function checkGuess() {
  if (gameEnded) return;

  const guess = input.value.trim().toLowerCase();
  if (!guess) {
    feedback.textContent = "⚠️ Tu dois écrire un nom d'anime.";
    feedback.className = "error";
    return;
  }

  const isCorrect = guess === currentAnime._titleLower;

  if (isCorrect) {
    const score = computeRoundScore(true);
    updateScoreBar(score);
    if (score > 0) launchFireworks();

    feedback.textContent = `🎉 Bonne réponse ! C'était bien "${currentAnime._title}"`;
    feedback.className = "success";

    clearInterval(countdownInterval);
    revealAllCharacters();

    endRound(score, true);
  } else {
    feedback.textContent = "❌ Mauvaise réponse.";
    feedback.className = "error";

    if (revealedCount < visibleCharacters.length) {
      clearInterval(countdownInterval);
      revealNextCharacter();
    } else {
      updateScoreBar(0);
      feedback.textContent += ` Tu as épuisé tous les indices. C'était "${currentAnime._title}".`;
      endRound(0, false);
    }
  }

  input.value = "";
  submitBtn.disabled = true;
  input.focus();
  suggestions.innerHTML = "";
}

function endRound(score, isWin) {
  gameEnded = true;

  clearInterval(countdownInterval);
  countdownInterval = null;

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  // rounds
  totalScore += score;
  roundsLeft = Math.max(0, roundsLeft - 1);

  // bouton suivant / terminer
  restartBtn.style.display = "inline-block";
  restartBtn.textContent = roundsLeft > 0 ? "Suivant" : "Terminer";
  timerDisplay.textContent = roundsLeft > 0 ? `Round terminé. (${roundsTotal - roundsLeft}/${roundsTotal})` : "Série terminée.";

  restartBtn.onclick = () => {
    if (roundsLeft > 0) startNewRound();
    else showFinalRecap();
  };
}

function showFinalRecap() {
  // clean main area
  container.innerHTML = "";
  suggestions.innerHTML = "";
  input.value = "";
  input.disabled = true;
  submitBtn.disabled = true;

  const totalMax = roundsTotal * 3000;

  feedback.innerHTML = `
    <div style="font-size:1.25em; text-align:center;">
      🏁 Série terminée !<br>
      Score total : <b>${totalScore}</b> / ${totalMax}
    </div>
  `;
  feedback.className = "success";

  timerDisplay.textContent = "";
  restartBtn.style.display = "inline-block";
  restartBtn.textContent = "Rejouer";
  restartBtn.onclick = () => {
    // relance avec mêmes réglages
    roundsLeft = roundsTotal;
    totalScore = 0;
    startNewRound();
  };
}

// ====== TOOLTIP AIDE ======
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

// ====== LOAD DATASET ======
fetch("../data/licenses_only.json")
  .then((r) => r.json())
  .then((data) => {
    // normalize
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

    initPersonalisationUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
    console.error(e);
  });
