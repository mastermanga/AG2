/**********************
 * Higher or Lower (STAT ONLY)
 * - Thème aléatoire (Popularité / Score / Saison), jamais le même 2 fois d’affilée
 * - Anti-égalité : interdit les duels où la valeur est exactement égale
 * - Score : +100 / bon choix ; 1 erreur = fin
 * - Anti-boucle : si un anime gagne 3 duels d’affilée -> on retire le gagnant et on garde le perdant comme champion
 **********************/

// ====== MENU & THEME ======
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

// ====== TOOLTIP ======
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

// ====== HELPERS ======
const MIN_REQUIRED = 64;
const POINTS_PER_WIN = 100;

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
  const s = ((a && a.season) ? String(a.season) : "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
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
function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

// ====== DOM ======
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

const roundLabel = document.getElementById("roundLabel");
const scoreBox = document.getElementById("scoreBox");

const promptLine = document.getElementById("promptLine");
const leftPick = document.getElementById("leftPick");
const rightPick = document.getElementById("rightPick");
const leftImg = document.getElementById("leftImg");
const rightImg = document.getElementById("rightImg");
const leftTitle = document.getElementById("leftTitle");
const rightTitle = document.getElementById("rightTitle");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

// ====== DATA ======
let allAnimes = [];

// ====== GAME STATE ======
let filteredPool = [];
let totalRounds = 100;
let roundIndex = 1;
let score = 0;

let champion = null;   // gauche
let challenger = null; // droite

let lastThemeKey = null;
let currentThemeKey = null;

let championStreak = 0;
let bannedKeyOnce = null;

// ====== STAT THEMES ======
const STAT_THEMES = [
  { key: "members", prompt: "Trouver l’anime le plus populaire" },
  { key: "score",   prompt: "Trouver l’anime le mieux noté" },
  { key: "year",    prompt: "Trouver l’anime le plus récent" },
];

function themeByKey(k) {
  return STAT_THEMES.find(t => t.key === k) || STAT_THEMES[0];
}
function pickNewTheme(exceptKey) {
  const choices = STAT_THEMES.map(t => t.key).filter(k => k !== exceptKey);
  return choices[Math.floor(Math.random() * choices.length)];
}
function getStatValue(it, key) {
  if (!it) return 0;
  if (key === "members") return safeNum(it.members);
  if (key === "score") return safeNum(it.score);
  if (key === "year") return safeNum(it.year);
  return 0;
}
function winnerSideByTheme(leftIt, rightIt, key) {
  const L = getStatValue(leftIt, key);
  const R = getStatValue(rightIt, key);
  if (L === R) return "tie";
  return L > R ? "left" : "right";
}

// ====== UI SHOW/HIDE ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);
  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map(b => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  let pool = allAnimes.filter(a =>
    a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type)
  );

  pool.sort((a, b) => b._members - a._members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b._score - a._score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool.map(a => ({
    _key: `anime|${a.mal_id}`,
    title: a._title,
    image: a.image || "",
    year: a._year,
    members: a._members,
    score: a._score,
    type: a._type
  }));
}

// ====== PREVIEW ======
function updatePreview() {
  if (!allAnimes.length) {
    previewCountEl.textContent = "⏳ Chargement de la base…";
    previewCountEl.classList.add("bad");
    previewCountEl.classList.remove("good");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    return;
  }

  const pool = applyFilters();
  const minNeeded = Math.max(2, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;

  previewCountEl.textContent = ok
    ? `📚 Animes disponibles : ${pool.length} (OK)`
    : `📚 Animes disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== PICK HELPERS ======
function pickRandom(pool, avoidKey = null, avoidKey2 = null) {
  if (!pool || pool.length === 0) return null;
  const shuffled = shuffleInPlace([...pool]);
  for (const it of shuffled) {
    const k = it._key;
    if (avoidKey && k === avoidKey) continue;
    if (avoidKey2 && k === avoidKey2) continue;
    return it;
  }
  return shuffled[0];
}

// ✅ Anti-égalité stricte
function pickChallengerNoTie(pool, champ, themeKey, bannedKey) {
  if (!pool || pool.length < 2 || !champ) return null;

  const champKey = champ._key;
  const champVal = getStatValue(champ, themeKey);

  let candidates = pool.filter(it =>
    it._key !== champKey &&
    (!bannedKey || it._key !== bannedKey) &&
    getStatValue(it, themeKey) !== champVal
  );

  if (candidates.length === 0 && bannedKey) {
    candidates = pool.filter(it =>
      it._key !== champKey &&
      getStatValue(it, themeKey) !== champVal
    );
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ====== GAME UI ======
function updateTopLabels() {
  roundLabel.textContent = `Round ${roundIndex} / ${totalRounds}`;
  scoreBox.textContent = `🔥 Score : ${score}`;
}
function updatePrompt() {
  promptLine.textContent = themeByKey(currentThemeKey).prompt;
}
function renderDuel() {
  updateTopLabels();
  updatePrompt();

  leftImg.src = champion?.image || "";
  rightImg.src = challenger?.image || "";
  leftTitle.textContent = champion?.title || "";
  rightTitle.textContent = challenger?.title || "";

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  leftPick.disabled = false;
  rightPick.disabled = false;
}

// ====== START GAME ======
function startGame() {
  showGame();

  filteredPool = applyFilters();
  const minNeeded = Math.max(2, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  totalRounds = clampInt(parseInt(roundCountEl.value || "100", 10), 1, 999);
  roundIndex = 1;
  score = 0;
  championStreak = 0;
  lastThemeKey = null;
  currentThemeKey = null;
  bannedKeyOnce = null;

  let ok = false;
  for (let tries = 0; tries < 60 && !ok; tries++) {
    const c = pickRandom(filteredPool);
    const t = pickNewTheme(null);
    const ch = pickChallengerNoTie(filteredPool, c, t, null);
    if (c && ch) {
      champion = c;
      currentThemeKey = t;
      challenger = ch;
      ok = true;
    }
  }

  if (!ok) {
    resultDiv.textContent = "❌ Impossible de créer un duel sans égalité avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => { showCustomization(); updatePreview(); };
    return;
  }

  renderDuel();
}

// ====== PICK ======
function endGame() {
  nextBtn.style.display = "block";
  nextBtn.textContent = "Retour réglages";
  nextBtn.onclick = () => { showCustomization(); updatePreview(); };
}

function handlePick(side) {
  if (!champion || !challenger) return;

  leftPick.disabled = true;
  rightPick.disabled = true;

  const winSide = winnerSideByTheme(champion, challenger, currentThemeKey);

  if (winSide === "tie") {
    challenger = pickChallengerNoTie(filteredPool, champion, currentThemeKey, bannedKeyOnce);
    if (!challenger) {
      resultDiv.textContent = "❌ Impossible d’éviter une égalité sur ce thème.";
      endGame();
      return;
    }
    renderDuel();
    return;
  }

  const correct = (side === winSide);
  const winner = (winSide === "left") ? champion : challenger;
  const loser  = (winSide === "left") ? challenger : champion;

  if (!correct) {
    resultDiv.textContent = `❌ Mauvais ! Score final : ${score}`;
    endGame();
    return;
  }

  score += POINTS_PER_WIN;
  resultDiv.textContent = "✅ Correct !";

  const wasChampionKey = champion?._key || null;
  champion = winner;

  if ((champion?._key || null) === wasChampionKey) championStreak++;
  else championStreak = 1;

  bannedKeyOnce = null;
  if (championStreak >= 3) {
    bannedKeyOnce = champion?._key || null;
    champion = loser;
    championStreak = 0;
    resultDiv.textContent += " — 🔁 Swap anti-boucle (3 wins) !";
  }

  if (roundIndex >= totalRounds) {
    updateTopLabels();
    nextBtn.style.display = "block";
    nextBtn.textContent = "Terminer";
    nextBtn.onclick = () => {
      resultDiv.textContent = `✅ Terminé ! Score final : ${score} / ${totalRounds * POINTS_PER_WIN}`;
      endGame();
    };
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Suivant";
  nextBtn.onclick = () => {
    roundIndex++;

    lastThemeKey = currentThemeKey;
    currentThemeKey = pickNewTheme(lastThemeKey);

    challenger = pickChallengerNoTie(filteredPool, champion, currentThemeKey, bannedKeyOnce);
    if (!challenger) {
      let found = false;
      let tmpLast = currentThemeKey;
      for (let i = 0; i < 5 && !found; i++) {
        const alt = pickNewTheme(tmpLast);
        const cand = pickChallengerNoTie(filteredPool, champion, alt, bannedKeyOnce);
        if (cand) {
          currentThemeKey = alt;
          challenger = cand;
          found = true;
        }
        tmpLast = alt;
      }
      if (!found) {
        resultDiv.textContent = "❌ Impossible de créer un duel sans égalité avec ces filtres.";
        endGame();
        return;
      }
    }

    renderDuel();
  };

  updateTopLabels();
}

// ====== INIT UI ======
function initCustomUI() {
  document.querySelectorAll("#typePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach(el => el.addEventListener("input", syncLabels));

  applyBtn.addEventListener("click", () => {
    filteredPool = applyFilters();
    const minNeeded = Math.max(2, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;
    startGame();
  });

  leftPick.addEventListener("click", () => handlePick("left"));
  rightPick.addEventListener("click", () => handlePick("right"));

  syncLabels();
}

// ====== LOAD DATA ======
fetch("../data/licenses_only.json")
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then(json => {
    const raw = normalizeAnimeList(json);

    allAnimes = (Array.isArray(raw) ? raw : []).map(a => {
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

    initCustomUI();
    updatePreview();
    showCustomization();
  })
  .catch(e => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    console.error(e);
  });
