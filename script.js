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

// ========== INITIALISATION ==========
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.add("light");
  }
});
