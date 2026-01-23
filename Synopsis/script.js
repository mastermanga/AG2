/**********************
 * Synopsis (FR)
 * - Dataset: ../data/licenses_only.json (synopsis déjà en FR)
 * - 3 étapes: Hard++ -> Moyen -> Synopsis complet
 * - À chaque erreur: on descend en difficulté
 * - Score: 3000 / 2000 / 1000 sinon 0
 * - Min 64 titres
 * - Optimisations: cache titres autocomplete + cache stages + mots rares (idle)
 **********************/

const MAX_SCORE = 3000;
const STAGE_SCORES = [3000, 2000, 1000];
const STAGE_LABELS = ["Hard++", "Moyen", "Synopsis"];
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

// ====== Helpers dataset ======
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
  // uniq
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
const restartBtn = document.getElementById("restart-btn");
const suggestions = document.getElementById("suggestions");
const roundLabel = document.getElementById("roundLabel");

const synopsisTextEl = document.getElementById("synopsisText");
const synopsisBadgeEl = document.getElementById("synopsisBadge");
const synopsisStepEl = document.getElementById("synopsisStep");

// score bar
const scoreBar = document.getElementById("score-bar");
const scoreBarLabel = document.getElementById("score-bar-label");

// ====== Data ======
let allAnimes = [];
let filteredAnimes = [];

// Autocomplete cache
let titlesList = [];
let titlesLowerSet = new Set();

// Stages cache (évite recalcul si anime revient)
const stageCache = new Map(); // key -> [hard, med, full]

// ====== Session ======
let totalRounds = 1;
let currentRound = 1;
let totalScore = 0;

// ====== Round state ======
let currentAnime = null;
let stageIndex = 0;
let stageTexts = ["", "", ""];
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

// ====== Nettoyage synopsis ======
function basicCleanSynopsis(text) {
  let t = (text || "").replace(/\r/g, "").trim();

  // retire notes MAL FR/EN
  t = t.replace(/\[\s*(?:Écrit|Ecrit)\s+par\s+MAL\s+Rewrite\s*\]/giu, "");
  t = t.replace(/\[\s*Written\s+by\s+MAL\s+Rewrite\s*\]/giu, "");

  // retire éventuelles lignes "Written by ..." variantes
  t = t.replace(/\[\s*Written\s+by[^\]]*\]/giu, "");
  t = t.replace(/\[\s*(?:Écrit|Ecrit)\s+par[^\]]*\]/giu, "");

  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

function splitSentences(text) {
  const t = (text || "").replace(/\n+/g, " ").trim();
  if (!t) return [];
  return t.split(/(?<=[.!?])\s+/).filter(Boolean);
}

// ====== Masquer mots du titre (variants) ======
function wordsFromTitle(title) {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // enlève accents
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4);
}

function removeTitleWordsFromVariants(text, variants) {
  const allWords = [];
  for (const v of (variants || [])) allWords.push(...wordsFromTitle(v));
  const uniq = Array.from(new Set(allWords)).slice(0, 20);
  if (!uniq.length) return text;

  let out = text;
  for (const w of uniq) {
    const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, "giu");
    out = out.replace(re, "____");
  }
  return out;
}

// ====== Censure noms propres (Unicode) ======
function supportsUnicodeProps() {
  try { new RegExp("\\p{L}", "u"); return true; } catch { return false; }
}

