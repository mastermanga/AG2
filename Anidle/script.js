/***********************
 * CONSTANTES
 ***********************/
const MAX_SCORE = 3000;
const TENTATIVE_COST = 150;
const INDICE_COST = 300;

/***********************
 * NAVIGATION / THEME
 ***********************/
document.getElementById("back-to-menu").onclick = () => {
  window.location.href = "../index.html";
};

document.getElementById("themeToggle").onclick = () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
};

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
  }
});

/***********************
 * DATA
 ***********************/
let allAnimes = [];
let filteredAnimes = [];
let targetAnime = null;

/***********************
 * GAME STATE
 ***********************/
let attemptCount = 0;
let gameOver = false;

let indicesActivated = {
  studio: false,
  saison: false,
  genres: false,
  score: false
};

let indicesAvailable = {
  studio: false,
  saison: false,
  genres: false,
  score: false
};

let indicesGenresFoundSet = new Set();
let indicesYearAtActivation = null;
let indicesStudioAtActivation = null;
let indicesScoreRange = null;

/***********************
 * LOAD DATA
 ***********************/
fetch("../data/licenses_only.json")
  .then(res => res.json())
  .then(data => {
    allAnimes = data;
    initPersonalisation();
  });

/***********************
 * PERSONNALISATION
 ***********************/
function initPersonalisation() {
  const popSlider = document.getElementById("popPercent");
  const scoreSlider = document.getElementById("scorePercent");
  const yearMin = document.getElementById("yearMin");
  const yearMax = document.getElementById("yearMax");

  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yearMinVal = document.getElementById("yearMinVal");
  const yearMaxVal = document.getElementById("yearMaxVal");

  function updateLabels() {
    popVal.textContent = popSlider.value;
    scoreVal.textContent = scoreSlider.value;
    yearMinVal.textContent = yearMin.value;
    yearMaxVal.textContent = yearMax.value;
    updatePreview();
  }

  [popSlider, scoreSlider, yearMin, yearMax].forEach(el =>
    el.addEventListener("input", updateLabels)
  );

  document.querySelectorAll(".pill").forEach(btn => {
    btn.onclick = () => {
      btn.classList.toggle("active");
      btn.setAttribute(
        "aria-pressed",
        btn.classList.contains("active")
      );
      updatePreview();
    };
  });

  document.getElementById("applyFiltersBtn").onclick = startGame;

  updateLabels();
}

/***********************
 * FILTERING
 ***********************/
function applyFilters() {
  const popPercent = parseInt(document.getElementById("popPercent").value, 10);
  const scorePercent = parseInt(document.getElementById("scorePercent").value, 10);
  const yearMin = parseInt(document.getElementById("yearMin").value, 10);
  const yearMax = parseInt(document.getElementById("yearMax").value, 10);

  const allowedTypes = [...document.querySelectorAll(".pill.active")]
    .map(b => b.dataset.type);

  let data = [...allAnimes];

  // YEAR
  data = data.filter(a => {
    const y = parseInt((a.season || "").split(" ")[1] || "0", 10);
    return y >= yearMin && y <= yearMax;
  });

  // TYPE
  data = data.filter(a => allowedTypes.includes(a.type));

  // POPULARITY (members)
  data.sort((a, b) => b.members - a.members);
  data = data.slice(0, Math.ceil(data.length * (popPercent / 100)));

  // SCORE
  data.sort((a, b) => b.score - a.score);
  data = data.slice(0, Math.ceil(data.length * (scorePercent / 100)));

  return data;
}

/***********************
 * PREVIEW COUNT
 ***********************/
function updatePreview() {
  filteredAnimes = applyFilters();
  const box = document.getElementById("previewCount");

  box.textContent = `📚 Titres disponibles : ${filteredAnimes.length}`;
  box.classList.toggle("good", filteredAnimes.length >= 64);
  box.classList.toggle("bad", filteredAnimes.length < 64);

  document.getElementById("applyFiltersBtn").disabled =
    filteredAnimes.length < 64;
}

/***********************
 * START GAME
 ***********************/
function startGame() {
  filteredAnimes = applyFilters();
  targetAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];

  document.body.classList.add("game-started");

  resetGame();
}

/***********************
 * RESET GAME
 ***********************/
function resetGame() {
  attemptCount = 0;
  gameOver = false;

  indicesActivated = { studio:false, saison:false, genres:false, score:false };
  indicesAvailable = { studio:false, saison:false, genres:false, score:false };

  indicesGenresFoundSet.clear();
  indicesYearAtActivation = null;
  indicesStudioAtActivation = null;
  indicesScoreRange = null;

  document.getElementById("results").innerHTML = "";
  document.getElementById("animeInput").value = "";
  document.getElementById("counter").textContent = "Tentatives : 0 (-150)";
  updateScoreBar();
  updateAideList();
}

/***********************
 * SCORE BAR
 ***********************/
function updateScoreBar() {
  const bar = document.getElementById("score-bar");
  const label = document.getElementById("score-bar-label");

  const indiceCount = Object.values(indicesActivated).filter(Boolean).length;
  let score = MAX_SCORE - attemptCount * TENTATIVE_COST - indiceCount * INDICE_COST;
  score = Math.max(0, score);

  bar.style.width = `${(score / MAX_SCORE) * 100}%`;
  label.textContent = `${score} / ${MAX_SCORE}`;
}

/***********************
 * AUTOCOMPLETE (RANDOM)
 ***********************/
document.getElementById("animeInput").addEventListener("input", function () {
  if (gameOver) return;

  const input = this.value.toLowerCase();
  const matches = filteredAnimes
    .filter(a => a.title_english.toLowerCase().includes(input))
    .sort(() => Math.random() - 0.5);

  const box = document.getElementById("suggestions");
  box.innerHTML = "";

  matches.forEach(a => {
    const div = document.createElement("div");
    div.textContent = a.title_english;
    div.onclick = () => {
      this.value = a.title_english;
      box.innerHTML = "";
      guessAnime();
    };
    box.appendChild(div);
  });
});

/***********************
 * GUESS
 ***********************/
function guessAnime() {
  if (gameOver) return;

  const value = document.getElementById("animeInput").value.toLowerCase();
  const guessed = filteredAnimes.find(
    a => a.title_english.toLowerCase() === value
  );
  if (!guessed) return alert("Anime non trouvé");

  attemptCount++;
  document.getElementById("counter").textContent =
    `Tentatives : ${attemptCount} (-150)`;

  updateScoreBar();
  updateAideList();

  if (guessed.mal_id === targetAnime.mal_id) {
    gameOver = true;
    showVictory();
  }
}

/***********************
 * AIDE LIST (RANDOM)
 ***********************/
function updateAideList() {
  const div = document.getElementById("aideContainer");

  const shuffled = [...filteredAnimes].sort(() => Math.random() - 0.5);

  div.innerHTML =
    "<h3>🔍 Suggestions</h3><ul>" +
    shuffled.map(a =>
      `<li onclick="selectFromAide('${a.title_english.replace(/'/g,"\\'")}')">
        ${a.title_english}
      </li>`
    ).join("") +
    "</ul>";
}

function selectFromAide(title) {
  document.getElementById("animeInput").value = title;
  guessAnime();
}

/***********************
 * VICTORY
 ***********************/
function showVictory() {
  const box = document.getElementById("successContainer");
  box.style.display = "block";
  box.innerHTML = `
    <div id="winMessage">
      🎉 Bravo !<br>
      C'était <u>${targetAnime.title_english}</u>
    </div>
  `;
}
