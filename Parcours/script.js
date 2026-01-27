// =====================
// THEME (DARK/LIGHT)
// =====================
const themeToggleBtn = document.getElementById("themeToggle");
themeToggleBtn?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

// =====================
// RETOUR MENU
// =====================
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = "../index.html";
});

// =====================
// TOOLTIP AIDE
// =====================
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

// =====================
// CONSTANTES / STORAGE
// =====================
const PARCOURS_CFG_KEY = "AG_parcours_filters";
const PARCOURS_STEPS_KEY = "parcoursSteps";
const PARCOURS_INPROGRESS_KEY = "parcoursInProgress";
const PARCOURS_INDEX_KEY = "parcoursIndex";

// =====================
// DOMS
// =====================
const container = document.getElementById("container");
const builderSection = document.getElementById("parcours-builder");
const recapSection = document.getElementById("recap");
const recapList = document.getElementById("parcoursRecapList");

const customPanel = document.getElementById("parcours-custom-panel");

// builder
const stepsList = document.getElementById("steps-list");
const gameType = document.getElementById("gameType");
const modeOption = document.getElementById("modeOption");
const stepCount = document.getElementById("stepCount");
const addStepBtn = document.getElementById("addStepBtn");
const startParcoursBtn = document.getElementById("startParcoursBtn");

// recap btns
const editParcoursBtn = document.getElementById("editParcoursBtn");
const editSettingsBtn = document.getElementById("editSettingsBtn");
const launchConfirmedBtn = document.getElementById("launchConfirmedBtn");

// custom panel
const popEl = document.getElementById("popPercent");
const scoreEl = document.getElementById("scorePercent");
const yearMinEl = document.getElementById("yearMin");
const yearMaxEl = document.getElementById("yearMax");
const popValEl = document.getElementById("popPercentVal");
const scoreValEl = document.getElementById("scorePercentVal");
const yearMinValEl = document.getElementById("yearMinVal");
const yearMaxValEl = document.getElementById("yearMaxVal");
const songsRow = document.getElementById("songsRow");
const previewCountEl = document.getElementById("previewCount");
const applyFiltersBtn = document.getElementById("applyFiltersBtn");
const roundCountEl = document.getElementById("roundCount");
const backToBuilderBtn = document.getElementById("backToBuilderBtn");

// iframe
const parcoursContainer = document.getElementById("parcours-container");
const parcoursIframe = document.getElementById("parcours-iframe");
const parcoursScore = document.getElementById("parcours-score");
const parcoursFinish = document.getElementById("parcours-finish");

// Loader iframe
let parcoursLoader = document.getElementById("parcours-loader");
if (!parcoursLoader) {
  parcoursLoader = document.createElement("div");
  parcoursLoader.id = "parcours-loader";
  parcoursLoader.textContent = "Chargement du jeu…";
  parcoursLoader.style.cssText = "display:none;text-align:center;margin:1.3rem;font-size:1.3rem;";
  parcoursContainer && parcoursContainer.insertBefore(parcoursLoader, parcoursIframe);
}

// =====================
// MAPPING JEUX
// =====================
const BASE = "https://mastermanga.github.io/AG/";
const GAME_PATHS = {
  anidle: "Anidle/index.html",
  openingquizz: "OpeningQuizz/index.html",
  characterquizz: "CharacterQuizz/index.html",
  animetournament: "AnimeTournament/index.html",
  blindranking: "BlindRanking/index.html",

  keeponext: "KeepOrNext/index.html",
  leftorright: "LeftOrRight/index.html",
  higherorlower: "HigherOrLower/index.html",
  toppick: "TopPick/index.html",
  threevthree: "3v3/index.html",
  fakeortruth: "FakeOrTruth/index.html",
  clue: "Clue/index.html",
  intrus: "Intrus/index.html",
  fusion: "Fusion/index.html",
  pixelart: "PixelArt/index.html",
};

function gameNameLabel(type) {
  const map = {
    anidle: "Anidle",
    openingquizz: "Opening Quizz",
    characterquizz: "Character Quizz",
    animetournament: "Anime Tournament",
    blindranking: "Blind Ranking",
    keeponext: "Keep Or Next",
    leftorright: "Left Or Right",
    higherorlower: "Higher Or Lower",
    toppick: "Top Pick",
    threevthree: "3 v 3",
    fakeortruth: "Fake Or Truth",
    clue: "Clue",
    intrus: "Intrus",
    fusion: "Fusion",
    pixelart: "Pixel Art",
  };
  return map[type] || type;
}

function modeLabel(m) {
  if (m === "songs") return "Songs";
  if (m === "stat") return "Stat";
  return "Anime";
}

// ✅ MODES EXACTS d'après ta liste
// - Si le jeu a 1 seul mode -> mode fixé, pas de select
// - Si plusieurs -> select dans le builder
const GAME_MODES = {
  anidle: ["anime"],
  openingquizz: ["songs"],
  characterquizz: ["anime"],
  animetournament: ["anime", "songs"],
  blindranking: ["anime", "songs"],
  keeponext: ["anime", "songs"],
  leftorright: ["anime", "songs"],
  higherorlower: ["stat"],
  toppick: ["anime", "songs"],
  threevthree: ["anime", "songs"],
  fakeortruth: ["songs"],
  clue: ["anime"],
  intrus: ["anime", "songs"],
  fusion: ["anime"],
  pixelart: ["anime"],
};

// =====================
// PARCOURS STATE
// =====================
let parcoursSteps = [];
let parcoursScores = [];

// =====================
// FLOW HELPERS (UI)
// =====================
function showBuilder() {
  customPanel.style.display = "none";
  recapSection.style.display = "none";
  builderSection.style.display = "block";
  container.style.display = "flex";
}
function showCustomization() {
  container.style.display = "none";
  recapSection.style.display = "none";
  builderSection.style.display = "none";
  customPanel.style.display = "block";
  refreshNeedsAndPreview();
}
function showRecap() {
  customPanel.style.display = "none";
  builderSection.style.display = "none";
  recapSection.style.display = "block";
  container.style.display = "flex";
  renderRecap();
}

// =====================
// BUILDER: MODE OPTION (selon jeu)
// =====================
function updateModeOptionForGame() {
  const t = gameType.value;
  const modes = GAME_MODES[t] || ["anime"];

  if (modes.length <= 1) {
    modeOption.style.display = "none";
    modeOption.innerHTML = "";
    return;
  }

  modeOption.style.display = "";
  modeOption.innerHTML = modes
    .map((m) => `<option value="${m}">${modeLabel(m)}</option>`)
    .join("");
}

gameType?.addEventListener("change", () => {
  updateModeOptionForGame();
});

function getFixedModeForGame(type) {
  const modes = GAME_MODES[type] || ["anime"];
  return modes[0] || "anime";
}
function getSelectedModeForGame(type) {
  const modes = GAME_MODES[type] || ["anime"];
  if (modes.length <= 1) return modes[0] || "anime";
  return modeOption.value || modes[0] || "anime";
}

// =====================
// AJOUT ETAPES
// =====================
addStepBtn?.addEventListener("click", () => {
  const type = gameType.value;
  const count = parseInt(stepCount.value, 10);
  if (!type || !Number.isFinite(count) || count < 1) return;

  const mode = getSelectedModeForGame(type); // anime|songs|stat
  parcoursSteps.push({ type, mode, count });

  renderSteps();
  startParcoursBtn.style.display = parcoursSteps.length > 0 ? "block" : "none";
});

function renderSteps() {
  stepsList.innerHTML = "";

  if (parcoursSteps.length === 0) {
    stepsList.innerHTML = "<div class='empty'>Ajoutez vos étapes !</div>";
    startParcoursBtn.style.display = "none";
    return;
  }

  parcoursSteps.forEach((step, idx) => {
    let txt = `${gameNameLabel(step.type)} (${modeLabel(step.mode)}) × ${step.count}`;

    const div = document.createElement("div");
    div.className = "step-line";
    div.innerHTML = `
      <span class="step-badge">${txt}</span>
      <span class="step-controls">
        <button class="upBtn toggle-btn" ${idx === 0 ? "disabled" : ""}>⬆️</button>
        <button class="downBtn toggle-btn" ${idx === parcoursSteps.length - 1 ? "disabled" : ""}>⬇️</button>
        <button class="removeBtn toggle-btn">🗑️</button>
      </span>
    `;

    div.querySelector(".upBtn").onclick = () => moveStep(idx, -1);
    div.querySelector(".downBtn").onclick = () => moveStep(idx, 1);
    div.querySelector(".removeBtn").onclick = () => removeStep(idx);

    stepsList.appendChild(div);
  });
}

function moveStep(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= parcoursSteps.length) return;
  const temp = parcoursSteps[idx];
  parcoursSteps.splice(idx, 1);
  parcoursSteps.splice(newIdx, 0, temp);
  renderSteps();
}

function removeStep(idx) {
  parcoursSteps.splice(idx, 1);
  renderSteps();
  startParcoursBtn.style.display = parcoursSteps.length > 0 ? "block" : "none";
}

