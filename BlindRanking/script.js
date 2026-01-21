/**********************
 * Blind Ranking (v2)
 * - Dataset: ../data/licenses_only.json
 * - Personnalisation: popularité/score/années/types + mode (Animes / Songs)
 * - Songs: OP/ED/IN (multi-select) — par défaut: Opening uniquement
 **********************/

/* =========================
   MENU + THEME
========================= */
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

/* =========================
   TOOLTIP HELP
========================= */
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

/* =========================
   HELPERS DATA
========================= */
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
  const s = (a.season || "").trim(); // ex: "spring 2013"
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

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function extractSongsFromAnime(anime) {
  const songs = [];
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

      const artistsArr = Array.isArray(it.artists) ? it.artists : [];
      const artist = artistsArr.join(", ");

      songs.push({
        id: `${anime.mal_id || "x"}-${b.type}-${safeNum(it.number) || 1}-${(it.name || "").slice(0, 60)}-${url.slice(-18)}`,
        mode: "song",
        songType: b.type,                 // OP/ED/IN
        songNumber: safeNum(it.number) || 1,
        songName: it.name || "",
        songArtist: artist || "",
        url,

        // infos anime liées (pour filtres + affichage)
        animeMalId: anime.mal_id ?? null,
        animeTitle: anime._title,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,
      });
    }
  }

  return songs;
}

/* =========================
   DOM REFS
========================= */
const customPanel = document.getElementById("custom-panel");
const gamePanel = document.getElementById("game-panel");

const previewCountEl = document.getElementById("previewCount");
const applyBtn = document.getElementById("applyFiltersBtn");

const popEl = document.getElementById("popPercent");
const scoreEl = document.getElementById("scorePercent");
const yearMinEl = document.getElementById("yearMin");
const yearMaxEl = document.getElementById("yearMax");

const popValEl = document.getElementById("popPercentVal");
const scoreValEl = document.getElementById("scorePercentVal");
const yearMinValEl = document.getElementById("yearMinVal");
const yearMaxValEl = document.getElementById("yearMaxVal");

const songsRow = document.getElementById("songs-row");

const rankingListEl = document.getElementById("ranking-list");
const animeItemEl = document.getElementById("anime-item");
const animeImgEl = document.getElementById("anime-img");
const animeNameEl = document.getElementById("anime-name");

const playerZoneEl = document.getElementById("player-zone");
const mediaPlayerEl = document.getElementById("media-player");
const playerLoaderEl = document.getElementById("player-loader");

const nextBtn = document.getElementById("next-btn");
const rankSectionEl = document.getElementById("rank-section");

/* =========================
   MODE + PILLS
========================= */
let rankingMode = "anime"; // "anime" | "song"

const modeAnimeBtn = document.getElementById("mode-anime");
const modeSongBtn = document.getElementById("mode-opening"); // bouton “Songs” dans notre HTML

function setMode(newMode) {
  rankingMode = newMode;

  // pills UI (exclusive)
  modeAnimeBtn.classList.toggle("active", rankingMode === "anime");
  modeAnimeBtn.setAttribute("aria-pressed", rankingMode === "anime" ? "true" : "false");

  modeSongBtn.classList.toggle("active", rankingMode === "song");
  modeSongBtn.setAttribute("aria-pressed", rankingMode === "song" ? "true" : "false");

  // show/hide songs row
  if (songsRow) songsRow.style.display = rankingMode === "song" ? "flex" : "none";

  updatePreview();
}

modeAnimeBtn.addEventListener("click", () => setMode("anime"));
modeSongBtn.addEventListener("click", () => setMode("song"));

/* Song pills (multi-select, min 1) */
function getActiveSongTypes() {
  return [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);
}
function ensureAtLeastOneSongType(clickedBtn = null) {
  const active = getActiveSongTypes();
  if (active.length > 0) return;

  // si plus rien, on remet Opening par défaut
  const opBtn =
    document.querySelector('#songPills .pill[data-song="OP"]') ||
    clickedBtn ||
    document.querySelector("#songPills .pill");

  if (opBtn) {
    opBtn.classList.add("active");
    opBtn.setAttribute("aria-pressed", "true");
  }
}

