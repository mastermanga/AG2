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
  const TOTAL_ITEMS = 32;      // 32 participants
  const ELIM_LOSSES = 2;       // 2 défaites = OUT

  let data = [];
  let items = [];

  // ====== DOUBLE ELIM "CACHÉ" ROUND PAR ROUND ======
  let losses = [];            // pertes par index (0/1/2)
  let played = [];            // Set adversaires déjà rencontrés (anti-rematch)
  let aliveWB = [];           // 0 défaite
  let aliveLB = [];           // 1 défaite

  // eliminationOrder = [1er éliminé, ..., dernier éliminé]
  let eliminationOrder = [];

  let roundNumber = 1;        // Round global affiché
  let roundMatches = [];      // matchs du round en cours (WB + LB mélangés)
  let roundMatchIndex = 0;

  let currentMatch = null;

  // UI Elements
  const duelContainer = document.querySelector("#duel-container");
  const classementDiv = document.getElementById("classement");
  const modeAnimeBtn = document.getElementById("mode-anime");
  const modeOpeningBtn = document.getElementById("mode-opening");
  const nextMatchBtn = document.getElementById("next-match-btn");
  const modeSelectDiv = document.getElementById("mode-select");
  const roundIndicator = document.getElementById("round-indicator");

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
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // RECOMPUTE des pools à partir des pertes (évite tout bug WB/LB)
  function recomputePools() {
    aliveWB = [];
    aliveLB = [];
    for (let i = 0; i < items.length; i++) {
      if (losses[i] >= ELIM_LOSSES) continue; // OUT
      if (losses[i] === 0) aliveWB.push(i);
      else if (losses[i] === 1) aliveLB.push(i);
    }
  }

  // ✅ Supporte soit: [ ... ] soit: { animes: [ ... ] }
  function normalizeAnimeList(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.animes)) return json.animes;
    return [];
  }

  async function loadDataAndStart() {
    // ✅ Avec ta nouvelle base, un seul fichier suffit
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
        let openingsList = [];

        data.forEach((anime) => {
          const ops = anime?.song?.openings;
          if (Array.isArray(ops)) {
            ops.forEach((opening) => {
              openingsList.push({
                title: anime.title,
                openingName: opening.name,
                url: opening.video, // dans ta nouvelle base: "video" (webm)
                artists: opening.artists || [],
                season: opening.season || "",
              });
            });
          }
        });

        if (openingsList.length === 0) {
          throw new Error("Aucune opening trouvée (anime.song.openings est vide ?)");
        }

        shuffle(openingsList);
        items = openingsList.slice(0, TOTAL_ITEMS);
      } else {
        shuffle(data);
        items = data.slice(0, TOTAL_ITEMS);
      }

      // init double elim
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
      div1.innerHTML = `<img src="" alt="" /><h3></h3>`;
      div2.innerHTML = `<img src="" alt="" /><h3></h3>`;
    } else {
      // ✅ nouveau: video au lieu de iframe (car animethemes = .webm)
      div1.className = "opening";
      div2.className = "opening";
      div1.innerHTML = `<video controls preload="metadata"></video><h3></h3>`;
      div2.innerHTML = `<video controls preload="metadata"></video><h3></h3>`;
    }

    duelContainer.appendChild(div1);
    duelContainer.appendChild(div2);

    div1.onclick = () => recordWin(1);
    div2.onclick = () => recordWin(2);
  }

  function showMatch(match) {
    const i1 = match.i1;
    const i2 = match.i2;
    const divs = duelContainer.children;

    if (mode === "anime") {
      const img1 = divs[0].querySelector("img");
      const img2 = divs[1].querySelector("img");

      img1.src = items[i1].image || "";
      img1.alt = items[i1].title || "";
      divs[0].querySelector("h3").textContent = items[i1].title || "";

      img2.src = items[i2].image || "";
      img2.alt = items[i2].title || "";
      divs[1].querySelector("h3").textContent = items[i2].title || "";
    } else {
      const v1 = divs[0].querySelector("video");
      const v2 = divs[1].querySelector("video");

      // Stop l'autre vidéo si elle jouait
      v1.pause();
      v2.pause();

      v1.src = items[i1].url || "";
      v2.src = items[i2].url || "";

      v1.load();
      v2.load();

      divs[0].querySelector("h3").textContent = items[i1].openingName || "";
      divs[1].querySelector("h3").textContent = items[i2].openingName || "";
    }

    currentMatch = match;
  }

  // ====== ROUND SYSTEM (WB + LB mélangés) ======
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
    if (roundIndicator) {
      const total = roundMatches.length || 0;
      const done = Math.min(roundMatchIndex, total);
      roundIndicator.textContent =
        total > 0 ? `Round ${roundNumber} — Match ${done + 1}/${total}` : `Round ${roundNumber}`;
    }
  }

  function buildNextRound() {
    const matches = [];

    // Finale: 1 WB vs 1 LB
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

    // Si aucun match possible -> terminé
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

  // ====== Enregistrer un gagnant ======
  function recordWin(winnerSide) {
    if (!currentMatch) return;

    const winnerIndex = winnerSide === 1 ? currentMatch.i1 : currentMatch.i2;
    const loserIndex = winnerSide === 1 ? currentMatch.i2 : currentMatch.i1;

    // anti-rematch
    played[winnerIndex].add(loserIndex);
    played[loserIndex].add(winnerIndex);

    // défaite
    losses[loserIndex]++;

    // OUT => stocker l'ordre d'élimination
    if (losses[loserIndex] === ELIM_LOSSES) {
      eliminationOrder.push(loserIndex);
    }

    recomputePools();
    showNextMatchInRound();
  }

  // ====== Classement final (basé sur l'ordre d'élimination) ======
  function showClassementDoubleElim(championIndex) {
    duelContainer.style.display = "none";
    classementDiv.innerHTML = "";

    // bouton fin / rejouer
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

    // ranking = [champion, runner-up, ...] via élimination inverse
    const ranking = [champ, ...eliminationOrder.slice().reverse()];

    // sécurité si jamais il manque des indices
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
    titleDiv.textContent = mode === "anime" ? (item.title || "") : (item.openingName || "");

    div.appendChild(rankDiv);

    if (mode === "anime") {
      const img = document.createElement("img");
      img.src = item.image || "";
      img.alt = item.title || "";
      div.appendChild(img);
    } else {
      // ✅ nouveau: video au lieu de iframe
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
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

  // Init first load
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
