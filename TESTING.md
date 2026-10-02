# Testing Statki

Statki is tested in two ways:

1. **Automated** — `logic-test.js` exercises the DOM-free rules and AI in `game.js` under Node.
2. **Manual** — a browser checklist for everything that touches the DOM, audio and storage.

## 1. Automated tests

### Running

```bash
node logic-test.js
```

No dependencies or `package.json` are needed — only Node. If `node` is not on `PATH`
but is installed through nvm, add it for the current shell first, e.g.
`export PATH="$HOME/.nvm/versions/node/<version>/bin:$PATH"`.

Each check prints `ok: <name>` or `FAIL: <name>`, followed by `All checks passed` or
`<n> check(s) failed`. The script ends with `process.exit(failures ? 1 : 0)`, so a failure
yields a non-zero exit code and can gate CI or a pre-commit hook.

### How the logic is loaded

`game.js` is a plain browser script with no module exports. `logic-test.js` reads it as
text and keeps only what comes before the sound separator:

```js
const logic = src.split('// ---------------------------------------------------------------- sound')[0];
const { Board, AI, FLEET, SIZE } = (new Function(logic + '\nreturn { Board, AI, FLEET, SIZE };'))();
```

That prefix holds `SIZE`, `FLEET`, the helpers `inBoard`, `key` and `neighbours`, and the
`Board` and `AI` classes. None of it touches `window` or `document`, so it runs headless.
Everything after the separator (`beep`/`boom`, `I18N`/`t`/`tr`, and the DOM game loop) is
never evaluated by the tests.

> Keep the separator comment exactly as written, and keep everything above it DOM-free.
> If either changes, the extraction breaks or throws a `ReferenceError` in Node.

### What is checked

| # | Area | Code under test | Assertions |
|---|------|-----------------|------------|
| 1 | Random fleet legality | `Board.randomize()`, `Board.placeRandomShip()`, `Board.canPlace()` | 500 randomized boards each have 10 ships and 20 occupied cells (`cellShip.size`), the ship sizes match `FLEET` (4, 3, 3, 2, 2, 2, 1, 1, 1, 1), and no ship cell overlaps or touches another ship, diagonals included. |
| 2 | Hard AI | `AI('hard')`: `nextShot()`, `record()`, `candidatesFromTarget()`, `huntCandidates()` | Over 300 simulated games against a random fleet (capped at 200 shots each): no repeated shot, the whole fleet is always sunk (`Board.allSunk()`), and the average is under 70 shots, showing that hunt/target mode and checkerboard parity work. |
| 3 | Easy AI | `AI('easy')` | Over 100 simulated games: no repeated shot, and the average shot count is higher than the hard AI's. |
| 4 | Fire/sink bookkeeping and placement rules | `Board.place()`, `Board.fire()`, `Board.allSunk()`, `Board.cellsFor()`, `Board.canPlace()` | On a board holding one 3-cell ship at A1–C1: the first hit does not sink it; firing the same cell again returns `{ repeat: true }`; the third hit returns `sunk: true` and `allSunk()` is true; a shot at empty water returns `hit: false`; a ship touching the existing one is rejected; a ship one row away is accepted; a 4-cell ship running off the board (`cellsFor(9, 8, 4, true)`) is rejected. |

A typical run looks like this (the averages vary from run to run because games are random):

```
ok: hard AI average shots < 70 (hunt/target works): 58.2
ok: easy AI is worse than hard AI: 96.5 vs 58.2
```

## 2. Manual test checklist

Serve the folder and open it in a browser:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Open DevTools and keep the console visible. It should stay free of errors for the whole run.

### Placement phase

Handled by `onPlayerBoardHover`, `onPlayerBoardClick`, `updatePlacementInfo`,
`toggleRotation` and `renderFleetList`.

- [ ] On load, the placement info names the next ship ("four-cell ship", size 4), the fleet list
      highlights it as `next`, and **Start** is disabled.
- [ ] Hovering over your board previews the ship: green (`preview-ok`) where it fits, red
      (`preview-bad`) where it would leave the board, overlap a ship or touch one, corners included.
- [ ] Clicking a valid cell places the ship, marks it `done` in the fleet list, and moves on to the next ship.
- [ ] Clicking an invalid cell places nothing. The status shows `statusIllegal` and the info line
      shows `placementInvalid` ("ships may not touch, not even at the corners").
- [ ] Pressing `R` (or `r`), or clicking the rotate button, switches between horizontal and vertical.
      The button label updates and the hover preview follows the new orientation.
      Rotation does nothing outside the placement phase.
- [ ] **Randomize my fleet** (`Board.randomize()`) fills the board with a legal 10-ship fleet,
      marks every list entry `done`, and enables **Start**.
- [ ] **Clear** empties the board, resets the fleet list, and disables **Start** again.
- [ ] **Start** stays disabled until all 10 ships are placed. `startGame()` also returns early
      if `placedCount < FLEET.length`.

### Gameplay

Handled by `startGame`, `onEnemyBoardClick`, `aiTurn`, `renderEnemyBoard`, `markLastShot`,
`explode` and `addLog`.

- [ ] After **Start**, the setup panel hides, the enemy board becomes clickable, the status
      reads "your turn", and the log starts with `logStart`.
