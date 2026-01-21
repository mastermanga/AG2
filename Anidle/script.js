// ===============================
// ANIDLE — script.js (modifié)
// - Menu personnalisation identique (prévu pour mode futur)
// - MIN_REQUIRED = 64
// - Rounds: 1 → 100 (1 par défaut)
// - Types: si aucun type actif, force TV + Movie (donc Movie par défaut garanti côté JS)
// ===============================

const MAX_SCORE = 3000;
const TENTATIVE_COST = 150;
const INDICE_COST = 300;

const MIN_REQUIRED = 64;
const ROUNDS_MIN = 1;
const ROUNDS_MAX = 100;

// ========== MENU + THEME ==========
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

// ========== TOOLTIP AIDE ==========
document.addEventListener("pointerdown", (e) => {
  const wrap = e.target.closest(".info-wrap");

  if (wrap && e.target.closest(".info-icon")) {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.toggle("open");
    return;
  }

  document.querySelectorAll(".info-wrap.open").forEach((w) => w.classList.remove("open"));
});

// ========== HELPERS ==========
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
  const s = String(a.season || "").trim(); // ex: "spring 2013"
  if (!s) return 0;
  const parts = s.split(/\s+/);
  const maybeYear = parseInt(parts[1] || parts[0] || "0", 10);
  return Number.isFinite(maybeYear) ? maybeYear : 0;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clampYearSliders() {
  const minEl = document.getElementById("yearMin");
  const maxEl = document.getElementById("yearMax");
  if (!minEl || !maxEl) return;

  let a = parseInt(minEl.value, 10);
  let b = parseInt(maxEl.value, 10);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = 0;

  if (a > b) {
    [a, b] = [b, a];
    minEl.value = String(a);
    maxEl.value = String(b);
  }
}

function clampRoundsValue() {
  const el = document.getElementById("roundCount");
  if (!el) return 1;
  let v = parseInt(el.value, 10);
  if (!Number.isFinite(v) || v < ROUNDS_MIN) v = ROUNDS_MIN;
  if (v > ROUNDS_MAX) v = ROUNDS_MAX;
  el.value = String(v);
  return v;
}

function setPillActive(btn, isActive) {
  btn.classList.toggle("active", !!isActive);
  btn.setAttribute("aria-pressed", isActive ? "true" : "false");
}

function ensureDefaultTypes() {
  const pills = Array.from(document.querySelectorAll(".pill[data-type]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  // ✅ sécurité: si rien n'est sélectionné, on active TV + Movie
  pills.forEach((b) => {
    const t = b.dataset.type;
    const should = t === "TV" || t === "Movie";
    setPillActive(b, should);
  });
}

// ========== MODE (prévu pour le futur) ==========
let contentMode = "anime"; // seul mode actuel
function initModeUI() {
  // Supporte 2 formats possibles :
  // 1) des boutons .pill avec data-mode dans un #modePills
  // 2) des boutons avec ids #mode-anime / #mode-other
  const modeBtns = Array.from(document.querySelectorAll('[data-mode]'));
  const animeBtn = document.getElementById("mode-anime");

  // Si rien dans le HTML, on ne fait rien
  if (!modeBtns.length && !animeBtn) return;

  // Format data-mode
  if (modeBtns.length) {
    // default: anime actif si trouvé
    modeBtns.forEach((b) => {
      const m = b.dataset.mode;
      setPillActive(b, m === contentMode);
      if (b.disabled) b.setAttribute("aria-disabled", "true");
      b.addEventListener("click", () => {
        if (b.disabled) return;
        const next = b.dataset.mode;
        if (!next || next === contentMode) return;
        contentMode = next;

        modeBtns.forEach((x) => setPillActive(x, x.dataset.mode === contentMode));
        updatePreview();
      });
    });
    return;
  }

  // Format ids
  if (animeBtn) {
    animeBtn.classList.add("active");
    animeBtn.setAttribute("aria-pressed", "true");
  }
}

// ========== GLOBAL DATA ==========
let allAnimes = [];
let filteredBase = []; // pool après personnalisation
let targetAnime = null;

// ========== MULTI-ROUNDS STATE ==========
let totalRounds = 1;
let currentRound = 1; // 1..totalRounds
let totalScore = 0;

// ========== GAME STATE ==========
let attemptCount = 0;
let gameOver = false;

// -- Indices state --
let indicesActivated = { studio: false, saison: false, genres: false, score: false };
let indicesAvailable = { studio: false, saison: false, genres: false, score: false };
let indicesGenresFound = [];
let indicesYearAtActivation = null;
let indicesStudioAtActivation = null;
let indicesScoreRange = null;
let indicesGenresFoundSet = new Set();
let indicesScoreRangeActivation = [0, 0];

// ========== UI TOGGLE (perso vs jeu) ==========
function showCustomization() {
  document.body.classList.remove("game-started");
}

function showGame() {
  document.body.classList.add("game-started");
}

// ========== LOAD DATA ==========
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

    initPersonalisationUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));

