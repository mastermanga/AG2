const MAX_SCORE = 3000;
const TENTATIVE_COST = 150;
const INDICE_COST = 300;

const DB_URL = "../data/licenses_only.json";
const GAME_ID = "anidle";
const MIN_REQUIRED = 64;

// ========== MENU + THEME ==========
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

// ========== PARCOURS ==========
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
let parcoursIndex = 0;
let parcoursTotalScore = 0;

function seededRandom(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// ========== DATA ==========
let ALL_TITLES = null;  // DB normalisée
let animeData = [];     // pool filtré
let targetAnime = null;

function normalizeAnimeList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.animes)) return json.animes;
  return [];
}

function getYearFromSeason(seasonStr) {
  if (!seasonStr) return null;
  const m = String(seasonStr).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

function getDisplayTitle(anime) {
  return (
    anime?.title_english ||
    anime?.title_mal_default ||
    anime?.title_original ||
    anime?.animethemes?.name ||
    anime?.title ||
    "Unknown"
  );
}

function getSearchKey(anime) {
  const parts = [
    anime?.title_english,
    anime?.title_mal_default,
    anime?.title_original,
    anime?.animethemes?.name,
    anime?.title,
  ].filter(Boolean);
  return parts.join(" | ").toLowerCase();
}

// ========== PERSONNALISATION ==========
function setRangeFill() {
  const minEl = document.getElementById("yearMin");
  const maxEl = document.getElementById("yearMax");
  const fill = document.getElementById("range-fill");
  if (!minEl || !maxEl || !fill) return;

  const min = parseInt(minEl.value, 10);
  const max = parseInt(maxEl.value, 10);
  const minAttr = parseInt(minEl.min, 10);
  const maxAttr = parseInt(minEl.max, 10);
  const range = maxAttr - minAttr;

  const left = ((min - minAttr) / range) * 100;
  const right = ((max - minAttr) / range) * 100;

  fill.style.left = `${left}%`;
  fill.style.width = `${Math.max(0, right - left)}%`;
}

function syncUIValues() {
  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yMinVal = document.getElementById("yearMinVal");
  const yMaxVal = document.getElementById("yearMaxVal");
  const yLabel = document.getElementById("yearRangeLabel");

  if (pop && popVal) popVal.textContent = pop.value;
  if (score && scoreVal) scoreVal.textContent = score.value;

  if (yMin && yMax) {
    let a = parseInt(yMin.value || "2000", 10);
    let b = parseInt(yMax.value || "2026", 10);

    if (a > b) [a, b] = [b, a];
    yMin.value = String(a);
    yMax.value = String(b);

    if (yMinVal) yMinVal.textContent = String(a);
    if (yMaxVal) yMaxVal.textContent = String(b);
    if (yLabel) yLabel.textContent = `${a} → ${b}`;
  }

  setRangeFill();
}

function getSelectedTypes() {
  const set = new Set();
  document.querySelectorAll("#typePills .pill.active").forEach((btn) => set.add(btn.dataset.type));
  return set;
}

function readOptions() {
  syncUIValues();
  const popPercent = parseInt(document.getElementById("popPercent")?.value || "25", 10) / 100;
  const scorePercent = parseInt(document.getElementById("scorePercent")?.value || "25", 10) / 100;
  const yearMin = parseInt(document.getElementById("yearMin")?.value || "2000", 10);
  const yearMax = parseInt(document.getElementById("yearMax")?.value || "2026", 10);
  const types = getSelectedTypes();
  return { popPercent, scorePercent, yearMin, yearMax, types };
}

function filterTitles(allTitles, opts) {
  let arr = [...allTitles];

  // Types
  if (opts.types && opts.types.size > 0) {
    arr = arr.filter((a) => opts.types.has(String(a.type || "")));
  }

  // Années (année du titre)
  arr = arr.filter((a) => {
    const y = getYearFromSeason(a.season);
    if (y == null) return false;
    return y >= opts.yearMin && y <= opts.yearMax;
  });

  // Popularité: top X% par members
  arr.sort((a, b) => (b.members || 0) - (a.members || 0));
  arr = arr.slice(0, Math.max(1, Math.ceil(arr.length * opts.popPercent)));

  // Score: top X% par score
  arr.sort((a, b) => (b.score || 0) - (a.score || 0));
  arr = arr.slice(0, Math.max(1, Math.ceil(arr.length * opts.scorePercent)));

  return arr;
}

function updatePreview() {
  if (!ALL_TITLES) return;

  const preview = document.getElementById("previewCount");
  const applyBtn = document.getElementById("applyFiltersBtn");

  const opts = readOptions();
  const filtered = filterTitles(ALL_TITLES, opts);

  animeData = filtered;

  const ok = filtered.length >= MIN_REQUIRED;

  if (preview) {
    preview.textContent = ok
      ? `✅ ${filtered.length} titres disponibles (min ${MIN_REQUIRED})`
      : `⚠️ ${filtered.length} titres seulement (min ${MIN_REQUIRED})`;
    preview.classList.toggle("good", ok);
    preview.classList.toggle("bad", !ok);
  }
  if (applyBtn) applyBtn.disabled = !ok;
}

function wireCustomizationUI() {
  const panel = document.getElementById("custom-panel");
  if (!panel) return;

  // pills
  const pillsWrap = document.getElementById("typePills");
  if (pillsWrap) {
    pillsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".pill");
      if (!btn) return;

      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");

      // éviter 0 type
      const anyActive = document.querySelectorAll("#typePills .pill.active").length > 0;
      if (!anyActive) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }

      updatePreview();
    });
  }

  // sliders
  panel.querySelectorAll("input[type='range']").forEach((el) => {
    el.addEventListener("input", () => {
      // si l'utilisateur croise les sliders, on corrige dans syncUIValues()
      syncUIValues();
      updatePreview();
    });
    el.addEventListener("change", () => {
      syncUIValues();
      updatePreview();
    });
  });

  // apply
  const applyBtn = document.getElementById("applyFiltersBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      if (applyBtn.disabled) return;

      // cacher la personnalisation et afficher le jeu
      panel.style.display = "none";
      document.getElementById("container").style.display = "";

      setupGame();
    });
  }
}

