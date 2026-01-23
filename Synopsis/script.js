/**********************
 * Synopsis (Mots-clés)
 * - Dataset: ../data/licenses_only.json (synopsis FR)
 * - 3 indices: Hardcore -> Moyen -> Facile
 * - Chaque erreur débloque l’indice suivant (score -1000)
 * - Synopsis complet visible uniquement après la réponse
 * - Mots-clés filtrés (stopwords FR + anti-verbes)
 * - Facile: +1 "nom fort" secondaire (hors top_characters)
 **********************/

const MAX_SCORE = 3000;
const STEP_SCORES = [3000, 2000, 1000, 0];
const MAX_STEPS = 3;
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

// ====== Stopwords / filtres (anti "soit / qu'il / envie" etc.) ======
const STOP_FR = new Set([
  // articles / pronoms / prépositions
  "a","à","au","aux","avec","ce","ces","cet","cette","dans","de","des","du","elle","en","et","eux","il","ils",
  "je","la","le","les","leur","leurs","lui","ma","mais","me","même","mes","moi","mon","ne","nos","notre","nous",
  "on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu",
  "un","une","vos","votre","vous","y","d","l","s","c","t","j",
  // formes fréquentes inutiles
  "ainsi","alors","après","avant","aussi","bien","car","cependant","comme","contre","donc","encore","ensuite",
  "entre","fait","fois","grâce","ici","là","leur","malgré","moins","plus","peu","plutôt","puis","quand","sans",
  "selon","sous","tant","toute","toutes","tout","tous","très","vers",
  // verbes / auxiliaires (conjugués courants)
  "être","est","sont","étaient","était","été","serait","sera","soit","soyons","ayant","avoir","a","ont","avait",
  "eut","peut","peuvent","pouvoir","doit","doivent","devoir","fait","faire","va","vont","aller","vient","venir",
  "reste","rester","devient","devenir","semble","sembler","permet","permettre","continue","continuer",
  "commence","commencer","fin","finit","finir","trouve","trouver","prend","prendre","donne","donner",
  "voit","voir","sait","savoir","peine","envie",
  // morceaux parasites fréquents
  "quil","quelle","quelles","quels","quelles","quil","quelle","quelles","quels","quelles",
]);

const GENERIC_BAD = new Set([
  // trop vagues et peu utiles en mots-clés
  "histoire","monde","jour","jours","vie","gens","personne","personnes","chose","choses","temps","nouveau",
  "nouvelle","nouveaux","grand","grande","petit","petite","groupe","série","route","simple","intense",
  "récemment","désormais","toujours","souvent","autre","autres","premier","première","dernier","dernière",
]);

