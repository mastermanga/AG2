/**********************
 * Character Quizz
 * - Dataset: ../data/licenses_only.json
 * - Personnalisation: popularité/score/années/types + rounds (standalone)
 * - Mode PARCOURS:
 *    - lit AG_parcours_filters (personnalisation globale)
 *    - lit ?count= pour le nombre de rounds
 *    - bypass custom-panel, lance direct
 *    - fin => bouton "Continuer le parcours" => postMessage score
 * - Utilise uniquement "characters"
 * - 6 persos révélés progressivement (timer + essai)
 * - Score: 3000 puis -500 par perso révélé (min 0)
 **********************/

const MAX_SCORE = 3000;
const REVEAL_STEP = 500;
const REVEAL_INTERVAL_SEC = 8;
const MAX_REVEALS = 6;
const MIN_TITLES_TO_START = 64;

// =====================
// PARCOURS MODE
// =====================
const PARCOURS_CFG_KEY = "AG_parcours_filters";
const QS = new URLSearchParams(window.location.search);
const IS_PARCOURS = QS.get("parcours") === "1";
const PARCOURS_COUNT = clampInt(parseInt(QS.get("count") || "1", 10), 1, 100);
let parcoursSent = false;

function loadParcoursConfig() {
  try {
    const raw = localStorage.getItem(PARCOURS_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizedParcoursCfg(cfg) {
  const out = cfg && typeof cfg === "object" ? cfg : {};

  const popPercent = clampInt(parseInt(out.popPercent ?? "30", 10), 5, 100);
  const scorePercent = clampInt(parseInt(out.scorePercent ?? "100", 10), 5, 100);

  let yearMin = clampInt(parseInt(out.yearMin ?? "1950", 10), 1900, 2100);
  let yearMax = clampInt(parseInt(out.yearMax ?? "2026", 10), 1900, 2100);
  if (yearMin > yearMax) [yearMin, yearMax] = [yearMax, yearMin];

  const types = Array.isArray(out.types) && out.types.length ? out.types : ["TV", "Movie"];

  return { popPercent, scorePercent, yearMin, yearMax, types };
}

function sendParcoursScore() {
  if (parcoursSent) return;
  parcoursSent = true;

  try {
    parent.postMessage(
      {
        parcoursScore: {
          label: "Character Quizz",
          score: totalScore,
          total: totalRounds * MAX_SCORE,
        },
      },
      "*"
    );
  } catch (e) {
    console.warn("postMessage parcours failed:", e);
  }
}

// ====== UI: menu + theme ======
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
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
  if (!minEl || !maxEl) return;

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

/**
 * ✅ Sélection "par catégories" :
 * - On suppose que `characters` est déjà trié du moins connu -> plus connu.
 * - On découpe en 6 groupes (cat1..cat6) dans l'ordre.
 * - On prend 1 perso random dans chaque groupe, puis on affiche dans cet ordre.
 */
function pick6CharactersByCategories(characters) {
  if (!Array.isArray(characters) || characters.length === 0) return [];

  const clean = characters.filter(
    (c) => c && typeof c.image === "string" && c.image && typeof c.name === "string" && c.name.trim()
  );
  if (clean.length === 0) return [];

  if (clean.length <= MAX_REVEALS) {
    const pool = [...clean];
    shuffleInPlace(pool);
    return pool.slice(0, Math.min(MAX_REVEALS, pool.length));
  }

  const bucketCount = MAX_REVEALS; // 6
  const bucketSize = Math.max(1, Math.floor(clean.length / bucketCount));

  const picked = [];

  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize;
    const end = i === bucketCount - 1 ? clean.length : Math.min(clean.length, (i + 1) * bucketSize);
    const bucket = clean.slice(start, end);
    if (bucket.length === 0) continue;

    const chosen = bucket[Math.floor(Math.random() * bucket.length)];
    picked.push(chosen);
  }

  // sécurité: si moins de 6, on complète sans doublon
  if (picked.length < bucketCount) {
    const set = new Set(picked.map((x) => x.name + "||" + x.image));
    const rest = clean.filter((x) => !set.has(x.name + "||" + x.image));
    shuffleInPlace(rest);
    while (picked.length < bucketCount && rest.length) picked.push(rest.pop());
  }

  return picked.slice(0, bucketCount);
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
let visibleCharacters = [];
let revealedCount = 0;
let gameEnded = false;

let countdown = REVEAL_INTERVAL_SEC;
let countdownInterval = null;

// ====== UI show/hide ======
function showCustomization() {
  if (customPanel) customPanel.style.display = "block";
  if (gamePanel) gamePanel.style.display = "none";
}
function showGame() {
  if (customPanel) customPanel.style.display = "none";
  if (gamePanel) gamePanel.style.display = "block";
}

// ====== Slider fill helper ======
function setRangePct(el) {
  if (!el) return;
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
  if (!scoreBar || !scoreBarLabel) return;
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

// ====== Filters (UI ou Parcours) ======
function getFiltersFromUI() {
  const popPercent = parseInt(popEl?.value || "30", 10);
  const scorePercent = parseInt(scoreEl?.value || "100", 10);
  const yearMin = parseInt(yearMinEl?.value || "1950", 10);
  const yearMax = parseInt(yearMaxEl?.value || "2026", 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  return {
    popPercent,
    scorePercent,
    yearMin,
    yearMax,
    types: allowedTypes.length ? allowedTypes : ["TV", "Movie"],
  };
}

function applyFilters(cfgOverride = null) {
  const cfg = cfgOverride ? normalizedParcoursCfg(cfgOverride) : getFiltersFromUI();

  const popPercent = cfg.popPercent;
  const scorePercent = cfg.scorePercent;
  const yearMin = cfg.yearMin;
  const yearMax = cfg.yearMax;

  const allowedTypes = cfg.types;
  if (!allowedTypes.length) return [];

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

  pool = pool.filter((a) => {
    const chars = Array.isArray(a.characters) ? a.characters : [];
    return chars.some((c) => c && c.image && typeof c.image === "string");
  });

  return pool;
}

// ====== Preview (standalone) ======
function updatePreview() {
  if (!previewCountEl || !applyBtn) return;

  const pool = applyFilters(null);
  const count = pool.length;
  const ok = count >= MIN_TITLES_TO_START;

  previewCountEl.textContent = `📚 Titres disponibles : ${count} (${ok ? "OK" : "Min 64"})`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
  applyBtn.setAttribute("aria-disabled", (!ok).toString());
}

// ====== Custom UI init (standalone) ======
function initCustomUI() {
  function syncLabels() {
    clampYearSliders();

    if (popValEl) popValEl.textContent = popEl.value;
    if (scoreValEl) scoreValEl.textContent = scoreEl.value;
    if (yearMinValEl) yearMinValEl.textContent = yearMinEl.value;
    if (yearMaxValEl) yearMaxValEl.textContent = yearMaxEl.value;

    setRangePct(popEl);
    setRangePct(scoreEl);
    setRangePct(yearMinEl);
    setRangePct(yearMaxEl);

    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el && el.addEventListener("input", syncLabels));

  // type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn?.addEventListener("click", () => {
    filteredAnimes = applyFilters(null);

    if (filteredAnimes.length < MIN_TITLES_TO_START) {
      updatePreview();
      return;
    }

    totalRounds = clampInt(parseInt(roundCountEl?.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Game flow ======
function resetRoundUI() {
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  if (container) container.innerHTML = "";
  if (feedback) {
    feedback.textContent = "";
    feedback.className = "";
  }
  if (timerDisplay) timerDisplay.textContent = "";

  revealedCount = 0;
  gameEnded = false;

  if (input) {
    input.value = "";
    input.disabled = false;
  }
  if (submitBtn) submitBtn.disabled = true;

  if (restartBtn) {
    restartBtn.style.display = "none";
    restartBtn.textContent = currentRound < totalRounds ? "Suivant" : "Terminer";
  }

  if (suggestions) suggestions.innerHTML = "";

  clearInterval(countdownInterval);
  countdownInterval = null;

  setScoreBar(MAX_SCORE);
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
  visibleCharacters = pick6CharactersByCategories(currentAnime.characters);

  visibleCharacters.forEach((char, i) => {
    const img = document.createElement("img");
    img.src = char.image;
    img.alt = char.name;
    img.className = "character-img";
    img.id = "char-" + i;
    img.style.display = "none";
    container?.appendChild(img);
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
  if (timerDisplay) timerDisplay.textContent = `Temps restant : ${countdown} s`;

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
    if (timerDisplay) timerDisplay.textContent = `Temps restant : ${countdown} s`;
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
  revealedCount = visibleCharacters.length;

  if (input) input.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
  if (suggestions) suggestions.innerHTML = "";

  setScoreBar(roundScore);

  if (feedback) {
    feedback.innerHTML = messageHtml;
    feedback.className = won ? "success" : "error";
  }

  totalScore += roundScore;

  if (!restartBtn) return;

  restartBtn.style.display = "inline-block";
  restartBtn.textContent = currentRound < totalRounds ? "Round suivant" : (IS_PARCOURS ? "Continuer le parcours" : "Voir le score total");

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
  if (!gameContainer) return;

  gameContainer.innerHTML = `
    <div style="width:100%;max-width:520px;text-align:center;">
      <div style="font-size:1.35rem;font-weight:900;opacity:0.95;margin-bottom:10px;">🏆 Série terminée !</div>
      <div style="font-size:1.15rem;font-weight:900;margin-bottom:14px;">
        Score total : <b>${totalScore}</b> / <b>${totalRounds * MAX_SCORE}</b>
      </div>
      <button id="finalBtn" class="menu-btn" style="font-size:1.05rem;padding:0.85rem 1.6rem;">
        ${IS_PARCOURS ? "Continuer le parcours" : "Retour réglages"}
      </button>
    </div>
  `;

  document.getElementById("finalBtn").onclick = () => {
    if (IS_PARCOURS) {
      document.getElementById("finalBtn").disabled = true;
      sendParcoursScore();
    } else {
      window.location.reload();
    }
  };
}

// ====== Guess logic ======
function normalizeTitle(s) {
  return (s || "").trim().toLowerCase();
}

function checkGuess() {
  if (!currentAnime || gameEnded) return;

  const guess = input?.value?.trim() || "";
  if (!guess) {
    if (feedback) {
      feedback.textContent = "⚠️ Tu dois écrire un nom d'anime.";
      feedback.className = "error";
    }
    return;
  }

  const ok = normalizeTitle(guess) === normalizeTitle(currentAnime._title);

  if (ok) {
    winRound();
    return;
  }

  if (feedback) {
    feedback.textContent = "❌ Mauvaise réponse.";
    feedback.className = "error";
  }

  if (input) {
    input.value = "";
    input.focus();
  }
  if (submitBtn) submitBtn.disabled = true;
  if (suggestions) suggestions.innerHTML = "";

  clearInterval(countdownInterval);
  countdownInterval = null;

  if (revealedCount < visibleCharacters.length) {
    revealNextCharacter();
  } else {
    loseRound("❌ Mauvaise réponse.");
  }
}

// ====== Autocomplete ======
input?.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  if (suggestions) suggestions.innerHTML = "";
  if (feedback) feedback.textContent = "";
  if (submitBtn) submitBtn.disabled = true;

  if (!val) return;

  const titles = [...new Set(filteredAnimes.map((a) => a._title))];
  const matches = titles.filter((t) => t.toLowerCase().includes(val)).slice(0, 7);

  matches.forEach((title) => {
    const div = document.createElement("div");
    div.innerHTML = `<span>${title.replace(new RegExp(val, "i"), (m) => `<b>${m}</b>`)}</span>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = title;
      if (suggestions) suggestions.innerHTML = "";
      if (submitBtn) submitBtn.disabled = false;
      input.focus();
    });
    suggestions?.appendChild(div);
  });

  const exact = titles.map((t) => t.toLowerCase()).includes(val);
  if (submitBtn) submitBtn.disabled = !exact;
});

input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && submitBtn && !submitBtn.disabled && !gameEnded) {
    checkGuess();
  }
});

submitBtn?.addEventListener("click", checkGuess);

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

// ====== Boot Parcours ======
function bootParcoursMode() {
  // on évite de sortir du parcours
  const backBtn = document.getElementById("back-to-menu");
  if (backBtn) backBtn.style.display = "none";

  showGame();

  const cfg = normalizedParcoursCfg(loadParcoursConfig());
  filteredAnimes = applyFilters(cfg);

  totalRounds = PARCOURS_COUNT;
  currentRound = 1;
  totalScore = 0;

  if (filteredAnimes.length < MIN_TITLES_TO_START) {
    // pool insuffisant => score 0 => continuer
    if (feedback) {
      feedback.innerHTML = `❌ Pool insuffisant : <b>${filteredAnimes.length}</b> titres (min ${MIN_TITLES_TO_START}).<br>Score : <b>0</b> / ${totalRounds * MAX_SCORE}`;
      feedback.className = "error";
    }
    const gameContainer = document.getElementById("container");
    if (gameContainer) {
      const btn = document.createElement("button");
      btn.className = "menu-btn";
      btn.style.marginTop = "14px";
      btn.textContent = "Continuer le parcours";
      btn.onclick = () => {
        btn.disabled = true;
        sendParcoursScore();
      };
      gameContainer.appendChild(btn);
    }
    return;
  }

  startNewRound();
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

    if (IS_PARCOURS) {
      bootParcoursMode();
    }
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
