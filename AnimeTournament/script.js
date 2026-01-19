// =======================
// NAV + THEME
// =======================
document.getElementById("back-to-menu").addEventListener("click", function () {
  window.location.href = "../index.html";
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");
});

(() => {
  // ==== Mode Parcours : lecture URL ====
  const urlParams = new URLSearchParams(window.location.search);
  const isParcours = urlParams.get("parcours") === "1";
  const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
  let mode = urlParams.get("mode") || "anime";

  // ====== CONFIG TOURNOI ======
  const TOTAL_ITEMS = 32; // 32 participants
  const ELIM_LOSSES = 2;  // 2 défaites = OUT

  // ====== DB CACHE ======
  let ALL_TITLES = null;

  // ====== DATA DE PARTIE ======
  let items = []; // soit titres, soit tracks (openings/endings/inserts)

  // ====== DOUBLE ELIM ======
  let losses = [];
  let played = [];
  let aliveWB = [];
  let aliveLB = [];
  let eliminationOrder = [];

  let roundNumber = 1;
  let roundMatches = [];
  let roundMatchIndex = 0;
  let currentMatch = null;

  // Pour annuler des retries si on change de match entre-temps
  let matchToken = 0;

  // UI Elements
  const duelContainer = document.querySelector("#duel-container");
  const classementDiv = document.getElementById("classement");
  const modeAnimeBtn = document.getElementById("mode-anime");
  const modeOpeningBtn = document.getElementById("mode-opening");
  const nextMatchBtn = document.getElementById("next-match-btn");
  const modeSelectDiv = document.getElementById("mode-select");
  const roundIndicator = document.getElementById("round-indicator");

  // Personnalisation UI
  const customPanel = document.getElementById("custom-panel");
  const applyBtn = document.getElementById("applyFiltersBtn");
  const previewCountEl = document.getElementById("previewCount");

  // Détection support WebM (Safari/iOS = souvent NON)
  const CAN_PLAY_WEBM = (() => {
    const v = document.createElement("video");
    return !!v.canPlayType && v.canPlayType("video/webm") !== "";
  })();

  // =======================
  // UTILS
  // =======================
  function setPreviewMessage(text, ok) {
    if (!previewCountEl) return;
    previewCountEl.textContent = text;
    previewCountEl.classList.toggle("bad", !ok);
    previewCountEl.classList.toggle("good", !!ok);
  }

  function setVideoStatus(containerDiv, msg) {
    const s = containerDiv.querySelector(".videoStatus");
    if (!s) return;
    s.textContent = msg || "";
  }

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
    return `${displayTitle} ${kind}${numPart}${namePart}${artistsPart}`.trim();
  }

  // =======================
  // CUSTOM UI (NO TEXT INPUT)
  // =======================
  function clampYearRange() {
    const minEl = document.getElementById("yearMin");
    const maxEl = document.getElementById("yearMax");
    let a = parseInt(minEl.value, 10);
    let b = parseInt(maxEl.value, 10);
    if (a > b) [a, b] = [b, a];
    minEl.value = a;
    maxEl.value = b;
    const minVal = document.getElementById("yearMinVal");
    const maxVal = document.getElementById("yearMaxVal");
    if (minVal) minVal.textContent = a;
    if (maxVal) maxVal.textContent = b;
    return { yearMin: a, yearMax: b };
  }

  function getSelectedTypes() {
    const set = new Set();
    document.querySelectorAll("#typePills .pill.active").forEach((btn) => {
      set.add(btn.dataset.type);
    });
    return set; // sécurité: au moins 1, assuré par le handler
  }

  function readOptionsFromUI() {
    const popPct = parseInt(document.getElementById("popPercent")?.value || "25", 10);
    const popValEl = document.getElementById("popPercentVal");
    if (popValEl) popValEl.textContent = String(popPct);

    const { yearMin, yearMax } = clampYearRange();

    return {
      popularityMode: "percent",
      popularityValue: popPct / 100, // 25 => 0.25
      types: getSelectedTypes(),
      yearMin,
      yearMax,
      sortBy: document.getElementById("sortBy")?.value || "members",
      includeOpenings: !!document.getElementById("incOpenings")?.checked,
      includeEndings: !!document.getElementById("incEndings")?.checked,
      includeInserts: !!document.getElementById("incInserts")?.checked,
    };
  }

  function filterTitles(allTitles, options) {
    let titles = [...allTitles];

    // Types
    if (options.types && options.types.size > 0) {
      titles = titles.filter((a) => options.types.has(String(a.type || "")));
    }

    // Années (via season)
    const yMin = options.yearMin ?? null;
    const yMax = options.yearMax ?? null;
    if (yMin != null || yMax != null) {
      titles = titles.filter((a) => {
        const y = getYearFromSeason(a.season);
        if (y == null) return false;
        if (yMin != null && y < yMin) return false;
        if (yMax != null && y > yMax) return false;
        return true;
      });
    }

    // Tri
    const key = options.sortBy === "score" ? "score" : "members";
    titles.sort((a, b) => (b[key] || 0) - (a[key] || 0));

    // Popularité top %
    const p = options.popularityValue;
    if (typeof p === "number" && p > 0 && p <= 1) {
      const keep = Math.max(1, Math.ceil(titles.length * p));
      titles = titles.slice(0, keep);
    }

    return titles;
  }

  function buildTracksFromTitles(filteredTitles, options) {
    const tracks = [];

    filteredTitles.forEach((anime) => {
      const displayTitle = getDisplayTitle(anime);

      if (options.includeOpenings) {
        const ops = anime?.song?.openings;
        if (Array.isArray(ops)) {
          ops.forEach((t) => {
            tracks.push({
              displayTitle,
              kind: "Opening",
              number: t.number ?? "",
              url: t.video || "",
              label: makeLabel({
                displayTitle,
                kind: "Opening",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              }),
            });
          });
        }
      }

      if (options.includeEndings) {
        const eds = anime?.song?.endings;
        if (Array.isArray(eds)) {
          eds.forEach((t) => {
            tracks.push({
              displayTitle,
              kind: "Ending",
              number: t.number ?? "",
              url: t.video || "",
              label: makeLabel({
                displayTitle,
                kind: "Ending",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              }),
            });
          });
        }
      }

      if (options.includeInserts) {
        const ins = anime?.song?.inserts;
        if (Array.isArray(ins)) {
          ins.forEach((t) => {
            tracks.push({
              displayTitle,
              kind: "Insert",
              number: t.number ?? "",
              url: t.video || "",
              label: makeLabel({
                displayTitle,
                kind: "Insert",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              }),
            });
          });
        }
      }
    });

    return tracks.filter((t) => t.url);
  }

  function refreshPreview() {
    if (!ALL_TITLES || isParcours) return;

    const opts = readOptionsFromUI();

    // En mode openings: au moins une catégorie cochée
    if (mode === "opening" && !opts.includeOpenings && !opts.includeEndings && !opts.includeInserts) {
      setPreviewMessage("⚠️ Coche au moins Openings, Endings ou Inserts.", false);
      if (applyBtn) applyBtn.disabled = true;
      return;
    }

    const filteredTitles = filterTitles(ALL_TITLES, opts);

    if (mode === "anime") {
      const ok = filteredTitles.length >= TOTAL_ITEMS;
      setPreviewMessage(
        ok
          ? `✅ ${filteredTitles.length} titres disponibles`
          : `⚠️ ${filteredTitles.length} titres seulement (min ${TOTAL_ITEMS}).`,
        ok
      );
      if (applyBtn) applyBtn.disabled = !ok;
    } else {
      const tracks = buildTracksFromTitles(filteredTitles, opts);
      const ok = tracks.length >= TOTAL_ITEMS;
      setPreviewMessage(
        ok
          ? `✅ ${filteredTitles.length} titres • ${tracks.length} songs disponibles`
          : `⚠️ ${filteredTitles.length} titres • ${tracks.length} songs (min ${TOTAL_ITEMS}).`,
        ok
      );
      if (applyBtn) applyBtn.disabled = !ok;
    }
  }

  function wireCustomizationUI() {
    if (!customPanel) return;

    // Pills types
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

    // Inputs sliders/checkbox/select
    const inputs = customPanel.querySelectorAll("input, select");
    inputs.forEach((el) => el.addEventListener("input", refreshPreview));
  }

  // =======================
  // LOAD DB ONCE
  // =======================
  async function loadDatabaseOnce() {
    if (ALL_TITLES) return ALL_TITLES;

    const res = await fetch("../data/licenses_only.json");
    if (!res.ok) throw new Error("Erreur chargement ../data/licenses_only.json");

    const json = await res.json();
    const data = normalizeAnimeList(json);

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Base vide ou format JSON non reconnu (attendu: tableau ou {animes:[...]}).");
    }

    ALL_TITLES = data;
    return ALL_TITLES;
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

    // invalide retries vidéos
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

      // vote sur tout le bloc en mode anime (plus simple)
      div1.onclick = () => recordWin(1);
      div2.onclick = () => recordWin(2);
    } else {
      // vote UNIQUEMENT sur le titre, pas sur la vidéo
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

      const title1 = div1.querySelector(".vote-title");
      const title2 = div2.querySelector(".vote-title");

      title1.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        recordWin(1);
      });
      title2.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        recordWin(2);
      });

      const v1 = div1.querySelector("video");
      const v2 = div2.querySelector("video");
      if (v1) v1.addEventListener("click", (e) => e.stopPropagation());
      if (v2) v2.addEventListener("click", (e) => e.stopPropagation());
    }
  }

  // Retry: 0s, +3s, +10s — avec cache-bust + annulation si match change
  function bindVideoWithRetries(video, containerDiv, url, token, onReady) {
    if (!url) {
      setVideoStatus(containerDiv, "❌ Lien vidéo manquant.");
      return;
    }

    video.onwaiting = null;
    video.oncanplay = null;
    video.onerror = null;

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
          attempt === 1
            ? url
            : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();

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

      // Séquentiel: gauche -> droite (réduit les cas de vidéo grise)
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

    // terminé
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
                label: "Anime Tournament " + (mode === "anime" ? "Anime" : "Opening"),
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
          // relance avec les mêmes réglages actuels
          if (customPanel) customPanel.style.display = "";
          duelContainer.style.display = "flex";
          classementDiv.innerHTML = "";
          if (modeSelectDiv) modeSelectDiv.style.display = "";
          updateRoundUI();
          refreshPreview();
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
      video.style.width = "100%";
      video.style.height = "210px";
      video.style.objectFit = "cover";
      video.style.borderRadius = "8px";
      video.style.boxShadow = "0 0 18px #1116";
      div.appendChild(video);
    }

    div.appendChild(titleDiv);
    classementDiv.appendChild(div);
  }

  // =======================
  // MODE / START FLOW
  // =======================
  function switchMode(newMode) {
    if (mode === newMode) return;
    mode = newMode;

    modeAnimeBtn.classList.toggle("active", mode === "anime");
    modeAnimeBtn.setAttribute("aria-pressed", mode === "anime");
    modeOpeningBtn.classList.toggle("active", mode === "opening");
    modeOpeningBtn.setAttribute("aria-pressed", mode === "opening");

    // reset UI state
    resetTournamentOnly();
    duelContainer.innerHTML = "";
    classementDiv.innerHTML = "";
    duelContainer.style.display = "none";
    if (nextMatchBtn) nextMatchBtn.style.display = "none";

    // personnalisation visible (sauf parcours)
    if (customPanel && !isParcours) customPanel.style.display = "";

    refreshPreview();
  }

  async function init() {
    // UI modes
    if (isParcours) {
      if (modeSelectDiv) modeSelectDiv.style.display = "none";
      if (customPanel) customPanel.style.display = "none";

      modeAnimeBtn.classList.toggle("active", mode === "anime");
      modeAnimeBtn.setAttribute("aria-pressed", mode === "anime");
      modeOpeningBtn.classList.toggle("active", mode === "opening");
      modeOpeningBtn.setAttribute("aria-pressed", mode === "opening");
    } else {
      modeAnimeBtn.onclick = () => switchMode("anime");
      modeOpeningBtn.onclick = () => switchMode("opening");
    }

    // load DB
    try {
      await loadDatabaseOnce();
    } catch (e) {
      alert(e.message);
      return;
    }

    // wire customization UI
    wireCustomizationUI();

    // default preview values
    clampYearRange();
    refreshPreview();

    // Apply button
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        if (!ALL_TITLES) return;

        const opts = readOptionsFromUI();
        const filteredTitles = filterTitles(ALL_TITLES, opts);

        let chosen = [];

        if (mode === "anime") {
          shuffle(filteredTitles);
          chosen = filteredTitles.slice(0, TOTAL_ITEMS);
        } else {
          if (!opts.includeOpenings && !opts.includeEndings && !opts.includeInserts) return;
          const tracks = buildTracksFromTitles(filteredTitles, opts);
          shuffle(tracks);
          chosen = tracks.slice(0, TOTAL_ITEMS);
        }

        if (chosen.length < TOTAL_ITEMS) {
          // sécurité, normalement bloqué par preview
          setPreviewMessage(`⚠️ Pas assez de choix pour lancer (min ${TOTAL_ITEMS}).`, false);
          return;
        }

        // hide customization while playing
        if (customPanel) customPanel.style.display = "none";

        // start tournament
        duelContainer.style.display = "flex";
        startTournamentWithItems(chosen);
      });
    }

    // parcours: lancement auto (sans personnalisation)
    if (isParcours) {
      const defaults = {
        popularityMode: "percent",
        popularityValue: 1,
        types: new Set(), // tous
        yearMin: 1980,
        yearMax: 2026,
        sortBy: "members",
        includeOpenings: true,
        includeEndings: true,
        includeInserts: true,
      };

      const filteredTitles = filterTitles(ALL_TITLES, defaults);

      let chosen = [];
      if (mode === "anime") {
        shuffle(filteredTitles);
        chosen = filteredTitles.slice(0, TOTAL_ITEMS);
      } else {
        const tracks = buildTracksFromTitles(filteredTitles, defaults);
        shuffle(tracks);
        chosen = tracks.slice(0, TOTAL_ITEMS);
      }

      startTournamentWithItems(chosen);
    } else {
      // hors parcours: on attend que le joueur clique "Lancer"
      duelContainer.style.display = "none";
      updateRoundUI();
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

  // go
  init();
})();
