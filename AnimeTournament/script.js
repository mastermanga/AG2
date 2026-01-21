// =======================
// Anime Tournament — script.js (mis à jour)
// - Panel OU jeu (jamais les deux) via body.game-started
// - Fix year (season -> year)
// - UI personnalisation type Anidle
// - Vote anime cliquable
// - Chargement vidéo robuste
// =======================

const DATA_URL = "../data/licenses_only.json";
const TOTAL_MATCH_ITEMS = 32;
const MIN_REQUIRED = 64;

const ROUNDS_MIN = 1;
const ROUNDS_MAX = 100;

// =======================
// GLOBAL STATE
// =======================
let ALL_TITLES = [];
let items = [];
let mode = "anime"; // "anime" | "songs"

let losses = [];
let aliveWB = [];
let aliveLB = [];
let eliminationOrder = [];
let roundNumber = 1;
let roundMatches = [];
let roundMatchIndex = 0;
let currentMatch = null;

// =======================
// UI TOGGLE (perso vs jeu)
// =======================
function showCustomization() {
  document.body.classList.remove("game-started");
}

function showGame() {
  document.body.classList.add("game-started");
}

// =======================
// BASIC UI
// =======================
document.getElementById("back-to-menu").onclick = () => {
  window.location.href = "../index.html";
};

document.getElementById("themeToggle").onclick = () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
};

if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
}

// Tooltip (clic)
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
// HELPERS (normalisation)
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

function parseYearFromSeason(seasonStr) {
  const s = String(seasonStr || "").trim();
  if (!s) return 0;
  const m = s.match(/(19\d{2}|20\d{2})/);
  return m ? parseInt(m[1], 10) : 0;
}

function getYear(a) {
  let y = parseYearFromSeason(a.season);
  if (y) return y;

  const lists = [
    ...(a.song?.openings || []),
    ...(a.song?.endings || []),
    ...(a.song?.inserts || []),
  ];
  for (const s of lists) {
    const yy = parseYearFromSeason(s?.season);
    if (yy) return yy;
  }
  return 0;
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

function clampRoundsValue() {
  const el = document.getElementById("roundCount");
  if (!el) return 1;
  let v = parseInt(el.value, 10);
  if (!Number.isFinite(v) || v < ROUNDS_MIN) v = ROUNDS_MIN;
  if (v > ROUNDS_MAX) v = ROUNDS_MAX;
  el.value = String(v);
  return v;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setPillActive(btn, isActive) {
  btn.classList.toggle("active", !!isActive);
  btn.setAttribute("aria-pressed", isActive ? "true" : "false");
}

function ensureDefaultTypes() {
  const pills = Array.from(document.querySelectorAll("#typePills .pill[data-type]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => {
    const t = b.dataset.type;
    const should = t === "TV" || t === "Movie";
    setPillActive(b, should);
  });
}

function ensureDefaultSongKinds() {
  const pills = Array.from(document.querySelectorAll("#songPills .pill[data-song]"));
  if (!pills.length) return;

  const active = pills.filter((b) => b.classList.contains("active"));
  if (active.length > 0) return;

  pills.forEach((b) => setPillActive(b, b.dataset.song === "opening"));
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
      const year = getYear(a);
      return {
        ...a,
        _title: title,
        _year: year,
        _members: Number.isFinite(+a.members) ? +a.members : 0,
        _score: Number.isFinite(+a.score) ? +a.score : 0,
        _type: a.type || "Unknown",
      };
    });

    initPersonalisationUI();
    updatePreview();
    setRoundIndicatorIdle();

    // ✅ au chargement : on voit la personnalisation
    showCustomization();
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });

// =======================
// PERSONALISATION UI
// =======================
function initPersonalisationUI() {
  // Mode pills
  document.querySelectorAll("#modePills .pill[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.mode;
      if (!next || next === mode) return;
      mode = next;

      document.querySelectorAll("#modePills .pill[data-mode]").forEach((b) => {
        setPillActive(b, b.dataset.mode === mode);
      });

      resetTournamentUI(true);
      updatePreview();
    });
  });

  // Ranges + labels
  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  const popVal = document.getElementById("popPercentVal");
  const scoreVal = document.getElementById("scorePercentVal");
  const yMinVal = document.getElementById("yearMinVal");
  const yMaxVal = document.getElementById("yearMaxVal");

  function syncLabels() {
    clampYearSliders();
    if (popVal && pop) popVal.textContent = pop.value;
    if (scoreVal && score) scoreVal.textContent = score.value;
    if (yMinVal && yMin) yMinVal.textContent = yMin.value;
    if (yMaxVal && yMax) yMaxVal.textContent = yMax.value;
    updatePreview();
  }
  [pop, score, yMin, yMax].forEach((el) => el && el.addEventListener("input", syncLabels));

  // Types pills
  document.querySelectorAll("#typePills .pill[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPillActive(btn, !btn.classList.contains("active"));
      ensureDefaultTypes();
      updatePreview();
    });
  });
  ensureDefaultTypes();

  // Songs pills
  document.querySelectorAll("#songPills .pill[data-song]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPillActive(btn, !btn.classList.contains("active"));
      ensureDefaultSongKinds();
      updatePreview();
    });
  });
  ensureDefaultSongKinds();

  // Rounds clamp
  const roundInput = document.getElementById("roundCount");
  if (roundInput) {
    roundInput.addEventListener("input", () => clampRoundsValue());
    clampRoundsValue();
  }

  // Start
  document.getElementById("applyFiltersBtn").addEventListener("click", startGame);

  syncLabels();
}

// =======================
// READ OPTIONS + FILTERS
// =======================
function readOptions() {
  clampYearSliders();
  clampRoundsValue();
  ensureDefaultTypes();
  ensureDefaultSongKinds();

  const popPercent = parseInt(document.getElementById("popPercent").value, 10);
  const scorePercent = parseInt(document.getElementById("scorePercent").value, 10);
  const yMin = parseInt(document.getElementById("yearMin").value, 10);
  const yMax = parseInt(document.getElementById("yearMax").value, 10);

  const types = new Set(
    [...document.querySelectorAll("#typePills .pill.active[data-type]")].map((b) => b.dataset.type)
  );

  const songKinds = new Set(
    [...document.querySelectorAll("#songPills .pill.active[data-song]")].map((b) => b.dataset.song)
  );

  return {
    popRatio: popPercent / 100,
    scoreRatio: scorePercent / 100,
    yMin,
    yMax,
    types,
    songKinds,
    rounds: clampRoundsValue(),
  };
}

function filterTitles(data, o) {
  let arr = data
    .filter((a) => o.types.has(a._type))
    .filter((a) => a._year >= o.yMin && a._year <= o.yMax);

  arr.sort((a, b) => b._members - a._members);
  arr = arr.slice(0, Math.ceil(arr.length * o.popRatio));

  arr.sort((a, b) => b._score - a._score);
  arr = arr.slice(0, Math.ceil(arr.length * o.scoreRatio));

  return arr;
}

function buildSongs(titles, o) {
  const tracks = [];
  const wantOP = o.songKinds.has("opening");
  const wantED = o.songKinds.has("ending");
  const wantIN = o.songKinds.has("insert");

  const add = (baseTitle, list, kindLabel) => {
    (list || []).forEach((s) => {
      if (!s?.video) return;
      const artists = Array.isArray(s.artists) && s.artists.length ? " by " + s.artists.join(", ") : "";
      tracks.push({
        video: s.video,
        label: `${baseTitle} ${kindLabel} ${s.number ?? ""} : ${s.name ?? "Song"}${artists}`.replace(/\s+/g, " ").trim(),
      });
    });
  };

  titles.forEach((t) => {
    const baseTitle = t._title || "Titre inconnu";
    if (wantOP) add(baseTitle, t.song?.openings, "Opening");
    if (wantED) add(baseTitle, t.song?.endings, "Ending");
    if (wantIN) add(baseTitle, t.song?.inserts, "Insert");
  });

  return tracks;
}

