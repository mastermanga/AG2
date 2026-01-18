// ========== THEME (DARK/LIGHT) ==========
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");
});

// ========== RETOUR MENU ==========
document.getElementById("back-to-menu").addEventListener("click", function() {
  window.location.href = "../index.html";
});

// ========== DOMS ==========
const stepsList = document.getElementById("steps-list");
const gameType = document.getElementById("gameType");
const modeOption = document.getElementById("modeOption");
const stepCount = document.getElementById("stepCount");
const addStepBtn = document.getElementById("addStepBtn");
const startParcoursBtn = document.getElementById("startParcoursBtn");

const recapSection = document.getElementById("recap");
const recapList = document.getElementById("parcoursRecapList");
const editParcoursBtn = document.getElementById("editParcoursBtn");
const launchConfirmedBtn = document.getElementById("launchConfirmedBtn");

const parcoursContainer = document.getElementById("parcours-container");
const parcoursIframe = document.getElementById("parcours-iframe");
const parcoursScore = document.getElementById("parcours-score");
const parcoursFinish = document.getElementById("parcours-finish");

// Ajout loader (HTML dans JS, ou bien ajoute le DIV dans ton HTML !)
let parcoursLoader = document.getElementById('parcours-loader');
if (!parcoursLoader) {
  parcoursLoader = document.createElement('div');
  parcoursLoader.id = 'parcours-loader';
  parcoursLoader.textContent = "Chargement du jeu…";
  parcoursLoader.style.cssText = "display:none;text-align:center;margin:1.3rem;font-size:1.3rem;";
  parcoursContainer && parcoursContainer.insertBefore(parcoursLoader, parcoursIframe);
}

let parcoursSteps = [];
let parcoursScores = []; // Pour stocker les scores en live

// ========== AFFICHER/DISSIMULER LE MODE (anime/opening) ==========
gameType.addEventListener("change", () => {
  if (["animetournament", "blindranking"].includes(gameType.value)) {
    modeOption.style.display = "";
    modeOption.innerHTML = `
      <option value="anime">Anime</option>
      <option value="opening">Opening</option>
    `;
  } else {
    // characterquizz et les autres jeux → MASQUE le select
    modeOption.style.display = "none";
    modeOption.innerHTML = "";
  }
});

// ========== AJOUTER UNE ETAPE ==========
// Décompose chaque ajout >1 en étapes unitaires pour que le parcours fonctionne bien
addStepBtn.addEventListener("click", () => {
  const type = gameType.value;
  const mode = modeOption.style.display === "none" ? null : modeOption.value;
  const count = parseInt(stepCount.value, 10);

  if (!type || count < 1) return;

  for (let i = 0; i < count; i++) {
    parcoursSteps.push({ type, mode, count: 1 });
  }
  renderSteps();
  startParcoursBtn.style.display = parcoursSteps.length > 0 ? "block" : "none";
});

// Affiche la liste des étapes en regroupant visuellement les mêmes
function renderSteps() {
  stepsList.innerHTML = "";
  if (parcoursSteps.length === 0) {
    stepsList.innerHTML = "<div class='empty'>Ajoutez vos étapes !</div>";
    startParcoursBtn.style.display = "none";
    return;
  }
  // Regroupement d’affichage des étapes similaires consécutives
  let grouped = [];
  for (let i = 0; i < parcoursSteps.length; i++) {
    const step = parcoursSteps[i];
    if (
      grouped.length > 0 &&
      grouped[grouped.length - 1].type === step.type &&
      grouped[grouped.length - 1].mode === step.mode
    ) {
      grouped[grouped.length - 1].count += 1;
      grouped[grouped.length - 1].indices.push(i);
    } else {
      grouped.push({
        ...step,
        count: 1,
        indices: [i]
      });
    }
  }

  grouped.forEach((group, idx) => {
    let txt = "";
    if (["anidle", "openingquizz", "characterquizz"].includes(group.type)) {
      txt = `${gameNameLabel(group.type)} × ${group.count}`;
    } else {
      txt = `${gameNameLabel(group.type)} (${group.mode === "opening" ? "Opening" : "Anime"})`;
      if (group.count > 1) txt += ` × ${group.count}`;
    }
    const div = document.createElement("div");
    div.className = "step-line";
    div.innerHTML = `
      <span class="step-badge">${txt}</span>
      <span class="step-controls">
        <button class="upBtn toggle-btn" ${grouped.length === 1 || idx === 0 ? "disabled" : ""}>⬆️</button>
        <button class="downBtn toggle-btn" ${grouped.length === 1 || idx === grouped.length-1 ? "disabled" : ""}>⬇️</button>
        <button class="removeBtn toggle-btn">🗑️</button>
      </span>
    `;
    div.querySelector(".upBtn").onclick = () => { moveStep(group.indices[0], -1); };
    div.querySelector(".downBtn").onclick = () => { moveStep(group.indices[0], 1); };
    div.querySelector(".removeBtn").onclick = () => {
      // supprime toutes les étapes du groupe (d’un coup)
      for (let j = group.indices.length - 1; j >= 0; j--) removeStep(group.indices[j]);
    };
    stepsList.appendChild(div);
  });
}

