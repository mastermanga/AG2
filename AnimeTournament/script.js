/* =========================
   Anime Tournament — style.css (COMPLET)
   - Theme indicator (contenu)
   - Songs snippet: géré JS
   ========================= */

/* ====== BACKGROUND ====== */
body {
  background: radial-gradient(circle at 50% 25%, #263859 0%, #121212 100%);
  background-color: #121212;
  color: #eee;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1rem;
  margin: 0;
  transition: background-color 0.3s, color 0.3s;
  position: relative;
  overflow-x: hidden;
}

body::before {
  content: "";
  position: fixed;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle, #00fff94d 2px, transparent 3px) 30vw 20vh/120px 120px repeat,
    radial-gradient(circle, #42a5f577 1.5px, transparent 3px) 70vw 75vh/90px 90px repeat;
  animation: moveParticles 18s linear infinite alternate;
  opacity: 0.24;
}
@keyframes moveParticles {
  0%   { background-position: 30vw 20vh, 70vw 75vh; }
  100% { background-position: 33vw 22vh, 68vw 78vh; }
}

/* ====== HEADER ====== */
header {
  max-width: 1200px;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.2rem;
  margin-left: auto;
  margin-right: auto;
  padding: 0 1rem;
  z-index: 2;
  position: relative;
}

header h1 {
  font-size: 2rem;
  text-align: center;
  flex-grow: 1;
  margin: 0 1rem;
  letter-spacing: 1px;
  font-weight: 800;
  text-shadow:
    0 0 6px #00eaff,
    0 0 18px #00eaff99,
    0 2px 8px #00bcd477,
    0 0 10px #fff1;
}

.header-right{
  display:inline-flex;
  align-items:center;
  gap:10px;
  flex-shrink:0;
}

/* ====== BUTTONS ====== */
.menu-btn,
.toggle-btn {
  background: linear-gradient(120deg, #00bcd4 75%, #1e88e5 100%);
  color: #fff;
  border: none;
  padding: 0.54rem 1.05rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: bold;
  font-size: 1.12rem;
  box-shadow: 0 1px 7px #00bcd466;
  transition:
    background 0.21s,
    color 0.16s,
    box-shadow 0.18s,
    border 0.16s,
    transform 0.14s;
  outline: none;
}
.menu-btn:hover, .menu-btn:focus,
.toggle-btn:hover, .toggle-btn:focus {
  background: linear-gradient(120deg, #1de9b6 80%, #1565c0 100%);
  color: #fff;
  text-shadow: 0 0 10px #fff9, 0 2px 6px #fff8;
  box-shadow: 0 10px 34px #00eaffd7, 0 2.5px 14px #1976d277;
  border: 2px solid #fff5;
  transform: translateY(-2px);
}

/* ====== LIGHT MODE ====== */
body.light {
  background-color: #f5f5f5;
  color: #222;
}
body.light .menu-btn,
body.light .toggle-btn {
  background: linear-gradient(120deg, #42a5f5 70%, #00bcd4 100%);
  color: #f5f5f5;
}
body.light .menu-btn:hover,
body.light .toggle-btn:hover {
  background: linear-gradient(120deg, #81d4fa 70%, #1976d2 100%);
  color: #fff;
  text-shadow: 0 0 8px #fff9;
  border: 2px solid #1976d277;
}

/* ====== GENERIC BLOCK ====== */
.main-block {
  max-width: 1500px;
  width: 98vw;
  background: #161e27ef;
  border-radius: 20px;
  box-shadow: 0 0 32px 5px #00bcd444;
  border: 1.5px solid #00bcd455;
  padding: 2rem 2.1rem 2.1rem 2.1rem;
  margin-left: auto;
  margin-right: auto;
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
  position: relative;
  z-index: 2;
  transition: background 0.25s;
}

body.light .main-block {
  background: linear-gradient(120deg, #e0f7fa 90%, #1565c01a 100%);
  box-shadow: 0 2px 14px #42a5f54b;
  border: 1.5px solid #42a5f577;
}

/* =========================================
   PERSONNALISATION
   ========================================= */
#custom-panel{
  background: #161e27ee;
  border-radius: 22px;
  box-shadow: 0 0 32px 5px #00bcd466;
  border: 1.5px solid rgba(0,188,212,0.25);

  max-width: 1500px;
  width: 98vw;
  margin: 0 auto 1.2rem auto;
  padding: 2.0rem 2.2rem;

  position: relative;
  z-index: 2;
}

#custom-panel h2{
  margin: 0 0 1.2rem 0;
  text-align: center;
  font-size: 2.0rem;
  font-weight: 900;
  text-shadow: 0 0 10px #00eaff55;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #fff;
}

#custom-panel .gear{
  font-size: 1.4rem;
  filter: drop-shadow(0 0 10px rgba(0,234,255,0.25));
}

.opt-row{
  width: 100%;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-top: 14px;
}

.opt-label{
  font-weight: 900;
  min-width: 160px;
  opacity: 0.95;
}

.opt-col{
  flex: 1;
  min-width: 280px;
}

.opt-value{
  margin-top: 6px;
  font-weight: 900;
  opacity: 0.92;
  text-align: right;
}

#custom-panel input[type="range"]{
  width: 100%;
  appearance: none;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, #00bcd4 0%, #ffffff 75%);
  outline: none;
  box-shadow: 0 1px 10px rgba(0, 188, 212, 0.18);
}
#custom-panel input[type="range"]::-webkit-slider-thumb{
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #0fbcd4;
  border: 2px solid rgba(255,255,255,0.6);
  box-shadow: 0 0 14px rgba(0, 234, 255, 0.55);
  cursor: pointer;
}
#custom-panel input[type="range"]::-moz-range-thumb{
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #0fbcd4;
  border: 2px solid rgba(255,255,255,0.6);
  box-shadow: 0 0 14px rgba(0, 234, 255, 0.55);
  cursor: pointer;
}

.year-row{
  display: flex;
  gap: 14px;
  align-items: center;
}

.opt-pill-group{
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.pill{
  border: 1.5px solid rgba(0, 188, 212, 0.55);
  background: rgba(0, 0, 0, 0.22);
  color: #eaffff;
  padding: 10px 16px;
  border-radius: 999px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s, border-color 0.15s, opacity 0.15s;
  user-select: none;
}
.pill:hover{
  transform: translateY(-1px);
  box-shadow: 0 0 16px rgba(0, 234, 255, 0.22);
}
.pill.active{
  background: linear-gradient(120deg, rgba(0,188,212,0.65), rgba(30,136,229,0.55));
  border-color: rgba(0, 234, 255, 0.85);
  box-shadow: 0 0 18px rgba(0, 234, 255, 0.35);
}

.preview-count{
  margin-top: 16px;
  width: 100%;
  font-weight: 900;
  text-align: center;
  padding: 12px 12px;
  border-radius: 14px;
  border: 1px solid #00bcd455;
  background: rgba(0,0,0,0.15);
}
.preview-count.good{
  border-color: rgba(38, 255, 128, 0.35);
  box-shadow: 0 0 16px rgba(38,255,128,0.12);
}
.preview-count.bad{
  border-color: rgba(255, 80, 80, 0.35);
  box-shadow: 0 0 16px rgba(255,80,80,0.10);
}

.rounds-col{
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}
.round-input{
  width: 110px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1.5px solid rgba(0, 188, 212, 0.55);
  background: rgba(0, 0, 0, 0.25);
  color: #eaffff;
  font-weight: 900;
  outline: none;
  box-shadow: 0 0 10px rgba(0, 188, 212, 0.12);
}
.round-hint{
  opacity: 0.85;
  font-weight: 700;
  font-size: 0.95rem;
  text-align: right;
}

.start-row{
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
.start-btn{
  font-size: 1.08rem;
  padding: 0.95rem 1.7rem;
}
#applyFiltersBtn:disabled{
  opacity: 0.45 !important;
  cursor: not-allowed !important;
  filter: grayscale(0.2) brightness(0.9);
  box-shadow: none !important;
}

/* Light mode for panel */
body.light #custom-panel{
  background: #fff;
  box-shadow: 0 0 18px #42a5f555;
  border: 1.5px solid rgba(66,165,245,0.45);
}
body.light #custom-panel h2 { color: #1976d2; }
body.light .pill{
  background: rgba(255,255,255,0.65);
  color: #0b1a2a;
  border-color: rgba(25,118,210,0.35);
}
body.light .pill.active{
  background: linear-gradient(120deg, rgba(66,165,245,0.7), rgba(0,188,212,0.45));
  border-color: rgba(25,118,210,0.55);
}
body.light .round-input{
  background: #f8faff;
  color: #0b1a2a;
  border-color: rgba(25,118,210,0.35);
}

/* =========================================
   PANEL vs GAME
   ========================================= */
#game-panel { display: none; width: 100%; }

body.game-started #custom-panel { display: none !important; }
body.game-started #game-panel  { display: block !important; }

body:not(.game-started) #round-indicator,
body:not(.game-started) #theme-indicator,
body:not(.game-started) #volumeBar,
body:not(.game-started) #duel-container,
body:not(.game-started) #next-match-btn,
body:not(.game-started) #classement {
  display: none !important;
}

