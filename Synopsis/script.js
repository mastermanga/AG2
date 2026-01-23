/**********************
 * CLUE (sans timer)
 * - 6 indices max visibles dès le début (2 colonnes)
 * - 1er indice révélé au lancement du round
 * - Ensuite :
 *   - mauvaise réponse => indice suivant (jusqu'à 6)
 *   - "Passer" => indice suivant sans tentative
 * - Défaite seulement si mauvaise réponse à 6/6
 * - Score: 3000 puis -500 par indice supplémentaire
 * - Indices possibles: Synopsis(3 mots), saison, studio, genres, thèmes,
 *   score, popularité (Top %), personnage, épisodes
 **********************/

const MAX_SCORE = 3000;
const REVEAL_PENALTY = 500;
const MAX_REVEALS_PER_ROUND = 6;
const MIN_TITLES_TO_START = 64;

// ====== UI: menu + theme ======
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

// ====== Helpers ======
function stripAccents(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeGuess(str) {
  return stripAccents(String(str || "").toLowerCase())
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function getAllAcceptableTitles(a) {
  const set = new Set();
  const push = (s) => {
    if (typeof s === "string" && s.trim()) set.add(s.trim());
  };
  push(a.title_english);
  push(a.title_mal_default);
  push(a.title_original);
  push(a.title);
  if (a.animethemes && a.animethemes.name) push(a.animethemes.name);
  return [...set];
}

function getYear(a) {
  const s = (a.season || "").trim();
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

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cleanSynopsis(s) {
  const raw = String(s || "");
  return raw
    .replace(/\[.*?\]/g, "")
    .replace(/MAL Rewrite/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ====== DOM refs ======
const customPanel = document.getElementById("custom-panel");
const gamePanel = document.getElementById("game-panel");

const popEl = document.getElementById("popPercent");
const scoreEl = document.getElementById("scorePercent");
const yearMinEl = document.getElementById("yearMin");
const yearMaxEl = document.getElementById("yearMax");

const popValEl = document.getElementById("popPercentVal");
const scoreValEl = document.getElementById("scorePercentVal");
const yearMinValEl = document.getElementById("yearMinVal");
const yearMaxValEl = document.getElementById("yearMaxVal");

const previewCountEl = document.getElementById("previewCount");
const applyBtn = document.getElementById("applyFiltersBtn");
const roundCountEl = document.getElementById("roundCount");

const feedback = document.getElementById("feedback");
const input = document.getElementById("characterInput");
const submitBtn = document.getElementById("submit-btn");
const passBtn = document.getElementById("pass-btn");
const restartBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");
const roundLabel = document.getElementById("roundLabel");

const revealList = document.getElementById("revealList");
const clueStep = document.getElementById("clueStep");

// score bar
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

// ====== UI show/hide ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== Slider fill helper ======
function setRangePct(el) {
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || "0");
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty("--pct", `${Math.max(0, Math.min(100, pct))}%`);
}

// ====== Score bar ======
function getScoreBarColor(score) {
  if (score >= 2500) return "linear-gradient(90deg,#70ffba,#3b82f6 90%)";
  if (score >= 1500) return "linear-gradient(90deg,#fff96a,#ffc34b 90%)";
  if (score >= 1000) return "linear-gradient(90deg,#ffb347,#fd654c 90%)";
  if (score > 0) return "linear-gradient(90deg,#fd654c,#cb202d 90%)";
  return "linear-gradient(90deg,#444,#333 90%)";
}

function setScoreBar(score) {
  const s = Math.max(0, Math.min(MAX_SCORE, score));
  const pct = Math.max(0, Math.min(100, (s / MAX_SCORE) * 100));
  scoreBar.style.width = pct + "%";
  scoreBar.style.background = getScoreBarColor(s);
  scoreBarLabel.textContent = `${s} / ${MAX_SCORE}`;
}

function currentPotentialScore() {
  // 1 indice => 3000 ; 2 => 2500 ; ...
  const penalty = Math.max(0, (revealsShown - 1) * REVEAL_PENALTY);
  return Math.max(MAX_SCORE - penalty, 0);
}

// ====== Data ======
let allAnimes = [];
let filteredAnimes = [];

// ====== Session ======
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentAnime = null;
let revealSequence = [];   // exactement 6 items (random, sans doublon)
let revealsShown = 0;      // nombre d’indices déjà révélés

let gameEnded = false;

let globalPopRank = new Map(); // Map<animeObject, rank>
let globalPopTotal = 0;


// ====== Stopwords / extraction "3 mots" ======
const STOP = new Set([
  "a","à","au","aux","avec","ce","ces","cet","cette","dans","de","des","du","elle","en","et","eux","il","ils",
  "je","la","le","les","leur","leurs","lui","ma","mais","me","mes","moi","mon","ne","nos","notre","nous",
  "on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu",
  "un","une","vos","votre","vous","y","d","l","s","c","t","j",
  "ainsi","alors","après","avant","aussi","bien","car","cependant","comme","contre","donc","encore","ensuite",
  "entre","ici","là","malgré","moins","plus","peu","plutôt","puis","quand","sans","selon","sous","tant",
  "toute","toutes","tout","tous","très","vers","souvent","toujours","désormais",
  "être","est","sont","étaient","était","été","sera","serait","avoir","a","ont","avait","fait","faire",
  "peut","peuvent","doit","doivent","va","vont","vient","venir","reste","rester","devient","devenir",
  "semble","sembler","continue","continuer","commence","commencer","finit","finir",
  "passe","passer","poursuit","poursuivre","cherche","chercher","trouve","trouver",
  "découvre","découvrir","produit","produire","renvoie","renvoyer","retrouve","retrouver",
  "histoire","monde","vie","temps","gens","personne","personnes","chose","choses","jour","jours"
]);

const DET_OR_PREP = new Set([
  "le","la","les","un","une","des","du","de","d","l","ce","cet","cette","ces",
  "mon","ma","mes","son","sa","ses","notre","nos","votre","vos","leur","leurs",
  "de","d","du","des","en","dans","sur","sous","avec","sans","pour","contre","vers","chez","a","à","au","aux"
]);

function preprocessForTokenize(text) {
  return String(text || "")
    .replace(/(\b(?:l|d|j|t|m|n|s|c|qu|jusqu|lorsqu|puisqu|quoiqu))['’](?=[A-Za-zÀ-ÖØ-öø-ÿœæŒÆ])/gi, "$1' ");
}

function tokenizeWords(text) {
  const t = preprocessForTokenize(text);
  return t.match(/[A-Za-zÀ-ÖØ-öø-ÿœæŒÆ]+/g) || [];
}

function buildTitleBlockSet(anime) {
  const titles = anime._titlesAll || [anime._title].filter(Boolean);
  const set = new Set();
  for (const tt of titles) {
    const n = normalizeGuess(tt);
    n.split(" ").forEach(w => {
      if (w && w.length >= 4) set.add(w);
    });
  }
  if (anime.animethemes && anime.animethemes.name) {
    const n = normalizeGuess(anime.animethemes.name);
    n.split(" ").forEach(w => { if (w && w.length >= 4) set.add(w); });
  }
  return set;
}

function extractProperNounPhrases(originalSynopsis) {
  const text = String(originalSynopsis || "");
  const re = /\b[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ][A-Za-zÀ-ÖØ-öø-ÿœæŒÆ-]{2,}(?:\s+[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ][A-Za-zÀ-ÖØ-öø-ÿœæŒÆ-]{2,})?\b/g;
  const matches = text.match(re) || [];

  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const k = normalizeGuess(m);
    if (!k || k.length < 4) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m.trim());
  }
  return out;
}

function pick3WordClue(anime) {
  const syn = cleanSynopsis(anime.synopsis || "");
  const titleBlock = buildTitleBlockSet(anime);

  const proper = extractProperNounPhrases(anime.synopsis || "")
    .filter(p => {
      const k = normalizeGuess(p);
      if (!k || k.length < 4) return false;
      if (STOP.has(k)) return false;
      for (const w of titleBlock) {
        if (k.includes(w)) return false;
      }
      return true;
    });

  const words = tokenizeWords(syn);
  const norms = words.map(w => normalizeGuess(w));
  const counts = new Map();

  for (let i = 0; i < norms.length; i++) {
    const w = norms[i];
    if (!w || w.length < 4) continue;
    if (STOP.has(w)) continue;
    if (titleBlock.has(w)) continue;

    const prev = norms[i - 1] || "";
    if (!DET_OR_PREP.has(prev)) continue;

    counts.set(w, (counts.get(w) || 0) + 1);
  }

  const nounish = [...counts.entries()]
    .sort((a,b) => (b[1]-a[1]) || (b[0].length - a[0].length))
    .map(([k]) => k);

  const clue = [];
  for (const p of proper) {
    if (clue.length >= 2) break;
    clue.push(p);
  }
  for (const n of nounish) {
    if (clue.length >= 3) break;
    if (clue.some(x => normalizeGuess(x) === n)) continue;
    clue.push(n);
  }
  while (clue.length < 3) clue.push("----");
  return clue.slice(0, 3);
}

// ====== Indices pool ======
const SEASON_FR = {
  "winter": "Hiver",
  "spring": "Printemps",
  "summer": "Été",
  "fall": "Automne",
  "autumn": "Automne"
};

function formatSeason(seasonStr) {
  const s = String(seasonStr || "").trim();
  if (!s) return "";
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const key = parts[0].toLowerCase();
  const y = parts[1];
  const fr = SEASON_FR[key] || parts[0];
  return `${fr} ${y}`;
}

function computePopularityTopPercent(anime) {
  const rank = globalPopRank.get(anime);
  if (!rank || !globalPopTotal) return "";

  const pct = (rank / globalPopTotal) * 100;
  const top = Math.min(100, Math.max(5, Math.ceil(pct / 5) * 5)); // arrondi par 5%
  return `Top ${top}%`;
}


function pickRandomCharacterName(anime) {
  const a = Array.isArray(anime.characters) ? anime.characters : [];
  const b = Array.isArray(anime.top_characters) ? anime.top_characters : [];
  const pool = [...a, ...b]
    .map(x => String(x?.name || "").trim())
    .filter(n => n.length >= 3);
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildRevealPool(anime) {
  const items = [];

  const syn = cleanSynopsis(anime.synopsis || "");
  if (syn.length >= 40) {
    items.push({ kind: "SYNOPSIS", label: "Synopsis", value: pick3WordClue(anime) });
  }

  const season = formatSeason(anime.season);
  if (season) items.push({ kind: "SEASON", label: "Saison", value: season });

  if (anime.studio && String(anime.studio).trim()) {
    items.push({ kind: "STUDIO", label: "Studio", value: String(anime.studio).trim() });
  }

  if (Array.isArray(anime.genres) && anime.genres.length) {
    const g = anime.genres.slice(0, 4).map(x => String(x).trim()).filter(Boolean);
    if (g.length) items.push({ kind: "GENRES", label: "Genres", value: g });
  }

  if (Array.isArray(anime.themes) && anime.themes.length) {
    const t = anime.themes.slice(0, 4).map(x => String(x).trim()).filter(Boolean);
    if (t.length) items.push({ kind: "THEMES", label: "Thèmes", value: t });
  }

  const sc = Number.isFinite(+anime.score) ? +anime.score : 0;
  if (sc > 0) items.push({ kind: "SCORE", label: "Score", value: sc.toFixed(2) });

  const topPct = computePopularityTopPercent(anime);
  if (topPct) items.push({ kind: "POPULARITY", label: "Popularité", value: topPct });

  const ch = pickRandomCharacterName(anime);
  if (ch) items.push({ kind: "CHAR", label: "Personnage", value: ch });

  const ep = Number.isFinite(+anime.episodes) ? +anime.episodes : 0;
  if (ep > 0) items.push({ kind: "EPS", label: "Épisodes", value: ep });

  // sécurité: si dataset manque des champs, on complète pour atteindre 6
  const fallbacks = [
    { kind: "TYPE", label: "Type", value: String(anime.type || "").trim() },
    { kind: "STATUS", label: "Statut", value: String(anime.status || "").trim() },
    { kind: "DURATION", label: "Durée", value: String(anime.duration || "").trim() },
  ];
  for (const fb of fallbacks) {
    if (items.length >= 6) break;
    if (!fb.value) continue;
    if (items.some(x => x.kind === fb.kind)) continue;
    items.push(fb);
  }

  shuffleInPlace(items);
  return items;
}

// ====== Reveal UI (6 slots fixes) ======
let slots = [];

function initRevealGrid() {
  revealList.innerHTML = "";
  slots = [];

  for (let i = 0; i < MAX_REVEALS_PER_ROUND; i++) {
    const slot = document.createElement("div");
    slot.className = "reveal-slot empty";
    slot.dataset.idx = String(i);

    const tag = document.createElement("div");
    tag.className = "reveal-tag";
    tag.textContent = `Indice ${i + 1}`;

    const body = document.createElement("div");
    body.className = "reveal-body";
    body.innerHTML = `<span class="reveal-dash">—</span>`;

    slot.appendChild(tag);
    slot.appendChild(body);
    revealList.appendChild(slot);
    slots.push(slot);
  }
}

function setStepLabel() {
  clueStep.textContent = `${Math.min(revealsShown, MAX_REVEALS_PER_ROUND)} / ${MAX_REVEALS_PER_ROUND}`;
}

function renderValue(value) {
  if (Array.isArray(value)) {
    // synopsis 3 mots ou genres etc
    return value.filter(Boolean).join(", ");
  }
  return String(value ?? "").trim();
}

function fillSlot(idx, item) {
  const slot = slots[idx];
  if (!slot) return;

  slot.className = `reveal-slot kind-${item.kind}`;
  const tag = slot.querySelector(".reveal-tag");
  const body = slot.querySelector(".reveal-body");

  if (tag) tag.textContent = item.label;

  const v = renderValue(item.value);
  body.textContent = v || "—";
}

// ====== Game flow ======
function resetRoundUI() {
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  feedback.textContent = "";
  feedback.className = "";

  gameEnded = false;

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;
  passBtn.disabled = false;

  suggestions.innerHTML = "";

  restartBtn.style.display = "none";
  restartBtn.textContent = (currentRound < totalRounds) ? "Round suivant" : "Voir le score total";

  revealsShown = 0;
  revealSequence = [];

  initRevealGrid();
  setStepLabel();
  setScoreBar(MAX_SCORE);
}

function revealNextClue() {
  if (gameEnded) return;
  if (revealsShown >= MAX_REVEALS_PER_ROUND) return;

  const item = revealSequence[revealsShown];
  if (!item) return;

  fillSlot(revealsShown, item);
  revealsShown += 1;

  setStepLabel();
  setScoreBar(currentPotentialScore());

  // si on est à 6, on empêche "Passer" (mais on peut encore guess)
  if (revealsShown >= MAX_REVEALS_PER_ROUND) {
    passBtn.disabled = true;
  }
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
  const pool = buildRevealPool(currentAnime);

  // on garantit exactement 6 items différents
  // (pool est déjà shufflé)
  revealSequence = pool.slice(0, MAX_REVEALS_PER_ROUND);

  // 1er indice direct
  revealNextClue();
}

// ====== End round ======
function endRound(roundScore, won, messageHtml) {
  gameEnded = true;

  input.disabled = true;
  submitBtn.disabled = true;
  passBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);

  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  restartBtn.style.display = "inline-block";
  restartBtn.textContent = (currentRound < totalRounds) ? "Round suivant" : "Voir le score total";

  restartBtn.onclick = () => {
    if (currentRound >= totalRounds) {
      showFinalRecap();
    } else {
      currentRound += 1;
      startNewRound();
    }
  };
}

function winRound() {
  const score = currentPotentialScore();
  if (score > 0) launchFireworks();

  const msg = `🎉 Bonne réponse !<br><b>${currentAnime._title}</b><br>Score : <b>${score}</b> / ${MAX_SCORE}`;
  endRound(score, true, msg);
}

function loseRound() {
  const msg = `❌ Raté…<br>Réponse : <b>${currentAnime._title}</b><br>Score : <b>0</b> / ${MAX_SCORE}`;
  endRound(0, false, msg);
}

function showFinalRecap() {
  const gameContainer = document.getElementById("container");
  gameContainer.innerHTML = `
    <div style="width:100%;max-width:720px;text-align:center;">
      <div style="font-size:1.35rem;font-weight:900;opacity:0.95;margin-bottom:10px;">🏆 Série terminée !</div>
      <div style="font-size:1.15rem;font-weight:900;margin-bottom:14px;">
        Score total : <b>${totalScore}</b> / <b>${totalRounds * MAX_SCORE}</b>
      </div>
      <button id="backToSettings" class="menu-btn" style="font-size:1.05rem;padding:0.85rem 1.6rem;">
        Retour réglages
      </button>
    </div>
  `;
  document.getElementById("backToSettings").onclick = () => window.location.reload();
}

// ====== Guess logic ======
function checkGuess() {
  if (!currentAnime || gameEnded) return;

  const guess = input.value.trim();
  if (!guess) {
    feedback.textContent = "⚠️ Tu dois écrire un nom d'anime.";
    feedback.className = "error";
    return;
  }

  const g = normalizeGuess(guess);
  const acceptable = currentAnime._titlesNorm || [];
  const ok = acceptable.includes(g);

  if (ok) {
    winRound();
    return;
  }

  // mauvaise réponse
  if (revealsShown >= MAX_REVEALS_PER_ROUND) {
    // à 6/6 -> lose
    feedback.textContent = "❌ Mauvaise réponse. Fin du round.";
    feedback.className = "error";
    loseRound();
    return;
  }

  // sinon, on débloque l'indice suivant
  revealNextClue();
  feedback.textContent = "❌ Mauvaise réponse. Indice suivant débloqué.";
  feedback.className = "info";

  input.select();
  input.focus();
}

submitBtn.addEventListener("click", checkGuess);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) checkGuess();
});

// ====== Pass ======
passBtn.addEventListener("click", () => {
  if (gameEnded) return;
  if (revealsShown >= MAX_REVEALS_PER_ROUND) return;

  revealNextClue();
  feedback.textContent = "⏭️ Indice suivant.";
  feedback.className = "info";
  input.focus();
});

// ====== Autocomplete ======
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  if (!val) {
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = false;
  feedback.textContent = "";
  feedback.className = "";

  const titles = [...new Set(filteredAnimes.map(a => a._title))];
  const matches = titles.filter(t => t.toLowerCase().includes(val)).slice(0, 7);

  matches.forEach((title) => {
    const div = document.createElement("div");
    div.innerHTML = `<span>${title.replace(new RegExp(val, "i"), (m) => `<b>${m}</b>`)}</span>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = title;
      suggestions.innerHTML = "";
      submitBtn.disabled = false;
      input.focus();
    });
    suggestions.appendChild(div);
  });
});

// ====== Tooltip ======
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

// ====== Filters ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  let pool = allAnimes.filter((a) => {
    return (
      a._year >= yearMin &&
      a._year <= yearMax &&
      allowedTypes.includes(a._type) &&
      typeof a.synopsis === "string" &&
      cleanSynopsis(a.synopsis).length >= 40
    );
  });

  if (pool.length === 0) return [];

  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

// ====== Preview ======
function updatePreview() {
  const pool = applyFilters();
  const count = pool.length;
  const ok = count >= MIN_TITLES_TO_START;

  previewCountEl.textContent = `🧩 Titres disponibles : ${count} (${ok ? "OK" : "Min 64"})`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
  applyBtn.setAttribute("aria-disabled", (!ok).toString());
}

// ====== init UI ======
function initCustomUI() {
  function syncLabels() {
    clampYearSliders();

    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;

    setRangePct(popEl);
    setRangePct(scoreEl);
    setRangePct(yearMinEl);
    setRangePct(yearMaxEl);

    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) =>
    el.addEventListener("input", syncLabels)
  );

  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    filteredAnimes = applyFilters();
    if (filteredAnimes.length < MIN_TITLES_TO_START) {
      updatePreview();
      return;
    }

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Fireworks ======
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

// ====== Load dataset ======
fetch("../data/licenses_only.json")
  .then((r) => r.json())
  .then((data) => {
    allAnimes = (Array.isArray(data) ? data : []).map((a) => {
      const title = getDisplayTitle(a);
      const titlesAll = getAllAcceptableTitles(a);
      const titlesNorm = titlesAll.map(normalizeGuess);

      return {
        ...a,
        _title: title,
        _titlesAll: titlesAll,
        _titlesNorm: titlesNorm,
        _year: getYear(a),
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
      };
    });

    // === Pré-calcul popularité globale (base complète) ===
    const sortedByMembers = [...allAnimes].sort((a, b) => b._members - a._members);
    globalPopTotal = sortedByMembers.length;
    globalPopRank = new Map();
    sortedByMembers.forEach((a, i) => globalPopRank.set(a, i + 1));

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
