// Bouton retour au menu
document.getElementById("back-to-menu").addEventListener("click", function () {
  window.location.href = "../index.html";
});

// Bouton changer de thème + persistance
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
});
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.add("light");
  }
});

(() => {
  // ==== Mode Parcours : lecture URL ====
  const urlParams = new URLSearchParams(window.location.search);
  const isParcours = urlParams.get("parcours") === "1";
  const parcoursCount = parseInt(urlParams.get("count") || "1", 10);
  let mode = urlParams.get("mode") || "anime";

  // ====== CONFIG TOURNOI ======
  const TOTAL_ITEMS = 32;
  const ELIM_LOSSES = 2;

  let data = [];
  let items = [];

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

  // Détection support WebM (Safari/iOS = souvent NON)
  const CAN_PLAY_WEBM = (() => {
    const v = document.createElement("video");
    return !!v.canPlayType && v.canPlayType("video/webm") !== "";
  })();

  function setVideoStatus(containerDiv, msg) {
    const s = containerDiv.querySelector(".videoStatus");
    if (!s) return;
    s.textContent = msg || "";
  }

  // ===== GESTION MODES =====
  if (isParcours) {
    if (modeSelectDiv) modeSelectDiv.style.display = "none";
    modeAnimeBtn.classList.toggle("active", mode === "anime");
    modeAnimeBtn.setAttribute("aria-pressed", mode === "anime");
    modeOpeningBtn.classList.toggle("active", mode === "opening");
    modeOpeningBtn.setAttribute("aria-pressed", mode === "opening");
  } else {
    modeAnimeBtn.onclick = () => switchMode("anime");
    modeOpeningBtn.onclick = () => switchMode("opening");
  }

  function switchMode(newMode) {
    if (mode === newMode) return;
    mode = newMode;
    modeAnimeBtn.classList.toggle("active", mode === "anime");
    modeAnimeBtn.setAttribute("aria-pressed", mode === "anime");
    modeOpeningBtn.classList.toggle("active", mode === "opening");
    modeOpeningBtn.setAttribute("aria-pressed", mode === "opening");
    reset();
    loadDataAndStart();
  }

  function reset() {
    data = [];
    items = [];

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

    // invalide tous les retries en cours
    matchToken++;
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function recomputePools() {
    aliveWB = [];
    aliveLB = [];
    for (let i = 0; i < items.length; i++) {
      if (losses[i] >= ELIM_LOSSES) continue;
      if (losses[i] === 0) aliveWB.push(i);
      else if (losses[i] === 1) aliveLB.push(i);
    }
  }

  function normalizeAnimeList(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.animes)) return json.animes;
    return [];
  }

  // ✅ Formateur de label: Title English + kind + number + " : songName" + " by artists"
  function makeLabel({ displayTitle, kind, number, songName, artists }) {
    const numPart = number !== "" && number != null ? ` ${number}` : "";
    const namePart = songName ? ` : ${songName}` : "";
    const artistsPart =
      Array.isArray(artists) && artists.length > 0 ? ` by ${artists.join(", ")}` : "";
    return `${displayTitle} ${kind}${numPart}${namePart}${artistsPart}`.trim();
  }

  async function loadDataAndStart() {
    const url = "../data/licenses_only.json";

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur chargement " + url);

      const json = await res.json();
      data = normalizeAnimeList(json);

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Base vide ou format JSON non reconnu (attendu: tableau ou {animes:[...]})");
      }

      if (mode === "opening") {
        let tracks = [];

        data.forEach((anime) => {
          // ✅ utilise title_english en priorité
          const displayTitle =
            anime?.title_english ||
            anime?.title_mal_default ||
            anime?.title_original ||
            anime?.animethemes?.name ||
            "Unknown";

          // Openings
          const ops = anime?.song?.openings;
          if (Array.isArray(ops)) {
            ops.forEach((t) => {
              const label = makeLabel({
                displayTitle,
                kind: "Opening",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              });

              tracks.push({
                displayTitle,
                kind: "Opening",
                number: t.number ?? "",
                url: t.video || "",
                label,
              });
            });
          }

          // Endings
          const eds = anime?.song?.endings;
          if (Array.isArray(eds)) {
            eds.forEach((t) => {
              const label = makeLabel({
                displayTitle,
                kind: "Ending",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              });

              tracks.push({
                displayTitle,
                kind: "Ending",
                number: t.number ?? "",
                url: t.video || "",
                label,
              });
            });
          }

          // Inserts (si dispo)
          const ins = anime?.song?.inserts;
          if (Array.isArray(ins)) {
            ins.forEach((t) => {
              const label = makeLabel({
                displayTitle,
                kind: "Insert",
                number: t.number ?? "",
                songName: t.name || "",
                artists: t.artists || [],
              });

              tracks.push({
                displayTitle,
                kind: "Insert",
                number: t.number ?? "",
                url: t.video || "",
                label,
              });
            });
          }
        });

        tracks = tracks.filter((t) => t.url);

        if (tracks.length === 0) {
          throw new Error("Aucun opening/ending/insert trouvé (song.openings / song.endings / song.inserts).");
        }

        shuffle(tracks);
        items = tracks.slice(0, TOTAL_ITEMS);
      } else {
        shuffle(data);
        items = data.slice(0, TOTAL_ITEMS);
      }

      losses = items.map(() => 0);
      played = items.map(() => new Set());
      eliminationOrder = [];

      recomputePools();

      roundNumber = 1;
      roundMatches = [];
      roundMatchIndex = 0;
      currentMatch = null;

      setupUI();
      buildNextRound();
      showNextMatchInRound();
    } catch (e) {
      alert(e.message);
    }
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
    } else {
      // ✅ vote UNIQUEMENT sur le titre, pas sur la vidéo
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
    }

    duelContainer.appendChild(div1);
    duelContainer.appendChild(div2);

    // ✅ vote UNIQUEMENT sur le titre
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

    // ✅ clic vidéo ne vote pas (sécurité)
    const v1 = div1.querySelector("video");
    const v2 = div2.querySelector("video");
    if (v1) v1.addEventListener("click", (e) => e.stopPropagation());
    if (v2) v2.addEventListener("click", (e) => e.stopPropagation());
  }

  // ✅ Retry: 1ère tentative immédiate, 2e après 3s, 3e après 10s (avec cache-bust)
  // + cancel auto si on change de match (token)
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
      const img1 = divs[0].querySelector("img");
      const img2 = divs[1].querySelector("img");

      img1.src = items[i1].image || "";
      img1.alt = items[i1].title || items[i1].title_mal_default || "";
      divs[0].querySelector(".vote-title").textContent =
        items[i1].title_english || items[i1].title_mal_default || items[i1].title_original || items[i1].title || "";

      img2.src = items[i2].image || "";
      img2.alt = items[i2].title || items[i2].title_mal_default || "";
      divs[1].querySelector(".vote-title").textContent =
        items[i2].title_english || items[i2].title_mal_default || items[i2].title_original || items[i2].title || "";
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

      if (!CAN_PLAY_WEBM) {
        setVideoStatus(left, "⚠️ WebM non supporté sur ce navigateur (Safari/iOS).");
        setVideoStatus(right, "⚠️ WebM non supporté sur ce navigateur (Safari/iOS).");
        divs[0].querySelector(".vote-title").textContent = items[i1].label || "";
        divs[1].querySelector(".vote-title").textContent = items[i2].label || "";
        currentMatch = match;
        return;
      }

      divs[0].querySelector(".vote-title").textContent = items[i1].label || "";
      divs[1].querySelector(".vote-title").textContent = items[i2].label || "";

      const url1 = items[i1].url || "";
      const url2 = items[i2].url || "";
      const token = matchToken;

      // Séquentiel: gauche -> droite
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
    if (roundIndicator) {
      const total = roundMatches.length || 0;
      const done = Math.min(roundMatchIndex, total);
      roundIndicator.textContent =
        total > 0 ? `Round ${roundNumber} — Match ${done + 1}/${total}` : `Round ${roundNumber}`;
    }
  }

  function buildNextRound() {
    const matches = [];

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
          nextMatchBtn.style.display = "none";
          reset();
          loadDataAndStart();
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
    titleDiv.textContent =
      mode === "anime"
        ? (item.title_english || item.title_mal_default || item.title_original || item.title || "")
        : (item.label || "");

    div.appendChild(rankDiv);

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image || "";
      img.alt = item.title_english || item.title_mal_default || item.title_original || item.title || "";
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

  loadDataAndStart();
})();

// Tooltip aide
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
