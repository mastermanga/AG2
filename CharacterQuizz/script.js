const MAX_SCORE = 3000;
const REVEAL_STEP = 500;
const REVEAL_INTERVAL_SEC = 8;
const MAX_REVEALS = 6;

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

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

function randomPick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/* 6 catégories (du moins connu au plus connu) */
function pick6CharactersByBuckets(characters) {
  if (!Array.isArray(characters) || characters.length === 0) return [];

  const clean = characters.filter(
    (c) => c && typeof c.name === "string" && c.name && typeof c.image === "string" && c.image
  );
  if (clean.length === 0) return [];

  const bucketsCount = MAX_REVEALS;

  if (clean.length <= bucketsCount) {
    const tmp = [...clean];
    shuffleInPlace(tmp);
    return tmp.slice(0, bucketsCount);
  }

  const base = Math.floor(clean.length / bucketsCount);
  const remainder = clean.length % bucketsCount;

  const buckets = [];
  let idx = 0;
  for (let i = 0; i < bucketsCount; i++) {
    const size = base + (i < remainder ? 1 : 0);
    buckets.push(clean.slice(idx, idx + size));
    idx += size;
  }

  const picked = [];
  for (let i = 0; i < buckets.length; i++) {
    const p = randomPick(buckets[i]);
    if (p) picked.push(p);
  }

  while (picked.length < bucketsCount) {
    const extra = randomPick(clean);
    if (extra) picked.push(extra);
  }

  return picked.slice(0, bucketsCount);
}

/* DOM */
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

const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

/* Data */
let allAnimes = [];
let filteredAnimes = [];

/* Session */
let totalRounds = 1;  // ✅ défaut = 1
let currentRound = 1;
let totalScore = 0;

/* Round state */
let currentAnime = null;
let visibleCharacters = [];
let revealedCount = 0;
let gameEnded = false;

let countdown = REVEAL_INTERVAL_SEC;
let countdownInterval = null;

function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

function getScoreBarColor(score) {
  if (score >= 2500) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= 1500) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score >= 1000) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  if (score > 0) return "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  return "linear-gradient(90deg,#444,#333 90%)";
}

function setScoreBar(score) {
  const s = Math.max(0, Math.min(MAX_SCORE, score));
  const pct = Math.max(0, Math.min(100, (s / MAX_SCORE) * 100));
  scoreBar.style.width = pct + "%";
  scoreBar.style.background = getScoreBarColor(s);
  scoreBarLabel.textContent = `${s} / ${MAX_SCORE}`;
}

function currentPotentialScore() {
  const malus = Math.max(0, (revealedCount - 1) * REVEAL_STEP);
  return Math.max(MAX_SCORE - malus, 0);
}

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

  applyBtn.addEventListener("click", () => {
    filteredAnimes = applyFilters();
    if (filteredAnimes.length === 0) return;

    // ✅ 1 à 100, défaut = 1
    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  let pool = allAnimes.filter((a) => {
    return (
      a._year >= yearMin &&
      a._year <= yearMax &&
      allowedTypes.includes(a._type) &&
      Array.isArray(a.characters) &&
      a.characters.length > 0
    );
  });

  if (pool.length === 0) return [];

  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  pool = pool.filter((a) => (a.characters || []).some((c) => c && c.image));
  return pool;
}

function updatePreview() {
  const pool = applyFilters();
  const ok = pool.length > 0;

  previewCountEl.textContent = ok
    ? `👤 Titres disponibles : ${pool.length} (OK)`
    : `👤 Titres disponibles : 0 (Min 1)`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
}

function resetRoundUI() {
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  container.innerHTML = "";
  feedback.textContent = "";
  feedback.className = "";
  timerDisplay.textContent = "";

  revealedCount = 0;
  gameEnded = false;

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;

  restartBtn.style.display = "none";
  restartBtn.textContent = currentRound < totalRounds ? "Suivant" : "Terminer";

  suggestions.innerHTML = "";

  clearInterval(countdownInterval);
  countdownInterval = null;

  setScoreBar(MAX_SCORE);
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
  visibleCharacters = pick6CharactersByBuckets(currentAnime.characters);

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
}

function revealNextCharacter() {
  if (!currentAnime || gameEnded) return;

  if (revealedCount < visibleCharacters.length) {
    const img = document.getElementById("char-" + revealedCount);
    if (img) img.style.display = "block";
    revealedCount++;

    setScoreBar(currentPotentialScore());
    resetTimer();
  } else {
    resetTimer();
  }
}

function resetTimer() {
  countdown = REVEAL_INTERVAL_SEC;
  timerDisplay.textContent = `Temps restant : ${countdown} s`;

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;

      if (gameEnded) return;

      if (revealedCount >= visibleCharacters.length) {
        loseRound("⏰ Temps écoulé !");
      } else {
        revealNextCharacter();
      }
      return;
    }
    timerDisplay.textContent = `Temps restant : ${countdown} s`;
  }, 1000);
}

