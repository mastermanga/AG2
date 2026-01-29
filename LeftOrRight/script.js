/**********************
 * Left or Right (Anime / Songs) — Duels indépendants
 * ✅ Thème contenu à CHAQUE DUEL (round indépendant)
 * ✅ Feedback visuel de choix (néon vert + loser grisé)
 *
 * Flow par duel:
 *  - pool = applyFilters()
 *  - seed random dans pool
 *  - critère random (Libre / Année / Studio / Tag / Score / Pop (+ Songs: SongYear/AnimeYear/Anime/Artist))
 *  - build themePool “élastique”
 *  - pick 2 items distincts dans themePool
 *  - affiche "🎯 Thème contenu : ..."
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
    document.querySelectorAll(".info-wrap.open").forEach((w) => w.classList.remove("open"));
  }
});

// =======================
// SETTINGS THEME CONTENU
// =======================
const THEME_MIN_SIZE = 2; // ✅ un duel = 2 items
const THEME_POOL_SIZE = 2;

// ✅ Clip settings (Songs)
const CLIP_START_S = 45;
const CLIP_DURATION_S = 20;
const CLIP_EPS = 0.05;

// retries: 1 essai + 5 retries => 0, 2s, 4s, 6s, 8s, 10s
const RETRY_DELAYS = [0, 2000, 4000, 6000, 8000, 10000];
const STALL_TIMEOUT_MS = 6000;

// sécurité anti-blocage total (si ça ne joue jamais)
const MAX_WALL_SNIPPET_MS = 60000;

// ====== HELPERS ======
function normalizeAnimeList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.animes)) return json.animes;
  return [];
}
function safeNum(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
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
  const s = ((a && a.season) ? String(a.season) : "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}
function getYearFromSeasonStr(seasonStr, fallback = 0) {
  const s = String(seasonStr || "").trim();
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : (fallback || 0);
}
function clampYearSliders() {
  let a = parseInt(yearMinEl.value, 10);
  let b = parseInt(yearMaxEl.value, 10);
  if (a > b) {
    [a, b] = [b, a];
    yearMinEl.value = a;
    yearMaxEl.value = b;
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
function round1(x) {
  return Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
}
function norm(s) {
  return (s || "").toString().trim().toLowerCase();
}
function includesStudio(studio, needle) {
  const s = norm(studio);
  const n = norm(needle);
  if (!s || !n) return false;
  return s.includes(n);
}
function extractTagNames(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") out.push(it);
    else if (typeof it.name === "string") out.push(it.name);
  }
  return out.map((x) => String(x).trim()).filter(Boolean);
}

function songTypeLabel(t) {
  if (t === "OP") return "OP";
  if (t === "ED") return "ED";
  return "IN";
}
function formatSongTitle(s) {
  const type = songTypeLabel(s.songType);
  const num = s.songNumber ? `${s.songNumber}` : "";
  const name = s.songName ? ` — ${s.songName}` : "";
  const art = s.songArtists ? ` — ${s.songArtists}` : "";
  return `${s.animeTitle || "Anime"} ${type}${num}${name}${art}`;
}

// ====== SONG EXTRACTION ======
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

      const artistsArr = Array.isArray(it.artists) ? it.artists.filter(Boolean) : [];
      const artists = artistsArr.join(", ");

      const songSeason = String(it.season || "").trim();
      const songYear = getYearFromSeasonStr(songSeason, anime._year);

      out.push({
        kind: "song",
        songType: b.type,
        songName: it.name || "",
        songNumber: safeNum(it.number) || 1,
        songArtists: artists || "",
        artistsArr, // ✅ pour thème ARTIST
        songSeason,
        songYear, // ✅ pour thème SONG_YEAR
        url,

        // anime meta (hérité)
        animeId: anime.mal_id || null, // ✅ pour thème ANIME
        animeTitle: anime._title || "", // ✅ pour thème ANIME
        image: anime.image || "",
        year: anime._year, // année ANIME
        members: anime._members,
        score: anime._score,
        type: anime._type,

        studio: anime._studio || "", // ✅ pour thème STUDIO
        tags: Array.isArray(anime._tags) ? anime._tags : [], // ✅ pour thème TAG

        _key: `song|${b.type}|${it.number || ""}|${it.name || ""}|${url}|${anime.mal_id || ""}`,
      });
    }
  }
  return out;
}

// =======================
// THEME CONTENU — outils (minSize = 2)
// =======================
function pickUniqueN(pool, n) {
  const out = [];
  const used = new Set();
  for (const it of shuffleInPlace([...pool])) {
    if (out.length >= n) break;
    const k = it?._key || JSON.stringify(it);
    if (used.has(k)) continue;
    used.add(k);
    out.push(it);
  }
  return out;
}

function summarizeForLabel(arr, max = 3) {
  const clean = (arr || []).map((x) => String(x || "").trim()).filter(Boolean);
  if (clean.length <= max) return clean.join(" + ");
  return clean.slice(0, max).join(" + ") + ` + ${clean.length - max} autres`;
}

function buildYearWindowPool(basePool, getYearFn, centerYear, minSize = THEME_POOL_SIZE) {
  const y0 = Number.isFinite(+centerYear) ? +centerYear : 0;
  if (!y0) return null;

  for (let delta = 0; delta <= 120; delta++) {
    const pool = basePool.filter((it) => {
      const y = +getYearFn(it) || 0;
      return y && Math.abs(y - y0) <= delta;
    });
    if (pool.length >= minSize || pool.length === basePool.length) {
      return { pool, delta };
    }
  }
  return null;
}

function buildScoreWindowPool(basePool, getScoreFn, centerScore, minSize = THEME_POOL_SIZE) {
  const sc0 = Number.isFinite(+centerScore) ? +centerScore : 0;
  if (!sc0) return null;

  for (let step = 0; step <= 10.0; step += 0.1) {
    const delta = Math.round(step * 10) / 10;
    const pool = basePool.filter((it) => {
      const sc = +getScoreFn(it) || 0;
      return sc && Math.abs(sc - sc0) <= delta;
    });
    if (pool.length >= minSize || pool.length === basePool.length) {
      return { pool, delta };
    }
  }
  return null;
}

function clamp(n, a, b) {
  n = Number.isFinite(n) ? n : a;
  return Math.max(a, Math.min(b, n));
}

function topPercentFromValue(sortedDesc, value) {
  const vals = sortedDesc || [];
  const n = vals.length;
  const v = +value || 0;
  if (!n || !v) return 100;

  let lo = 0,
    hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vals[mid] > v) lo = mid + 1;
    else hi = mid;
  }
  const rank = lo + 1;
  return clamp(Math.ceil((rank / n) * 100), 1, 100);
}

function buildPopPercentBandPool(basePool, getPopFn, globalSortedDesc, seedValue, minSize = THEME_POOL_SIZE) {
  const seedP = topPercentFromValue(globalSortedDesc, seedValue);
  const baseStart = Math.floor((seedP - 1) / 5) * 5;
  const baseEnd = baseStart + 5;

  const cache = new Map();
  const getP = (it) => {
    const k = it?._key || JSON.stringify(it);
    if (cache.has(k)) return cache.get(k);
    const p = topPercentFromValue(globalSortedDesc, getPopFn(it));
    cache.set(k, p);
    return p;
  };

  for (let expand = 0; expand <= 100; expand += 5) {
    const s0 = clamp(baseStart - expand, 0, 95);
    const e0 = clamp(baseEnd + expand, 5, 100);
    const lo = s0 === 0 ? 1 : s0;
    const hi = e0;

    const pool = basePool.filter((it) => {
      const p = getP(it);
      return p >= lo && p <= hi;
    });

    if (pool.length >= minSize || pool.length === basePool.length) {
      return { pool, lo, hi };
    }
  }
  return null;
}

function buildCumulativePool(basePool, getValueFromItem, matchesValueFn, seedValue, minSize = THEME_POOL_SIZE, safetyMax = 300) {
  const usedValues = [];
  const usedKey = new Set();
  const mapByKey = new Map();

  const addValue = (val) => {
    const v = String(val || "").trim();
    const key = norm(v);
    if (!key || usedKey.has(key)) return;

    usedKey.add(key);
    usedValues.push(v);

    for (const it of basePool) {
      if (matchesValueFn(it, v, key)) {
        const k = it._key || JSON.stringify(it);
        if (!mapByKey.has(k)) mapByKey.set(k, it);
      }
    }
  };

  addValue(seedValue);

  const candidates = shuffleInPlace([...basePool]);
  let safety = 0;

  while (mapByKey.size < minSize && safety < safetyMax && candidates.length) {
    safety++;
    const seed = candidates.pop();
    addValue(getValueFromItem(seed));
  }

  const out = Array.from(mapByKey.values());
  if (out.length < minSize) return null;

  return { pool: out, values: usedValues };
}

function buildTagCumulativePool(basePool, getTagsFn, seedTag, minSize = THEME_POOL_SIZE) {
  const getValueFromItem = (it) => {
    const tags = getTagsFn(it);
    if (!Array.isArray(tags) || !tags.length) return "";
    return tags[Math.floor(Math.random() * tags.length)];
  };
  const matches = (it, v, key) => {
    const tags = getTagsFn(it);
    return Array.isArray(tags) && tags.some((x) => norm(x) === key);
  };
  return buildCumulativePool(basePool, getValueFromItem, matches, seedTag, minSize, 600);
}

function buildArtistCumulativePool(basePool, getArtistsFn, seedArtist, minSize = THEME_POOL_SIZE) {
  const getValueFromItem = (it) => {
    const arr = getArtistsFn(it);
    if (!Array.isArray(arr) || !arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
  };
  const matches = (it, v, key) => {
    const arr = getArtistsFn(it);
    return Array.isArray(arr) && arr.some((x) => norm(x) === key);
  };
  return buildCumulativePool(basePool, getValueFromItem, matches, seedArtist, minSize, 900);
}

function buildStudioCumulativePool(basePool, getStudioFn, seedStudio, minSize = THEME_POOL_SIZE) {
  const getValueFromItem = (it) => getStudioFn(it);
  const matches = (it, v) => includesStudio(getStudioFn(it), v);
  return buildCumulativePool(basePool, getValueFromItem, matches, seedStudio, minSize, 600);
}

function buildAnimeCumulativePool(basePool, getAnimeKeyFn, getAnimeLabelFn, seedItem, minSize = THEME_POOL_SIZE) {
  const usedLabels = [];
  const usedKey = new Set();
  const mapByKey = new Map();

  const addAnime = (key, label) => {
    const k0 = String(key || "").trim();
    const k = norm(k0);
    if (!k || usedKey.has(k)) return;

    usedKey.add(k);
    usedLabels.push(String(label || k0 || "Anime").trim());

    for (const it of basePool) {
      const kk = norm(String(getAnimeKeyFn(it) || "").trim());
      if (kk && kk === k) {
        const itKey = it._key || JSON.stringify(it);
        if (!mapByKey.has(itKey)) mapByKey.set(itKey, it);
      }
    }
  };

  addAnime(getAnimeKeyFn(seedItem), getAnimeLabelFn(seedItem));

  const candidates = shuffleInPlace([...basePool]);
  let safety = 0;

  while (mapByKey.size < minSize && safety < 900 && candidates.length) {
    safety++;
    const s = candidates.pop();
    addAnime(getAnimeKeyFn(s), getAnimeLabelFn(s));
  }

  const out = Array.from(mapByKey.values());
  if (out.length < minSize) return null;

  return { pool: out, labels: usedLabels };
}

// ✅ pick thème (Libre = même chance)
function pickContentThemeEachRound(basePool, modeLocal, allTitlesForPop) {
  if (!Array.isArray(basePool) || basePool.length < THEME_MIN_SIZE) {
    return { crit: "FREE", label: "Libre", pool: Array.isArray(basePool) ? basePool : [] };
  }

  const criteriaAnime = ["FREE", "YEAR", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR"];
  const criteriaSongs = ["FREE", "SONG_YEAR", "ANIME_YEAR", "ANIME", "STUDIO", "TAG", "SCORE_NEAR", "POP_NEAR", "ARTIST"];
  const criteria = modeLocal === "songs" ? criteriaSongs : criteriaAnime;

  const getYear0 = (it) => it?._year || it?.year || 0;
  const getStudio0 = (it) => it?._studio || it?.studio || "";
  const getScore0 = (it) => it?._score || it?.score || 0;
  const getPop0 = (it) => it?._members || it?.members || 0;

  const getSongYear = (it) => (Number.isFinite(+it?.songYear) ? +it.songYear : 0);
  const getTagsArr = (it) => (Array.isArray(it?.tags) ? it.tags : (Array.isArray(it?._tags) ? it._tags : []));
  const getArtistsArr = (it) => (Array.isArray(it?.artistsArr) ? it.artistsArr : []);

  const getAnimeKey = (it) => {
    if (it?.animeId != null && it.animeId !== "") return String(it.animeId);
    const t = String(it?.animeTitle || "").trim();
    return t ? t : "";
  };
  const getAnimeLabel = (it) => String(it?.animeTitle || it?.title || it?._title || it?.animeId || "Anime").trim();

  const globalSortedMembersDesc = (allTitlesForPop || [])
    .map((t) => +t?._members || 0)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b - a);

  const MAX_TRIES = 80;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const crit = criteria[Math.floor(Math.random() * criteria.length)];

    if (crit === "FREE") return { crit: "FREE", label: "Libre", pool: basePool };

    const seed = basePool[Math.floor(Math.random() * basePool.length)];
    if (!seed) continue;

    if (crit === "YEAR") {
      const y = getYear0(seed);
      const built = buildYearWindowPool(basePool, getYear0, y, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = built.delta === 0 ? `Année : ${y}` : `Année : ${y} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "SONG_YEAR" && modeLocal === "songs") {
      const y = getSongYear(seed);
      const built = buildYearWindowPool(basePool, getSongYear, y, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = built.delta === 0 ? `Année song : ${y}` : `Année song : ${y} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "ANIME_YEAR" && modeLocal === "songs") {
      const y = getYear0(seed);
      const built = buildYearWindowPool(basePool, getYear0, y, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = built.delta === 0 ? `Année anime : ${y}` : `Année anime : ${y} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "ANIME" && modeLocal === "songs") {
      const built = buildAnimeCumulativePool(basePool, getAnimeKey, getAnimeLabel, seed, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = `Animes : ${summarizeForLabel(built.labels, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "STUDIO") {
      const seedStudio = getStudio0(seed);
      if (!String(seedStudio || "").trim()) continue;
      const built = buildStudioCumulativePool(basePool, getStudio0, seedStudio, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = `Studios : ${summarizeForLabel(built.values, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "TAG") {
      const tags = getTagsArr(seed);
      if (!Array.isArray(tags) || !tags.length) continue;
      const seedTag = tags[Math.floor(Math.random() * tags.length)];
      if (!String(seedTag || "").trim()) continue;
      const built = buildTagCumulativePool(basePool, getTagsArr, seedTag, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = `Tags : ${summarizeForLabel(built.values, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "ARTIST" && modeLocal === "songs") {
      const arts = getArtistsArr(seed).filter(Boolean);
      if (!arts.length) continue;
      const seedArtist = arts[Math.floor(Math.random() * arts.length)];
      if (!String(seedArtist || "").trim()) continue;
      const built = buildArtistCumulativePool(basePool, getArtistsArr, seedArtist, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = `Artistes : ${summarizeForLabel(built.values, 3)}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "SCORE_NEAR") {
      const sc = getScore0(seed);
      if (!sc) continue;
      const built = buildScoreWindowPool(basePool, getScore0, sc, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;
      const label = built.delta === 0 ? `Score : ${round1(sc)}` : `Score : ${round1(sc)} ± ${built.delta}`;
      return { crit, label, pool: built.pool };
    }

    if (crit === "POP_NEAR") {
      const pop = getPop0(seed);
      if (!pop) continue;
      const built = buildPopPercentBandPool(basePool, getPop0, globalSortedMembersDesc, pop, THEME_POOL_SIZE);
      if (!built || built.pool.length < THEME_POOL_SIZE) continue;

      const label = (built.lo === 1 && built.hi === 5) ? `Popularité : Top 1–5%` : `Popularité : Top ${built.lo}–${built.hi}%`;
      return { crit, label, pool: built.pool };
    }
  }

  return { crit: "FREE", label: "Libre", pool: basePool };
}

// ✅ Pick 2 items + thème (round indépendant)
function pickPairWithTheme(basePool, modeLocal, allTitlesForPop) {
  const MAX = 100;

  for (let i = 0; i < MAX; i++) {
    const theme = pickContentThemeEachRound(basePool, modeLocal, allTitlesForPop);
    const picked = pickUniqueN(theme.pool, 2);
    if (picked.length >= 2) return { theme, left: picked[0], right: picked[1] };
  }

  // fallback ultime: Libre
  const fallback = pickUniqueN(basePool, 2);
  if (fallback.length >= 2) return { theme: { crit: "FREE", label: "Libre", pool: basePool }, left: fallback[0], right: fallback[1] };
  return null;
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
const roundCountEl = document.getElementById("roundCount");

const roundLabel = document.getElementById("roundLabel");
const contentThemeLabel = document.getElementById("contentThemeLabel");

const promptLine = document.getElementById("promptLine");
const leftPick = document.getElementById("leftPick");
const rightPick = document.getElementById("rightPick");

const leftImg = document.getElementById("leftImg");
const rightImg = document.getElementById("rightImg");
const leftVid = document.getElementById("leftVid");
const rightVid = document.getElementById("rightVid");

const leftTitle = document.getElementById("leftTitle");
const rightTitle = document.getElementById("rightTitle");

const resultDiv = document.getElementById("result");
const nextBtn = document.getElementById("nextBtn");

// volume songs
const volumeRow = document.getElementById("volumeRow");
const volumeSlider = document.getElementById("volumeSlider");
const volumeVal = document.getElementById("volumeVal");

// ====== DATA ======
let allAnimes = [];
let allSongs = [];

// ====== SETTINGS ======
let currentMode = "anime"; // anime | songs
let totalDuels = 10;
let duelIndex = 1;

// current duel
let leftItem = null;
let rightItem = null;
let currentTheme = { crit: "FREE", label: "Libre" };

// anti stale media
let duelToken = 0;
let mediaToken = 0;

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
  const vol = v / 100;
  [leftVid, rightVid].forEach((p) => {
    if (!p) return;
    p.muted = false;
    p.volume = vol;
  });
  volumeVal.textContent = `${v}%`;
}
if (volumeSlider) volumeSlider.addEventListener("input", applyVolume);

// ====== MEDIA LOADER (retries + anti-stall) ======
function hardResetMedia(player) {
  try { player.pause(); } catch {}
  player.removeAttribute("src");
  player.load();
}
function withCacheBuster(url) {
  const [base, frag] = url.split("#");
  const sep = base.includes("?") ? "&" : "?";
  const busted = base + sep + "t=" + Date.now();
  return frag ? busted + "#" + frag : busted;
}
function stopVideo(player) {
  try { player.pause(); } catch {}
  player.ontimeupdate = null;
  player.onended = null;
  player.onplay = null;
  player.onloadedmetadata = null;
  player.oncanplay = null;
  player.onloadeddata = null;
  player.onplaying = null;
  player.onwaiting = null;
  player.onstalled = null;
  player.onerror = null;
  player.removeAttribute("src");
  player.load();
}

// ✅ Loader + callback onReady
function loadMediaWithRetries(player, url, localDuel, localMedia, { onReady } = {}) {
  let attemptIndex = 0;
  let stallTimer = null;
  let done = false;

  const cleanup = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    player.onloadedmetadata = null;
    player.oncanplay = null;
    player.onloadeddata = null;
    player.onplaying = null;
    player.onwaiting = null;
    player.onstalled = null;
    player.onerror = null;
  };

  const isStillValid = () => (localDuel === duelToken && localMedia === mediaToken);

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
    onReady?.();
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

    player.onloadedmetadata = () => { if (!isStillValid() || done) return; markReady(); };
    player.oncanplay = () => { if (!isStillValid() || done) return; markReady(); };
    player.onloadeddata = () => { if (!isStillValid() || done) return; markReady(); };

    player.onwaiting = () => { if (!isStillValid() || done) return; startStallTimer(); };
    player.onstalled = () => { if (!isStillValid() || done) return; startStallTimer(); };

    player.onplaying = () => {
      if (!isStillValid() || done) return;
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    };

    player.onerror = () => { if (!isStillValid() || done) return; triggerRetry(); };

    startStallTimer();
  };

  attemptIndex = 0;
  doAttempt();
  return cleanup;
}

// ✅ Clip controller : seek 45s, play 20s, stop + reset + callback onDone
function setupClipPlayback(player, localDuel, localMedia, { autoplay = false, onDone } = {}) {
  const isStillValid = () => (localDuel === duelToken && localMedia === mediaToken);

  let finished = false;
  const finishOnce = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  let wallTimer = setTimeout(() => {
    if (!isStillValid()) return;
    try { player.pause(); } catch {}
    finishOnce();
  }, MAX_WALL_SNIPPET_MS);

  const clearWall = () => {
    if (wallTimer) clearTimeout(wallTimer);
    wallTimer = null;
  };

  const dur = player.duration;
  let start = CLIP_START_S;
  let endTime = start + CLIP_DURATION_S;

  if (Number.isFinite(dur) && dur > 1) {
    start = Math.min(CLIP_START_S, Math.max(0, dur - 0.25));
    endTime = Math.min(start + CLIP_DURATION_S, Math.max(0, dur - 0.05));
  }

  const stopSnippet = () => {
    if (!isStillValid()) return;
    clearWall();
    try { player.pause(); } catch {}
    try { player.currentTime = start; } catch {}
    finishOnce();
  };

  player.ontimeupdate = () => {
    if (!isStillValid()) return;
    if (player.currentTime >= (endTime - CLIP_EPS)) stopSnippet();
  };
  player.onended = () => stopSnippet();

  player.onplay = () => {
    if (!isStillValid()) return;
    const ct = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    if (ct < (start - 1)) {
      try { player.currentTime = start; } catch {}
    }
  };

  try { player.currentTime = start; } catch {}

  let tries = 0;
  const seeker = setInterval(() => {
    if (!isStillValid()) { clearInterval(seeker); return; }
    const ct = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    if (Math.abs(ct - start) < 0.8) { clearInterval(seeker); return; }
    tries++;
    try { player.currentTime = start; } catch {}
    if (tries >= 15) clearInterval(seeker);
  }, 120);

  if (autoplay) {
    player.muted = false;
    const p = player.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }
}

// ====== INIT CUSTOM UI ======
function initCustomUI() {
  // Mode pills
  document.querySelectorAll("#modePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modePills .pill").forEach((b) => {
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
  document.querySelectorAll("#typePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  // Song pills (songs)
  document.querySelectorAll("#songPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePreview();
    });
  });

  function syncLabels() {
    clampYearSliders();
    popValEl.textContent = popEl.value;
    scoreValEl.textContent = scoreEl.value;
    yearMinValEl.textContent = yearMinEl.value;
    yearMaxValEl.textContent = yearMaxEl.value;
    updatePreview();
  }
  [popEl, scoreEl, yearMinEl, yearMaxEl].forEach((el) => el.addEventListener("input", syncLabels));
  roundCountEl.addEventListener("input", () => updatePreview());

  // Apply
  applyBtn.addEventListener("click", () => {
    const pool = applyFilters();
    totalDuels = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);
    if (!pool || pool.length < 2) return;
    startGame();
  });

  // Duel clicks
  leftPick.addEventListener("click", () => handlePick("left"));
  rightPick.addEventListener("click", () => handlePick("right"));

  updateModeVisibility();
  syncLabels();
}

function updateModeVisibility() {
  songsRow.style.display = currentMode === "songs" ? "flex" : "none";
}

function modeLabel() {
  return currentMode === "songs" ? "Songs" : "Anime";
}

// ====== FILTERS ======
function applyFilters() {
  const popPercent = parseInt(popEl.value, 10);
  const scorePercent = parseInt(scoreEl.value, 10);
  const yearMin = parseInt(yearMinEl.value, 10);
  const yearMax = parseInt(yearMaxEl.value, 10);
  const allowedTypes = [...document.querySelectorAll("#typePills .pill.active")].map((b) => b.dataset.type);
  if (allowedTypes.length === 0) return [];

  if (currentMode === "anime") {
    let pool = allAnimes.filter((a) => a._year >= yearMin && a._year <= yearMax && allowedTypes.includes(a._type));

    pool.sort((a, b) => b._members - a._members);
    pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

    pool.sort((a, b) => b._score - a._score);
    pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

    return pool.map((a) => ({
      kind: "anime",
      _key: `anime|${a.mal_id}`,
      title: a._title,
      image: a.image || "",
      year: a._year,
      members: a._members,
      score: a._score,
      type: a._type,

      // ✅ pour thèmes
      studio: a._studio || "",
      tags: Array.isArray(a._tags) ? a._tags : [],
      _year: a._year,
      _members: a._members,
      _score: a._score,
      _studio: a._studio || "",
      _tags: Array.isArray(a._tags) ? a._tags : [],
    }));
  }

  // songs mode
  const allowedSongs = [...document.querySelectorAll("#songPills .pill.active")].map((b) => b.dataset.song);
  if (allowedSongs.length === 0) return [];

  let pool = allSongs.filter(
    (s) => s.year >= yearMin && s.year <= yearMax && allowedTypes.includes(s.type) && allowedSongs.includes(s.songType)
  );

  pool.sort((a, b) => b.members - a.members);
  pool = pool.slice(0, Math.ceil(pool.length * (popPercent / 100)));

  pool.sort((a, b) => b.score - a.score);
  pool = pool.slice(0, Math.ceil(pool.length * (scorePercent / 100)));

  return pool;
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

  const pool = applyFilters();
  const duelsWanted = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);

  const ok = pool.length >= 2;
  const label = currentMode === "songs" ? "Songs" : "Animes";

  previewCountEl.textContent = ok
    ? `📚 ${label} disponibles : ${pool.length} (OK) — Duels demandés: ${duelsWanted}`
    : `📚 ${label} disponibles : ${pool.length} (Min 2)`;

  previewCountEl.classList.toggle("good", ok);
  previewCountEl.classList.toggle("bad", !ok);
  applyBtn.disabled = !ok;
  applyBtn.classList.toggle("disabled", !ok);
}

// ====== GAME UI ======
function resetDuelUI() {
  duelToken++;
  mediaToken++;

  stopVideo(leftVid);
  stopVideo(rightVid);

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  leftPick.disabled = false;
  rightPick.disabled = false;

  // ✅ reset feedback visuel
  [leftPick, rightPick].forEach((btn) => {
    btn.classList.remove("lor-chosen", "lor-loser", "lor-locked");
  });
}

function setupModeUI() {
  const isSongs = currentMode === "songs";
  volumeRow.style.display = isSongs ? "flex" : "none";
  if (isSongs) applyVolume();
}

function updateTopLabels() {
  roundLabel.textContent = `${modeLabel()} — Duel ${duelIndex} / ${totalDuels}`;
}

function updateThemeLabel() {
  if (!contentThemeLabel) return;
  const label = currentTheme?.label || "Libre";
  contentThemeLabel.textContent = `🎯 Thème contenu : ${label}`;
}

function updatePrompt() {
  promptLine.textContent = currentMode === "songs" ? "Choisis ton Song préféré" : "Choisis ton Anime préféré";
}

function showMediaForMode() {
  const isSongs = currentMode === "songs";
  leftImg.style.display = isSongs ? "none" : "block";
  rightImg.style.display = isSongs ? "none" : "block";
  leftVid.style.display = isSongs ? "block" : "none";
  rightVid.style.display = isSongs ? "block" : "none";
}

// ====== DUEL GENERATION (indépendant) ======
function generateNewDuelPair() {
  const basePool = applyFilters();
  if (!basePool || basePool.length < 2) return false;

  const pack = pickPairWithTheme(basePool, currentMode, allAnimes);
  if (!pack) return false;

  currentTheme = { crit: pack.theme.crit, label: pack.theme.label };
  leftItem = pack.left;
  rightItem = pack.right;
  return true;
}

function renderDuel() {
  updateTopLabels();
  updateThemeLabel();
  updatePrompt();
  showMediaForMode();

  // labels
  leftTitle.textContent = currentMode === "songs" ? formatSongTitle(leftItem) : (leftItem?.title || "");
  rightTitle.textContent = currentMode === "songs" ? formatSongTitle(rightItem) : (rightItem?.title || "");

  // anime: images
  if (currentMode === "anime") {
    leftImg.src = leftItem?.image || "";
    rightImg.src = rightItem?.image || "";
    resultDiv.textContent = "";
    nextBtn.style.display = "none";
    leftPick.disabled = false;
    rightPick.disabled = false;
    return;
  }

  // songs: 2 vidéos direct (droite démarre quand gauche finit)
  const localDuel = duelToken;
  const localMedia = mediaToken;

  let rightReady = false;
  let leftFinished = false;

  const startRightIfPossible = () => {
    if (localDuel !== duelToken || localMedia !== mediaToken) return;
    if (!leftFinished) return;
    if (!rightReady) return;

    applyVolume();
    rightVid.muted = false;

    const p = rightVid.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  // reset players
  [leftVid, rightVid].forEach((v) => {
    try { v.pause(); } catch {}
    v.ontimeupdate = null;
    v.onended = null;
    v.onplay = null;
    v.removeAttribute("src");
    v.load();
    v.muted = false;

    // pas de poster
    v.poster = "";
    v.removeAttribute("poster");
  });

  applyVolume();

  // LEFT
  if (leftItem?.url) {
    loadMediaWithRetries(leftVid, leftItem.url, localDuel, localMedia, {
      onReady: () => {
        if (localDuel !== duelToken || localMedia !== mediaToken) return;

        applyVolume();
        leftVid.muted = false;

        setupClipPlayback(leftVid, localDuel, localMedia, {
          autoplay: true,
          onDone: () => {
            if (localDuel !== duelToken || localMedia !== mediaToken) return;
            leftFinished = true;
            startRightIfPossible();
          },
        });
      },
    });
  } else {
    leftFinished = true;
  }

  // RIGHT
  if (rightItem?.url) {
    loadMediaWithRetries(rightVid, rightItem.url, localDuel, localMedia, {
      onReady: () => {
        if (localDuel !== duelToken || localMedia !== mediaToken) return;

        applyVolume();
        rightVid.muted = false;

        setupClipPlayback(rightVid, localDuel, localMedia, { autoplay: false });

        rightReady = true;
        startRightIfPossible();
      },
    });
  }

  resultDiv.textContent = "";
  nextBtn.style.display = "none";
  leftPick.disabled = false;
  rightPick.disabled = false;
}

function finishGame(message) {
  stopVideo(leftVid);
  stopVideo(rightVid);

  resultDiv.textContent = message;
  nextBtn.style.display = "block";
  nextBtn.textContent = "Retour réglages";
  nextBtn.onclick = () => {
    showCustomization();
    updatePreview();
  };
}

// ====== GAME FLOW ======
function startGame() {
  resetDuelUI();
  showGame();
  setupModeUI();

  totalDuels = clampInt(parseInt(roundCountEl.value || "10", 10), 1, 100);
  duelIndex = 1;

  const ok = generateNewDuelPair();
  if (!ok) {
    finishGame("❌ Pas assez d’items (min 2) avec ces réglages.");
    return;
  }

  renderDuel();
}

// ====== PICK ======
function handlePick(side) {
  if (!leftItem || !rightItem) return;

  leftPick.disabled = true;
  rightPick.disabled = true;

  // ✅ lock visuel + highlight choix
  leftPick.classList.add("lor-locked");
  rightPick.classList.add("lor-locked");

  const chosenBtn = side === "left" ? leftPick : rightPick;
  const otherBtn = side === "left" ? rightPick : leftPick;

  chosenBtn.classList.add("lor-chosen");
  otherBtn.classList.add("lor-loser");

  if (currentMode === "songs") {
    try { leftVid.pause(); } catch {}
    try { rightVid.pause(); } catch {}
  }

  const chosen = side === "left" ? leftItem : rightItem;
  resultDiv.textContent = `✅ Choix validé : ${currentMode === "songs" ? formatSongTitle(chosen) : (chosen.title || "")}`;

  // fin ?
  if (duelIndex >= totalDuels) {
    finishGame("✅ Terminé !");
    return;
  }

  nextBtn.style.display = "block";
  nextBtn.textContent = "Suivant";
  nextBtn.onclick = () => {
    duelIndex++;

    resetDuelUI();

    const ok = generateNewDuelPair();
    if (!ok) {
      finishGame("✅ Terminé (pas assez d’items pour continuer).");
      return;
    }

    renderDuel();
  };
}

// ====== LOAD DATA ======
fetch("../data/licenses_only.json")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    return r.json();
  })
  .then((json) => {
    const raw = normalizeAnimeList(json);

    allAnimes = (Array.isArray(raw) ? raw : []).map((a) => {
      const title = getDisplayTitle(a);
      const genres = extractTagNames(a.genres);
      const themes = extractTagNames(a.themes);
      const tags = [...genres, ...themes];

      return {
        ...a,
        _title: title,
        _year: getYear(a),
        _members: safeNum(a.members),
        _score: safeNum(a.score),
        _type: a.type || "Unknown",
        _studio: (typeof a.studio === "string" ? a.studio : (a.studio?.name || "")) || "",
        _tags: tags,
      };
    });

    allSongs = [];
    for (const a of allAnimes) allSongs.push(...extractSongsFromAnime(a));

    initCustomUI();
    updatePreview();
    showCustomization();
    applyVolume();
  })
  .catch((e) => {
    previewCountEl.textContent = "❌ Erreur chargement base : " + e.message;
    previewCountEl.classList.add("bad");
    applyBtn.disabled = true;
    applyBtn.classList.add("disabled");
    console.error(e);
  });