// ========== PERSONALISATION UI ==========
function initPersonalisationUI() {
  initModeUI();

  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yMinVal = document.getElementById("yearMinVal");
  const yMaxVal = document.getElementById("yearMaxVal");

  // rounds (1..100)
  const roundInput = document.getElementById("roundCount");
  if (roundInput) {
    roundInput.addEventListener("input", () => {
      clampRoundsValue();
    });
    clampRoundsValue();
  }

  function syncLabels() {
    clampYearSliders();
    if (popVal && pop) popVal.textContent = pop.value;
    if (scoreVal && score) scoreVal.textContent = score.value;
    if (yMinVal && yMin) yMinVal.textContent = yMin.value;
    if (yMaxVal && yMax) yMaxVal.textContent = yMax.value;
    updatePreview();
  }

  [pop, score, yMin, yMax].forEach((el) => el && el.addEventListener("input", syncLabels));

  // Pills types
  document.querySelectorAll(".pill[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      // toggle
      const next = !btn.classList.contains("active");
      setPillActive(btn, next);

      // si on a tout désactivé -> sécurité (TV + Movie)
      const active = document.querySelectorAll(".pill[data-type].active");
      if (active.length === 0) {
        ensureDefaultTypes();
      }

      updatePreview();
    });
  });

  // ✅ Garantit Movie par défaut (et TV) même si HTML n’a pas été mis à jour
  ensureDefaultTypes();

  document.getElementById("applyFiltersBtn")?.addEventListener("click", () => {
    filteredBase = applyFilters();

    if (filteredBase.length < MIN_REQUIRED) {
      alert(`Pas assez de titres pour lancer (${filteredBase.length}/${MIN_REQUIRED}).`);
      return;
    }

    // multi-rounds: session
    totalRounds = clampRoundsValue();
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewGame();
  });

  syncLabels();
}

// ========== APPLY FILTERS ==========
function applyFilters() {
  // (contentMode prévu pour futur; pour l’instant: anime)
  const popPercent = parseInt(document.getElementById("popPercent")?.value || "25", 10);
  const scorePercent = parseInt(document.getElementById("scorePercent")?.value || "25", 10);
  const yearMin = parseInt(document.getElementById("yearMin")?.value || "1950", 10);
  const yearMax = parseInt(document.getElementById("yearMax")?.value || "2026", 10);

  const allowedTypes = [...document.querySelectorAll(".pill[data-type].active")].map((b) => b.dataset.type);
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

// ========== PREVIEW COUNT ==========
function updatePreview() {
  const preview = document.getElementById("previewCount");
  const btn = document.getElementById("applyFiltersBtn");

  ensureDefaultTypes();
  const pool = applyFilters();
  const ok = pool.length >= MIN_REQUIRED;

  if (preview) {
    preview.textContent = `📚 Titres disponibles : ${pool.length} ${ok ? "(OK)" : "(Min 64)"}`;
    preview.classList.toggle("good", ok);
    preview.classList.toggle("bad", !ok);
  }

  if (btn) btn.disabled = !ok;
}

// ========== GAME INIT ==========
function resetScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");
  if (scoreBar) scoreBar.style.width = "100%";
  if (scoreBarLabel) scoreBarLabel.textContent = "3000 / 3000";
}

