// ==== VARIABLES INDICES ====
let indice6Used = false;
let indice3Used = false;
let optionsList = [];
let indiceActive = false;

function getScoreBarColor(score) {
  if (score >= 2500) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= 1500) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score >= 1000) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  if (score > 0)     return "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  return "linear-gradient(90deg,#444,#333 90%)";
}

// ==== BARRE DE SCORE ====
function updateScoreBar(score = null) {
  let percent = 100, label = "3000 / 3000", currentScore = 3000;
  if (tries === 0) {
    document.getElementById("score-bar-label").textContent = "3000 / 3000";
    document.getElementById("score-bar").style.width = "100%";
    document.getElementById("score-bar").style.background = getScoreBarColor(3000);
    return;
  }
  if (score === null) {
    if (tries === 1) { percent = 100; label = "3000 / 3000"; currentScore = 3000; }
    else if (tries === 2) { percent = 66.66; label = "2000 / 3000"; currentScore = 2000; }
    else if (tries === 3 && !indice6Used && !indice3Used) { percent = 50; label = "1500 / 3000"; currentScore = 1500; }
    else if (tries === 3 && indice3Used) { percent = 33.3; label = "500 / 3000"; currentScore = 500; }
    else if (tries === 3 && indice6Used) { percent = 16.7; label = "1000 / 3000"; currentScore = 1000; }
    else { percent = 0; label = "0 / 3000"; currentScore = 0; }
  } else {
    currentScore = score;
    if (score === 3000) { percent = 100; label = "3000 / 3000"; }
    else if (score === 2000) { percent = 66.66; label = "2000 / 3000"; }
    else if (score === 1500) { percent = 50; label = "1500 / 3000"; }
    else if (score === 1000) { percent = 33.3; label = "1000 / 3000"; }
    else if (score === 500) { percent = 16.7; label = "500 / 3000"; }
    else { percent = 0; label = "0 / 3000"; }
  }
  document.getElementById("score-bar-label").textContent = label;
  document.getElementById("score-bar").style.width = percent + "%";
  document.getElementById("score-bar").style.background = getScoreBarColor(currentScore);
}

// ==== INDICES BOUTONS ====
document.getElementById("btnIndice6").addEventListener("click", () => {
  if (indice6Used || indice3Used || !indiceActive) return;
  indice6Used = true;
  indiceActive = false;
  document.getElementById("btnIndice6").classList.add("used");
  document.getElementById("btnIndice3").disabled = true;
  afficherIndiceOptions(6);
  updateScoreBar();
});
document.getElementById("btnIndice3").addEventListener("click", () => {
  if (indice6Used || indice3Used || !indiceActive) return;
  indice3Used = true;
  indiceActive = false;
  document.getElementById("btnIndice3").classList.add("used");
  document.getElementById("btnIndice6").disabled = true;
  afficherIndiceOptions(3);
  updateScoreBar();
});
function afficherIndiceOptions(nb) {
  // Efface anciennes options
  const old = document.getElementById("indice-options-list");
  if (old) old.remove();
  // Génère propositions
  let titles = animeList.map(a => a.title);
  titles = titles.filter(t => t !== currentAnime.title);
  shuffleArray(titles);
  let propositions = titles.slice(0, nb - 1);
  propositions.push(currentAnime.title);
  shuffleArray(propositions);
  // Affiche
  const list = document.createElement("div");
  list.id = "indice-options-list";
  // ICI : plus de style JS, tout est géré dans le CSS

  propositions.forEach(title => {
    const btn = document.createElement("button");
    btn.textContent = title;
    btn.className = "indice-btn";
    // btn.style.minWidth = "120px";  // <- inutile si géré en CSS
    btn.onclick = () => {
      checkAnswer(title);
      list.remove();
      document.getElementById("openingInput").value = "";
    };
    list.appendChild(btn);
  });
  document.getElementById("container").appendChild(list);
}
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ======= DARK/LIGHT MODE + MENU =======
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
  if (savedTheme === "light") document.body.classList.add("light");
});

// ======= MODE PARCOURS ? =======
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
let parcoursIndex = 0;
let parcoursTotalScore = 0;

