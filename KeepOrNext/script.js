/**********************
 * Keep or Next (Anime / Songs)
 * - Default tours = 1
 * - Cartes + slot media plus grands
 * - Droite cachée = même taille (slot fixe) + 💤 centré
 * - Pas de gros texte résultat (juste un mini hint)
 * - Effet visuel choix : chosen/rejected
 * - Tours indépendants
 * - Songs : vidéo non mutée + volume global
 * - Loader media + retries (0/2/4/6/8/10s)
 * - Songs : start at 45s, play 20s
 **********************/

// ====== MENU & THEME ======
document.getElementById("back-to-menu").addEventListener("click", () => {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
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

// ====== HELPERS ======
const MIN_REQUIRED = 64;
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

// ✅ Clip settings (Songs)
const CLIP_START_S = 45;
const CLIP_DURATION_S = 20;
const CLIP_EPS = 0.05;

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
  const s = a && a.season ? String(a.season).trim() : "";
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
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",

        animeTitle: anime._title,
        animeImage: anime.image || "",
        animeType: anime._type,
        animeYear: anime._year,
        animeMembers: anime._members,
        animeScore: anime._score,

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
const turnCountEl = document.getElementById("turnCount");

const roundLabel = document.getElementById("roundLabel");

const leftCard = document.getElementById("leftCard");
const rightCard = document.getElementById("rightCard");

const leftImg = document.getElementById("left-img");
const leftName = document.getElementById("left-name");
const leftPlayerZone = document.getElementById("left-player-zone");
const leftPlayer = document.getElementById("leftPlayer");

const sleepOverlay = document.getElementById("sleepOverlay");
const rightImg = document.getElementById("right-img");
const rightName = document.getElementById("right-name");
const rightPlayerZone = document.getElementById("right-player-zone");
const rightPlayer = document.getElementById("rightPlayer");

const keepBtn = document.getElementById("keepBtn");
const nextChoiceBtn = document.getElementById("nextChoiceBtn");

const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime";
let filteredPool = [];

// ====== GAME STATE ======
let totalTurns = 1; // ✅ default 1
let currentTurn = 1;

let leftItem = null;
let rightItem = null;

let bag = [];
let bagIndex = 0;

// tokens anti-bug media
let roundToken = 0;
let mediaTokenLeft = 0;
let mediaTokenRight = 0;

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
  const v = Math.max(0, Math.min(100, parseInt(volumeSlider.value || "30", 10)));
  [leftPlayer, rightPlayer].forEach((p) => {
    if (!p) return;
    p.muted = false;
    p.volume = v / 100;
  });
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== MEDIA LOADER ======
function hardResetMedia(player) {
  try {
    player.pause();
  } catch {}
  player.removeAttribute("src");
  player.load();
}
function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

// ✅ Load with retries + clip (start 45s, play 20s)
function loadMediaWithRetries(player, url, localRound, localMedia, { autoplay = true } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanupLoadHandlers = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;

    player.onloadedmetadata = null;
    player.oncanplay = null;
    player.onplaying = null;
    player.onwaiting = null;
    player.onstalled = null;
    player.onerror = null;
  };

  const cleanupAllHandlers = () => {
    cleanupLoadHandlers();
    player.ontimeupdate = null;
    player.onseeked = null;
    player.onplay = null; // ✅ NEW: on nettoie aussi
  };

  const tokenNow = () => (player === leftPlayer ? mediaTokenLeft : mediaTokenRight);
  const isStillValid = () => localRound === roundToken && localMedia === tokenNow();

  const startStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!isStillValid() || done) return;
      triggerRetry();
    }, STALL_TIMEOUT_MS);
  };

  // ✅ NEW (Fix #3): seek fiable à 45s + autoplay seulement après seek
  const setupClipAndAutoplay = () => {
    if (!isStillValid() || done) return;

    const dur = Number.isFinite(player.duration) ? player.duration : 0;

    // clamp start si dur connue et vidéo trop courte
    let start = CLIP_START_S;
    if (dur > 0) start = Math.max(0, Math.min(start, Math.max(0, dur - 0.25)));

    // end = start + 20s, clamp si dur connue
    let end = start + CLIP_DURATION_S;
    if (dur > 0) end = Math.min(dur, end);

    const canLimit = end - start > 0.25;

    // stop à la fin du clip
    let guard = false;
    player.ontimeupdate = () => {
      if (!isStillValid() || !canLimit || guard) return;
      if (player.currentTime >= end - CLIP_EPS) {
        guard = true;
        try {
          player.pause();
        } catch {}
        try {
          player.currentTime = start;
        } catch {}
        guard = false;
      }
    };

    let didSeek = false;
    let seekingTimeout = null;

    const clearSeekTimeout = () => {
      if (seekingTimeout) clearTimeout(seekingTimeout);
      seekingTimeout = null;
    };

    // Util: certains médias ne remplissent seekable qu'après un moment.
    const canSeekToStart = () => {
      try {
        if (!player.seekable || player.seekable.length === 0) return false;
        const max = player.seekable.end(player.seekable.length - 1);
        return max >= start + 0.1;
      } catch {
        return false;
      }
    };

    // On tente un seek. On considère "ok" quand on a un seeked ET/ou time proche.
    const trySeek = () => {
      if (!isStillValid() || done) return false;
      try {
        player.currentTime = start;
        return true;
      } catch {
        return false;
      }
    };

    // IMPORTANT: si autoplay est bloqué, quand l'utilisateur clique "play",
    // on force un seek d'abord.
    player.onplay = () => {
      if (!didSeek) {
        // si on peut, on retente le seek avant que ça parte à 0
        trySeek();
      }
    };

    player.onseeked = () => {
      if (!isStillValid() || done) return;
      didSeek = true;
      clearSeekTimeout();
      if (autoplay) {
        player.muted = false;
        player.play?.().catch(() => {});
      }
    };

    const seekWithRetries = (n = 0) => {
      if (!isStillValid() || done) return;

      // si seekable est ok, on tente tout de suite
      if (canSeekToStart()) {
        trySeek();
        return;
      }

      // sinon on retente vite (ça se débloque souvent après metadata/canplay)
      if (n >= 40) {
        // ~4s max (40 * 100ms)
        // dernier essai "soft" même si seekable pas prêt
        trySeek();
        return;
      }
      setTimeout(() => seekWithRetries(n + 1), 100);
    };

    // Sécurité: si on n'a jamais eu seeked, on ne force pas autoplay "à 0".
    // (mais si l'utilisateur clique play, on cherche via onplay)
    // On déclenche le loop de seek:
    seekWithRetries();

    // mini timeout pour ne pas laisser des timers zombies
    seekingTimeout = setTimeout(() => {
      clearSeekTimeout();
    }, 6000);
  };

  const markReady = () => {
    if (!isStillValid() || done) return;
    done = true;

    // on vire les handlers de load/retry, mais on garde le clip/seek qu’on pose juste après
    cleanupLoadHandlers();

    setupClipAndAutoplay();
  };

  const triggerRetry = () => {
    if (!isStillValid() || done) return;
    cleanupAllHandlers();
    attemptIndex++;
    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      try {
        player.pause();
      } catch {}
      return;
    }
    setTimeout(() => {
      if (!isStillValid() || done) return;
      doAttempt();
    }, RETRY_DELAYS[attemptIndex]);
  };

  const doAttempt = () => {
    if (!isStillValid() || done) return;

    // important: clear old handlers from previous attempts/rounds
    cleanupAllHandlers();

    const src = attemptIndex === 0 ? url : withCacheBuster(url);

    try {
      hardResetMedia(player);
    } catch {}
    player.preload = "metadata";
    player.muted = false;
    player.src = src;
    player.load();

    player.onloadedmetadata = () => {
      if (!isStillValid() || done) return;
      markReady();
    };
    player.oncanplay = () => {
      if (!isStillValid() || done) return;
      markReady();
    };

    player.onwaiting = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };
    player.onstalled = () => {
      if (!isStillValid() || done) return;
      startStallTimer();
    };

    player.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };

    player.onerror = () => {
      if (!isStillValid() || done) return;
      triggerRetry();
    };

    startStallTimer();
  };

  doAttempt();
  return cleanupAllHandlers;
}

