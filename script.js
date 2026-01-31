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

// ========== RESET PERSONNALISATIONS (MINI-JEUX) ==========
// Objectif : quand on repasse par le hub, on reset les configs "v1" des mini-jeux
// sans casser le thème et sans toucher au Parcours.
function resetMiniGamesPersonalisation() {
  const KEEP_EXACT = new Set([
    "theme",
    "AG_parcours_filters", // on garde la config globale du parcours
  ]);

  const KEEP_PREFIXES = [
    "AG_parcours_", // tout ce qui commence par ce préfixe = parcours
  ];

  // Ciblage des clés de config des mini-jeux (versions v1)
  const PERSONAL_KEYS_SUFFIX = [
    "_filters_v1",
    "_settings_v1",
    "_config_v1",
  ];

  Object.keys(localStorage).forEach((k) => {
    if (KEEP_EXACT.has(k)) return;
    if (KEEP_PREFIXES.some((p) => k.startsWith(p))) return;

    const lower = k.toLowerCase();
    const isPersonal = PERSONAL_KEYS_SUFFIX.some((s) => lower.endsWith(s));

    if (isPersonal) localStorage.removeItem(k);
  });
}

// ========== INITIALISATION ==========
window.addEventListener("DOMContentLoaded", () => {
  // Reset des personnalisations des mini-jeux à chaque passage sur le hub
  resetMiniGamesPersonalisation();

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.add("light");
  }
});
