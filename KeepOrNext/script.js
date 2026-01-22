/**********************
 * Keep or Next (Anime / Songs)
 * - Gauche visible, Droite cachée
 * - Boutons: Keep (gauche) / Next (droite)
 * - Après choix: on révèle la carte cachée, puis "Tour suivant"
 * - Fin: recap des duels (images uniquement, pas de vidéos dans le recap)
 * - Loader media songs + retries (1 + 5 retries 2/4/6/8/10s)
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
// minimum conseillé (pour éviter un pool trop pauvre avec filtres agressifs)
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
const turnCountEl = document.getElementById("turnCount");

const roundLabel = document.getElementById("roundLabel");

const leftImg = document.getElementById("left-img");
const leftName = document.getElementById("left-name");
const leftPlayerZone = document.getElementById("left-player-zone");
const leftPlayer = document.getElementById("leftPlayer");

const rightCard = document.getElementById("rightCard");
const secretOverlay = document.getElementById("secretOverlay");
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

const recapWrap = document.getElementById("recapWrap");
const recapList = document.getElementById("recapList");

// ====== URL (PARCOURS) compat (optionnel) ======
const urlParams = new URLSearchParams(window.location.search);
const isParcours = urlParams.get("parcours") === "1";
const parcoursCount = parseInt(urlParams.get("count") || "10", 10);
const forcedMode = urlParams.get("mode"); // "anime" | "songs" éventuel

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime"; // anime | songs
let filteredPool = [];

// ====== GAME STATE ======
let totalTurns = 10;
let currentTurn = 1;

let dealQueue = [];       // items uniques (taille = totalTurns + 1)
let nextDealIndex = 2;    // prochain index à piocher dans dealQueue

let currentItem = null;   // visible (gauche)
let hiddenItem = null;    // caché (droite)
let decisions = [];       // recap

let pendingChosen = null;
let pendingOther = null;

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
  [leftPlayer, rightPlayer].forEach(p => {
    if (!p) return;
    p.muted = false;
    p.volume = v / 100;
  });
  if (volumeVal) volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== MEDIA LOADER (retries + anti-stall) ======
function hardResetMedia(player) {
  try { player.pause(); } catch {}
  player.removeAttribute("src");
  player.load();
}

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "t=" + Date.now();
}

function loadMediaWithRetries(player, url, localRound, localMedia, { autoplay = true } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    player.onloadedmetadata = null;
    player.oncanplay = null;
    player.onplaying = null;
    player.onwaiting = null;
    player.onstalled = null;
    player.onerror = null;
  };

  const isStillValid = () => localRound === roundToken && localMedia === (player === leftPlayer ? mediaTokenLeft : mediaTokenRight);

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

    if (autoplay) {
      player.muted = false;
      player.play?.().catch(() => {});
    }
  };

  const triggerRetry = () => {
    if (!isStillValid() || done) return;

    cleanup();
    attemptIndex++;

    if (attemptIndex >= RETRY_DELAYS.length) {
      done = true;
      try { player.pause(); } catch {}
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

    try { hardResetMedia(player); } catch {}

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
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    player.onerror = () => {
      if (!isStillValid() || done) return;
      triggerRetry();
    };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
  return cleanup;
}

function stopAllMedia() {
  mediaTokenLeft++;
  mediaTokenRight++;
  try { leftPlayer.pause(); } catch {}
  try { rightPlayer.pause(); } catch {}
  leftPlayer.removeAttribute("src"); leftPlayer.load();
  rightPlayer.removeAttribute("src"); rightPlayer.load();
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

  // Sliders + input sync
  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach(el => el.addEventListener("input", syncLabels));
  turnCountEl.addEventListener("input", () => updatePreview());

  // Apply
  applyBtn.addEventListener("click", () => {
    filteredPool = applyFilters();
    totalTurns = clampInt(parseInt(turnCountEl.value || "10", 10), 1, 100);

    const minNeeded = Math.max(totalTurns + 1, MIN_REQUIRED);
    if (filteredPool.length < minNeeded) return;

    showGame();
    startGame();
  });

  // Choice buttons
  keepBtn.addEventListener("click", () => handleChoice("keep"));
  nextChoiceBtn.addEventListener("click", () => handleChoice("next"));

  // defaults forced mode (parcours / url)
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
  volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
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

  return pool.map(s => ({
    kind: "song",
    _key: `song|${s._key}`,
    animeTitle: s.animeTitle || "Anime",
    songName: s.songName || "",
    songNumber: s.songNumber || 1,
    songArtists: s.songArtists || "",
    songType: s.songType,
    url: s.url,
    image: s.animeImage || "" // cover utilisée partout (cards + recap)
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

  const desiredTurns = clampInt(parseInt(turnCountEl.value || "10", 10), 1, 100);
  const pool = applyFilters();

  const minNeeded = Math.max(desiredTurns + 1, MIN_REQUIRED);
  const ok = pool.length >= minNeeded;

  const label = (currentMode === "songs") ? "Songs" : "Titres";
  previewCountEl.textContent = ok
    ? `🎵 ${label} disponibles : ${pool.length} (OK)`
    : `🎵 ${label} disponibles : ${pool.length} (Min ${minNeeded})`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);

  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== GAME CORE ======
function pickUniqueFromPool(pool, count) {
  const used = new Set();
  const shuffled = shuffleInPlace([...pool]);
  const out = [];
  for (const it of shuffled) {
    if (out.length >= count) break;
    if (used.has(it._key)) continue;
    used.add(it._key);
    out.push(it);
  }
  return out;
}

function resetGameUI() {
  decisions = [];
  currentTurn = 1;
  nextDealIndex = 2;
  pendingChosen = null;
  pendingOther = null;

  recapWrap.style.display = "none";
  recapList.innerHTML = "";

  resultDiv.textContent = "";
  nextBtn.style.display = "none";

  keepBtn.disabled = false;
  nextChoiceBtn.disabled = false;

  stopAllMedia();

  // right hidden by default
  hideRightCard();
}

function startGame() {
  roundToken++;
  resetGameUI();

  // parcours: si on veut forcer le nombre de tours depuis l'URL
  if (isParcours) {
    totalTurns = clampInt(parcoursCount, 1, 100);
    turnCountEl.value = String(totalTurns);
  }

  const minNeeded = Math.max(totalTurns + 1, MIN_REQUIRED);
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

  dealQueue = pickUniqueFromPool(filteredPool, totalTurns + 1);
  if (dealQueue.length < totalTurns + 1) {
    resultDiv.textContent = "❌ Impossible de sélectionner assez d’items uniques avec ces filtres.";
    nextBtn.style.display = "block";
    nextBtn.textContent = "Retour réglages";
    nextBtn.onclick = () => {
      showCustomization();
      updatePreview();
    };
    return;
  }

  currentItem = dealQueue[0];
  hiddenItem = dealQueue[1];
  renderTurn();
}

function setCardContent(side, item, { revealed = true, autoplay = true } = {}) {
  const isSongs = (currentMode === "songs");
  const isLeft = side === "left";

  const img = isLeft ? leftImg : rightImg;
  const nameEl = isLeft ? leftName : rightName;
  const pZone = isLeft ? leftPlayerZone : rightPlayerZone;
  const player = isLeft ? leftPlayer : rightPlayer;

  // name
  nameEl.textContent = revealed ? formatItemLabel(item) : "";
  nameEl.style.display = revealed ? "block" : "none";

  if (isSongs) {
    // songs: vidéo uniquement (comme blindranking)
    img.style.display = "none";
    pZone.style.display = revealed ? "block" : "none";

    if (revealed && item?.url) {
      // poster + load
      player.poster = item.image || "";
      applyVolume();

      if (isLeft) mediaTokenLeft++; else mediaTokenRight++;
      const localRound = roundToken;
      const localMedia = isLeft ? mediaTokenLeft : mediaTokenRight;

      try { player.pause(); } catch {}
      player.removeAttribute("src");
      player.load();

      player.muted = false;
      loadMediaWithRetries(player, item.url, localRound, localMedia, { autoplay });
    } else {
      try { player.pause(); } catch {}
      player.removeAttribute("src");
      player.load();
    }
  } else {
    // anime: image
    pZone.style.display = "none";
    try { player.pause(); } catch {}
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
  secretOverlay.style.display = "flex";
  rightImg.style.display = "none";
  rightName.style.display = "none";
  rightPlayerZone.style.display = "none";

  // stop right media
  mediaTokenRight++;
  try { rightPlayer.pause(); } catch {}
  rightPlayer.removeAttribute("src");
  rightPlayer.load();
}

function revealRightCard(item) {
  secretOverlay.style.display = "none";
  // revealed
  setCardContent("right", item, { revealed: true, autoplay: true });
}

function renderTurn() {
  roundLabel.textContent = `Tour ${currentTurn} / ${totalTurns}`;

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  recapWrap.style.display = "none";
  pendingChosen = null;
  pendingOther = null;

  keepBtn.disabled = false;
  nextChoiceBtn.disabled = false;

  // visible left
  setCardContent("left", currentItem, { revealed: true, autoplay: true });

  // hide right
  hideRightCard();

  // volume only songs
  volumeRow.style.display = (currentMode === "songs") ? "flex" : "none";
  applyVolume();
}

function handleChoice(choice) {
  if (!currentItem || !hiddenItem) return;

  // disable choices while revealing
  keepBtn.disabled = true;
  nextChoiceBtn.disabled = true;

  // pause both to avoid audio overlap
  try { leftPlayer.pause(); } catch {}
  try { rightPlayer.pause(); } catch {}

  // reveal hidden
  revealRightCard(hiddenItem);

  const chosen = (choice === "keep") ? currentItem : hiddenItem;
  const other = (choice === "keep") ? hiddenItem : currentItem;

  decisions.push({
    turn: currentTurn,
    choice,
    chosen,
    other
  });

  pendingChosen = chosen;
  pendingOther = other;

  const msg = (choice === "keep")
    ? `✅ KEEP : tu gardes <b>${formatItemLabel(currentItem)}</b> — la carte cachée était <b>${formatItemLabel(hiddenItem)}</b>.`
    : `➡️ NEXT : tu prends la cachée <b>${formatItemLabel(hiddenItem)}</b> — tu laisses <b>${formatItemLabel(currentItem)}</b>.`;

  resultDiv.innerHTML = msg;

  const isLast = currentTurn >= totalTurns;

  nextBtn.style.display = "block";
  if (!isLast) {
    nextBtn.textContent = "Tour suivant";
    nextBtn.onclick = () => {
      // avance: chosen devient la nouvelle carte visible
      currentItem = pendingChosen;
      hiddenItem = dealQueue[nextDealIndex];
      nextDealIndex++;

      currentTurn++;
      renderTurn();
    };
  } else {
    nextBtn.textContent = "Voir le récap";
    nextBtn.onclick = () => finishGame();
  }
}

function finishGame() {
  // On affiche le recap
  recapWrap.style.display = "block";
  recapList.innerHTML = "";

  for (const d of decisions) {
    const row = document.createElement("div");
    row.className = "choice-row";

    const leftCard = document.createElement("div");
    leftCard.className = "choice-card " + (d.choice === "keep" ? "picked" : "");
    leftCard.innerHTML = `
      <div class="tag">${d.choice === "keep" ? "✅ Pick" : "❌ Leave"}</div>
      <img loading="lazy" decoding="async" src="${(d.choice === "keep" ? d.chosen.image : d.other.image) || ""}" alt="">
      <span class="label">${d.choice === "keep" ? formatItemLabel(d.chosen) : formatItemLabel(d.other)}</span>
    `;

    const rightCard = document.createElement("div");
    rightCard.className = "choice-card " + (d.choice === "next" ? "picked" : "");
    rightCard.innerHTML = `
      <div class="tag">${d.choice === "next" ? "✅ Pick" : "❌ Leave"}</div>
      <img loading="lazy" decoding="async" src="${(d.choice === "next" ? d.chosen.image : d.other.image) || ""}" alt="">
      <span class="label">${d.choice === "next" ? formatItemLabel(d.chosen) : formatItemLabel(d.other)}</span>
    `;

    row.appendChild(leftCard);
    row.appendChild(rightCard);
    recapList.appendChild(row);
  }

  // message final
  const finalPick = decisions.length ? decisions[decisions.length - 1].chosen : null;
  resultDiv.innerHTML = finalPick
    ? `✅ Partie terminée — ton choix final après ${totalTurns} tours : <b>${formatItemLabel(finalPick)}</b>.`
    : `✅ Partie terminée.`;

  // bouton retour
  nextBtn.style.display = "block";
  nextBtn.textContent = "Retour réglages";
  nextBtn.onclick = () => {
    showCustomization();
    updatePreview();
  };

  // stop media
  stopAllMedia();

  // parcours: on envoie un score neutre (pas de win/lose)
  if (isParcours) {
    try {
      parent.postMessage({
        parcoursScore: { label: "Keep or Next", score: 0, total: 0 }
      }, "*");
    } catch {}
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

    applyVolume();

    // parcours auto-start
    if (isParcours) {
      filteredPool = applyFilters();
      totalTurns = clampInt(parcoursCount, 1, 100);
      turnCountEl.value = String(totalTurns);

      const minNeeded = Math.max(totalTurns + 1, MIN_REQUIRED);
      if (filteredPool.length >= minNeeded) {
        showGame();
        startGame();
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