/* =========================================
   INDICATEUR DE ROUND
   ========================================= */
#round-indicator {
  max-width: 520px;
  width: min(92vw, 520px);
  padding: 0.9rem 1.2rem;
  margin: 0 auto 0.6rem auto;

  display: flex;
  align-items: center;
  justify-content: center;

  font-weight: 900;
  font-size: 1.08rem;
  letter-spacing: 0.6px;
  text-align: center;

  background: linear-gradient(120deg, rgba(22, 30, 39, 0.92) 70%, rgba(0, 188, 212, 0.10) 100%);
  border: 1.5px solid #00bcd455;
  box-shadow: 0 0 22px 3px #00bcd433;
  border-radius: 16px;
  user-select: none;
  z-index: 2;
  position: relative;
}

body.light #round-indicator {
  background: linear-gradient(120deg, #e0f7fa 80%, #1565c01a 100%);
  border: 1.5px solid #42a5f577;
  box-shadow: 0 2px 14px #42a5f54b;
}

/* ✅ THEME INDICATOR */
#theme-indicator{
  max-width: 920px;
  width: min(92vw, 920px);
  margin: 0 auto 0.8rem auto;
  padding: 10px 14px;
  border-radius: 14px;

  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;

  font-weight: 900;
  opacity: 0.95;

  background: rgba(22, 30, 39, 0.88);
  border: 1.5px solid rgba(0,188,212,0.28);
  box-shadow: 0 0 22px 3px rgba(0,188,212,0.16);
  position: relative;
  z-index: 2;
}