// ======= DAILY / CLASSIC MODE LOGIC =======
const GAME_ID = "openingquizz";
let isDaily = !isParcours;
const DAILY_BANNER = document.getElementById("daily-banner");
const DAILY_STATUS = document.getElementById("daily-status");
const DAILY_SCORE = document.getElementById("daily-score");
const SWITCH_MODE_BTN = document.getElementById("switch-mode-btn");

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
const todayString = getTodayString();
const SCORE_KEY = `dailyScore_${GAME_ID}_${todayString}`;
const STARTED_KEY = `dailyStarted_${GAME_ID}_${todayString}`;

let dailyPlayed = false;
let dailyScore = null;

// ====== HASH FONCTION POUR SÉLECTION DETERMINISTE =======
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xFFFFFFFF; // force 32bit
  }
  return Math.abs(hash);
}

function getDailyIndex(len) {
  const dateStr = getTodayString();
  const hash = simpleHash(dateStr + "|" + GAME_ID);
  return hash % len;
}

// ====== OPENING QUIZZ LOGIC =======
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[5].length === 11) ? match[5] : null;
}

let animeList = [];
let currentIndex = 0;
let player;
let stopInterval;
let currentAnime;
let tries = 0;
const maxTries = 3;
const tryDurations = [15, 15, null];
let failedAnswers = [];
let playerReady = false;

// ======= CHARGEMENT JSON =======
fetch('../data/openings.json')
  .then(res => res.json())
  .then(data => {
    animeList = data.flatMap(anime =>
      anime.openings.map(opening => ({
        title: anime.title,
        altTitles: [anime.title.toLowerCase()],
        openingName: opening.name,
        videoId: extractVideoId(opening.url),
        startTime: 0
      }))
    ).filter(a => a.videoId);

    if (isParcours) {
      parcoursIndex = 0;
      parcoursTotalScore = 0;
      startParcoursGame();
    } else {
      setupGame();
    }
  });

// ====== MODE PARCOURS ======
function seededRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
}
function getParcoursIndex(n) {
  const baseSeed = Date.now() + parcoursIndex * 37;
  return Math.floor(seededRandom(baseSeed)() * n);
}
function startParcoursGame() {
  document.getElementById("back-to-menu").style.display = "none";
  if (DAILY_BANNER) DAILY_BANNER.style.display = "none";
  nextParcoursRound();
}
function nextParcoursRound() {
  tries = 0;
  failedAnswers = [];
  updateFailedAttempts();
  document.getElementById("result").textContent = "";
  document.getElementById("result").className = "";
  document.getElementById("timer").style.display = "none";
  document.getElementById("timer").textContent = "";
  document.getElementById("openingInput").value = "";
  document.getElementById("openingInput").disabled = true;
  document.getElementById("playTry1").disabled = true;
  document.getElementById("playTry2").disabled = true;
  document.getElementById("playTry3").disabled = true;
  document.getElementById("nextBtn").style.display = "none";
  document.getElementById("suggestions").innerHTML = "";
  resetIndice();

  currentIndex = getParcoursIndex(animeList.length);
  currentAnime = animeList[currentIndex];

  if (player && typeof player.destroy === "function") player.destroy();
  playerReady = false;
  if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
    window.onYouTubeIframeAPIReady = initPlayer;
  } else {
    initPlayer();
  }
  resizeContainer();
}

