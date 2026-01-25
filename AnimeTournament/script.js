// =======================
// Anime Tournament — script.js (COMPLET)
// - Volume global (Songs only) + pas de mute
// - Fix boucle reload vidéos (ne retry plus sur waiting/stalled)
// - Token anti-concurrence (LOAD_SESSION)
// - Titres / UI robustes
// =======================

// =======================
// CONFIG
// =======================
const DATA_URL = "../data/licenses_only.json";
const TOTAL_MATCH_ITEMS = 32;

const MIN_REQUIRED_TITLES = 64;
const MIN_REQUIRED_SONGS = 64;

// retries vidéos
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const LOAD_TIMEOUT_MS = 6000;

// =======================
// GLOBAL STATE
// =======================
let ALL_TITLES = [];
let items = [];              // 32 items sélectionnés (animes OU songs)
let mode = "anime";          // "anime" | "songs"

let losses = [];
let eliminationOrder = [];
let aliveWB = [];
let aliveLB = [];

let roundNumber = 1;
let roundMatches = [];
let roundMatchIndex = 0;
let currentMatch = null;

// anti-concurrence chargements
let LOAD_SESSION = 0;

// volume global
let GLOBAL_VOLUME = 0.5;

// =======================
// HELPERS DATA
// =======================
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

function getYearFromSeason(a) {
  const s = String(a.season || "").trim();
  if (!s) return 0;
  const parts = s.split(/\s+/);
  const y = parseInt(parts[1] || parts[0] || "0", 10);
  return Number.isFinite(y) ? y : 0;
}

function clampYearSliders() {
  const minEl = document.getElementById("yearMin");
  const maxEl = document.getElementById("yearMax");
  if (!minEl || !maxEl) return;

  let a = parseInt(minEl.value, 10);
  let b = parseInt(maxEl.value, 10);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = 0;

  if (a > b) {
    [a, b] = [b, a];
    minEl.value = String(a);
    maxEl.value = String(b);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =======================
// BASIC UI
// =======================
document.getElementById("back-to-menu")?.addEventListener("click", () => {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
});

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
  }
});

// Tooltip aide (clic mobile)
document.addEventListener("pointerdown", (e) => {
  const wrap = e.target.closest(".info-wrap");

  if (wrap && e.target.closest(".info-icon")) {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.toggle("open");
    return;
  }

  document.querySelectorAll(".info-wrap.open").forEach((w) => w.classList.remove("open"));
});

// =======================
// VOLUME (Songs only)
// =======================
function loadSavedVolume() {
  const v = parseFloat(localStorage.getItem("tournament_volume") || "0.5");
  GLOBAL_VOLUME = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

function saveVolume(v) {
  localStorage.setItem("tournament_volume", String(v));
}

function applyGlobalVolumeToVideo(video) {
  if (!video) return;
  try {
    video.muted = false; // ✅ pas de mute
    video.volume = GLOBAL_VOLUME;
  } catch {}
}

function applyGlobalVolumeToAllVideos() {
  document.querySelectorAll("#duel-container video, #classement video").forEach((v) => {
    applyGlobalVolumeToVideo(v);
  });
}

function initVolumeUI() {
  loadSavedVolume();

  const bar = document.getElementById("volumeBar");
  const slider = document.getElementById("volumeSlider");
  const val = document.getElementById("volumeVal");

  if (!bar || !slider || !val) return;

  slider.value = String(Math.round(GLOBAL_VOLUME * 100));
  val.textContent = String(Math.round(GLOBAL_VOLUME * 100));

  slider.addEventListener("input", () => {
    const p = parseInt(slider.value, 10);
    const vv = (Number.isFinite(p) ? p : 50) / 100;
    GLOBAL_VOLUME = Math.min(1, Math.max(0, vv));
    val.textContent = String(Math.round(GLOBAL_VOLUME * 100));
    saveVolume(GLOBAL_VOLUME);
    applyGlobalVolumeToAllVideos();
  });
}

function updateVolumeVisibility() {
  const bar = document.getElementById("volumeBar");
  if (!bar) return;

  // ✅ uniquement en jeu + uniquement Songs
  const shouldShow = document.body.classList.contains("game-started") && mode === "songs";
  bar.style.display = shouldShow ? "flex" : "none";
}

// =======================
// PANEL vs GAME
// =======================
function showCustomization() {
  document.body.classList.remove("game-started");

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "";

  const gameEls = [
    document.getElementById("round-indicator"),
    document.getElementById("volumeBar"),
    document.getElementById("duel-container"),
    document.getElementById("next-match-btn"),
    document.getElementById("classement"),
  ];
  gameEls.forEach((el) => {
    if (el) el.style.display = "none";
  });
}

function showGame() {
  document.body.classList.add("game-started");

  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "none";

  const duel = document.getElementById("duel-container");
  if (duel) duel.style.display = "";

  const roundBox = document.getElementById("round-indicator");
  if (roundBox) roundBox.style.display = "";

  const classement = document.getElementById("classement");
  if (classement) classement.style.display = "none";

  const replay = document.getElementById("next-match-btn");
  if (replay) replay.style.display = "none";

  updateVolumeVisibility();
}

// =======================
// MODE (pills #modePills)
// =======================
function syncModeButtons() {
  document.querySelectorAll("#modePills .pill[data-mode]").forEach((btn) => {
    const m = btn.dataset.mode;
    const on = m === mode;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function initModePillsIfAny() {
  const pills = Array.from(document.querySelectorAll("#modePills .pill[data-mode]"));
  if (!pills.length) return;

  pills.forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.mode;
      if (!m || m === mode) return;
      switchMode(m);
    });
  });

  syncModeButtons();
}