// =====================
// BUILDER -> CUSTOMIZATION
// =====================
startParcoursBtn?.addEventListener("click", () => {
  if (parcoursSteps.length === 0) return;
  showCustomization();
});

backToBuilderBtn?.addEventListener("click", () => {
  showBuilder();
});

// =====================
// RECAP BUTTONS
// =====================
editParcoursBtn?.addEventListener("click", () => {
  showBuilder();
});

editSettingsBtn?.addEventListener("click", () => {
  showCustomization();
});

// =====================
// CUSTOM PANEL LOGIC (GLOBAL)
// =====================
const MIN_REQUIRED = 64;

function clampYearSliders() {
  let a = parseInt(yearMinEl.value, 10);
  let b = parseInt(yearMaxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    yearMinEl.value = a;
    yearMaxEl.value = b;
  }
}
function syncLabels() {
  clampYearSliders();
  popValEl.textContent = popEl.value;
  scoreValEl.textContent = scoreEl.value;
  yearMinValEl.textContent = yearMinEl.value;
  yearMaxValEl.textContent = yearMaxEl.value;
}

function getActiveTypes() {
  return [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
}
function getActiveSongs() {
  return [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);
}

function collectParcoursConfig() {
  return {
    popPercent: parseInt(popEl.value, 10),
    scorePercent: parseInt(scoreEl.value, 10),
    yearMin: parseInt(yearMinEl.value, 10),
    yearMax: parseInt(yearMaxEl.value, 10),
    types: getActiveTypes(),
    songs: getActiveSongs(),
    defaultRounds: Math.max(1, Math.min(100, parseInt(roundCountEl.value || "1", 10))),
  };
}
function loadParcoursConfig() {
  try {
    const raw = localStorage.getItem(PARCOURS_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function applyConfigToUI(cfg) {
  if (!cfg) return;

  if (typeof cfg.popPercent === "number") popEl.value = String(cfg.popPercent);
  if (typeof cfg.scorePercent === "number") scoreEl.value = String(cfg.scorePercent);
  if (typeof cfg.yearMin === "number") yearMinEl.value = String(cfg.yearMin);
  if (typeof cfg.yearMax === "number") yearMaxEl.value = String(cfg.yearMax);
  if (typeof cfg.defaultRounds === "number") roundCountEl.value = String(cfg.defaultRounds);

  const types = Array.isArray(cfg.types) ? cfg.types : [];
  document.querySelectorAll("#typePills .pill").forEach((b) => {
    const active = types.includes(b.dataset.type);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });

  const songs = Array.isArray(cfg.songs) ? cfg.songs : [];
  document.querySelectorAll("#songPills .pill").forEach((b) => {
    const active = songs.includes(b.dataset.song);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });

  syncLabels();
  stepCount.value = String(cfg.defaultRounds || 1);
}

let needsAnime = true;
let needsSongs = false;

// Stat => on considère que ça requiert le pool anime (et ça n’a pas besoin du pool songs)
function computeNeedsFromSteps() {
  let na = false;
  let ns = false;

  for (const s of parcoursSteps) {
    if (s.mode === "songs") ns = true;
    if (s.mode === "anime" || s.mode === "stat") na = true;
  }

  if (!na && !ns) na = true;
  return { na, ns };
}

function refreshNeedsAndPreview() {
  const res = computeNeedsFromSteps();
  needsAnime = res.na;
  needsSongs = res.ns;

  songsRow.style.display = needsSongs ? "flex" : "none";

  syncLabels();
  updatePreview();
}

function initCustomPanelEvents() {
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  const onInput = () => {
    syncLabels();
    updatePreview();
  };
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", onInput));

  roundCountEl.addEventListener("input", () => {
    const v = Math.max(1, Math.min(100, parseInt(roundCountEl.value || "1", 10)));
    stepCount.value = String(v);
  });

  applyFiltersBtn.addEventListener("click", () => {
    const cfg = collectParcoursConfig();
    localStorage.setItem(PARCOURS_CFG_KEY, JSON.stringify(cfg));
    showRecap();
  });

  const saved = loadParcoursConfig();
  if (saved) applyConfigToUI(saved);
  syncLabels();
}

// =====================
// DATA (preview)
// =====================
function normalizeAnimeList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.animes)) return json.animes;
  return [];
}
function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}
function getDisplayTitle(a) {
  return a.title_english || a.title_mal_default || a.title_original || a.title || "Titre inconnu";
}
function getYear(a) {
  const s = ((a && a.season) ? String(a.season) : "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}
function getYearFromSeasonStr(seasonStr, fallback = 0) {
  const s = (seasonStr ? String(seasonStr) : "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : (fallback || 0);
}
function extractSongsFromAnime(anime) {
  const out = [];
  const song = anime.song || {};
  const buckets = [
    { key: "openings", type: "OP" },
    { key: "endings", type: "ED" },
    { key: "inserts", type: "IN" },
  ];

  for (const b of buckets) {
    const arr = Array.isArray(song[b.key]) ? song[b.key] : [];
    for (const it of arr) {
      const url = it.video || it.url || "";
      if (!url || typeof url !== "string" || url.length < 6) continue;

      const songYear = getYearFromSeasonStr(it.season, anime._year);
      out.push({
        songType: b.type,
        url,
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,
        _key: `${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
        songYear,
      });
    }
  }
  return out;
}

let allAnimes = [];
let allSongs = [];

function applyFiltersPreview(cfg) {
  const popPercent = cfg.popPercent;
  const scorePercent = cfg.scorePercent;
  const yearMin = cfg.yearMin;
  const yearMax = cfg.yearMax;
  const types = cfg.types || [];
  const allowedSongs = cfg.songs || [];

  if (!types.length) return { animeCount: 0, songCount: 0 };

  let poolA = allAnimes.filter((a) => a._year >= yearMin && a._year <= yearMax && types.includes(a._type));
  poolA.sort((a, b) => b._members - a._members);
  poolA = poolA.slice(0, Math.ceil(poolA.length * (popPercent / 100)));
  poolA.sort((a, b) => b._score - a._score);
  poolA = poolA.slice(0, Math.ceil(poolA.length * (scorePercent / 100)));

  let poolS = allSongs.filter((s) =>
    s.animeYear >= yearMin &&
    s.animeYear <= yearMax &&
    types.includes(s.animeType) &&
    allowedSongs.includes(s.songType)
  );
  poolS.sort((a, b) => b.animeMembers - a.animeMembers);
  poolS = poolS.slice(0, Math.ceil(poolS.length * (popPercent / 100)));
  poolS.sort((a, b) => b.animeScore - a.animeScore);
  poolS = poolS.slice(0, Math.ceil(poolS.length * (scorePercent / 100)));

  return { animeCount: poolA.length, songCount: poolS.length };
}

function updatePreview() {
  if (!allAnimes.length) {
    previewCountEl.textContent = "⏳ Chargement de la base…";
    previewCountEl.classList.add("bad");
    previewCountEl.classList.remove("good");
    applyFiltersBtn.disabled = true;
    applyFiltersBtn.classList.add("disabled");
    return;
  }

  const cfg = collectParcoursConfig();
  const { animeCount, songCount } = applyFiltersPreview(cfg);

  const okAnime = !needsAnime || animeCount >= MIN_REQUIRED;
  const okSongs = !needsSongs || songCount >= MIN_REQUIRED;
  const okOverall = okAnime && okSongs;

  let parts = [];
  if (needsAnime) parts.push(`📚 Titres : ${animeCount} ${okAnime ? "(OK)" : `(Min ${MIN_REQUIRED})`}`);
  if (needsSongs) parts.push(`🎵 Songs : ${songCount} ${okSongs ? "(OK)" : `(Min ${MIN_REQUIRED})`}`);
  previewCountEl.textContent = parts.join(" • ");

  previewCountEl.classList.toggle("good", okOverall);
  previewCountEl.classList.toggle("bad", !okOverall);

  applyFiltersBtn.disabled = !okOverall;
  applyFiltersBtn.classList.toggle("disabled", !okOverall);
}

// =====================
// RECAP RENDER
// =====================
function renderRecap() {
  recapList.innerHTML = "";
  parcoursSteps.forEach((step, i) => {
    const txt = `${gameNameLabel(step.type)} (${modeLabel(step.mode)}) × ${step.count}`;
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${txt}`;
    recapList.appendChild(li);
  });
}

// =====================
// LANCEMENT PARCOURS
// =====================
launchConfirmedBtn?.addEventListener("click", () => {
  localStorage.setItem(PARCOURS_STEPS_KEY, JSON.stringify(parcoursSteps));
  localStorage.setItem(PARCOURS_INPROGRESS_KEY, "1");
  localStorage.setItem(PARCOURS_INDEX_KEY, "0");
  parcoursScores = [];
  startIframeParcours();
});

function startIframeParcours() {
  container.style.display = "none";
  customPanel.style.display = "none";
  document.body.classList.add("parcours-fullscreen");

  parcoursContainer.style.display = "flex";
  parcoursContainer.classList.add("active");
  parcoursScore.style.display = "none";
  parcoursFinish.style.display = "none";
  parcoursScores = [];

  launchIframeStep(0);
}

function launchIframeStep(idx) {
  const steps = JSON.parse(localStorage.getItem(PARCOURS_STEPS_KEY) || "[]");
  if (!steps.length || idx >= steps.length) {
    showFinalRecap();
    return;
  }

  localStorage.setItem(PARCOURS_INPROGRESS_KEY, "1");
  localStorage.setItem(PARCOURS_INDEX_KEY, String(idx));

  const step = steps[idx];
  const path = GAME_PATHS[step.type] || "index.html";
  const urlBase = BASE + path;

  const params = new URLSearchParams();
  params.set("parcours", "1");
  params.set("count", String(step.count || 1));

  // ✅ on envoie toujours le mode défini pour l'étape
  if (step.mode) params.set("mode", step.mode); // anime|songs|stat

  const url = `${urlBase}?${params.toString()}`;

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

// Les jeux doivent faire : parent.postMessage({parcoursScore:{label,score,total}}, "*")
window.addEventListener("message", (e) => {
  const payload = e?.data?.parcoursScore;
  if (!payload) return;

  parcoursScores.push(payload);

  const idx = parseInt(localStorage.getItem(PARCOURS_INDEX_KEY) || "0", 10) + 1;
  const steps = JSON.parse(localStorage.getItem(PARCOURS_STEPS_KEY) || "[]");

  if (idx < steps.length) launchIframeStep(idx);
  else showFinalRecap();
});

// =====================
// FINAL RECAP + CLEANUP
// =====================
function showFinalRecap() {
  localStorage.removeItem(PARCOURS_INPROGRESS_KEY);
  localStorage.removeItem(PARCOURS_INDEX_KEY);

  parcoursIframe.style.display = "none";
  parcoursIframe.classList.remove("active");
  parcoursLoader.style.display = "none";

  document.body.classList.remove("parcours-fullscreen");
  parcoursContainer.style.display = "flex";
  parcoursContainer.classList.add("active");
  parcoursScore.style.display = "block";
  parcoursFinish.style.display = "block";

  let html = "<h2>Récapitulatif du Parcours</h2><ul>";

  const grouped = {};
  let totalScore = 0;
  let maxScore = 0;

  parcoursScores.forEach((res) => {
    const label = res.label || "Autre";
    if (!grouped[label]) grouped[label] = { score: 0, total: 0 };
    grouped[label].score += (typeof res.score === "number" ? res.score : 0);
    grouped[label].total += (typeof res.total === "number" ? res.total : 0);
    totalScore += (typeof res.score === "number" ? res.score : 0);
    maxScore += (typeof res.total === "number" ? res.total : 0);
  });

  for (const label in grouped) {
    html += `<li>${label} : <b>${grouped[label].score} / ${grouped[label].total}</b></li>`;
  }
  html += "</ul>";
  html += `<div style="font-size:2rem;margin-top:13px;"><b>Score total : ${totalScore} / ${maxScore}</b></div>`;

  parcoursScore.innerHTML = html;
  parcoursFinish.innerHTML = `<button onclick="window.location.href='../index.html'" class="toggle-btn">Retour menu</button>`;
}

// =====================
// RESTORE + BOOT
// =====================
window.addEventListener("DOMContentLoaded", () => {
  // restore theme
  if (localStorage.getItem("theme") === "light") document.body.classList.add("light");

  // init custom panel events
  initCustomPanelEvents();

  // init mode select depending on current game
  updateModeOptionForGame();

  // si parcours en cours
  if (localStorage.getItem(PARCOURS_INPROGRESS_KEY)) {
    if (confirm("Un Mode Parcours est en cours, continuer ?")) {
      container.style.display = "none";
      customPanel.style.display = "none";
      startIframeParcours();
      return;
    } else {
      localStorage.removeItem(PARCOURS_INPROGRESS_KEY);
      localStorage.removeItem(PARCOURS_STEPS_KEY);
      localStorage.removeItem(PARCOURS_INDEX_KEY);
    }
  }

  // show builder at start
  showBuilder();
  renderSteps();
});

// data load for preview
fetch("../data/licenses_only.json")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then((json) => {
    const raw = normalizeAnimeList(json);

    allAnimes = (Array.isArray(raw) ? raw : []).map((a) => {
      const title = getDisplayTitle(a);
      return {
        ...a,
        _title: title,
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    updatePreview();
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyFiltersBtn.disabled = true;
    applyFiltersBtn.classList.add("disabled");
    console.error(e);
  });