function gameNameLabel(type) {
  switch(type) {
    case "anidle": return "Anidle";
    case "openingquizz": return "Opening Quizz";
    case "characterquizz": return "Character Quizz";
    case "animetournament": return "AnimeTournament";
    case "blindranking": return "BlindRanking";
    default: return "";
  }
}

function moveStep(idx, dir) {
  if ((dir === -1 && idx === 0) || (dir === 1 && idx === parcoursSteps.length-1)) return;
  const temp = parcoursSteps[idx];
  parcoursSteps.splice(idx, 1);
  parcoursSteps.splice(idx + dir, 0, temp);
  renderSteps();
}

function removeStep(idx) {
  parcoursSteps.splice(idx, 1);
  renderSteps();
}

// ========== BOUTON LANCER LE PARCOURS ==========
startParcoursBtn.addEventListener("click", () => {
  if (parcoursSteps.length === 0) return;
  showRecap();
});

function showRecap() {
  document.getElementById("parcours-builder").style.display = "none";
  recapSection.style.display = "block";
  recapList.innerHTML = "";
  // Regroupe pour l’affichage du recap (même logique que renderSteps)
  let grouped = [];
  for (let i = 0; i < parcoursSteps.length; i++) {
    const step = parcoursSteps[i];
    if (
      grouped.length > 0 &&
      grouped[grouped.length - 1].type === step.type &&
      grouped[grouped.length - 1].mode === step.mode
    ) {
      grouped[grouped.length - 1].count += 1;
    } else {
      grouped.push({
        ...step,
        count: 1
      });
    }
  }
  grouped.forEach((group, i) => {
    let txt = "";
    if (["anidle", "openingquizz", "characterquizz"].includes(group.type)) {
      txt = `${gameNameLabel(group.type)} × ${group.count}`;
    } else {
      txt = `${gameNameLabel(group.type)} (${group.mode === "opening" ? "Opening" : "Anime"})`;
      if (group.count > 1) txt += ` × ${group.count}`;
    }
    const li = document.createElement("li");
    li.textContent = `${i+1}. ${txt}`;
    recapList.appendChild(li);
  });
}

// ========== BOUTON EDITER ==========
editParcoursBtn.addEventListener("click", () => {
  document.getElementById("parcours-builder").style.display = "";
  recapSection.style.display = "none";
});

// ========== CONFIRMER LE PARCOURS ==========
launchConfirmedBtn.addEventListener("click", () => {
  // Sauvegarde la liste dans localStorage
  localStorage.setItem("parcoursSteps", JSON.stringify(parcoursSteps));
  localStorage.setItem("parcoursInProgress", "1");
  localStorage.setItem("parcoursIndex", "0");
  parcoursScores = [];
  startIframeParcours();
});

// ========== MODE IFRAME ==========
function startIframeParcours() {
  document.getElementById("parcours-builder").style.display = "none";
  recapSection.style.display = "none";
  document.body.classList.add('parcours-fullscreen');
  parcoursContainer.style.display = "flex";
  parcoursContainer.classList.add("active");
  parcoursScore.style.display = "none";
  parcoursFinish.style.display = "none";
  parcoursScores = [];
  launchIframeStep(0);
}

