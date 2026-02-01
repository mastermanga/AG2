/**********************
 * CLUE (avec timer) + PARCOURS
 * - 6 indices max visibles dès le début (2 colonnes)
 * - 1er indice révélé au lancement du round
 * - Ensuite :
 *   - mauvaise réponse => indice suivant (jusqu'à 6)
 *   - "Passer" => indice suivant sans tentative
 * - Défaite :
 *   - mauvaise réponse à 6/6
 *   - OU timer écoulé à 6/6
 * - Score: 3000 puis -500 par indice supplémentaire
 *
 * ✅ Parcours:
 *   - si ?parcours=1 => auto-start + cache bouton menu + postMessage score
 *   - filtres via URL params (pop/score/yearMin/yearMax/types/rounds) ou localStorage AG_parcours_filters
 *   - rounds fallback: localStorage.parcoursSteps[0].count (ton cas)
 **********************/

const MAX_SCORE = 3000;
const REVEAL_PENALTY = 500;
const MAX_REVEALS_PER_ROUND = 6;
const MIN_TITLES_TO_START = 64;

// ✅ TIMER
const GUESS_TIME_SEC = 10;
let timerInterval = null;
let timeLeft = GUESS_TIME_SEC;

// =======================
// PARCOURS (URL PARAMS + postMessage)
// =======================
const urlParams = new URLSearchParams(window.location.search);
const IS_PARCOURS = urlParams.get("parcours") === "1";

const PARAM_TYPES = urlParams.get("types"); // ex: "TV,Movie"
const PARAM_POP = urlParams.get("popPercent") || urlParams.get("pop") || urlParams.get("popularity");
const PARAM_SCORE = urlParams.get("scorePercent") || urlParams.get("score");
const PARAM_YMIN = urlParams.get("yearMin") || urlParams.get("yMin");
const PARAM_YMAX = urlParams.get("yearMax") || urlParams.get("yMax");
const PARAM_ROUNDS = urlParams.get("rounds") || urlParams.get("roundCount");

// même clé que ton Tournament
const PARCOURS_CFG_KEY = "AG_parcours_filters";

let parcoursSent = false;

