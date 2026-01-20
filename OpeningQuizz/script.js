/* =========================================================
   Guess The Song (WebM) — licenses_only.json
   - Sans DAILY
   - Personnalisation (popularité, score, années, types, songs OP/ED/IN)
   - Player HTML5 <video> (WebM)
   - Parcours conservé
   ========================================================= */

const MAX_SCORE = 3000;

// scoring (comme ton jeu)
const SCORE_TRY_1 = 3000;
const SCORE_TRY_2 = 2000;
const SCORE_TRY_3_NO_HINT = 1500;
const SCORE_TRY_3_HINT_6 = 1000;
const SCORE_TRY_3_HINT_3 = 500;

// écoute 1/2 : 15s, écoute 3 : complet
const TRY_DURATIONS = [15, 15, null];

// min requis pour lancer
const MIN_REQUIRED_SONGS = 62;

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
  // on arrive sur personnalisation
  document.body.classList.remove("game-started");
});

// ========== MODE PARCOURS ? ==========
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
let parcoursIndex = 0;
let parcoursTotalScore = 0;

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
  const s = (a.season || "").trim(); // ex "spring 2013"
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

function safeText(str) {
  return String(str || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

function normalizeTitle(s) {
  return String(s || "").trim().toLowerCase();
}

// ========== SCORE BAR ==========
function getScoreBarColor(score) {
  if (score >= 2500) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= 1500) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score >= 1000) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  if (score > 0) return "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  return "linear-gradient(90deg,#444,#333 90%)";
}

let tries = 0;
let indice6Used = false;
let indice3Used = false;

function updateScoreBar(finalScore = null) {
  let percent = 100;
  let label = "3000 / 3000";
  let currentScore = 3000;

  if (tries === 0) {
    document.getElementById("score-bar-label").textContent = "3000 / 3000";
    document.getElementById("score-bar").style.width = "100%";
    document.getElementById("score-bar").style.background = getScoreBarColor(3000);
    return;
  }

  if (finalScore === null) {
    if (tries === 1) { percent = 100; label = "3000 / 3000"; currentScore = 3000; }
    else if (tries === 2) { percent = 66.66; label = "2000 / 3000"; currentScore = 2000; }
    else if (tries === 3 && !indice6Used && !indice3Used) { percent = 50; label = "1500 / 3000"; currentScore = 1500; }
    else if (tries === 3 && indice3Used) { percent = 16.7; label = "500 / 3000"; currentScore = 500; }
    else if (tries === 3 && indice6Used) { percent = 33.3; label = "1000 / 3000"; currentScore = 1000; }
    else { percent = 0; label = "0 / 3000"; currentScore = 0; }
  } else {
    currentScore = finalScore;
    if (finalScore === 3000) { percent = 100; label = "3000 / 3000"; }
    else if (finalScore === 2000) { percent = 66.66; label = "2000 / 3000"; }
    else if (finalScore === 1500) { percent = 50; label = "1500 / 3000"; }
    else if (finalScore === 1000) { percent = 33.3; label = "1000 / 3000"; }
    else if (finalScore === 500) { percent = 16.7; label = "500 / 3000"; }
    else { percent = 0; label = "0 / 3000"; }
  }

  document.getElementById("score-bar-label").textContent = label;
  document.getElementById("score-bar").style.width = percent + "%";
  document.getElementById("score-bar").style.background = getScoreBarColor(currentScore);
}

// ========== INDICES STATE ==========
let indiceActive = false;

// ========== DATA / POOLS ==========
let allLicenses = [];
let allSongs = [];       // toutes les songs extraites
let filteredSongs = [];  // pool après personnalisation

function extractSongsFromLicense(lic) {
  const animeTitle = getDisplayTitle(lic);
  const animeTitleLower = animeTitle.toLowerCase();
  const year = getYear(lic);
  const type = lic.type || "Unknown";
  const members = Number.isFinite(+lic.members) ? +lic.members : 0;
  const score = Number.isFinite(+lic.score) ? +lic.score : 0;
  const animeId = lic.mal_id ?? lic.license_id ?? Math.random();

  const res = [];
  const songObj = lic.song || {};
  const pushSong = (kind, s) => {
    if (!s || !s.video) return;
    res.push({
      animeId,
      animeTitle,
      animeTitleLower,
      year,
      type,
      members,
      score,
      kind, // opening|ending|insert
      number: s.number ?? null,
      songName: s.name || "",
      artistsText: Array.isArray(s.artists) && s.artists.length ? s.artists.join(", ") : "—",
      videoUrl: s.video
    });
  };

  (songObj.openings || []).forEach((s) => pushSong("opening", s));
  (songObj.endings || []).forEach((s) => pushSong("ending", s));
  (songObj.inserts || []).forEach((s) => pushSong("insert", s));

  return res;
}

function buildAllSongs(data) {
  const licenses = Array.isArray(data) ? data : [];
  allLicenses = licenses.map((a) => ({
    ...a,
    _title: getDisplayTitle(a),
    _titleLower: getDisplayTitle(a).toLowerCase(),
    _year: getYear(a),
    _members: Number.isFinite(+a.members) ? +a.members : 0,
    _score: Number.isFinite(+a.score) ? +a.score : 0,
    _type: a.type || "Unknown",
  }));

  const songs = [];
  allLicenses.forEach((lic) => songs.push(...extractSongsFromLicense(lic)));

  const seen = new Set();
  const dedup = [];
  for (const s of songs) {
    const key = `${s.animeId}|${s.kind}|${s.number ?? ""}|${s.videoUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(s);
  }
  return dedup;
}

// ========== PERSONALISATION ==========
function initPersonalisationUI() {
  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yMinVal = document.getElementById("yearMinVal");
  const yMaxVal = document.getElementById("yearMaxVal");

  function syncLabels() {
    clampYearSliders();
    popVal.textContent = pop.value;
    scoreVal.textContent = score.value;
    yMinVal.textContent = yMin.value;
    yMaxVal.textContent = yMax.value;
    updatePreview();
  }

  [pop, score, yMin, yMax].forEach((el) => el.addEventListener("input", syncLabels));

  // pills types
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // pills songs (data-song = OP|ED|IN)
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  document.getElementById("applyFiltersBtn").addEventListener("click", () => {
    filteredSongs = applyFilters();

    if (filteredSongs.length < MIN_REQUIRED_SONGS) {
      alert(`Pas assez de songs pour lancer (${filteredSongs.length}/${MIN_REQUIRED_SONGS}).`);
      return;
    }

    // démarre jeu
    document.body.classList.add("game-started");

    if (isParcours) {
      parcoursIndex = 0;
      parcoursTotalScore = 0;
      startParcoursGame();
    } else {
      setupClassicRound();
    }
  });

  syncLabels();
}

function applyFilters() {
  const popPercent = parseInt(document.getElementById("popPercent").value, 10);
  const scorePercent = parseInt(document.getElementById("scorePercent").value, 10);
  const yearMin = parseInt(document.getElementById("yearMin").value, 10);
  const yearMax = parseInt(document.getElementById("yearMax").value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  const allowedSongCodes = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);
  if (allowedSongCodes.length === 0) return [];

  // map OP/ED/IN -> kind dataset
  const allowedKinds = allowedSongCodes.map((c) => (c === "OP" ? "opening" : c === "ED" ? "ending" : "insert"));

  // 1) année + type + kind
  let pool = allSongs.filter((s) =>
    s.year >= yearMin &&
    s.year <= yearMax &&
    allowedTypes.includes(s.type) &&
    allowedKinds.includes(s.kind)
  );

  // 2) popularité top %
  pool.sort((a, b) => b.members - a.members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // 3) score top %
  pool.sort((a, b) => b.score - a.score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

function updatePreview() {
  const preview = document.getElementById("previewCount");
  const btn = document.getElementById("applyFiltersBtn");

  const pool = applyFilters();
  preview.textContent = `🎵 Songs disponibles : ${pool.length} ${pool.length >= MIN_REQUIRED_SONGS ? "(OK)" : "(trop peu)"}`;

  preview.classList.toggle("good", pool.length >= MIN_REQUIRED_SONGS);
  preview.classList.toggle("bad", pool.length < MIN_REQUIRED_SONGS);

  btn.disabled = pool.length < MIN_REQUIRED_SONGS;
}

// ========== GAME STATE ==========
let currentSong = null;
let failedAnswers = [];
let ended = false;

// ========== PLAYER (HTML5 VIDEO) ==========
let stopTimer = null;

function ensurePlayer() {
  // ton HTML possède <video id="audioPlayer">
  return document.getElementById("audioPlayer");
}

function setPlayerMeta(text, status) {
  const label = document.getElementById("songLabel");
  const st = document.getElementById("songStatus");
  if (label) label.textContent = text || "";
  if (st) st.textContent = status || "";
}

function stopPlayer() {
  const v = ensurePlayer();
  if (!v) return;
  clearInterval(stopTimer);
  v.pause();
  try { v.currentTime = 0; } catch {}
}

function loadSongIntoPlayer(song) {
  const v = ensurePlayer();
  const area = document.getElementById("playerArea");
  if (area) area.style.display = "block";

  setPlayerMeta("", "Préparation…");

  // reset
  clearInterval(stopTimer);
  v.pause();
  v.removeAttribute("src");
  v.load();

  v.src = song.videoUrl;
  v.load();

  v.onloadedmetadata = () => {
    setPlayerMeta(formatSongLabel(song), "");
  };

  v.onerror = () => {
    setPlayerMeta(formatSongLabel(song), "❌ Vidéo indisponible (serveur ou lien).");
  };
}

function playSegment(startSec, durationSec) {
  const v = ensurePlayer();
  if (!v || !v.src) return;

  clearInterval(stopTimer);

  const start = Math.max(0, startSec || 0);

  const trySetTime = () => {
    try {
      v.currentTime = start;
      return true;
    } catch {
      return false;
    }
  };

  // essaie plusieurs fois (metadata parfois lente)
  let triesSet = 0;
  const setId = setInterval(() => {
    triesSet++;
    const ok = trySetTime();
    if (ok || triesSet >= 15) {
      clearInterval(setId);
      v.play().catch(() => {});
      if (durationSec == null) return;

      stopTimer = setInterval(() => {
        if (v.currentTime >= start + durationSec) {
          v.pause();
          clearInterval(stopTimer);
        }
      }, 150);
    }
  }, 120);
}

// ========== FORMAT LABEL ==========
function formatSongLabel(song) {
  const kindLabel =
    song.kind === "opening" ? "Opening" :
    song.kind === "ending" ? "Ending" : "Insert";

  const num = song.number != null ? ` ${song.number}` : "";
  const name = song.songName ? ` : ${song.songName}` : "";
  const by = song.artistsText && song.artistsText !== "—" ? ` by ${song.artistsText}` : "";

  return `${song.animeTitle} ${kindLabel}${num}${name}${by}`;
}

// ========== RESET / UI ==========
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

function resetControls() {
  tries = 0;
  ended = false;
  failedAnswers = [];
  updateFailedAttempts();

  document.getElementById("result").textContent = "";
  document.getElementById("result").className = "";
  document.getElementById("timer").style.display = "none";
  document.getElementById("timer").textContent = "";
  document.getElementById("openingInput").value = "";
  document.getElementById("openingInput").disabled = true;

  document.getElementById("playTry1").disabled = false;
  document.getElementById("playTry2").disabled = true;
  document.getElementById("playTry3").disabled = true;

  document.getElementById("nextBtn").style.display = "none";
  document.getElementById("suggestions").innerHTML = "";

  resetIndice();
  updateScoreBar();
  resizeContainer();

  stopPlayer();
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

  ended = true;
}

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

// ========== ROUND SELECTION ==========
function pickRandomSongFromPool() {
  if (!filteredSongs.length) return null;
  return filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
}

function seededRandom(seed) {
  return function () {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function getParcoursIndex(n) {
  const baseSeed = Date.now() + parcoursIndex * 37;
  return Math.floor(seededRandom(baseSeed)() * n);
}

function pickParcoursSong() {
  if (!filteredSongs.length) return null;
  const idx = getParcoursIndex(filteredSongs.length);
  return filteredSongs[idx];
}

// ========== START GAME ==========
function setupClassicRound() {
  resetControls();
  currentSong = pickRandomSongFromPool();
  if (!currentSong) {
    alert("Pool vide — vérifie tes filtres.");
    return;
  }
  loadSongIntoPlayer(currentSong);
  document.getElementById("playTry1").disabled = false;
}

function startParcoursGame() {
  document.getElementById("back-to-menu").style.display = "none";
  parcoursIndex = 0;
  parcoursTotalScore = 0;
  nextParcoursRound();
}

function nextParcoursRound() {
  resetControls();
  currentSong = pickParcoursSong();
  if (!currentSong) {
    alert("Pool vide — vérifie tes filtres.");
    return;
  }

  loadSongIntoPlayer(currentSong);
  document.getElementById("playTry1").disabled = false;
}

// ========== LISTEN LOGIC ==========
function playTry(n) {
  if (ended) return;
  if (n !== tries + 1) return alert("Vous devez écouter les extraits dans l'ordre.");

  tries = n;

  document.getElementById("openingInput").disabled = false;
  document.getElementById("result").textContent = "";
  document.getElementById("result").className = "";

  // indices seulement à l'écoute 3
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

  // segments : try2 "refrain" = 50s
  let start = 0;
  if (tries === 2) start = 50;
  if (tries === 3) start = 0;

  const duration = TRY_DURATIONS[tries - 1];

  playSegment(start, duration);

  document.getElementById("playTry1").disabled = true;
  document.getElementById("playTry2").disabled = (tries !== 1);
  document.getElementById("playTry3").disabled = (tries !== 2);

  updateScoreBar();
  resizeContainer();
}

// ========== INDICES 3/6 CHOIX ==========
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
  const old = document.getElementById("indice-options-list");
  if (old) old.remove();

  // titres uniques dans le pool filtré
  const uniqueTitles = [...new Set(filteredSongs.map((s) => s.animeTitle))];
  const titles = uniqueTitles.filter((t) => normalizeTitle(t) !== normalizeTitle(currentSong.animeTitle));
  shuffleInPlace(titles);

  const propositions = titles.slice(0, nb - 1);
  propositions.push(currentSong.animeTitle);
  shuffleInPlace(propositions);

  const list = document.createElement("div");
  list.id = "indice-options-list";

  propositions.forEach((title) => {
    const btn = document.createElement("button");
    btn.textContent = title;
    btn.className = "indice-btn";
    btn.onclick = () => {
      checkAnswer(title);
      list.remove();
      document.getElementById("openingInput").value = "";
    };
    list.appendChild(btn);
  });

  document.getElementById("container").appendChild(list);
}

// ========== AUTOCOMPLETE ==========
const input = document.getElementById("openingInput");

input.addEventListener("input", function () {
  if (ended || input.disabled) return;

  const val = this.value.toLowerCase();
  const suggestionsDiv = document.getElementById("suggestions");
  suggestionsDiv.innerHTML = "";
  if (!val) return;

  const uniqueTitles = [...new Set(filteredSongs.map((s) => s.animeTitle))];
  let matches = uniqueTitles.filter((t) => t.toLowerCase().includes(val));
  shuffleInPlace(matches);

  matches.slice(0, 6).forEach((title) => {
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

input.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !input.disabled) {
    const val = input.value.trim();
    if (!val) return;
    checkAnswer(val);
    document.getElementById("suggestions").innerHTML = "";
    input.value = "";
  }
});

document.addEventListener("click", (e) => {
  if (e.target !== input) document.getElementById("suggestions").innerHTML = "";
});

// ========== ANSWER CHECK ==========
function computeScore() {
  if (tries === 1) return SCORE_TRY_1;
  if (tries === 2) return SCORE_TRY_2;
  if (indice3Used) return SCORE_TRY_3_HINT_3;
  if (indice6Used) return SCORE_TRY_3_HINT_6;
  return SCORE_TRY_3_NO_HINT;
}

function checkAnswer(selectedTitle) {
  if (ended) return;

  const guess = normalizeTitle(selectedTitle);
  const answer = normalizeTitle(currentSong.animeTitle);

  if (guess === answer) {
    const score = computeScore();

    if (isParcours) {
      parcoursTotalScore += score;
      showVictoryParcours(score);
    } else {
      showVictory(score);
    }

    blockInputsAll();
    showNextButton();
    updateScoreBar(score);
    resizeContainer();
    return;
  }

  failedAnswers.push(selectedTitle);
  updateFailedAttempts();

  if (tries >= 3) {
    if (isParcours) {
      showVictoryParcours(0);
      blockInputsAll();
      showNextButton();
      updateScoreBar(0);
    } else {
      revealAnswer();
    }
  } else {
    document.getElementById("openingInput").disabled = true;
  }

  resizeContainer();
}

function updateFailedAttempts() {
  document.getElementById("failedAttempts").innerText = failedAnswers.map((e) => `❌ ${e}`).join("\n");
}

function revealAnswer() {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `🔔 Réponse : <b>${safeText(currentSong.animeTitle)}</b><br><em>${safeText(currentSong.songName || "")}</em>`;
  resultDiv.className = "incorrect";
  blockInputsAll();
  showNextButton();
  updateScoreBar(0);
  resizeContainer();
}

// ========== NEXT BUTTON ==========
document.getElementById("nextBtn").addEventListener("click", () => {
  if (isParcours) return; // géré dans showVictoryParcours
  nextRoundClassic();
});

function showNextButton() {
  const btn = document.getElementById("nextBtn");
  btn.style.display = "block";
  btn.textContent = isParcours ? (parcoursIndex + 1 < parcoursCount ? "Suivant" : "Terminer") : "Rejouer";
}

function nextRoundClassic() {
  stopPlayer();
  setupClassicRound();
}

// ========== VICTORY MESSAGES ==========
function showVictory(score) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML =
    `🎉 Bravo ! C’est <b>${safeText(currentSong.animeTitle)}</b>` +
    `<br><em>${safeText(currentSong.songName || "")}</em>` +
    `<br><span style="font-size:1.1em;">en ${tries} tentative${tries > 1 ? "s" : ""}.</span>` +
    `<br><span style="opacity:0.9;">Score : <b>${score}</b> / ${MAX_SCORE}</span> 🥳`;
  resultDiv.className = "correct";
  launchFireworks();
}

function showVictoryParcours(roundScore) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML =
    `🎶 <b>${safeText(currentSong.animeTitle)}</b>` +
    `<br><em>${safeText(currentSong.songName || "")}</em>` +
    `<br>Score : <b>${roundScore}</b> / ${MAX_SCORE}` +
    `<br><span style="font-size:1.05em;">en ${tries} tentative${tries > 1 ? "s" : ""}.</span>`;
  resultDiv.className = roundScore > 0 ? "correct" : "incorrect";
  if (roundScore > 0) launchFireworks();

  const btn = document.getElementById("nextBtn");
  btn.style.display = "block";
  btn.textContent = (parcoursIndex + 1 < parcoursCount) ? "Suivant" : "Terminer";

  btn.onclick = () => {
    parcoursIndex++;
    if (parcoursIndex < parcoursCount) {
      nextParcoursRound();
    } else {
      setTimeout(() => {
        parent.postMessage({
          parcoursScore: {
            label: "Opening Quizz",
            score: parcoursTotalScore,
            total: parcoursCount * MAX_SCORE
          }
        }, "*");
      }, 400);

      resultDiv.innerHTML =
        `<div style="font-size:1.4em;">🏆 Parcours terminé !<br>` +
        `Score : <b>${parcoursTotalScore}</b> / ${parcoursCount * MAX_SCORE}</div>`;
      blockInputsAll();
    }
  };
}

// ========== FIREWORKS ==========
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

// ========== TOOLTIP AIDE ==========
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

// ========== BUTTONS EVENTS ==========
document.getElementById("playTry1").addEventListener("click", () => playTry(1));
document.getElementById("playTry2").addEventListener("click", () => playTry(2));
document.getElementById("playTry3").addEventListener("click", () => playTry(3));

// ========== BOOTSTRAP LOAD DATA ==========
fetch("../data/licenses_only.json")
  .then((r) => r.json())
  .then((data) => {
    allSongs = buildAllSongs(data);
    initPersonalisationUI();
    updatePreview();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