// ============ DAILY CLASSIC LOGIC ============
function setupGame() {
  dailyScore = localStorage.getItem(SCORE_KEY);
  dailyPlayed = !!dailyScore;

  if (isDaily) {
    currentIndex = getDailyIndex(animeList.length);
    if (localStorage.getItem(STARTED_KEY) && !localStorage.getItem(SCORE_KEY)) {
      dailyPlayed = true;
      dailyScore = 0;
      showDailyBanner();
      showResultMessage("✅ Daily du jour déjà jouée !", true, true, true);
      blockInputsAll();
      document.getElementById("nextBtn").style.display = "block";
      document.getElementById("nextBtn").textContent = "Retour menu";
      resizeContainer();
      return;
    }
    localStorage.setItem(STARTED_KEY, "1");
    showDailyBanner();
    if (dailyPlayed) {
      showResultMessage("✅ Daily du jour déjà jouée !", true, true, true);
      blockInputsAll();
      document.getElementById("nextBtn").style.display = "block";
      document.getElementById("nextBtn").textContent = "Retour menu";
      resizeContainer();
      return;
    }
  } else {
    currentIndex = Math.floor(Math.random() * animeList.length);
    if (DAILY_BANNER) DAILY_BANNER.style.display = "none";
    unlockClassicInputs();
  }

  currentAnime = animeList[currentIndex];

  if (player && typeof player.destroy === "function") player.destroy();
  playerReady = false;
  if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
    window.onYouTubeIframeAPIReady = initPlayer;
  } else {
    initPlayer();
  }
  resetControls();
  resizeContainer();
}
function showDailyBanner() {
  if (!DAILY_BANNER) return;
  DAILY_BANNER.style.display = "flex";
  updateSwitchModeBtn();
  if (dailyPlayed) {
    DAILY_STATUS.innerHTML = `<span style="color:#25ff67;font-size:1.3em;vertical-align:-2px;">&#x2705;</span> <b>Daily du jour déjà jouée !</b>`;
    DAILY_SCORE.innerHTML = `<span style="margin-left:12px;">Score : <b>${dailyScore} pts</b></span>`;
  } else {
    DAILY_STATUS.innerHTML = `<span style="font-size:1.35em;vertical-align:-1.5px;">🎲</span> <b>Daily du jour :</b>`;
    DAILY_SCORE.innerHTML = "";
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
function unlockClassicInputs() {
  document.getElementById("openingInput").disabled = true;
  document.getElementById("playTry1").disabled = true;
  document.getElementById("playTry2").disabled = true;
  document.getElementById("playTry3").disabled = true;
  document.getElementById("nextBtn").style.display = "none";
}
function blockInputsAll() {
  document.getElementById("openingInput").disabled = true;
  document.getElementById("playTry1").disabled = true;
  document.getElementById("playTry2").disabled = true;
  document.getElementById("playTry3").disabled = true;
  document.getElementById("suggestions").innerHTML = "";
  document.getElementById("indice-buttons").style.display = "none";
  const old = document.getElementById("indice-options-list");
  if (old) old.remove();
}

// ============ RESTE IDENTIQUE ============


// ============ PLAYER LOGIC ===========
function initPlayer() {
  playerReady = false;
  player = new YT.Player('playerWrapper', {
    height: '0',
    width: '0',
    videoId: currentAnime.videoId,
    playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3 },
    events: {
      onReady: (event) => {
        player.setVolume(50);
        playerReady = true;
        if ((isParcours || (!isDaily || !dailyPlayed))) {
          document.getElementById("playTry1").disabled = false;
        }
      },
      onStateChange: onPlayerStateChange
    }
  });
}
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    clearInterval(stopInterval);

    // Si c'est la 3e écoute (durée null), on ne coupe pas
    const duration = tryDurations[tries - 1];
    if (duration == null) return;

    stopInterval = setInterval(() => {
      const currentTime = player.getCurrentTime();
      if (currentTime >= (currentAnime.startTime + duration)) {
        player.pauseVideo();
        clearInterval(stopInterval);
      }
    }, 200);
  }
}
function resetControls() {
  tries = 0;
  failedAnswers = [];
  updateFailedAttempts();
  document.getElementById("result").textContent = "";
  document.getElementById("result").className = "";
  document.getElementById("timer").style.display = "none";
  document.getElementById("timer").textContent = "";
  document.getElementById("openingInput").value = "";
  document.getElementById("openingInput").disabled = true;
  document.getElementById("playTry1").disabled = true;
  document.getElementById("playTry2").disabled = true;
  document.getElementById("playTry3").disabled = true;
  document.getElementById("nextBtn").style.display = "none";
  document.getElementById("suggestions").innerHTML = "";
  resetIndice();
  updateScoreBar();
  resizeContainer();
}

function resetIndice() {
  indice6Used = false;
  indice3Used = false;
  indiceActive = false;
  document.getElementById("indice-buttons").style.display = "none";
  document.getElementById("btnIndice6").classList.remove("used");
  document.getElementById("btnIndice3").classList.remove("used");
  document.getElementById("btnIndice6").disabled = false;
  document.getElementById("btnIndice3").disabled = false;
  const old = document.getElementById("indice-options-list");
  if (old) old.remove();
}