function stopAllMedia() {
  mediaTokenLeft++;
  mediaTokenRight++;

  // ✅ clear clip handlers too
  leftPlayer.ontimeupdate = null;
  leftPlayer.onseeked = null;
  leftPlayer.onplay = null;
  rightPlayer.ontimeupdate = null;
  rightPlayer.onseeked = null;
  rightPlayer.onplay = null;

  try {
    leftPlayer.pause();
  } catch {}
  try {
    rightPlayer.pause();
  } catch {}
  leftPlayer.removeAttribute("src");
  leftPlayer.load();
  rightPlayer.removeAttribute("src");
  rightPlayer.load();
}

// ====== UI INIT ======
function initCustomUI() {
  // Mode pills
  document.querySelectorAll("#modePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modePills .pill").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      currentMode = btn.dataset.mode;
      updateModeVisibility();
      updatePreview();
    });
  });

  // Type pills
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Song pills
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Sliders
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));
  turnCountEl.addEventListener("input", updatePreview);

  // Apply
  applyBtn.addEventListener("click", () => {
    filteredPool = applyFilters();
    totalTurns = clampInt(parseInt(turnCountEl.value || "1", 10), 1, 100); // ✅ min 1

    const minNeeded = Math.max(2, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    showGame();
    startGame();
  });

  keepBtn.addEventListener("click", () => handleChoice("keep"));
  nextChoiceBtn.addEventListener("click", () => handleChoice("next"));

  updateModeVisibility();
  syncLabels();
}

