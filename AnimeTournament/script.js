// =======================
// Anime Tournament — script.js (COMPLET + MODIFIÉ)
// - Fix "0 titres dispo" (le JSON n'a pas "year" => on le calcule depuis season)
// - Personnalisation robuste (types sécurisés TV+Movie si rien)
// - Preview fiable + bouton disabled si pool insuffisant
// - Affiche soit personnalisation soit jeu (classe body.game-started)
// - Matchs en 2 colonnes (CSS) + vote sur le TITRE uniquement
// - Vidéos: loadVideoWithRetry amélioré (6 essais 0/2/4/6/8/10), anti-timeout, anti-stall,
//          + autoplay uniquement sur la vidéo de gauche (muted pour passer les restrictions)
// - Nettoyage des vidéos pour éviter le lag réseau quand on change de match
// - Fin de tournoi + classement simple (winner + éliminations)
// =======================

// =======================
// CONFIG
// =======================
const DATA_URL = "../data/licenses_only.json";
const TOTAL_MATCH_ITEMS = 32;

// Min de base pour être "confortable" (et éviter les pools trop petits)
const MIN_REQUIRED_TITLES = 64; // pour le mode Anime
const MIN_REQUIRED_SONGS = 64;  // pour le mode Openings (base avant buildSongs)

// retries vidéos
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const LOAD_TIMEOUT_MS = 6000;

// =======================
// GLOBAL STATE
// =======================
let ALL_TITLES = [];
let items = [];              // 32 items sélectionnés (animes OU songs)
let mode = "anime";          // "anime" | "opening"

let losses = [];
let eliminationOrder = [];   // indices (dans items) éliminés à la 2e défaite
let aliveWB = [];
let aliveLB = [];

let roundNumber = 1;
let roundMatches = [];
let roundMatchIndex = 0;
let currentMatch = null;

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
  // season: "spring 2013"
  const s = String(a.season || "").trim();
  if (!s) return 0;
  const parts = s.split(/\s+/);
  // si "spring 2013" => parts[1] = 2013
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
// PANEL vs GAME
// =======================
function showCustomization() {
  document.body.classList.remove("game-started");

  // fallback si ton HTML n’a pas #game-panel
  const custom = document.getElementById("custom-panel");
  if (custom) custom.style.display = "";

  const gameEls = [
    document.getElementById("round-indicator"),
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

  // fallback si ton HTML n’a pas #game-panel
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
}

// =======================
// MODE SWITCH (boutons existants)
/// + support optionnel d’un mode pills (#modePills comme Anidle)
// =======================
document.getElementById("mode-anime")?.addEventListener("click", () => switchMode("anime"));
document.getElementById("mode-opening")?.addEventListener("click", () => switchMode("opening"));

function syncModeButtons() {
  const bAnime = document.getElementById("mode-anime");
  const bOpen = document.getElementById("mode-opening");

  if (bAnime) {
    bAnime.classList.toggle("active", mode === "anime");
    bAnime.setAttribute("aria-pressed", mode === "anime" ? "true" : "false");
  }
  if (bOpen) {
    bOpen.classList.toggle("active", mode === "opening");
    bOpen.setAttribute("aria-pressed", mode === "opening" ? "true" : "false");
  }

  // format data-mode (si tu ajoutes le visuel comme Anidle)
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
      if (btn.disabled) return;
      const m = btn.dataset.mode;
      if (!m || m === mode) return;
      switchMode(m);
    });
  });

  syncModeButtons();
}

function switchMode(m) {
  if (mode === m) return;
  mode = m;
  syncModeButtons();
  resetTournament();
  refreshPreview();
}