body.light #theme-indicator{
  background: #ffffff;
  border: 1.5px solid rgba(66,165,245,0.45);
  box-shadow: 0 0 18px #42a5f555;
  color: #0b1a2a;
}

/* =========================================
   VOLUME BAR
   ========================================= */
.volume-bar{
  max-width: 920px;
  width: min(92vw, 920px);
  margin: 0 auto 0.8rem auto;
  padding: 10px 14px;
  border-radius: 14px;

  display: flex;
  align-items: center;
  gap: 14px;

  background: rgba(22, 30, 39, 0.88);
  border: 1.5px solid rgba(0,188,212,0.28);
  box-shadow: 0 0 22px 3px rgba(0,188,212,0.18);
  position: relative;
  z-index: 2;
}

.volume-left{
  display:flex;
  align-items:center;
  gap:10px;
  font-weight: 900;
  opacity: 0.95;
  min-width: 120px;
}

.vol-icon{ font-size: 1.1rem; }
.vol-text{ font-size: 1.05rem; }

.volume-right{
  font-weight: 900;
  opacity: 0.95;
  min-width: 60px;
  text-align: right;
}

#volumeSlider{
  flex: 1;
  appearance: none;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, #00bcd4 0%, #ffffff 75%);
  outline: none;
  box-shadow: 0 1px 10px rgba(0, 188, 212, 0.18);
}
#volumeSlider::-webkit-slider-thumb{
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #0fbcd4;
  border: 2px solid rgba(255,255,255,0.6);
  box-shadow: 0 0 14px rgba(0, 234, 255, 0.55);
  cursor: pointer;
}
#volumeSlider::-moz-range-thumb{
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #0fbcd4;
  border: 2px solid rgba(255,255,255,0.6);
  box-shadow: 0 0 14px rgba(0, 234, 255, 0.55);
  cursor: pointer;
}

