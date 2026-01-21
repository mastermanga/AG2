/**********************
 * Character Quizz
 * - Dataset: ../data/licenses_only.json
 * - Personnalisation: popularité/score/années/types + rounds
 * - Pas de daily
 * - Utilise uniquement "characters" (pas top_characters)
 * - 6 persos révélés progressivement (timer + essai)
 * - Score: 3000 puis -500 par perso révélé (min 0)
 *
 * ✅ NOUVELLE LOGIQUE PERSOS :
 * Le tableau `characters` est considéré trié du moins connu -> plus connu.
 * On le découpe en 6 catégories (tranches) et on pick 1 perso random dans chaque catégorie,
 * dans l'ordre Cat1 -> Cat6.
 **********************/

const MAX_SCORE = 3000;
const REVEAL_STEP = 500;          // -500 par reveal
const REVEAL_INTERVAL_SEC = 8;    // reveal auto toutes les 8s
const MAX_REVEALS = 6;

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

// ✅ Validateur perso (image + nom)
function isValidCharacter(c) {
  return !!(
    c &&
    typeof c.name === "string" &&
    c.name.trim() &&
    typeof c.image === "string" &&
    c.image.trim()
  );
}

function countValidCharacters(chars) {
  if (!Array.isArray(chars)) return 0;
  let n = 0;
  for (const c of chars) if (isValidCharacter(c)) n++;
  return n;
}

/**
 * ✅ Sélection 6 persos par catégories (Cat1 -> Cat6)
 * Le tableau `characters` est supposé trié du moins connu -> plus connu.
 * On découpe en 6 tranches "équilibrées", puis on prend 1 perso random dans chaque tranche,
 * dans l'ordre.
 */
function pick6CharactersByCategories(characters) {
  if (!Array.isArray(characters) || characters.length === 0) return [];

  // 1) Clean en gardant l'ordre d'origine (IMPORTANT)
  const clean = characters.filter(isValidCharacter);
  if (clean.length === 0) return [];

  // Si on n'a pas assez de persos, on renvoie tout (le jeu révèlera moins)
  if (clean.length <= MAX_REVEALS) return clean.slice(0, clean.length);

  // 2) Découpe en 6 tranches réparties le plus équitablement possible
  // base = taille minimale de chaque catégorie, rem = catégories qui ont +1
  const total = clean.length;
  const tiers = MAX_REVEALS; // 6
  const base = Math.floor(total / tiers);
  const rem = total % tiers;

  const buckets = [];
  let idx = 0;
  for (let i = 0; i < tiers; i++) {
    const size = base + (i < rem ? 1 : 0);
    buckets.push(clean.slice(idx, idx + size));
    idx += size;
  }

  // 3) Pick 1 random par catégorie, dans l'ordre Cat1 -> Cat6
  const picked = [];
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    if (!bucket || bucket.length === 0) continue;
    const choice = bucket[Math.floor(Math.random() * bucket.length)];
    picked.push(choice);
    if (picked.length >= MAX_REVEALS) break;
  }

  // Sécurité: si pour une raison quelconque on a moins de 6, on complète avec le reste
  if (picked.length < MAX_REVEALS) {
    const used = new Set(picked.map(p => p.image));
    const rest = clean.filter(c => !used.has(c.image));
    while (picked.length < MAX_REVEALS && rest.length) {
      const k = Math.floor(Math.random() * rest.length);
      picked.push(rest.splice(k, 1)[0]);
    }
  }

  // On garde l'ordre des catégories (déjà bon), pas de shuffle ici
  return picked;
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

// game refs
const container = document.getElementById("character-container");
const feedback = document.getElementById("feedback");
const timerDisplay = document.getElementById("timer");
const input = document.getElementById("characterInput");
const submitBtn = document.getElementById("submit-btn");
const restartBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");
const roundLabel = document.getElementById("roundLabel");

// score bar
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

// ====== Data ======
let allAnimes = [];
let filteredAnimes = [];

// ====== Session (Rounds) ======
let totalRounds = 5;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentAnime = null;
let visibleCharacters = [];
let revealedCount = 0;
let gameEnded = false;

let countdown = REVEAL_INTERVAL_SEC;
let countdownInterval = null;

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

function setScoreBar(score) {
  const s = Math.max(0, Math.min(MAX_SCORE, score));
  const pct = Math.max(0, Math.min(100, (s / MAX_SCORE) * 100));
  scoreBar.style.width = pct + "%";
  scoreBar.style.background = getScoreBarColor(s);
  scoreBarLabel.textContent = `${s} / ${MAX_SCORE}`;
}

