/**********************
 * Fusion Quizz
 * - Dataset: ../data/licenses_only.json
 * - Personnalisation: popularité/score/années/types + rounds
 * - 1 round = 1 licence/anime à deviner
 * - 3 manches par round :
 *   1) 4 persos random (characters) -> fusion 2x2
 *   2) 4 persos random (top_characters) -> fusion 2x2
 *   3) 2 persos top (top_characters[0..1]) -> fusion moitié/moitié (vertical ou horizontal)
 * - Mauvais guess OU bouton "Suivant" -> manche suivante
 * - Score max : 3000 / 2000 / 1000
 **********************/

const MAX_SCORE = 3000;
const STAGE_PENALTY = 1000;
const STAGES = 3; // 3 manches
const MIN_TITLES_TO_START = 64;

// Taille interne du canvas (CSS scale ensuite)
const CANVAS_W = 420;
const CANVAS_H = 560;

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

function normalizeTitle(s) {
  return (s || "").trim().toLowerCase();
}

/**
 * Détecte le fameux placeholder "?" (MAL) + quelques patterns courants
 * (filtre rapide par URL, + onerror au chargement)
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase().trim();
  if (!u.startsWith("http")) return false;
  // MAL placeholder
  if (u.includes("questionmark")) return false;
  // autres patterns possibles
  if (u.includes("noimage") || u.includes("no_image")) return false;
  if (u.includes("placeholder")) return false;
  return true;
}

function pickRandomUnique(list, n) {
  const pool = Array.isArray(list) ? list.slice() : [];
  shuffleInPlace(pool);
  return pool.slice(0, Math.min(n, pool.length));
}

function stageMaxScore(stageIndex) {
  return Math.max(MAX_SCORE - stageIndex * STAGE_PENALTY, 0);
}

function getStageLabel(stageIndex) {
  if (stageIndex === 0) return "Manche 1/3 — Fusion (4 persos)";
  if (stageIndex === 1) return "Manche 2/3 — Fusion (4 top persos)";
  return "Manche 3/3 — Duel (2 top persos)";
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
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentAnime = null;
let stageIndex = 0; // 0..2
let gameEnded = false;

let transitionMsg = null; // message affiché après passage de manche

// ====== UI show/hide ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== Slider fill helper ======
function setRangePct(el) {
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || "0");
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty("--pct", `${Math.max(0, Math.min(100, pct))}%`);
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

// ====== Init custom UI ======
function initCustomUI() {
  function syncLabels() {
    clampYearSliders();

    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;

    setRangePct(popEl);
    setRangePct(scoreEl);
    setRangePct(yearMinEl);
    setRangePct(yearMaxEl);

    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) =>
    el.addEventListener("input", syncLabels)
  );

  // type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute(
        "aria-pressed",
        btn.classList.contains("active") ? "true" : "false"
      );
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    filteredAnimes = applyFilters();

    if (filteredAnimes.length < MIN_TITLES_TO_START) {
      updatePreview();
      return;
    }

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
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

  let pool = allAnimes.filter((a) => {
    return (
      a._year >= yearMin &&
      a._year <= yearMax &&
      allowedTypes.includes(a._type) &&
      Array.isArray(a._validCharacters) &&
      a._validCharacters.length >= 4 &&
      Array.isArray(a._validTopCharacters) &&
      a._validTopCharacters.length >= 4
    );
  });

  if (pool.length === 0) return [];

  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  // recheck après slicing
  pool = pool.filter(a => a._validCharacters.length >= 4 && a._validTopCharacters.length >= 4);

  return pool;
}

// ====== Preview ======
function updatePreview() {
  const pool = applyFilters();
  const count = pool.length;

  const ok = count >= MIN_TITLES_TO_START;

  previewCountEl.textContent = `📚 Titres disponibles : ${count} (${ok ? "OK" : "Min 64"})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
  applyBtn.setAttribute("aria-disabled", (!ok).toString());
}

// ====== Canvas fusion ======
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return reject(new Error("Image vide"));
      resolve(img);
    };
    img.onerror = () => reject(new Error("Image introuvable"));
    img.src = url;
  });
}

function makeCanvas() {
  const c = document.createElement("canvas");
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  c.className = "fusion-canvas";
  return c;
}

async function drawFusion4(canvas, urls) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;

  const imgs = await Promise.all(urls.map(loadImage));

  const W = canvas.width;
  const H = canvas.height;

  // Quadrants destination
  const dest = [
    { dx: 0,     dy: 0,     dw: W/2, dh: H/2 }, // TL
    { dx: W/2,   dy: 0,     dw: W/2, dh: H/2 }, // TR
    { dx: 0,     dy: H/2,   dw: W/2, dh: H/2 }, // BL
    { dx: W/2,   dy: H/2,   dw: W/2, dh: H/2 }, // BR
  ];

  // Quadrants source (on prend le quart correspondant)
  imgs.forEach((img, i) => {
    const sw = img.width / 2;
    const sh = img.height / 2;

    let sx = 0, sy = 0;
    if (i === 1) { sx = sw; sy = 0; }          // TR
    if (i === 2) { sx = 0;  sy = sh; }         // BL
    if (i === 3) { sx = sw; sy = sh; }         // BR

    const d = dest[i];
    ctx.drawImage(img, sx, sy, sw, sh, d.dx, d.dy, d.dw, d.dh);
  });

  // petite séparation (optionnel, ultra léger)
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(W/2 - 1, 0, 2, H);
  ctx.fillRect(0, H/2 - 1, W, 2);
  ctx.globalAlpha = 1;
}

async function drawFusion2(canvas, urlA, urlB, orientation /* 'vertical' | 'horizontal' */) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;

  const [imgA, imgB] = await Promise.all([loadImage(urlA), loadImage(urlB)]);

  const W = canvas.width;
  const H = canvas.height;

  if (orientation === "horizontal") {
    // A = haut, B = bas
    const shA = imgA.height / 2;
    const shB = imgB.height / 2;

    ctx.drawImage(imgA, 0, 0, imgA.width, shA, 0, 0, W, H/2);
    ctx.drawImage(imgB, 0, shB, imgB.width, shB, 0, H/2, W, H/2);

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, H/2 - 1, W, 2);
    ctx.globalAlpha = 1;
  } else {
    // vertical (par défaut) : A = gauche, B = droite
    const swA = imgA.width / 2;
    const swB = imgB.width / 2;

    ctx.drawImage(imgA, 0, 0, swA, imgA.height, 0, 0, W/2, H);
    ctx.drawImage(imgB, swB, 0, swB, imgB.height, W/2, 0, W/2, H);

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(W/2 - 1, 0, 2, H);
    ctx.globalAlpha = 1;
  }
}