function loadParcoursCfg() {
  try {
    const raw = localStorage.getItem(PARCOURS_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sendParcoursScore(score = 0, total = 1) {
  if (parcoursSent) return;
  parcoursSent = true;

  try {
    parent.postMessage(
      {
        parcoursScore: {
          label: "Clue",
          score,
          total,
        },
      },
      "*"
    );
  } catch (e) {
    console.warn("postMessage parcours failed:", e);
  }
}

// Anti-flash + cache bouton menu dès le départ (script chargé en bas => DOM présent)
if (IS_PARCOURS) {
  document.body.classList.add("game-started");

  const backBtn = document.getElementById("back-to-menu");
  if (backBtn) backBtn.style.display = "none";

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "none";

  const game = document.getElementById("game-panel");
  if (game) game.style.display = "block";
}

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
  return raw.replace(/\[.*?\]/g, "").replace(/MAL Rewrite/gi, "").replace(/\s+/g, " ").trim();
}

// =======================
// ✅ PARCOURS: fallback rounds depuis parcoursSteps[].count
// =======================
function getParcoursStepCountFallback() {
  // 1) URL ?rounds= / ?roundCount=
  if (PARAM_ROUNDS != null && PARAM_ROUNDS !== "") {
    const n = parseInt(PARAM_ROUNDS, 10);
    if (Number.isFinite(n)) return clampInt(n, 1, 100);
  }

  // 2) localStorage AG_parcours_filters (si tu l'utilises parfois)
  const cfg = loadParcoursCfg();
  const fromCfg = cfg?.rounds ?? cfg?.roundCount ?? cfg?.count;
  if (fromCfg != null && fromCfg !== "") {
    const n = parseInt(fromCfg, 10);
    if (Number.isFinite(n)) return clampInt(n, 1, 100);
  }

  // 3) localStorage.parcoursSteps[0].count  ✅ (ton cas)
  try {
    const raw = localStorage.getItem("parcoursSteps");
    if (raw) {
      const steps = JSON.parse(raw);
      if (Array.isArray(steps) && steps.length) {
        // On prend l'étape courante (souvent index 0)
        let stepObj = steps[0];

        // Si jamais le parent passe un identifiant, on tente de matcher, sinon on garde [0]
        const wanted =
          (urlParams.get("type") || urlParams.get("game") || urlParams.get("step") || "")
            .toLowerCase()
            .trim();

        if (wanted) {
          const found = steps.find(
            (s) => String(s?.type || "").toLowerCase().trim() === wanted
          );
          if (found) stepObj = found;
        }

        const c = parseInt(stepObj?.count, 10);
        if (Number.isFinite(c)) return clampInt(c, 1, 100);
      }
    }
  } catch {
    // ignore
  }

  return 1;
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
const clueStep = document.get

ElementById("clueStep");

// score bar
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

// ✅ timer DOM
const timerBadge = document.getElementById("timerBadge");
const timerVal = document.getElementById("timerVal");

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
  const penalty = Math.max(0, (revealsShown - 1) * REVEAL_PENALTY);
  return Math.max(MAX_SCORE - penalty, 0);
}

// ====== TIMER helpers ======
function renderTimer() {
  if (timerVal) timerVal.textContent = String(Math.max(0, timeLeft));
  if (timerBadge) timerBadge.classList.toggle("danger", timeLeft <= 3 && !gameEnded);
}

function stopGuessTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startGuessTimer() {
  stopGuessTimer();
  if (gameEnded) return;

  if (timerBadge) timerBadge.style.display = "inline-flex";

  timeLeft = GUESS_TIME_SEC;
  renderTimer();

  timerInterval = setInterval(() => {
    if (gameEnded) {
      stopGuessTimer();
      return;
    }

    timeLeft -= 1;
    renderTimer();

    if (timeLeft <= 0) {
      stopGuessTimer();

      if (revealsShown >= MAX_REVEALS_PER_ROUND) {
        timeoutLoseRound();
        return;
      }

      revealNextClue();
      feedback.textContent = "⏱️ Temps écoulé. Indice suivant.";
      feedback.className = "info";
      input.focus();
    }
  }, 1000);
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
let revealSequence = [];
let revealsShown = 0;
let gameEnded = false;

let globalPopRank = new Map();
let globalPopTotal = 0;

// =======================
// PARCOURS -> appliquer params à l’UI
// =======================
function applyParcoursParamsToUI() {
  const cfg = loadParcoursCfg();
  const has = (x) => x != null && x !== "";

  const trySetInt = (el, val, min, max) => {
    if (!el || !has(val)) return;
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return;
    el.value = String(Math.max(min, Math.min(max, n)));
  };

  // sliders (URL > localStorage)
  trySetInt(popEl, has(PARAM_POP) ? PARAM_POP : cfg?.popPercent, 5, 100);
  trySetInt(scoreEl, has(PARAM_SCORE) ? PARAM_SCORE : cfg?.scorePercent, 5, 100);
  trySetInt(yearMinEl, has(PARAM_YMIN) ? PARAM_YMIN : cfg?.yearMin, 1950, 2026);
  trySetInt(yearMaxEl, has(PARAM_YMAX) ? PARAM_YMAX : cfg?.yearMax, 1950, 2026);

  // ✅ rounds: URL > cfg > parcoursSteps[0].count
  if (roundCountEl) {
    const rr = getParcoursStepCountFallback();
    roundCountEl.value = String(rr);
  }

  // types pills (URL > localStorage)
  const typesList = has(PARAM_TYPES)
    ? PARAM_TYPES.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(cfg?.types)
    ? cfg.types
    : null;

  if (typesList && typesList.length) {
    const want = new Set(typesList);
    const pills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
    pills.forEach((p) => {
      const t = p.dataset.type;
      const on = want.has(t);
      p.classList.toggle("active", on);
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // clamp + refresh labels + preview
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

function parcoursAbort(message, score = 0, total = 1) {
  showGame();
  stopGuessTimer();
  gameEnded = true;

  const gameContainer = document.getElementById("container");
  if (!gameContainer) return;

  gameContainer.innerHTML = `
    <div style="width:100%;max-width:720px;text-align:center;">
      <div style="font-size:1.35rem;font-weight:900;opacity:0.95;margin-bottom:10px;">${message}</div>
      <button id="parcoursContinue" class="menu-btn" style="font-size:1.05rem;padding:0.85rem 1.6rem;">
        Continuer le parcours
      </button>
    </div>
  `;

  const btn = document.getElementById("parcoursContinue");
  if (btn) {
    btn.onclick = () => {
      btn.disabled = true;
      sendParcoursScore(score, total);
    };
  }
}

function startGameWithCurrentConfig() {
  filteredAnimes = applyFilters();

  if (filteredAnimes.length < MIN_TITLES_TO_START) {
    updatePreview();
    if (IS_PARCOURS) {
      parcoursAbort(
        `❌ Pool insuffisant : ${filteredAnimes.length} titres (min ${MIN_TITLES_TO_START}).`,
        0,
        1
      );
    }
    return;
  }

  // ✅ IMPORTANT: on ne force PLUS à 1 en parcours.
  totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);

  // si parcours et l'input est vide => fallback parcoursSteps
  if (IS_PARCOURS && (!roundCountEl.value || roundCountEl.value === "0")) {
    totalRounds = getParcoursStepCountFallback();
  }

  currentRound = 1;
  totalScore = 0;

  showGame();
  startNewRound();
}

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
  const top = Math.min(100, Math.max(5, Math.ceil(pct / 5) * 5));
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
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
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

  revealsShown = 0;
  revealSequence = [];

  initRevealGrid();
  setStepLabel();
  setScoreBar(MAX_SCORE);

  stopGuessTimer();
  timeLeft = GUESS_TIME_SEC;
  renderTimer();
  if (timerBadge) timerBadge.style.display = "inline-flex";
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

  if (revealsShown >= MAX_REVEALS_PER_ROUND) passBtn.disabled = true;

  startGuessTimer();
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
  const pool = buildRevealPool(currentAnime);

  revealSequence = pool.slice(0, MAX_REVEALS_PER_ROUND);

  revealNextClue();
}

// ====== End round ======
function endRound(roundScore, won, messageHtml) {
  stopGuessTimer();
  gameEnded = true;

  input.disabled = true;
  submitBtn.disabled = true;
  passBtn.disabled = true;
  suggestions.innerHTML = "";

  if (timerBadge) timerBadge.style.display = "none";

  setScoreBar(roundScore);

  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  const isLast = currentRound >= totalRounds;

  restartBtn.style.display = "inline-block";

  if (!isLast) {
    restartBtn.textContent = "Round suivant";
    restartBtn.disabled = false;
    restartBtn.onclick = () => {
      currentRound += 1;
      startNewRound();
    };
    return;
  }

  if (IS_PARCOURS) {
    const totalMax = totalRounds * MAX_SCORE;
    feedback.innerHTML = messageHtml + `<br><br>Score total : <b>${totalScore}</b> / <b>${totalMax}</b>`;

    restartBtn.textContent = "Continuer le parcours";
    restartBtn.disabled = false;
    restartBtn.onclick = () => {
      restartBtn.disabled = true;
      sendParcoursScore(totalScore, totalMax);
    };
  } else {
    restartBtn.textContent = "Voir le score total";
    restartBtn.disabled = false;
    restartBtn.onclick = () => showFinalRecap();
  }
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

function timeoutLoseRound() {
  const msg = `⏱️ Temps écoulé…<br>Réponse : <b>${currentAnime._title}</b><br>Score : <b>0</b> / ${MAX_SCORE}`;
  endRound(0, false, msg);
}

function showFinalRecap() {
  const gameContainer = document.getElementById("container");
  const totalMax = totalRounds * MAX_SCORE;

  if (IS_PARCOURS) {
    gameContainer.innerHTML = `
      <div style="width:100%;max-width:720px;text-align:center;">
        <div style="font-size:1.35rem;font-weight:900;opacity:0.95;margin-bottom:10px;">🏁 Terminé !</div>
        <div style="font-size:1.15rem;font-weight:900;margin-bottom:14px;">
          Score total : <b>${totalScore}</b> / <b>${totalMax}</b>
        </div>
        <button id="parcoursContinue" class="menu-btn" style="font-size:1.05rem;padding:0.85rem 1.6rem;">
          Continuer le parcours
        </button>
      </div>
    `;
    document.getElementById("parcoursContinue").onclick = (e) => {
      e.currentTarget.disabled = true;
      sendParcoursScore(totalScore, totalMax);
    };
    return;
  }

  gameContainer.innerHTML = `
    <div style="width:100%;max-width:720px;text-align:center;">
      <div style="font-size:1.35rem;font-weight:900;opacity:0.95;margin-bottom:10px;">🏆 Série terminée !</div>
      <div style="font-size:1.15rem;font-weight:900;margin-bottom:14px;">
        Score total : <b>${totalScore}</b> / <b>${totalMax}</b>
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

  stopGuessTimer();

  const g = normalizeGuess(guess);
  const acceptable = currentAnime._titlesNorm || [];
  const ok = acceptable.includes(g);

  if (ok) {
    winRound();
    return;
  }

  if (revealsShown >= MAX_REVEALS_PER_ROUND) {
    feedback.textContent = "❌ Mauvaise réponse. Fin du round.";
    feedback.className = "error";
    loseRound();
    return;
  }

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

  stopGuessTimer();
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

  const titles = [...new Set(filteredAnimes.map((a) => a._title))];
  const matches = titles.filter((t) => t.toLowerCase().includes(val)).slice(0, 7);

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

  previewCountEl.textContent = `📚 Titres disponibles : ${count} (${ok ? "OK" : "Min 64"})`;
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

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));

  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", startGameWithCurrentConfig);

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

    // Pré-calcul popularité globale
    const sortedByMembers = [...allAnimes].sort((a, b) => b._members - a._members);
    globalPopTotal = sortedByMembers.length;
    globalPopRank = new Map();
    sortedByMembers.forEach((a, i) => globalPopRank.set(a, i + 1));

    initCustomUI();
    updatePreview();

    if (IS_PARCOURS) {
      applyParcoursParamsToUI();
      startGameWithCurrentConfig();
    } else {
      showCustomization();
    }
  })
  .catch((e) => alert("Erreur chargement dataset: " + e));
