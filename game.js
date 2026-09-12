'use strict';

const SIZE = 10;

const FLEET = [
  { size: 4, name: 'ship4' },
  { size: 3, name: 'ship3' },
  { size: 3, name: 'ship3' },
  { size: 2, name: 'ship2' },
  { size: 2, name: 'ship2' },
  { size: 2, name: 'ship2' },
  { size: 1, name: 'ship1' },
  { size: 1, name: 'ship1' },
  { size: 1, name: 'ship1' },
  { size: 1, name: 'ship1' }
];

const inBoard = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const key = (r, c) => r * SIZE + c;

function neighbours(r, c, diagonal) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (!diagonal && dr !== 0 && dc !== 0) continue;
      if (inBoard(r + dr, c + dc)) out.push({ r: r + dr, c: c + dc });
    }
  }
  return out;
}

class Board {
  constructor() {
    this.ships = [];
    this.cellShip = new Map(); // cell key -> ship
    this.shots = new Map();    // cell key -> 'hit' | 'miss'
  }

  shipAt(r, c) {
    return this.cellShip.get(key(r, c)) || null;
  }

  cellsFor(r, c, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const cr = horizontal ? r : r + i;
      const cc = horizontal ? c + i : c;
      cells.push({ r: cr, c: cc });
    }
    return cells;
  }

  canPlace(cells) {
    return cells.every(({ r, c }) => {
      if (!inBoard(r, c)) return false;
      if (this.cellShip.has(key(r, c))) return false;
      return neighbours(r, c, true).every(n => !this.cellShip.has(key(n.r, n.c)));
    });
  }

  place(cells, nameKey) {
    const ship = { nameKey, size: cells.length, cells, hits: 0, sunk: false };
    this.ships.push(ship);
    cells.forEach(({ r, c }) => this.cellShip.set(key(r, c), ship));
    return ship;
  }

  clear() {
    this.ships = [];
    this.cellShip.clear();
    this.shots.clear();
  }

  fire(r, c) {
    const k = key(r, c);
    if (this.shots.has(k)) return { repeat: true };
    const ship = this.cellShip.get(k);
    if (!ship) {
      this.shots.set(k, 'miss');
      return { hit: false };
    }
    this.shots.set(k, 'hit');
    ship.hits++;
    if (ship.hits === ship.size) ship.sunk = true;
    return { hit: true, ship, sunk: ship.sunk };
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every(s => s.sunk);
  }

  randomize() {
    for (let attempt = 0; attempt < 200; attempt++) {
      this.clear();
      let ok = true;
      for (const spec of FLEET) {
        if (!this.placeRandomShip(spec)) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  placeRandomShip(spec) {
    const options = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        for (const horizontal of [true, false]) {
          if (spec.size === 1 && !horizontal) continue;
          const cells = this.cellsFor(r, c, spec.size, horizontal);
          if (this.canPlace(cells)) options.push(cells);
        }
      }
    }
    if (!options.length) return false;
    const cells = options[Math.floor(Math.random() * options.length)];
    this.place(cells, spec.name);
    return true;
  }
}

class AI {
  constructor(difficulty) {
    this.difficulty = difficulty;
    this.tried = new Set();
    this.excluded = new Set();
    this.targetHits = [];
  }

  candidatesFromTarget(board) {
    if (!this.targetHits.length) return [];
    const usable = ({ r, c }) => inBoard(r, c) && !this.tried.has(key(r, c));
    if (this.targetHits.length === 1) {
      const { r, c } = this.targetHits[0];
      return neighbours(r, c, false).filter(usable);
    }
    const sameRow = this.targetHits.every(h => h.r === this.targetHits[0].r);
    const sorted = this.targetHits.slice().sort((a, b) => (sameRow ? a.c - b.c : a.r - b.r));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const ends = sameRow
      ? [{ r: first.r, c: first.c - 1 }, { r: last.r, c: last.c + 1 }]
      : [{ r: first.r - 1, c: first.c }, { r: last.r + 1, c: last.c }];
    return ends.filter(usable);
  }

