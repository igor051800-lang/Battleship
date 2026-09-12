# Statki — test log: defects found and how they were fixed

Testing ran in three layers, in this order: **unit tests** on the pure rules, **integration
tests** on whole simulated games, then **UI tests** in a real browser. Each defect below is
filed under the layer that caught it, with symptom, root cause, and the fix that shipped.

Layers 1 and 2 both live in `logic-test.js` (DOM-free, `node logic-test.js`); layer 3 was a
browser pass driven through the UI.

---

## 1. Unit tests — rules in isolation

Scope: a single `Board` and its placement/firing primitives, with no AI and no DOM.

| Check | Result |
| --- | --- |
| 500 random fleets: 10 ships, 20 occupied cells, correct size distribution (1×4, 2×3, 3×2, 4×1) | pass |
| No two ships overlap or touch, including diagonally (8-neighbour scan of every ship cell) | pass |
| First hit on a 3-cell ship does not report `sunk` | pass |
| Third hit sinks it and `allSunk()` becomes true | pass |
| Firing at an already-shot cell is reported as `repeat` | pass |
| A shot at open water is reported as a miss | pass |
| Placing a ship in contact with an existing ship is rejected | pass |
| Placing a ship one clear cell away is accepted | pass |
| Placing a ship that runs off the board is rejected | pass |

**Defects found: none.** Placement legality was deliberately centralized in a single
`Board.canPlace(cells)` used by manual placement, hover preview, and both fleets' random
placement, so there was only one implementation for these tests to exercise — and no way
for the preview to disagree with what the game accepts.

---

## 2. Integration tests — full simulated games

Scope: `AI` playing complete games against a randomized `Board` — many turns, accumulated
state, both difficulty levels.

| Check | Result |
| --- | --- |
| 300 hard-mode games: the AI never fires at the same cell twice | pass |
| 300 hard-mode games: the AI always sinks the entire fleet (no stalls, no infinite loop) | pass |
| Hard-mode average shots per game < 70, proving hunt/target actually converges | pass |
| 100 easy-mode games: no repeated shots | pass |
| Easy (pure random) needs measurably more shots than hard | pass — confirms the two modes really differ |

**Defects found: none.** The riskiest behaviours here are state that accumulates across
turns: the target queue after a hit, orientation lock once two hits line up, and the
exclusion zone around a sunk ship (legal because ships cannot touch). Those are exactly
what the repeat-shot and always-finishes assertions cover, over hundreds of games rather
than one.

---

## 3. UI tests — real browser

Scope: `index.html` served over HTTP and driven like a player — placement with rotation,
randomize, a full game to a win and one to a loss, PL ⇄ EN switching at every phase, replay,
390px viewport, console clean. **All five shipped defects were caught here**, because each
one is invisible to the logic layer: they live in CSS, in event routing, or in the
presentation of state.

### 3.1 Hovered cell lost its placement preview colour

**Symptom.** During placement the green "valid" / red "invalid" preview appeared on every
cell of the ship except the one under the pointer, which stayed light blue.

**Cause.** Board cells are `<button>` elements, so the generic control style
`button:hover:not(:disabled) { background: #eef4fa; }` won a specificity tie against
`.cell.preview-ok` / `.cell.preview-bad` on the hovered cell only.

**Fix.** Excluded board cells from the generic hover rule in `style.css`:

```css
button:not(.cell):hover:not(:disabled) { background: #eef4fa; }
```

### 3.2 Win/lose overlay swallowed clicks on the language selector

**Symptom.** After a game ended, the header language `<select>` could not be clicked; the
dropdown never opened.

**Cause.** The end-game overlay is a full-viewport fixed element layered above the page, so
its transparent backdrop intercepted every pointer event outside the dialog box.

**Fix.** Made the backdrop click-transparent while keeping the dialog interactive:

```css
.overlay { pointer-events: none; }
.overlay-box { pointer-events: auto; }
```

### 3.3 Mixed-language messages after switching PL ⇄ EN

**Symptom.** Switching language mid-game re-translated the status line and shot log, but
ship names inside already-emitted sink messages stayed in the old language — the Polish
status line read `Zatopiłeś four-cell ship!`.

**Cause.** Sink messages rendered the ship name to a string at the moment of the sink and
stored that string as a message argument. Re-rendering translated the sentence template but
reused the frozen, already-rendered name.

**Cause class.** Storing rendered text instead of translation keys — the same trap applies
to any localized value captured into state.

**Fix.** A lazy translation marker in `game.js`, so arguments carry a key and are resolved
at render time:

```js
const tr = key => ({ i18nKey: key });

function t(key, ...args) {
  const value = I18N[lang][key];
  if (typeof value !== 'function') return value;
  return value(...args.map(a => (a && a.i18nKey ? t(a.i18nKey) : a)));
}

setStatus('statusYouSank', tr(result.ship.nameKey));
addLog('logYouSank', where, tr(result.ship.nameKey));
```

Status line and log entries store `{ key, args }` and are re-rendered entirely in the
active language whenever the selector changes.

### 3.4 `/favicon.ico` 404 in the console

**Symptom.** Every page load logged a failed request, violating the "no console errors"
requirement.

**Fix.** An inline empty icon in `index.html`, so the browser stops asking:

```html
<link rel="icon" href="data:,">
```

### 3.5 Scoreboard drift (prevented rather than fixed)

**Symptom.** None observed — a design choice made while adding the scoreboard.

**Cause (potential).** The obvious implementation is a set of counters incremented per
shot, which then need matching updates on repeat clicks, sinks, replay reset and language
switches; any missed path silently desynchronizes the display from the game.

**Fix.** `renderScore()` derives every figure from authoritative board state on each call —
hits/misses from `Board.shots`, sunk ships from `Board.ships[].sunk`, fleet left as
`FLEET.length - sunk`, accuracy from hits over total shots. There are no counters to keep
in sync. The browser pass compared 47 scoreboard snapshots against board state across 27
player shots and 14 AI shots with no mismatch.

### Other UI checks that passed

Manual placement with `R` rotation and illegal placements visibly rejected; randomize;
hit-goes-again and miss-passes-turn; sunk ships revealed on the tracking board; a full win
and a full loss; replay resetting both boards, log and scoreboard; PL ⇄ EN at placement,
mid-game and post-game; no horizontal overflow at 390px.

---

## Environment and process blockers (outside the test layers)

- **Empty repository.** `igor051800-lang/Battleship` had no commits, hence no default
  branch, and GitHub rejects a PR without a base. Resolved by pushing an initial commit to
  `main` with the owner's approval, then opening the PR from
  `devin/1789230551-statki-game`.
- **`node` not on PATH.** `node logic-test.js` failed with `node: command not found`; the
  runtime was installed under nvm. Resolved per shell with
  `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- **GitHub Pages could not be enabled programmatically.**
  `POST /repos/igor051800-lang/Battleship/pages` returned
  `403 Resource not accessible by integration` — the token lacks the Pages administration
  scope. The game was published to a static host instead
  (https://battleship-foilsmkn.devinapps.com); enabling Pages from the repository settings
  remains an option for a `github.io` URL.

## Reproducing the suite

```bash
node logic-test.js          # layers 1 and 2
python3 -m http.server 8000 # layer 3: open http://localhost:8000 and play
```
