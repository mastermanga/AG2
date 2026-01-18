// === Navigation & thème ===
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

// === Mode PARCOURS (lecture URL) ===
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
let parcoursStepIdx = 0;
let parcoursScores = [];
let rankingMode = urlParams.get("mode") || 'anime'; // par défaut anime

const modeAnimeBtn = document.getElementById('mode-anime');
const modeOpeningBtn = document.getElementById('mode-opening');

// Si parcours, cacher sélecteur de mode et fixer le mode :
if (isParcours) {
  document.getElementById("mode-select").style.display = "none";
  modeAnimeBtn.classList.toggle('active', rankingMode === 'anime');
  modeOpeningBtn.classList.toggle('active', rankingMode === 'opening');
} else {
  modeAnimeBtn.onclick = () => {
    if (rankingMode !== 'anime') {
      rankingMode = 'anime';
      modeAnimeBtn.classList.add('active');
      modeAnimeBtn.setAttribute('aria-pressed', 'true');
      modeOpeningBtn.classList.remove('active');
      modeOpeningBtn.setAttribute('aria-pressed', 'false');
      startNewRanking();
    }
  };
  modeOpeningBtn.onclick = () => {
    if (rankingMode !== 'opening') {
      rankingMode = 'opening';
      modeOpeningBtn.classList.add('active');
      modeOpeningBtn.setAttribute('aria-pressed', 'true');
      modeAnimeBtn.classList.remove('active');
      modeAnimeBtn.setAttribute('aria-pressed', 'false');
      startNewRanking();
    }
  };
}

// === Blind Ranking Variables ===
let animeList = [];
let currentIndex = 0;
let rankings = new Array(10).fill(null);
let selectedAnimes = [];
let gamesPlayed = 0;

// ==== DATA ====
async function loadRankingData() {
  try {
    const file = rankingMode === 'anime' ? '../data/animes.json' : '../data/openings.json';
    const response = await fetch(file);
    if (!response.ok) throw new Error('Fichier introuvable');
    animeList = await response.json();

    // Si mode opening, transformer la liste d'animes en liste d'openings
    if (rankingMode === 'opening') {
      let openingsList = [];
      animeList.forEach(anime => {
        if (anime.openings && Array.isArray(anime.openings)) {
          anime.openings.forEach(opening => {
            openingsList.push({
              title: anime.title, // peut servir pour tooltip
              openingName: opening.name,
              url: opening.url
            });
          });
        }
      });
      animeList = openingsList;
    }
  } catch (error) {
    alert("Erreur lors du chargement du fichier JSON : " + error.message);
    animeList = [];
  }
}

function getRandomItems() {
  selectedAnimes = [];
  const used = new Set();
  while (selectedAnimes.length < 10 && animeList.length > 0) {
    const randomIndex = Math.floor(Math.random() * animeList.length);
    if (!used.has(randomIndex)) {
      selectedAnimes.push(animeList[randomIndex]);
      used.add(randomIndex);
    }
  }
}