function startNewGame() {
  if (!filteredBase.length) return;

  // choisit un anime mystère DANS filteredBase
  targetAnime = filteredBase[Math.floor(Math.random() * filteredBase.length)];

  attemptCount = 0;
  gameOver = false;

  indicesActivated = { studio: false, saison: false, genres: false, score: false };
  indicesAvailable = { studio: false, saison: false, genres: false, score: false };
  indicesGenresFound = [];
  indicesGenresFoundSet = new Set();
  indicesYearAtActivation = null;
  indicesStudioAtActivation = null;
  indicesScoreRange = null;
  indicesScoreRangeActivation = [0, 0];

  const input = document.getElementById("animeInput");
  const suggestions = document.getElementById("suggestions");
  const results = document.getElementById("results");
  const counter = document.getElementById("counter");
  const successContainer = document.getElementById("successContainer");

  if (input) {
    input.value = "";
    input.disabled = false;
  }
  if (suggestions) suggestions.innerHTML = "";
  if (results) results.innerHTML = "";
  if (counter) counter.textContent = "Tentatives : 0 (-150)";
  if (successContainer) {
    successContainer.style.display = "none";
    successContainer.innerHTML = "";
  }

  ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = true;
      btn.classList.remove("used");
    }
  });

  resetScoreBar();
  updateAideList();
  updateScoreBar();
}

// ========== INDICES BUTTONS ==========
document.getElementById("btnIndiceStudio")?.addEventListener("click", function () {
  if (!indicesAvailable.studio || indicesActivated.studio) return;
  indicesActivated.studio = true;
  indicesStudioAtActivation = targetAnime?.studio || null;
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceSaison")?.addEventListener("click", function () {
  if (!indicesAvailable.saison || indicesActivated.saison) return;
  indicesActivated.saison = true;
  indicesYearAtActivation = String(targetAnime?._year || "");
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceGenres")?.addEventListener("click", function () {
  if (!indicesAvailable.genres || indicesActivated.genres) return;
  indicesActivated.genres = true;
  indicesGenresFound = [...indicesGenresFoundSet];
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceScore")?.addEventListener("click", function () {
  if (!indicesAvailable.score || indicesActivated.score) return;
  indicesActivated.score = true;
  indicesScoreRange = indicesScoreRangeActivation.slice();
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

// ========== SCORE BAR ==========
function updateScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");

  const indiceCount = Object.values(indicesActivated).filter(Boolean).length;

  // 1ère tentative ne retire pas 150 (comme ton ancien code)
  const tentative = Math.max(0, attemptCount - 1);

  let score = MAX_SCORE - tentative * TENTATIVE_COST - indiceCount * INDICE_COST;
  score = Math.max(0, Math.min(score, MAX_SCORE));

  const width = (score / MAX_SCORE) * 100;
  if (scoreBar) scoreBar.style.width = width + "%";
  if (scoreBarLabel) scoreBarLabel.textContent = `${score} / ${MAX_SCORE}`;

  const percent = score / MAX_SCORE;
  if (scoreBar) {
    if (percent > 0.66) scoreBar.style.background = "linear-gradient(90deg,#7ee787,#3b82f6 90%)";
    else if (percent > 0.33) scoreBar.style.background = "linear-gradient(90deg,#ffd700,#ff9800 90%)";
    else scoreBar.style.background = "linear-gradient(90deg,#ef4444,#f59e42 90%)";

    if (score < 1000) scoreBar.classList.add("danger-pulse");
    else scoreBar.classList.remove("danger-pulse");
  }
}

// ========== AUTOCOMPLETE (top 5) ==========
document.getElementById("animeInput")?.addEventListener("input", function () {
  if (gameOver) return;

  const input = this.value.trim().toLowerCase();
  const suggestions = document.getElementById("suggestions");
  if (!suggestions) return;
  suggestions.innerHTML = "";

  if (!input) return;

  const matches = filteredBase.filter((a) => a._titleLower.includes(input));
  shuffleInPlace(matches);

  matches.slice(0, 5).forEach((anime) => {
    const div = document.createElement("div");
    div.textContent = anime._title;
    div.onclick = () => {
      this.value = anime._title;
      suggestions.innerHTML = "";
      guessAnime();
    };
    suggestions.appendChild(div);
  });
});

// Enter = valider
document.getElementById("animeInput")?.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    guessAnime();
  }
});

