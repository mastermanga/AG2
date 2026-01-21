/**********************
 * Blind Ranking
 * - Dataset unique: ../data/licenses_only.json
 * - Personnalisation: mode(anime/songs) + popularité/score/années/types + songs(OP/ED/IN)
 * - Min requis: 64 (anime OU songs) + et toujours >= 10 pour jouer
 * - Rounds: 1 → 100 (défaut 1)
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
  const s = (a.season || "").։

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

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

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

      out.push({
        kind: "song",
        songType: b.type, // OP/ED/IN
        songName: it.name || "",
        songNumber: Number.isFinite(+it.number) ? +it.number : 0,
        songArtists: Array.isArray(it.artists) ? it.artists.join(", ") : "",

        // anime meta
        animeMalId: anime.mal_id ?? null,
        animeTitle: anime._title,
        animeTitleLower: anime._titleLower,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

        // media
        url,
        _key: `${b.type}|${it.number || ""}|${it.name || ""}|${url}`,
      });
    }
  }
  return out;
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

const songsRow = document.getElementById("songsRow");
const previewCountEl = document.getElementById("previewCount");
const applyBtn = document.getElementById("applyFiltersBtn");
const roundCountEl = document.getElementById("roundCount");

const rankingList = document.getElementById("ranking-list");
const animeImg = document.getElementById("anime-img");
const itemName = document.getElementById("item-name");

const playerZone = document.getElementById("player-zone");
const songPlayer = document.getElementById("songPlayer");

const rankButtonsWrap = document.getElementById("rankButtons");
const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");
const roundLabel = document.getElementById("roundLabel");

// ====== URL (PARCOURS) compat ======
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
const forcedMode = urlParams.get("mode"); // "anime" | "songs" éventuel

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime"; // anime | songs

// pool filtré (items jouables)
let filteredPool = [];

// ====== GAME STATE ======
let totalRounds = 1;
let currentRound = 1;

let selectedItems = [];          // 10 items de la partie
let currentIndex = 0;            // item courant 0..9
let rankings = new Array(10).fill(null); // stocke l’item choisi à ce rang (objet)

// ====== UI SHOW/HIDE ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== UI INIT ======
function initCustomUI() {
  // Pills mode
  document.querySelectorAll("#modePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modePills .pill").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      currentMode = btn.dataset.mode; // anime | songs
      updateModeVisibility();
      updatePreview();
    });
  });

  // Type pills
  document.querySelectorAll("#typePills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Song pills
  document.querySelectorAll("#songPills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Sliders sync
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach(el => el.addEventListener("input", syncLabels));

  // Apply
  applyBtn.addEventListener("click", () => {
    filteredPool = applyFilters();

    // min requis
    const minNeeded = Math.max(10, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    // rounds
    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;

    // parcours override
    if (isParcours) {
      totalRounds = clampInt(parcoursCount, 1, 100);
      if (forcedMode === "anime" || forcedMode === "songs") currentMode = forcedMode;
      updateModePillsFromState();
    }

    showGame();
    startRound();
  });

  // Rank buttons events
  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(btn => {
    btn.addEventListener("click", () => {
      const r = parseInt(btn.dataset.rank, 10);
      assignRank(r);
    });
  });

  // defaults forced mode
  if (forcedMode === "anime" || forcedMode === "songs") {
    currentMode = forcedMode;
    updateModePillsFromState();
  }

  updateModeVisibility();
  syncLabels();
}

function updateModePillsFromState() {
  document.querySelectorAll("#modePills .pill").forEach(b => {
    const active = b.dataset.mode === currentMode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  updateModeVisibility();
}

function updateModeVisibility() {
  // Songs row visible uniquement en mode songs
  songsRow.style.display = (currentMode === "songs") ? "flex" : "none";
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map(b => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  if (currentMode === "anime") {
    // base
    let pool = allAnimes.filter(a =>
      a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type)
    );

    // top pop%
    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    // top score%
    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    // map items
    return pool.map(a => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      title: a._title,
      image: a.image || ""
    }));
  }

  // songs mode
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map(b => b.dataset.song);
  if (allowedSongs.length === 0) return [];

  let pool = allSongs.filter(s =>
    s.animeYear >= yearMin &&
    s.animeYear <= yearMax &&
    allowedTypes.includes(s.animeType) &&
    allowedSongs.includes(s.songType)
  );

  // top pop% (animeMembers)
  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  // top score% (animeScore)
  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  // ✅ IMPORTANT: en songs on affiche le NOM DE L'ANIME, pas le nom de la song
  return pool.map(s => ({
    kind: "song",
    _key: `song|${s._key}`,

    // ✅ affichage
    title: s.animeTitle || "Anime",

    // (optionnel) on garde le nom de la song si tu veux t'en servir plus tard
    songName: s.songName || "",

    // ✅ vidéo
    url: s.url,
    songType: s.songType,

    // image inutile en songs
    image: ""
  }));
}

// ====== PREVIEW ======
function updatePreview() {
  const pool = applyFilters();
  const minNeeded = Math.max(10, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;

  const label = (currentMode === "songs") ? "Songs" : "Titres";
  previewCountEl.textContent = ok
    ? `🎵 ${label} disponibles : ${pool.length} (OK)`
    : `🎵 ${label} disponibles : ${pool.length} (Min ${MIN_REQUIRED})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== SONG AUTOPLAY HELPER ======
function loadAndAutoplayVideo(url) {
  playerZone.style.display = "block";

  // reset propre
  songPlayer.pause?.();
  songPlayer.removeAttribute("src");
  songPlayer.load?.();

  songPlayer.src = url;
  songPlayer.load?.();

  const tryPlay = () => {
    songPlayer.play?.().catch(() => {});
  };

  // ✅ autoplay dès que possible
  songPlayer.addEventListener("canplay", tryPlay, { once: true });

  // fallback
  setTimeout(tryPlay, 250);
}

// ====== GAME ======
function resetGameUI() {
  rankings = new Array(10).fill(null);
  currentIndex = 0;
  selectedItems = [];

  // re-enable rank buttons
  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = false);

  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  // clear player
  if (songPlayer) {
    songPlayer.pause?.();
    songPlayer.removeAttribute("src");
    songPlayer.load?.();
  }
}

function pick10FromPool(pool) {
  // 10 uniques (par _key)
  const used = new Set();
  const out = [];
  const shuffled = shuffleInPlace([...pool]);

  for (const it of shuffled) {
    if (out.length >= 10) break;
    if (used.has(it._key)) continue;
    used.add(it._key);
    out.push(it);
  }
  return out;
}

function startRound() {
  resetGameUI();

  // round label
  roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

  // need pool
  const minNeeded = Math.max(10, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items disponibles avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };
    return;
  }

  selectedItems = pick10FromPool(filteredPool);

  // fallback si pool trop petite
  if (selectedItems.length < 10) {
    resultDiv.textContent = "❌ Impossible de sélectionner 10 items uniques avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };
    return;
  }

  updateRankingList();
  displayCurrentItem();
}

function displayCurrentItem() {
  const item = selectedItems[currentIndex];

  // fin
  if (!item) {
    finishRound();
    return;
  }

  // ✅ Nom affiché (anime en songs)
  itemName.textContent = item.title || "";

  if (currentMode === "songs") {
    // ✅ PAS d'image en songs -> que la vidéo
    animeImg.style.display = "none";

    if (item.url) {
      loadAndAutoplayVideo(item.url);
    } else {
      playerZone.style.display = "none";
      songPlayer.pause?.();
      songPlayer.removeAttribute("src");
      songPlayer.load?.();
    }
  } else {
    // mode anime normal
    playerZone.style.display = "none";
    songPlayer.pause?.();
    songPlayer.removeAttribute("src");
    songPlayer.load?.();

    if (item.image) {
      animeImg.src = item.image;
      animeImg.style.display = "block";
    } else {
      animeImg.style.display = "none";
    }
  }
}

function assignRank(rank) {
  if (rankings[rank - 1] !== null) {
    alert("Ce rang a déjà été attribué !");
    return;
  }

  const item = selectedItems[currentIndex];
  rankings[rank - 1] = item;

  // disable button
  const btn = rankButtonsWrap.querySelector(`button[data-rank="${rank}"]`);
  if (btn) btn.disabled = true;

  updateRankingList();

  currentIndex++;
  displayCurrentItem();
}

function updateRankingList() {
  rankingList.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const li = document.createElement("li");

    const it = rankings[i];
    if (it) {
      // ✅ en mode songs -> on met une VIDEO au lieu d'une image
      if (it.kind === "song") {
        const vid = document.createElement("video");
        vid.src = it.url || "";
        vid.controls = true;
        vid.preload = "metadata";
        vid.playsInline = true;
        li.appendChild(vid);
      } else {
        // anime -> image
        const img = document.createElement("img");
        img.src = it.image || "";
        img.alt = it.title || "";
        li.appendChild(img);
      }

      const span = document.createElement("span");
      span.textContent = `Rang ${i + 1}: ${it.title || ""}`;
      li.appendChild(span);
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      li.appendChild(ph);

      const span = document.createElement("span");
      span.textContent = `Rang ${i + 1}`;
      li.appendChild(span);
    }

    rankingList.appendChild(li);
  }
}

function finishRound() {
  // bloque tout
  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = true);
  if (songPlayer) songPlayer.pause?.();

  resultDiv.textContent = "✅ Partie terminée !";

  nextBtn.style.display = "block";

  // rounds / parcours
  const isLast = currentRound >= totalRounds;

  if (!isLast) {
    nextBtn.textContent = "Round suivant";
    nextBtn.onclick = () => {
      currentRound++;
      startRound();
    };
  } else {
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };

    // parcours: on envoie un score neutre (jeu sans score)
    if (isParcours) {
      try {
        parent.postMessage({
          parcoursScore: {
            label: "Blind Ranking",
            score: 0,
            total: 0
          }
        }, "*");
      } catch {}
    }
  }
}

// ====== LOAD DATA ======
fetch("../data/licenses_only.json")
  .then(r => r.json())
  .then(data => {
    const raw = Array.isArray(data) ? data : [];

    allAnimes = raw.map(a => {
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
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();

    // parcours: démarre direct si besoin
    if (isParcours) {
      filteredPool = applyFilters();
      const minNeeded = Math.max(10, MIN_REQUIRED);
      if (filteredPool.length >= minNeeded) {
        totalRounds = clampInt(parcoursCount, 1, 100);
        currentRound = 1;
        showGame();
        startRound();
      }
    }
  })
  .catch(e => {
    alert("Erreur chargement dataset: " + e.message);
  });
