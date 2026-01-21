/**********************
 * Blind Ranking (v2)
 * ✅ Songs title format: Oeuvre + Type(OP/ED/Insert) + numéro + nom + artiste
 * ✅ Ranking grid: lazy-load videos (no lag)
 * ✅ Main player: anti-bug loader (retries + anti-stall + cache-buster)
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

// anti-bug média (inspiré OpeningQuizz)
const RETRY_DELAYS = [0, 2000, 6000];
const STALL_TIMEOUT_MS = 6000;

function setMediaStatus(msg) {
  const el = document.getElementById("mediaStatus");
  if (!el) return;
  el.textContent = msg || "";
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

function safeNum(x, fallback = 0) {
  const n = +x;
  return Number.isFinite(n) ? n : fallback;
}

function typeLabel(songType) {
  if (songType === "OP") return "OP";
  if (songType === "ED") return "ED";
  return "Insert";
}

// ✅ format demandé
function formatSongTitle(item) {
  const anime = item.animeTitle || item.titleAnime || item.anime || "";
  const t = typeLabel(item.songType);
  const num = item.songNumber ? ` ${item.songNumber}` : "";
  const name = item.songName ? ` — ${item.songName}` : "";
  const artist = item.songArtists ? ` — ${item.songArtists}` : "";
  return `${anime} ${t}${num}${name}${artist}`.trim();
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

      const artists = Array.isArray(it.artists) ? it.artists.join(", ") : "";

      out.push({
        kind: "song",
        songType: b.type, // OP/ED/IN
        songName: it.name || "",
        songNumber: safeNum(it.number, 1) || 1,
        songArtists: artists,

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
let filteredPool = [];

// ====== GAME STATE ======
let totalRounds = 1;
let currentRound = 1;

let selectedItems = [];
let currentIndex = 0;
let rankings = new Array(10).fill(null);

// ====== MEDIA TOKENS (anti-bug) ======
let mainMediaToken = 0;
let mainCleanup = null;

function hardResetVideo(videoEl) {
  try { videoEl.pause(); } catch {}
  videoEl.removeAttribute("src");
  try { videoEl.load(); } catch {}
}

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadVideoWithRetries(videoEl, url, localToken, onReady, onFail, { autoplay = false } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

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

  const isStillValid = () => localToken === mainMediaToken;

  const startStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!isStillValid() || done) return;
      triggerRetry("🔄 Rechargement (stall)...");
    }, STALL_TIMEOUT_MS);
  };

  const markReady = () => {
    if (!isStillValid() || done) return;
    done = true;
    cleanup();
    setMediaStatus("");
    if (typeof onReady === "function") onReady();

    if (autoplay) {
      videoEl.play?.().catch(() => {});
    }
  };

  const triggerRetry = (msg) => {
    if (!isStillValid() || done) return;

    cleanup();
    attemptIndex++;

    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      setMediaStatus("❌ Média indisponible.");
      if (typeof onFail === "function") onFail();
      return;
    }

    setMediaStatus(msg || `🔄 Nouvelle tentative (${attemptIndex + 1}/${RETRY_DELAYS.length})...`);
    setTimeout(() => {
      if (!isStillValid() || done) return;
      doAttempt();
    }, RETRY_DELAYS[attemptIndex]);
  };

  const doAttempt = () => {
    if (!isStillValid() || done) return;

    const src = attemptIndex === 0 ? url : withCacheBuster(url);

    try { hardResetVideo(videoEl); } catch {}

    setMediaStatus(attemptIndex === 0 ? "⏳ Chargement..." : `🔄 Tentative (${attemptIndex + 1}/${RETRY_DELAYS.length})...`);

    videoEl.preload = "metadata";
    videoEl.src = src;
    videoEl.load();

    videoEl.onloadedmetadata = () => {
      if (!isStillValid() || done) return;
      markReady();
    };

    videoEl.oncanplay = () => {
      if (!isStillValid() || done) return;
      markReady();
    };

    videoEl.onwaiting = () => {
      if (!isStillValid() || done) return;
      setMediaStatus("⏳ Chargement...");
      startStallTimer();
    };

    videoEl.onstalled = () => {
      if (!isStillValid() || done) return;
      setMediaStatus("⏳ Chargement...");
      startStallTimer();
    };

    videoEl.onplaying = () => {
      if (!isStillValid() || done) return;
      setMediaStatus("");
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    videoEl.onerror = () => {
      if (!isStillValid() || done) return;
      triggerRetry();
    };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();

  return cleanup;
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

  // ✅ Nouveau titre demandé
  return pool.map(s => {
    const item = {
      kind: "song",
      _key: `song|${s._key}`,
      animeTitle: s.animeTitle || "Anime",
      songName: s.songName || "",
      songType: s.songType, // OP/ED/IN
      songNumber: s.songNumber || 1,
      songArtists: s.songArtists || "",
      url: s.url,
      image: ""
    };
    item.title = formatSongTitle(item);
    return item;
  });
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

// ====== GAME ======
function resetGameUI() {
  rankings = new Array(10).fill(null);
  currentIndex = 0;
  selectedItems = [];

  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = false);

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  setMediaStatus("");

  // stop main player + cleanup handlers
  mainMediaToken++;
  if (mainCleanup) { try { mainCleanup(); } catch {} }
  mainCleanup = null;

  if (songPlayer) {
    hardResetVideo(songPlayer);
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
  itemName.textContent = item.title || "";

  if (currentMode === "songs") {
    animeImg.style.display = "none";

    playerZone.style.display = "block";

    // anti-bug load + autoplay
    mainMediaToken++;
    const local = mainMediaToken;

    if (mainCleanup) { try { mainCleanup(); } catch {} }
    mainCleanup = null;

    if (item.url) {
      mainCleanup = loadVideoWithRetries(
        songPlayer,
        item.url,
        local,
        () => {
          // prêt → tentative autoplay
          songPlayer.play?.().catch(() => {});
        },
        () => {
          // fail → laisse l’utilisateur passer
          setMediaStatus("❌ Impossible de charger cette vidéo.");
        },
        { autoplay: true }
      );
    } else {
      hardResetVideo(songPlayer);
      playerZone.style.display = "none";
    }
  } else {
    // anime mode normal
    playerZone.style.display = "none";
    hardResetVideo(songPlayer);

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

// ✅ Lazy-load video in grid (anti-lag)
function createLazyVideoThumb(url) {
  const wrap = document.createElement("div");
  wrap.className = "video-thumb";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "load-video-btn";
  btn.textContent = "▶ Charger";

  btn.onclick = () => {
    btn.disabled = true;
    btn.textContent = "⏳";

    const vid = document.createElement("video");
    vid.controls = true;
    vid.preload = "metadata";
    vid.playsInline = true;

    // remplace le thumb par la vidéo
    wrap.replaceWith(vid);

    // protections simples (retry + stall) localisées
    let attempt = 0;
    let stallTimer = null;
    let alive = true;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      vid.onloadedmetadata = null;
      vid.oncanplay = null;
      vid.onwaiting = null;
      vid.onstalled = null;
      vid.onerror = null;
      vid.onplaying = null;
    };

    const startStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (!alive) return;
        retry("🔄 Rechargement (stall)...");
      }, STALL_TIMEOUT_MS);
    };

    const retry = (msg) => {
      attempt++;
      cleanup();

      if (attempt >= RETRY_DELAYS.length) {
        // fallback: affiche un bouton retry
        const back = document.createElement("div");
        back.className = "video-thumb";

        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.className = "load-video-btn";
        retryBtn.textContent = "↻ Réessayer";
        retryBtn.onclick = () => {
          back.replaceWith(createLazyVideoThumb(url));
        };

        back.appendChild(retryBtn);
        vid.replaceWith(back);
        return;
      }

      const src = attempt === 0 ? url : withCacheBuster(url);
      try { hardResetVideo(vid); } catch {}
      vid.src = src;
      vid.load();
      startStall();
    };

    const doAttempt = () => {
      const src = attempt === 0 ? url : withCacheBuster(url);
      vid.src = src;
      vid.load();

      vid.onloadedmetadata = () => {
        if (!alive) return;
        vid.play?.().catch(() => {});
      };
      vid.oncanplay = () => {
        if (!alive) return;
        vid.play?.().catch(() => {});
      };
      vid.onwaiting = startStall;
      vid.onstalled = startStall;
      vid.onplaying = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = null;
      };
      vid.onerror = () => retry();
      startStall();
    };

    doAttempt();
  };

  wrap.appendChild(btn);
  return wrap;
}

function updateRankingList() {
  rankingList.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const li = document.createElement("li");
    const it = rankings[i];

    if (it) {
      if (it.kind === "song") {
        // ✅ PAS de vidéo auto dans la grille → bouton charger
        li.appendChild(createLazyVideoThumb(it.url || ""));
      } else {
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
  [...rankButtonsWrap.querySelectorAll("button[data-rank]")].forEach(b => b.disabled = true);

  // stop main player
  mainMediaToken++;
  if (mainCleanup) { try { mainCleanup(); } catch {} }
  mainCleanup = null;
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
    console.error(e);
  });