// ========== GUESS ==========
function guessAnime() {
  if (gameOver) return;

  const inputEl = document.getElementById("animeInput");
  if (!inputEl) return;

  const input = inputEl.value.trim().toLowerCase();
  const guessedAnime = filteredBase.find((a) => a._titleLower === input);

  if (!guessedAnime) {
    alert("Anime non trouvé !");
    return;
  }

  attemptCount++;
  const counter = document.getElementById("counter");
  if (counter) counter.textContent = `Tentatives : ${attemptCount} (-150)`;

  // 1) Studio
  if (!indicesActivated.studio && guessedAnime.studio && guessedAnime.studio === targetAnime?.studio) {
    indicesAvailable.studio = true;
    const b = document.getElementById("btnIndiceStudio");
    if (b) b.disabled = false;
  }

  // 2) Année
  if (!indicesActivated.saison && String(guessedAnime._year) === String(targetAnime?._year)) {
    indicesAvailable.saison = true;
    const b = document.getElementById("btnIndiceSaison");
    if (b) b.disabled = false;
  }

  // 3) Genres/Thèmes
  const allGuessed = [...(guessedAnime.genres || []), ...(guessedAnime.themes || [])];
  const allTarget = [...(targetAnime?.genres || []), ...(targetAnime?.themes || [])];

  allGuessed.forEach((g) => {
    if (allTarget.includes(g) && !indicesGenresFoundSet.has(g)) indicesGenresFoundSet.add(g);
  });

  if (!indicesActivated.genres && indicesGenresFoundSet.size > 0) {
    indicesAvailable.genres = true;
    const b = document.getElementById("btnIndiceGenres");
    if (b) b.disabled = false;
  }

  // 4) Score (+/-0.30)
  const gScore = guessedAnime._score;
  const tScore = targetAnime?._score || 0;

  let isClose = false;
  if (gScore === tScore) {
    isClose = true;
    indicesScoreRangeActivation = [gScore - 0.3, gScore + 0.3];
  } else if (Math.abs(gScore - tScore) <= 0.3) {
    isClose = true;
    indicesScoreRangeActivation = [Math.min(gScore, tScore) - 0.3, Math.max(gScore, tScore) + 0.3];
  }

  if (!indicesActivated.score && isClose) {
    indicesAvailable.score = true;
    const b = document.getElementById("btnIndiceScore");
    if (b) b.disabled = false;
  }

  // --- Affichage résultat ---
  const results = document.getElementById("results");
  if (!results) return;

  if (attemptCount === 1) {
    const header = document.createElement("div");
    header.className = "header-row";

    const defs = [
      { label: "Image", cls: "header-cell header-image" },
      { label: "Titre", cls: "header-cell header-title" },
      { label: "Année", cls: "header-cell header-season" },
      { label: "Studio", cls: "header-cell header-studio" },
      { label: "Genres / Thèmes", cls: "header-cell header-genre" },
      { label: "Score", cls: "header-cell header-score" },
    ];

    defs.forEach((d) => {
      const cell = document.createElement("div");
      cell.className = d.cls;
      cell.textContent = d.label;
      header.appendChild(cell);
    });

    results.insertBefore(header, results.firstChild);
  }

  const row = document.createElement("div");
  row.classList.add("row");

  // Image
  const cellImage = document.createElement("div");
  cellImage.classList.add("cell", "cell-image");
  const img = document.createElement("img");
  img.src = guessedAnime.image;
  img.alt = guessedAnime._title;
  img.style.width = "100px";
  cellImage.appendChild(img);
  row.appendChild(cellImage);

  // Title
  const cellTitle = document.createElement("div");
  cellTitle.classList.add("cell", "cell-title");
  const isTitleMatch = guessedAnime.mal_id === targetAnime?.mal_id;
  cellTitle.classList.add(isTitleMatch ? "green" : "red");
  cellTitle.textContent = guessedAnime._title;
  row.appendChild(cellTitle);

  // Year
  const cellYear = document.createElement("div");
  cellYear.classList.add("cell", "cell-season");
  if (guessedAnime._year === targetAnime?._year) {
    cellYear.classList.add("green");
    cellYear.textContent = `✅ ${guessedAnime._year}`;
  } else {
    cellYear.classList.add("red");
    cellYear.textContent =
      guessedAnime._year < (targetAnime?._year || 0) ? `🔼 ${guessedAnime._year}` : `${guessedAnime._year} 🔽`;
  }
  row.appendChild(cellYear);

  // Studio
  const cellStudio = document.createElement("div");
  cellStudio.classList.add("cell", "cell-studio");
  const isStudioMatch = (guessedAnime.studio || "") === (targetAnime?.studio || "");
  cellStudio.classList.add(isStudioMatch ? "green" : "red");
  cellStudio.textContent = guessedAnime.studio || "—";
  row.appendChild(cellStudio);

  // Genres
  const cellGenres = document.createElement("div");
  cellGenres.classList.add("cell", "cell-genre");

  if (isTitleMatch) {
    cellGenres.classList.add("green");
    cellGenres.innerHTML = allGuessed.length ? allGuessed.join("<br>") : "—";
  } else {
    const norm = (s) => String(s || "").trim().toLowerCase();
    const guessedSet = new Set(allGuessed.map(norm).filter(Boolean));
    const targetSet = new Set(allTarget.map(norm).filter(Boolean));
    const common = [...guessedSet].filter((x) => targetSet.has(x));

    const isExactSame =
      guessedSet.size === targetSet.size && [...guessedSet].every((x) => targetSet.has(x));

    if (isExactSame) cellGenres.classList.add("green");
    else if (common.length > 0) cellGenres.classList.add("orange");
    else cellGenres.classList.add("red");

    cellGenres.innerHTML = allGuessed.length ? allGuessed.join("<br>") : "—";
  }
  row.appendChild(cellGenres);

  // Score
  const cellScore = document.createElement("div");
  cellScore.classList.add("cell", "cell-score");
  if (gScore === tScore) {
    cellScore.classList.add("green");
    cellScore.textContent = `✅ ${gScore}`;
  } else if (Math.abs(gScore - tScore) <= 0.3) {
    cellScore.classList.add("orange");
    cellScore.textContent = gScore < tScore ? `🟧🔼 ${gScore}` : `🟧 ${gScore} 🔽`;
  } else {
    cellScore.classList.add("red");
    cellScore.textContent = gScore < tScore ? `🔼 ${gScore}` : `${gScore} 🔽`;
  }
  row.appendChild(cellScore);

  // Insert under header
  const header = results.querySelector(".header-row");
  if (header) results.insertBefore(row, header.nextSibling);
  else results.appendChild(row);

  // cleanup
  inputEl.value = "";
  const sugg = document.getElementById("suggestions");
  if (sugg) sugg.innerHTML = "";

  updateAideList();
  updateScoreBar();

  if (isTitleMatch) {
    gameOver = true;
    inputEl.disabled = true;

    ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = true;
    });

    showSuccessMessage();
    launchFireworks();
  }
}