  huntCandidates(board) {
    const free = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const k = key(r, c);
        if (this.tried.has(k) || this.excluded.has(k)) continue;
        free.push({ r, c });
      }
    }
    if (this.difficulty === 'easy') return free;
    const smallest = Math.min(...board.ships.filter(s => !s.sunk).map(s => s.size));
    if (smallest >= 2) {
      const parity = free.filter(({ r, c }) => (r + c) % 2 === 0);
      if (parity.length) return parity;
    }
    return free;
  }

  nextShot(board) {
    let pool = this.difficulty === 'easy' ? [] : this.candidatesFromTarget(board);
    if (!pool.length) {
      this.targetHits = [];
      pool = this.huntCandidates(board);
    }
    if (!pool.length) {
      // fall back to any untried cell (should not normally happen)
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (!this.tried.has(key(r, c))) pool.push({ r, c });
        }
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  record(shot, result) {
    this.tried.add(key(shot.r, shot.c));
    if (this.difficulty === 'easy') return;
    if (result.hit) {
      this.targetHits.push(shot);
      if (result.sunk) {
        result.ship.cells.forEach(({ r, c }) => {
          neighbours(r, c, true).forEach(n => this.excluded.add(key(n.r, n.c)));
        });
        this.targetHits = [];
      }
    }
  }
}

// ---------------------------------------------------------------- sound

let audioCtx = null;
function beep(freq, duration, type) {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (err) {
    /* audio is optional */
  }
}

// ---------------------------------------------------------------- i18n