// ====== Game flow ======
function resetRoundUI() {
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  container.innerHTML = "";
  container.classList.add("fusion");
  feedback.textContent = "";
  feedback.className = "";
  timerDisplay.textContent = "";

  stageIndex = 0;
  gameEnded = false;
  transitionMsg = null;

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  // Pendant la partie : bouton "Suivant" toujours visible
  restartBtn.style.display = "inline-block";
  restartBtn.textContent = "Suivant";
  restartBtn.onclick = () => {
    if (!gameEnded) advanceStage("skip");
  };

  setScoreBar(stageMaxScore(stageIndex));
}

function pickAnimeSafely() {
  // filteredAnimes est déjà filtré, mais on reste safe
  if (!filteredAnimes.length) return null;

  for (let tries = 0; tries < 60; tries++) {
    const a = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
    if (a && a._validCharacters?.length >= 4 && a._validTopCharacters?.length >= 4) return a;
  }
  return filteredAnimes[0] || null;
}

async function renderStage() {
  if (!currentAnime || gameEnded) return;

  timerDisplay.textContent = getStageLabel(stageIndex);
  setScoreBar(stageMaxScore(stageIndex));

  // Message de transition (mauvais/skip) affiché sur la nouvelle manche
  if (transitionMsg) {
    feedback.textContent = transitionMsg;
    feedback.className = "info";
    transitionMsg = null;
  } else {
    feedback.textContent = "";
    feedback.className = "";
  }

  container.innerHTML = "";
  container.classList.add("fusion");
  container.innerHTML = `<div class="fusion-loading">⏳ Création de la fusion…</div>`;

  const canvas = makeCanvas();

  try {
    if (stageIndex === 0) {
      const picks = pickRandomUnique(currentAnime._validCharacters, 4);
      const urls = picks.map(p => p.image);

      container.innerHTML = "";
      container.appendChild(canvas);
      await drawFusion4(canvas, urls);
    } else if (stageIndex === 1) {
      const picks = pickRandomUnique(currentAnime._validTopCharacters, 4);
      const urls = picks.map(p => p.image);

      container.innerHTML = "";
      container.appendChild(canvas);
      await drawFusion4(canvas, urls);
    } else {
      // Manche 3 : 2 persos top, moitié/moitié (vertical ou horizontal)
      const top = currentAnime._validTopCharacters.slice(0, 2);
      const a = top[0];
      const b = top[1];

      const orientation = Math.random() < 0.5 ? "vertical" : "horizontal";

      container.innerHTML = "";
      container.appendChild(canvas);
      await drawFusion2(canvas, a.image, b.image, orientation);

      // Petit hint discret via le timer
      timerDisplay.textContent = `${getStageLabel(stageIndex)} — split ${orientation === "vertical" ? "vertical" : "horizontal"}`;
    }
  } catch (e) {
    // Si une image fail malgré les filtres -> on relance la manche (rare)
    container.innerHTML = `<div class="fusion-loading">⚠️ Image invalide, relance…</div>`;
    // mini reroll : on retente en re-render
    setTimeout(() => {
      if (!gameEnded) renderStage();
    }, 250);
  }
}