// ========== AIDE LIST (FILTRÉE PAR INDICES + RANDOM) ==========
function updateAideList() {
  const aideDiv = document.getElementById("aideContainer");
  if (!aideDiv) return;

  let filtered = filteredBase;

  if (indicesActivated.studio && indicesStudioAtActivation) {
    filtered = filtered.filter((a) => (a.studio || "") === indicesStudioAtActivation);
  }

  if (indicesActivated.saison && indicesYearAtActivation) {
    filtered = filtered.filter((a) => String(a._year) === String(indicesYearAtActivation));
  }

  if (indicesActivated.genres && indicesGenresFound.length > 0) {
    filtered = filtered.filter((a) => {
      const allG = [...(a.genres || []), ...(a.themes || [])];
      return indicesGenresFound.every((x) => allG.includes(x));
    });
  }

  if (indicesActivated.score && indicesScoreRange) {
    filtered = filtered.filter((a) => a._score >= indicesScoreRange[0] && a._score <= indicesScoreRange[1]);
  }

  const list = filtered.slice();
  shuffleInPlace(list);

  aideDiv.innerHTML =
    `<h3>🔍 Suggestions</h3><ul>` +
    list
      .map((a) => `<li onclick="selectFromAide('${a._title.replace(/'/g, "\\'")}')">${a._title}</li>`)
      .join("") +
    `</ul>`;
}

