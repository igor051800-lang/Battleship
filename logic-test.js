// Headless sanity check of the pure game logic in game.js (no DOM needed).
// Run with: node logic-test.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/game.js', 'utf8');
const logic = src.split('// ---------------------------------------------------------------- sound')[0];
const { Board, AI, FLEET, SIZE } = (new Function(logic + '\nreturn { Board, AI, FLEET, SIZE };'))();

let failures = 0;
const check = (name, cond) => {
  if (!cond) { failures++; console.log('FAIL: ' + name); } else { console.log('ok: ' + name); }
};

// 1. random placement is always legal
let legal = true;
for (let i = 0; i < 500; i++) {
  const b = new Board();
  b.randomize();
  if (b.ships.length !== 10 || b.cellShip.size !== 20) { legal = false; break; }
  for (const ship of b.ships) {
    for (const { r, c } of ship.cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE) continue;
          const other = b.cellShip.get(nr * SIZE + nc);
          if (other && other !== ship) legal = false;
        }
      }
    }
  }
  const sizes = b.ships.map(s => s.size).sort().join(',');
  if (sizes !== FLEET.map(f => f.size).sort().join(',')) legal = false;
}
check('500 random fleets are legal (no overlap, no touching, correct sizes)', legal);

// 2. AI finishes every game, never repeats a shot, and is efficient in hard mode
function playAI(difficulty) {
  const b = new Board();
  b.randomize();
  const ai = new AI(difficulty);
  const seen = new Set();
  let shots = 0;
  while (!b.allSunk() && shots < 200) {
    const shot = ai.nextShot(b);
    const k = shot.r * SIZE + shot.c;
    if (seen.has(k)) return { repeat: true, shots };
    seen.add(k);
    ai.record(shot, b.fire(shot.r, shot.c));
    shots++;
  }
  return { repeat: false, shots, won: b.allSunk() };
}

let hardTotal = 0, hardWorst = 0, repeats = 0, incomplete = 0;
for (let i = 0; i < 300; i++) {
  const res = playAI('hard');
  if (res.repeat) repeats++;
  if (!res.won) incomplete++;
  hardTotal += res.shots;
  hardWorst = Math.max(hardWorst, res.shots);
}
check('hard AI never repeats a shot', repeats === 0);
check('hard AI always sinks the whole fleet', incomplete === 0);
const hardAvg = hardTotal / 300;
check('hard AI average shots < 70 (hunt/target works): ' + hardAvg.toFixed(1), hardAvg < 70);

let easyTotal = 0, easyRepeats = 0;
for (let i = 0; i < 100; i++) {
  const res = playAI('easy');
  if (res.repeat) easyRepeats++;
  easyTotal += res.shots;
}
check('easy AI never repeats a shot', easyRepeats === 0);
check('easy AI is worse than hard AI: ' + (easyTotal / 100).toFixed(1) + ' vs ' + hardAvg.toFixed(1),
  easyTotal / 100 > hardAvg);

// 3. sinking bookkeeping
const b3 = new Board();
b3.place(b3.cellsFor(0, 0, 3, true), 'trójmasztowiec');
check('first hit does not sink', b3.fire(0, 0).sunk === false);
check('repeat shot flagged', b3.fire(0, 0).repeat === true);
b3.fire(0, 1);
const last = b3.fire(0, 2);
check('third hit sinks the 3-cell ship', last.sunk === true && b3.allSunk());
check('miss reported', b3.fire(5, 5).hit === false);
check('cannot place touching ship', b3.canPlace(b3.cellsFor(1, 0, 1, true)) === false);
check('can place separated ship', b3.canPlace(b3.cellsFor(2, 0, 1, true)) === true);
check('cannot place off-board', b3.canPlace(b3.cellsFor(9, 8, 4, true)) === false);

console.log(failures ? '\n' + failures + ' check(s) failed' : '\nAll checks passed');
process.exit(failures ? 1 : 0);
