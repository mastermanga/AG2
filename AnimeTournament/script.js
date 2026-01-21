// =======================
// CONFIG
// =======================
const DATA_URL = "../data/licenses_only.json";
const TOTAL_MATCH_ITEMS = 32;
const MIN_REQUIRED = 62;

// =======================
// GLOBAL STATE
// =======================
let ALL_TITLES = [];
let items = [];
let mode = "anime";
let losses = [];
let played = [];
let aliveWB = [];
let aliveLB = [];
let eliminationOrder = [];
let roundNumber = 1;
let roundMatches = [];
let roundMatchIndex = 0;
let currentMatch = null;

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

// =======================
// MODE SWITCH
// =======================
document.getElementById("mode-anime").onclick = () => switchMode("anime");
document.getElementById("mode-opening").onclick = () => switchMode("opening");

function switchMode(m) {
  if (mode === m) return;
  mode = m;
  document.getElementById("mode-anime").classList.toggle("active", m === "anime");
  document.getElementById("mode-opening").classList.toggle("active", m === "opening");
  resetTournament();
  refreshPreview();
}

// =======================
// LOAD DATA
// =======================
fetch(DATA_URL)
  .then(r => r.json())
  .then(json => {
    ALL_TITLES = json;
    setDefaultUI();
    wireCustomizationUI();
    refreshPreview();
  });

// =======================
// DEFAULT UI VALUES
// =======================
function setDefaultUI() {
  document.getElementById("popPercent").value = 25;
  document.getElementById("scorePercent").value = 25;
  document.getElementById("yearMin").value = 2013;
  document.getElementById("yearMax").value = 2026;
  document.getElementById("incOpenings").checked = true;
  document.getElementById("incEndings").checked = false;
  document.getElementById("incInserts").checked = false;

  document.querySelectorAll("#typePills .pill").forEach(b => {
    const on = b.dataset.type === "TV";
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
}

// =======================
// UI READ
// =======================
function readOptions() {
  const pop = +document.getElementById("popPercent").value / 100;
  const score = +document.getElementById("scorePercent").value / 100;
  const yMin = +document.getElementById("yearMin").value;
  const yMax = +document.getElementById("yearMax").value;

  document.getElementById("popPercentVal").textContent = pop * 100;
  document.getElementById("scorePercentVal").textContent = score * 100;
  document.getElementById("yearMinVal").textContent = yMin;
  document.getElementById("yearMaxVal").textContent = yMax;

  const types = new Set(
    [...document.querySelectorAll("#typePills .pill.active")]
      .map(b => b.dataset.type)
  );

  return {
    pop,
    score,
    yMin,
    yMax,
    types,
    incOP: document.getElementById("incOpenings").checked,
    incED: document.getElementById("incEndings").checked,
    incIN: document.getElementById("incInserts").checked,
  };
}

// =======================
// FILTER TITLES
// =======================
function filterTitles(data, o) {
  let arr = [...data];

  arr.sort((a, b) => b.members - a.members);
  arr = arr.slice(0, Math.ceil(arr.length * o.pop));

  arr.sort((a, b) => b.score - a.score);
  arr = arr.slice(0, Math.ceil(arr.length * o.score));

  arr = arr.filter(a =>
    o.types.has(a.type) &&
    a.year >= o.yMin &&
    a.year <= o.yMax
  );

  return arr;
}

// =======================
// BUILD SONGS
// =======================
function buildSongs(titles, o) {
  const tracks = [];
  titles.forEach(t => {
    const baseTitle = t.title_english || t.title_original || t.title_mal_default;

    const add = (list, kind) => {
      (list || []).forEach(s => {
        tracks.push({
          video: s.video,
          label: `${baseTitle} ${kind} ${s.number} : ${s.name}${s.artists?.length ? " by " + s.artists.join(", ") : ""}`
        });
      });
    };

    if (o.incOP) add(t.song?.openings, "opening");
    if (o.incED) add(t.song?.endings, "ending");
    if (o.incIN) add(t.song?.inserts, "insert");
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

  if (mode === "anime") {
    box.textContent = `${titles.length} titres disponibles`;
    btn.disabled = titles.length < MIN_REQUIRED;
  } else {
    const songs = buildSongs(titles, o);
    box.textContent = `${songs.length} songs disponibles`;
    btn.disabled = songs.length < MIN_REQUIRED;
  }
}

// =======================
// UI EVENTS
// =======================
function wireCustomizationUI() {
  document.querySelectorAll("#custom-panel input, #custom-panel select")
    .forEach(e => e.addEventListener("input", refreshPreview));

  document.getElementById("typePills").onclick = e => {
    const b = e.target.closest(".pill");
    if (!b) return;
    b.classList.toggle("active");
    b.setAttribute("aria-pressed", b.classList.contains("active"));
    if (!document.querySelector("#typePills .pill.active")) {
      b.classList.add("active");
    }
    refreshPreview();
  };

  document.getElementById("applyFiltersBtn").onclick = startGame;
}

// =======================
// START GAME
// =======================
function startGame() {
  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  if (mode === "anime") {
    shuffle(titles);
    items = titles.slice(0, TOTAL_MATCH_ITEMS);
  } else {
    const songs = buildSongs(titles, o);
    shuffle(songs);
    items = songs.slice(0, TOTAL_MATCH_ITEMS);
  }

  initTournament();
}

// =======================
// TOURNAMENT CORE (double elim)
// =======================
function initTournament() {
  losses = items.map(() => 0);
  played = items.map(() => new Set());
  eliminationOrder = [];
  recomputePools();
  roundNumber = 1;
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

function buildNextRound() {
  const m = [];
  pair(aliveWB).forEach(p => m.push(p));
  pair(aliveLB).forEach(p => m.push(p));
  roundMatches = shuffle(m);
  roundMatchIndex = 0;
}

function pair(pool) {
  const p = shuffle([...pool]);
  const r = [];
  while (p.length >= 2) r.push({ a: p.pop(), b: p.pop() });
  return r;
}

function showNextMatch() {
  if (roundMatchIndex >= roundMatches.length) {
    roundNumber++;
    buildNextRound();
  }
  currentMatch = roundMatches[roundMatchIndex++];
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
      div.innerHTML = `<img src="${item.image}"><div class="vote-title">${item.title}</div>`;
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
// VIDEO LOAD WITH RETRY
// =======================
function loadVideoWithRetry(video, url) {
  return new Promise(async resolve => {
    for (const delay of [0, 3000, 10000]) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      video.src = url;
      try {
        await video.play();
        video.pause();
        return resolve();
      } catch {}
    }
    const s = document.createElement("div");
    s.textContent = "❌ Vidéo indisponible";
    video.replaceWith(s);
    resolve();
  });
}

// =======================
// VOTE
// =======================
function vote(winner) {
  const loser = winner === currentMatch.a ? currentMatch.b : currentMatch.a;
  losses[loser]++;
  if (losses[loser] === 2) eliminationOrder.push(loser);
  recomputePools();
  showNextMatch();
}

// =======================
// UTILS
// =======================
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resetTournament() {
  document.getElementById("duel-container").innerHTML = "";
  document.getElementById("classement").innerHTML = "";
}
