const MAX_SCORE = 3000;
const TENTATIVE_COST = 150;
const INDICE_COST = 300;

// ========== DARK/LIGHT MODE + MENU ==========
document.getElementById("back-to-menu").addEventListener("click", function() {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.add("light");
  }
});

// ========= DAILY DATE FUNCTION ==========
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ========= DAILY SEEDING LOGIC ==========
const GAME_ID = "anidle"; // Ne pas oublier de changer si tu clones pour un autre jeu
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xFFFFFFFF;
  }
  return Math.abs(hash);
}
function getDailyIndex(len) {
  const dateStr = getTodayString();
  const hash = simpleHash(dateStr + "|" + GAME_ID);
  return hash % len;
}
function seededRandom(seed) {
  return function() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// ========== ANIMEDLE GAME (MODE DAILY/CLASSIC/PARCOURS) ==========
let animeData = [];
let targetAnime = null;
let attemptCount = 0;
let gameOver = false;

// -- Indices State --
let indicesActivated = { studio: false, saison: false, genres: false, score: false };
let indicesAvailable = { studio: false, saison: false, genres: false, score: false };
let indicesGenresFound = [];
let indicesYearAtActivation = null;
let indicesStudioAtActivation = null;
let indicesScoreRange = null;
let indicesGenresFoundSet = new Set();
let indicesScoreRangeActivation = [0,0];

// -- Mode switch --
let isDaily = true;
const DAILY_BANNER = document.getElementById("daily-banner");
const DAILY_STATUS = document.getElementById("daily-status");
const DAILY_SCORE = document.getElementById("daily-score");
const SWITCH_MODE_BTN = document.getElementById("switch-mode-btn");

const todayString = getTodayString();
const SCORE_KEY = `dailyScore_${GAME_ID}_${todayString}`;
const STARTED_KEY = `dailyStarted_${GAME_ID}_${todayString}`;

let dailyPlayed = false;
let dailyScore = null;

// ======== MODE PARCOURS ========
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
let parcoursIndex = 0;
let parcoursTotalScore = 0;

// ========== DATA LOAD ================
fetch('../data/animes.json')
  .then(response => response.json())
  .then(data => {
    animeData = data;
    if (isParcours) {
      document.getElementById("back-to-menu").style.display = "none";
      isDaily = false;
      parcoursIndex = 0;
      parcoursTotalScore = 0;
      if (DAILY_BANNER) DAILY_BANNER.style.display = "none";
      launchParcoursRound();
    } else {
      setupGame();
    }
  });

function resetScoreBar() {
  const scoreBar = document.getElementById('score-bar');
  const scoreBarLabel = document.getElementById('score-bar-label');
  if (scoreBar) scoreBar.style.width = '100%';
  if (scoreBarLabel) scoreBarLabel.textContent = "3000 / 3000";
}

function setupGame() {
  dailyScore = localStorage.getItem(SCORE_KEY);
  dailyPlayed = !!dailyScore;

  if (isDaily && localStorage.getItem(STARTED_KEY) && !localStorage.getItem(SCORE_KEY)) {
    dailyPlayed = true;
    dailyScore = 0;
    showDailyBanner();
    lockDailyInputs();
    gameOver = true;
    return;
  }

  if (isDaily) {
    let animeIdx = getDailyIndex(animeData.length);
    targetAnime = animeData[animeIdx];
    showDailyBanner();
    if (dailyPlayed) {
      lockDailyInputs();
      gameOver = true;
      return;
    }
    localStorage.setItem(STARTED_KEY, "1");
  } else {
    targetAnime = animeData[Math.floor(Math.random() * animeData.length)];
    if (DAILY_BANNER) DAILY_BANNER.style.display = "none";
    unlockClassicInputs();
  }

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
  indicesScoreRangeActivation = [0,0];

  document.getElementById("animeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
  document.getElementById("results").innerHTML = "";
  document.getElementById("counter").textContent = "Tentatives : 0 (-150)";
  document.getElementById("successContainer").style.display = "none";
  document.getElementById("animeInput").disabled = false;

  if (!document.getElementById("tentative-cost")) {
    const div = document.createElement("div");
    div.id = "tentative-cost";
    div.style = "font-size:0.98rem; color:#ffc107; margin-top:2px; margin-bottom:8px;";
    document.getElementById("counter").after(div);
  }

  ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach(id => {
    const btn = document.getElementById(id);
    if(btn) {
      btn.disabled = true;
      btn.classList.remove('used');
    }
  });

  updateAideList();
  updateScoreBar()
}

// === le reste du script (lockDailyInputs, unlockClassicInputs, showDailyBanner, updateSwitchModeBtn, etc.) reste inchangé ===
// (tu peux laisser tout le reste tel quel)



function lockDailyInputs() {
  document.getElementById("animeInput").disabled = true;
  ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).disabled = true;
  });
}
function unlockClassicInputs() {
  document.getElementById("animeInput").disabled = false;
  ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).disabled = false;
  });
}

