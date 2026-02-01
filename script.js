// ========== THEME (DARK/LIGHT) ==========
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

// ========== TOOLTIP (? AIDE) ==========
// Empêche le clic sur "?" d’ouvrir le lien du jeu
document.addEventListener("click", (e) => {
  if (e.target.closest(".info-icon")) {
    e.preventDefault();
    e.stopPropagation();
  }
});

// ========== RESET PERSONNALISATIONS (MINI-JEUX + PARCOURS) ==========
// Objectif : quand on repasse par le hub, on reset les configs "v1" des mini-jeux
// et on reset aussi tout le Parcours, sans casser le thème.
function resetMiniGamesPersonalisation() {
  // On garde uniquement le thème
  const KEEP_EXACT = new Set(["theme"]);

  // Ciblage des clés de config des mini-jeux (versions v1)
  const PERSONAL_KEYS_SUFFIX = [
    "_filters_v1",
    "_settings_v1",
    "_config_v1",
  ];

  Object.keys(localStorage).forEach((k) => {
    if (KEEP_EXACT.has(k)) return;

    const lower = k.toLowerCase();
    const isPersonalV1 = PERSONAL_KEYS_SUFFIX.some((s) => lower.endsWith(s));

    // ✅ Nouveau : on reset aussi toutes les clés du Parcours
    const isParcours = k.startsWith("AG_parcours_");

    if (isPersonalV1 || isParcours) {
      localStorage.removeItem(k);
    }
  });
}

// ========== INITIALISATION ==========
window.addEventListener("DOMContentLoaded", () => {
  // Reset des personnalisations des mini-jeux + Parcours à chaque passage sur le hub
  resetMiniGamesPersonalisation();

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.add("light");
  }
});
