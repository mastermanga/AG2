// =======================
// NAV + THEME
// =======================
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

(() => {
  // =======================
  // MODE PARCOURS
  // =======================
  const urlParams = new URLSearchParams(window.location.search);
  const isParcours = urlParams.get("parcours") === "1";
  const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
  let mode = urlParams.get("mode") || "anime"; // "anime" | "opening"

  // =======================
  // CONFIG
  // =======================
  const DB_URL = "../data/licenses_only.json";
  const TOTAL_ITEMS = 32;
  const ELIM_LOSSES = 2;

  // règle demandée
  const MIN_REQUIRED = 62; // min titres (anime) ou min songs (opening) pour lancer

  // =======================
  // DB CACHE
  // =======================
  let ALL_TITLES = null;

  // =======================
  // TOURNAMENT STATE
  // =======================
  let items = [];
  let losses = [];
  let played = [];
  let aliveWB = [];
  let aliveLB = [];
  let eliminationOrder = [];
  let roundNumber = 1;
  let roundMatches = [];
  let roundMatchIndex = 0;
  let currentMatch = null;

  // pour annuler les retries vidéos quand on passe au match suivant
  let matchToken = 0;

  // =======================
  // UI
  // =======================
  const duelContainer = document.getElementById("duel-container");
  const classementDiv = document.getElementById("classement");
  const modeAnimeBtn = document.getElementById("mode-anime");
  const modeOpeningBtn = document.getElementById("mode-opening");
  const nextMatchBtn = document.getElementById("next-match-btn");
  const modeSelectDiv = document.getElementById("mode-select");
  const roundIndicator = document.getElementById("round-indicator");

  const customPanel = document.getElementById("custom-panel");
  const applyBtn = document.getElementById("applyFiltersBtn");
  const previewCountEl = document.getElementById("previewCount");

  // WebM support (Safari/iOS souvent non)
  const CAN_PLAY_WEBM = (() => {
    const v = document.createElement("video");
    return !!v.canPlayType && v.canPlayType("video/webm") !== "";
  })();

  // =======================
  // HELPERS
  // =======================
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function normalizeAnimeList(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.animes)) return json.animes;
    return [];
  }

  function getYearFromSeason(seasonStr) {
    if (!seasonStr) return null;
    const m = String(seasonStr).match(/(19|20)\d{2}/);
    return m ? parseInt(m[0], 10) : null;
  }

  function getDisplayTitle(anime) {
    return (
      anime?.title_english ||
      anime?.title_mal_default ||
      anime?.title_original ||
      anime?.animethemes?.name ||
      anime?.title ||
      "Unknown"
    );
  }

  function makeLabel({ displayTitle, kind, number, songName, artists }) {
    const numPart = number !== "" && number != null ? ` ${number}` : "";
    const namePart = songName ? ` : ${songName}` : "";
    const artistsPart =
      Array.isArray(artists) && artists.length > 0 ? ` by ${artists.join(", ")}` : "";
    // format demandé: "one piece opening 1 : we are by ..."
    return `${displayTitle} ${kind}${numPart}${namePart}${artistsPart}`.trim();
  }

  function setPreview(ok, text) {
    if (!previewCountEl) return;
    previewCountEl.textContent = text;
    previewCountEl.classList.toggle("good", !!ok);
    previewCountEl.classList.toggle("bad", !ok);
    if (applyBtn) applyBtn.disabled = !ok;
  }

  // =======================
  // CUSTOM UI DEFAULTS (demandé)
  // =======================
  function setDefaultCustomizationUI() {
    const pop = document.getElementById("popPercent");
    const score = document.getElementById("scorePercent");
    const yearMin = document.getElementById("yearMin");
    const yearMax = document.getElementById("yearMax");
    const incOpenings = document.getElementById("incOpenings");
    const incEndings = document.getElementById("incEndings");
    const incInserts = document.getElementById("incInserts");

    if (pop) pop.value = "25";
    if (score) score.value = "25";

    if (yearMin) yearMin.value = "2013";
    if (yearMax) yearMax.value = "2026";

    if (incOpenings) incOpenings.checked = true;
    if (incEndings) incEndings.checked = false;
    if (incInserts) incInserts.checked = false;

    // Type: TV only
    document.querySelectorAll("#typePills .pill").forEach((btn) => {
      const active = btn.dataset.type === "TV";
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    // update displayed values
    syncSliderLabels();
  }

  function syncSliderLabels() {
    const popPct = parseInt(document.getElementById("popPercent")?.value || "25", 10);
    const scorePct = parseInt(document.getElementById("scorePercent")?.value || "25", 10);

    const popVal = document.getElementById("popPercentVal");
    const scoreVal = document.getElementById("scorePercentVal");
    if (popVal) popVal.textContent = String(popPct);
    if (scoreVal) scoreVal.textContent = String(scorePct);

    const minEl = document.getElementById("yearMin");
    const maxEl = document.getElementById("yearMax");
    if (minEl && maxEl) {
      let a = parseInt(minEl.value, 10);
      let b = parseInt(maxEl.value, 10);
      if (a > b) [a, b] = [b, a];
      minEl.value = a;
      maxEl.value = b;

      const y1 = document.getElementById("yearMinVal");
      const y2 = document.getElementById("yearMaxVal");
      if (y1) y1.textContent = String(a);
      if (y2) y2.textContent = String(b);
    }
  }

  function getSelectedTypes() {
    const set = new Set();
    document.querySelectorAll("#typePills .pill.active").forEach((btn) => set.add(btn.dataset.type));
    return set;
  }

  function readOptionsFromUI() {
    syncSliderLabels();

    const popPct = parseInt(document.getElementById("popPercent")?.value || "25", 10);
    const scorePct = parseInt(document.getElementById("scorePercent")?.value || "25", 10);

    const yearMin = parseInt(document.getElementById("yearMin")?.value || "2013", 10);
    const yearMax = parseInt(document.getElementById("yearMax")?.value || "2026", 10);

    return {
      popPercent: popPct / 100,     // top % popularité (members)
      scorePercent: scorePct / 100, // top % score
      yearMin,
      yearMax,
      types: getSelectedTypes(),
      includeOpenings: !!document.getElementById("incOpenings")?.checked,
      includeEndings: !!document.getElementById("incEndings")?.checked,
      includeInserts: !!document.getElementById("incInserts")?.checked,
    };
  }

  // =======================
  // FILTERING (popularité + score séparés)
  // =======================
  function filterTitles(allTitles, opts) {
    let arr = [...allTitles];

    // Types (TV / Movie / etc.)
    if (opts.types && opts.types.size > 0) {
      arr = arr.filter((a) => opts.types.has(String(a.type || "")));
    }

    // Années (via season)
    arr = arr.filter((a) => {
      const y = getYearFromSeason(a.season);
      if (y == null) return false;
      return y >= opts.yearMin && y <= opts.yearMax;
    });

    // Popularité: tri members puis top X%
    arr.sort((a, b) => (b.members || 0) - (a.members || 0));
    const keepPop = Math.max(1, Math.ceil(arr.length * opts.popPercent));
    arr = arr.slice(0, keepPop);

    // Score: tri score puis top X%
    arr.sort((a, b) => (b.score || 0) - (a.score || 0));
    const keepScore = Math.max(1, Math.ceil(arr.length * opts.scorePercent));
    arr = arr.slice(0, keepScore);

    return arr;
  }

  function buildTracksFromTitles(filteredTitles, opts) {
    const tracks = [];

    filteredTitles.forEach((anime) => {
      const displayTitle = getDisplayTitle(anime);

      if (opts.includeOpenings) {
        const ops = anime?.song?.openings;
        if (Array.isArray(ops)) {
          ops.forEach((t) => {
            tracks.push({
              displayTitle,
              kind: "opening",
              number: t.number ?? "",
              url: t.video || "",
              label: makeLabel({
                displayTitle,
                kind: "opening",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              }),
            });
          });
        }
      }

      if (opts.includeEndings) {
        const eds = anime?.song?.endings;
        if (Array.isArray(eds)) {
          eds.forEach((t) => {
            tracks.push({
              displayTitle,
              kind: "ending",
              number: t.number ?? "",
              url: t.video || "",
              label: makeLabel({
                displayTitle,
                kind: "ending",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              }),
            });
          });
        }
      }

      if (opts.includeInserts) {
        const ins = anime?.song?.inserts;
        if (Array.isArray(ins)) {
          ins.forEach((t) => {
            tracks.push({
              displayTitle,
              kind: "insert",
              number: t.number ?? "",
              url: t.video || "",
              label: makeLabel({
                displayTitle,
                kind: "insert",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              }),
            });
          });
        }
      }
    });

    // garde seulement les tracks avec un lien
    return tracks.filter((t) => !!t.url);
  }

  function refreshPreview() {
    if (!ALL_TITLES || isParcours) return;

    const opts = readOptionsFromUI();

    // en mode songs: au moins une catégorie cochée
    if (mode === "opening" && !opts.includeOpenings && !opts.includeEndings && !opts.includeInserts) {
      setPreview(false, "⚠️ Coche au moins Openings, Endings ou Inserts.");
      return;
    }

    const filteredTitles = filterTitles(ALL_TITLES, opts);

    if (mode === "anime") {
      const ok = filteredTitles.length >= MIN_REQUIRED;
      setPreview(
        ok,
        ok
          ? `✅ ${filteredTitles.length} titres disponibles (min ${MIN_REQUIRED})`
          : `⚠️ ${filteredTitles.length} titres seulement (min ${MIN_REQUIRED})`
      );
    } else {
      const tracks = buildTracksFromTitles(filteredTitles, opts);
      const ok = tracks.length >= MIN_REQUIRED;
      setPreview(
        ok,
        ok
          ? `✅ ${tracks.length} songs disponibles (min ${MIN_REQUIRED})`
          : `⚠️ ${tracks.length} songs seulement (min ${MIN_REQUIRED})`
      );
    }
  }

  function wireCustomizationUI() {
    if (!customPanel) return;

    // pills types
    const pillsWrap = document.getElementById("typePills");
    if (pillsWrap) {
      pillsWrap.addEventListener("click", (e) => {
        const btn = e.target.closest(".pill");
        if (!btn) return;

        btn.classList.toggle("active");
        btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");

        // sécurité: au moins 1 actif
        const anyActive = document.querySelectorAll("#typePills .pill.active").length > 0;
        if (!anyActive) {
          btn.classList.add("active");
          btn.setAttribute("aria-pressed", "true");
        }

        refreshPreview();
      });
    }

    // sliders + checkboxes
    customPanel.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", refreshPreview);
    });

    // apply
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        if (applyBtn.disabled) return;
        startWithCurrentFilters();
      });
    }
  }

  // =======================
  // LOAD DB
  // =======================
  async function loadDatabaseOnce() {
    if (ALL_TITLES) return ALL_TITLES;

    const res = await fetch(DB_URL);
    if (!res.ok) throw new Error("Erreur chargement " + DB_URL);

    const json = await res.json();
    const data = normalizeAnimeList(json);

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Base vide ou format JSON non reconnu.");
    }

    ALL_TITLES = data;
    return ALL_TITLES;
  }

  // =======================
  // START GAME FROM FILTERS
  // =======================
  function startWithCurrentFilters() {
    if (!ALL_TITLES) return;

    const opts = readOptionsFromUI();
    const filteredTitles = filterTitles(ALL_TITLES, opts);

    let chosen = [];

    if (mode === "anime") {
      shuffle(filteredTitles);
      chosen = filteredTitles.slice(0, TOTAL_ITEMS);
    } else {
      const tracks = buildTracksFromTitles(filteredTitles, opts);
      shuffle(tracks);
      chosen = tracks.slice(0, TOTAL_ITEMS);
    }

    if (chosen.length < TOTAL_ITEMS) {
      // sécurité, normalement bloqué par MIN_REQUIRED
      setPreview(false, `⚠️ Pas assez de choix pour lancer (min ${MIN_REQUIRED}).`);
      return;
    }

    // cacher panel pendant la partie
    if (customPanel) customPanel.style.display = "none";
    duelContainer.style.display = "flex";

    startTournamentWithItems(chosen);
  }

  // =======================
  // TOURNAMENT CORE
  // =======================
  function recomputePools() {
    aliveWB = [];
    aliveLB = [];
    for (let i = 0; i < items.length; i++) {
      if (losses[i] >= ELIM_LOSSES) continue;
      if (losses[i] === 0) aliveWB.push(i);
      else if (losses[i] === 1) aliveLB.push(i);
    }
  }

  function resetTournamentOnly() {
    losses = [];
    played = [];
    aliveWB = [];
    aliveLB = [];
    eliminationOrder = [];

    roundNumber = 1;
    roundMatches = [];
    roundMatchIndex = 0;
    currentMatch = null;

    duelContainer.innerHTML = "";
    duelContainer.style.display = "";
    classementDiv.innerHTML = "";
    if (nextMatchBtn) nextMatchBtn.style.display = "none";

    // annule retries vidéos en cours
    matchToken++;
  }

  function startTournamentWithItems(newItems) {
    items = newItems;

    resetTournamentOnly();

    losses = items.map(() => 0);
    played = items.map(() => new Set());
    eliminationOrder = [];

    recomputePools();

    setupUI();
    buildNextRound();
    showNextMatchInRound();
  }

  function setupUI() {
    duelContainer.innerHTML = "";
    duelContainer.style.display = "flex";

    const div1 = document.createElement("div");
    const div2 = document.createElement("div");

    if (mode === "anime") {
      div1.className = "anime";
      div2.className = "anime";
      div1.innerHTML = `<img src="" alt="" /><h3 class="vote-title"></h3>`;
      div2.innerHTML = `<img src="" alt="" /><h3 class="vote-title"></h3>`;
      duelContainer.appendChild(div1);
      duelContainer.appendChild(div2);

      // en anime: clic sur la carte = vote
      div1.onclick = () => recordWin(1);
      div2.onclick = () => recordWin(2);
    } else {
      // en songs: vote uniquement sur le titre
      div1.className = "opening";
      div2.className = "opening";
      div1.innerHTML = `
        <video class="trackVideo" controls preload="auto" playsinline muted></video>
        <div class="videoStatus"></div>
        <h3 class="vote-title"></h3>
      `;
      div2.innerHTML = `
        <video class="trackVideo" controls preload="auto" playsinline muted></video>
        <div class="videoStatus"></div>
        <h3 class="vote-title"></h3>
      `;
      duelContainer.appendChild(div1);
      duelContainer.appendChild(div2);

      const t1 = div1.querySelector(".vote-title");
      const t2 = div2.querySelector(".vote-title");
      t1.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        recordWin(1);
      });
      t2.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        recordWin(2);
      });

      // clic sur la vidéo ne doit jamais voter
      const v1 = div1.querySelector("video");
      const v2 = div2.querySelector("video");
      if (v1) v1.addEventListener("click", (e) => e.stopPropagation());
      if (v2) v2.addEventListener("click", (e) => e.stopPropagation());
    }
  }

  function setVideoStatus(containerDiv, msg) {
    const s = containerDiv.querySelector(".videoStatus");
    if (s) s.textContent = msg || "";
  }

  // retry: 0s, +3s, +10s (demandé)
  function bindVideoWithRetries(video, containerDiv, url, token, onReady) {
    if (!url) {
      setVideoStatus(containerDiv, "❌ Lien vidéo manquant.");
      return;
    }

    let attempt = 1;

    const loadAttempt = (delayMs) => {
      setTimeout(() => {
        if (token !== matchToken) return;

        video.pause();
        video.removeAttribute("src");
        video.load();

        if (attempt === 1) setVideoStatus(containerDiv, "⏳ Chargement…");
        else setVideoStatus(containerDiv, `🔄 Nouvelle tentative (${attempt}/3)…`);

        const finalUrl =
          attempt === 1 ? url : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();

        video.src = finalUrl;
        video.load();
      }, delayMs);
    };

    video.onwaiting = () => {
      if (token !== matchToken) return;
      setVideoStatus(containerDiv, "⏳ Chargement…");
    };

    video.oncanplay = () => {
      if (token !== matchToken) return;
      setVideoStatus(containerDiv, "");
      if (typeof onReady === "function") onReady();
    };

    video.onerror = () => {
      if (token !== matchToken) return;

      if (attempt === 1) {
        attempt = 2;
        loadAttempt(3000);
      } else if (attempt === 2) {
        attempt = 3;
        loadAttempt(10000);
      } else {
        setVideoStatus(containerDiv, "❌ Vidéo indisponible (serveur ou lien).");
      }
    };

    loadAttempt(0);
  }

  function showMatch(match) {
    const i1 = match.i1;
    const i2 = match.i2;
    const divs = duelContainer.children;

    // invalide les retries précédents
    matchToken++;

    if (mode === "anime") {
      const a1 = items[i1];
      const a2 = items[i2];

      const img1 = divs[0].querySelector("img");
      const img2 = divs[1].querySelector("img");
      const t1 = divs[0].querySelector(".vote-title");
      const t2 = divs[1].querySelector(".vote-title");

      img1.src = a1.image || "";
      img1.alt = getDisplayTitle(a1);
      t1.textContent = getDisplayTitle(a1);

      img2.src = a2.image || "";
      img2.alt = getDisplayTitle(a2);
      t2.textContent = getDisplayTitle(a2);
    } else {
      const left = divs[0];
      const right = divs[1];

      const v1 = left.querySelector("video");
      const v2 = right.querySelector("video");

      setVideoStatus(left, "");
      setVideoStatus(right, "");

      v1.pause(); v2.pause();
      v1.removeAttribute("src"); v2.removeAttribute("src");
      v1.load(); v2.load();

      const title1 = left.querySelector(".vote-title");
      const title2 = right.querySelector(".vote-title");
      title1.textContent = items[i1].label || "";
      title2.textContent = items[i2].label || "";

      if (!CAN_PLAY_WEBM) {
        setVideoStatus(left, "⚠️ WebM non supporté sur ce navigateur (Safari/iOS).");
        setVideoStatus(right, "⚠️ WebM non supporté sur ce navigateur (Safari/iOS).");
        currentMatch = match;
        return;
      }

      const url1 = items[i1].url || "";
      const url2 = items[i2].url || "";
      const token = matchToken;

      // séquentiel: gauche -> droite
      bindVideoWithRetries(v1, left, url1, token, () => {
        bindVideoWithRetries(v2, right, url2, token, null);
      });
    }

    currentMatch = match;
  }

  function pairFromPool(pool) {
    const p = pool.slice();
    shuffle(p);

    const pairs = [];
    while (p.length >= 2) {
      const a = p.pop();

      // évite un rematch si possible
      let bIndex = -1;
      for (let k = p.length - 1; k >= 0; k--) {
        if (!played[a].has(p[k])) {
          bIndex = k;
          break;
        }
      }
      if (bIndex === -1) bIndex = p.length - 1;

      const b = p.splice(bIndex, 1)[0];
      pairs.push({ i1: a, i2: b });
    }
    return pairs;
  }

  function updateRoundUI() {
    if (!roundIndicator) return;
    const total = roundMatches.length || 0;
    const done = Math.min(roundMatchIndex, total);
    roundIndicator.textContent =
      total > 0 ? `Round ${roundNumber} — Match ${done + 1}/${total}` : `Round ${roundNumber}`;
  }

  function buildNextRound() {
    const matches = [];

    // finale WB vs LB
    if (aliveWB.length === 1 && aliveLB.length === 1) {
      matches.push({ i1: aliveWB[0], i2: aliveLB[0], bracket: "GF" });
      roundMatches = shuffle(matches);
      roundMatchIndex = 0;
      updateRoundUI();
      return;
    }

    if (aliveWB.length >= 2) {
      const wbPairs = pairFromPool(aliveWB);
      wbPairs.forEach((m) => matches.push({ ...m, bracket: "WB" }));
    }

    if (aliveLB.length >= 2) {
      const lbPairs = pairFromPool(aliveLB);
      lbPairs.forEach((m) => matches.push({ ...m, bracket: "LB" }));
    }

    if (matches.length === 0) {
      const aliveAll = aliveWB.concat(aliveLB);
      showClassementDoubleElim(aliveAll[0] ?? null);
      return;
    }

    roundMatches = shuffle(matches);
    roundMatchIndex = 0;
    updateRoundUI();
  }

  function showNextMatchInRound() {
    if (nextMatchBtn) nextMatchBtn.style.display = "none";

    recomputePools();

    const aliveAll = aliveWB.concat(aliveLB);
    if (aliveAll.length <= 1) {
      showClassementDoubleElim(aliveAll[0] ?? null);
      return;
    }

    if (roundMatchIndex >= roundMatches.length) {
      roundNumber++;
      buildNextRound();
      if (!roundMatches || roundMatches.length === 0) return;
    }

    updateRoundUI();
    const match = roundMatches[roundMatchIndex];
    roundMatchIndex++;
    showMatch(match);
  }

  function recordWin(winnerSide) {
    if (!currentMatch) return;

    const winnerIndex = winnerSide === 1 ? currentMatch.i1 : currentMatch.i2;
    const loserIndex = winnerSide === 1 ? currentMatch.i2 : currentMatch.i1;

    played[winnerIndex].add(loserIndex);
    played[loserIndex].add(winnerIndex);

    losses[loserIndex]++;

    if (losses[loserIndex] === ELIM_LOSSES) {
      eliminationOrder.push(loserIndex);
    }

    recomputePools();
    showNextMatchInRound();
  }

  function showClassementDoubleElim(championIndex) {
    duelContainer.style.display = "none";
    classementDiv.innerHTML = "";

    if (nextMatchBtn) {
      nextMatchBtn.style.display = "block";

      if (isParcours) {
        const step = parseInt(urlParams.get("step") || "1", 10);
        nextMatchBtn.textContent = step < parcoursCount ? "Suivant" : "Terminer";
        nextMatchBtn.onclick = function () {
          parent.postMessage(
            {
              parcoursScore: {
                label: "Anime Tournament " + (mode === "anime" ? "Anime" : "Songs"),
                score: 0,
                total: 0,
              },
            },
            "*"
          );
        };
      } else {
        nextMatchBtn.textContent = "Rejouer";
        nextMatchBtn.onclick = function () {
          // revient à la personnalisation
          if (customPanel) customPanel.style.display = "";
          duelContainer.style.display = "none";
          classementDiv.innerHTML = "";
          refreshPreview();
          updateRoundUI();
        };
      }
    }

    recomputePools();
    const aliveAll = aliveWB.concat(aliveLB);
    const champ = championIndex != null ? championIndex : (aliveAll[0] ?? null);

    if (champ == null) {
      const fallback = items.map((_, i) => i);
      fallback.forEach((idx, pos) => displayClassementItem(idx, pos + 1));
      return;
    }

    const ranking = [champ, ...eliminationOrder.slice().reverse()];

    if (ranking.length < items.length) {
      const seen = new Set(ranking);
      for (let i = 0; i < items.length; i++) {
        if (!seen.has(i)) ranking.push(i);
      }
    }

    ranking.forEach((idx, pos) => displayClassementItem(idx, pos + 1));
  }

  function displayClassementItem(idx, rank) {
    const item = items[idx];
    const div = document.createElement("div");
    div.className = "classement-item";
    if (rank === 1) div.classList.add("top1");
    if (rank === 2) div.classList.add("top2");
    if (rank === 3) div.classList.add("top3");
    div.setAttribute("tabindex", "0");

    const rankDiv = document.createElement("div");
    rankDiv.className = "rank";
    rankDiv.textContent = `#${rank}`;

    const titleDiv = document.createElement("div");
    titleDiv.className = "title";
    titleDiv.textContent = mode === "anime" ? getDisplayTitle(item) : (item.label || "");

    div.appendChild(rankDiv);

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image || "";
      img.alt = getDisplayTitle(item);
      div.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.src = item.url || "";
      div.appendChild(video);
    }

    div.appendChild(titleDiv);
    classementDiv.appendChild(div);
  }

  // =======================
  // MODE / FLOW
  // =======================
  function switchMode(newMode) {
    if (mode === newMode) return;
    mode = newMode;

    modeAnimeBtn.classList.toggle("active", mode === "anime");
    modeAnimeBtn.setAttribute("aria-pressed", mode === "anime");
    modeOpeningBtn.classList.toggle("active", mode === "opening");
    modeOpeningBtn.setAttribute("aria-pressed", mode === "opening");

    // reset affichage
    resetTournamentOnly();
    duelContainer.style.display = "none";
    if (customPanel && !isParcours) customPanel.style.display = "";

    refreshPreview();
  }

  // =======================
  // INIT
  // =======================
  async function init() {
    // mode UI
    if (isParcours) {
      if (modeSelectDiv) modeSelectDiv.style.display = "none";
      if (customPanel) customPanel.style.display = "none";
      duelContainer.style.display = "flex";
    } else {
      modeAnimeBtn.onclick = () => switchMode("anime");
      modeOpeningBtn.onclick = () => switchMode("opening");
    }

    // DB
    try {
      await loadDatabaseOnce();
    } catch (e) {
      alert(e.message);
      return;
    }

    // defaults demandés
    setDefaultCustomizationUI();

    // wiring
    if (!isParcours) wireCustomizationUI();

    // preview
    refreshPreview();

    // parcours: lancement auto avec defaults
    if (isParcours) {
      const opts = {
        popPercent: 0.25,
        scorePercent: 0.25,
        yearMin: 2013,
        yearMax: 2026,
        types: new Set(["TV"]),
        includeOpenings: true,
        includeEndings: false,
        includeInserts: false,
      };

      const filteredTitles = filterTitles(ALL_TITLES, opts);
      let chosen = [];

      if (mode === "anime") {
        shuffle(filteredTitles);
        chosen = filteredTitles.slice(0, TOTAL_ITEMS);
      } else {
        const tracks = buildTracksFromTitles(filteredTitles, opts);
        shuffle(tracks);
        chosen = tracks.slice(0, TOTAL_ITEMS);
      }

      startTournamentWithItems(chosen);
    }
  }

  // =======================
  // TOOLTIP HELP
  // =======================
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

  // GO
  init();
})();