// =======================
// PREVIEW
// =======================
function updatePreview() {
  if (!ALL_TITLES.length) return;

  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  const box = document.getElementById("previewCount");
  const btn = document.getElementById("applyFiltersBtn");

  if (mode === "anime") {
    const ok = titles.length >= MIN_REQUIRED;
    box.textContent = `📚 Titres disponibles : ${titles.length} ${ok ? "(OK)" : "(Min 64)"}`;
    box.classList.toggle("good", ok);
    box.classList.toggle("bad", !ok);
    btn.disabled = !ok;
    return;
  }

  const songs = buildSongs(titles, o);
  const ok = songs.length >= MIN_REQUIRED;
  box.textContent = `🎵 Songs disponibles : ${songs.length} ${ok ? "(OK)" : "(Min 64)"}`;
  box.classList.toggle("good", ok);
  box.classList.toggle("bad", !ok);
  btn.disabled = !ok;
}

// =======================
// START GAME
// =======================
function startGame() {
  resetTournamentUI(true);

  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  if (mode === "anime") {
    if (titles.length < MIN_REQUIRED) {
      alert(`Pas assez de titres pour lancer (${titles.length}/${MIN_REQUIRED}).`);
      return;
    }
    const pool = shuffle([...titles]);
    items = pool.slice(0, TOTAL_MATCH_ITEMS).map((t) => ({
      image: t.image,
      title: t._title,
      mal_id: t.mal_id,
    }));
  } else {
    const songs = buildSongs(titles, o);
    if (songs.length < MIN_REQUIRED) {
      alert(`Pas assez de songs pour lancer (${songs.length}/${MIN_REQUIRED}).`);
      return;
    }
    const pool = shuffle([...songs]);
    items = pool.slice(0, TOTAL_MATCH_ITEMS);
  }

  // ✅ on passe en mode jeu
  showGame();

  initTournament();

  // (optionnel) scroll vers le jeu
  document.getElementById("game-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =======================
// TOURNAMENT CORE
// =======================
function initTournament() {
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
    if (l === 0) aliveWB.push(i);
    else if (l === 1) aliveLB.push(i);
  });
}

function getAliveIndices() {
  const alive = [];
  losses.forEach((l, i) => {
    if (l < 2) alive.push(i);
  });
  return alive;
}

function pair(pool) {
  const p = shuffle([...pool]);
  const r = [];
  while (p.length >= 2) r.push({ a: p.pop(), b: p.pop() });
  return r;
}

function buildNextRound() {
  const m = [];
  pair(aliveWB).forEach((p) => m.push(p));
  pair(aliveLB).forEach((p) => m.push(p));
  roundMatches = shuffle(m);
  roundMatchIndex = 0;
}

function showNextMatch() {
  const alive = getAliveIndices();
  if (alive.length <= 1) {
    finishTournament(alive[0]);
    return;
  }

  if (roundMatchIndex >= roundMatches.length) {
    roundNumber++;
    buildNextRound();
  }

  if (!roundMatches.length) {
    finishTournament(alive[0]);
    return;
  }

  currentMatch = roundMatches[roundMatchIndex++];
  updateRoundIndicator();
  renderMatch();
}