const I18N = {
  pl: {
    documentTitle: 'Statki',
    subtitle: 'Polska wersja gry w statki — 1 czteromasztowiec, 2 trójmasztowce, 3 dwumasztowce, 4 jednomasztowce',
    language: 'Język:',
    setupTitle: 'Rozstawienie floty',
    randomize: 'Losuj moją flotę',
    clear: 'Wyczyść',
    start: 'Rozpocznij grę',
    aiLevel: 'Poziom AI:',
    hard: 'Trudny (hunt & target)',
    easy: 'Łatwy (losowy)',
    yourFleet: 'Twoja flota',
    enemyWaters: 'Wody wroga',
    yourBoard: 'Twoja plansza',
    enemyBoard: 'Plansza przeciwnika',
    logTitle: 'Dziennik strzałów',
    scoreTitle: 'Wynik',
    scoreYou: 'Ty',
    scoreComputer: 'Komputer',
    scoreHits: 'Trafienia',
    scoreMisses: 'Pudła',
    scoreAccuracy: 'Skuteczność',
    scoreSunk: 'Zatopione statki',
    scoreFleetLeft: 'Pozostała flota',
    playAgain: 'Zagraj ponownie',
    rotate: dir => `Obróć (R): ${dir === 'h' ? 'poziomo' : 'pionowo'}`,
    ship4: 'czteromasztowiec',
    ship3: 'trójmasztowiec',
    ship2: 'dwumasztowiec',
    ship1: 'jednomasztowiec',
    placeNext: (name, size) => `Ustaw: ${name} (${size} pola). Klawisz R obraca statek.`,
    placementInvalid: 'Nieprawidłowe ustawienie — statki nie mogą się stykać, nawet rogami.',
    allPlaced: 'Cała flota rozstawiona. Kliknij „Rozpocznij grę”.',
    statusPlace: 'Rozstaw swoją flotę.',
    statusReady: 'Flota gotowa — możesz rozpocząć grę.',
    statusIllegal: 'Nie można tu postawić statku (poza planszą, nachodzi lub dotyka innego statku).',
    statusYourTurn: 'Twoja tura — strzelaj na wodach wroga.',
    statusAlreadyShot: 'Tu już strzelałeś — wybierz inne pole.',
    statusYouHit: 'Trafiony! Strzelasz jeszcze raz.',
    statusYouSank: name => `Trafiony zatopiony! Zatopiłeś ${name}. Strzelaj dalej!`,
    statusYouMiss: 'Pudło — tura komputera.',
    statusAiHit: where => `Komputer trafił twój statek na ${where} i strzela ponownie.`,
    statusAiSank: (name, where) => `Komputer zatopił twój ${name} (${where})!`,
    statusAiMiss: where => `Komputer spudłował na ${where} — twoja tura.`,
    statusWin: 'Wygrałeś!',
    statusLose: 'Przegrałeś.',
    overlayWinTitle: 'Zwycięstwo!',
    overlayWinText: 'Zatopiłeś całą flotę przeciwnika.',
    overlayLoseTitle: 'Porażka',
    overlayLoseText: 'Komputer zatopił całą twoją flotę.',
    logStart: 'Gra rozpoczęta.',
    logYouHit: where => `Ty ${where}: trafiony.`,
    logYouSank: (where, name) => `Ty ${where}: trafiony zatopiony (${name}).`,
    logYouMiss: where => `Ty ${where}: pudło.`,
    logAiHit: where => `Komputer ${where}: trafiony.`,
    logAiSank: (where, name) => `Komputer ${where}: trafiony zatopiony (${name}).`,
    logAiMiss: where => `Komputer ${where}: pudło.`,
    logWin: 'Koniec gry — wygrana gracza.',
    logLose: 'Koniec gry — wygrana komputera.'
  },
  en: {
    documentTitle: 'Statki — Battleship',
    subtitle: 'Polish Battleship rules — 1 four-cell ship, 2 three-cell, 3 two-cell, 4 one-cell',
    language: 'Language:',
    setupTitle: 'Fleet placement',
    randomize: 'Randomize my fleet',
    clear: 'Clear',
    start: 'Start game',
    aiLevel: 'AI level:',
    hard: 'Hard (hunt & target)',
    easy: 'Easy (random)',
    yourFleet: 'Your fleet',
    enemyWaters: 'Enemy waters',
    yourBoard: 'Your board',
    enemyBoard: "Enemy board",
    logTitle: 'Shot log',
    scoreTitle: 'Score',
    scoreYou: 'You',
    scoreComputer: 'Computer',
    scoreHits: 'Hits',
    scoreMisses: 'Misses',
    scoreAccuracy: 'Accuracy',
    scoreSunk: 'Ships sunk',
    scoreFleetLeft: 'Fleet left',
    playAgain: 'Play again',
    rotate: dir => `Rotate (R): ${dir === 'h' ? 'horizontal' : 'vertical'}`,
    ship4: 'four-cell ship',
    ship3: 'three-cell ship',
    ship2: 'two-cell ship',
    ship1: 'one-cell ship',
    placeNext: (name, size) => `Place: ${name} (${size} cells). Press R to rotate.`,
    placementInvalid: 'Invalid placement — ships may not touch, not even at the corners.',
    allPlaced: 'Whole fleet placed. Click “Start game”.',
    statusPlace: 'Place your fleet.',
    statusReady: 'Fleet ready — you can start the game.',
    statusIllegal: 'You cannot place a ship here (off-board, overlapping or touching another ship).',
    statusYourTurn: 'Your turn — fire at the enemy waters.',
    statusAlreadyShot: 'You already fired here — pick another cell.',
    statusYouHit: 'You hit a ship! Fire again.',
    statusYouSank: name => `Hit and sunk! You sank the enemy ${name}. Fire again!`,
    statusYouMiss: "Miss — enemy's turn.",
    statusAiHit: where => `Computer hit your ship at ${where} and fires again.`,
    statusAiSank: (name, where) => `Computer sank your ${name} (${where})!`,
    statusAiMiss: where => `Computer missed at ${where} — your turn.`,
    statusWin: 'You won!',
    statusLose: 'You lost.',
    overlayWinTitle: 'Victory!',
    overlayWinText: "You sank the enemy's entire fleet.",
    overlayLoseTitle: 'Defeat',
    overlayLoseText: 'The computer sank your entire fleet.',
    logStart: 'Game started.',
    logYouHit: where => `You ${where}: hit.`,
    logYouSank: (where, name) => `You ${where}: hit and sunk (${name}).`,
    logYouMiss: where => `You ${where}: miss.`,
    logAiHit: where => `Computer ${where}: hit.`,
    logAiSank: (where, name) => `Computer ${where}: hit and sunk (${name}).`,
    logAiMiss: where => `Computer ${where}: miss.`,
    logWin: 'Game over — player wins.',
    logLose: 'Game over — computer wins.'
  }
};

let lang = 'pl';

// Arguments wrapped with tr() are translated lazily, so stored messages (status line, shot log)
// follow language switches instead of freezing the wording used when they were produced.
const tr = key => ({ i18nKey: key });

function t(key, ...args) {
  const value = I18N[lang][key];
  if (typeof value !== 'function') return value;
  return value(...args.map(a => (a && a.i18nKey ? t(a.i18nKey) : a)));
}

// ---------------------------------------------------------------- game

