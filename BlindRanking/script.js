/**********************
 * Blind Ranking (Anime / Songs)
 * - Songs: à droite = VIDEO uniquement (autoplay si possible, non mutée)
 * - Grille ranking: JAMAIS de vidéo (uniquement image cover)
 * - Titre songs: "Oeuvre OP/ED/IN N — Nom — Artiste"
 * - Loader anti-bug media + retries: 1 + 5 retries (2/4/6/8/10s)
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

// retries: 1 essai + 5 retries => 0, 2s, 4s, 6s, 8s, 10s
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

function normalizeAnimeList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.animes)) return json.animes;
  return [];
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
  const s = ((a && a.season) ? String(a.season) : "").trim(); // ex "spring 2013"
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

function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function songTypeLabel(t) {
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "IN";
}

function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = s.songNumber ? ` ${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const art = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${s.animeTitle || "Anime"} ${type}${num}${name}${art}`;
}

function formatItemLabel(it) {
  if (!it) return "";
  if (it.kind === "song") return formatSongTitle(it);
  return it.title || "";
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

      const artistsArr = Array.isArray(it.artists) ? it.artists : [];
      const artists = artistsArr.join(", ");

      out.push({
        kind: "song",
        songType: b.type, // OP/ED/IN
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",

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
        _key: `${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
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

const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

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
let filteredPool = [];

// ====== GAME STATE ======
let totalRounds = 1;
let currentRound = 1;

let selectedItems = [];
let currentIndex = 0;
let rankings = new Array(10).fill(null);

// tokens anti-bug media
let roundToken = 0;
let mediaToken = 0;

// ====== UI SHOW/HIDE ======
function showCustomization() {
  customPanel.style.display = "block";
  gamePanel.style.display = "none";
}
function showGame() {
  customPanel.style.display = "none";
  gamePanel.style.display = "block";
}

// ====== VOLUME ======
function applyVolume() {
  if (!songPlayer) return;
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "30", 10)));
  // ⚠️ non muté
  songPlayer.muted = false;
  songPlayer.volume = v / 100;
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== MEDIA LOADER (retries + anti-stall) ======
function hardResetMedia() {
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();
}

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadMediaWithRetries(url, localRound, localMedia, { autoplay = true } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    songPlayer.onloadedmetadata = null;
    songPlayer.oncanplay = null;
    songPlayer.onplaying = null;
    songPlayer.onwaiting = null;
    songPlayer.onstalled = null;
    songPlayer.onerror = null;
  };

  const isStillValid = () => localRound === roundToken && localMedia === mediaToken;

  const startStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!isStillValid() || done) return;
      triggerRetry();
    }, STALL_TIMEOUT_MS);
  };

  const markReady = () => {
    if (!isStillValid() || done) return;
    done = true;
    cleanup();

    // autoplay best-effort (souvent OK après interaction user)
    if (autoplay) {
      songPlayer.muted = false; // ✅ ne mute pas
      songPlayer.play?.().catch(() => {});
    }
  };

  const triggerRetry = () => {
    if (!isStillValid() || done) return;

    cleanup();
    attemptIndex++;

    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      // on laisse l’UI continuer (pas de blocage), mais on vide la source
      try { songPlayer.pause(); } catch {}
      return;
    }

    setTimeout(() => {
      if (!isStillValid() || done) return;
      doAttempt();
    }, RETRY_DELAYS[attemptIndex]);
  };

  const doAttempt = () => {
    if (!isStillValid() || done) return;

    const src = attemptIndex === 0 ? url : withCacheBuster(url);

    try { hardResetMedia(); } catch {}

    songPlayer.preload = "metadata";
    songPlayer.muted = false; // ✅ ne mute pas
    songPlayer.src = src;
    songPlayer.load();

    songPlayer.onloadedmetadata = () => {
      if (!isStillValid() || done) return;
      markReady();
    };

    songPlayer.oncanplay = () => {
      if (!isStillValid() || done) return;
      markReady();
    };

    songPlayer.onwaiting = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };

    songPlayer.onstalled = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };

    songPlayer.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    songPlayer.onerror = () => {
      if (!isStillValid() || done) return;
      triggerRetry();
    };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
  return cleanup;
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
    const minNeeded = Math.max(10, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    totalRounds = clampInt(parseInt(roundCountEl.value || "1", 10), 1, 100);
    currentRound = 1;

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
    let pool = allAnimes.filter(a =>
      a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type)
    );

    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

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

  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  // ✅ Songs: on garde TOUT ce qu'il faut pour le titre complet + image anime
  return pool.map(s => ({
    kind: "song",
    _key: `song|${s._key}`,
    animeTitle: s.animeTitle || "Anime",
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    songType: s.songType,
    url: s.url,
    image: s.animeImage || "" // ✅ grille = image anime
  }));
}

// ====== PREVIEW ======
function updatePreview() {
  // dataset pas chargé
  if (!allAnimes.length) {
    previewCountEl.textContent = "⏳ Chargement de la base…";
    previewCountEl.classList.add("bad");
    previewCountEl.classList.remove("good");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    return;
  }

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

// ====== GAME ======
function resetGameUI() {
  rankings = new Array(10).fill(null);
  currentIndex = 0;
  selectedItems = [];

  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = false);

  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  // stop media
  mediaToken++;
  try { songPlayer.pause(); } catch {}
  songPlayer.removeAttribute("src");
  songPlayer.load();

  // volume row only in songs
  volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
}

function pick10FromPool(pool) {
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
  roundToken++;
  resetGameUI();

  roundLabel.textContent = `Round ${currentRound} / ${totalRounds}`;

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

  if (!item) {
    finishRound();
    return;
  }

  // ✅ titre complet
  itemName.textContent = formatItemLabel(item);

  if (currentMode === "songs") {
    // ✅ songs: VIDEO uniquement (pas d’image séparée)
    animeImg.style.display = "none";
    playerZone.style.display = "block";
    volumeRow.style.display = "flex";

    // poster possible sur la vidéo (c’est toujours le player vidéo)
    songPlayer.poster = item.image || "";

    if (item.url) {
      mediaToken++;
      const localRound = roundToken;
      const localMedia = mediaToken;

      // reset avant load
      try { songPlayer.pause(); } catch {}
      songPlayer.removeAttribute("src");
      songPlayer.load();

      // non muté + volume
      songPlayer.muted = false;
      applyVolume();

      loadMediaWithRetries(item.url, localRound, localMedia, { autoplay: true });
    } else {
      try { songPlayer.pause(); } catch {}
      songPlayer.removeAttribute("src");
      songPlayer.load();
    }
  } else {
    // anime mode normal
    volumeRow.style.display = "none";
    playerZone.style.display = "none";
    try { songPlayer.pause(); } catch {}
    songPlayer.removeAttribute("src");
    songPlayer.load();

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
      // ✅ Grille: JAMAIS de vidéo, uniquement image anime
      const img = document.createElement("img");
      img.src = it.image || "";
      img.alt = it.kind === "song" ? (it.animeTitle || "") : (it.title || "");
      img.loading = "lazy";
      img.decoding = "async";
      li.appendChild(img);

      const span = document.createElement("span");
      span.textContent = `Rang ${i + 1}: ${formatItemLabel(it)}`;
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
  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = true);
  try { songPlayer.pause(); } catch {}

  resultDiv.textContent = "✅ Partie terminée !";
  nextBtn.style.display = "block";

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

    if (isParcours) {
      try {
        parent.postMessage({
          parcoursScore: { label: "Blind Ranking", score: 0, total: 0 }
        }, "*");
      } catch {}
    }
  }
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
        _titleLower: title.toLowerCase(),
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();

    // volume default
    applyVolume();

    // parcours auto-start
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
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    console.error(e);
  });