function updateModeVisibility() {
  songsRow.style.display = currentMode === "songs" ? "flex" : "none";
  volumeRow.style.display = currentMode === "songs" ? "flex" : "none";
  applyVolume();
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);

  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  if (currentMode === "anime") {
    let pool = allAnimes.filter(
      (a) => a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type)
    );

    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    return pool.map((a) => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      title: a._title,
      image: a.image || "",
    }));
  }

  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);
  if (allowedSongs.length === 0) return [];

  let pool = allSongs.filter(
    (s) =>
      s.animeYear >= yearMin &&
      s.animeYear <= yearMax &&
      allowedTypes.includes(s.animeType) &&
      allowedSongs.includes(s.songType)
  );

  pool.sort((a, b) => b.animeMembers - a.animeMembers);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b.animeScore - a.animeScore);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool.map((s) => ({
    kind: "song",
    _key: `song|${s._key}`,
    animeTitle: s.animeTitle || "Anime",
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    songType: s.songType,
    url: s.url,
    image: s.animeImage || "",
  }));
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
  const minNeeded = Math.max(2, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;

  const label = currentMode === "songs" ? "Songs" : "Titres";
  previewCountEl.textContent = ok
    ? `📚 ${label} disponibles : ${pool.length} (OK)`
    : `📚 ${label} disponibles : ${pool.length} (Min ${minNeeded})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== BAG ======
function refillBag() {
  bag = shuffleInPlace([...filteredPool]);
  bagIndex = 0;
}
function drawOne(excludeKey = null) {
  if (!bag.length || bagIndex >= bag.length) refillBag();

  const maxTries = Math.max(20, bag.length * 2);
  for (let t = 0; t < maxTries; t++) {
    if (bagIndex >= bag.length) refillBag();
    const it = bag[bagIndex++];
    if (!excludeKey || it._key !== excludeKey) return it;
  }

  if (!filteredPool.length) return null;
  let it = filteredPool[Math.floor(Math.random() * filteredPool.length)];
  if (excludeKey && it._key === excludeKey && filteredPool.length > 1) {
    it = filteredPool.find((x) => x._key !== excludeKey) || it;
  }
  return it;
}
function drawPair() {
  const a = drawOne(null);
  const b = drawOne(a?._key || null);
  return { a, b };
}

// ====== GAME ======
function clearChoiceEffects() {
  leftCard.classList.remove("chosen", "rejected");
  rightCard.classList.remove("chosen", "rejected");
}

function resetGameUI() {
  currentTurn = 1;
  leftItem = null;
  rightItem = null;

  clearChoiceEffects();

  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  keepBtn.disabled = false;
  nextChoiceBtn.disabled = false;

  stopAllMedia();
  hideRightCard();
}

function startGame() {
  roundToken++;
  resetGameUI();

  const minNeeded = Math.max(2, MIN_REQUIRED);
  if (!filteredPool || filteredPool.length < minNeeded) {
    resultDiv.textContent = "❌ Pas assez d’items avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };
    return;
  }

  refillBag();
  const p = drawPair();
  leftItem = p.a;
  rightItem = p.b;

  renderTurn();
}

function setCardContent(side, item, { revealed = true, autoplay = true } = {}) {
  const isSongs = currentMode === "songs";
  const isLeft = side === "left";

  const img = isLeft ? leftImg : rightImg;
  const nameEl = isLeft ? leftName : rightName;
  const pZone = isLeft ? leftPlayerZone : rightPlayerZone;
  const player = isLeft ? leftPlayer : rightPlayer;

  nameEl.textContent = revealed ? formatItemLabel(item) : "";
  nameEl.style.display = revealed ? "block" : "none";

  if (isSongs) {
    // ✅ Fix #1: pas d'image avant la vidéo (pas de poster)
    img.style.display = "none";
    img.removeAttribute("src");
    pZone.style.display = revealed ? "block" : "none";

    if (revealed && item?.url) {
      player.poster = ""; // ✅ enlever l'image avant la vidéo
      applyVolume();

      if (isLeft) mediaTokenLeft++;
      else mediaTokenRight++;

      const localRound = roundToken;
      const localMedia = isLeft ? mediaTokenLeft : mediaTokenRight;

      try {
        player.pause();
      } catch {}
      player.removeAttribute("src");
      player.load();

      player.muted = false;
      loadMediaWithRetries(player, item.url, localRound, localMedia, { autoplay });
    } else {
      try {
        player.pause();
      } catch {}
      player.poster = "";
      player.removeAttribute("src");
      player.load();
    }
  } else {
    pZone.style.display = "none";
    try {
      player.pause();
    } catch {}
    player.poster = "";
    player.removeAttribute("src");
    player.load();

    if (revealed && item?.image) {
      img.src = item.image;
      img.style.display = "block";
    } else {
      img.style.display = "none";
    }
  }
}

function hideRightCard() {
  sleepOverlay.style.display = "flex";
  rightImg.style.display = "none";
  rightName.style.display = "none";
  rightPlayerZone.style.display = "none";

  mediaTokenRight++;

  // ✅ clear clip handlers too
  rightPlayer.ontimeupdate = null;
  rightPlayer.onseeked = null;
  rightPlayer.onplay = null;

  try {
    rightPlayer.pause();
  } catch {}
  rightPlayer.poster = "";
  rightPlayer.removeAttribute("src");
  rightPlayer.load();
}

function revealRightCard(item) {
  sleepOverlay.style.display = "none";
  setCardContent("right", item, { revealed: true, autoplay: true });
}

function renderTurn() {
  clearChoiceEffects();

  roundLabel.textContent = `Tour ${currentTurn} / ${totalTurns}`;
  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  keepBtn.disabled = false;
  nextChoiceBtn.disabled = false;

  setCardContent("left", leftItem, { revealed: true, autoplay: true });
  hideRightCard();

  volumeRow.style.display = currentMode === "songs" ? "flex" : "none";
  applyVolume();
}

function handleChoice(choice) {
  if (!leftItem || !rightItem) return;

  keepBtn.disabled = true;
  nextChoiceBtn.disabled = true;

  // éviter double audio au reveal
  try {
    leftPlayer.pause();
  } catch {}

  // effet visuel choix
  if (choice === "keep") {
    leftCard.classList.add("chosen");
    rightCard.classList.add("rejected");
    resultDiv.textContent = "✅ KEEP";
  } else {
    rightCard.classList.add("chosen");
    leftCard.classList.add("rejected");
    resultDiv.textContent = "➡️ NEXT";
  }

  revealRightCard(rightItem);

  const isLast = currentTurn >= totalTurns;

  nextBtn.style.display = "block";
  if (!isLast) {
    nextBtn.textContent = "Tour suivant";
    nextBtn.onclick = () => {
      stopAllMedia();

      const p = drawPair();
      leftItem = p.a;
      rightItem = p.b;

      currentTurn++;
      renderTurn();
    };
  } else {
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      stopAllMedia();
      showCustomization();
      updatePreview();
    };
  }
}

// ====== LOAD DATA ======
fetch("../data/licenses_only.json")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then((json) => {
    const raw = normalizeAnimeList(json);

    allAnimes = (Array.isArray(raw) ? raw : []).map((a) => {
      const title = getDisplayTitle(a);
      return {
        ...a,
        _title: title,
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

    applyVolume();
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    console.error(e);
  });