const els = {
  playerBoard: document.getElementById('player-board'),
  enemyBoard: document.getElementById('enemy-board'),
  status: document.getElementById('status'),
  rotate: document.getElementById('rotate-btn'),
  random: document.getElementById('random-btn'),
  resetPlacement: document.getElementById('reset-placement-btn'),
  start: document.getElementById('start-btn'),
  difficulty: document.getElementById('difficulty'),
  language: document.getElementById('language'),
  fleetList: document.getElementById('fleet-list'),
  setup: document.getElementById('setup'),
  placementInfo: document.getElementById('placement-info'),
  log: document.getElementById('log'),
  overlay: document.getElementById('overlay'),
  score: {
    hitsPlayer: document.getElementById('score-hits-player'),
    hitsAi: document.getElementById('score-hits-ai'),
    missesPlayer: document.getElementById('score-misses-player'),
    missesAi: document.getElementById('score-misses-ai'),
    accuracyPlayer: document.getElementById('score-accuracy-player'),
    accuracyAi: document.getElementById('score-accuracy-ai'),
    sunkPlayer: document.getElementById('score-sunk-player'),
    sunkAi: document.getElementById('score-sunk-ai'),
    leftPlayer: document.getElementById('score-left-player'),
    leftAi: document.getElementById('score-left-ai')
  },
  overlayTitle: document.getElementById('overlay-title'),
  overlayText: document.getElementById('overlay-text'),
  playAgain: document.getElementById('play-again-btn')
};

const state = {
  phase: 'placement', // placement | playing | over
  horizontal: true,
  placedCount: 0,
  player: new Board(),
  enemy: new Board(),
  ai: new AI('hard'),
  busy: false,
  statusMsg: ['statusPlace'],
  overlayMsg: null,
  logEntries: []
};

const playerCells = [];
const enemyCells = [];

function buildBoards() {
  [[els.playerBoard, playerCells], [els.enemyBoard, enemyCells]].forEach(([container, store]) => {
    container.innerHTML = '';
    store.length = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.setAttribute('aria-label', coordName(r, c));
        container.appendChild(cell);
        store.push(cell);
      }
    }
  });

  els.playerBoard.addEventListener('click', onPlayerBoardClick);
  els.playerBoard.addEventListener('mouseover', onPlayerBoardHover);
  els.playerBoard.addEventListener('mouseleave', clearPreview);
  els.enemyBoard.addEventListener('click', onEnemyBoardClick);
}

function cellFrom(event) {
  const target = event.target.closest('.cell');
  if (!target) return null;
  return { r: Number(target.dataset.r), c: Number(target.dataset.c), el: target };
}

function nextSpec() {
  return FLEET[state.placedCount] || null;
}

function coordName(r, c) {
  return `${String.fromCharCode(65 + c)}${r + 1}`;
}

function setStatus(key, ...args) {
  state.statusMsg = [key, ...args];
  els.status.textContent = t(key, ...args);
}

function addLog(key, ...args) {
  state.logEntries.push([key, ...args]);
  const li = document.createElement('li');
  li.textContent = t(key, ...args);
  els.log.appendChild(li);
  els.log.scrollTop = els.log.scrollHeight;
}

function renderLog() {
  els.log.innerHTML = '';
  state.logEntries.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = t(...entry);
    els.log.appendChild(li);
  });
  els.log.scrollTop = els.log.scrollHeight;
}

function applyLanguage(next) {
  lang = I18N[next] ? next : 'pl';
  document.documentElement.lang = lang;
  document.title = t('documentTitle');
  els.language.value = lang;
  try { localStorage.setItem('statki-lang', lang); } catch (err) { /* storage optional */ }

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  els.playerBoard.setAttribute('aria-label', t('yourBoard'));
  els.enemyBoard.setAttribute('aria-label', t('enemyBoard'));
  els.rotate.textContent = t('rotate', state.horizontal ? 'h' : 'v');
  setStatus(...state.statusMsg);
  renderFleetList();
  renderScore();
  updatePlacementInfo(true);
  renderLog();
  if (state.overlayMsg) {
    els.overlayTitle.textContent = t(state.overlayMsg[0]);
    els.overlayText.textContent = t(state.overlayMsg[1]);
  }
}

function renderScore() {
  // A side's score is derived from the shots recorded on the board it fires at.
  const sides = [
    { board: state.enemy, hits: els.score.hitsPlayer, misses: els.score.missesPlayer,
      accuracy: els.score.accuracyPlayer, sunk: els.score.sunkPlayer, left: els.score.leftPlayer },
    { board: state.player, hits: els.score.hitsAi, misses: els.score.missesAi,
      accuracy: els.score.accuracyAi, sunk: els.score.sunkAi, left: els.score.leftAi }
  ];
  sides.forEach(side => {
    let hits = 0;
    let misses = 0;
    side.board.shots.forEach(shot => { if (shot === 'hit') hits++; else misses++; });
    const total = hits + misses;
    const sunk = side.board.ships.filter(s => s.sunk).length;
    side.hits.textContent = String(hits);
    side.misses.textContent = String(misses);
    side.accuracy.textContent = total ? `${Math.round((hits / total) * 100)}%` : '—';
    side.sunk.textContent = `${sunk} / ${FLEET.length}`;
    side.left.textContent = String(FLEET.length - sunk);
  });
}