function playTry(n) {
  if (!playerReady) {
    alert("Veuillez patienter, le lecteur se prépare…");
    return;
  }
  if (isDaily && dailyPlayed) return;
  if (n !== tries + 1) return alert("Vous devez écouter les extraits dans l'ordre.");
  tries = n;
  document.getElementById("openingInput").disabled = false;
  document.getElementById("result").textContent = "";
  document.getElementById("result").className = "";
  clearInterval(stopInterval);

  // Affiche indices à l'écoute 3 uniquement
  if (tries === 3) {
    document.getElementById("indice-buttons").style.display = "flex";
    indiceActive = true;
    document.getElementById("btnIndice6").disabled = indice6Used || indice3Used;
    document.getElementById("btnIndice3").disabled = indice6Used || indice3Used;
    document.getElementById("btnIndice6").classList.toggle("used", indice6Used);
    document.getElementById("btnIndice3").classList.toggle("used", indice3Used);
  } else {
    document.getElementById("indice-buttons").style.display = "none";
    indiceActive = false;
    const opt = document.getElementById("indice-options-list");
    if (opt) opt.remove();
  }

    let start = 0;
    if (tries === 2) start = 50;
    if (tries === 3) start = 0;
    currentAnime.startTime = start;
  
  const duration = tryDurations[tries - 1];
  
  const payload = {
    videoId: currentAnime.videoId,
    startSeconds: start
  };
  
  // Coupe seulement pour les écoutes 1 et 2
  if (duration != null) {
    payload.endSeconds = start + duration;
  }
  
  player.loadVideoById(payload);
  player.playVideo();

  document.getElementById("playTry1").disabled = true;
  document.getElementById("playTry2").disabled = (tries !== 1);
  document.getElementById("playTry3").disabled = (tries !== 2);
  updateScoreBar();
  resizeContainer();
}

function checkAnswer(selectedTitle) {
  if (isDaily && dailyPlayed) return;
  const inputVal = selectedTitle.trim().toLowerCase();
  if (currentAnime.altTitles.includes(inputVal)) {
    let score = 0;
    if (isParcours) {
      if (tries === 1) score = 3000;
      else if (tries === 2) score = 2000;
      else if (tries === 3 && indice6Used) score = 1000;
      else if (tries === 3 && indice3Used) score = 500;
      else if (tries === 3) score = 1500;
      parcoursTotalScore += score;
      showVictoryParcours(score);
    } else if (isDaily && !dailyPlayed) {
      if (tries === 1) score = 3000;
      else if (tries === 2) score = 2000;
      else if (tries === 3 && indice6Used) score = 1000;
      else if (tries === 3 && indice3Used) score = 500;
      else if (tries === 3) score = 1500;
      localStorage.setItem(SCORE_KEY, score);
      dailyPlayed = true;
      dailyScore = score;
      showDailyBanner();
      showVictory();
    } else {
      showVictory();
    }
    blockInputsAll();
    showNextButton();
    updateScoreBar(score);
    resizeContainer();
  } else {
    failedAnswers.push(selectedTitle);
    updateFailedAttempts();
    if (tries >= maxTries) {
      if (isParcours) {
        showVictoryParcours(0);
      } else {
        revealAnswer();
      }
    } else {
      document.getElementById("openingInput").disabled = true;
    }
    resizeContainer();
  }
}

function updateFailedAttempts() {
  document.getElementById("failedAttempts").innerText = failedAnswers.map(e => `❌ ${e}`).join("\n");
}
function revealAnswer() {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `🔔 Réponse : <b>${currentAnime.title}</b><br><em>${currentAnime.openingName}</em>`;
  resultDiv.className = "incorrect";
  if (isDaily && !dailyPlayed) {
    localStorage.setItem(SCORE_KEY, 0);
    dailyPlayed = true;
    dailyScore = 0;
    showDailyBanner();
  }
  blockInputsAll();
  showNextButton();
  updateScoreBar(0);
  resizeContainer();
}
function showNextButton() {
  document.getElementById("nextBtn").style.display = "block";
  document.getElementById("nextBtn").textContent = (isParcours ? (parcoursIndex + 1 < parcoursCount ? "Suivant" : "Terminer") : (isDaily ? "Retour menu" : "Rejouer"));
}

