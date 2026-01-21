/**********************
 * Blind Ranking (Anime + Songs)
 * ✅ Songs: titre complet + autoplay + volume bar
 * ✅ Grille songs: lazy load (image en fond + bouton Charger)
 * ✅ Retry anti-bug: 1 + 5 retries (2,4,6,8,10s)
 * ✅ Ne mute jamais les vidéos
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

// ====== CONSTANTS ======
const MIN_REQUIRED = 64;

// ✅ 5 retries: 2,4,6,8,10s (donc 6 tentatives au total)
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

// ====== HELPERS ======
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
  const m = s.match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : 0;
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

function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function songTypeLabel(t) {
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "Insert Song";
}

function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = (s.songNumber && s.songNumber > 0) ? ` ${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const artist = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${s.animeTitle} ${type}${num}${name}${artist}`.trim();
}

// ====== SONGS extraction ======
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

        animeTitle: anime._title,
        animeTitleLower: anime._titleLower,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

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

const mediaStatusEl = document.getElementById("mediaStatus");

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

// ====== VOLUME ======
let currentVolume = 0.5;

function loadSavedVolume() {
  const saved = parseInt(localStorage.getItem("blind_volume") || "50", 10);
  const v = Math.max(0, Math.min(100, saved));
  currentVolume = v / 100;
  if (volumeSlider) volumeSlider.value = String(v);
  if (volumeVal) volumeVal.textContent = `${v}%`;
}

function setVideoAudio(videoEl) {
  if (!videoEl) return;
  // ✅ ne jamais mute
  videoEl.muted = false;
  videoEl.defaultMuted = false;
  videoEl.removeAttribute("muted");
  videoEl.volume = currentVolume;
}

function applyVolumeEverywhere() {
  if (!volumeSlider) return;
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "50", 10)));
  currentVolume = v / 100;
  localStorage.setItem("blind_volume", String(v));
  if (volumeVal) volumeVal.textContent = `${v}%`;

  // main player
  setVideoAudio(songPlayer);
  // grid videos déjà chargées
  document.querySelectorAll("#ranking-list video").forEach(vd => setVideoAudio(vd));
}

// ====== STATUS ======
function setMediaStatus(msg) {
  if (!mediaStatusEl) return;
  mediaStatusEl.textContent = msg || "";
}

// ====== VIDEO LOADER (retries + anti-stall) ======
function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function hardResetVideo(videoEl) {
  try { videoEl.pause(); } catch {}
  try { videoEl.removeAttribute("src"); } catch {}
  try { videoEl.load(); } catch {}
}

function loadVideoWithRetries(videoEl, url, {
  statusEl = null,
  autoplay = false,
  preloadOnly = false,
  poster = ""
} = {}) {
  if (!videoEl || !url) return;

  // id local pour annuler une ancienne charge sur CE video
  videoEl._loadId = (videoEl._loadId || 0) + 1;
  const myId = videoEl._loadId;

  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const setStatusLocal = (msg) => {
    const el = statusEl || mediaStatusEl;
    if (!el) return;
    el.textContent = msg || "";
  };

  const isValid = () => videoEl._loadId === myId;

  const cleanup = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    videoEl.onloadedmetadata = null;
    videoEl.oncanplay = null;
    videoEl.onplaying = null;
    videoEl.onwaiting = null;
    videoEl.onstalled = null;
    videoEl.onerror = null;
  };

  const startStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!isValid() || done) return;
      triggerRetry("🔄 Rechargement (stall)...");
    }, STALL_TIMEOUT_MS);
  };

  const markReady = () => {
    if (!isValid() || done) return;
    done = true;
    cleanup();
    setStatusLocal("");

    // ✅ jamais mute + volume global
    setVideoAudio(videoEl);

    if (preloadOnly) return;

    if (autoplay) {
      videoEl.play?.().catch(() => {
        // autoplay avec son souvent bloqué -> on affiche un message
        setStatusLocal("▶ Clique sur lecture pour lancer le son (autoplay bloqué).");
      });
    }
  };

  const triggerRetry = (msg) => {
    if (!isValid() || done) return;

    cleanup();
    attemptIndex++;

    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      setStatusLocal("❌ Média indisponible.");
      return;
    }

    setStatusLocal(msg || `🔄 Nouvelle tentative (${attemptIndex + 1}/${RETRY_DELAYS.length})...`);
    setTimeout(() => {
      if (!isValid() || done) return;
      doAttempt();
    }, RETRY_DELAYS[attemptIndex]);
  };

  const doAttempt = () => {
    if (!isValid() || done) return;

    const src = attemptIndex === 0 ? url : withCacheBuster(url);

    try { hardResetVideo(videoEl); } catch {}

    if (poster) {
      try { videoEl.poster = poster; } catch {}
    }

    setStatusLocal(attemptIndex === 0
      ? "⏳ Chargement..."
      : `🔄 Nouvelle tentative (${attemptIndex + 1}/${RETRY_DELAYS.length})...`
    );

    videoEl.preload = "metadata";
    videoEl.src = src;
    videoEl.load();

    videoEl.onloadedmetadata = () => {
      if (!isValid() || done) return;
      if (preloadOnly) return markReady();
      markReady();
    };

    videoEl.oncanplay = () => {
      if (!isValid() || done) return;
      if (preloadOnly) return markReady();
      markReady();
    };

    videoEl.onwaiting = () => {
      if (!isValid() || done) return;
      setStatusLocal("⏳ Chargement...");
      startStallTimer();
    };

    videoEl.onstalled = () => {
      if (!isValid() || done) return;
      setStatusLocal("⏳ Chargement...");
      startStallTimer();
    };

    videoEl.onplaying = () => {
      if (!isValid() || done) return;
      setStatusLocal("");
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    videoEl.onerror = () => {
      if (!isValid() || done) return;
      triggerRetry();
    };

    // anti-stall au départ
    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
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

      // au moins 1 type
      const any = document.querySelectorAll("#typePills .pill.active").length > 0;
      if (!any) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }

      updatePreview();
    });
  });

  // Song pills
  document.querySelectorAll("#songPills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");

      // au moins 1
      const any = document.querySelectorAll("#songPills .pill.active").length > 0;
      if (!any) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }

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

  return pool.map(s => {
    const item = {
      kind: "song",
      _key: `song|${s._key}`,
      animeTitle: s.animeTitle || "Anime",
      songType: s.songType,
      songNumber: s.songNumber || 1,
      songName: s.songName || "",
      songArtists: s.songArtists || "",
      url: s.url,
      animeImage: s.animeImage || ""
    };
    item.displayTitle = formatSongTitle(item);
    return item;
  });
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

  setMediaStatus("");

  if (songPlayer) {
    try { songPlayer.pause(); } catch {}
    songPlayer.removeAttribute("src");
    songPlayer.load?.();
  }
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

  setMediaStatus("");

  if (currentMode === "songs") {
    // ✅ songs: titre complet, pas d'image séparée
    itemName.textContent = item.displayTitle || item.animeTitle || "";

    animeImg.style.display = "none";
    playerZone.style.display = "block";
    if (volumeRow) volumeRow.style.display = "flex";

    // reset src
    try { songPlayer.pause(); } catch {}
    songPlayer.removeAttribute("src");
    songPlayer.load?.();

    // appliquer audio/volume (pas mute)
    setVideoAudio(songPlayer);

    // poster = anime image (dans la vidéo, pas une image séparée)
    const poster = item.animeImage || "";
    loadVideoWithRetries(songPlayer, item.url, {
      statusEl: mediaStatusEl,
      autoplay: true,
      preloadOnly: false,
      poster
    });

  } else {
    // anime mode
    itemName.textContent = item.title || "";

    playerZone.style.display = "none";
    if (volumeRow) volumeRow.style.display = "none";

    try { songPlayer.pause(); } catch {}
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

  const btn = rankButtonsWrap.querySelector(`button[data-rank="${rank}"]`);
  if (btn) btn.disabled = true;

  updateRankingList();

  currentIndex++;
  displayCurrentItem();
}

// ✅ création thumb lazy avec image fond + bouton Charger
function createSongThumb(it, slotIndex) {
  const thumb = document.createElement("div");
  thumb.className = "song-thumb";
  if (it.animeImage) thumb.style.backgroundImage = `url("${it.animeImage}")`;

  const btn = document.createElement("button");
  btn.className = "load-btn";
  btn.type = "button";
  btn.textContent = "▶ Charger";
  thumb.appendChild(btn);

  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "⏳";

    // remplacer par la vidéo
    const vid = document.createElement("video");
    vid.controls = true;
    vid.preload = "metadata";
    vid.playsInline = true;

    // ✅ pas mute + volume global
    setVideoAudio(vid);

    // poster = anime image
    if (it.animeImage) vid.poster = it.animeImage;

    thumb.replaceWith(vid);

    // charger sans autoplay obligatoire, mais on peut jouer (clic utilisateur = OK)
    loadVideoWithRetries(vid, it.url, {
      statusEl: null,
      autoplay: true,
      preloadOnly: false,
      poster: it.animeImage || ""
    });

    // s’assurer que le volume reste à jour si l’utilisateur bouge le slider après
    applyVolumeEverywhere();
  });

  return thumb;
}

function updateRankingList() {
  rankingList.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const li = document.createElement("li");
    const it = rankings[i];

    if (it) {
      if (it.kind === "song") {
        // ✅ lazy load: image en fond + bouton "Charger"
        li.appendChild(createSongThumb(it, i));
      } else {
        const img = document.createElement("img");
        img.src = it.image || "";
        img.alt = it.title || "";
        li.appendChild(img);
      }

      const span = document.createElement("span");
      span.textContent = it.kind === "song"
        ? `Rang ${i + 1}: ${it.displayTitle || it.animeTitle || ""}`
        : `Rang ${i + 1}: ${it.title || ""}`;
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

  // appliquer volume si des vidéos existent déjà
  applyVolumeEverywhere();
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

// ====== INIT VOLUME ======
loadSavedVolume();
if (volumeSlider) volumeSlider.addEventListener("input", applyVolumeEverywhere);

// ====== LOAD DATA ======
fetch("../data/licenses_only.json")
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then(json => {
    const raw = normalizeAnimeList(json);

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

    // parcours auto start
    if (isParcours) {
      if (forcedMode === "anime" || forcedMode === "songs") currentMode = forcedMode;
      updateModePillsFromState();
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