// =======================
// RENDER MATCH
// =======================
async function renderMatch() {
  const box = document.getElementById("duel-container");
  box.innerHTML = "";

  for (const idx of [currentMatch.a, currentMatch.b]) {
    const item = items[idx];
    const div = document.createElement("div");
    div.className = mode === "anime" ? "anime" : "opening";

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image;
      img.alt = item.title || "Anime";

      const title = document.createElement("div");
      title.className = "vote-title";
      title.textContent = item.title || "Titre";
      title.onclick = () => vote(idx);

      div.append(img, title);
    } else {
      const video = document.createElement("video");
      video.controls = true;
      await loadVideoWithRetry(video, item.video);

      const title = document.createElement("div");
      title.className = "vote-title";
      title.textContent = item.label;
      title.onclick = () => vote(idx);

      div.append(video, title);
    }

    box.appendChild(div);
  }
}

// =======================
// VIDEO LOAD WITH RETRY (sans autoplay)
// =======================
function waitVideoEvent(video, timeoutMs = 6500) {
  return new Promise((resolve, reject) => {
    let done = false;
    const onOk = () => { if (done) return; done = true; cleanup(); resolve(); };
    const onErr = () => { if (done) return; done = true; cleanup(); reject(new Error("video error")); };
    const t = setTimeout(() => { if (done) return; done = true; cleanup(); reject(new Error("timeout")); }, timeoutMs);

    function cleanup() {
      clearTimeout(t);
      video.removeEventListener("loadeddata", onOk);
      video.removeEventListener("canplay", onOk);
      video.removeEventListener("error", onErr);
    }

    video.addEventListener("loadeddata", onOk, { once: true });
    video.addEventListener("canplay", onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

async function loadVideoWithRetry(video, url) {
  const delays = [0, 2000, 6000];

  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      video.src = url;
      video.load();
      await waitVideoEvent(video);
      return;
    } catch {}
  }

  const s = document.createElement("div");
  s.textContent = "❌ Vidéo indisponible";
  s.style.fontWeight = "900";
  s.style.opacity = "0.9";
  s.style.padding = "8px 2px";
  video.replaceWith(s);
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
  showNextMatch();
}

// =======================
// FIN + UI
// =======================
function setRoundIndicatorIdle() {
  const el = document.getElementById("round-indicator");
  if (!el) return;
  el.textContent = "Tournoi : en cours…";
}

function updateRoundIndicator() {
  const el = document.getElementById("round-indicator");
  if (!el) return;
  const total = roundMatches.length || 0;
  const idx = Math.min(roundMatchIndex, total);
  el.textContent = `Round ${roundNumber} — Match ${idx}/${Math.max(1, total)} — Mode: ${mode === "anime" ? "Animes" : "Songs"}`;
}

function finishTournament(winnerIndex) {
  const duel = document.getElementById("duel-container");
  const replay = document.getElementById("next-match-btn");

  let winnerLabel = "—";
  if (typeof winnerIndex === "number" && items[winnerIndex]) {
    winnerLabel = mode === "anime" ? items[winnerIndex].title : items[winnerIndex].label;
  }

  duel.innerHTML = `
    <div style="width:100%; text-align:center; font-weight:900; font-size:1.35rem;">
      🏆 Tournoi terminé !<br>
      <div style="margin-top:10px; font-size:1.05rem; opacity:0.92;">
        Gagnant : <span style="text-decoration:underline;">${escapeHtml(winnerLabel)}</span>
      </div>
    </div>
  `;

  replay.style.display = "inline-flex";
  replay.onclick = () => {
    // ✅ retour au panel (pas les deux)
    resetTournamentUI(true);
    updatePreview();
    showCustomization();
    document.getElementById("custom-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

function resetTournamentUI(keepMode = true) {
  document.getElementById("duel-container").innerHTML = "";
  document.getElementById("classement").innerHTML = "";
  document.getElementById("next-match-btn").style.display = "none";

  items = [];
  losses = [];
  aliveWB = [];
  aliveLB = [];
  eliminationOrder = [];
  roundNumber = 1;
  roundMatches = [];
  roundMatchIndex = 0;
  currentMatch = null;

  // (optionnel) ne touche pas au mode sélectionné
  if (!keepMode) mode = "anime";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