body.light .volume-bar{
  background: #ffffff;
  border: 1.5px solid rgba(66,165,245,0.45);
  box-shadow: 0 0 18px #42a5f555;
}
body.light .volume-left,
body.light .volume-right { color: #0b1a2a; }

/* =========================================
   DUEL — 2 COLONNES
   ========================================= */
#duel-container {
  width: min(1600px, 98vw);
  margin: 0 auto 1.2rem auto;
  z-index: 2;
  position: relative;

  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.8rem;
  align-items: start;
}

/* cartes */
#duel-container .anime,
#duel-container .opening {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: stretch;
  justify-content: flex-start;
  min-width: 0;
  padding: 0.6rem;
  border-radius: 16px;
  background: rgba(0,0,0,0.10);
  border: 1px solid rgba(0,188,212,0.18);
  box-shadow: 0 0 18px rgba(0, 188, 212, 0.10);
  overflow: hidden;
}

/* image */
#duel-container .anime img {
  width: 100%;
  height: clamp(240px, 38vw, 460px);
  object-fit: contain;
  object-position: center;
  border-radius: 12px;
  background: #000;
  box-shadow: 0 0 18px #1116;
}

/* vidéo */
#duel-container .opening video {
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  border-radius: 12px;
  background: #000;
  box-shadow: 0 0 18px #1116;
}

.videoStatus {
  font-weight: 900;
  opacity: 0.9;
  font-size: 0.92rem;
  padding: 2px 2px 0 2px;
}

/* TITRES */
#duel-container .vote-title {
  cursor: pointer;
  background: #00bcd4;
  color: #121212;
  border-radius: 10px;
  margin: 0;
  padding: 0.62em 0.85em;

  font-size: clamp(0.86rem, 1.05vw, 0.98rem);
  font-weight: 900;
  letter-spacing: 0.01em;

  transition: background 0.14s, color 0.14s, box-shadow 0.14s, transform 0.12s;
  user-select: none;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  text-align: center;
  line-height: 1.22;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;

  box-shadow: 0 2px 10px rgba(0,188,212,0.18);
}

#duel-container .vote-title:hover,
#duel-container .vote-title:focus {
  background: #0097a7;
  color: #fff;
  box-shadow: 0 4px 14px rgba(0,188,212,0.32);
  text-decoration: underline;
  outline: none;
  transform: translateY(-1px);
}

#duel-container .vote-title:active {
  background: #007888;
  color: #fff;
  box-shadow: 0 2px 10px rgba(0,188,212,0.25);
  transform: translateY(0);
}

/* =========================================
   BOUTON REJOUER
   ========================================= */
#next-match-btn {
  display: none;
  margin: 0 auto 2.0rem auto;
  padding: 1rem 2.5rem;
  font-size: 1.17rem;
  border-radius: 10px;
  background: #00bcd4;
  color: #121212;
  font-weight: bold;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 16px #00bcd444;
  transition: background 0.2s, color 0.2s, box-shadow 0.18s;
  z-index: 2;
  position: relative;
}
#next-match-btn:hover {
  background: #0097a7;
  color: #fff;
  box-shadow: 0 6px 22px #00bcd480;
}
body.light #next-match-btn {
  background: #1565c0;
  color: #fff;
}
body.light #next-match-btn:hover {
  background: #0d47a1;
  color: #fff;
}

/* =========================================
   CLASSEMENT
   ========================================= */
#classement {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 2.2rem 2rem;
  justify-items: center;
  align-items: start;
  margin: 2rem 0 3rem 0;
  width: 100%;
  max-width: 1150px;
  overflow-x: visible;
  padding-top: 60px;
  position: relative;
  z-index: 2;
}
#classement:empty { display: none; }

.classement-item {
  position: relative;
  background: none;
  padding: 0.2rem 0 0.5rem 0;
  border-radius: 12px;
  transition: box-shadow 0.17s, transform 0.14s;
  box-shadow: 0 0 0px #00bcd400;
}