function renderFleetList() {
  els.fleetList.innerHTML = '';
  FLEET.forEach((spec, i) => {
    const li = document.createElement('li');
    li.textContent = `${t(spec.name)} (${spec.size})`;
    if (i < state.placedCount) li.classList.add('done');
    else if (i === state.placedCount && state.phase === 'placement') li.classList.add('next');
    els.fleetList.appendChild(li);
  });
}

function clearPreview() {
  playerCells.forEach(cell => cell.classList.remove('preview-ok', 'preview-bad'));
}

function onPlayerBoardHover(event) {
  if (state.phase !== 'placement') return;
  const pos = cellFrom(event);
  const spec = nextSpec();
  if (!pos || !spec) return;
  clearPreview();
  const cells = state.player.cellsFor(pos.r, pos.c, spec.size, state.horizontal);
  const valid = state.player.canPlace(cells);
  cells.forEach(({ r, c }) => {
    if (!inBoard(r, c)) return;
    playerCells[key(r, c)].classList.add(valid ? 'preview-ok' : 'preview-bad');
  });
  if (!valid) pos.el.classList.add('preview-bad');
}

function onPlayerBoardClick(event) {
  if (state.phase !== 'placement') return;
  const pos = cellFrom(event);
  const spec = nextSpec();
  if (!pos || !spec) return;
  const cells = state.player.cellsFor(pos.r, pos.c, spec.size, state.horizontal);
  if (!state.player.canPlace(cells)) {
    setStatus('statusIllegal');
    els.placementInfo.textContent = t('placementInvalid');
    return;
  }
  state.player.place(cells, spec.name);
  state.placedCount++;
  clearPreview();
  renderPlayerBoard();
  renderFleetList();
  updatePlacementInfo();
}

function updatePlacementInfo(keepStatus) {
  const spec = nextSpec();
  if (spec) {
    els.placementInfo.textContent = t('placeNext', t(spec.name), spec.size);
    els.start.disabled = true;
    if (!keepStatus) setStatus('statusPlace');
  } else {
    els.placementInfo.textContent = t('allPlaced');
    els.start.disabled = state.phase !== 'placement';
    if (!keepStatus) setStatus('statusReady');
  }
}

function renderPlayerBoard() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const k = key(r, c);
      const el = playerCells[k];
      el.className = 'cell';
      const ship = state.player.shipAt(r, c);
      const shot = state.player.shots.get(k);
      if (ship && ship.sunk) el.classList.add('sunk');
      else if (shot === 'hit') el.classList.add('hit');
      else if (shot === 'miss') el.classList.add('miss');
      else if (ship) el.classList.add('ship');
    }
  }
}

function renderEnemyBoard() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const k = key(r, c);
      const el = enemyCells[k];
      el.className = 'cell';
      const shot = state.enemy.shots.get(k);
      const ship = state.enemy.shipAt(r, c);
      if (ship && ship.sunk) el.classList.add('sunk');
      else if (shot === 'hit') el.classList.add('hit');
      else if (shot === 'miss') el.classList.add('miss');
    }
  }
}

function markLastShot(cells, r, c) {
  cells.forEach(cell => cell.classList.remove('last-shot'));
  cells[key(r, c)].classList.add('last-shot');
}

function startGame() {
  if (state.placedCount < FLEET.length) return;
  state.phase = 'playing';
  state.ai = new AI(els.difficulty.value);
  state.enemy.clear();
  state.enemy.randomize();
  els.setup.classList.add('hidden');
  els.enemyBoard.classList.remove('disabled');
  renderEnemyBoard();
  renderScore();
  setStatus('statusYourTurn');
  addLog('logStart');
}