/* =========================
   UI SHOW/HIDE
========================= */
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}

function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

/* =========================
   DATA + FILTERS
========================= */
const MIN_REQUIRED_ITEMS = 10;

let allAnimes = [];
let allSongs = [];
let filteredPool = []; // items (animes ou songs)

/* Apply filters → retourne items */
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map(
    (b) => b.dataset.type
  );
  if (allowedTypes.length === 0) return [];

  if (rankingMode === "anime") {
    // 1) filtre base
    let pool = allAnimes.filter((a) => {
      return a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type);
    });

    // 2) top pop%
    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    // 3) top score%
    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    // map format item pour le jeu
    return pool.map((a) => ({
      id: `anime-${a.mal_id ?? a._titleLower}`,
      mode: "anime",
      title: a._title,
      image: a.image || "",
      animeType: a._type,
      animeYear: a._year,
      animeMembers: a._members,
      animeScore: a._score,
      mal_id: a.mal_id ?? null,
    }));
  }

  // rankingMode === "song"
  const allowedSongs = getActiveSongTypes(); // OP/ED/IN
  if (allowedSongs.length === 0) return [];

  // 1) filtre base
  let pool = allSongs.filter((s) => {
    return (
      s.animeYear >= yearMin &&
      s.animeYear <= yearMax &&
      allowedTypes.includes(s.animeType) &&
      allowedSongs.includes(s.songType)
    );
  });

  // 2) top pop% (au niveau anime, via champ animeMembers déjà injecté)
  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // 3) top score%
  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
}

