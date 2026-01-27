// =====================
// THEME (DARK/LIGHT)
// =====================
document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");
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

// builder/recap
const container = document.getElementById("container");
const builderSection = document.getElementById("parcours-builder");
const recapSection = document.getElementById("recap");
const recapList = document.getElementById("parcoursRecapList");

const stepsList = document.getElementById("steps-list");
const gameType = document.getElementById("gameType");
const modeOption = document.getElementById("modeOption");
const stepCount = document.getElementById("stepCount");
const addStepBtn = document.getElementById("addStepBtn");
const startParcoursBtn = document.getElementById("startParcoursBtn");
const editParcoursBtn = document.getElementById("editParcoursBtn");
const launchConfirmedBtn = document.getElementById("launchConfirmedBtn");

// custom panel
const customPanel = document.getElementById("parcours-custom-panel");
const backToParcoursBtn = document.getElementById("backToParcoursBtn");

const popEl = document.getElementById("popPercent");
const scoreEl = document.getElementById("scorePercent");
const yearMinEl = document.getElementById("yearMin");
const yearMaxEl = document.getElementById("yearMax");
const popValEl = document.getElementById("popPercentVal");
const scoreValEl = document.getElementById("scorePercentVal");
const yearMinValEl = document.getElementById("yearMinVal");
const yearMaxValEl = document.getElementById("yearMaxVal");

const previewCountEl = document.getElementById("previewCount");
const applyFiltersBtn = document.getElementById("applyFiltersBtn");

// iframe parcours
const parcoursContainer = document.getElementById("parcours-container");
const parcoursIframe = document.getElementById("parcours-iframe");
const parcoursScore = document.getElementById("parcours-score");
const parcoursFinish = document.getElementById("parcours-finish");

// Loader iframe
let parcoursLoader = document.getElementById("parcours-loader");
if (!parcoursLoader && parcoursContainer) {
  parcoursLoader = document.createElement("div");
  parcoursLoader.id = "parcours-loader";
  parcoursLoader.textContent = "Chargement du jeu…";
  parcoursLoader.style.cssText = "display:none;text-align:center;margin:1.3rem;font-size:1.3rem;font-weight:900;";
  parcoursContainer.insertBefore(parcoursLoader, parcoursIframe);
}

// =====================
// MAPPING JEUX
// =====================
const BASE = "https://mastermanga.github.io/AG2/";
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

// Jeux où le builder propose un mode Anime/Songs
const MODE_CAPABLE = new Set([
  "animetournament",
  "blindranking",
  "keeponext",
  "leftorright",
  "toppick",
  "threevthree",
  "intrus",
]);

// Mode FIXE des jeux (si pas mode-capable)
const FIXED_GAME_MODE = {
  anidle: "anime",
  openingquizz: "songs",
  characterquizz: "anime",
  higherorlower: "anime", // "stat" mais basé sur la base anime
  fakeortruth: "songs",
  clue: "anime",
  fusion: "anime",
  pixelart: "anime",
};

// =====================
// PARCOURS STATE
// =====================
let parcoursSteps = [];
let parcoursScores = [];

// =====================
// AFFICHAGE (FLOW)
// =====================
function showBuilder() {
  if (customPanel) customPanel.style.display = "none";
  if (parcoursContainer) parcoursContainer.style.display = "none";
  if (container) container.style.display = "flex";

  if (builderSection) builderSection.style.display = "block";
  if (recapSection) recapSection.style.display = "none";
}

function showRecap() {
  if (builderSection) builderSection.style.display = "none";
  if (recapSection) recapSection.style.display = "block";
}

function showCustomization() {
  if (container) container.style.display = "none";
  if (parcoursContainer) parcoursContainer.style.display = "none";
  if (customPanel) customPanel.style.display = "block";

  // refresh preview pour être sûr
  syncLabels();
  updatePreview();
}

// =====================
// CUSTOM PANEL LOGIC (GLOBAL)
// =====================
const MIN_REQUIRED = 64;

function clampYearSliders() {
  if (!yearMinEl || !yearMaxEl) return;
  let a = parseInt(yearMinEl.value, 10);
  let b = parseInt(yearMaxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    yearMinEl.value = String(a);
    yearMaxEl.value = String(b);
  }
}

