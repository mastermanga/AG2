<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>🕵️‍♂️ Anidle</title>

  <link rel="icon" type="image/png" href="../images/favicon-32x32.png">
  <link rel="stylesheet" href="style.css" />
</head>
<body>

  <!-- HEADER -->
  <header>
    <button id="back-to-menu" class="menu-btn">⬅️ Menu</button>

    <h1>🕵️‍♂️ Guess the Anime 🕵️‍♂️</h1>

    <div class="header-right">
      <button id="themeToggle" class="toggle-btn">🌓</button>

      <span class="info-wrap header-help">
        <span class="info-icon" tabindex="0" aria-label="Aide" aria-describedby="help-anidle">
          <svg class="info-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor"
              d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm0 4.9a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5ZM10.9 11a1 1 0 0 1 1-1h.2a1 1 0 0 1 1 1v6a1 0 0 1-2 0v-6Z" />
          </svg>
        </span>

        <span class="info-tip" id="help-anidle" role="tooltip">
          Devine l’anime mystère grâce aux indices. Tu commences avec 3000 points :
          chaque tentative enlève 150 points et chaque indice coûte 300 points.
          Les indices utilisent un code couleur (vert = correct, orange = proche, rouge = faux).
          L’indice de score est orange s’il est à ±0,3.
          En utilisant un indice, les suggestions se filtrent pour t’aider à trouver la bonne réponse.
        </span>
      </span>
    </div>
  </header>

  <!-- ✅ PERSONNALISATION -->
  <div id="custom-panel">
    <h2><span class="gear">⚙️</span> Personnalisation</h2>

    <!-- Mode (prévu pour futur: layout déjà en place) -->
    <div class="opt-row">
      <div class="opt-label">Mode</div>
      <div class="opt-col">
        <div class="opt-pill-group" id="modePills">
          <button type="button" class="pill active" data-mode="anime" aria-pressed="true">Animes</button>
        </div>
      </div>
    </div>

    <!-- Popularité -->
    <div class="opt-row">
      <div class="opt-label">Popularité</div>
      <div class="opt-col">
        <input id="popPercent" type="range" min="5" max="100" step="5" value="30" />
        <div class="opt-value">Top <span id="popPercentVal">30</span>%</div>
      </div>
    </div>

    <!-- Score -->
    <div class="opt-row">
      <div class="opt-label">Score</div>
      <div class="opt-col">
        <input id="scorePercent" type="range" min="5" max="100" step="5" value="100" />
        <div class="opt-value">Top <span id="scorePercentVal">100</span>%</div>
      </div>
    </div>

    <!-- Années (double slider) -->
    <div class="opt-row">
      <div class="opt-label">Années</div>
      <div class="opt-col">
        <div class="year-row">
          <input id="yearMin" type="range" min="1950" max="2026" step="1" value="1950">
          <input id="yearMax" type="range" min="1950" max="2026" step="1" value="2026">
        </div>
        <div class="opt-value">
          <span id="yearMinVal">1950</span> → <span id="yearMaxVal">2026</span>
        </div>
      </div>
    </div>

    <!-- Types -->
    <div class="opt-row">
      <div class="opt-label">Types</div>
      <div class="opt-col">
        <div id="typePills" class="opt-pill-group">
          <button type="button" class="pill active" data-type="TV" aria-pressed="true">TV</button>
          <button type="button" class="pill active" data-type="Movie" aria-pressed="true">Movie</button>
          <button type="button" class="pill" data-type="OVA" aria-pressed="false">OVA</button>
          <button type="button" class="pill" data-type="ONA" aria-pressed="false">ONA</button>
          <button type="button" class="pill" data-type="Special" aria-pressed="false">Special</button>
        </div>
      </div>
    </div>

    <!-- Preview -->
    <div id="previewCount" class="preview-count bad">
      ⏳ Chargement de la base…
    </div>

    <!-- Rounds (1..100) -->
    <div class="opt-row rounds-row">
      <div class="opt-label">Rounds</div>
      <div class="opt-col rounds-col">
        <input id="roundCount" type="number" min="1" max="100" step="1" value="1" class="round-input" />
        <div class="round-hint">(1 à 100) — Enchaîne plusieurs parties avec la même config.</div>
      </div>
    </div>

    <!-- Start -->
    <div class="start-row">
      <button id="applyFiltersBtn" class="menu-btn start-btn" disabled>
        ✅ Lancer avec ces réglages
      </button>
    </div>
  </div>

  <!-- ✅ JEU (caché au départ) -->
  <div id="game-panel">
    <div id="container" class="main-container">
      <div class="game-layout">
        <div id="aideContainer" class="aide-container"></div>

        <div class="game-col">
          <div id="successContainer" style="display:none;"></div>

          <div class="input-container">
            <input
              type="text"
              id="animeInput"
              placeholder="Entrez le nom d'un anime..."
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="suggestions"
            />

            <div id="suggestions" class="suggestions" role="listbox" aria-label="Suggestions"></div>

            <div id="counter">Tentatives : 0 (-150)</div>

            <div id="score-bar-container">
              <div id="score-bar">
                <span id="score-bar-label"></span>
              </div>
            </div>
          </div>

          <!-- ✅ Indices alignés avec les colonnes du tableau -->
          <div class="indices-grid" id="indicesGrid" aria-label="Indices">
            <div class="indices-spacer" aria-hidden="true"></div>
            <div class="indices-spacer" aria-hidden="true"></div>

            <button id="btnIndiceSaison" class="indice-btn" disabled>Indice Année (-300)</button>
            <button id="btnIndiceStudio" class="indice-btn" disabled>Indice Studio (-300)</button>
            <button id="btnIndiceGenres" class="indice-btn" disabled>Indice Genres/Thèmes (-300)</button>
            <button id="btnIndiceScore" class="indice-btn" disabled>Indice Score (-300)</button>
          </div>

          <div id="results"></div>
        </div>
      </div>

      <canvas id="fireworks"></canvas>
    </div>
  </div>

  <footer>© 2025 mastermanga</footer>

  <script src="script.js"></script>
</body>
</html>