function onEnemyBoardClick(event) {
  if (state.phase !== 'playing' || state.busy) return;
  const pos = cellFrom(event);
  if (!pos) return;
  const result = state.enemy.fire(pos.r, pos.c);
  if (result.repeat) {
    setStatus('statusAlreadyShot');
    return;
  }
  renderEnemyBoard();
  renderScore();
  markLastShot(enemyCells, pos.r, pos.c);
  const where = coordName(pos.r, pos.c);

  if (result.hit) {
    beep(result.sunk ? 220 : 660, 0.18, 'square');
    if (result.sunk) {
      setStatus('statusYouSank', tr(result.ship.nameKey));
      addLog('logYouSank', where, tr(result.ship.nameKey));
    } else {
      setStatus('statusYouHit');
      addLog('logYouHit', where);
    }
    if (state.enemy.allSunk()) finish(true);
    return;
  }

  beep(180, 0.12, 'sine');
  setStatus('statusYouMiss');
  addLog('logYouMiss', where);
  state.busy = true;
  setTimeout(aiTurn, 700);
}

function aiTurn() {
  if (state.phase !== 'playing') return;
  const shot = state.ai.nextShot(state.player);
  const result = state.player.fire(shot.r, shot.c);
  state.ai.record(shot, result);
  renderPlayerBoard();
  renderScore();
  markLastShot(playerCells, shot.r, shot.c);
  const where = coordName(shot.r, shot.c);

  if (result.hit) {
    beep(result.sunk ? 160 : 440, 0.18, 'square');
    if (result.sunk) {
      setStatus('statusAiSank', tr(result.ship.nameKey), where);
      addLog('logAiSank', where, tr(result.ship.nameKey));
    } else {
      setStatus('statusAiHit', where);
      addLog('logAiHit', where);
    }
    if (state.player.allSunk()) {
      finish(false);
      return;
    }
    setTimeout(aiTurn, 700);
    return;
  }

  beep(200, 0.1, 'sine');
  setStatus('statusAiMiss', where);
  addLog('logAiMiss', where);
  state.busy = false;
}

function finish(playerWon) {
  state.phase = 'over';
  state.busy = false;
  els.enemyBoard.classList.add('disabled');
  renderPlayerBoard();
  renderEnemyBoard();
  state.overlayMsg = playerWon
    ? ['overlayWinTitle', 'overlayWinText']
    : ['overlayLoseTitle', 'overlayLoseText'];
  els.overlayTitle.textContent = t(state.overlayMsg[0]);
  els.overlayText.textContent = t(state.overlayMsg[1]);
  els.overlay.classList.remove('hidden');
  setStatus(playerWon ? 'statusWin' : 'statusLose');
  addLog(playerWon ? 'logWin' : 'logLose');
}

function resetGame() {
  state.phase = 'placement';
  state.horizontal = true;
  state.placedCount = 0;
  state.busy = false;
  state.player = new Board();
  state.enemy = new Board();
  state.ai = new AI(els.difficulty.value);
  state.overlayMsg = null;
  state.logEntries = [];
  els.overlay.classList.add('hidden');
  els.setup.classList.remove('hidden');
  els.enemyBoard.classList.add('disabled');
  els.log.innerHTML = '';
  els.rotate.textContent = t('rotate', 'h');
  renderPlayerBoard();
  renderEnemyBoard();
  renderFleetList();
  renderScore();
  updatePlacementInfo();
}

function toggleRotation() {
  if (state.phase !== 'placement') return;
  state.horizontal = !state.horizontal;
  els.rotate.textContent = t('rotate', state.horizontal ? 'h' : 'v');
  clearPreview();
}

els.rotate.addEventListener('click', toggleRotation);
document.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') toggleRotation();
});

els.random.addEventListener('click', () => {
  if (state.phase !== 'placement') return;
  state.player.randomize();
  state.placedCount = FLEET.length;
  renderPlayerBoard();
  renderFleetList();
  updatePlacementInfo();
});

els.resetPlacement.addEventListener('click', () => {
  if (state.phase !== 'placement') return;
  state.player.clear();
  state.placedCount = 0;
  renderPlayerBoard();
  renderFleetList();
  updatePlacementInfo();
});

els.start.addEventListener('click', startGame);
els.playAgain.addEventListener('click', resetGame);
els.difficulty.addEventListener('change', () => {
  if (state.phase === 'placement') state.ai = new AI(els.difficulty.value);
});
els.language.addEventListener('change', () => applyLanguage(els.language.value));

buildBoards();
let savedLang = 'pl';
try { savedLang = localStorage.getItem('statki-lang') || 'pl'; } catch (err) { /* storage optional */ }
applyLanguage(savedLang);