function getActiveTypes() {
  return [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
}
function getActiveSongs() {
  return [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);
}

function collectParcoursConfig() {
  return {
    popPercent: parseInt(popEl?.value || "30", 10),
    scorePercent: parseInt(scoreEl?.value || "100", 10),
    yearMin: parseInt(yearMinEl?.value || "1950", 10),
    yearMax: parseInt(yearMaxEl?.value || "2026", 10),
    types: getActiveTypes(),
    songs: getActiveSongs(),
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

  // Types
  const types = Array.isArray(cfg.types) ? cfg.types : [];
  document.querySelectorAll("#typePills .pill").forEach((b) => {
    const active = types.includes(b.dataset.type);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });

  // Songs
  const songs = Array.isArray(cfg.songs) ? cfg.songs : [];
  document.querySelectorAll("#songPills .pill").forEach((b) => {
    const active = songs.includes(b.dataset.song);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });

  syncLabels();
}

function syncLabels() {
  clampYearSliders();
  if (popValEl) popValEl.textContent = popEl?.value || "30";
  if (scoreValEl) scoreValEl.textContent = scoreEl?.value || "100";
  if (yearMinValEl) yearMinValEl.textContent = yearMinEl?.value || "1950";
  if (yearMaxValEl) yearMaxValEl.textContent = yearMaxEl?.value || "2026";
}

function parcoursNeeds() {
  // Déduit ce qui est nécessaire à partir des étapes choisies
  let needAnime = false;
  let needSongs = false;

  for (const step of parcoursSteps) {
    const t = step.type;

    if (FIXED_GAME_MODE[t] === "anime") needAnime = true;
    if (FIXED_GAME_MODE[t] === "songs") needSongs = true;

    if (MODE_CAPABLE.has(t)) {
      if (step.mode === "songs") needSongs = true;
      else needAnime = true; // défaut
    }
  }

  // sécurité si parcours vide (normalement impossible d'arriver ici)
  if (!parcoursSteps.length) {
    needAnime = true;
    needSongs = true;
  }

  return { needAnime, needSongs };
}

// =====================
// PREVIEW DATA
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
  const types = cfg.types;

  if (!types.length) return { animeCount: 0, songCount: 0 };

  // anime pool
  let poolA = allAnimes.filter(
    (a) => a._year >= yearMin && a._year <= yearMax && types.includes(a._type)
  );
  poolA.sort((a, b) => b._members - a._members);
  poolA = poolA.slice(0, Math.ceil(poolA.length * (popPercent / 100)));
  poolA.sort((a, b) => b._score - a._score);
  poolA = poolA.slice(0, Math.ceil(poolA.length * (scorePercent / 100)));

  // songs pool
  const allowedSongs = cfg.songs;
  let poolS = allSongs.filter(
    (s) =>
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

function okLabel(count, needed) {
  if (!needed) return "(non utilisé)";
  return count >= MIN_REQUIRED ? "(OK)" : `(Min ${MIN_REQUIRED})`;
}

function updatePreview() {
  if (!allAnimes.length) {
    if (previewCountEl) {
      previewCountEl.textContent = "⏳ Chargement de la base…";
      previewCountEl.classList.add("bad");
      previewCountEl.classList.remove("good");
    }
    if (applyFiltersBtn) {
      applyFiltersBtn.disabled = true;
      applyFiltersBtn.classList.add("disabled");
    }
    return;
  }

  const cfg = collectParcoursConfig();
  const { animeCount, songCount } = applyFiltersPreview(cfg);
  const { needAnime, needSongs } = parcoursNeeds();

  const okAnime = !needAnime || animeCount >= MIN_REQUIRED;
  const okSongs = !needSongs || songCount >= MIN_REQUIRED;
  const ok = okAnime && okSongs;

  if (previewCountEl) {
    previewCountEl.textContent =
      `📚 Titres : ${animeCount} ${okLabel(animeCount, needAnime)} • ` +
      `🎵 Songs : ${songCount} ${okLabel(songCount, needSongs)}`;

    previewCountEl.classList.toggle("good", ok);
    previewCountEl.classList.toggle("bad", !ok);
  }

  if (applyFiltersBtn) {
    applyFiltersBtn.disabled = !ok;
    applyFiltersBtn.classList.toggle("disabled", !ok);
  }
}

// init UI (pills + sliders)
function initCustomPanel() {
  // type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // song pills
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // sliders
  const onInput = () => {
    syncLabels();
    updatePreview();
  };
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el?.addEventListener("input", onInput));

  // Valider réglages => start parcours
  applyFiltersBtn?.addEventListener("click", () => {
    const cfg = collectParcoursConfig();
    localStorage.setItem(PARCOURS_CFG_KEY, JSON.stringify(cfg));

    // on (re)stocke les étapes au cas où
    localStorage.setItem(PARCOURS_STEPS_KEY, JSON.stringify(parcoursSteps));
    localStorage.setItem(PARCOURS_INPROGRESS_KEY, "1");
    localStorage.setItem(PARCOURS_INDEX_KEY, "0");

    parcoursScores = [];
    startIframeParcours();
  });

  // Retour parcours (revient sur le récap)
  backToParcoursBtn?.addEventListener("click", () => {
    if (customPanel) customPanel.style.display = "none";
    if (container) container.style.display = "flex";
    if (builderSection) builderSection.style.display = "none";
    if (recapSection) recapSection.style.display = "block";
  });

  // restore cfg if exists
  const saved = loadParcoursConfig();
  if (saved) applyConfigToUI(saved);

  syncLabels();
}

// =====================
// BUILDER: MODE OPTION (Anime/Songs uniquement)
// =====================
function refreshModeOptionUI() {
  if (!gameType || !modeOption) return;

  if (MODE_CAPABLE.has(gameType.value)) {
    modeOption.style.display = "";
    modeOption.innerHTML = `
      <option value="anime">Anime</option>
      <option value="songs">Songs</option>
    `;
    modeOption.value = "anime";
  } else {
    modeOption.style.display = "none";
    modeOption.innerHTML = "";
  }
}

gameType?.addEventListener("change", refreshModeOptionUI);

// =====================
// AJOUT ETAPES
// =====================
addStepBtn?.addEventListener("click", () => {
  const type = gameType?.value;
  const count = parseInt(stepCount?.value || "1", 10);

  if (!type || !Number.isFinite(count) || count < 1) return;

  const mode = (modeOption && modeOption.style.display !== "none") ? modeOption.value : null;

  parcoursSteps.push({ type, mode, count });
  renderSteps();

  if (startParcoursBtn) startParcoursBtn.style.display = parcoursSteps.length > 0 ? "block" : "none";
  // preview dépend du parcours
  updatePreview();
});

function renderSteps() {
  if (!stepsList) return;

  stepsList.innerHTML = "";
  if (parcoursSteps.length === 0) {
    stepsList.innerHTML = "<div class='empty'>Ajoutez vos étapes !</div>";
    if (startParcoursBtn) startParcoursBtn.style.display = "none";
    return;
  }

  parcoursSteps.forEach((step, idx) => {
    let txt = `${gameNameLabel(step.type)}`;
    if (MODE_CAPABLE.has(step.type)) {
      txt += step.mode === "songs" ? " (Songs)" : " (Anime)";
    }
    txt += ` × ${step.count}`;

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
  updatePreview();
}

function removeStep(idx) {
  parcoursSteps.splice(idx, 1);
  renderSteps();
  if (startParcoursBtn) startParcoursBtn.style.display = parcoursSteps.length > 0 ? "block" : "none";
  updatePreview();
}

// =====================
// RECAP
// =====================
startParcoursBtn?.addEventListener("click", () => {
  if (!parcoursSteps.length) return;
  showRecapUI();
});

function showRecapUI() {
  showRecap();

  if (!recapList) return;
  recapList.innerHTML = "";

  parcoursSteps.forEach((step, i) => {
    let txt = `${gameNameLabel(step.type)} × ${step.count}`;
    if (MODE_CAPABLE.has(step.type)) {
      txt = `${gameNameLabel(step.type)} (${step.mode === "songs" ? "Songs" : "Anime"}) × ${step.count}`;
    }
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${txt}`;
    recapList.appendChild(li);
  });
}

editParcoursBtn?.addEventListener("click", () => {
  if (builderSection) builderSection.style.display = "block";
  if (recapSection) recapSection.style.display = "none";
});

// IMPORTANT : maintenant, ce bouton envoie vers la PERSONNALISATION (pas lancement direct)
launchConfirmedBtn?.addEventListener("click", () => {
  // on stocke les étapes maintenant
  localStorage.setItem(PARCOURS_STEPS_KEY, JSON.stringify(parcoursSteps));
  // ensuite on va vers la personnalisation globale
  showCustomization();
});

// =====================
// IFRAME FLOW
// =====================
function startIframeParcours() {
  // hide tout sauf iframe
  if (container) container.style.display = "none";
  if (customPanel) customPanel.style.display = "none";
  if (recapSection) recapSection.style.display = "none";

  document.body.classList.add("parcours-fullscreen");

  if (parcoursContainer) {
    parcoursContainer.style.display = "flex";
    parcoursContainer.classList.add("active");
  }

  if (parcoursScore) parcoursScore.style.display = "none";
  if (parcoursFinish) parcoursFinish.style.display = "none";

  parcoursScores = [];
  launchIframeStep(0);
}

function resolveStepMode(step) {
  if (!MODE_CAPABLE.has(step.type)) return null;
  return step.mode === "songs" ? "songs" : "anime";
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

  const m = resolveStepMode(step);
  if (m) params.set("mode", m); // anime|songs

  const url = `${urlBase}?${params.toString()}`;

  if (parcoursIframe) {
    parcoursIframe.style.display = "none";
    parcoursIframe.classList.remove("active");
  }
  if (parcoursLoader) parcoursLoader.style.display = "block";

  if (parcoursIframe) {
    parcoursIframe.onload = () => {
      if (parcoursLoader) parcoursLoader.style.display = "none";
      parcoursIframe.style.display = "block";
      parcoursIframe.classList.add("active");
    };
    parcoursIframe.src = url;
  }
}

// Les jeux doivent faire : parent.postMessage({parcoursScore:{label,score,total}}, "*")
window.addEventListener("message", (e) => {
  const payload = e?.data?.parcoursScore;
  if (!payload) return;

  parcoursScores.push(payload);

  const idx = parseInt(localStorage.getItem(PARCOURS_INDEX_KEY) || "0", 10) + 1;
  const steps = JSON.parse(localStorage.getItem(PARCOURS_STEPS_KEY) || "[]");

  if (idx < steps.length) {
    launchIframeStep(idx);
  } else {
    showFinalRecap();
  }
});

// =====================
// FINAL RECAP + CLEANUP
// =====================
function showFinalRecap() {
  localStorage.removeItem(PARCOURS_INPROGRESS_KEY);
  localStorage.removeItem(PARCOURS_INDEX_KEY);

  if (parcoursIframe) {
    parcoursIframe.style.display = "none";
    parcoursIframe.classList.remove("active");
  }
  if (parcoursLoader) parcoursLoader.style.display = "none";

  document.body.classList.remove("parcours-fullscreen");

  if (parcoursContainer) {
    parcoursContainer.style.display = "flex";
    parcoursContainer.classList.add("active");
  }
  if (parcoursScore) parcoursScore.style.display = "block";
  if (parcoursFinish) parcoursFinish.style.display = "block";

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

  if (parcoursScore) parcoursScore.innerHTML = html;
  if (parcoursFinish) {
    parcoursFinish.innerHTML = `<button onclick="window.location.href='../index.html'" class="toggle-btn">Retour menu</button>`;
  }
}

// =====================
// RESTORE (si reload pendant parcours)
// =====================
window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem(PARCOURS_INPROGRESS_KEY)) {
    if (confirm("Un Mode Parcours est en cours, continuer ?")) {
      if (customPanel) customPanel.style.display = "none";
      if (container) container.style.display = "none";
      startIframeParcours();
    } else {
      localStorage.removeItem(PARCOURS_INPROGRESS_KEY);
      localStorage.removeItem(PARCOURS_STEPS_KEY);
      localStorage.removeItem(PARCOURS_INDEX_KEY);
    }
  }
});

// =====================
// BOOT
// =====================
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

    initCustomPanel();

    // builder d'abord
    if (customPanel) customPanel.style.display = "none";
    if (container) container.style.display = "flex";
    if (builderSection) builderSection.style.display = "block";
    if (recapSection) recapSection.style.display = "none";

    refreshModeOptionUI();
    renderSteps();
    updatePreview();
  })
  .catch((e) => {
    if (previewCountEl) {
      previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
      previewCountEl.classList.add("bad");
    }
    if (applyFiltersBtn) {
      applyFiltersBtn.disabled = true;
      applyFiltersBtn.classList.add("disabled");
    }
    console.error(e);
  });