// ========== GAME STATE ==========
let attemptCount = 0;
let gameOver = false;

let indicesActivated = { studio: false, saison: false, genres: false, score: false };
let indicesAvailable = { studio: false, saison: false, genres: false, score: false };
let indicesGenresFound = [];
let indicesYearAtActivation = null;
let indicesStudioAtActivation = null;
let indicesScoreRange = null;
let indicesGenresFoundSet = new Set();
let indicesScoreRangeActivation = [0, 0];

function resetScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");
  if (scoreBar) scoreBar.style.width = "100%";
  if (scoreBarLabel) scoreBarLabel.textContent = `${MAX_SCORE} / ${MAX_SCORE}`;
}

function clearUIForNewGame() {
  attemptCount = 0;
  resetScoreBar();
  gameOver = false;

  indicesActivated = { studio: false, saison: false, genres: false, score: false };
  indicesAvailable = { studio: false, saison: false, genres: false, score: false };
  indicesGenresFound = [];
  indicesGenresFoundSet = new Set();
  indicesYearAtActivation = null;
  indicesStudioAtActivation = null;
  indicesScoreRange = null;
  indicesScoreRangeActivation = [0, 0];

  document.getElementById("animeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
  document.getElementById("results").innerHTML = "";
  document.getElementById("counter").textContent = "Tentatives : 0 (-150)";
  document.getElementById("successContainer").style.display = "none";
  document.getElementById("animeInput").disabled = false;

  ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = true;
      btn.classList.remove("used");
    }
  });

  updateAideList();
  updateScoreBar();
}

function setupGame() {
  if (!animeData || animeData.length < MIN_REQUIRED) {
    updatePreview();
  }
  if (!animeData || animeData.length < MIN_REQUIRED) {
    alert(`Pas assez de titres (${animeData?.length || 0}). Il en faut au moins ${MIN_REQUIRED}.`);
    return;
  }

  targetAnime = animeData[Math.floor(Math.random() * animeData.length)];
  clearUIForNewGame();
}

// ========== SUGGESTIONS AUTO-COMPLETE ==========
document.getElementById("animeInput").addEventListener("input", function () {
  if (gameOver) return;

  const input = this.value.toLowerCase();
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = "";

  if (!input) return;

  const matches = animeData
    .filter((a) => getSearchKey(a).includes(input))
    .slice(0, 7);

  matches.forEach((anime) => {
    const div = document.createElement("div");
    div.textContent = getDisplayTitle(anime);
    div.onclick = () => {
      document.getElementById("animeInput").value = getDisplayTitle(anime);
      suggestions.innerHTML = "";
      guessAnime();
    };
    suggestions.appendChild(div);
  });
});