window.selectFromAide = function (title) {
  const input = document.getElementById("animeInput");
  if (!input) return;
  input.value = title;
  guessAnime();
};

// ========== CONFETTIS ==========
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

  for (let i = 0; i < 110; i++) {
    particles.push(createParticle(canvas.width / 2, canvas.height / 2));
  }

  function animate() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.10)";
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

// ========== VICTOIRE + MULTI-ROUNDS ==========
function computeRoundScore() {
  const indiceCount = Object.values(indicesActivated).filter(Boolean).length;
  const tentative = Math.max(0, attemptCount - 1);
  let score = MAX_SCORE - tentative * TENTATIVE_COST - indiceCount * INDICE_COST;
  score = Math.max(0, Math.min(score, MAX_SCORE));
  return score;
}

function showSuccessMessage() {
  const container = document.getElementById("successContainer");
  if (!container) return;

  const roundScore = computeRoundScore();
  totalScore += roundScore;

  const hasNext = currentRound < totalRounds;

  container.innerHTML = `
    <div id="winMessage" style="margin-bottom: 18px; font-size: 2rem; font-weight: bold; text-align: center;">
      🎇 <span style="font-size:2.3rem;">🥳</span>
      Bravo ! C'était <u>${targetAnime?._title || "?"}</u> en ${attemptCount} tentative${attemptCount > 1 ? "s" : ""}.
      <span style="font-size:2.3rem;">🎉</span>

      <div style="margin-top:10px; font-size:1.2rem; opacity:0.92;">
        Round ${currentRound} / ${totalRounds} — Score du round : <b>${roundScore}</b> / ${MAX_SCORE}
      </div>

      <div style="margin-top:8px; font-size:1.05rem; opacity:0.9;">
        Total : <b>${totalScore}</b> / ${totalRounds * MAX_SCORE}
      </div>

      <div style="margin-top:14px; display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
        <button id="nextRoundBtn" class="menu-btn" style="padding:0.75rem 1.2rem; font-size:1.05rem;">
          ${hasNext ? "➡️ Round suivant" : "✅ Terminer"}
        </button>
      </div>
    </div>
  `;

  container.style.display = "block";
  container.scrollIntoView({ behavior: "smooth", block: "start" });

  const nextBtn = document.getElementById("nextRoundBtn");
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (currentRound < totalRounds) {
        currentRound += 1;
        startNewGame(); // même personnalisation
      } else {
        // fin session => retour personnalisation
        showCustomization();

        const results = document.getElementById("results");
        const aide = document.getElementById("aideContainer");
        const suggestions = document.getElementById("suggestions");
        const input = document.getElementById("animeInput");

        if (results) results.innerHTML = "";
        if (aide) aide.innerHTML = "";
        if (suggestions) suggestions.innerHTML = "";
        if (input) input.value = "";
      }
    };
  }
}