function getYouTubeVideoId(youtubeUrl) {
  let videoId = null;
  try {
    const urlObj = new URL(youtubeUrl);
    if(urlObj.hostname.includes('youtube.com')) {
      videoId = urlObj.searchParams.get('v');
    } else if(urlObj.hostname.includes('youtu.be')) {
      videoId = urlObj.pathname.slice(1);
    }
  } catch {}
  return videoId;
}
function getYouTubeEmbedUrl(youtubeUrl) {
  const videoId = getYouTubeVideoId(youtubeUrl);
  return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&autoplay=0` : "";
}

// ==== AFFICHAGE ====
function displayCurrentItem() {
  setTimeout(() => {
    const animeImg = document.getElementById("anime-img");
    const container = document.getElementById("anime-item");
    const nextBtn = document.getElementById("next-btn");
    const ytDiv = document.getElementById('yt-player-1');
    const playerZone = document.getElementById('player-zone');
  
    // AJOUT : adapte le style du container selon le mode
    if (rankingMode === "opening") {
      container.classList.add("large-opening");
    } else {
      container.classList.remove("large-opening");
    }
  
    ytDiv.innerHTML = "";
    ytDiv.style.display = "none";
    document.getElementById('player-loader').style.display = "none";
  
    if (currentIndex < selectedAnimes.length) {
      const item = selectedAnimes[currentIndex];
      if (rankingMode === "anime") {
        document.getElementById("anime-name").textContent = item.title;
        animeImg.src = item.image;
        animeImg.style.display = "block";
        if (playerZone) {
          playerZone.style.height = "0";
          playerZone.style.minHeight = "0";
          playerZone.style.padding = "0";
          playerZone.style.overflow = "hidden";
        }
      } else {
        // NOM de l’opening UNIQUEMENT (pas de doublon titre)
        document.getElementById("anime-name").textContent = item.openingName || "";
        animeImg.style.display = "none";
        if (playerZone) {
          playerZone.style.height = "";      // ← GRAND PLAYER
          playerZone.style.minHeight = "";
          playerZone.style.padding = "";
          playerZone.style.overflow = "";
        }
        ytDiv.innerHTML = "";
        ytDiv.style.display = "block";
        if (item.url) {
          const embedUrl = getYouTubeEmbedUrl(item.url);
          ytDiv.innerHTML = `<iframe src="${embedUrl}" width="100%" height="410" frameborder="0" allowfullscreen style="border-radius:10px;background:#222;box-shadow:0 2px 12px #1114;"></iframe>`;
        }
      }
      container.style.display = "flex";
      document.getElementById("rank-section").style.display = "block";
      nextBtn.style.display = "none";
    } else {
      document.getElementById("rank-section").style.display = "none";
      container.style.display = "none";
      nextBtn.style.display = "block";
      document.getElementById('player-loader').style.display = "none";
      finishGame();
    }
  }, 120);

}

// ==== ASSIGNATION RANG ====
function assignRank(rank) {
  if (rankings[rank - 1] !== null) {
    alert("Ce rang a déjà été attribué !");
    return;
  }
  // Stocke différemment selon le mode
  if (rankingMode === "anime") {
    rankings[rank - 1] = selectedAnimes[currentIndex].title;
  } else {
    rankings[rank - 1] = selectedAnimes[currentIndex].openingName;
  }
  document.getElementById(`rank-${rank}`).disabled = true;
  updateRankingList();
  currentIndex++;
  displayCurrentItem();
}

function updateRankingList() {
  const rankingList = document.getElementById("ranking-list");
  rankingList.innerHTML = '';
  let rows = [[], []];
  for (let i = 0; i < 10; i++) {
    let html = "";
    if (rankings[i]) {
      let item;
      if (rankingMode === "anime") {
        item = selectedAnimes.find(a => a.title === rankings[i]);
      } else {
        item = selectedAnimes.find(a => a.openingName === rankings[i]);
      }
      if (item) {
        if (rankingMode === 'anime') {
          html = `
            <li>
              <img src="${item.image}" alt="${item.title}">
              <span>Rang ${i + 1}: ${item.title}</span>
            </li>
          `;
        } else {
          html = `
            <li>
              <iframe src="${getYouTubeEmbedUrl(item.url || "")}" frameborder="0" allowfullscreen style="border-radius:10px;width:100%;height:210px;background:#222;box-shadow:0 2px 12px #1114;"></iframe>
              <span>Rang ${i + 1}: ${item.openingName}</span>
            </li>
          `;
        }
      } else {
        html = `<li><span>Rang ${i + 1}: </span></li>`;
      }
    } else {
      html = `
        <li>
          <div style="width:100%;height:210px;opacity:0.1;background:#ccc;display:inline-block;border-radius:10px"></div>
          <span>Rang ${i + 1}</span>
        </li>
      `;
    }
    rows[Math.floor(i / 5)].push(html);
  }
  rankingList.innerHTML = rows[0].join('') + rows[1].join('');
}

// ==== BOUTON REJOUER / SUIVANT (PARCOURS) ====
// on ne met pas de .onclick ici mais dans finishGame()

async function startNewRanking() {
  await loadRankingData();
  getRandomItems();
  currentIndex = 0;
  rankings = new Array(10).fill(null);
  for (let i = 1; i <= 10; i++) {
    document.getElementById(`rank-${i}`).disabled = false;
  }
  updateRankingList();
  document.getElementById("anime-item").style.display = "flex";
  document.getElementById("rank-section").style.display = "block";
  document.getElementById("next-btn").style.display = "none";
  document.getElementById("anime-name").textContent = "Nom de l'Anime ou de l'Opening";
  document.getElementById("anime-img").src = "";
  // On vide le lecteur central
  const ytDiv = document.getElementById('yt-player-1');
  ytDiv.innerHTML = "";
  ytDiv.style.display = "none";
  displayCurrentItem();
}

// ==== FIN DE PARTIE ET ENCHAÎNEMENT PARCOURS ====
function finishGame() {
  const nextBtn = document.getElementById("next-btn");
  // Score simple = nb de rangs exacts trouvés
  let score = 0;
  for (let i = 0; i < 10; i++) {
    let trueValue;
    if (rankingMode === "anime") {
      trueValue = selectedAnimes[i]?.title;
    } else {
      trueValue = selectedAnimes[i]?.openingName;
    }
    if (rankings[i] === trueValue) score++;
  }
  // Mode parcours
  if (isParcours) {
    nextBtn.textContent = (gamesPlayed < parcoursCount - 1) ? "Suivant" : "Terminer";
    nextBtn.onclick = function () {
      parcoursScores.push({
        label: "Blind Ranking " + (rankingMode === "anime" ? "Anime" : "Opening"),
        score: 0,
        total: 0
      });
      gamesPlayed++;
      if (gamesPlayed < parcoursCount) {
        startNewRanking();
      } else {
        // Envoyer tous les scores au parent
        parcoursScores.forEach(s => parent.postMessage({ parcoursScore: s }, "*"));
      }
    }
  } else {
    nextBtn.textContent = "Rejouer";
    nextBtn.onclick = function () {
      startNewRanking();
    };
  }
}

// ========== TOOLTIP AIDE (icône info) ==========
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
    document.querySelectorAll(".info-wrap.open").forEach(w => w.classList.remove("open"));
  }
});

// === INIT ON LOAD ===
window.onload = async function () {
  gamesPlayed = 0;
  parcoursScores = [];
  await startNewRanking();
};