// =======================
// DEFAULT UI VALUES
// =======================
function setDefaultUI() {
  const pop = document.getElementById("popPercent");
  const score = document.getElementById("scorePercent");
  const yMin = document.getElementById("yearMin");
  const yMax = document.getElementById("yearMax");

  if (pop) pop.value = "25";
  if (score) score.value = "25";
  if (yMin) yMin.value = "2000";
  if (yMax) yMax.value = "2026";

  const o = document.getElementById("incOpenings");
  const e = document.getElementById("incEndings");
  const i = document.getElementById("incInserts");
  if (o) o.checked = true;
  if (e) e.checked = false;
  if (i) i.checked = false;

  // ✅ défaut: TV + Movie (comme Anidle)
  const pills = Array.from(document.querySelectorAll("#typePills .pill"));
  if (pills.length) {
    pills.forEach((b) => {
      const t = b.dataset.type;
      const on = t === "TV" || t === "Movie";
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

  // sécurité: si rien => TV + Movie
  pills.forEach((b) => {
    const t = b.dataset.type;
    const on = t === "TV" || t === "Movie";
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

  const popEl = document.getElementById("popPercent");
  const scoreEl = document.getElementById("scorePercent");
  const yMinEl = document.getElementById("yearMin");
  const yMaxEl = document.getElementById("yearMax");

  const pop = (parseInt(popEl?.value || "25", 10) || 25) / 100;
  const score = (parseInt(scoreEl?.value || "25", 10) || 25) / 100;
  const yMin = parseInt(yMinEl?.value || "2000", 10) || 0;
  const yMax = parseInt(yMaxEl?.value || "2026", 10) || 9999;

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

  return {
    pop,
    score,
    yMin,
    yMax,
    types,
    incOP: !!document.getElementById("incOpenings")?.checked,
    incED: !!document.getElementById("incEndings")?.checked,
    incIN: !!document.getElementById("incInserts")?.checked,
  };
}

// =======================
// FILTER TITLES
// =======================
function filterTitles(data, o) {
  let arr = [...data];

  // 1) Top popularité
  arr.sort((a, b) => b._members - a._members);
  arr = arr.slice(0, Math.ceil(arr.length * o.pop));

  // 2) Top score
  arr.sort((a, b) => b._score - a._score);
  arr = arr.slice(0, Math.ceil(arr.length * o.score));

  // 3) type + années
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

  // conditions min pour pouvoir tirer 32 items
  const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);
  const minSongsNeeded = Math.max(MIN_REQUIRED_SONGS, TOTAL_MATCH_ITEMS);

  if (mode === "anime") {
    const ok = titles.length >= minTitlesNeeded;
    if (box) {
      box.textContent = `${titles.length} titres disponibles${ok ? " (OK)" : ` (Min ${minTitlesNeeded})`}`;
      box.classList.toggle("good", ok);
      box.classList.toggle("bad", !ok);
    }
    if (btn) btn.disabled = !ok;
  } else {
    const songs = buildSongs(titles, o);
    const ok = songs.length >= minSongsNeeded;

    if (box) {
      box.textContent = `${songs.length} songs disponibles${ok ? " (OK)" : ` (Min ${minSongsNeeded})`}`;
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
  // inputs
  document.querySelectorAll("#custom-panel input")
    .forEach((e) => e.addEventListener("input", refreshPreview));

  // type pills
  const typeWrap = document.getElementById("typePills");
  if (typeWrap) {
    typeWrap.addEventListener("click", (e) => {
      const b = e.target.closest(".pill");
      if (!b) return;

      b.classList.toggle("active");
      b.setAttribute("aria-pressed", b.classList.contains("active") ? "true" : "false");

      ensureDefaultTypes();
      refreshPreview();
    });
  }

  document.getElementById("applyFiltersBtn")?.addEventListener("click", startGame);
}

// =======================
// LOAD DATA
// =======================
fetch(DATA_URL)
  .then((r) => r.json())
  .then((json) => {
    const arr = Array.isArray(json) ? json : [];

    // normalise dataset (year/type/members/score + title)
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

    setDefaultUI();
    initModePillsIfAny();
    syncModeButtons();
    wireCustomizationUI();
    refreshPreview();
    showCustomization();
  })
  .catch((e) => {
    alert("Erreur chargement dataset: " + e.message);
  });

// =======================
// START GAME
// =======================
function startGame() {
  if (!ALL_TITLES.length) return;

  const o = readOptions();
  const titles = filterTitles(ALL_TITLES, o);

  const minTitlesNeeded = Math.max(MIN_REQUIRED_TITLES, TOTAL_MATCH_ITEMS);
  if (mode === "anime" && titles.length < minTitlesNeeded) {
    alert(`Pas assez de titres (${titles.length}/${minTitlesNeeded}).`);
    return;
  }

  if (mode === "anime") {
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

  resetTournament();
  showGame();
  initTournament();
}

// =======================
// TOURNAMENT CORE (double elim "simple")
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

  // pair dans WB puis LB
  pair(aliveWB).forEach((p) => m.push(p));
  pair(aliveLB).forEach((p) => m.push(p));

  // ✅ cas bloquant: 1 WB + 1 LB => aucun match généré
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

  box.textContent = `Round ${roundNumber} — Match ${currentIndex}/${totalThisRound} — Mode: ${mode === "anime" ? "Animes" : "Openings"}`;
}

function showNextMatch() {
  if (isTournamentOver()) {
    finishTournament();
    return;
  }

  if (roundMatchIndex >= roundMatches.length) {
    roundNumber++;
    buildNextRound();

    // si toujours vide mais pas over => on force un pairing global
    if (roundMatches.length === 0 && !isTournamentOver()) {
      const all = getAliveAll();
      roundMatches = pair(all);
      roundMatchIndex = 0;
    }
  }

  // sécurité
  if (!roundMatches.length) {
    finishTournament();
    return;
  }

  currentMatch = roundMatches[roundMatchIndex++];
  updateRoundIndicator();
  renderMatch();
}

// =======================
// CLEANUP MEDIA (anti-lag réseau)
// =======================
function cleanupCurrentMedia() {
  const box = document.getElementById("duel-container");
  if (!box) return;

  // stop vidéos en cours
  box.querySelectorAll("video").forEach((v) => {
    try {
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {}
  });
}

// =======================
// VIDEO LOAD (AMÉLIORÉ) — 6 essais + timeout + mini anti-stall
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
    st.style.fontWeight = "900";
    st.style.opacity = "0.9";
    st.style.fontSize = "0.95rem";
    parent.insertBefore(st, video.nextSibling);
  }
  return st;
}

async function loadVideoWithRetry(video, url, { autoplay = false } = {}) {
  video.preload = "metadata";
  video.playsInline = true;
  video.controls = true;

  const status = getOrCreateStatusEl(video);

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    const delay = RETRY_DELAYS[attempt];
    if (delay) await new Promise((r) => setTimeout(r, delay));

    try {
      if (status) status.textContent = `Chargement… (essai ${attempt + 1}/${RETRY_DELAYS.length})`;

      // reset propre
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}

      video.src = url;
      video.load();

      // attendre prêt léger
      await waitEventOrTimeout(
        video,
        { ok: ["loadeddata", "canplay"], fail: ["error", "abort"] },
        LOAD_TIMEOUT_MS
      );

      // autoplay si demandé (muted pour éviter blocage)
      if (autoplay) {
        video.muted = true;
        try {
          await video.play();
        } catch {
          // si bloqué: on reste prêt sans planter
          try { video.pause(); } catch {}
        }
      }

      // mini anti-stall au moment du chargement (facultatif)
      // si "waiting/stalled" direct après => retry
      await waitEventOrTimeout(
        video,
        { ok: ["canplay", "playing"], fail: ["stalled", "waiting", "error"] },
        1500
      );

      if (status) status.textContent = "✅ Prêt";
      return true;
    } catch {
      // retry
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

  const indices = [currentMatch.a, currentMatch.b];

  // on crée d'abord les 2 cartes (layout stable), puis on charge séquentiel
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
      // ✅ vote uniquement sur le titre
      title.addEventListener("click", () => vote(idx));

      div.appendChild(img);
      div.appendChild(title);
      box.appendChild(div);
      cardEls.push({ div, idx, kind: "anime" });
    } else {
      const video = document.createElement("video");
      video.controls = true;

      const title = document.createElement("div");
      title.className = "vote-title";
      title.textContent = item.label || "Song";
      // ✅ vote uniquement sur le titre
      title.addEventListener("click", () => vote(idx));

      div.appendChild(video);
      div.appendChild(title);
      box.appendChild(div);
      cardEls.push({ div, idx, kind: "video", video, url: item.video });
    }
  }

  // Chargement vidéo séquentiel:
  // gauche = currentMatch.a => autoplay
  if (mode === "opening") {
    // left
    const left = cardEls.find((c) => c.idx === currentMatch.a);
    if (left?.video && left?.url) {
      await loadVideoWithRetry(left.video, left.url, { autoplay: true });
    }

    // right
    const right = cardEls.find((c) => c.idx === currentMatch.b);
    if (right?.video && right?.url) {
      await loadVideoWithRetry(right.video, right.url, { autoplay: false });
    }
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
  cleanupCurrentMedia();

  const alive = getAliveAll();
  const winner = alive.length ? alive[0] : null;

  // ranking: winner + (dernière élimination = #2, etc.)
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
    if (rank === 1) card.classList.add("top1");
    else if (rank === 2) card.classList.add("top2");
    else if (rank === 3) card.classList.add("top3");

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
      card.appendChild(v);

      const t = document.createElement("div");
      t.className = "title";
      t.textContent = item.label || "Song";
      card.appendChild(t);
    }

    box.appendChild(card);
  });

  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =======================
// RESET
// =======================
function resetTournament() {
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
}
