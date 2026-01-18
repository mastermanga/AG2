// ========== THEME (DARK/LIGHT) ==========
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

// ========== DAILY RECAP SYSTEM ==========

// Helper pour obtenir la date du jour sous forme 'YYYY-MM-DD' (locale)
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Purge toutes les clés daily qui ne sont pas du jour
function purgeOldDailyData() {
  const today = getTodayString();

  Object.keys(localStorage).forEach(key => {
    if (
      (key.startsWith("dailyScore_") || key.startsWith("dailyStarted_")) &&
      !key.endsWith("_" + today)
    ) {
      localStorage.removeItem(key);
    }
  });
}

// Charge le score daily pour un jeu donné
function getDailyScoreFor(gameKey) {
  const today = getTodayString();
  const scoreKey = `dailyScore_${gameKey}_${today}`;
  const startedKey = `dailyStarted_${gameKey}_${today}`;

  const value = localStorage.getItem(scoreKey);
  if (value !== null) {
    if (!isNaN(Number(value))) return Number(value);
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "number") return parsed;
      if (typeof parsed === "object" && typeof parsed.score === "number") return parsed.score;
    } catch {}
    return null;
  }
  // NO SCORE but started for today => failed = 0 pts
  if (localStorage.getItem(startedKey)) {
    return 0;
  }
  return null;
}

// Affiche le récap du daily sur la page d’accueil
function loadDailyRecap() {
  const recapFields = [
    { key: "anidle", label: "Anidle", el: document.getElementById("recap-anidle") },
    { key: "openingquizz", label: "OpeningQuizz", el: document.getElementById("recap-openingquizz") },
    { key: "characterquizz", label: "CharacterQuizz", el: document.getElementById("recap-characterquizz") }
  ];

  let total = 0;
  let playedAny = false;

  recapFields.forEach(field => {
    const score = getDailyScoreFor(field.key);
    if (score != null) {
      field.el.textContent = score + " pts";
      total += score;
      playedAny = true;
    } else {
      field.el.textContent = "Non joué";
    }
  });

  // Total
  const recapTotal = document.getElementById("recap-total");
  recapTotal.textContent = playedAny ? (total + " pts") : "Aucun jeu fait aujourd’hui";
}

// ========== TOOLTIP (? AIDE) ==========
// Empêche le clic sur "?" d’ouvrir le lien du jeu
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("info-icon")) {
    e.preventDefault();
    e.stopPropagation();
  }
});

// ========== INITIALISATION ==========
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.add("light");
  }
  purgeOldDailyData();
  loadDailyRecap();
});