// --- BANDEAU DAILY ---
function showDailyBanner() {
  if (!DAILY_BANNER) return;
  DAILY_BANNER.style.display = "block";
  updateSwitchModeBtn();
  if (dailyPlayed) {
    const saved = localStorage.getItem(SCORE_KEY);
    DAILY_STATUS.textContent = "✅ Daily du jour déjà jouée !";
    DAILY_SCORE.textContent = saved ? `Score : ${saved} pts` : "Score : 0 pts";
  } else {
    DAILY_STATUS.textContent = "🎲 Daily du jour :";
    DAILY_SCORE.textContent = "";
  }
}

function updateSwitchModeBtn() {
  if (!SWITCH_MODE_BTN) return;
  if (isDaily) {
    SWITCH_MODE_BTN.textContent = "Passer en mode Classique";
    SWITCH_MODE_BTN.style.backgroundColor = "#42a5f5";
  } else {
    SWITCH_MODE_BTN.textContent = "Revenir au Daily";
    SWITCH_MODE_BTN.style.backgroundColor = "#00bcd4";
  }
}
if (SWITCH_MODE_BTN) {
  SWITCH_MODE_BTN.onclick = () => {
    isDaily = !isDaily;
    setupGame();
  };
}

// ========== SUGGESTIONS AUTO-COMPLETE ==========
document.getElementById("animeInput").addEventListener("input", function() {
  if (isDaily && dailyPlayed) return;
  const input = this.value.toLowerCase();
  const matches = animeData.filter(a => a.title.toLowerCase().includes(input)).slice(0, 5);
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = "";
  matches.forEach(anime => {
    const div = document.createElement("div");
    div.textContent = anime.title;
    div.onclick = () => {
      document.getElementById("animeInput").value = anime.title;
      suggestions.innerHTML = "";
      guessAnime();
    };
    suggestions.appendChild(div);
  });
});

// ========== NOUVELLE GESTION INDICES ==========
document.getElementById("btnIndiceStudio").addEventListener("click", function() {
  if (!indicesAvailable.studio || indicesActivated.studio) return;
  indicesActivated.studio = true;
  indicesStudioAtActivation = targetAnime.studio;
  this.disabled = true;
  this.classList.add('used');
  updateAideList();
  updateScoreBar();
});
document.getElementById("btnIndiceSaison").addEventListener("click", function() {
  if (!indicesAvailable.saison || indicesActivated.saison) return;
  indicesActivated.saison = true;
  indicesYearAtActivation = targetAnime.season.split(" ")[1];
  this.disabled = true;
  this.classList.add('used');
  updateAideList();
  updateScoreBar();
});
document.getElementById("btnIndiceGenres").addEventListener("click", function() {
  if (!indicesAvailable.genres || indicesActivated.genres) return;
  indicesActivated.genres = true;
  indicesGenresFound = [...indicesGenresFoundSet];
  this.disabled = true;
  this.classList.add('used');
  updateAideList();
  updateScoreBar();
});
document.getElementById("btnIndiceScore").addEventListener("click", function() {
  if (!indicesAvailable.score || indicesActivated.score) return;
  indicesActivated.score = true;
  indicesScoreRange = indicesScoreRangeActivation.slice(); // [min, max]
  this.disabled = true;
  this.classList.add('used');
  updateAideList();
  updateScoreBar();
});

function updateScoreBar() {
  const scoreBar = document.getElementById('score-bar');
  const scoreBarLabel = document.getElementById('score-bar-label');
  let indiceCount = Object.values(indicesActivated).filter(Boolean).length;
  let tentative = Math.max(0, attemptCount - 1);
  let score = 3000 - tentative * 150 - indiceCount * 300;
  score = Math.max(0, Math.min(score, 3000));
  if (score < 0) score = 0;
  let width = (score / 3000 * 100);
  if (scoreBarLabel) scoreBarLabel.textContent = score + " / 3000";

  let percent = score / 3000;
  if (scoreBar) {
    scoreBar.style.width = width + '%';
    if(percent > 0.66)      scoreBar.style.background = "linear-gradient(90deg,#7ee787,#3b82f6 90%)";
    else if(percent > 0.33) scoreBar.style.background = "linear-gradient(90deg,#ffd700,#ff9800 90%)";
    else                    scoreBar.style.background = "linear-gradient(90deg,#ef4444,#f59e42 90%)";
  }
  if (scoreBar && score < 1000) {
  scoreBar.classList.add('danger-pulse');
  } else if (scoreBar) {
    scoreBar.classList.remove('danger-pulse');
  }
}