function cleanSynopsis(s) {
  const raw = String(s || "");
  return raw
    .replace(/\[.*?\]/g, "")              // [Écrit par ...]
    .replace(/MAL Rewrite/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProperNouns(original) {
  // mots qui apparaissent avec majuscule (hors début de phrase approximatif)
  const text = String(original || "");
  const matches = text.match(/\b[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ][a-zàâäçéèêëîïôöùûüÿœæ-]{2,}\b/g) || [];
  const set = new Set();
  for (const m of matches) {
    set.add(normalizeGuess(m));
  }
  return set;
}

function tokenizeFrench(text) {
  // récupère mots + mots composés simples
  const matches = String(text || "").match(/[A-Za-zÀ-ÖØ-öø-ÿœæŒÆ-]+/g) || [];
  return matches.map(w => w.trim()).filter(Boolean);
}

function normalizeTokenForFilter(tok) {
  // enlève apostrophes/élisions courantes
  let t = tok.toLowerCase();
  t = t.replace(/^([ldjtmnscq]|qu|jusqu|lorsqu|puisqu|quoiqu)['’]/, "");
  t = t.replace(/['’]/g, ""); // enlève apostrophes restantes
  t = t.replace(/^-+|-+$/g, "");
  return t.trim();
}

function buildTitleWordSet(title) {
  const t = normalizeGuess(title);
  const words = t.split(" ").filter(w => w.length >= 4);
  return new Set(words);
}

// ====== Génération des 3 niveaux de mots-clés ======
const hintsCache = new Map(); // key: mal_id (ou titre), value: {hardcore, medium, easy, strongName, fullSynopsis}

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

function pickSecondaryStrongName(anime, titleWordSet) {
  const chars = Array.isArray(anime.characters) ? anime.characters : [];
  const top = Array.isArray(anime.top_characters) ? anime.top_characters : [];
  const topSet = new Set(top.map(c => normalizeGuess(c?.name || "")));

  // 1) priorité : characters (secondaires), en excluant ceux présents dans top_characters
  let pool = chars
    .map(c => String(c?.name || "").trim())
    .filter(n => n.length >= 4)
    .filter(n => !topSet.has(normalizeGuess(n)))
    .filter(n => {
      const nw = normalizeGuess(n);
      // évite d'avoir un mot très proche du titre
      for (const w of titleWordSet) if (nw.includes(w)) return false;
      return true;
    });

  // 2) fallback : top_characters mais on évite les 2 premiers (souvent le MC)
  if (pool.length === 0 && top.length >= 4) {
    pool = top.slice(2).map(c => String(c?.name || "").trim()).filter(n => n.length >= 4);
  }

  if (pool.length === 0) return "";

  shuffleInPlace(pool);
  return pool[0];
}

function pickKeywordsFromCounts(counts, excludeSet, max, minLen = 4) {
  const entries = [...counts.entries()]
    .filter(([k, v]) => k.length >= minLen)
    .filter(([k]) => !excludeSet.has(k))
    .sort((a, b) => {
      // score: freq d'abord puis longueur
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .map(([k]) => k);

  return entries.slice(0, max);
}

function buildHintsForAnime(anime) {
  const key = anime.mal_id || anime.license_id || anime._title;
  if (hintsCache.has(key)) return hintsCache.get(key);

  const fullSynopsis = cleanSynopsis(anime.synopsis || "");
  const titleWordSet = buildTitleWordSet(anime._title || "");
  const properNouns = extractProperNouns(anime.synopsis || "");

  // base tokens
  const rawTokens = tokenizeFrench(fullSynopsis);
  const filteredTokens = [];

  for (const tok of rawTokens) {
    const nf = normalizeTokenForFilter(tok);
    const ng = normalizeGuess(nf);

    if (!nf) continue;
    if (nf.length < 4) continue;

    // stop words / generic
    if (STOP_FR.has(nf) || STOP_FR.has(ng)) continue;
    if (GENERIC_BAD.has(nf) || GENERIC_BAD.has(ng)) continue;

    // évite mots du titre
    if (titleWordSet.has(ng)) continue;

    // évite noms propres
    if (properNouns.has(ng)) continue;

    // évite chiffres
    if (/\d/.test(nf)) continue;

    filteredTokens.push(ng);
  }

  // counts
  const counts = new Map();
  for (const t of filteredTokens) counts.set(t, (counts.get(t) || 0) + 1);

  // Hardcore: très général -> genres/themes + concepts trouvés
  const hardcore = [];
  const g = Array.isArray(anime.genres) ? anime.genres : [];
  const th = Array.isArray(anime.themes) ? anime.themes : [];
  const gen = [...g, ...th].map(mapGenreTheme).filter(Boolean);

  // prendre 4-6 genres/themes max
  for (const w of gen) {
    const nw = normalizeGuess(w);
    if (!nw || STOP_FR.has(nw) || GENERIC_BAD.has(nw)) continue;
    if (!hardcore.includes(nw)) hardcore.push(nw);
    if (hardcore.length >= 6) break;
  }

  // compléter avec concepts très généraux détectés dans le synopsis
  const textLow = normalizeGuess(fullSynopsis);
  const conceptRules = [
    ["organisation", ["organisation","corps","unité","agence","gouvernement","société","groupe"]],
    ["secret", ["secret","mystère","caché","mystérieux"]],
    ["danger", ["danger","menace","risque","mort","catastrophe"]],
    ["quête", ["quête","objectif","mission","trésor","recherche"]],
    ["conflit", ["guerre","combat","conflit","affrontement","bataille"]],
    ["survie", ["survie","survivre","échapper","fuir"]],
    ["expérience", ["expérience","scientifique","invention","laboratoire"]],
    ["pouvoir", ["pouvoir","don","capacité","aptitude"]],
  ];

  for (const [label, triggers] of conceptRules) {
    if (hardcore.length >= 8) break;
    if (triggers.some(t => textLow.includes(normalizeGuess(t)))) {
      const nl = normalizeGuess(label);
      if (!hardcore.includes(nl) && !STOP_FR.has(nl) && !GENERIC_BAD.has(nl)) hardcore.push(nl);
    }
  }

  // si pas assez, on complète avec mots très fréquents mais “ok”
  const hardcoreSet = new Set(hardcore);
  if (hardcore.length < 8) {
    const add = pickKeywordsFromCounts(counts, hardcoreSet, 8 - hardcore.length, 5);
    for (const a of add) {
      if (!hardcore.includes(a)) hardcore.push(a);
      if (hardcore.length >= 8) break;
    }
  }

  // Moyen: mots plus utiles, MAIS différents du hardcore (exclusion)
  const medium = pickKeywordsFromCounts(counts, new Set(hardcore), 10, 5);

  // Easy: plus spécifique (inclut quelques bigrams)
  const easySetExclude = new Set([...hardcore, ...medium]);

  // bigrams depuis tokens filtrés (sans stopwords déjà)
  const bigramCounts = new Map();
  for (let i = 0; i < filteredTokens.length - 1; i++) {
    const a = filteredTokens[i];
    const b = filteredTokens[i + 1];
    if (!a || !b) continue;
    if (a.length < 4 || b.length < 4) continue;
    const phrase = `${a} ${b}`;
    if (phrase.length > 28) continue;
    if (easySetExclude.has(a) || easySetExclude.has(b)) continue; // force nouveauté
    bigramCounts.set(phrase, (bigramCounts.get(phrase) || 0) + 1);
  }

  const bigrams = [...bigramCounts.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([p]) => p)
    .slice(0, 4);

  const easyTokens = pickKeywordsFromCounts(counts, easySetExclude, 12, 6);
  const easy = [...bigrams, ...easyTokens].slice(0, 12);

  // placeholders si vraiment trop court
  while (hardcore.length < 7) hardcore.push("----");
  while (medium.length < 8) medium.push("----");
  while (easy.length < 10) easy.push("----");

  // Nom fort (secondaire) uniquement en Facile
  const strongName = pickSecondaryStrongName(anime, titleWordSet);

  const hints = {
    hardcore,
    medium,
    easy,
    strongName,
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

  // Facile : +1 nom fort (secondaire)
  const strong = (hintStep === 2 && currentHints.strongName) ? currentHints.strongName : "";

  const finalList = [...list];

  // Ajoute le nom fort en premier (si présent), pour qu’il “aide” mais sans en mettre 10
  if (strong) finalList.unshift(strong);

  // Limite pour éviter un mur
  const maxShow = hintStep === 0 ? 8 : hintStep === 1 ? 11 : 13;
  const clipped = finalList.slice(0, maxShow);

  clipped.forEach((w) => {
    const pill = document.createElement("span");
    pill.className = "keyword-pill";
    pill.textContent = w;

    if (strong && w === strong) pill.classList.add("strong");
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

  // supprime un reveal précédent
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

  // mauvaise réponse -> débloque indice suivant
  if (hintStep < MAX_STEPS - 1) {
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

  // déjà en Facile -> perdre
  loseRound();
}

submitBtn.addEventListener("click", checkGuess);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) {
    checkGuess();
  }
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
  const matches = titles
    .filter(t => t.toLowerCase().includes(val))
    .slice(0, 7);

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

  // autorise submit uniquement si titre exact (évite fautes)
  const exact = titles.map(t => t.toLowerCase()).includes(val);
  submitBtn.disabled = !exact;
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