function startNewRound() {
  resetRoundUI();

  currentAnime = pickAnimeSafely();
  if (!currentAnime) {
    feedback.textContent = "Erreur: aucun titre compatible avec ces filtres.";
    feedback.className = "error";
    return;
  }

  renderStage();
}

function advanceStage(reason /* 'wrong' | 'skip' */) {
  if (!currentAnime || gameEnded) return;

  if (stageIndex < STAGES - 1) {
    stageIndex += 1;

    if (reason === "wrong") transitionMsg = "❌ Mauvaise réponse — manche suivante.";
    if (reason === "skip") transitionMsg = "⏭️ Manche suivante.";

    // reset input
    input.value = "";
    submitBtn.disabled = true;
    suggestions.innerHTML = "";
    input.focus();

    renderStage();
  } else {
    // fin des manches -> perdu
    loseRound(reason === "skip" ? "⏭️ Fin des manches !" : "❌ Mauvaise réponse.");
  }
}

function endRound(roundScore, won, messageHtml) {
  gameEnded = true;

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);

  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  // Après fin : le bouton devient "Round suivant / Score total"
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
  const score = stageMaxScore(stageIndex);
  if (score > 0) launchFireworks();

  const msg = `🎉 Bonne réponse !<br><b>${currentAnime._title}</b><br>Gagné en <b>manche ${stageIndex + 1}</b> — Score : <b>${score}</b> / ${MAX_SCORE}`;
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

// ====== Guess logic ======
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

  // mauvais -> manche suivante (ou perdu si manche 3)
  advanceStage("wrong");
}

// ====== Autocomplete ======
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  submitBtn.disabled = true;

  if (!val) return;

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

  submitBtn.disabled = !titles.map(t => t.toLowerCase()).includes(val);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) {
    checkGuess();
  }
});

submitBtn.addEventListener("click", checkGuess);

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

// ====== Load dataset ======
fetch("../data/licenses_only.json")
  .then((r) => r.json())
  .then((data) => {
    allAnimes = (Array.isArray(data) ? data : []).map((a) => {
      const title = getDisplayTitle(a);

      // pre-filtrage images valides (enlève les "?")
      const validCharacters = (Array.isArray(a.characters) ? a.characters : [])
        .filter(c => c && typeof c.name === "string" && c.name.trim())
        .filter(c => isValidImageUrl(c.image));

      const validTopCharacters = (Array.isArray(a.top_characters) ? a.top_characters : [])
        .filter(c => c && typeof c.name === "string" && c.name.trim())
        .filter(c => isValidImageUrl(c.image));

      return {
        ...a,
        _title: title,
        _titleLower: title.toLowerCase(),
        _year: getYear(a),
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
        _validCharacters: validCharacters,
        _validTopCharacters: validTopCharacters,
      };
    });

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));

