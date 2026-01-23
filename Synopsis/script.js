/**********************
 * Synopsis (mots-clés)
 * - Dataset: ../data/licenses_only.json (synopsis FR recommandé)
 * - 3 étapes: Hardcore -> Moyen -> Facile
 * - Hardcore: concepts très généraux (pas tout le synopsis)
 * - Moyen: concepts + 2-3 mots plus proches (vagues)
 * - Facile: vrais termes + 1 seul nom fort secondaire (si trouvé)
 * - Le synopsis complet s'affiche UNIQUEMENT au reveal (win/lose)
 * - Min 64 titres
 **********************/

const MAX_SCORE = 3000;
const STAGE_SCORES = [3000, 2000, 1000];
const STAGE_LABELS = ["Hardcore", "Moyen", "Facile"];
const MIN_TITLES_TO_START = 64;

// ===== UI menu + theme =====
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

// ===== Helpers dataset =====
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
function getTitleVariants(a) {
  const arr = [
    a.title_english,
    a.title_mal_default,
    a.title_original,
    a.title,
    a.animethemes && a.animethemes.name
  ].filter(Boolean);
  return Array.from(new Set(arr.map(s => String(s).trim()).filter(Boolean)));
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
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ===== DOM refs =====
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
const restartBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");
const roundLabel = document.getElementById("roundLabel");

const synopsisBadgeEl = document.getElementById("synopsisBadge");
const synopsisStepEl = document.getElementById("synopsisStep");
const keywordsWrapEl = document.getElementById("keywordsWrap");

// score bar
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

// ===== Data =====
let allAnimes = [];
let filteredAnimes = [];

// Autocomplete cache
let titlesList = [];
let titlesLowerSet = new Set();

// Cache: stages + full synopsis
const stageCache = new Map(); // key -> { stages:[[...],[...],[...]], strongName:string|null, full:string }
let fullSynopsisClean = "";

// ===== Session =====
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ===== Round state =====
let currentAnime = null;
let stageIndex = 0;
let stageKeywords = [[], [], []];
let strongNameUsed = null;
let gameEnded = false;

// ===== UI helpers =====
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}
function setRangePct(el) {
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || "0");
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty("--pct", `${Math.max(0, Math.min(100, pct))}%`);
}
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
function safeHTML(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ===== Text cleaning =====
function basicCleanSynopsis(text) {
  let t = (text || "").replace(/\r/g, "").trim();
  t = t.replace(/\[\s*(?:Écrit|Ecrit)\s+par\s+MAL\s+Rewrite\s*\]/giu, "");
  t = t.replace(/\[\s*Written\s+by\s+MAL\s+Rewrite\s*\]/giu, "");
  t = t.replace(/\[\s*(?:Écrit|Ecrit)\s+par[^\]]*\]/giu, "");
  t = t.replace(/\[\s*Written\s+by[^\]]*\]/giu, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

// ===== Stopwords FR (compact mais efficace) =====
const STOP_FR = new Set([
  "a","à","alors","après","assez","au","aucun","aucune","aucuns","aussi","autre","autres","aux","avec","avoir","beaucoup","bien",
  "ce","ces","cet","cette","ceux","chaque","chez","comme","comment","contre","côté","dans","de","des","depuis","devant","doit",
  "donc","du","elle","elles","en","encore","entre","est","et","eux","faire","fait","fois","font","hors","ici","il","ils","je",
  "juste","la","le","les","leur","leurs","lors","lorsque","lui","ma","mais","me","même","mes","moi","moins","mon","ne","nos",
  "notre","nous","on","or","ou","où","par","pas","pendant","peu","plus","pour","pourquoi","près","qu","que","qui","quoi","sa",
  "sans","se","ses","seulement","si","son","sont","sous","sur","ta","tes","toi","ton","tous","tout","toute","toutes","très",
  "tu","un","une","vos","votre","vous","y","d","l","c","s","t","m","n"
]);

function normalizeWord(w) {
  return (w || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'")
    .replace(/[^a-z0-9'-]/g, "");
}

function wordsFromTitle(title) {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map(normalizeWord)
    .filter(w => w.length >= 4 && !STOP_FR.has(w));
}

function buildTitleBanSet(variants) {
  const out = new Set();
  for (const v of (variants || [])) {
    for (const w of wordsFromTitle(v)) out.add(w);
  }
  return out;
}

function buildTopCharactersBanSet(anime) {
  const out = new Set();
  const chars = Array.isArray(anime.top_characters) ? anime.top_characters : [];
  for (const c of chars) {
    const name = String(c && c.name ? c.name : "").trim();
    if (!name) continue;
    // split "Nom, Prénom" or "Prénom Nom"
    const parts = name.split(/[,\s]+/).map(p => normalizeWord(p)).filter(Boolean);
    for (const p of parts) if (p.length >= 3) out.add(p);
  }
  return out;
}

// ===== Proper nouns extraction (for "nom fort") =====
function extractProperNounCandidates(text) {
  const t = String(text || "");
  if (!t) return [];

  const candidates = new Set();

  // Acronyms (SERN, etc.)
  const acr = t.match(/\b[A-Z]{2,}\b/g);
  if (acr) acr.forEach(x => candidates.add(x.trim()));

  // Capitalized words not at start of sentence
  const sentences = t.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean);
    for (let i = 1; i < words.length; i++) {
      const raw = words[i].replace(/^[("«”'’]+|[)"»”'’.,;:!?]+$/g, "");
      if (!raw) continue;
      if (/^[A-ZÀ-ÖØ-Ý]/.test(raw) && raw.length >= 3) {
        // accept "Koudo", "Ikusei", "SERN", "B-Komachi" etc.
        candidates.add(raw);
      }
    }
  }

  return Array.from(candidates);
}

// ===== Keyword extraction (unigrams + bigrams) =====
function tokenizeForKeywords(text) {
  const t = String(text || "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\n\r]+/g, " ")
    .replace(/[“”«»]/g, '"');

  // Keep letters, digits, apostrophe, hyphen
  const rawTokens = t.split(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9'’-]+/).filter(Boolean);

  const tokens = rawTokens
    .map(tok => tok.replace(/’/g, "'"))
    .filter(tok => tok.length >= 3);

  return tokens;
}

function isLikelyProperNounToken(tok) {
  // Acronym or Capitalized
  return /^[A-Z]{2,}$/.test(tok) || /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}$/.test(tok);
}

function extractTopKeywords(text, { titleBan, charBan, allowProperNouns, max = 18 } = {}) {
  const tokens = tokenizeForKeywords(text);
  const counts = new Map();
  const bigrams = new Map();

  // unigrams
  for (const tok of tokens) {
    const n = normalizeWord(tok);
    if (!n || n.length < 4) continue;
    if (STOP_FR.has(n)) continue;
    if (titleBan && titleBan.has(n)) continue;
    if (charBan && charBan.has(n)) continue;

    if (!allowProperNouns && isLikelyProperNounToken(tok)) continue;

    counts.set(n, (counts.get(n) || 0) + 1);
  }

  // bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i + 1];
    const na = normalizeWord(a), nb = normalizeWord(b);
    if (!na || !nb) continue;
    if (na.length < 4 || nb.length < 4) continue;
    if (STOP_FR.has(na) || STOP_FR.has(nb)) continue;
    if (titleBan && (titleBan.has(na) || titleBan.has(nb))) continue;
    if (charBan && (charBan.has(na) || charBan.has(nb))) continue;

    if (!allowProperNouns && (isLikelyProperNounToken(a) || isLikelyProperNounToken(b))) continue;

    const key = `${na} ${nb}`;
    bigrams.set(key, (bigrams.get(key) || 0) + 1);
  }

  // score: frequency + length bonus + bigram bonus
  const scored = [];

  counts.forEach((v, k) => {
    let score = v * 2 + Math.min(3, Math.floor(k.length / 6));
    // small penalty for overly generic words
    if (["histoire","personne","gens","monde","jour","temps","vie","groupe"].includes(k)) score -= 2;
    scored.push({ text: k, score });
  });

  bigrams.forEach((v, k) => {
    let score = v * 3 + 2; // bigrams are helpful
    scored.push({ text: k, score });
  });

  scored.sort((x, y) => y.score - x.score);

  // normalize display: keep original-ish casing (first letter)
  const out = [];
  const seen = new Set();
  for (const item of scored) {
    if (out.length >= max) break;
    const key = item.text;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

// ===== Concept tags (Hardcore = super général) =====
function deriveConceptTags(text) {
  const t = normalizeWord(String(text || "")).replace(/'/g, " ");
  const tags = new Set();

  const add = (cond, tag) => { if (cond) tags.add(tag); };

  add(/secret|myster|verit|cache/.test(t), "secret");
  add(/mensong|mentir|tromp/.test(t), "mensonges");
  add(/enquet|decouvr|verif|piste/.test(t), "enquête");
  add(/venge|revanche/.test(t), "vengeance");
  add(/mort|meurt|assassin|tue|deces/.test(t), "morts suspectes");
  add(/danger|menace|traque|surveil/.test(t), "danger");
  add(/organisation|groupe|agence|mysterieu/.test(t), "organisation");
  add(/conflit|guerre|combat|bataill/.test(t), "conflit");
  add(/voyage|periple|route|chemin/.test(t), "voyage");
  add(/objectif|but|quete|reussir|atteindre/.test(t), "quête");
  add(/trahison|manipul|strategie/.test(t), "stratégie");
  add(/amiti|equipe|compagn|allie/.test(t), "alliés");
  add(/famill|proche|aime/.test(t), "proches");
  add(/regret|souvenir|memoire/.test(t), "regrets");
  add(/temps|passe|futur|chronolog|ligne/.test(t), "temps");
  add(/ecole|lycee|classe|etudiant/.test(t), "classement");
  add(/divertissement|idol|acteur|actrice|scene|celebrite/.test(t), "célébrité");
  add(/pouvoir|magie|alchim|sort/.test(t), "pouvoir");
  add(/monstre|creature|demon|titan/.test(t), "menace");

  return Array.from(tags);
}

// ===== Choose "nom fort" secondaire (Facile only) =====
function chooseSecondaryStrongName(anime, synopsis, titleBan, charBan) {
  const cands = extractProperNounCandidates(synopsis);

  // Build a ban list from title words (normalized) + top characters (normalized)
  const bannedNorm = new Set();
  if (titleBan) titleBan.forEach(x => bannedNorm.add(x));
  if (charBan) charBan.forEach(x => bannedNorm.add(x));

  // Also ban pieces of the main displayed title
  for (const w of wordsFromTitle(anime._title || "")) bannedNorm.add(w);

  // rank: acronyms first, then hyphenated, then others
  const scored = [];
  for (const cand of cands) {
    const norm = normalizeWord(cand);
    if (!norm) continue;
    if (norm.length < 3) continue;

    // Exclude if matches title/characters
    if (bannedNorm.has(norm)) continue;

    // Exclude if looks like the main character full name appears in top_characters strongly:
    // (already excluded by charBan)

    let score = 0;
    if (/^[A-Z]{2,}$/.test(cand)) score += 50;       // acronym like SERN
    if (cand.includes("-")) score += 15;             // B-Komachi
    if (cand.length >= 6) score += 5;
    if (/School|High|Laboratory|Lab/i.test(cand)) score += 3;

    // Avoid very common capitalized words in FR
    const normLow = norm;
    if (["japon","monde","etat","classe"].includes(normLow)) score -= 10;

    scored.push({ cand, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].cand : null;
}

// ===== Stage builders =====
function uniqPush(arr, x) {
  const k = String(x).trim();
  if (!k) return;
  if (!arr.includes(k)) arr.push(k);
}

// small generalization map for Medium/Hardcore keyword extraction
function generalizeKeyword(k, level) {
  const s = String(k || "");
  const n = normalizeWord(s);

  // Hardcore: push to very generic
  if (level === "hardcore") {
    if (/alchim|magie|sort|pouvoir/.test(n)) return "pouvoir";
    if (/ecole|lyce|classe|etudiant/.test(n)) return "classement";
    if (/pirat|tr[eé]sor|butin/.test(n)) return "quête";
    if (/titan|demon|monstr|creatur/.test(n)) return "menace";
    if (/temps|passe|futur|chronolog|timeline|ligne/.test(n)) return "temps";
    if (/guerre|combat|bataill|conflit/.test(n)) return "conflit";
    if (/idol|acteur|actrice|scene|divert/.test(n)) return "célébrité";
    if (/enquet|verit|secret/.test(n)) return "secret";
    if (/mensong|mentir/.test(n)) return "mensonges";
    if (/venge|revanche/.test(n)) return "vengeance";
    if (/organisation|agence|groupe/.test(n)) return "organisation";
    if (/danger|menace|traque/.test(n)) return "danger";
  }

  // Medium: lighter
  if (level === "medium") {
    if (/alchim|magie|sort/.test(n)) return "pouvoir";
    if (/ecole|lyce|classe/.test(n)) return "classes";
    if (/temps|passe|futur|chronolog|ligne/.test(n)) return "temps";
    if (/idol|acteur|actrice|divert/.test(n)) return "divertissement";
    if (/organisation|agence/.test(n)) return "organisation";
  }

  return s;
}

function buildHardcoreKeywords(synopsis) {
  // Pure concepts only, short
  const tags = deriveConceptTags(synopsis);
  // Pick 6-8 max
  const out = [];
  const order = [
    "secret","enquête","mensonges","vengeance","morts suspectes","danger","organisation",
    "quête","conflit","stratégie","alliés","proches","temps","classement","célébrité","pouvoir","menace","regrets","voyage"
  ];
  for (const tag of order) {
    if (tags.includes(tag)) uniqPush(out, tag);
    if (out.length >= 7) break;
  }
  // Fallback minimal
  if (out.length < 5) {
    const fallback = tags.slice(0, 7);
    fallback.forEach(t => uniqPush(out, t));
  }
  if (out.length < 4) {
    // super fallback
    ["secret","danger","quête","conséquences","organisation"].forEach(t => uniqPush(out, t));
  }
  return out;
}

function buildMediumKeywords(synopsis, titleBan, charBan) {
  const out = [];
  const tags = deriveConceptTags(synopsis);

  // 3-4 concept tags
  for (const t of tags) {
    uniqPush(out, t);
    if (out.length >= 4) break;
  }

  // add 3-4 extracted keywords (light generalization)
  const extracted = extractTopKeywords(synopsis, {
    titleBan, charBan,
    allowProperNouns: false,
    max: 24
  });

  for (const k of extracted) {
    const g = generalizeKeyword(k, "medium");
    const clean = String(g).trim();
    if (!clean) continue;
    // avoid duplicating concept tags too much
    if (out.includes(clean)) continue;
    uniqPush(out, clean);
    if (out.length >= 8) break;
  }

  return out.slice(0, 8);
}

function buildEasyKeywords(synopsis, titleBan, charBan, strongName) {
  const out = [];

  // extracted true terms (no proper nouns)
  const extracted = extractTopKeywords(synopsis, {
    titleBan, charBan,
    allowProperNouns: false,
    max: 30
  });

  for (const k of extracted) {
    // Easy = keep as is (no generalization)
    const clean = String(k).trim();
    if (!clean) continue;
    uniqPush(out, clean);
    if (out.length >= 8) break;
  }

  // add exactly 1 strong name secondary if available
  if (strongName) {
    // insert near the front
    out.unshift(strongName);
    // ensure uniqueness and max
    const uniq = [];
    for (const x of out) if (!uniq.includes(x)) uniq.push(x);
    return uniq.slice(0, 9);
  }

  return out.slice(0, 8);
}

function buildStagesForAnime(anime) {
  const variants = getTitleVariants(anime);
  const titleBan = buildTitleBanSet(variants);
  const charBan = buildTopCharactersBanSet(anime);

  const full = basicCleanSynopsis(anime.synopsis || "");
  const syn = full;

  const strongName = chooseSecondaryStrongName(anime, syn, titleBan, charBan);

  const hard = buildHardcoreKeywords(syn).map(x => generalizeKeyword(x, "hardcore"));
  const med = buildMediumKeywords(syn, titleBan, charBan).map(x => generalizeKeyword(x, "medium"));
  const easy = buildEasyKeywords(syn, titleBan, charBan, strongName);

  // final cleanup: remove title words if they slipped in
  const finalClean = (arr) => {
    const res = [];
    for (const kw of arr) {
      const norm = normalizeWord(kw);
      if (!norm) continue;
      if (titleBan.has(norm)) continue;
      res.push(kw);
    }
    // limit + make sure not empty
    return res.length ? res.slice(0, 9) : ["mystère","quête","danger"];
  };

  return {
    stages: [finalClean(hard), finalClean(med), finalClean(easy)],
    strongName,
    full
  };
}

// ===== Filters =====
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  let pool = allAnimes.filter((a) => {
    const syn = basicCleanSynopsis(a.synopsis || "");
    return (
      a._year >= yearMin &&
      a._year <= yearMax &&
      allowedTypes.includes(a._type) &&
      syn.length >= 80
    );
  });

  if (pool.length === 0) return [];

  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

function updatePreview() {
  const pool = applyFilters();
  const count = pool.length;
  const ok = count >= MIN_TITLES_TO_START;

  previewCountEl.textContent = `📜 Titres disponibles : ${count} (${ok ? "OK" : "Min 64"})`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
  applyBtn.setAttribute("aria-disabled", (!ok).toString());
}

// ===== Autocomplete cache =====
function rebuildTitlesCache() {
  const uniq = new Map();
  for (const a of filteredAnimes) uniq.set(a._titleLower, a._title);
  titlesList = Array.from(uniq.values());
  titlesLowerSet = new Set(Array.from(uniq.keys()));
}

// ===== Custom UI =====
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

  // type pills
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

    rebuildTitlesCache();

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ===== Round flow =====
function resetRoundUI() {
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  feedback.textContent = "";
  feedback.className = "";

  stageIndex = 0;
  stageKeywords = [[], [], []];
  strongNameUsed = null;
  gameEnded = false;

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;

  restartBtn.style.display = "none";
  restartBtn.textContent = (currentRound < totalRounds) ? "Suivant" : "Terminer";

  suggestions.innerHTML = "";

  synopsisBadgeEl.textContent = STAGE_LABELS[stageIndex];
  synopsisStepEl.textContent = `Indice ${stageIndex + 1} / 3`;
  keywordsWrapEl.innerHTML = "";

  setScoreBar(STAGE_SCORES[stageIndex]);
}

function renderStage() {
  synopsisBadgeEl.textContent = STAGE_LABELS[stageIndex];
  synopsisStepEl.textContent = `Indice ${stageIndex + 1} / 3`;
  setScoreBar(STAGE_SCORES[stageIndex]);

  keywordsWrapEl.innerHTML = "";
  const kws = stageKeywords[stageIndex] || [];
  for (const kw of kws) {
    const span = document.createElement("span");
    span.className = "keyword-pill";
    if (stageIndex === 2 && strongNameUsed && kw === strongNameUsed) span.classList.add("strong");
    span.textContent = kw;
    keywordsWrapEl.appendChild(span);
  }
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
  const key = String(currentAnime.mal_id || currentAnime._title);

  if (stageCache.has(key)) {
    const pack = stageCache.get(key);
    stageKeywords = pack.stages;
    strongNameUsed = pack.strongName || null;
    fullSynopsisClean = pack.full || "";
  } else {
    const pack = buildStagesForAnime(currentAnime);
    stageCache.set(key, pack);
    stageKeywords = pack.stages;
    strongNameUsed = pack.strongName || null;
    fullSynopsisClean = pack.full || "";
  }

  renderStage();
}

// ===== Guess logic =====
function normalizeTitle(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9\s'&:-]/g, "")
    .replace(/\s{2,}/g, " ");
}

function checkGuess() {
  if (!currentAnime || gameEnded) return;

  const guess = input.value.trim();
  if (!guess) {
    feedback.textContent = "⚠️ Tu dois écrire un nom d'anime.";
    feedback.className = "error";
    return;
  }

  const ok = normalizeTitle(guess) === normalizeTitle(currentAnime._title);
  if (ok) {
    winRound();
    return;
  }

  if (stageIndex < 2) {
    stageIndex += 1;
    renderStage();

    feedback.textContent = `❌ Mauvaise réponse. Indice débloqué (${STAGE_LABELS[stageIndex]}).`;
    feedback.className = "info";

    input.value = "";
    submitBtn.disabled = true;
    suggestions.innerHTML = "";
    input.focus();
    return;
  }

  loseRound();
}

function endRound(roundScore, won, messageHtml) {
  gameEnded = true;

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);

  const reveal = `
    <details class="reveal-details">
      <summary>Voir le synopsis complet</summary>
      <div class="reveal-synopsis">${safeHTML(fullSynopsisClean || "Synopsis indisponible.")}</div>
    </details>
  `;

  feedback.innerHTML = messageHtml + reveal;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  restartBtn.style.display = "inline-block";
  restartBtn.textContent = (currentRound < totalRounds) ? "Round suivant" : "Voir le score total";

  restartBtn.onclick = () => {
    if (currentRound >= totalRounds) showFinalRecap();
    else { currentRound += 1; startNewRound(); }
  };
}

function winRound() {
  const score = STAGE_SCORES[stageIndex];
  if (score > 0) launchFireworks();

  const msg = `🎉 Bonne réponse !<br><b>${safeHTML(currentAnime._title)}</b><br>Score : <b>${score}</b> / ${MAX_SCORE}`;
  endRound(score, true, msg);
}

function loseRound() {
  const msg = `❌ Raté…<br>Réponse : <b>${safeHTML(currentAnime._title)}</b><br>Score : <b>0</b> / ${MAX_SCORE}`;
  endRound(0, false, msg);
}

function showFinalRecap() {
  const gameContainer = document.getElementById("container");
  gameContainer.innerHTML = `
    <div style="width:100%;max-width:560px;text-align:center;">
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

// ===== Autocomplete =====
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  submitBtn.disabled = true;

  if (!val) return;

  // limit to 7 suggestions with a fast scan
  let shown = 0;
  for (const title of titlesList) {
    if (shown >= 7) break;
    const tl = title.toLowerCase();
    if (!tl.includes(val)) continue;

    const div = document.createElement("div");
    div.innerHTML = `<span>${safeHTML(title).replace(new RegExp(escapeRegExp(val), "i"), (m) => `<b>${safeHTML(m)}</b>`)}</span>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = title;
      suggestions.innerHTML = "";
      submitBtn.disabled = false;
      input.focus();
    });
    suggestions.appendChild(div);
    shown++;
  }

  submitBtn.disabled = !titlesLowerSet.has(val);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) checkGuess();
});
submitBtn.addEventListener("click", checkGuess);

// ===== Tooltip =====
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

// ===== Fireworks =====
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

// ===== Load dataset =====
fetch("../data/licenses_only.json")
  .then((r) => r.json())
  .then((data) => {
    allAnimes = (Array.isArray(data) ? data : []).map((a) => {
      const title = getDisplayTitle(a);
      return {
        ...a,
        _title: title,
        _titleLower: title.toLowerCase(),
        _year: getYear(a),
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
      };
    });

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