- [ ] **Miss** — the cell is marked `miss`, a log entry is added, and the turn passes to the AI.
      The enemy board ignores clicks while `state.busy` is set. After about 700 ms the AI fires at your board.
- [ ] **Hit** — the cell is marked `hit`, an explosion plays (`explode`), and you **shoot again**:
      the AI does not move. Hits by the AI likewise chain further AI shots (`setTimeout(aiTurn, 700)`).
- [ ] **Sunk** — every cell of the sunk enemy ship is revealed as a hull silhouette with the
      `sunk` class (`drawHull`). The status and log name the ship type.
- [ ] Clicking a cell you already fired at changes nothing and shows `statusAlreadyShot`.
- [ ] During play, the most recent shot on each board has the `last-shot` marker, and it moves
      with every shot. The final re-render in `finish()` clears both markers.
- [ ] The shot log gets one entry per shot (hit, miss, sunk) for both sides, with coordinates
      such as `B7` (`coordName`), and scrolls to the newest entry.
- [ ] Enemy ships stay hidden until they are sunk. Your own ships are always visible.

### AI difficulty

- [ ] **Hard** (default): after a hit, the AI probes the orthogonal neighbours, then follows the
      ship's line until it sinks it. It never fires into the cells around a ship it has already sunk.
- [ ] **Easy**: shots look scattered and random. A hit is not followed up deliberately.
- [ ] The difficulty selector applies only in the placement phase. `startGame()` builds the AI
      from the selected value, and changing the selection mid-game has no effect until the next game.

### Scoreboard

Computed by `renderScore()` from the shots recorded on the board each side fires at.

- [ ] Hits and misses for **You** and **AI** go up by exactly one per shot, on the correct side.
- [ ] Accuracy equals `round(hits / (hits + misses) * 100)%` and shows `—` before the first shot.
- [ ] Sunk reads `n / 10` and Fleet left equals `10 − sunk`. Both update when a ship sinks.
- [ ] Final totals match the board: count the hit and miss markers by hand once.

### End of game

Handled by `finish()` and `resetGame()`.

- [ ] Sinking the last enemy ship shows the win overlay. Losing your last ship shows the lose overlay.
- [ ] The enemy board is disabled, the status and log record the result, and sunk cells do not
      cover the overlay.
- [ ] **Play again** hides the overlay and goes back to placement. Both boards are empty, the log
      and scoreboard are cleared, the orientation resets to horizontal, **Start** is disabled, and
      the AI is rebuilt with the selected difficulty.

### Language (EN/PL)

Handled by `applyLanguage()`, `t()` and `tr()`.

- [ ] On first visit (empty `localStorage`) the UI is in English.
- [ ] Clicking the PL flag translates every `data-i18n` label, the board `aria-label`s, the
      rotate button, the fleet list, the placement info and the overlay (if it is open). The
      flag buttons update `aria-pressed`.
- [ ] Switching mid-game re-translates the **current status and every existing log entry in
      place**, ship names included. This works because they are stored as keys (`state.statusMsg`,
      `state.logEntries`, with lazy `tr()` arguments) and re-rendered by `renderLog()`.
- [ ] The choice is saved under `localStorage` key `statki-lang`. Reload the page and the language is kept.
      Check with `localStorage.getItem('statki-lang')` in the console.
- [ ] With storage blocked (for example, some private modes), switching still works for the
      session and nothing is logged to the console (`try`/`catch` around `localStorage`).

### Audio

Handled by `beep()` and `boom()`.

- [ ] A miss, by you or the AI, plays a short low sine beep.
- [ ] A hit plays a filtered-noise explosion (`boom(false)`). A sinking shot plays a longer,
      deeper one (`boom(true)`).
- [ ] The first sound starts after a user click, as browser autoplay policies require.
- [ ] Graceful no-op: with no `AudioContext`/`webkitAudioContext`, the game still plays silently
      and the console stays clean. Simulate this by running `delete window.AudioContext;
      delete window.webkitAudioContext;` in the console before the first shot, or by loading
      the page in a browser without Web Audio.

## 3. Coverage and limitations

- **Covered automatically:** only the code above the `// --- sound` separator in `game.js`:
  `Board`, `AI`, `FLEET`, `SIZE` and their helpers.
- **Not covered automatically:** all DOM and UI code — rendering (`renderPlayerBoard`,
  `renderEnemyBoard`, `renderScore`, `renderFleetList`), input handlers, the turn flow and
  timers (`onEnemyBoardClick`, `aiTurn`, `finish`, `resetGame`), i18n (`applyLanguage`, `t`,
  `tr`, `I18N`), `localStorage` persistence, Web Audio (`beep`, `boom`), the explosion
  animation (`explode`), and the CSS in `style.css`. Use the manual checklist for these.
- **Statistical checks:** the AI tests use `Math.random()` without a seed. The thresholds
  (hard average < 70 against a typical ~58; easy average above hard's) leave a wide margin,
  but a failure cannot be replayed exactly.
- **Cross-browser:** run the manual checklist in current Chrome/Edge, Firefox and Safari
  (Safari exercises the `webkitAudioContext` fallback), and once at a narrow mobile width to
  check the responsive layout and the touch-driven placement and firing.
- **Exit code:** `logic-test.js` calls `process.exit(1)` when any check fails and exits with `0`
  otherwise, so it can be used directly as a CI or pre-commit gate.