function updatePreview() {
  const pool = applyFilters();
  const ok = pool.length >= MIN_REQUIRED_ITEMS;

  const label =
    rankingMode === "anime"
      ? `🧩 Titres disponibles : ${pool.length} ${ok ? "(OK)" : `(Min ${MIN_REQUIRED_ITEMS})`}`
      : `🎵 Songs disponibles : ${pool.length} ${ok ? "(OK)" : `(Min ${MIN_REQUIRED_ITEMS})`}`;

  previewCountEl.textContent = label;
  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

/* =========================
   GAME STATE
========================= */
let selectedItems = [];
let currentIndex = 0;
let rankings = new Array(10).fill(null);

function pick10FromPool(pool) {
  const copy = [...pool];
  shuffleInPlace(copy);
  const picked = [];
  const used = new Set();

  for (const it of copy) {
    if (picked.length >= 10) break;
    const key = it.id || JSON.stringify(it).slice(0, 80);
    if (used.has(key)) continue;
    used.add(key);
    picked.push(it);
  }

  return picked;
}

function resetRankButtons() {
  for (let i = 1; i <= 10; i++) {
    const btn = document.getElementById(`rank-${i}`);
    if (!btn) continue;
    btn.disabled = false;
  }
}

function lockRankButton(rank) {
  const btn = document.getElementById(`rank-${rank}`);
  if (btn) btn.disabled = true;
}

/* =========================
   RENDER
========================= */
function renderRankingList() {
  rankingListEl.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const item = rankings[i];

    // placeholder
    if (!item) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div style="width:98%;height:210px;opacity:0.10;background:#ccc;display:inline-block;border-radius:10px;margin:7px 0 5px 0;"></div>
        <span>Rang ${i + 1}</span>
      `;
      rankingListEl.appendChild(li);
      continue;
    }

    const li = document.createElement("li");

    if (item.mode === "anime") {
      const img = item.image
        ? `<img src="${item.image}" alt="${escapeHtml(item.title)}">`
        : `<div style="width:98%;height:210px;opacity:0.10;background:#ccc;display:inline-block;border-radius:10px;margin:7px 0 5px 0;"></div>`;

      li.innerHTML = `
        ${img}
        <span>Rang ${i + 1}: ${escapeHtml(item.title)}</span>
      `;
    } else {
      // song
      const src = item.url || "";
      li.innerHTML = `
        <video src="${src}" controls preload="metadata"
          style="border-radius:10px;width:98%;height:210px;object-fit:cover;background:#222;box-shadow:0 2px 12px #1114;margin:7px 0 5px 0;">
        </video>
        <span>Rang ${i + 1}: ${escapeHtml(item.songName || "Song")}</span>
      `;
    }

    rankingListEl.appendChild(li);
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stopMedia() {
  try {
    mediaPlayerEl.pause();
  } catch {}
  mediaPlayerEl.removeAttribute("src");
  mediaPlayerEl.load();
}

function showLoader(show) {
  if (!playerLoaderEl) return;
  playerLoaderEl.style.display = show ? "flex" : "none";
}

function displayCurrentItem() {
  stopMedia();
  showLoader(false);

  if (currentIndex >= selectedItems.length) {
    // fin
    rankSectionEl.style.display = "none";
    animeItemEl.style.display = "none";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Rejouer";
    nextBtn.onclick = () => startNewRanking(); // même filtres
    return;
  }

  const item = selectedItems[currentIndex];
  animeItemEl.style.display = "flex";
  rankSectionEl.style.display = "block";
  nextBtn.style.display = "none";

  if (item.mode === "anime") {
    // anime
    animeNameEl.textContent = item.title || "Titre";
    animeImgEl.style.display = item.image ? "block" : "none";
    animeImgEl.src = item.image || "";

    if (playerZoneEl) playerZoneEl.style.display = "none";
  } else {
    // song
    animeNameEl.textContent = item.songName || "Song";
    animeImgEl.style.display = "none";
    animeImgEl.src = "";

    if (playerZoneEl) playerZoneEl.style.display = "block";

    // charger video
    const src = item.url || "";
    if (!src) return;

    showLoader(true);
    mediaPlayerEl.src = src;
    mediaPlayerEl.load();

    mediaPlayerEl.onloadeddata = () => {
      showLoader(false);
      // tentative autoplay (souvent bloquée, ok)
      mediaPlayerEl.play().catch(() => {});
    };
    mediaPlayerEl.onerror = () => {
      showLoader(false);
      // si une song est cassée, on la skip
      currentIndex += 1;
      displayCurrentItem();
    };
  }
}

/* =========================
   ACTIONS
========================= */
function assignRank(rank) {
  if (rankings[rank - 1] !== null) {
    alert("Ce rang a déjà été attribué !");
    return;
  }

  const current = selectedItems[currentIndex];
  rankings[rank - 1] = current;

  lockRankButton(rank);
  renderRankingList();

  currentIndex += 1;
  displayCurrentItem();
}

function wireRankButtons() {
  for (let i = 1; i <= 10; i++) {
    const btn = document.getElementById(`rank-${i}`);
    if (!btn) continue;
    btn.onclick = () => assignRank(i);
  }
}

function startNewRanking() {
  // construit pool depuis les filtres
  filteredPool = applyFilters();

  // sécurité
  if (filteredPool.length < MIN_REQUIRED_ITEMS) {
    alert(`Pas assez d'items disponibles (min ${MIN_REQUIRED_ITEMS}).`);
    showCustomization();
    return;
  }

  selectedItems = pick10FromPool(filteredPool);
  currentIndex = 0;
  rankings = new Array(10).fill(null);

  resetRankButtons();
  renderRankingList();

  showGame();
  displayCurrentItem();
}

/* =========================
   INIT CUSTOM UI
========================= */
function initCustomUI() {
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }

  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));

  // type pills (multi-select min 1)
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");

      // min 1
      const active = document.querySelectorAll("#typePills .pill.active");
      if (active.length === 0) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }

      updatePreview();
    });
  });

  // song pills (multi-select min 1) — seulement utile en mode song
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      ensureAtLeastOneSongType(btn);
      updatePreview();
    });
  });

  applyBtn.addEventListener("click", () => {
    startNewRanking();
  });

  // mode default
  setMode("anime");
  syncLabels();
}

/* =========================
   LOAD DATASET
========================= */
fetch("../data/licenses_only.json")
  .then((r) => r.json())
  .then((data) => {
    const raw = Array.isArray(data) ? data : [];

    allAnimes = raw.map((a) => {
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

    allSongs = [];
    for (const a of allAnimes) {
      allSongs.push(...extractSongsFromAnime(a));
    }

    wireRankButtons();
    initCustomUI();
    showCustomization();
    updatePreview();
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });
