// ================================
// Anidle - licenses_only.json + Personnalisation (sans songs) + No Daily
// + Suggestions random (shuffle) sans limitation
// ================================

const MAX_SCORE = 3000;
const TENTATIVE_COST = 150;
const INDICE_COST = 300;

const MIN_POOL_REQUIRED = 64; // tu peux changer si tu veux

// ========== DARK/LIGHT MODE + MENU ==========
document.getElementById("back-to-menu").addEventListener("click", function () {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");
});

// ========== Utils ==========
function shuffleArray(array) {
  const arr = array.slice(); // copie pour ne pas modifier l'original
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function norm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getDisplayTitle(a) {
  return (
    a?.title_english ||
    a?.animethemes?.name ||
    a?.title_mal_default ||
    a?.title_original ||
    a?.title ||
    "Unknown"
  );
}

function parseSeason(seasonStr) {
  // "spring 2013" => { season: "spring", year: 2013 }
  const s = (seasonStr || "").toLowerCase().trim();
  const parts = s.split(/\s+/);
  let season = parts[0] || "";
  let year = parseInt(parts[1] || "", 10);
  if (!Number.isFinite(year)) year = null;
  return { season, year };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ========== Game State ==========
let rawData = [];        // dataset brut
let pool = [];           // pool filtré (personnalisation)
let targetAnime = null;

let attemptCount = 0;
let gameOver = false;

// Indices
let indicesActivated = { studio: false, saison: false, genres: false, score: false };
let indicesAvailable = { studio: false, saison: false, genres: false, score: false };
let indicesGenresFoundSet = new Set();

let indicesYearAtActivation = null;
let indicesSeasonAtActivation = null;   // utile pour comparer saison
let indicesStudioAtActivation = null;
let indicesScoreRange = null;

// ========== Parcours (si tu utilises ?parcours=1&count=...) ==========
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
let parcoursIndex = 0;
let parcoursTotalScore = 0;

// ========== Personnalisation UI refs ==========
const popPercentEl = document.getElementById("popPercent");
const popPercentValEl = document.getElementById("popPercentVal");

const scorePercentEl = document.getElementById("scorePercent");
const scorePercentValEl = document.getElementById("scorePercentVal");

const yearMinEl = document.getElementById("yearMin");
const yearMaxEl = document.getElementById("yearMax");
const yearMinValEl = document.getElementById("yearMinVal");
const yearMaxValEl = document.getElementById("yearMaxVal");

const typePills = document.getElementById("typePills");
const previewCountEl = document.getElementById("previewCount");
const applyFiltersBtn = document.getElementById("applyFiltersBtn");

// ========== Game UI refs ==========
const animeInputEl = document.getElementById("animeInput");
const suggestionsEl = document.getElementById("suggestions");
const resultsEl = document.getElementById("results");
const counterEl = document.getElementById("counter");
const successContainerEl = document.getElementById("successContainer");
const aideContainerEl = document.getElementById("aideContainer");

const btnIndiceStudio = document.getElementById("btnIndiceStudio");
const btnIndiceSaison = document.getElementById("btnIndiceSaison");
const btnIndiceGenres = document.getElementById("btnIndiceGenres");
const btnIndiceScore = document.getElementById("btnIndiceScore");

// Expose selectFromAide for inline onclick
window.selectFromAide = function (title) {
  animeInputEl.value = title;
  guessAnime();
};

// ========== Load data ==========
fetch("../data/licenses_only.json")
  .then((res) => res.json())
  .then((data) => {
    rawData = Array.isArray(data) ? data : [];

    // init UI defaults / clamps
    initCustomizationUI();

    // first compute pool + preview
    recomputePoolAndPreview();

    if (isParcours) {
      // mode parcours : cache le bouton menu si tu veux
      const backBtn = document.getElementById("back-to-menu");
      if (backBtn) backBtn.style.display = "none";

      parcoursIndex = 0;
      parcoursTotalScore = 0;

      // démarre un round
      startNewGame({ fromParcours: true });
    } else {
      // classique
      startNewGame({ fromParcours: false });
    }
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });

// ========== Customization: setup ==========
function initCustomizationUI() {
  // Valeurs par défaut souhaitées
  // Popularité top 25, score top 25, années 2000-2026, types TV+Movie actifs
  if (popPercentEl) popPercentEl.value = "25";
  if (scorePercentEl) scorePercentEl.value = "25";

  // Si ce sont des range: set min/max raisonnables
  if (yearMinEl) {
    if (!yearMinEl.getAttribute("min")) yearMinEl.min = "1950";
    if (!yearMinEl.getAttribute("max")) yearMinEl.max = "2026";
    yearMinEl.value = "2000";
  }
  if (yearMaxEl) {
    if (!yearMaxEl.getAttribute("min")) yearMaxEl.min = "1950";
    if (!yearMaxEl.getAttribute("max")) yearMaxEl.max = "2026";
    yearMaxEl.value = "2026";
  }

  // affichage labels
  syncCustomizationLabels();

  // listeners
  if (popPercentEl) popPercentEl.addEventListener("input", () => { syncCustomizationLabels(); recomputePoolAndPreview(); });
  if (scorePercentEl) scorePercentEl.addEventListener("input", () => { syncCustomizationLabels(); recomputePoolAndPreview(); });

  if (yearMinEl) yearMinEl.addEventListener("input", () => { fixYearMinMax(); syncCustomizationLabels(); recomputePoolAndPreview(); });
  if (yearMaxEl) yearMaxEl.addEventListener("input", () => { fixYearMinMax(); syncCustomizationLabels(); recomputePoolAndPreview(); });

  // pills type
  if (typePills) {
    // Assure TV + Movie actifs par défaut si le HTML les a marqués active
    typePills.addEventListener("click", (e) => {
      const btn = e.target.closest(".pill");
      if (!btn) return;
      btn.classList.toggle("active");
      const pressed = btn.classList.contains("active");
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      recomputePoolAndPreview();
    });
  }

  // bouton lancer
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener("click", () => {
      // Recompute pool for safety
      recomputePoolAndPreview();

      if (pool.length < MIN_POOL_REQUIRED) {
        alert(`Pas assez de titres pour lancer (${pool.length}/${MIN_POOL_REQUIRED}). Assouplis tes filtres.`);
        return;
      }

      startNewGame({ fromParcours: false, forceNewTarget: true });
    });
  }
}

function syncCustomizationLabels() {
  if (popPercentValEl && popPercentEl) popPercentValEl.textContent = String(popPercentEl.value);
  if (scorePercentValEl && scorePercentEl) scorePercentValEl.textContent = String(scorePercentEl.value);

  const yMin = yearMinEl ? parseInt(yearMinEl.value || "2000", 10) : 2000;
  const yMax = yearMaxEl ? parseInt(yearMaxEl.value || "2026", 10) : 2026;

  if (yearMinValEl) yearMinValEl.textContent = String(yMin);
  if (yearMaxValEl) yearMaxValEl.textContent = String(yMax);
}

function fixYearMinMax() {
  if (!yearMinEl || !yearMaxEl) return;
  let yMin = parseInt(yearMinEl.value || "2000", 10);
  let yMax = parseInt(yearMaxEl.value || "2026", 10);
  if (!Number.isFinite(yMin)) yMin = 2000;
  if (!Number.isFinite(yMax)) yMax = 2026;

  if (yMin > yMax) {
    // on “pousse” l'autre pour garder cohérent
    yMax = yMin;
    yearMaxEl.value = String(yMax);
  }
}

function getActiveTypes() {
  const active = new Set();
  if (!typePills) return active;
  typePills.querySelectorAll(".pill.active").forEach((b) => {
    const t = (b.getAttribute("data-type") || "").trim();
    if (t) active.add(t);
  });
  return active;
}

function recomputePoolAndPreview() {
  // récupère filtres
  const popP = popPercentEl ? parseInt(popPercentEl.value || "25", 10) : 25;
  const scoreP = scorePercentEl ? parseInt(scorePercentEl.value || "25", 10) : 25;

  const yMin = yearMinEl ? parseInt(yearMinEl.value || "2000", 10) : 2000;
  const yMax = yearMaxEl ? parseInt(yearMaxEl.value || "2026", 10) : 2026;

  const activeTypes = getActiveTypes(); // ex: TV, Movie...

  // base: nettoyer entrées (doit avoir un titre + image + season/year)
  let arr = rawData.filter((a) => {
    const title = getDisplayTitle(a);
    const { year } = parseSeason(a.season);
    const type = (a.type || "").trim();

    if (!title || title === "Unknown") return false;
    if (!a.image) return false;
    if (!year || !Number.isFinite(year)) return false;

    // année
    if (year < yMin || year > yMax) return false;

    // type
    if (activeTypes.size > 0 && !activeTypes.has(type)) return false;

    // score/members peut manquer
    return true;
  });

  // Popularité: on utilise "members" (plus grand = plus populaire)
  // Top X% => on garde les meilleurs members
  if (arr.length > 0) {
    const sortedByMembers = arr.slice().sort((a, b) => (b.members || 0) - (a.members || 0));
    const keepCount = Math.max(1, Math.floor(sortedByMembers.length * (popP / 100)));
    const keepSet = new Set(sortedByMembers.slice(0, keepCount).map((x) => x.mal_id));
    arr = arr.filter((x) => keepSet.has(x.mal_id));
  }

  // Score: top X% => on garde meilleurs score
  // Si score manquant, on les met à 0 et ça tombe naturellement
  if (arr.length > 0) {
    const sortedByScore = arr.slice().sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
    const keepCount = Math.max(1, Math.floor(sortedByScore.length * (scoreP / 100)));
    const keepSet = new Set(sortedByScore.slice(0, keepCount).map((x) => x.mal_id));
    arr = arr.filter((x) => keepSet.has(x.mal_id));
  }

  // pool final
  pool = arr;

  // preview + bouton
  if (previewCountEl) {
    const ok = pool.length >= MIN_POOL_REQUIRED;
    previewCountEl.classList.toggle("good", ok);
    previewCountEl.classList.toggle("bad", !ok);
    previewCountEl.textContent = ok
      ? `✅ Titres disponibles : ${pool.length} (OK)`
      : `⚠️ Titres disponibles : ${pool.length} — minimum ${MIN_POOL_REQUIRED} pour lancer`;
  }
  if (applyFiltersBtn) applyFiltersBtn.disabled = pool.length < MIN_POOL_REQUIRED;
}

// ========== Game start/reset ==========
function resetScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");
  if (scoreBar) scoreBar.style.width = "100%";
  if (scoreBarLabel) scoreBarLabel.textContent = "3000 / 3000";
}

function startNewGame({ fromParcours = false, forceNewTarget = false } = {}) {
  // Always recompute pool (filters)
  recomputePoolAndPreview();

  if (pool.length < 1) {
    alert("Aucun titre ne correspond à tes filtres.");
    return;
  }

  // pick target
  if (fromParcours) {
    // un peu random + stable
    const rnd = Math.random();
    targetAnime = pool[Math.floor(rnd * pool.length)];
  } else {
    if (!targetAnime || forceNewTarget) {
      targetAnime = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  // reset state
  attemptCount = 0;
  gameOver = false;

  indicesActivated = { studio: false, saison: false, genres: false, score: false };
  indicesAvailable = { studio: false, saison: false, genres: false, score: false };
  indicesGenresFoundSet = new Set();

  indicesYearAtActivation = null;
  indicesSeasonAtActivation = null;
  indicesStudioAtActivation = null;
  indicesScoreRange = null;

  // reset UI
  animeInputEl.value = "";
  suggestionsEl.innerHTML = "";
  resultsEl.innerHTML = "";
  counterEl.textContent = "Tentatives : 0 (-150)";
  successContainerEl.style.display = "none";
  animeInputEl.disabled = false;

  [btnIndiceStudio, btnIndiceSaison, btnIndiceGenres, btnIndiceScore].forEach((btn) => {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.remove("used");
  });

  resetScoreBar();
  updateAideList(); // initial
  updateScoreBar();
}

// ========== Score bar ==========
function updateScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");

  const indiceCount = Object.values(indicesActivated).filter(Boolean).length;
  const tentative = Math.max(0, attemptCount - 1);

  let score = MAX_SCORE - tentative * TENTATIVE_COST - indiceCount * INDICE_COST;
  score = clamp(score, 0, MAX_SCORE);

  const width = (score / MAX_SCORE) * 100;
  if (scoreBarLabel) scoreBarLabel.textContent = `${score} / ${MAX_SCORE}`;

  if (scoreBar) {
    scoreBar.style.width = width + "%";
    const percent = score / MAX_SCORE;
    if (percent > 0.66) scoreBar.style.background = "linear-gradient(90deg,#7ee787,#3b82f6 90%)";
    else if (percent > 0.33) scoreBar.style.background = "linear-gradient(90deg,#ffd700,#ff9800 90%)";
    else scoreBar.style.background = "linear-gradient(90deg,#ef4444,#f59e42 90%)";

    if (score < 1000) scoreBar.classList.add("danger-pulse");
    else scoreBar.classList.remove("danger-pulse");
  }
}

// ========== Autocomplete suggestions ==========
animeInputEl.addEventListener("input", function () {
  if (gameOver) return;

  const input = norm(this.value);
  if (!input) {
    suggestionsEl.innerHTML = "";
    return;
  }

  // suggestions depuis le pool filtré
  const matches = pool
    .filter((a) => norm(getDisplayTitle(a)).includes(input))
    .slice(0, 6);

  suggestionsEl.innerHTML = "";
  matches.forEach((anime) => {
    const title = getDisplayTitle(anime);
    const div = document.createElement("div");
    div.textContent = title;
    div.onclick = () => {
      animeInputEl.value = title;
      suggestionsEl.innerHTML = "";
      guessAnime();
    };
    suggestionsEl.appendChild(div);
  });
});

// ========== Indices buttons ==========
btnIndiceStudio.addEventListener("click", function () {
  if (!indicesAvailable.studio || indicesActivated.studio) return;
  indicesActivated.studio = true;
  indicesStudioAtActivation = targetAnime.studio || "";
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

btnIndiceSaison.addEventListener("click", function () {
  if (!indicesAvailable.saison || indicesActivated.saison) return;
  indicesActivated.saison = true;

  const t = parseSeason(targetAnime.season);
  indicesYearAtActivation = t.year;
  indicesSeasonAtActivation = t.season;

  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

btnIndiceGenres.addEventListener("click", function () {
  if (!indicesAvailable.genres || indicesActivated.genres) return;
  indicesActivated.genres = true;
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

btnIndiceScore.addEventListener("click", function () {
  if (!indicesAvailable.score || indicesActivated.score) return;
  indicesActivated.score = true;
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

// ========== Main guess ==========
function findAnimeByInput(inputRaw) {
  const input = norm(inputRaw);

  // match exact sur displayTitle
  let exact = pool.find((a) => norm(getDisplayTitle(a)) === input);
  if (exact) return exact;

  // fallback: title_original / title_mal_default / animethemes.name
  exact = pool.find((a) => {
    const candidates = [
      a.title_english,
      a.animethemes?.name,
      a.title_mal_default,
      a.title_original,
      a.title,
    ];
    return candidates.some((t) => norm(t) === input);
  });
  return exact || null;
}

function guessAnime() {
  if (gameOver) return;

  const input = animeInputEl.value.trim();
  const guessedAnime = findAnimeByInput(input);
  if (!guessedAnime) {
    alert("Anime non trouvé (avec tes filtres) !");
    return;
  }

  attemptCount++;
  counterEl.textContent = `Tentatives : ${attemptCount} (-150)`;

  // recalcul disponibilité indices
  // 1) Studio
  if (!indicesActivated.studio && (guessedAnime.studio || "") === (targetAnime.studio || "")) {
    indicesAvailable.studio = true;
    btnIndiceStudio.disabled = false;
  }

  // 2) Saison/Année (orange si année ok mais saison pas)
  const gS = parseSeason(guessedAnime.season);
  const tS = parseSeason(targetAnime.season);

  if (!indicesActivated.saison && gS.year && tS.year && gS.year === tS.year) {
    indicesAvailable.saison = true;
    btnIndiceSaison.disabled = false;
  }

  // 3) Genres/Thèmes
  const allGuessed = [...(guessedAnime.genres || []), ...(guessedAnime.themes || [])];
  const allTarget = [...(targetAnime.genres || []), ...(targetAnime.themes || [])];

  allGuessed.forEach((g) => {
    if (allTarget.includes(g)) indicesGenresFoundSet.add(g);
  });

  if (!indicesActivated.genres && indicesGenresFoundSet.size > 0) {
    indicesAvailable.genres = true;
    btnIndiceGenres.disabled = false;
  }

  // 4) Score (orange si ±0.30)
  const gScore = parseFloat(guessedAnime.score) || 0;
  const tScore = parseFloat(targetAnime.score) || 0;

  if (!indicesActivated.score) {
    if (gScore === tScore) {
      indicesAvailable.score = true;
      indicesScoreRange = [gScore - 0.3, gScore + 0.3];
      btnIndiceScore.disabled = false;
    } else if (Math.abs(gScore - tScore) <= 0.3) {
      indicesAvailable.score = true;
      indicesScoreRange = [Math.min(gScore, tScore) - 0.3, Math.max(gScore, tScore) + 0.3];
      btnIndiceScore.disabled = false;
    }
  }

  // render result row
  renderGuessRow(guessedAnime);

  // reset input ui
  animeInputEl.value = "";
  suggestionsEl.innerHTML = "";

  updateAideList();
  updateScoreBar();

  // win?
  const isTitleMatch = norm(getDisplayTitle(guessedAnime)) === norm(getDisplayTitle(targetAnime));
  if (isTitleMatch) {
    gameOver = true;
    animeInputEl.disabled = true;
    [btnIndiceStudio, btnIndiceSaison, btnIndiceGenres, btnIndiceScore].forEach((btn) => (btn.disabled = true));
    showSuccessMessage();
    launchFireworks();
  }
}

function renderGuessRow(guessedAnime) {
  // header on first attempt
  if (attemptCount === 1) {
    const header = document.createElement("div");
    header.classList.add("row");
    ["Image", "Titre", "Saison", "Studio", "Genres / Thèmes", "Score"].forEach((label, i) => {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.style.fontWeight = "bold";
      cell.textContent = label;
      header.appendChild(cell);
    });
    resultsEl.insertBefore(header, resultsEl.firstChild);
  }

  const row = document.createElement("div");
  row.classList.add("row");

  // Image
  const cellImage = document.createElement("div");
  cellImage.classList.add("cell", "cell-image");
  const img = document.createElement("img");
  img.src = guessedAnime.image;
  img.alt = getDisplayTitle(guessedAnime);
  img.style.width = "100px";
  cellImage.appendChild(img);
  row.appendChild(cellImage);

  // Title
  const cellTitle = document.createElement("div");
  cellTitle.classList.add("cell", "cell-title");
  const gTitle = getDisplayTitle(guessedAnime);
  const tTitle = getDisplayTitle(targetAnime);
  const isTitleMatch = norm(gTitle) === norm(tTitle);
  cellTitle.classList.add(isTitleMatch ? "green" : "red");
  cellTitle.textContent = gTitle;
  row.appendChild(cellTitle);

  // Season
  const cellSeason = document.createElement("div");
  cellSeason.classList.add("cell", "cell-season");

  const gS = parseSeason(guessedAnime.season);
  const tS = parseSeason(targetAnime.season);

  if (gS.season === tS.season && gS.year === tS.year) {
    cellSeason.classList.add("green");
    cellSeason.textContent = `✅ ${guessedAnime.season}`;
  } else if (gS.year === tS.year && gS.year != null) {
    cellSeason.classList.add("orange");
    cellSeason.textContent = `🟧 ${guessedAnime.season}`;
  } else {
    cellSeason.classList.add("red");
    // flèches selon année
    if (gS.year != null && tS.year != null) {
      cellSeason.textContent = gS.year < tS.year ? `🔼 ${guessedAnime.season}` : `${guessedAnime.season} 🔽`;
    } else {
      cellSeason.textContent = guessedAnime.season || "N/A";
    }
  }
  row.appendChild(cellSeason);

  // Studio
  const cellStudio = document.createElement("div");
  cellStudio.classList.add("cell", "cell-studio");
  const isStudioMatch = (guessedAnime.studio || "") === (targetAnime.studio || "");
  cellStudio.classList.add(isStudioMatch ? "green" : "red");
  cellStudio.textContent = guessedAnime.studio || "N/A";
  row.appendChild(cellStudio);

  // Genres/Themes
  const cellGenresThemes = document.createElement("div");
  cellGenresThemes.classList.add("cell", "cell-genre");

  const allGuessed = [...(guessedAnime.genres || []), ...(guessedAnime.themes || [])];
  const allTarget = [...(targetAnime.genres || []), ...(targetAnime.themes || [])];
  const matches = allGuessed.filter((x) => allTarget.includes(x));

  if (matches.length > 0 && matches.length === allGuessed.length && matches.length === allTarget.length) {
    cellGenresThemes.classList.add("green");
  } else if (matches.length > 0) {
    cellGenresThemes.classList.add("orange");
  } else {
    cellGenresThemes.classList.add("red");
  }
  cellGenresThemes.innerHTML = allGuessed.length ? allGuessed.join("<br>") : "N/A";
  row.appendChild(cellGenresThemes);

  // Score
  const cellScore = document.createElement("div");
  cellScore.classList.add("cell", "cell-score");

  const gScore = parseFloat(guessedAnime.score) || 0;
  const tScore = parseFloat(targetAnime.score) || 0;

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

  // insert after header
  const header = resultsEl.querySelector(".row");
  resultsEl.insertBefore(row, header.nextSibling);
}

// ========== Suggestions latérales (AIDE) ==========
function updateAideList() {
  let filtered = pool;

  // filtrage selon indices activés
  if (indicesActivated.studio && indicesStudioAtActivation) {
    filtered = filtered.filter((a) => (a.studio || "") === indicesStudioAtActivation);
  }

  if (indicesActivated.saison && indicesYearAtActivation) {
    filtered = filtered.filter((a) => {
      const s = parseSeason(a.season);
      return s.year === indicesYearAtActivation;
    });
  }

  if (indicesActivated.genres && indicesGenresFoundSet.size > 0) {
    const needed = Array.from(indicesGenresFoundSet);
    filtered = filtered.filter((a) => {
      const all = [...(a.genres || []), ...(a.themes || [])];
      return needed.every((x) => all.includes(x));
    });
  }

  if (indicesActivated.score && indicesScoreRange) {
    filtered = filtered.filter((a) => {
      const sc = parseFloat(a.score) || 0;
      return sc >= indicesScoreRange[0] && sc <= indicesScoreRange[1];
    });
  }

  // ✅ Randomize l'affichage (sans limitation)
  const shuffled = shuffleArray(filtered);

  // render
  aideContainerEl.innerHTML =
    `<h3>🔍 Suggestions</h3><ul>` +
    shuffled
      .map((a) => {
        const title = getDisplayTitle(a);
        const safe = title.replace(/'/g, "\\'");
        return `<li onclick="selectFromAide('${safe}')">${title}</li>`;
      })
      .join("") +
    `</ul>`;
}

// ========== Confettis ==========
function launchFireworks() {
  const canvas = document.getElementById("fireworks");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = [];

  function createParticle(x, y) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 5 + 2;
    return { x, y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: 60 };
  }

  for (let i = 0; i < 120; i++) {
    particles.push(createParticle(canvas.width / 2, canvas.height / 2));
  }

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

// ========== Victoire ==========
function showSuccessMessage() {
  let roundScore =
    MAX_SCORE -
    (attemptCount - 1) * TENTATIVE_COST -
    Object.values(indicesActivated).filter(Boolean).length * INDICE_COST;

  roundScore = clamp(roundScore, 0, MAX_SCORE);

  const title = getDisplayTitle(targetAnime);

  // message
  successContainerEl.innerHTML = `
    <div id="winMessage" style="margin-bottom: 18px; font-size: 2rem; font-weight: bold; text-align: center;">
      🎇 <span style="font-size:2.3rem;">🥳</span>
      Bravo ! C'était <u>${title}</u> en ${attemptCount} tentative${attemptCount > 1 ? "s" : ""}.
      <span style="font-size:2.3rem;">🎉</span>
      <div style="margin-top:10px; font-size:1.15rem; opacity:0.95;">
        Score : <b>${roundScore}</b> / ${MAX_SCORE}
      </div>
    </div>
    <div style="text-align:center;">
      <button id="nextBtn" class="menu-btn" style="font-size:1.1rem; margin: 0 auto 1rem auto;">
        ${isParcours ? (parcoursIndex + 1 < parcoursCount ? "Suivant" : "Terminer") : "Rejouer"}
      </button>
    </div>
  `;
  successContainerEl.style.display = "block";
  successContainerEl.scrollIntoView({ behavior: "smooth", block: "start" });

  const nextBtn = document.getElementById("nextBtn");
  nextBtn.onclick = () => {
    if (!isParcours) {
      startNewGame({ fromParcours: false, forceNewTarget: true });
      return;
    }

    // parcours
    parcoursTotalScore += roundScore;
    parcoursIndex++;

    if (parcoursIndex < parcoursCount) {
      startNewGame({ fromParcours: true, forceNewTarget: true });
    } else {
      setTimeout(() => {
        parent.postMessage(
          {
            parcoursScore: {
              label: "Anidle",
              score: parcoursTotalScore,
              total: parcoursCount * MAX_SCORE,
            },
          },
          "*"
        );
      }, 400);

      successContainerEl.innerHTML = `
        <div style="font-size:1.6rem;text-align:center;">
          🏆 Parcours terminé !<br>
          Score : <b>${parcoursTotalScore}</b> / ${parcoursCount * MAX_SCORE}
        </div>
      `;
    }
  };
}

// ========== Tooltip aide (info icon) ==========
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