// ========== FONCTION PRINCIPALE DE JEU ==========
function guessAnime() {
  if (gameOver || (isDaily && dailyPlayed)) return;

  const input = document.getElementById("animeInput").value.trim();
  const guessedAnime = animeData.find(a => a.title.toLowerCase() === input.toLowerCase());
  if (!guessedAnime) {
    alert("Anime non trouvé !");
    return;
  }

  attemptCount++;
  document.getElementById("counter").textContent = `Tentatives : ${attemptCount} (-150)`;
  // --- Indices: recalcul disponibilité
  // 1. Studio
  if (!indicesActivated.studio && guessedAnime.studio === targetAnime.studio) {
    indicesAvailable.studio = true;
    document.getElementById("btnIndiceStudio").disabled = false;
  }
  // 2. Saison/Année (cellule orange)
  const [gs, gy] = guessedAnime.season.split(" ");
  const [ts, ty] = targetAnime.season.split(" ");
  if (!indicesActivated.saison && gy === ty) {
    indicesAvailable.saison = true;
    document.getElementById("btnIndiceSaison").disabled = false;
  }
  // 3. Genres/Thèmes : on update le set, si on trouve un nouveau, rendre activable
  const allGuessed = [...guessedAnime.genres, ...guessedAnime.themes];
  const allTarget = [...targetAnime.genres, ...targetAnime.themes];
  allGuessed.forEach(g => {
    if (allTarget.includes(g) && !indicesGenresFoundSet.has(g)) {
      indicesGenresFoundSet.add(g);
    }
  });
  if (!indicesActivated.genres && indicesGenresFoundSet.size > 0) {
    indicesAvailable.genres = true;
    document.getElementById("btnIndiceGenres").disabled = false;
  }
  // 4. Score (orange ou vert)
  const gScore = parseFloat(guessedAnime.score);
  const tScore = parseFloat(targetAnime.score);
  let isScoreMatchOrClose = false;
  
  if (gScore === tScore) {
    isScoreMatchOrClose = true;
    indicesScoreRangeActivation = [
      gScore - 0.30,
      gScore + 0.30
    ];
  } else if (Math.abs(gScore - tScore) <= 0.30) {
    isScoreMatchOrClose = true;
    indicesScoreRangeActivation = [
      Math.min(gScore, tScore) - 0.30,
      Math.max(gScore, tScore) + 0.30
    ];
  }
  
  if (!indicesActivated.score && isScoreMatchOrClose) {
    indicesAvailable.score = true;
    document.getElementById("btnIndiceScore").disabled = false;
  }

  // --- Affichage résultat
  const results = document.getElementById("results");
  const keyToClass = {
    image: "cell-image",
    title: "cell-title",
    season: "cell-season",
    studio: "cell-studio",
    genresThemes: "cell-genre",
    score: "cell-score"
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
  img.alt = guessedAnime.title;
  img.style.width = "100px";
  cellImage.appendChild(img);
  row.appendChild(cellImage);

  // Titre
  const cellTitle = document.createElement("div");
  cellTitle.classList.add("cell", keyToClass.title);
  const isTitleMatch = guessedAnime.title === targetAnime.title;
  cellTitle.classList.add(isTitleMatch ? "green" : "red");
  cellTitle.textContent = guessedAnime.title;
  row.appendChild(cellTitle);

  // Saison
  const cellSeason = document.createElement("div");
  cellSeason.classList.add("cell", keyToClass.season);
  if (gs === ts && gy === ty) {
    cellSeason.classList.add("green");
    cellSeason.textContent = `✅ ${guessedAnime.season}`;
  } else if (gy === ty) {
    cellSeason.classList.add("orange");
    cellSeason.textContent = `🟧 ${guessedAnime.season}`;
  } else {
    cellSeason.classList.add("red");
    cellSeason.textContent = parseInt(gy) < parseInt(ty)
      ? `🔼 ${guessedAnime.season}`
      : `${guessedAnime.season} 🔽`;
  }
  row.appendChild(cellSeason);

  // Studio
  const cellStudio = document.createElement("div");
  cellStudio.classList.add("cell", keyToClass.studio);
  const isStudioMatch = guessedAnime.studio === targetAnime.studio;
  cellStudio.classList.add(isStudioMatch ? "green" : "red");
  cellStudio.textContent = guessedAnime.studio;
  row.appendChild(cellStudio);

  // Genres/Thèmes
  const cellGenresThemes = document.createElement("div");
  cellGenresThemes.classList.add("cell", keyToClass.genresThemes);
  const matches = allGuessed.filter(x => allTarget.includes(x));
  if (matches.length === allGuessed.length && matches.length === allTarget.length) {
    cellGenresThemes.classList.add("green");
  } else if (matches.length > 0) {
    cellGenresThemes.classList.add("orange");
  } else {
    cellGenresThemes.classList.add("red");
  }
  cellGenresThemes.innerHTML = allGuessed.join("<br>");
  row.appendChild(cellGenresThemes);

  // Score
  const cellScore = document.createElement("div");
  cellScore.classList.add("cell", keyToClass.score);
  if (gScore === tScore) {
    cellScore.classList.add("green");
    cellScore.textContent = `✅ ${gScore}`;
  } else if (Math.abs(gScore - tScore) <= 0.30) {
    cellScore.classList.add("orange");
    if (gScore < tScore) {
      cellScore.textContent = `🟧🔼 ${gScore}`;
    } else {
      cellScore.textContent = `🟧 ${gScore} 🔽`;
    }
  } else {
    cellScore.classList.add("red");
    cellScore.textContent = gScore < tScore ? `🔼 ${gScore}` : `${gScore} 🔽`;
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
    ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach(id => {
      if(document.getElementById(id)) document.getElementById(id).disabled = true;
    });
    showSuccessMessage();

    if (isDaily && !dailyPlayed) {
      let score = 3000;
      score -= (attemptCount - 1) * 150;
      let indiceCount = Object.values(indicesActivated).filter(Boolean).length;
      score -= indiceCount * 300;
      if (score < 0) score = 0;
      localStorage.setItem(SCORE_KEY, score);
      dailyPlayed = true;
      dailyScore = score;
      showDailyBanner();
    }
    launchFireworks();
  }
}

// ========== Suggestions Aide ==========
function updateAideList() {
  const aideDiv = document.getElementById("aideContainer");
  let filtered = animeData;

  // FILTRAGE selon indices activés
  // Studio
  if (indicesActivated.studio && indicesStudioAtActivation) {
    filtered = filtered.filter(a => a.studio === indicesStudioAtActivation);
  }
  // Année
  if (indicesActivated.saison && indicesYearAtActivation) {
    filtered = filtered.filter(a => {
      let aYear = (a.season || '').split(" ")[1];
      return aYear === indicesYearAtActivation;
    });
  }
  // Genres/Thèmes
  if (indicesActivated.genres && indicesGenresFound.length > 0) {
    filtered = filtered.filter(a => {
      let allG = [...(a.genres || []), ...(a.themes || [])];
      return indicesGenresFound.every(x => allG.includes(x));
    });
  }
  // Score
  if (indicesActivated.score && indicesScoreRange) {
    filtered = filtered.filter(a => {
      let val = parseFloat(a.score);
      return val >= indicesScoreRange[0] && val <= indicesScoreRange[1];
    });
  }

  aideDiv.innerHTML = `<h3>🔍 Suggestions</h3><ul>` +
    filtered.map(a => `<li onclick="selectFromAide('${a.title.replace(/'/g, "\\'")}')">${a.title}</li>`).join("") +
    `</ul>`;
}

function selectFromAide(title) {
  document.getElementById("animeInput").value = title;
  guessAnime();
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

  for (let i = 0; i < 100; i++) {
    particles.push(createParticle(canvas.width / 2, canvas.height / 2));
  }

  function animate() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
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

// ========== Message de victoire ==========

function showSuccessMessageClassic() {
  const container = document.getElementById("successContainer");
  let roundScore = 3000 - (attemptCount - 1) * 150 - (Object.values(indicesActivated).filter(Boolean).length) * 300;
  if (roundScore < 0) roundScore = 0;
  const totalScore = 3000;
  container.innerHTML = `
    <div id="winMessage" style="margin-bottom: 18px; font-size: 2rem; font-weight: bold; text-align: center;">
      🎇 <span style="font-size:2.3rem;">🥳</span>
      Bravo ! C'était <u>${targetAnime.title}</u> en ${attemptCount} tentative${attemptCount > 1 ? 's' : ''}.
      <span style="font-size:2.3rem;">🎉</span>
    </div>
    </div>
    <div style="text-align:center;">
      <button id="nextBtn" class="menu-btn" style="font-size:1.1rem; margin: 0 auto 1rem auto;">${isDaily ? "Retour menu" : "Rejouer"}</button>
    </div>
  `;
  container.style.display = "block";
  container.scrollIntoView({behavior: "smooth", block: "start"});

  document.getElementById("nextBtn").onclick = () => {
    if (isDaily) {
      window.location.href = "../index.html";
    } else {
      setupGame();
    }
  };
}


// --- Mode Parcours ---
function launchParcoursRound() {
  attemptCount = 0;
  gameOver = false;
  indicesActivated = { studio: false, saison: false, genres: false, score: false };
  indicesAvailable = { studio: false, saison: false, genres: false, score: false };
  indicesGenresFound = [];
  indicesGenresFoundSet = new Set();
  indicesYearAtActivation = null;
  indicesStudioAtActivation = null;
  indicesScoreRange = null;
  indicesScoreRangeActivation = [0,0];

  document.getElementById("animeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
  document.getElementById("results").innerHTML = "";
  document.getElementById("counter").textContent = "Tentatives : 0";
  document.getElementById("successContainer").style.display = "none";
  document.getElementById("animeInput").disabled = false;
  ["btnIndiceStudio", "btnIndiceSaison", "btnIndiceGenres", "btnIndiceScore"].forEach(id => {
    const btn = document.getElementById(id);
    if(btn) {
      btn.disabled = true;
      btn.classList.remove('used');
    }
  });

  // PATCH random : random avec parcoursIndex
  const random = seededRandom(Date.now() + parcoursIndex * 37)();
  targetAnime = animeData[Math.floor(random * animeData.length)];

  updateAideList();
  updateScoreBar();
}

function showSuccessMessageParcours(roundScore) {
  const container = document.getElementById("successContainer");
  const totalScore = 3000;
  container.innerHTML = `
    <div id="winMessage" style="margin-bottom: 18px; font-size: 2rem; font-weight: bold; text-align: center;">
      🎇 <span style="font-size:2.3rem;">🥳</span>
      Bravo ! C'était <u>${targetAnime.title}</u> en ${attemptCount} tentative${attemptCount > 1 ? 's' : ''}.
      <span style="font-size:2.3rem;">🎉</span>
    </div>
    <div style="text-align:center;">
      <button id="nextParcoursBtn" class="menu-btn" style="font-size:1.1rem; margin: 0 auto 1rem auto;">${parcoursIndex+1 < parcoursCount ? "Suivant" : "Terminer"}</button>
    </div>
  `;
  container.style.display = "block";
  container.scrollIntoView({behavior: "smooth", block: "start"});

  document.getElementById("nextParcoursBtn").onclick = () => {
    parcoursIndex++;
    if (parcoursIndex < parcoursCount) {
      launchParcoursRound();
    } else {
      setTimeout(() => {
        parent.postMessage({
          parcoursScore: {
            label: "Anidle",
            score: parcoursTotalScore,
            total: parcoursCount * 3000
          }
        }, "*");
      }, 400);
      container.innerHTML = `<div style="font-size:1.6rem;text-align:center;">🏆 Parcours terminé !<br>Score : <b>${parcoursTotalScore}</b> / ${parcoursCount*3000}</div>`;
    }
  };
}


// --- Choix du message selon le mode
function showSuccessMessage() {
  let roundScore = 3000 - (attemptCount - 1) * 150 - (Object.values(indicesActivated).filter(Boolean).length) * 300;
  if (roundScore < 0) roundScore = 0;
  if (isParcours) {
    parcoursTotalScore += roundScore;
    showSuccessMessageParcours(roundScore);
    launchFireworks();
  } else {
    showSuccessMessageClassic();
    launchFireworks();
  }
}

// ========== TOOLTIP AIDE (icône info) ==========
// Support mobile : tap pour ouvrir/fermer, tap ailleurs pour fermer

document.addEventListener("pointerdown", (e) => {
  const wrap = e.target.closest(".info-wrap");

  // clic/tap sur une bulle -> toggle
  if (wrap && e.target.closest(".info-icon")) {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.toggle("open");
    return;
  }

  // clic/tap ailleurs -> ferme toutes les bulles
  document.querySelectorAll(".info-wrap.open").forEach(w => w.classList.remove("open"));
});

