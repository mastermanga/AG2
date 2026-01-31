/* =========================================================
   Blind Ranking — script.js (COMPLET)
   - Parcours: auto-start + lecture config (URL + localStorage AG_parcours_filters)
   - Fix "pool trop petit (0/N)" :
       ✅ année inconnue (0) => on garde (ne filtre pas)
       ✅ normalisation type (TV/Movie/OVA/ONA/Special)
       ✅ songs: mapping opening/ending/insert + meta animeYear/animeType
   - End button:
       Parcours => "Continuer le parcours" + postMessage
       Standard => "✅ Terminer" => retour réglages
   ========================================================= */

(() => {
  // =======================
  // CONFIG
  // =======================
  const DATA_URL = "../data/licenses_only.json";

  const TOTAL_ITEMS = 10; // Blind ranking: 10 items à classer
  const MIN_REQUIRED = TOTAL_ITEMS;

  // Songs snippet
  const SONG_START_SEC = 45;
  const SONG_PLAY_SEC = 30;

  // vidéo retry
  const RETRY_DELAYS = [0, 1500, 3000, 4500, 6000];
  const LOAD_TIMEOUT_MS = 6000;

  // Parcours
  const PARCOURS_CFG_KEY = "AG_parcours_filters";
  let parcoursSent = false;

  // =======================
  // URL PARAMS
  // =======================
  const urlParams = new URLSearchParams(window.location.search);
  const IS_PARCOURS = urlParams.get("parcours") === "1";

  // mêmes clés que Tournament + variantes
  const FORCED_MODE = urlParams.get("mode"); // "anime" | "songs"
  const PARAM_TYPES = urlParams.get("types"); // "TV,Movie"
  const PARAM_SONGS = urlParams.get("songs"); // "opening,ending,insert"
  const PARAM_POP = urlParams.get("popPercent") || urlParams.get("pop") || urlParams.get("popularity");
  const PARAM_SCORE = urlParams.get("scorePercent") || urlParams.get("score");
  const PARAM_YMIN = urlParams.get("yearMin") || urlParams.get("yMin");
  const PARAM_YMAX = urlParams.get("yearMax") || urlParams.get("yMax");

  // =======================
  // DOM helpers (défensifs)
  // =======================
  const $id = (id) => document.getElementById(id);
  const firstByIds = (...ids) => ids.map($id).find(Boolean) || null;

  function setText(el, t) {
    if (el) el.textContent = String(t ?? "");
  }

  // =======================
  // THEME / MENU
  // =======================
  firstByIds("back-to-menu", "backBtn")?.addEventListener("click", () => {
    window.location.href = "../index.html";
  });

  firstByIds("themeToggle", "toggleTheme")?.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
  });

  window.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("theme") === "light") document.body.classList.add("light");
  });

  // Tooltip help (comme Tournament)
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
  // DATA + STATE
  // =======================
  let ALL_TITLES = []; // animes enrichis
  let ALL_SONGS = [];  // songs enrichies (après build)
  let mode = "anime";  // "anime" | "songs"

  // blind state
  let selectedItems = [];                 // 10 items à classer
  let currentIndex = 0;                   // 0..9
  let rankingSlots = Array(TOTAL_ITEMS).fill(null); // index => item
  let LOAD_SESSION = 0;

  // volume (songs)
  let GLOBAL_VOLUME = 0.5;

  function loadSavedVolume() {
    const v = parseFloat(localStorage.getItem("blind_volume") || "0.5");
    GLOBAL_VOLUME = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  }
  function saveVolume(v) {
    localStorage.setItem("blind_volume", String(v));
  }
  function applyGlobalVolumeToVideo(video) {
    if (!video) return;
    try {
      video.muted = false;
      video.volume = GLOBAL_VOLUME;
    } catch {}
  }

  // =======================
  // PARCOURS postMessage
  // =======================
  function sendParcoursScore(score = 1, total = 1) {
    if (parcoursSent) return;
    parcoursSent = true;
    try {
      parent.postMessage(
        { parcoursScore: { label: "Blind Ranking", score, total } },
        "*"
      );
    } catch (e) {
      console.warn("postMessage parcours failed:", e);
    }
  }

  function loadParcoursCfg() {
    try {
      const raw = localStorage.getItem(PARCOURS_CFG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // =======================
  // UTILS
  // =======================
  function shuffle(a) {
    const arr = [...a];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickUniqueN(pool, n) {
    const out = [];
    const used = new Set();
    for (const it of shuffle(pool)) {
      if (out.length >= n) break;
      const k = it?._key || JSON.stringify(it);
      if (used.has(k)) continue;
      used.add(k);
      out.push(it);
    }
    return out;
  }

  function clamp(n, a, b) {
    n = Number.isFinite(n) ? n : a;
    return Math.max(a, Math.min(b, n));
  }

  function norm(s) {
    return (s || "").toString().trim().toLowerCase();
  }

  function normalizeType(t) {
    const s = String(t || "").trim().toLowerCase();

    if (s === "tv" || s.includes("tv")) return "TV";
    if (s === "movie" || s === "film") return "Movie";
    if (s === "ova") return "OVA";
    if (s === "ona") return "ONA";
    if (s === "special" || s === "sp") return "Special";

    const up = String(t || "").trim();
    if (["TV", "Movie", "OVA", "ONA", "Special"].includes(up)) return up;

    return up || "Unknown";
  }

  function extractYearAny(obj) {
    if (obj == null) return 0;
    if (typeof obj === "number" && Number.isFinite(obj)) return obj;
    const s = String(obj).trim();
    const m = s.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function getYear(a) {
    if (!a) return 0;

    let y =
      extractYearAny(a.year) ||
      extractYearAny(a.seasonYear) ||
      extractYearAny(a.release_year);

    if (!y) y = extractYearAny(a.aired?.prop?.from?.year);
    if (!y) y = extractYearAny(a.aired?.from);
    if (!y) y = extractYearAny(a.airing_start);
    if (!y) y = extractYearAny(a.start_date);
    if (!y) y = extractYearAny(a.premiered);
    if (!y) y = extractYearAny(a.season); // ton champ existant

    return Number.isFinite(y) ? y : 0;
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

  function getYearFromSeasonStr(seasonStr, fallback = 0) {
    const y = extractYearAny(seasonStr);
    return y || (Number.isFinite(+fallback) ? +fallback : 0);
  }

  function normalizeSongKindToCode(x) {
    const s = norm(x);
    if (s === "opening" || s === "op") return "OP";
    if (s === "ending" || s === "ed") return "ED";
    if (s === "insert" || s === "in") return "IN";
    return "";
  }

  // =======================
  // UI ELEMENTS (IDs compatibles Tournament)
  // =======================
  const elCustomPanel = firstByIds("custom-panel", "customPanel");
  const elGamePanel = firstByIds("game-panel", "gamePanel");

  const popEl = firstByIds("popPercent");
  const scoreEl = firstByIds("scorePercent");
  const yearMinEl = firstByIds("yearMin");
  const yearMaxEl = firstByIds("yearMax");

  const popValEl = firstByIds("popPercentVal");
  const scoreValEl = firstByIds("scorePercentVal");
  const yearMinValEl = firstByIds("yearMinVal");
  const yearMaxValEl = firstByIds("yearMaxVal");

  const previewEl = firstByIds("previewCount");
  const startBtn = firstByIds("applyFiltersBtn", "startBtn");

  const modePillsWrap = firstByIds("modePills");
  const typePillsWrap = firstByIds("typePills");
  const songPillsWrap = firstByIds("songPills");

  // zone game (si absente => on crée)
  const elRoundIndicator = firstByIds("round-indicator", "statusText", "roundIndicator");
  const elEndBtn = firstByIds("next-match-btn", "continueBtn", "endBtn");

  // volume UI (optionnel)
  const volBar = firstByIds("volumeBar");
  const volSlider = firstByIds("volumeSlider");
  const volVal = firstByIds("volumeVal");

  function ensureGameUI() {
    // conteneur pour afficher l’item courant
    let currentBox = firstByIds("duel-container", "currentItem", "current-item");
    let rankingBox = firstByIds("classement", "rankingList", "ranking-list");
    let buttonsBox = firstByIds("rankButtons", "rank-buttons");

    // si le layout n’existe pas, on le crée dans game-panel
    if (!elGamePanel) return { currentBox, rankingBox, buttonsBox };

    if (!currentBox) {
      currentBox = document.createElement("div");
      currentBox.id = "duel-container";
      currentBox.className = "main-block";
      elGamePanel.appendChild(currentBox);
    }

    if (!buttonsBox) {
      buttonsBox = document.createElement("div");
      buttonsBox.id = "rankButtons";
      buttonsBox.className = "main-block";
      elGamePanel.appendChild(buttonsBox);
    }

    if (!rankingBox) {
      rankingBox = document.createElement("div");
      rankingBox.id = "classement";
      rankingBox.className = "main-block";
      elGamePanel.appendChild(rankingBox);
    }

    // crée les 10 boutons si pas déjà présents
    const existing = buttonsBox.querySelectorAll("button[data-rank]").length;
    if (existing < TOTAL_ITEMS) {
      buttonsBox.innerHTML = "";
      const title = document.createElement("div");
      title.style.fontWeight = "900";
      title.style.marginBottom = "10px";
      title.textContent = "Nom";
      buttonsBox.appendChild(title);

      const grid = document.createElement("div");
      grid.style.display = "flex";
      grid.style.flexWrap = "wrap";
      grid.style.gap = "10px";
      grid.style.justifyContent = "center";
      buttonsBox.appendChild(grid);

      for (let i = 1; i <= TOTAL_ITEMS; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pill active";
        b.textContent = String(i);
        b.dataset.rank = String(i);
        grid.appendChild(b);
      }
    }

    return { currentBox, rankingBox, buttonsBox };
  }

  // =======================
  // PANEL vs GAME
  // =======================
  function showCustomization() {
    document.body.classList.remove("game-started");
    if (elCustomPanel) elCustomPanel.style.display = "";
    if (elGamePanel) elGamePanel.style.display = "none";
    updateVolumeVisibility();
    hideEndBtn();
  }

  function showGame() {
    document.body.classList.add("game-started");
    if (elCustomPanel) elCustomPanel.style.display = "none";
    if (elGamePanel) elGamePanel.style.display = "block";
    updateVolumeVisibility();
    hideEndBtn();
  }

  // =======================
  // END BUTTON
  // =======================
  function hideEndBtn() {
    if (!elEndBtn) return;
    elEndBtn.style.display = "none";
    elEndBtn.onclick = null;
    elEndBtn.disabled = false;
  }

  function showEndBtn(label, onClick) {
    if (!elEndBtn) return;
    elEndBtn.textContent = label;
    elEndBtn.style.display = "flex";
    elEndBtn.style.width = "fit-content";
    elEndBtn.style.margin = "0 auto 2rem auto";
    elEndBtn.style.justifyContent = "center";
    elEndBtn.style.alignItems = "center";
    elEndBtn.disabled = false;
    elEndBtn.onclick = typeof onClick === "function" ? onClick : null;
  }

  // =======================
  // VOLUME UI (Songs)
  // =======================
  function initVolumeUI() {
    loadSavedVolume();
    if (!volBar || !volSlider || !volVal) return;

    volSlider.value = String(Math.round(GLOBAL_VOLUME * 100));
    volVal.textContent = String(Math.round(GLOBAL_VOLUME * 100));

    volSlider.addEventListener("input", () => {
      const p = parseInt(volSlider.value, 10);
      const v = (Number.isFinite(p) ? p : 50) / 100;
      GLOBAL_VOLUME = Math.min(1, Math.max(0, v));
      volVal.textContent = String(Math.round(GLOBAL_VOLUME * 100));
      saveVolume(GLOBAL_VOLUME);

      const vid = document.querySelector("#duel-container video");
      if (vid) applyGlobalVolumeToVideo(vid);
      document.querySelectorAll("#classement video").forEach(applyGlobalVolumeToVideo);
    });
  }

  function updateVolumeVisibility() {
    if (!volBar) return;
    const shouldShow = document.body.classList.contains("game-started") && mode === "songs";
    volBar.style.display = shouldShow ? "flex" : "none";
  }

  // =======================
  // DEFAULT UI VALUES
  // =======================
  function setDefaultUI() {
    if (popEl) popEl.value = "30";
    if (scoreEl) scoreEl.value = "100";
    if (yearMinEl) yearMinEl.value = "1950";
    if (yearMaxEl) yearMaxEl.value = "2026";

    // défaut types: TV + Movie
    const typePills = Array.from(document.querySelectorAll("#typePills .pill[data-type], #typePills .pill"));
    if (typePills.length) {
      typePills.forEach((b) => {
        const t = normalizeType(b.dataset.type || b.textContent);
        const on = t === "TV" || t === "Movie";
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    // défaut songs: Opening
    const songPills = Array.from(document.querySelectorAll("#songPills .pill[data-song], #songPills .pill"));
    if (songPills.length) {
      songPills.forEach((b) => {
        const s = norm(b.dataset.song || b.textContent);
        const on = s === "opening";
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  function clampYearSliders() {
    if (!yearMinEl || !yearMaxEl) return;
    let a = parseInt(yearMinEl.value, 10);
    let b = parseInt(yearMaxEl.value, 10);
    if (!Number.isFinite(a)) a = 0;
    if (!Number.isFinite(b)) b = 0;
    if (a > b) {
      [a, b] = [b, a];
      yearMinEl.value = String(a);
      yearMaxEl.value = String(b);
    }
  }

  function ensureDefaultTypes() {
    const pills = Array.from(document.querySelectorAll("#typePills .pill"));
    if (!pills.length) return;
    const active = pills.filter((b) => b.classList.contains("active"));
    if (active.length > 0) return;

    pills.forEach((b) => {
      const t = normalizeType(b.dataset.type || b.textContent);
      const on = t === "TV" || t === "Movie";
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function ensureDefaultSongs() {
    const pills = Array.from(document.querySelectorAll("#songPills .pill"));
    if (!pills.length) return;
    const active = pills.filter((b) => b.classList.contains("active"));
    if (active.length > 0) return;

    pills.forEach((b) => {
      const s = norm(b.dataset.song || b.textContent);
      const on = s === "opening";
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // =======================
  // MODE PILLS
  // =======================
  function syncModeButtons() {
    document.querySelectorAll("#modePills .pill[data-mode], #modePills .pill").forEach((btn) => {
      const m = btn.dataset.mode || norm(btn.textContent);
      const normalized = m === "songs" || m === "song" ? "songs" : "anime";
      const on = normalized === mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function initModePillsIfAny() {
    const pills = Array.from(document.querySelectorAll("#modePills .pill"));
    if (!pills.length) return;

    pills.forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode || norm(btn.textContent);
        const next = m === "songs" || m === "song" ? "songs" : "anime";
        if (next === mode) return;
        mode = next;
        syncModeButtons();
        refreshPreview();
        updateVolumeVisibility();
      });
    });

    syncModeButtons();
  }

  // =======================
  // APPLY PARCOURS PARAMS TO UI (Tournament-like)
  // =======================
  function applyParcoursParamsToUI() {
    const cfg = loadParcoursCfg();
    const has = (x) => x != null && x !== "";

    // mode forcé (URL > cfg)
    const modeFromCfg = (cfg && (cfg.mode || cfg.tournamentMode)) || null;
    const wantedMode =
      FORCED_MODE === "anime" || FORCED_MODE === "songs"
        ? FORCED_MODE
        : modeFromCfg === "anime" || modeFromCfg === "songs"
        ? modeFromCfg
        : null;

    if (wantedMode) {
      mode = wantedMode;
      syncModeButtons();
    }

    // sliders
    const trySetInt = (el, val, min, max) => {
      if (!el || !has(val)) return;
      const n = parseInt(val, 10);
      if (!Number.isFinite(n)) return;
      el.value = String(clamp(n, min, max));
    };

    trySetInt(popEl, has(PARAM_POP) ? PARAM_POP : cfg?.popPercent, 1, 100);
    trySetInt(scoreEl, has(PARAM_SCORE) ? PARAM_SCORE : cfg?.scorePercent, 1, 100);
    trySetInt(yearMinEl, has(PARAM_YMIN) ? PARAM_YMIN : cfg?.yearMin, 1900, 2100);
    trySetInt(yearMaxEl, has(PARAM_YMAX) ? PARAM_YMAX : cfg?.yearMax, 1900, 2100);

    // types (URL > cfg)
    const typesList = has(PARAM_TYPES)
      ? PARAM_TYPES.split(",").map((s) => s.trim()).filter(Boolean)
      : Array.isArray(cfg?.types)
      ? cfg.types
      : null;

    if (typesList && typesList.length) {
      const wantedTypesNorm = typesList.map(normalizeType);
      const pills = Array.from(document.querySelectorAll("#typePills .pill"));
      if (pills.length) {
        pills.forEach((p) => {
          const pillType = normalizeType(p.dataset.type || p.textContent);
          const on = wantedTypesNorm.includes(pillType);
          p.classList.toggle("active", on);
          p.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
    }

    // songs (URL > cfg)
    const songsList = has(PARAM_SONGS)
      ? PARAM_SONGS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : Array.isArray(cfg?.songs)
      ? cfg.songs.map((x) => String(x).toLowerCase())
      : null;

    if (songsList && songsList.length) {
      const want = new Set(songsList);
      const pills = Array.from(document.querySelectorAll("#songPills .pill"));
      if (pills.length) {
        pills.forEach((p) => {
          const s = (p.dataset.song || p.textContent || "").toLowerCase();
          const on = want.has(s);
          p.classList.toggle("active", on);
          p.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
    }

    ensureDefaultTypes();
    ensureDefaultSongs();
    clampYearSliders();
    refreshPreview();
  }

  // =======================
  // READ OPTIONS
  // =======================
  function readOptions() {
    clampYearSliders();
    ensureDefaultTypes();
    ensureDefaultSongs();

    const pop = (parseInt(popEl?.value || "30", 10) || 30) / 100;
    const score = (parseInt(scoreEl?.value || "100", 10) || 100) / 100;
    const yMin = parseInt(yearMinEl?.value || "1950", 10) || 0;
    const yMax = parseInt(yearMaxEl?.value || "2026", 10) || 9999;

    if (popValEl) popValEl.textContent = String(Math.round(pop * 100));
    if (scoreValEl) scoreValEl.textContent = String(Math.round(score * 100));
    if (yearMinValEl) yearMinValEl.textContent = String(yMin);
    if (yearMaxValEl) yearMaxValEl.textContent = String(yMax);

    const types = new Set(
      [...document.querySelectorAll("#typePills .pill.active")].map((b) => normalizeType(b.dataset.type || b.textContent))
    );

    const songKindsRaw = [...document.querySelectorAll("#songPills .pill.active")].map((b) => (b.dataset.song || b.textContent || ""));
    const songKinds = new Set(songKindsRaw.map((x) => norm(x)));

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
  // FILTER ANIMES
  // =======================
  function filterTitles(data, o) {
    // ✅ année inconnue (=0) => on garde
    let arr = data.filter((a) => {
      const t = normalizeType(a._type);
      if (!o.types.has(t)) return false;

      const y = Number.isFinite(+a._year) ? +a._year : 0;
      const inYear = y === 0 ? true : y >= o.yMin && y <= o.yMax;
      return inYear;
    });

    // Popularité (members desc)
    arr.sort((a, b) => b._members - a._members);
    arr = arr.slice(0, Math.ceil(arr.length * o.pop));

    // Score (desc)
    arr.sort((a, b) => b._score - a._score);
    arr = arr.slice(0, Math.ceil(arr.length * o.score));

    return arr;
  }

  // =======================
  // BUILD + FILTER SONGS
  // =======================
  function buildSongsWithMeta(titles, o) {
    const tracks = [];

    const addList = (t, list, kindHuman, kindCode) => {
      (list || []).forEach((s) => {
        const url = s?.video || s?.url;
        if (!url) return;

        const artistsArr = Array.isArray(s.artists) ? s.artists.filter(Boolean) : [];
        const artistsLabel = artistsArr.length ? " by " + artistsArr.join(", ") : "";

        const seasonStr = String(s.season || "").trim();
        const songYear = getYearFromSeasonStr(seasonStr, t._year);

        tracks.push({
          _key: `song|${t.mal_id || ""}|${kindCode}|${s.number ?? ""}|${s.name ?? ""}|${url}`,
          video: url,
          label: `${t._title} ${kindHuman} ${s.number ?? ""} : ${s.name ?? ""}${artistsLabel}`.replace(/\s+/g, " ").trim(),

          // meta anime
          animeId: t.mal_id || null,
          animeTitle: t._title || "",
          animeType: normalizeType(t._type),
          animeYear: t._year || 0,
          _members: t._members,
          _score: t._score,

          // meta song
          artistsArr,
          songSeason: seasonStr,
          songYear,
          songType: kindCode, // OP/ED/IN
        });
      });
    };

    titles.forEach((t) => {
      if (o.incOP) addList(t, t.song?.openings, "Opening", "OP");
      if (o.incED) addList(t, t.song?.endings, "Ending", "ED");
      if (o.incIN) addList(t, t.song?.inserts, "Insert", "IN");
    });

    return tracks;
  }

  function filterSongs(dataTitles, o) {
    const titles = dataTitles.filter((a) => {
      const t = normalizeType(a._type);
      if (!o.types.has(t)) return false;

      const y = Number.isFinite(+a._year) ? +a._year : 0;
      const inYear = y === 0 ? true : y >= o.yMin && y <= o.yMax;
      return inYear;
    });

    let songs = buildSongsWithMeta(titles, o);

    songs.sort((a, b) => b._members - a._members);
    songs = songs.slice(0, Math.ceil(songs.length * o.pop));

    songs.sort((a, b) => b._score - a._score);
    songs = songs.slice(0, Math.ceil(songs.length * o.score));

    return songs;
  }

  // =======================
  // PREVIEW
  // =======================
  function refreshPreview() {
    if (!ALL_TITLES.length) return;

    const o = readOptions();

    if (mode === "anime") {
      const titles = filterTitles(ALL_TITLES, o);
      const ok = titles.length >= MIN_REQUIRED;
      if (previewEl) {
        previewEl.textContent = `📚 ${titles.length} titres disponibles${ok ? " (OK)" : ` (Min ${MIN_REQUIRED})`}`;
        previewEl.classList.toggle("good", ok);
        previewEl.classList.toggle("bad", !ok);
      }
      if (startBtn) startBtn.disabled = !ok;
    } else {
      const songs = filterSongs(ALL_TITLES, o);
      const ok = songs.length >= MIN_REQUIRED;
      if (previewEl) {
        previewEl.textContent = `🎵 ${songs.length} songs disponibles${ok ? " (OK)" : ` (Min ${MIN_REQUIRED})`}`;
        previewEl.classList.toggle("good", ok);
        previewEl.classList.toggle("bad", !ok);
      }
      if (startBtn) startBtn.disabled = !ok;
    }
  }

  // =======================
  // UI EVENTS (filters)
  // =======================
  function wireCustomizationUI() {
    document.querySelectorAll("#custom-panel input, #custom-panel button.pill").forEach((el) => {
      el.addEventListener("input", refreshPreview);
    });

    // Types pills (au moins 1)
    typePillsWrap?.addEventListener("click", (e) => {
      const b = e.target.closest(".pill");
      if (!b) return;

      const pills = [...typePillsWrap.querySelectorAll(".pill")];
      if (b.classList.contains("active")) {
        const actives = pills.filter((x) => x.classList.contains("active"));
        if (actives.length === 1) return;
      }
      b.classList.toggle("active");
      b.setAttribute("aria-pressed", b.classList.contains("active") ? "true" : "false");

      ensureDefaultTypes();
      refreshPreview();
    });

    // Songs pills (au moins 1)
    songPillsWrap?.addEventListener("click", (e) => {
      const b = e.target.closest(".pill");
      if (!b) return;

      const pills = [...songPillsWrap.querySelectorAll(".pill")];
      if (b.classList.contains("active")) {
        const actives = pills.filter((x) => x.classList.contains("active"));
        if (actives.length === 1) return;
      }
      b.classList.toggle("active");
      b.setAttribute("aria-pressed", b.classList.contains("active") ? "true" : "false");

      ensureDefaultSongs();
      refreshPreview();
    });

    startBtn?.addEventListener("click", startGame);
  }

  // =======================
  // VIDEO HELPERS
  // =======================
  function cleanupCurrentMedia() {
    const box = firstByIds("duel-container", "currentItem", "current-item");
    if (!box) return;
    box.querySelectorAll("video").forEach((v) => {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {}
    });
  }

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

  function installSnippetLimiter(video, startSec, endSec, session) {
    if (!video) return;

    let armed = false;
    let endedOnce = false;

    const safeSeek = (t) => {
      try {
        video.currentTime = t;
      } catch {}
    };

    const onPlay = () => {
      if (session !== LOAD_SESSION) return;
      if (!armed || video.currentTime < startSec - 0.25 || video.currentTime > endSec + 0.25) {
        safeSeek(startSec);
        armed = true;
      }
    };

    const onTime = () => {
      if (session !== LOAD_SESSION) return;
      if (!armed || endedOnce) return;
      if (video.currentTime >= endSec) {
        endedOnce = true;
        try { video.pause(); } catch {}
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("timeupdate", onTime);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("timeupdate", onTime);
    };
  }

  async function loadVideoWithRetry(video, url, { autoplay = false, session = 0 } = {}) {
    video.preload = "metadata";
    video.playsInline = true;
    video.controls = true;

    applyGlobalVolumeToVideo(video);

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (session !== LOAD_SESSION) return false;

      const delay = RETRY_DELAYS[attempt];
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (session !== LOAD_SESSION) return false;

      try {
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch {}

        video.src = url;
        video.load();

        await waitEventOrTimeout(
          video,
          { ok: ["loadedmetadata", "loadeddata", "canplay"], fail: ["error", "abort"] },
          LOAD_TIMEOUT_MS
        );

        if (session !== LOAD_SESSION) return false;

        // snippet
        const dur = video.duration;
        let start = SONG_START_SEC;
        let end = SONG_START_SEC + SONG_PLAY_SEC;
        if (Number.isFinite(dur) && dur > 1) {
          start = Math.min(SONG_START_SEC, Math.max(0, dur - 0.25));
          end = Math.min(start + SONG_PLAY_SEC, Math.max(0, dur - 0.05));
        }

        try { video.currentTime = start; } catch {}
        const cleanup = installSnippetLimiter(video, start, end, session);

        if (autoplay) {
          try { await video.play(); } catch {}
        }

        if (session !== LOAD_SESSION && cleanup) cleanup();
        return true;
      } catch {
        // retry
      }
    }
    return false;
  }

  // =======================
  // ABORT UI (parcours)
  // =======================
  function buildFilterDebugInfo() {
    const popPercent = parseInt(popEl?.value || "30", 10);
    const scorePercent = parseInt(scoreEl?.value || "100", 10);
    const yearMin = parseInt(yearMinEl?.value || "1950", 10);
    const yearMax = parseInt(yearMaxEl?.value || "2026", 10);

    const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")]
      .map((b) => normalizeType(b.dataset.type || b.textContent));

    const allowedSongsRaw = [...document.querySelectorAll("#songPills .pill.active")]
      .map((b) => (b.dataset.song || b.textContent || ""));

    const allowedSongs = allowedSongsRaw.map(normalizeSongKindToCode).filter(Boolean);

    return { mode, popPercent, scorePercent, yearMin, yearMax, allowedTypes, allowedSongs };
  }

  function parcoursAbortUI(message, score = 0, total = 1) {
    showGame();
    cleanupCurrentMedia();

    const { currentBox, rankingBox, buttonsBox } = ensureGameUI();
    if (currentBox) currentBox.innerHTML = "";
    if (rankingBox) rankingBox.innerHTML = "";
    if (buttonsBox) {
      // on laisse les boutons visibles ou non selon ton CSS, mais on peut les désactiver
      buttonsBox.querySelectorAll("button").forEach((b) => (b.disabled = true));
    }

    if (elRoundIndicator) setText(elRoundIndicator, message);

    showEndBtn("Continuer le parcours", () => {
      if (elEndBtn) elEndBtn.disabled = true;
      sendParcoursScore(score, total);
    });
  }

  // =======================
  // START GAME
  // =======================
  function resetGameState() {
    LOAD_SESSION++;
    cleanupCurrentMedia();
    selectedItems = [];
    currentIndex = 0;
    rankingSlots = Array(TOTAL_ITEMS).fill(null);
    hideEndBtn();
  }

  function startGame() {
    if (!ALL_TITLES.length) return;

    resetGameState();

    const o = readOptions();

    if (mode === "anime") {
      const pool = filterTitles(ALL_TITLES, o);

      if (pool.length < MIN_REQUIRED) {
        const dbg = buildFilterDebugInfo();
        const msg =
          `❌ Pool trop petit (${pool.length}/${MIN_REQUIRED}). Vérifie la config (types).\n` +
          `mode=${dbg.mode} | years=${dbg.yearMin}-${dbg.yearMax} | types=[${dbg.allowedTypes.join(", ")}]`;
        if (IS_PARCOURS) return parcoursAbortUI(msg, 0, 1);
        alert(msg);
        showCustomization();
        return;
      }

      selectedItems = pickUniqueN(pool, TOTAL_ITEMS).map((t) => ({
        kind: "anime",
        _key: t._key,
        title: t._title,
        image: t.image,
        year: t._year,
        type: t._type,
      }));
    } else {
      const pool = filterSongs(ALL_TITLES, o);

      if (pool.length < MIN_REQUIRED) {
        const dbg = buildFilterDebugInfo();
        const msg =
          `❌ Pool trop petit (${pool.length}/${MIN_REQUIRED}). Vérifie la config (types/songs).\n` +
          `mode=${dbg.mode} | years=${dbg.yearMin}-${dbg.yearMax} | types=[${dbg.allowedTypes.join(", ")}] | songs=[${dbg.allowedSongs.join(", ")}]`;
        if (IS_PARCOURS) return parcoursAbortUI(msg, 0, 1);
        alert(msg);
        showCustomization();
        return;
      }

      selectedItems = pickUniqueN(pool, TOTAL_ITEMS).map((s) => ({
        kind: "song",
        _key: s._key,
        label: s.label,
        video: s.video,
        animeTitle: s.animeTitle,
        songType: s.songType,
      }));
    }

    showGame();
    renderStep();
  }

  // =======================
  // RENDER STEP
  // =======================
  function updateIndicator() {
    if (!elRoundIndicator) return;
    setText(elRoundIndicator, `Item ${Math.min(currentIndex + 1, TOTAL_ITEMS)}/${TOTAL_ITEMS} — Mode: ${mode === "anime" ? "Animes" : "Songs"}`);
  }

  function renderRankingList(rankingBox) {
    if (!rankingBox) return;
    rankingBox.innerHTML = "";

    const title = document.createElement("div");
    title.style.fontWeight = "900";
    title.style.marginBottom = "10px";
    title.textContent = "Classement";
    rankingBox.appendChild(title);

    for (let i = 0; i < TOTAL_ITEMS; i++) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "6px 0";
      row.style.borderBottom = "1px solid rgba(255,255,255,0.08)";

      const rank = document.createElement("div");
      rank.style.fontWeight = "900";
      rank.style.minWidth = "38px";
      rank.textContent = `#${i + 1}`;
      row.appendChild(rank);

      const it = rankingSlots[i];
      const label = document.createElement("div");
      label.style.fontWeight = "700";
      label.style.opacity = it ? "1" : "0.6";
      label.textContent = it ? (it.kind === "anime" ? it.title : it.label) : "—";
      row.appendChild(label);

      rankingBox.appendChild(row);
    }
  }

  function updateRankButtons(buttonsBox) {
    if (!buttonsBox) return;
    buttonsBox.querySelectorAll("button[data-rank]").forEach((btn) => {
      const r = parseInt(btn.dataset.rank, 10);
      const idx = r - 1;
      const filled = rankingSlots[idx] != null;
      btn.disabled = filled; // slot unique
      btn.classList.toggle("active", !filled);
      btn.style.opacity = filled ? "0.45" : "";
      btn.setAttribute("aria-disabled", filled ? "true" : "false");
    });
  }

  async function renderCurrentItem(currentBox) {
    if (!currentBox) return;
    currentBox.innerHTML = "";

    const it = selectedItems[currentIndex];
    if (!it) return;

    const wrap = document.createElement("div");
    wrap.style.width = "100%";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "12px";
    wrap.style.alignItems = "center";

    const title = document.createElement("div");
    title.style.fontWeight = "900";
    title.style.fontSize = "1.05rem";
    title.style.textAlign = "center";
    title.style.opacity = "0.95";
    title.textContent = it.kind === "anime" ? it.title : it.label;
    wrap.appendChild(title);

    if (it.kind === "anime") {
      const img = document.createElement("img");
      img.src = it.image;
      img.alt = it.title || "anime";
      img.loading = "eager";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "420px";
      img.style.objectFit = "contain";
      img.style.background = "#000";
      img.style.borderRadius = "12px";
      wrap.appendChild(img);
    } else {
      const session = ++LOAD_SESSION;
      const video = document.createElement("video");
      video.style.width = "100%";
      video.style.maxWidth = "900px";
      video.style.borderRadius = "12px";
      video.style.background = "#000";
      wrap.appendChild(video);

      applyGlobalVolumeToVideo(video);
      await loadVideoWithRetry(video, it.video, { autoplay: true, session });
      applyGlobalVolumeToVideo(video);
    }

    currentBox.appendChild(wrap);
  }

  async function renderStep() {
    updateIndicator();
    updateVolumeVisibility();
    hideEndBtn();

    const { currentBox, rankingBox, buttonsBox } = ensureGameUI();

    renderRankingList(rankingBox);
    updateRankButtons(buttonsBox);

    await renderCurrentItem(currentBox);

    // bind rank buttons
    buttonsBox?.querySelectorAll("button[data-rank]")?.forEach((btn) => {
      btn.onclick = () => {
        const r = parseInt(btn.dataset.rank, 10);
        const slot = r - 1;
        if (slot < 0 || slot >= TOTAL_ITEMS) return;
        if (rankingSlots[slot] != null) return; // déjà pris

        rankingSlots[slot] = selectedItems[currentIndex];

        currentIndex++;
        if (currentIndex >= TOTAL_ITEMS) {
          finishGame();
        } else {
          renderStep();
        }
      };
    });
  }

  // =======================
  // FINISH
  // =======================
  function finishGame() {
    LOAD_SESSION++;
    cleanupCurrentMedia();

    const { currentBox, rankingBox, buttonsBox } = ensureGameUI();
    if (buttonsBox) buttonsBox.querySelectorAll("button").forEach((b) => (b.disabled = true));

    if (currentBox) {
      currentBox.innerHTML = "";
      const done = document.createElement("div");
      done.style.fontWeight = "900";
      done.style.fontSize = "1.1rem";
      done.style.textAlign = "center";
      done.textContent = "🏁 Classement terminé !";
      currentBox.appendChild(done);
    }

    if (rankingBox) renderRankingList(rankingBox);

    if (elRoundIndicator) setText(elRoundIndicator, "🏁 Blind Ranking terminé !");

    if (IS_PARCOURS) {
      showEndBtn("Continuer le parcours", () => {
        if (elEndBtn) elEndBtn.disabled = true;
        sendParcoursScore(1, 1);
      });
    } else {
      showEndBtn("✅ Terminer", () => {
        resetGameState();
        showCustomization();
        refreshPreview();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  // =======================
  // INIT DATA
  // =======================
  fetch(DATA_URL)
    .then((r) => r.json())
    .then((json) => {
      const arr = Array.isArray(json) ? json : [];

      ALL_TITLES = arr.map((a) => {
        const title = getDisplayTitle(a);
        const genres = Array.isArray(a.genres) ? a.genres : [];
        const themes = Array.isArray(a.themes) ? a.themes : [];
        return {
          ...a,
          _key: `anime|${a.mal_id || title}`,
          _title: title,
          _year: getYear(a),
          _members: Number.isFinite(+a.members) ? +a.members : 0,
          _score: Number.isFinite(+a.score) ? +a.score : 0,
          _type: normalizeType(a.type),
          _studio: a.studio || "",
          _tags: [...genres, ...themes],
        };
      });

      initVolumeUI();
      setDefaultUI();
      initModePillsIfAny();
      wireCustomizationUI();
      refreshPreview();
      updateVolumeVisibility();
      hideEndBtn();

      // Parcours behaviour (comme Tournament)
      if (IS_PARCOURS) {
        document.body.classList.add("game-started");

        const backBtn = firstByIds("back-to-menu", "backBtn");
        if (backBtn) backBtn.style.display = "none";

        if (elCustomPanel) elCustomPanel.style.display = "none";
        if (elGamePanel) elGamePanel.style.display = "block";

        applyParcoursParamsToUI();
        startGame();
      } else {
        showCustomization();
      }
    })
    .catch((e) => {
      alert("Erreur chargement dataset: " + e.message);
    });
})();