.classement-item img,
.classement-item video {
  width: 100%;
  height: 210px;
  object-fit: contain;
  background: #000;
  border-radius: 8px;
  margin-bottom: 0.8em;
  box-shadow: 0 0 18px #1116;
}

.classement-item:hover {
  transform: translateY(-5px) scale(1.04);
  box-shadow: 0 6px 28px #00bcd4cc;
}

.classement-item .rank {
  position: absolute;
  left: 14px;
  top: 14px;
  background: #00bcd4;
  color: #111;
  border-radius: 9px;
  font-weight: bold;
  font-size: 1.12rem;
  padding: 0.14em 1.2em;
  box-shadow: 0 1px 6px #1113;
  z-index: 4;
  border: 2px solid #fff7;
  min-width: 44px;
  text-align: center;
}

.classement-item .title {
  font-weight: 900;
  text-align: center;
  color: #fff;
  margin-top: 0.1em;
  font-size: 1.03rem;
  min-height: 2.1em;
}
body.light .classement-item .title { color: #222; }

/* =========================================
   TITRE + TOOLTIP
   ========================================= */
.tournament-title {
  padding: 0 0.5em;
  white-space: nowrap;
}

/* Tooltip help */
.info-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.info-icon {
  width: 26px; height: 26px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(18, 30, 39, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 10px rgba(0, 234, 255, 0.55), 0 0 24px rgba(0, 188, 212, 0.35), inset 0 0 0 1px rgba(0, 234, 255, 0.18);
  color: #eaffff; cursor: help; user-select: none;
  transition: transform 0.16s, box-shadow 0.16s, background 0.16s, border-color 0.16s;
}
.info-svg { width: 18px; height: 18px; display: block; }
.info-wrap:hover .info-icon, .info-icon:focus {
  transform: scale(1.08) rotate(-6deg);
  background: rgba(10, 18, 26, 0.72);
  border-color: rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 12px rgba(0, 234, 255, 0.9), 0 0 32px rgba(0, 234, 255, 0.55), inset 0 0 0 1px rgba(0, 234, 255, 0.25);
  outline: none;
}
.info-tip {
  position: absolute; top: calc(100% + 10px); right: 0;
  transform: translateY(-6px) scale(0.98);
  width: 340px; padding: 10px 12px; border-radius: 14px;
  background: linear-gradient(120deg, #233554f3 80%, #00bcd422 100%);
  border: 1.5px solid #00bcd455;
  box-shadow: 0 10px 34px rgba(0, 234, 255, 0.32), 0 2.5px 14px rgba(25, 118, 210, 0.25);
  color: #fff;
  font-size: 0.95rem; font-weight: 600; line-height: 1.25; letter-spacing: 0.1px;
  opacity: 0; visibility: hidden;
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
  z-index: 9999; pointer-events: none;
}
.info-tip::after {
  content: ""; position: absolute; top: -7px; right: 10px;
  border-width: 0 7px 7px 7px; border-style: solid;
  border-color: transparent transparent #233554f3 transparent;
  filter: drop-shadow(0 2px 2px rgba(0, 234, 255, 0.18));
}
.info-wrap:hover .info-tip,
.info-wrap:focus-within .info-tip,
.info-wrap.open .info-tip {
  opacity: 1; visibility: visible; transform: translateY(0) scale(1);
}

/* ====== FOOTER ====== */
footer {
  padding: 1.2rem 0 0.4rem 0;
  color: #555;
  font-size: 0.95rem;
  text-align: center;
  user-select: none;
  width: 100%;
  max-width: 370px;
  margin-left: auto;
  margin-right: auto;
  transition: color 0.3s;
  z-index: 2;
  position: relative;
}
body.light footer { color: #888; }

/* =========================================
   RESPONSIVE
   ========================================= */
@media (max-width: 980px) {
  #duel-container { gap: 1.6rem; }
}

@media (max-width: 820px) {
  #duel-container { grid-template-columns: 1fr; }
  header h1 { font-size: 1.55rem; }
  .info-tip { width: min(340px, 86vw); right: 0; }
  .volume-left{ min-width: 92px; }
}

@media (max-width: 500px) {
  .main-block { padding: 1.1rem 0.8rem 1.4rem 0.8rem; }
  #custom-panel { padding: 1.3rem 1rem; }
}
