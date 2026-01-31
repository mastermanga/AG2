/**********************
 * Left or Right (Anime / Songs) — Duels indépendants
 * ✅ Thème contenu à CHAQUE DUEL (round indépendant)
 * ✅ Feedback visuel de choix (néon vert + loser grisé)
 * ✅ Gestion vidéo type Tournament (token session + retry + snippetended)
 *
 * ✅ PARCOURS (ajout, sans casser standard)
 * - si ?parcours=1 : masque menu + masque réglages + auto-start
 * - applique params URL + fallback localStorage AG_parcours_filters
 * - fin: bouton "Continuer le parcours" + postMessage parcoursScore
 **********************/

/* =======================
   PARCOURS (URL PARAMS)
   ======================= */
const urlParams = new URLSearchParams(window.location.search);
const IS_PARCOURS = urlParams.get("parcours") === "1";

const FORCED_MODE = urlParams.get("mode"); // "anime" | "songs"
const PARAM_TYPES = urlParams.get("types"); // ex: "TV,Movie"
const PARAM_SONGS = urlParams.get("songs"); // ex: "opening,ending,insert" OU "OP,ED,IN"
const PARAM_POP = urlParams.get("popPercent") || urlParams.get("pop") || urlParams.get("popularity");
const PARAM_SCORE = urlParams.get("scorePercent") || urlParams.get("score");
const PARAM_YMIN = urlParams.get("yearMin") || urlParams.get("yMin");
const PARAM_YMAX = urlParams.get("yearMax") || urlParams.get("yMax");
const PARAM_DUELS = urlParams.get("duels") || urlParams.get("roundCount") || urlParams.get("rounds");

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

function sendParcoursScore(score = 1, total = 1) {
  if (parcoursSent) return;
  parcoursSent = true;

  try {
    parent.postMessage(
      {
        parcoursScore: {
          label: "Left or Right",
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

if (IS_PARCOURS) {
  document.body.classList.add("parcours");

  const backBtn = document.getElementById("back-to-menu");
  if (backBtn) backBtn.style.display = "none";

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "none";

  const game = document.getElementById("game-panel");
  if (game) game.style.display = "block";
}

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
    document.querySelectorAll(".info-wrap.open").forEach((w) => w.classList.remove("open"));
  }
});

// =======================
// SETTINGS THEME CONTENU
// =======================
const THEME_MIN_SIZE = 2;
const THEME_POOL_SIZE = 2;

const CLIP_START_S = 45;
const CLIP_DURATION_S = 30;
const CLIP_EPS = 0.05;

const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const LOAD_TIMEOUT_MS = 6000;

// ====== HELPERS ======
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
function getYearFromSeasonStr(seasonStr, fallback = 0) {
  const s = String(seasonStr || "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : (fallback || 0);
}
function clampYearSliders() {
  let a = parseInt(yearMinEl.value, 10);
  let b = parseInt(yearMaxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    yearMinEl.value = a;
    yearMaxEl.value = b;
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
function round1(x) {
  return Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
}
function norm(s) {
  return (s || "").toString().trim().toLowerCase();
}
function includesStudio(studio, needle) {
  const s = norm(studio);
  const n = norm(needle);
  if (!s || !n) return false;
  return s.includes(n);
}
function extractTagNames(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") out.push(it);
    else if (typeof it.name === "string") out.push(it.name);
  }
  return out.map((x) => String(x).trim()).filter(Boolean);
}

function songTypeLabel(t) {
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "IN";
}
function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = s.songNumber ? `${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const art = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${s.animeTitle || "Anime"} ${type}${num}${name}${art}`;
}

// ====== SONG EXTRACTION ======
function extractSongsFromAnime(anime) {
  const out = [];
  const song = anime.song || {};
  const buckets = [
    { key: "openings", type: "OP" },
    { key: "endings", type: "ED" },
    { key: "inserts", type: "IN" },
  ];
  for (const b of buckets) {
    const arr = Array.isArray(song[b.key]) ? song[b.key] : [];
    for (const it of arr) {
      const url = it.video || it.url || "";
      if (!url || typeof url !== "string" || url.length < 6) continue;

      const artistsArr = Array.isArray(it.artists) ? it.artists.filter(Boolean) : [];
      const artists = artistsArr.join(", ");

      const songSeason = String(it.season || "").trim();
      const songYear = getYearFromSeasonStr(songSeason, anime._year);

      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",
        artistsArr,
        songSeason,
        songYear,
        url,

        animeId: anime.mal_id || null,
        animeTitle: anime._title || "",
        image: anime.image || "",
        year: anime._year,
        members: anime._members,
        score: anime._score,
        type: anime._type,

        studio: anime._studio || "",
        tags: Array.isArray(anime._tags) ? anime._tags : [],

        _key: `song|${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
      });
    }
  }
  return out;
}

/* ... (le reste du fichier est IDENTIQUE à ma version précédente) ... */

/* =======================
   IMPORTANT: ✅ modifications du défaut à 1
   - 1) init variables
   - 2) updatePreview fallback
   - 3) click apply fallback
   - 4) startGame fallback
   - 5) autostart parcours fallback
   ======================= */

// ====== SETTINGS ======
let currentMode = "anime";
let totalDuels = 1;      // ✅ au lieu de 10
let duelIndex = 1;

/* ... */

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
  const duelsWanted = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100); // ✅ "1"

  const ok = pool.length >= 2;
  const label = currentMode === "songs" ? "Songs" : "Animes";

  previewCountEl.textContent = ok
    ? `📚 ${label} disponibles : ${pool.length} (OK) — Duels demandés: ${duelsWanted}`
    : `📚 ${label} disponibles : ${pool.length} (Min 2)`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

/* ... */

// Apply
applyBtn.addEventListener("click", () => {
  const pool = applyFilters();
  totalDuels = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100); // ✅ "1"
  if (!pool || pool.length < 2) return;
  startGame();
});

/* ... */

function startGame() {
  resetDuelUI();
  showGame();
  setupModeUI();

  totalDuels = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100); // ✅ "1"
  duelIndex = 1;

  const ok = generateNewDuelPair();
  if (!ok) {
    if (IS_PARCOURS) {
      parcoursAbort("❌ Pas assez d’items (min 2) avec ces réglages.", 0, 1);
      return;
    }
    finishGame("❌ Pas assez d’items (min 2) avec ces réglages.");
    return;
  }

  renderDuel();
}

/* ... */

// Dans le fetch success (autostart parcours)
if (IS_PARCOURS) {
  applyParcoursParamsToUI();

  const pool = applyFilters();
  totalDuels = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100); // ✅ "1"

  if (!pool || pool.length < 2) {
    parcoursAbort("❌ Pool insuffisant : min 2 items avec ces réglages.", 0, 1);
    return;
  }

  startGame();
} else {
  showCustomization();
}