function removeProperNounsAggressive(text) {
  let t = text;

  // retire initiales "D." etc.
  t = t.replace(/\b\p{Lu}\.\b/gu, "");

  if (supportsUnicodeProps()) {
    // Suite de mots capitalisés -> [REDACTED]
    t = t.replace(/\b(\p{Lu}\p{Ll}{2,})(\s+(\p{Lu}\p{Ll}{2,}))+(\b)/gu, "[REDACTED]");

    // mots isolés capitalisés (hors début de phrase) -> [REDACTED]
    const sentences = t.split(/(?<=[.!?])\s+/);
    t = sentences.map(s => {
      const parts = s.split(/\s+/);
      return parts.map((w, idx) => {
        if (idx === 0) return w;
        const raw = w.replace(/^[("'+-]+|[)"'.,?!:;]+$/g, "");
        if (/^\p{Lu}\p{Ll}{2,}$/u.test(raw)) return w.replace(raw, "[REDACTED]");
        return w;
      }).join(" ");
    }).join(" ");
  } else {
    // fallback (moins bon sans unicode)
    t = t.replace(/\b([A-Z][a-z]{2,})(\s+[A-Z][a-z]{2,})+\b/g, "[REDACTED]");
  }

  return t.replace(/\s{2,}/g, " ").trim();
}

// ====== Mots rares (auto), construit en idle ======
const freqMap = new Map();
let freqReady = false;
let freqBuilding = false;

const STOPWORDS = new Set([
  // FR
  "dans","avec","sans","pour","mais","donc","alors","quand","où","comme","plus","moins","très","aussi","seulement",
  "être","avoir","fait","faire","peut","doit","vont","aller","cela","cette","ces","ceux","tout","tous","toute","toutes",
  "une","des","les","aux","du","de","la","le","un","et","ou","ni","ne","pas","sur","sous","entre","vers","chez",
  "leurs","leur","lui","elle","elles","ils","son","sa","ses","nos","notre","vos","votre","mes","mon","ma","tes","ton","ta",
  // EN (au cas où il reste un peu d'anglais)
  "their","there","about","after","before","during","through","across","under","over","into","from","with","without",
  "this","that","these","those","then","than","when","where","while","who","whom","which","what","why","how",
  "they","them","his","her","him","hers","theirs","your","yours","our","ours","its","it's","itself","the","and","for","but","not",
  "are","was","were","been","being","have","has","had","do","does","did","will","would","can","could","should","may","might","must",
  "one","two","three","many","most","more","less","very","also","only","just","even","still","such"
]);

function tokenize(text) {
  const s = (text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // enlève accents pour comparer
  // lettres+chiffres (unicode-safe en restant simple)
  return s
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

function buildFreqMap(animes) {
  freqMap.clear();
  for (const a of animes) {
    const syn = basicCleanSynopsis(a && a.synopsis ? a.synopsis : "");
    const uniq = new Set(tokenize(syn));
    for (const w of uniq) freqMap.set(w, (freqMap.get(w) || 0) + 1);
  }
  freqReady = true;
  freqBuilding = false;
}

function scheduleFreqBuild() {
  if (freqReady || freqBuilding) return;
  freqBuilding = true;
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => buildFreqMap(allAnimes));
  } else {
    setTimeout(() => buildFreqMap(allAnimes), 0);
  }
}

function maskRareWords(text, n = 8) {
  if (!freqReady) return text;
  const words = Array.from(new Set(tokenize(text)));
  if (!words.length) return text;

  words.sort((a, b) => (freqMap.get(a) || 0) - (freqMap.get(b) || 0));
  const toHide = new Set(words.slice(0, Math.min(n, words.length)));

  return text.replace(/\b([A-Za-zÀ-ÖØ-öø-ÿ']{4,})\b/g, (m) => {
    const w = m.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    return toHide.has(w) ? "____" : m;
  });
}

// ====== Build stages ======
function buildHardPP(original, variants) {
  let t = basicCleanSynopsis(original);
  if (!t) return "Synopsis indisponible.";

  const sents = splitSentences(t);
  let chosen = sents.slice(0, 2).join(" ");
  if (chosen.length < 170 && sents.length >= 3) chosen = sents.slice(0, 3).join(" ");

  chosen = removeTitleWordsFromVariants(chosen, variants);
  chosen = removeProperNounsAggressive(chosen);

  // masque mots rares (si freqMap prête, sinon no-op)
  chosen = maskRareWords(chosen, 10);

  // nettoie répétitions
  chosen = chosen.replace(/\[REDACTED\](\s+\[REDACTED\])+/g, "[REDACTED]");
  return chosen.trim();
}

function buildMedium(original, variants) {
  let t = basicCleanSynopsis(original);
  if (!t) return "Synopsis indisponible.";

  const sents = splitSentences(t);
  let chosen = sents.slice(0, 4).join(" ");
  if (chosen.length > 650) chosen = sents.slice(0, 3).join(" ");

  chosen = removeTitleWordsFromVariants(chosen, variants);
  chosen = removeProperNounsAggressive(chosen);

  // léger masque rare
  chosen = maskRareWords(chosen, 4);

  chosen = chosen.replace(/\[REDACTED\](\s+\[REDACTED\])+/g, "[REDACTED]");
  return chosen.trim();
}

function buildFull(original) {
  const t = basicCleanSynopsis(original);
  return t || "Synopsis indisponible.";
}

// ====== Filters ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")]
    .map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  let pool = allAnimes.filter((a) => {
    const syn = basicCleanSynopsis(a.synopsis || "");
    return (
      a._year >= yearMin &&
      a._year <= yearMax &&
      allowedTypes.includes(a._type) &&
      syn.length >= 60
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

// ====== Autocomplete cache ======
function rebuildTitlesCache() {
  const uniq = new Map();
  for (const a of filteredAnimes) uniq.set(a._titleLower, a._title);
  titlesList = Array.from(uniq.values());
  titlesLowerSet = new Set(Array.from(uniq.keys()));
}

// ====== Custom UI ======
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

  applyBtn.addEventListener("click", () => {
    filteredAnimes = applyFilters();
    if (filteredAnimes.length < MIN_TITLES_TO_START) {
      updatePreview();
      return;
    }

    rebuildTitlesCache();
    scheduleFreqBuild(); // en idle, ne bloque pas le lancement

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;
    totalScore = 0;

    showGame();
    startNewRound();
  });

  syncLabels();
}

// ====== Round flow ======
function resetRoundUI() {
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  feedback.textContent = "";
  feedback.className = "";

  stageIndex = 0;
  gameEnded = false;

  input.value = "";
  input.disabled = false;
  submitBtn.disabled = true;

  restartBtn.style.display = "none";
  restartBtn.textContent = (currentRound < totalRounds) ? "Suivant" : "Terminer";

  suggestions.innerHTML = "";

  synopsisBadgeEl.textContent = STAGE_LABELS[stageIndex];
  synopsisStepEl.textContent = `Indice ${stageIndex + 1} / 3`;
  synopsisTextEl.textContent = "...";

  setScoreBar(STAGE_SCORES[stageIndex]);
}

function startNewRound() {
  resetRoundUI();

  currentAnime = filteredAnimes[Math.floor(Math.random() * filteredAnimes.length)];
  const key = String(currentAnime.mal_id || currentAnime._title);

  if (stageCache.has(key)) {
    stageTexts = stageCache.get(key);
  } else {
    const variants = getTitleVariants(currentAnime);
    const syn = currentAnime.synopsis || "";
    const pack = [
      buildHardPP(syn, variants),
      buildMedium(syn, variants),
      buildFull(syn),
    ];
    stageCache.set(key, pack);
    stageTexts = pack;
  }

  renderStage();
}

function renderStage() {
  synopsisBadgeEl.textContent = STAGE_LABELS[stageIndex];
  synopsisStepEl.textContent = `Indice ${stageIndex + 1} / 3`;
  synopsisTextEl.textContent = stageTexts[stageIndex] || "Synopsis indisponible.";
  setScoreBar(STAGE_SCORES[stageIndex]);
}

// ====== Guess logic ======
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
    input.focus();
    suggestions.innerHTML = "";
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
  const score = STAGE_SCORES[stageIndex];
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
    <div style="width:100%;max-width:520px;text-align:center;">
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

// ====== Autocomplete ======
input.addEventListener("input", function () {
  if (gameEnded) return;

  const val = this.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  feedback.textContent = "";
  submitBtn.disabled = true;

  if (!val) return;

  const matches = titlesList.filter(t => t.toLowerCase().includes(val)).slice(0, 7);
  for (const title of matches) {
    const div = document.createElement("div");
    div.innerHTML = `<span>${title.replace(new RegExp(escapeRegExp(val), "i"), (m) => `<b>${m}</b>`)}</span>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = title;
      suggestions.innerHTML = "";
      submitBtn.disabled = false;
      input.focus();
    });
    suggestions.appendChild(div);
  }

  submitBtn.disabled = !titlesLowerSet.has(val);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !submitBtn.disabled && !gameEnded) checkGuess();
});
submitBtn.addEventListener("click", checkGuess);

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