function currentPotentialScore() {
  // revealedCount inclut le perso déjà affiché : score = 3000 - (revealedCount-1)*500
  const malus = Math.max(0, (revealedCount - 1) * REVEAL_STEP);
  return Math.max(MAX_SCORE - malus, 0);
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
    if (filteredAnimes.length === 0) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "5", 10), 1, 50);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Filters ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  // 1) base filter (year/type + doit avoir AU MOINS 6 persos valides)
  let pool = allAnimes.filter((a) => {
    return (
      a._year >= yearMin &&
      a._year <= yearMax &&
      allowedTypes.includes(a._type) &&
      Array.isArray(a.characters) &&
      countValidCharacters(a.characters) >= MAX_REVEALS
    );
  });

  if (pool.length === 0) return [];

  // 2) top pop% par members
  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // 3) top score% par score
  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  // (sécurité) conserver seulement ceux qui ont bien >=6 persos valides
  pool = pool.filter(a => countValidCharacters(a.characters) >= MAX_REVEALS);

  return pool;
}

// ====== Preview ======
function updatePreview() {
  const pool = applyFilters();
  const ok = pool.length > 0;

  previewCountEl.textContent = ok
    ? `👤 Titres disponibles : ${pool.length} (OK)`
    : `👤 Titres disponibles : 0 (Min 1)`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== Game flow ======
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
  restartBtn.textContent = (currentRound < totalRounds) ? "Suivant" : "Terminer";

  suggestions.innerHTML = "";

  clearInterval(countdownInterval);
  countdownInterval = null;

  setScoreBar(MAX_SCORE);
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];

  // ✅ nouvelle sélection par catégories (Cat1 -> Cat6)
  visibleCharacters = pick6CharactersByCategories(currentAnime.characters);

  // crée les images (cachées)
  visibleCharacters.forEach((char, i) => {
    const img = document.createElement("img");
    img.src = char.image;
    img.alt = char.name;
    img.className = "character-img";
    img.id = "char-" + i;
    img.style.display = "none";
    container.appendChild(img);
  });

  // reveal 1er perso
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
    resetTimer(); // garde le timer, mais on gère à 0
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

// ====== End round ======
function endRound(roundScore, won, messageHtml) {
  gameEnded = true;

  clearInterval(countdownInterval);
  countdownInterval = null;

  // afficher tous les persos restants
  for (let i = 0; i < visibleCharacters.length; i++) {
    const img = document.getElementById("char-" + i);
    if (img) img.style.display = "block";
  }

  // bloc input
  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);

  // message
  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  // score total
  totalScore += roundScore;

  // bouton next / end
  restartBtn.style.display = "inline-block";
  restartBtn.textContent = (currentRound < totalRounds) ? "Round suivant" : "Voir le score total";

  restartBtn.onclick = () => {
    if (currentRound >= totalRounds) {
      showFinalRecap();
    } else {
      currentRound += 1;
      startNewRound();
    }
  };
}

function winRound() {
  const score = currentPotentialScore();
  if (score > 0) launchFireworks();

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
  document.getElementById("backToSettings").onclick = () => {
    window.location.reload();
  };
}

// ====== Guess logic ======
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

  if (ok) {
    winRound();
    return;
  }

  // mauvais: révèle 1 perso (si possible)
  feedback.textContent = "❌ Mauvaise réponse.";
  feedback.className = "error";

  input.value = "";
  submitBtn.disabled = true;
  input.focus();
  suggestions.innerHTML = "";

  clearInterval(countdownInterval);
  countdownInterval = null;

  if (revealedCount < visibleCharacters.length) {
    revealNextCharacter();
  } else {
    loseRound("❌ Mauvaise réponse.");
  }
}

// ====== Autocomplete ======
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  submitBtn.disabled = true;

  if (!val) return;

  // titres uniques sur base filtrée
  const titles = [...new Set(filteredAnimes.map(a => a._title))];
  const matches = titles.filter(t => t.toLowerCase().includes(val)).slice(0, 7);

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

  // enable si match exact
  submitBtn.disabled = !titles.map(t => t.toLowerCase()).includes(val);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) {
    checkGuess();
  }
});

submitBtn.addEventListener("click", checkGuess);

// ====== Tooltip (icône info) ======
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

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
