# Statki

Browser-based single-player Battleship ("Statki", Polish rules) — plain HTML/CSS/JS, no build step,
no dependencies.

## Run

Open `index.html` directly in a browser, or:

```
python3 -m http.server 8000
```

then visit http://localhost:8000

## Languages

Polish (default) and English, switchable at any time with the language selector in the header;
the choice is remembered in `localStorage` and re-renders the status line and shot log in place.

## Rules implemented

- Two 10x10 boards: your fleet and enemy waters.
- Fleet per side: 1x4-cell, 2x3-cell, 3x2-cell, 4x1-cell (10 ships, 20 cells).
- Ships are horizontal or vertical and may never touch, not even diagonally.
- A hit lets the same side fire again; a miss passes the turn.
- A sunk ship is revealed in full on the attacker's board; the game ends when a fleet is wiped out.

## Placement

Click cells on your own board to place ships in fleet order, `R` or the rotate button toggles
horizontal/vertical, hover shows a valid (green) / invalid (red) preview, "Losuj moją flotę"
auto-places a legal fleet.

## Scoreboard

A live panel under the boards tracks hits, misses, accuracy, ships sunk and fleet remaining for
both sides; it is derived from board state, so it always matches what the boards show.

## AI

- Hard (default): hunt mode fires at random unshot cells on a checkerboard parity while all ships
  larger than one cell are alive, then switches to target mode after a hit — probing orthogonal
  neighbours, following the line once orientation is known, and excluding cells around a sunk ship.
- Easy: uniformly random unshot cells.

## Tests

`node logic-test.js` runs headless checks of placement legality, AI behaviour and hit/sink
bookkeeping (the DOM-free part of `game.js`).