function switchMode(m) {
  mode = m; // "anime" | "songs"
  syncModeButtons();
  resetTournament();
  refreshPreview();
  updateVolumeVisibility();
}

// =======================
// DEFAULT UI VALUES
// =======================
function setDefaultUI() {
  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  if (pop) pop.value = "30";
  if (score) score.value = "100";
  if (yMin) yMin.value = "1950";
  if (yMax) yMax.value = "2026";

  // défaut types: TV + Movie
  const typePills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
  if (typePills.length) {
    typePills.forEach((b) => {
      const t = b.dataset.type;
      const on = t === "TV" || t === "Movie";
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // défaut songs: Opening
  const songPills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
  if (songPills.length) {
    songPills.forEach((b) => {
      const s = b.dataset.song;
      const on = s === "opening";
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
}

function ensureDefaultTypes() {
  const pills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => {
    const t = b.dataset.type;
    const on = t === "TV" || t === "Movie";
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function ensureDefaultSongs() {
  const pills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => {
    const s = b.dataset.song;
    const on = s === "opening";
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// =======================
// UI READ
// =======================
function readOptions() {
  clampYearSliders();
  ensureDefaultTypes();
  ensureDefaultSongs();

  const popEl = document.getElementById("popPercent");
  const scoreEl = document.getElementById("scorePercent");
  const yMinEl = document.getElementById("yearMin");
  const yMaxEl = document.getElementById("yearMax");

  const pop = (parseInt(popEl?.value || "30", 10) || 30) / 100;
  const score = (parseInt(scoreEl?.value || "100", 10) || 100) / 100;
  const yMin = parseInt(yMinEl?.value || "1950", 10) || 0;
  const yMax = parseInt(yMaxEl?.value || "2026", 10) || 9999;

  // affichage valeurs
  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yMinVal = document.getElementById("yearMinVal");
  const yMaxVal = document.getElementById("yearMaxVal");

  if (popVal) popVal.textContent = String(Math.round(pop * 100));
  if (scoreVal) scoreVal.textContent = String(Math.round(score * 100));
  if (yMinVal) yMinVal.textContent = String(yMin);
  if (yMaxVal) yMaxVal.textContent = String(yMax);

  const types = new Set(
    [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type)
  );

  const songKinds = new Set(
    [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song)
  );

  return {
    pop,
    score,
    yMin,
    yMax,
    types,
    incOP: songKinds.has("opening"),
    incED: songKinds.has("ending"),
    incIN: songKinds.has("insert"),
  };
}

// =======================
// FILTER TITLES
// =======================
function filterTitles(data, o) {
  let arr = [...data];

  arr.sort((a, b) => b._members - a._members);
  arr = arr.slice(0, Math.ceil(arr.length * o.pop));

  arr.sort((a, b) => b._score - a._score);
  arr = arr.slice(0, Math.ceil(arr.length * o.score));

  arr = arr.filter((a) => o.types.has(a._type) && a._year >= o.yMin && a._year <= o.yMax);

  return arr;
}

// =======================
// BUILD SONGS
// =======================
function buildSongs(titles, o) {
  const tracks = [];

  const addList = (baseTitle, list, kind) => {
    (list || []).forEach((s) => {
      if (!s?.video) return;
      tracks.push({
        video: s.video,
        label: `${baseTitle} ${kind} ${s.number ?? ""} : ${s.name ?? ""}${
          s.artists?.length ? " by " + s.artists.join(", ") : ""
        }`.replace(/\s+/g, " ").trim(),
      });
    });
  };

  titles.forEach((t) => {
    const baseTitle = t._title || getDisplayTitle(t);

    if (o.incOP) addList(baseTitle, t.song?.openings, "Opening");
    if (o.incED) addList(baseTitle, t.song?.endings, "Ending");
    if (o.incIN) addList(baseTitle, t.song?.inserts, "Insert");
  });

  return tracks;
}

// =======================
// PREVIEW COUNT
// =======================
function refreshPreview() {
  if (!ALL_TITLES.length) return;

  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  const box = document.getElementById("previewCount");
  const btn = document.getElementById("applyFiltersBtn");

  const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);
  const minSongsNeeded = Math.max(MIN_REQUIRED_SONGS, TOTAL_MATCH_ITEMS);

  if (mode === "anime") {
    const ok = titles.length >= minTitlesNeeded;
    if (box) {
      box.textContent = `📚 ${titles.length} titres disponibles${ok ? " (OK)" : ` (Min ${minTitlesNeeded})`}`;
      box.classList.toggle("good", ok);
      box.classList.toggle("bad", !ok);
    }
    if (btn) btn.disabled = !ok;
  } else {
    const songs = buildSongs(titles, o);
    const ok = songs.length >= minSongsNeeded;

    if (box) {
      box.textContent = `🎵 ${songs.length} songs disponibles${ok ? " (OK)" : ` (Min ${minSongsNeeded})`}`;
      box.classList.toggle("good", ok);
      box.classList.toggle("bad", !ok);
    }
    if (btn) btn.disabled = !ok;
  }
}

// =======================
// UI EVENTS
// =======================
function wireCustomizationUI() {
  document.querySelectorAll("#custom-panel input").forEach((e) => {
    e.addEventListener("input", refreshPreview);
  });

  // types pills: au moins 1
  document.getElementById("typePills")?.addEventListener("click", (e) => {
    const b = e.target.closest(".pill[data-type]");
    if (!b) return;

    const pills = [...document.querySelectorAll("#typePills .pill[data-type]")];

    if (b.classList.contains("active")) {
      const actives = pills.filter((x) => x.classList.contains("active"));
      if (actives.length === 1) return;
    }

    b.classList.toggle("active");
    b.setAttribute("aria-pressed", b.classList.contains("active") ? "true" : "false");

    ensureDefaultTypes();
    refreshPreview();
  });

  // songs pills: au moins 1
  document.getElementById("songPills")?.addEventListener("click", (e) => {
    const b = e.target.closest(".pill[data-song]");
    if (!b) return;

    const pills = [...document.querySelectorAll("#songPills .pill[data-song]")];

    if (b.classList.contains("active")) {
      const actives = pills.filter((x) => x.classList.contains("active"));
      if (actives.length === 1) return;
    }

    b.classList.toggle("active");
    b.setAttribute("aria-pressed", b.classList.contains("active") ? "true" : "false");

    ensureDefaultSongs();
    refreshPreview();
  });

  document.getElementById("applyFiltersBtn")?.addEventListener("click", startGame);
}

// =======================
// LOAD DATA
// =======================
fetch(DATA_URL)
  .then((r) => r.json())
  .then((json) => {
    const arr = Array.isArray(json) ? json : [];

    ALL_TITLES = arr.map((a) => {
      const title = getDisplayTitle(a);
      return {
        ...a,
        _title: title,
        _year: getYearFromSeason(a),
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
      };
    });

    initVolumeUI();
    setDefaultUI();
    initModePillsIfAny();
    syncModeButtons();
    wireCustomizationUI();
    refreshPreview();
    showCustomization();
    updateVolumeVisibility();
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });

// =======================
// START GAME
// =======================
function startGame() {
  if (!ALL_TITLES.length) return;

  resetTournament();

  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);

  if (mode === "anime") {
    if (titles.length < minTitlesNeeded) {
      alert(`Pas assez de titres (${titles.length}/${minTitlesNeeded}).`);
      return;
    }

    const pool = shuffle([...titles]);
    items = pool.slice(0, TOTAL_MATCH_ITEMS).map((t) => ({
      image: t.image,
      title: t._title,
    }));
  } else {
    const songs = buildSongs(titles, o);
    const minSongsNeeded = Math.max(MIN_REQUIRED_SONGS, TOTAL_MATCH_ITEMS);

    if (songs.length < minSongsNeeded) {
      alert(`Pas assez de songs (${songs.length}/${minSongsNeeded}).`);
      return;
    }

    const pool = shuffle([...songs]);
    items = pool.slice(0, TOTAL_MATCH_ITEMS);
  }

  showGame();
  initTournament();
}

// =======================
// TOURNAMENT CORE
// =======================
function initTournament() {
  if (!items || items.length < 2) {
    const roundBox = document.getElementById("round-indicator");
    if (roundBox) roundBox.textContent = "❌ Pas assez d'items pour démarrer.";
    showCustomization();
    return;
  }

  losses = items.map(() => 0);
  eliminationOrder = [];

  roundNumber = 1;
  recomputePools();
  buildNextRound();
  showNextMatch();
}

function recomputePools() {
  aliveWB = [];
  aliveLB = [];
  losses.forEach((l, i) => {
    if (l < 2) {
      if (l === 0) aliveWB.push(i);
      else aliveLB.push(i);
    }
  });
}

function getAliveAll() {
  const all = [];
  losses.forEach((l, i) => {
    if (l < 2) all.push(i);
  });
  return all;
}

function isTournamentOver() {
  return getAliveAll().length <= 1;
}

function buildNextRound() {
  const m = [];
  pair(aliveWB).forEach((p) => m.push(p));
  pair(aliveLB).forEach((p) => m.push(p));

  if (m.length === 0) {
    const all = getAliveAll();
    pair(all).forEach((p) => m.push(p));
  }

  roundMatches = shuffle(m);
  roundMatchIndex = 0;
}

function pair(pool) {
  const p = shuffle([...pool]);
  const r = [];
  while (p.length >= 2) r.push({ a: p.pop(), b: p.pop() });
  return r;
}

function updateRoundIndicator() {
  const box = document.getElementById("round-indicator");
  if (!box) return;

  const totalThisRound = roundMatches.length || 0;
  const currentIndex = Math.min(roundMatchIndex, totalThisRound);

  box.textContent = `Round ${roundNumber} — Match ${currentIndex}/${totalThisRound} — Mode: ${mode === "anime" ? "Animes" : "Songs"}`;
}

function showNextMatch() {
  if (isTournamentOver()) {
    finishTournament();
    return;
  }

  if (roundMatchIndex >= roundMatches.length) {
    roundNumber++;
    buildNextRound();

    if (roundMatches.length === 0 && !isTournamentOver()) {
      const all = getAliveAll();
      roundMatches = pair(all);
      roundMatchIndex = 0;
    }
  }

  if (!roundMatches.length) {
    finishTournament();
    return;
  }

  currentMatch = roundMatches[roundMatchIndex++];
  updateRoundIndicator();
  renderMatch();
}

// =======================
// CLEANUP MEDIA
// =======================
function cleanupCurrentMedia() {
  const box = document.getElementById("duel-container");
  if (!box) return;

  box.querySelectorAll("video").forEach((v) => {
    try {
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {}
  });
}

// =======================
// VIDEO LOAD (no waiting/stalled as fail) + token
// =======================
function waitEventOrTimeout(target, events, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;

    const onOk = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(true);
    };

    const onFail = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("video error"));
    };

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(t);
      events.ok.forEach((ev) => target.removeEventListener(ev, onOk));
      events.fail.forEach((ev) => target.removeEventListener(ev, onFail));
    }

    events.ok.forEach((ev) => target.addEventListener(ev, onOk, { once: true }));
    events.fail.forEach((ev) => target.addEventListener(ev, onFail, { once: true }));
  });
}

function getOrCreateStatusEl(video) {
  const parent = video.parentElement;
  if (!parent) return null;

  let st = parent.querySelector(".videoStatus");
  if (!st) {
    st = document.createElement("div");
    st.className = "videoStatus";
    parent.insertBefore(st, video.nextSibling);
  }
  return st;
}

async function loadVideoWithRetry(video, url, { autoplay = false, session = 0 } = {}) {
  video.preload = "metadata";
  video.playsInline = true;
  video.controls = true;

  applyGlobalVolumeToVideo(video);

  const status = getOrCreateStatusEl(video);

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (session !== LOAD_SESSION) return false;

    const delay = RETRY_DELAYS[attempt];
    if (delay) await new Promise((r) => setTimeout(r, delay));

    if (session !== LOAD_SESSION) return false;

    try {
      if (status) status.textContent = `Chargement… (essai ${attempt + 1}/${RETRY_DELAYS.length})`;

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}

      video.src = url;
      video.load();

      // ✅ on attend des états "OK"
      await waitEventOrTimeout(
        video,
        { ok: ["loadedmetadata", "loadeddata", "canplay"], fail: ["error", "abort"] },
        LOAD_TIMEOUT_MS
      );

      if (session !== LOAD_SESSION) return false;

      // ✅ Buffering = normal (pas un fail)
      const onWaiting = () => { if (status) status.textContent = "⏳ Buffering…"; };
      const onPlaying = () => { if (status) status.textContent = "✅ Lecture"; };
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("stalled", onWaiting);
      video.addEventListener("playing", onPlaying);

      if (autoplay) {
        try {
          await video.play(); // peut être bloqué sans mute → OK
          if (status) status.textContent = "✅ Lecture";
        } catch {
          if (status) status.textContent = "▶️ Clique sur la vidéo pour lancer";
        }
      } else {
        if (status) status.textContent = "✅ Prêt";
      }

      setTimeout(() => {
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("stalled", onWaiting);
        video.removeEventListener("playing", onPlaying);
      }, 1500);

      return true;
    } catch {
      // retry seulement sur error/abort/timeout
    }
  }

  if (status) status.textContent = "❌ Vidéo indisponible";
  const fallback = document.createElement("div");
  fallback.textContent = "❌ Vidéo indisponible";
  fallback.style.fontWeight = "900";
  fallback.style.opacity = "0.9";
  video.replaceWith(fallback);
  return false;
}

// =======================
// RENDER MATCH
// =======================
async function renderMatch() {
  const box = document.getElementById("duel-container");
  if (!box) return;

  cleanupCurrentMedia();
  box.innerHTML = "";

  const session = ++LOAD_SESSION; // ✅ nouveau token à chaque match

  const indices = [currentMatch.a, currentMatch.b];
  const cardEls = [];

  for (const idx of indices) {
    const item = items[idx];

    const div = document.createElement("div");
    div.className = mode === "anime" ? "anime" : "opening";

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image;
      img.alt = item.title || "anime";
      img.loading = "eager";

      const title = document.createElement("div");
      title.className = "vote-title";
      title.textContent = item.title || "Titre";
      title.addEventListener("click", () => vote(idx));

      div.appendChild(img);
      div.appendChild(title);
      box.appendChild(div);
      cardEls.push({ idx });
    } else {
      const video = document.createElement("video");

      const title = document.createElement("div");
      title.className = "vote-title";
      title.textContent = item.label || "Song";
      title.addEventListener("click", () => vote(idx));

      div.appendChild(video);
      div.appendChild(title);
      box.appendChild(div);
      cardEls.push({ idx, video, url: item.video });
    }
  }

  updateVolumeVisibility();

  if (mode === "songs") {
    const left = cardEls.find((c) => c.idx === currentMatch.a);
    if (left?.video && left?.url) {
      await loadVideoWithRetry(left.video, left.url, { autoplay: true, session });
      applyGlobalVolumeToVideo(left.video);
    }

    const right = cardEls.find((c) => c.idx === currentMatch.b);
    if (right?.video && right?.url) {
      await loadVideoWithRetry(right.video, right.url, { autoplay: false, session });
      applyGlobalVolumeToVideo(right.video);
    }

    applyGlobalVolumeToAllVideos();
  }
}