function normalizeTitle(s) {
  return (s || "").trim().toLowerCase();
}

function checkGuess() {
  if (!currentAnime || gameEnded) return;

  const guess = input.value.trim();
  if (!guess) {
    feedback.textContent = "⚠️ Tu dois écrire un nom d'anime.";
    feedback.className = "error";
    return;
  }

  const ok = normalizeTitle(guess) === normalizeTitle(currentAnime._title);
  if (ok) return winRound();

  feedback.textContent = "❌ Mauvaise réponse.";
  feedback.className = "error";

  input.value = "";
  submitBtn.disabled = true;
  input.focus();
  suggestions.innerHTML = "";

  clearInterval(countdownInterval);
  countdownInterval = null;

  if (revealedCount < visibleCharacters.length) revealNextCharacter();
  else loseRound("❌ Mauvaise réponse.");
}

submitBtn.addEventListener("click", checkGuess);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) checkGuess();
});

input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  submitBtn.disabled = true;

  if (!val) return;

  const titles = [...new Set(filteredAnimes.map((a) => a._title))];
  const matches = titles.filter((t) => t.toLowerCase().includes(val)).slice(0, 7);

  matches.forEach((title) => {
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

  submitBtn.disabled = !titles.map((t) => t.toLowerCase()).includes(val);
});

function endRound(roundScore, won, messageHtml) {
  gameEnded = true;
  clearInterval(countdownInterval);
  countdownInterval = null;

  for (let i = 0; i < visibleCharacters.length; i++) {
    const img = document.getElementById("char-" + i);
    if (img) img.style.display = "block";
  }

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);

  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  restartBtn.style.display = "inline-block";
  restartBtn.textContent = currentRound < totalRounds ? "Round suivant" : "Voir le score total";

  restartBtn.onclick = () => {
    if (currentRound >= totalRounds) showFinalRecap();
    else {
      currentRound += 1;
      startNewRound();
    }
  };
}

function winRound() {
  const score = currentPotentialScore();
  const msg = `🎉 Bonne réponse !<br><b>${currentAnime._title}</b><br>Score : <b>${score}</b> / ${MAX_SCORE}`;
  endRound(score, true, msg);
}

function loseRound(prefix) {
  const msg = `${prefix} ❌<br>Réponse : <b>${currentAnime._title}</b><br>Score : <b>0</b> / ${MAX_SCORE}`;
  endRound(0, false, msg);
}

function showFinalRecap() {
  const gameContainer = document.getElementById("container");
  gameContainer.innerHTML = `
    <div style="width:100%;max-width:520px;text-align:center;">
      <div style="font-size:1.35rem;font-weight:900;opacity:0.95;margin-bottom:10px;">🏆 Série terminée !</div>
      <div style="font-size:1.15rem;font-weight:900;margin-bottom:14px;">
        Score total : <b>${totalScore}</b> / <b>${totalRounds * MAX_SCORE}</b>
      </div>
      <button id="backToSettings" class="menu-btn" style="font-size:1.05rem;padding:0.85rem 1.6rem;">
        Retour réglages
      </button>
    </div>
  `;
  document.getElementById("backToSettings").onclick = () => window.location.reload();
}

/* Tooltip open/close */
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

/* Load dataset */
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
