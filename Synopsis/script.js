/**********************
 * Synopsis (Mots-clés)
 * - Dataset: ../data/licenses_only.json (synopsis FR)
 * - 3 indices: Hardcore -> Moyen -> Facile
 * - 5 à 8 mots-clés par indice (snackable)
 * - Hardcore: général (genres/thèmes + concepts)
 * - Moyen: plus clair (noms concrets) + 0-1 mot fort possible
 * - Facile: très informatif + mots forts autorisés (sauf titre)
 * - Synopsis complet visible uniquement après la réponse
 **********************/

const MAX_SCORE = 3000;
const STEP_SCORES = [3000, 2000, 1000, 0];
const MIN_TITLES_TO_START = 64;

const HARDCORE_TARGET = 6; // 5-8
const MEDIUM_TARGET = 7;   // 5-8
const EASY_TARGET = 8;     // 5-8

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
  const push = (s) => { if (typeof s === "string" && s.trim()) set.add(s.trim()); };
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

function setRangePct(el) {
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || "0");
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty("--pct", `${Math.max(0, Math.min(100, pct))}%`);
}

function cleanSynopsis(s) {
  const raw = String(s || "");
  return raw
    .replace(/\[.*?\]/g, "")
    .replace(/MAL Rewrite/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ====== Score bar ======
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

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

// ====== Lexique & filtres ======
// On privilégie des "noms" : mots qui suivent déterminants/prépositions (après tokenisation spéciale).
const DET_SET = new Set([
  "le","la","les","un","une","des","du","de","d","l","ce","cet","cette","ces",
  "mon","ma","mes","son","sa","ses","notre","nos","votre","vos","leur","leurs"
]);

const PREP_SET = new Set([
  "de","d","du","des","en","dans","sur","sous","avec","sans","pour","contre","vers","chez","a","à","au","aux"
]);

// stopwords basiques + mots “structure” (évite verbes/liaisons)
const STOP = new Set([
  "a","à","au","aux","avec","ce","ces","cet","cette","dans","de","des","du","elle","en","et","eux","il","ils",
  "je","la","le","les","leur","leurs","lui","ma","mais","me","même","mes","moi","mon","ne","nos","notre","nous",
  "on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu",
  "un","une","vos","votre","vous","y","d","l","s","c","t","j",
  "ainsi","alors","après","avant","aussi","bien","car","cependant","comme","contre","donc","encore","ensuite",
  "entre","ici","là","malgré","moins","plus","peu","plutôt","puis","quand","sans","selon","sous","tant",
  "toute","toutes","tout","tous","très","vers","souvent","toujours","désormais",
  // très fréquents mais pas utiles comme mots-clés
  "jour","jours","vie","monde","gens","personne","personnes","chose","choses","temps","nouveau","nouvelle",
  "nombreux","nombreuse","nombreuses","réellement","plusieurs","certain","certaine","certaines","certains",
  // verbes ultra fréquents
  "être","est","sont","étaient","était","été","sera","serait","avoir","a","ont","avait","fait","faire",
  "peut","peuvent","doit","doivent","va","vont","vient","venir","reste","rester","devient","devenir",
  "semble","sembler","continue","continuer","commence","commencer","finit","finir",
  "passe","passer","poursuit","poursuivre","cherche","chercher","trouve","trouver",
  "découvre","découvrir","produit","produire","renvoie","renvoyer","retrouve","retrouver",
]);

// mots qui restent utiles même s’ils ne suivent pas un déterminant
const ALWAYS_KEEP = new Set([
  "shogi","boxe","boxing","volleyball","volley","alchimie","titans","titan","pirate","pirates","trésor",
  "magie","démon","démons","vampire","zombie","robot","robots","mecha","temps","voyage","enquête",
  "meurtre","assassinat","survie","militaire","école","lycée","collège","université","tokyo",
]);

// suffixes qui sentent trop l’adverbe / adjectif “faible”
const BAD_SUFFIX_RE = /(ment|ements|eusement|euse|euses|eux|ante|antes|ants|ant|ique|iques|able|ibles|ible)$/i;

// ====== Mapping genres / themes (Hardcore) ======
const GENRE_MAP = {
  "Action": "action",
  "Drama": "drame",
  "Suspense": "suspense",
  "Comedy": "comédie",
  "Romance": "romance",
  "Fantasy": "fantasy",
  "Sci-Fi": "science-fiction",
  "Adventure": "aventure",
  "Horror": "horreur",
  "Mystery": "mystère",
  "Sports": "sport",
  "Slice of Life": "quotidien",
  "Supernatural": "surnaturel",
  "Award Winning": "primé",
  "Gore": "gore",
  "Military": "militaire",
  "Survival": "survie",
  "School": "école",
};

function mapGenreTheme(w) {
  if (!w) return "";
  return GENRE_MAP[w] || String(w).toLowerCase();
}

// ====== Tokenisation spéciale (pour récupérer l’, d’, etc.) ======
function preprocessForTokenize(text) {
  // "l’humanité" -> "l' humanité" / "d’accord" -> "d' accord"
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
  // ajoute aussi le nom animethemes s’il existe dans data brute
  if (anime.animethemes && anime.animethemes.name) {
    const n = normalizeGuess(anime.animethemes.name);
    n.split(" ").forEach(w => { if (w && w.length >= 4) set.add(w); });
  }
  return set;
}

function extractProperNouns(original) {
  const text = String(original || "");
  const matches = text.match(/\b[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ][A-Za-zÀ-ÖØ-öø-ÿœæŒÆ-]{2,}\b/g) || [];
  const out = [];
  for (const m of matches) {
    const n = normalizeGuess(m);
    if (n && n.length >= 4) out.push(m.trim());
  }
  // dédoublonne en gardant forme originale la plus courte
  const map = new Map();
  for (const x of out) {
    const k = normalizeGuess(x);
    if (!map.has(k) || x.length < map.get(k).length) map.set(k, x);
  }
  return [...map.values()];
}

// ====== Noun-ish extraction ======
function isGoodKeywordToken(norm, titleBlockSet) {
  if (!norm) return false;
  if (norm.length < 4) return false;
  if (STOP.has(norm)) return false;
  if (titleBlockSet.has(norm)) return false;
  if (BAD_SUFFIX_RE.test(norm) && !ALWAYS_KEEP.has(norm)) return false;
  return true;
}

function buildNounCountsFromSynopsis(fullSynopsis, titleBlockSet) {
  const words = tokenizeWords(fullSynopsis);
  const norms = words.map(w => normalizeGuess(w));
  const counts = new Map();

  for (let i = 0; i < norms.length; i++) {
    const w = norms[i];
    if (!w) continue;

    const prev = norms[i - 1] || "";
    const prevIsDetOrPrep = DET_SET.has(prev) || PREP_SET.has(prev);

    // On garde surtout si précédé par déterminant/préposition, ou mot "domaine" always_keep
    if (!prevIsDetOrPrep && !ALWAYS_KEEP.has(w)) continue;

    if (!isGoodKeywordToken(w, titleBlockSet) && !ALWAYS_KEEP.has(w)) continue;

    // évite quelques mots trop génériques restants
    if (["classe","maison","école","lycée","collège"].includes(w) && !ALWAYS_KEEP.has(w)) {
      // "école/lycée/collège" peuvent rester, mais "classe/maison" sont souvent trop faibles
      if (w === "classe" || w === "maison") continue;
    }

    counts.set(w, (counts.get(w) || 0) + 1);
  }

  return counts;
}

function pickTopFromCounts(counts, excludeSet, max, minLen = 4) {
  const arr = [...counts.entries()]
    .filter(([k]) => k.length >= minLen)
    .filter(([k]) => !excludeSet.has(k))
    .sort((a, b) => {
      // score: fréquence + longueur
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .map(([k]) => k);

  return arr.slice(0, max);
}

// ====== Concepts (Hardcore/Moyen) ======
const CONCEPT_RULES = [
  ["organisation", ["organisation","agence","corps","unité","groupe","société","institut","laboratoire"]],
  ["secret", ["secret","mystère","caché","mystérieux"]],
  ["danger", ["danger","menace","catastrophe","mort","risque"]],
  ["quête", ["quête","objectif","mission","recherche","trésor"]],
  ["conflit", ["guerre","combat","bataille","affrontement"]],
  ["survie", ["survie","survivre","échapper"]],
  ["enquête", ["enquête","inspecteur","police","indices","crime","meurtre"]],
  ["temps", ["temps","passé","futur","timeline","temporel"]],
  ["sport", ["sport","match","tournoi","boxe","shogi","volley"]],
  ["école", ["école","lycée","collège","classe"]],
  ["science", ["scientifique","invention","expérience","machine","technologie"]],
  ["famille", ["famille","parents","mère","père","sœur","frère"]],
  ["rédemption", ["rédemption","pardon","regrets","culpabilité"]],
];

function detectConcepts(textNorm, max = 4) {
  const found = [];
  for (const [label, triggers] of CONCEPT_RULES) {
    if (found.length >= max) break;
    if (triggers.some(t => textNorm.includes(normalizeGuess(t)))) {
      found.push(normalizeGuess(label));
    }
  }
  return found;
}

// ====== Mots forts ======
function pickSecondaryStrongName(anime, titleBlockSet) {
  const chars = Array.isArray(anime.characters) ? anime.characters : [];
  const top = Array.isArray(anime.top_characters) ? anime.top_characters : [];
  const topSet = new Set(top.map(c => normalizeGuess(c?.name || "")));

  let pool = chars
    .map(c => String(c?.name || "").trim())
    .filter(n => n.length >= 4)
    .filter(n => !topSet.has(normalizeGuess(n)))
    .filter(n => {
      const nw = normalizeGuess(n);
      // évite titre
      for (const w of titleBlockSet) if (nw.includes(w)) return false;
      return true;
    });

  if (pool.length === 0 && top.length >= 4) {
    pool = top.slice(2).map(c => String(c?.name || "").trim()).filter(n => n.length >= 4);
  }
  if (pool.length === 0) return "";

  shuffleInPlace(pool);
  return pool[0];
}

function pickProperNouns(originalSynopsis, titleBlockSet, max) {
  const props = extractProperNouns(originalSynopsis);
  const cleaned = [];
  for (const p of props) {
    const n = normalizeGuess(p);
    if (!n || n.length < 4) continue;
    if (STOP.has(n)) continue;
    if (titleBlockSet.has(n)) continue;
    // évite trucs trop communs en majuscule (ex: "Ever", "Now" si synopsis EN)
    if (["ever","now","having","after"].includes(n)) continue;
    cleaned.push(p);
  }
  // dédoublonne par normalisation
  const seen = new Set();
  const out = [];
  for (const p of cleaned) {
    const k = normalizeGuess(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

// ====== Cache hints ======
const hintsCache = new Map();

function padWithBlanks(arr, minLen) {
  while (arr.length < minLen) arr.push("----");
  return arr;
}

function uniqueKeepOrder(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = normalizeGuess(x);
    if (!k) { out.push(x); continue; }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function buildHintsForAnime(anime) {
  const key = anime.mal_id || anime.license_id || anime._title;
  if (hintsCache.has(key)) return hintsCache.get(key);

  const fullSynopsis = cleanSynopsis(anime.synopsis || "");
  const textNorm = normalizeGuess(fullSynopsis);
  const titleBlockSet = buildTitleBlockSet(anime);

  const counts = buildNounCountsFromSynopsis(fullSynopsis, titleBlockSet);

  // === Hardcore ===
  const hardcore = [];

  // 1) genres/themes (max 3-4)
  const g = Array.isArray(anime.genres) ? anime.genres : [];
  const th = Array.isArray(anime.themes) ? anime.themes : [];
  const gen = [...g, ...th].map(mapGenreTheme).filter(Boolean);

  for (const w of gen) {
    const nw = normalizeGuess(w);
    if (!nw) continue;
    if (STOP.has(nw)) continue;
    if (!hardcore.includes(nw)) hardcore.push(nw);
    if (hardcore.length >= 4) break;
  }

  // 2) concepts (max 3-4)
  const concepts = detectConcepts(textNorm, 4);
  for (const c of concepts) {
    if (!hardcore.includes(c) && hardcore.length < HARDCORE_TARGET) hardcore.push(c);
  }

  // 3) fill si nécessaire avec des noms assez "généraux"
  if (hardcore.length < HARDCORE_TARGET) {
    const exclude = new Set(hardcore);
    const add = pickTopFromCounts(counts, exclude, HARDCORE_TARGET - hardcore.length, 5);
    hardcore.push(...add);
  }

  // clamp 5-8
  const hardcoreFinal = padWithBlanks(uniqueKeepOrder(hardcore).slice(0, 8), 5).slice(0, HARDCORE_TARGET);

  // === Moyen ===
  // Moyen peut réutiliser des termes du Hardcore si besoin, mais doit être plus clair + 0-1 mot fort.
  const medium = [];

  // 1) prendre 1-2 termes du hardcore (les plus informatifs) si dispo
  for (const w of hardcoreFinal) {
    if (w === "----") continue;
    if (medium.length >= 2) break;
    medium.push(w);
  }

  // 2) ajouter des noms concrets du synopsis (nouns), plus spécifiques
  const mediumExclude = new Set(); // on n'interdit pas les overlaps, mais on évite les doublons
  for (const w of medium) mediumExclude.add(normalizeGuess(w));

  const mediumAdds = pickTopFromCounts(counts, mediumExclude, MEDIUM_TARGET - medium.length, 5);
  medium.push(...mediumAdds);

  // 3) autoriser 0-1 mot fort (nom propre utile), si ça ne contient pas le titre
  const props1 = pickProperNouns(anime.synopsis || "", titleBlockSet, 1);
  if (props1.length && medium.length < MEDIUM_TARGET) {
    medium.unshift(props1[0]); // en premier, ça aide la lecture
  }

  const mediumFinal = padWithBlanks(uniqueKeepOrder(medium).slice(0, 8), 5).slice(0, MEDIUM_TARGET);

  // === Facile ===
  // Très informatif : mots forts autorisés (dans la limite 8) sauf titre.
  const easy = [];

  // 1) noms forts: secondaire + 1-2 noms propres (ex: Tokyo, SERN) + éventuellement un 2e perso
  const strongName = pickSecondaryStrongName(anime, titleBlockSet);
  if (strongName) easy.push(strongName);

  const props = pickProperNouns(anime.synopsis || "", titleBlockSet, 2);
  easy.push(...props);

  // un autre nom de perso (si dispo) pour rendre facile vraiment facile (toujours sans titre)
  const moreStrong = [];
  const chars = Array.isArray(anime.characters) ? anime.characters : [];
  for (const c of chars) {
    const nm = String(c?.name || "").trim();
    const nn = normalizeGuess(nm);
    if (!nm || nn.length < 4) continue;
    if (titleBlockSet.has(nn)) continue;
    if (strongName && normalizeGuess(strongName) === nn) continue;
    // on évite d'en mettre trop : 1 max (on garde le jeu)
    moreStrong.push(nm);
    if (moreStrong.length >= 1) break;
  }
  if (moreStrong.length) easy.push(...moreStrong);

  // 2) ajouter des noms concrets (même si overlap), jusqu'à EASY_TARGET
  const easyExclude = new Set();
  for (const w of easy) easyExclude.add(normalizeGuess(w));

  const easyAdds = pickTopFromCounts(counts, easyExclude, EASY_TARGET - easy.length, 4);
  easy.push(...easyAdds);

  const easyFinal = padWithBlanks(uniqueKeepOrder(easy).slice(0, 8), 5).slice(0, EASY_TARGET);

  const hints = {
    hardcore: hardcoreFinal,
    medium: mediumFinal,
    easy: easyFinal,
    fullSynopsis,
  };

  hintsCache.set(key, hints);
  return hints;
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

// game refs
const feedback = document.getElementById("feedback");
const input = document.getElementById("characterInput");
const submitBtn = document.getElementById("submit-btn");
const restartBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");
const roundLabel = document.getElementById("roundLabel");

const keywordsWrap = document.getElementById("keywordsWrap");
const synopsisBadge = document.getElementById("synopsisBadge");
const synopsisStep = document.getElementById("synopsisStep");

// ====== Data ======
let allAnimes = [];
let filteredAnimes = [];

// ====== Session (Rounds) ======
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentAnime = null;
let currentHints = null;
let hintStep = 0; // 0 hardcore, 1 moyen, 2 facile
let gameEnded = false;

// ====== UI show/hide ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

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
      a.synopsis.trim().length >= 40
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

  previewCountEl.textContent = `📜 Titres disponibles : ${count} (${ok ? "OK" : "Min 64"})`;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
  applyBtn.setAttribute("aria-disabled", (!ok).toString());
}

// ====== UI init ======
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

// ====== Render keywords ======
function setBadgeAndStep() {
  const labels = ["Hardcore", "Moyen", "Facile"];
  synopsisBadge.textContent = labels[hintStep] || "Hardcore";
  synopsisStep.textContent = `Indice ${Math.min(hintStep + 1, 3)} / 3`;
}

function renderKeywords() {
  keywordsWrap.innerHTML = "";
  if (!currentHints) return;

  let list = [];
  if (hintStep === 0) list = currentHints.hardcore || [];
  else if (hintStep === 1) list = currentHints.medium || [];
  else list = currentHints.easy || [];

  // clamp sécurité 5-8
  const show = list.slice(0, 8);

  show.forEach((w) => {
    const pill = document.createElement("span");
    pill.className = "keyword-pill";
    pill.textContent = w;
    keywordsWrap.appendChild(pill);
  });

  setBadgeAndStep();
}

// ====== Round flow ======
function resetRoundUI() {
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  feedback.textContent = "";
  feedback.className = "";

  hintStep = 0;
  gameEnded = false;

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;

  restartBtn.style.display = "none";
  restartBtn.textContent = (currentRound < totalRounds) ? "Round suivant" : "Terminer";

  suggestions.innerHTML = "";

  setScoreBar(STEP_SCORES[0]);

  document.querySelectorAll(".reveal-details").forEach(el => el.remove());
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
  currentHints = buildHintsForAnime(currentAnime);

  renderKeywords();
}

// ====== End round ======
function showFullSynopsisReveal() {
  const container = document.getElementById("container");
  const details = document.createElement("details");
  details.className = "reveal-details";

  const sum = document.createElement("summary");
  sum.textContent = "Voir le synopsis complet";

  const div = document.createElement("div");
  div.className = "reveal-synopsis";
  div.textContent = currentHints?.fullSynopsis || cleanSynopsis(currentAnime?.synopsis || "");

  details.appendChild(sum);
  details.appendChild(div);
  container.appendChild(details);
}

function endRound(roundScore, won, messageHtml) {
  gameEnded = true;

  input.disabled = true;
  submitBtn.disabled = true;
  suggestions.innerHTML = "";

  setScoreBar(roundScore);

  feedback.innerHTML = messageHtml;
  feedback.className = won ? "success" : "error";

  totalScore += roundScore;

  showFullSynopsisReveal();

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

function winRound() {
  const score = STEP_SCORES[hintStep] ?? 0;
  if (score > 0) launchFireworks();

  const msg = `🎉 Bonne réponse !<br><b>${currentAnime._title}</b><br>Score : <b>${score}</b> / ${MAX_SCORE}`;
  endRound(score, true, msg);
}

function loseRound() {
  const msg = `❌ Raté…<br>Réponse : <b>${currentAnime._title}</b><br>Score : <b>0</b> / ${MAX_SCORE}`;
  endRound(0, false, msg);
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

  // mauvaise réponse -> indice suivant
  if (hintStep < 2) {
    hintStep += 1;
    setScoreBar(STEP_SCORES[hintStep] ?? 0);
    renderKeywords();

    const labels = ["Hardcore", "Moyen", "Facile"];
    feedback.textContent = `❌ Mauvaise réponse. Indice débloqué (${labels[hintStep]}).`;
    feedback.className = "info";

    input.value = "";
    submitBtn.disabled = true;
    input.focus();
    suggestions.innerHTML = "";
    return;
  }

  loseRound();
}

submitBtn.addEventListener("click", checkGuess);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) checkGuess();
});

// ====== Autocomplete ======
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  feedback.className = "";
  submitBtn.disabled = true;

  if (!val) return;

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

  // submit seulement si titre exact (évite approximations)
  submitBtn.disabled = !titles.map(t => t.toLowerCase()).includes(val);
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

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch((e) => alert("Erreur chargement dataset: " + e.message));