// ===== VICTOIRE / MESSAGE =====
function showVictory() {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `🎉 Bravo ! C’est <b>${currentAnime.title}</b><br><em>${currentAnime.openingName}</em><br><span style="font-size:1.1em;">en ${tries} tentative${tries > 1 ? "s" : ""}.</span> 🥳`;
  resultDiv.className = "correct";
  launchFireworks();
}
function showVictoryParcours(roundScore) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `🎶 <b>${currentAnime.title}</b><br><em>${currentAnime.openingName}</em><br>Score : <b>${roundScore}</b> / 3000 <br><span style="font-size:1.1em;">en ${tries} tentative${tries > 1 ? "s" : ""}.</span>`;
  resultDiv.className = roundScore > 0 ? "correct" : "incorrect";
  if (roundScore > 0) launchFireworks();

  document.getElementById("nextBtn").style.display = "block";
  document.getElementById("nextBtn").textContent = (parcoursIndex + 1 < parcoursCount) ? "Suivant" : "Terminer";

  document.getElementById("nextBtn").onclick = () => {
    parcoursIndex++;
    if (parcoursIndex < parcoursCount) {
      nextParcoursRound();
    } else {
      setTimeout(() => {
        parent.postMessage({
          parcoursScore: {
            label: "Opening Quizz",
            score: parcoursTotalScore,
            total: parcoursCount * 3000
          }
        }, "*");
      }, 400);
      resultDiv.innerHTML = `<div style="font-size:1.4em;">🏆 Parcours terminé !<br>Score : <b>${parcoursTotalScore}</b> / ${parcoursCount*3000}</div>`;
    }
  };
}

// ========== Fireworks Animation ==========
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
  for (let i = 0; i < 80; i++) {
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

// ========== AUTOCOMPLETE & SUBMIT ==========
const input = document.getElementById("openingInput");
input.addEventListener("input", function() {
  if ((isDaily && dailyPlayed) || isParcours && document.getElementById("openingInput").disabled) return;
  const val = this.value.toLowerCase();
  const suggestionsDiv = document.getElementById("suggestions");
  suggestionsDiv.innerHTML = "";
  if (!val || document.getElementById("openingInput").disabled) return;
  const uniqueTitles = [...new Set(animeList.map(a => a.title))];
  const matches = uniqueTitles.filter(title => title.toLowerCase().includes(val)).slice(0, 6);
  matches.forEach(title => {
    const div = document.createElement("div");
    div.textContent = title;
    div.onclick = () => {
      input.value = title;
      suggestionsDiv.innerHTML = "";
      checkAnswer(title);
      input.value = "";
    };
    suggestionsDiv.appendChild(div);
  });
});
input.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !input.disabled) {
    const val = input.value.trim();
    if (!val) return;
    checkAnswer(val);
    document.getElementById("suggestions").innerHTML = "";
    const uniqueTitles = [...new Set(animeList.map(a => a.title))];
    if (uniqueTitles.some(title => title.toLowerCase() === val.toLowerCase())) {
      input.value = ""; // <-- Vide le champ si bonne réponse
    }
  }
});
document.addEventListener("click", (e) => {
  if (e.target !== input) document.getElementById("suggestions").innerHTML = "";
});

// ========= BUTTONS EVENTS =========
document.getElementById("playTry1").addEventListener("click", () => playTry(1));
document.getElementById("playTry2").addEventListener("click", () => playTry(2));
document.getElementById("playTry3").addEventListener("click", () => playTry(3));
document.getElementById("nextBtn").addEventListener("click", () => {
  if (isParcours) {
    // Géré dans showVictoryParcours
    return;
  }
  nextAnime();
});

function nextAnime() {
  if (isDaily) {
    window.location.href = "../index.html";
    return;
  }
  if (player && player.stopVideo) player.stopVideo();
  currentIndex = Math.floor(Math.random() * animeList.length);
  currentAnime = animeList[currentIndex];
  resetControls();
  if (player && typeof player.destroy === "function") {
    player.destroy();
  }
  playerReady = false;
  if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
    window.onYouTubeIframeAPIReady = initPlayer;
  } else {
    initPlayer();
  }
  resizeContainer();
}

// ===== Resize container =====
function resizeContainer() {
  const c = document.getElementById("container");
  if (!c) return;
  c.style.minHeight = "unset";
  c.style.height = "unset";
  setTimeout(() => {
    c.style.height = "auto";
    c.style.minHeight = "0";
  }, 40);
}

// ========= Message Daily déjà joué =========
function showResultMessage(msg, showGreen, block, isDailyDone) {
  const resultDiv = document.getElementById("result");
  resultDiv.textContent = msg;
  resultDiv.className = showGreen ? "correct" : "";
  if (block) blockInputsAll();
  if (isDailyDone) document.getElementById("nextBtn").style.display = "block";
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