function launchIframeStep(idx) {
  const steps = JSON.parse(localStorage.getItem("parcoursSteps") || "[]");
  if (!steps.length || idx >= steps.length) {
    showFinalRecap();
    return;
  }
  localStorage.setItem("parcoursInProgress", "1");
  localStorage.setItem("parcoursIndex", String(idx));
  const step = steps[idx];
  let url = "";
  const base = "https://mastermanga.github.io/AG/";
  if (step.type === "anidle") {
    url = `${base}Anidle/index.html?parcours=1&count=${step.count}`;
  } else if (step.type === "openingquizz") {
    url = `${base}OpeningQuizz/index.html?parcours=1&count=${step.count}`;
  } else if (step.type === "characterquizz") {
    url = `${base}CharacterQuizz/index.html?parcours=1&count=${step.count}`;
  } else if (step.type === "animetournament") {
    url = `${base}AnimeTournament/index.html?parcours=1&mode=${step.mode || "anime"}&count=${step.count}`;
  } else if (step.type === "blindranking") {
    url = `${base}BlindRanking/index.html?parcours=1&mode=${step.mode || "anime"}&count=${step.count}`;
  } else {
    url = base + "index.html";
  }
  parcoursIframe.style.display = "none";
  parcoursIframe.classList.remove("active");
  parcoursLoader.style.display = "block";
  parcoursIframe.onload = () => {
    parcoursLoader.style.display = "none";
    parcoursIframe.style.display = "block";
    parcoursIframe.classList.add("active");
  };
  parcoursIframe.src = url;
}

// Pour les jeux : doivent appeler parent.postMessage({parcoursScore: ...}, "*")
window.addEventListener("message", (e) => {
  if (e.data && e.data.parcoursScore) {
    parcoursScores.push(e.data.parcoursScore);
    const idx = parseInt(localStorage.getItem("parcoursIndex") || "0", 10) + 1;
    const steps = JSON.parse(localStorage.getItem("parcoursSteps") || "[]");
    if (idx < steps.length) {
      launchIframeStep(idx);
    } else {
      showFinalRecap();
    }
  }
});

// ========== AFFICHAGE FINAL ==========
function showFinalRecap() {
  document.getElementById("container").style.display = "none";
  parcoursIframe.style.display = "none";
  parcoursIframe.classList.remove("active");
  parcoursLoader.style.display = "none";
  document.body.classList.remove('parcours-fullscreen');
  parcoursContainer.style.display = "flex";
  parcoursContainer.classList.add("active");
  parcoursScore.style.display = "block";
  parcoursFinish.style.display = "block";

  let html = "<h2>Récapitulatif du Parcours</h2><ul>";
  
  // Regroupement par jeu
  const grouped = {};
  let totalScore = 0;
  let maxScore = 0;
  parcoursScores.forEach(res => {
    // On regroupe tout sauf les BlindRanking qui semblent être des cas à part
    const label = (res.label && res.label.startsWith("Blind Ranking")) ? res.label : (res.label || "Autre");
    if (!grouped[label]) grouped[label] = { score: 0, total: 0 };
    grouped[label].score += (typeof res.score === "number" ? res.score : 0);
    grouped[label].total += (typeof res.total === "number" ? res.total : 0);
    totalScore += (typeof res.score === "number" ? res.score : 0);
    maxScore += (typeof res.total === "number" ? res.total : 0);
  });
  
  // Affichage groupé
  for (const label in grouped) {
    html += `<li>${label} : <b>${grouped[label].score} / ${grouped[label].total}</b></li>`;
  }
  html += "</ul>";
  html += `<div style="font-size:2rem;margin-top:13px;"><b>Score total : ${totalScore} / ${maxScore} </b></div>`;
  parcoursScore.innerHTML = html;

  parcoursFinish.innerHTML = `<button onclick="window.location.href='../index.html'" class="toggle-btn">Retour menu</button>`;
}

// Pour pouvoir être appelé depuis l’iframe :
window.launchNextParcoursStep = function() {
  // Les jeux doivent poster le score avec :
  // parent.postMessage({parcoursScore: {label:..., score:..., total:...}}, "*");
  // Ici, le passage est fait à la réception du message postMessage (voir listener plus haut)
};

// Restauration parcours en cours si reload
window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("parcoursInProgress")) {
    if (confirm("Un Mode Parcours est en cours, continuer ?")) {
      startIframeParcours();
    } else {
      localStorage.removeItem("parcoursInProgress");
      localStorage.removeItem("parcoursSteps");
      localStorage.removeItem("parcoursIndex");
      localStorage.removeItem("parcoursCurrent");
    }
  }
});

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