// =======================
// VOTE
// =======================
function vote(winner) {
  if (!currentMatch) return;

  const loser = winner === currentMatch.a ? currentMatch.b : currentMatch.a;
  losses[loser]++;

  if (losses[loser] === 2) eliminationOrder.push(loser);

  recomputePools();

  if (isTournamentOver()) {
    finishTournament();
    return;
  }

  showNextMatch();
}

// =======================
// FIN + CLASSEMENT
// =======================
function finishTournament() {
  LOAD_SESSION++; // stop chargements en cours
  cleanupCurrentMedia();

  const alive = getAliveAll();
  const winner = alive.length ? alive[0] : null;

  const ranking = [];
  if (winner !== null) ranking.push(winner);
  ranking.push(...eliminationOrder.slice().reverse());

  renderClassement(ranking);

  const replay = document.getElementById("next-match-btn");
  if (replay) {
    replay.style.display = "";
    replay.textContent = "Rejouer";
    replay.onclick = () => {
      resetTournament();
      showCustomization();
      refreshPreview();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  const duel = document.getElementById("duel-container");
  if (duel) duel.innerHTML = "";

  const roundBox = document.getElementById("round-indicator");
  if (roundBox) roundBox.textContent = "🏁 Tournoi terminé !";

  updateVolumeVisibility();
}

function renderClassement(rankingIdx) {
  const box = document.getElementById("classement");
  if (!box) return;

  box.innerHTML = "";
  box.style.display = "";

  rankingIdx.forEach((idx, i) => {
    const item = items[idx];
    const rank = i + 1;

    const card = document.createElement("div");
    card.className = "classement-item";

    const badge = document.createElement("div");
    badge.className = "rank";
    badge.textContent = `#${rank}`;
    card.appendChild(badge);

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image;
      img.alt = item.title || "anime";
      img.loading = "lazy";
      card.appendChild(img);

      const t = document.createElement("div");
      t.className = "title";
      t.textContent = item.title || "Titre";
      card.appendChild(t);
    } else {
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      v.src = item.video;
      applyGlobalVolumeToVideo(v);
      card.appendChild(v);

      const t = document.createElement("div");
      t.className = "title";
      t.textContent = item.label || "Song";
      card.appendChild(t);
    }

    box.appendChild(card);
  });

  applyGlobalVolumeToAllVideos();
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =======================
// RESET
// =======================
function resetTournament() {
  LOAD_SESSION++; // stop chargements en cours
  cleanupCurrentMedia();

  const duel = document.getElementById("duel-container");
  const classement = document.getElementById("classement");
  const replay = document.getElementById("next-match-btn");
  const roundBox = document.getElementById("round-indicator");

  if (duel) duel.innerHTML = "";
  if (classement) {
    classement.innerHTML = "";
    classement.style.display = "none";
  }
  if (replay) replay.style.display = "none";
  if (roundBox) roundBox.textContent = "";

  items = [];
  losses = [];
  eliminationOrder = [];
  aliveWB = [];
  aliveLB = [];
  roundNumber = 1;
  roundMatches = [];
  roundMatchIndex = 0;
  currentMatch = null;

  updateVolumeVisibility();
}