// ========== INDICES ==========
document.getElementById("btnIndiceStudio").addEventListener("click", function () {
  if (!indicesAvailable.studio || indicesActivated.studio) return;
  indicesActivated.studio = true;
  indicesStudioAtActivation = targetAnime.studio;
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceSaison").addEventListener("click", function () {
  if (!indicesAvailable.saison || indicesActivated.saison) return;
  indicesActivated.saison = true;
  indicesYearAtActivation = String(getYearFromSeason(targetAnime.season));
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceGenres").addEventListener("click", function () {
  if (!indicesAvailable.genres || indicesActivated.genres) return;
  indicesActivated.genres = true;
  indicesGenresFound = [...indicesGenresFoundSet];
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

document.getElementById("btnIndiceScore").addEventListener("click", function () {
  if (!indicesAvailable.score || indicesActivated.score) return;
  indicesActivated.score = true;
  indicesScoreRange = indicesScoreRangeActivation.slice();
  this.disabled = true;
  this.classList.add("used");
  updateAideList();
  updateScoreBar();
});

function updateScoreBar() {
  const scoreBar = document.getElementById("score-bar");
  const scoreBarLabel = document.getElementById("score-bar-label");

  const indiceCount = Object.values(indicesActivated).filter(Boolean).length;
  const tentative = Math.max(0, attemptCount - 1);

  let score = MAX_SCORE - tentative * TENTATIVE_COST - indiceCount * INDICE_COST;
  score = Math.max(0, Math.min(score, MAX_SCORE));

  const width = (score / MAX_SCORE) * 100;
  if (scoreBarLabel) scoreBarLabel.textContent = `${score} / ${MAX_SCORE}`;

  const percent = score / MAX_SCORE;
  if (scoreBar) {
    scoreBar.style.width = width + "%";
    if (percent > 0.66) scoreBar.style.background = "linear-gradient(90deg,#7ee787,#3b82f6 90%)";
    else if (percent > 0.33) scoreBar.style.background = "linear-gradient(90deg,#ffd700,#ff9800 90%)";
    else scoreBar.style.background = "linear-gradient(90deg,#ef4444,#f59e42 90%)";
  }
  if (scoreBar && score < 1000) scoreBar.classList.add("danger-pulse");
  else if (scoreBar) scoreBar.classList.remove("danger-pulse");
}

// ========== GAME CORE ==========
function findByDisplayTitle(input) {
  const low = input.trim().toLowerCase();
  if (!low) return null;

  let found = animeData.find((a) => getDisplayTitle(a).toLowerCase() === low);
  if (found) return found;

  found = animeData.find((a) => getSearchKey(a).split("|").some((p) => p.trim() === low));
  if (found) return found;

  const candidates = animeData.filter((a) => getSearchKey(a).includes(low));
  if (candidates.length === 1) return candidates[0];

  return null;
}

function guessAnime() {
  if (gameOver) return;

  const input = document.getElementById("animeInput").value.trim();
  const guessedAnime = findByDisplayTitle(input);

  if (!guessedAnime) {
    alert("Anime non trouvé !");
    return;
  }

  attemptCount++;
  document.getElementById("counter").textContent = `Tentatives : ${attemptCount} (-150)`;

  // Indice Studio
  if (!indicesActivated.studio && guessedAnime.studio === targetAnime.studio) {
    indicesAvailable.studio = true;
    document.getElementById("btnIndiceStudio").disabled = false;
  }

  // Indice Année (orange si année ok)
  const gYear = getYearFromSeason(guessedAnime.season);
  const tYear = getYearFromSeason(targetAnime.season);
  if (!indicesActivated.saison && gYear != null && tYear != null && gYear === tYear) {
    indicesAvailable.saison = true;
    document.getElementById("btnIndiceSaison").disabled = false;
  }

  // Genres/Thèmes
  const allGuessed = [...(guessedAnime.genres || []), ...(guessedAnime.themes || [])];
  const allTarget = [...(targetAnime.genres || []), ...(targetAnime.themes || [])];
  allGuessed.forEach((g) => {
    if (allTarget.includes(g) && !indicesGenresFoundSet.has(g)) indicesGenresFoundSet.add(g);
  });
  if (!indicesActivated.genres && indicesGenresFoundSet.size > 0) {
    indicesAvailable.genres = true;
    document.getElementById("btnIndiceGenres").disabled = false;
  }

  // Score (±0.30)
  const gScore = parseFloat(guessedAnime.score);
  const tScore = parseFloat(targetAnime.score);
  let isScoreMatchOrClose = false;

  if (!Number.isNaN(gScore) && !Number.isNaN(tScore)) {
    if (gScore === tScore) {
      isScoreMatchOrClose = true;
      indicesScoreRangeActivation = [gScore - 0.3, gScore + 0.3];
    } else if (Math.abs(gScore - tScore) <= 0.3) {
      isScoreMatchOrClose = true;
      indicesScoreRangeActivation = [Math.min(gScore, tScore) - 0.3, Math.max(gScore, tScore) + 0.3];
    }
  }

  if (!indicesActivated.score && isScoreMatchOrClose) {
    indicesAvailable.score = true;
    document.getElementById("btnIndiceScore").disabled = false;
  }

  // Affichage résultat
  const results = document.getElementById("results");
  const keyToClass = {
    image: "cell-image",
    title: "cell-title",
    season: "cell-season",
    studio: "cell-studio",
    genresThemes: "cell-genre",
    score: "cell-score",
  };

  if (attemptCount === 1) {
    const header = document.createElement("div");
    header.classList.add("row");
    ["Image", "Titre", "Saison", "Studio", "Genres / Thèmes", "Score"].forEach((label, i) => {
      const cell = document.createElement("div");
      cell.classList.add("cell", Object.values(keyToClass)[i]);
      cell.style.fontWeight = "bold";
      cell.textContent = label;
      header.appendChild(cell);
    });
    results.insertBefore(header, results.firstChild);
  }

  const row = document.createElement("div");
  row.classList.add("row");

  // Image
  const cellImage = document.createElement("div");
  cellImage.classList.add("cell", keyToClass.image);
  const img = document.createElement("img");
  img.src = guessedAnime.image;
  img.alt = getDisplayTitle(guessedAnime);
  img.style.width = "100px";
  cellImage.appendChild(img);
  row.appendChild(cellImage);

  // Titre
  const cellTitle = document.createElement("div");
  cellTitle.classList.add("cell", keyToClass.title);

  const isTitleMatch = (guessedAnime.mal_id && targetAnime.mal_id)
    ? guessedAnime.mal_id === targetAnime.mal_id
    : getDisplayTitle(guessedAnime) === getDisplayTitle(targetAnime);

  cellTitle.classList.add(isTitleMatch ? "green" : "red");
  cellTitle.textContent = getDisplayTitle(guessedAnime);
  row.appendChild(cellTitle);

  // Saison
  const cellSeason = document.createElement("div");
  cellSeason.classList.add("cell", keyToClass.season);

  const [gs, gy] = String(guessedAnime.season || "").split(" ");
  const [ts, ty] = String(targetAnime.season || "").split(" ");

  if (gs === ts && gy === ty) {
    cellSeason.classList.add("green");
    cellSeason.textContent = `✅ ${guessedAnime.season}`;
  } else if (gy && ty && gy === ty) {
    cellSeason.classList.add("orange");
    cellSeason.textContent = `🟧 ${guessedAnime.season}`;
  } else {
    cellSeason.classList.add("red");
    const gY = parseInt(gy || "0", 10);
    const tY = parseInt(ty || "0", 10);
    if (gY && tY) {
      cellSeason.textContent = gY < tY ? `🔼 ${guessedAnime.season}` : `${guessedAnime.season} 🔽`;
    } else {
      cellSeason.textContent = guessedAnime.season || "—";
    }
  }
  row.appendChild(cellSeason);

  // Studio
  const cellStudio = document.createElement("div");
  cellStudio.classList.add("cell", keyToClass.studio);
  const isStudioMatch = guessedAnime.studio === targetAnime.studio;
  cellStudio.classList.add(isStudioMatch ? "green" : "red");
  cellStudio.textContent = guessedAnime.studio || "—";
  row.appendChild(cellStudio);

  // Genres/Thèmes
  const cellGenresThemes = document.createElement("div");
  cellGenresThemes.classList.add("cell", keyToClass.genresThemes);
  const matches = allGuessed.filter((x) => allTarget.includes(x));

  if (matches.length === allGuessed.length && matches.length === allTarget.length && matches.length > 0) {
    cellGenresThemes.classList.add("green");
  } else if (matches.length > 0) {
    cellGenresThemes.classList.add("orange");
  } else {
    cellGenresThemes.classList.add("red");
  }
  cellGenresThemes.innerHTML = allGuessed.length ? allGuessed.join("<br>") : "—";
  row.appendChild(cellGenresThemes);

  // Score
  const cellScore = document.createElement("div");
  cellScore.classList.add("cell", keyToClass.score);

  if (gScore === tScore) {
    cellScore.classList.add("green");
    cellScore.textContent = `✅ ${gScore}`;
  } else if (!Number.isNaN(gScore) && !Number.isNaN(tScore) && Math.abs(gScore - tScore) <= 0.3) {
    cellScore.classList.add("orange");
    cellScore.textContent = gScore < tScore ? `🟧🔼 ${gScore}` : `🟧 ${gScore} 🔽`;
  } else if (!Number.isNaN(gScore) && !Number.isNaN(tScore)) {
    cellScore.classList.add("red");
    cellScore.textContent = gScore < tScore ? `🔼 ${gScore}` : `${gScore} 🔽`;
  } else {
    cellScore.classList.add("red");
    cellScore.textContent = String(guessedAnime.score ?? "—");
  }
  row.appendChild(cellScore);

  const header = results.querySelector(".row");
  results.insertBefore(row, header.nextSibling);

  document.getElementById("animeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";

  updateAideList();
  updateScoreBar();

  if (isTitleMatch) {
    gameOver = true;
    document.getElementById("animeInput").disabled = true;
    ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = true;
    });
    showSuccessMessage();
    launchFireworks();
  }
}

// ========== Suggestions Aide ==========
function updateAideList() {
  const aideDiv = document.getElementById("aideContainer");
  let filtered = animeData;

  if (indicesActivated.studio && indicesStudioAtActivation) {
    filtered = filtered.filter((a) => a.studio === indicesStudioAtActivation);
  }
  if (indicesActivated.saison && indicesYearAtActivation) {
    filtered = filtered.filter((a) => String(getYearFromSeason(a.season)) === String(indicesYearAtActivation));
  }
  if (indicesActivated.genres && indicesGenresFound.length > 0) {
    filtered = filtered.filter((a) => {
      const allG = [...(a.genres || []), ...(a.themes || [])];
      return indicesGenresFound.every((x) => allG.includes(x));
    });
  }
  if (indicesActivated.score && indicesScoreRange) {
    filtered = filtered.filter((a) => {
      const val = parseFloat(a.score);
      return !Number.isNaN(val) && val >= indicesScoreRange[0] && val <= indicesScoreRange[1];
    });
  }

  aideDiv.innerHTML =
    `<h3>🔍 Suggestions</h3><ul>` +
    filtered.slice(0, 200).map((a) => {
      const t = getDisplayTitle(a).replace(/'/g, "\\'");
      return `<li onclick="selectFromAide('${t}')">${getDisplayTitle(a)}</li>`;
    }).join("") +
    `</ul>`;
}

window.selectFromAide = function (title) {
  document.getElementById("animeInput").value = title;
  guessAnime();
};

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
  for (let i = 0; i < 100; i++) particles.push(createParticle(canvas.width / 2, canvas.height / 2));

  function animate() {
    ctx.fillStyle = "rgba(0,0,0,0.1)";
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
function showSuccessMessageClassic() {
  const container = document.getElementById("successContainer");
  let roundScore =
    MAX_SCORE -
    (attemptCount - 1) * TENTATIVE_COST -
    Object.values(indicesActivated).filter(Boolean).length * INDICE_COST;

  if (roundScore < 0) roundScore = 0;

  container.innerHTML = `
    <div id="winMessage" style="margin-bottom: 18px; font-size: 2rem; font-weight: bold; text-align: center;">
      🎇 <span style="font-size:2.3rem;">🥳</span>
      Bravo ! C'était <u>${getDisplayTitle(targetAnime)}</u> en ${attemptCount} tentative${attemptCount > 1 ? "s" : ""}.
      <span style="font-size:2.3rem;">🎉</span>
    </div>
    <div style="text-align:center;">
      <button id="nextBtn" class="menu-btn" style="font-size:1.1rem; margin: 0 auto 1rem auto;">
        Rejouer
      </button>
    </div>
  `;
  container.style.display = "block";
  container.scrollIntoView({ behavior: "smooth", block: "start" });

  document.getElementById("nextBtn").onclick = () => {
    // réaffiche perso
    const panel = document.getElementById("custom-panel");
    if (panel) panel.style.display = "";
    document.getElementById("container").style.display = "none";
    updatePreview();
  };
}

function showSuccessMessageParcours(roundScore) {
  const container = document.getElementById("successContainer");
  container.innerHTML = `
    <div id="winMessage" style="margin-bottom: 18px; font-size: 2rem; font-weight: bold; text-align: center;">
      🎇 <span style="font-size:2.3rem;">🥳</span>
      Bravo ! C'était <u>${getDisplayTitle(targetAnime)}</u> en ${attemptCount} tentative${attemptCount > 1 ? "s" : ""}.
      <span style="font-size:2.3rem;">🎉</span>
    </div>
    <div style="text-align:center;">
      <button id="nextParcoursBtn" class="menu-btn" style="font-size:1.1rem; margin: 0 auto 1rem auto;">
        ${parcoursIndex + 1 < parcoursCount ? "Suivant" : "Terminer"}
      </button>
    </div>
  `;
  container.style.display = "block";
  container.scrollIntoView({ behavior: "smooth", block: "start" });

  document.getElementById("nextParcoursBtn").onclick = () => {
    parcoursIndex++;
    if (parcoursIndex < parcoursCount) {
      launchParcoursRound();
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

      container.innerHTML = `<div style="font-size:1.6rem;text-align:center;">
        🏆 Parcours terminé !<br>Score : <b>${parcoursTotalScore}</b> / ${parcoursCount * MAX_SCORE}
      </div>`;
    }
  };
}

function showSuccessMessage() {
  let roundScore =
    MAX_SCORE -
    (attemptCount - 1) * TENTATIVE_COST -
    Object.values(indicesActivated).filter(Boolean).length * INDICE_COST;

  if (roundScore < 0) roundScore = 0;

  if (isParcours) {
    parcoursTotalScore += roundScore;
    showSuccessMessageParcours(roundScore);
  } else {
    showSuccessMessageClassic();
  }
}

function launchParcoursRound() {
  clearUIForNewGame();
  const rand = seededRandom(Date.now() + parcoursIndex * 37)();
  targetAnime = animeData[Math.floor(rand * animeData.length)];
  updateAideList();
  updateScoreBar();
}

// ========== TOOLTIP ==========
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

// ========== INIT ==========
async function loadDatabaseOnce() {
  if (ALL_TITLES) return ALL_TITLES;
  const res = await fetch(DB_URL);
  if (!res.ok) throw new Error("Erreur chargement " + DB_URL);
  const json = await res.json();
  const data = normalizeAnimeList(json);
  if (!Array.isArray(data) || data.length === 0) throw new Error("Base vide ou format JSON non reconnu.");
  ALL_TITLES = data;
  return ALL_TITLES;
}

async function init() {
  try {
    await loadDatabaseOnce();
  } catch (e) {
    alert(e.message);
    return;
  }

  syncUIValues();
  wireCustomizationUI();
  updatePreview();

  // Au chargement : on affiche la personnalisation, pas le jeu
  document.getElementById("container").style.display = "none";

  if (isParcours) {
    document.getElementById("back-to-menu").style.display = "none";
    document.getElementById("custom-panel").style.display = "none";
    document.getElementById("container").style.display = "";

    // Defaults parcours (TV+Movie, 2000-2026, top 25% pop + score)
    const opts = { popPercent: 0.25, scorePercent: 0.25, yearMin: 2000, yearMax: 2026, types: new Set(["TV", "Movie"]) };
    animeData = filterTitles(ALL_TITLES, opts);

    parcoursIndex = 0;
    parcoursTotalScore = 0;
    launchParcoursRound();
  }
}

init();
