# ChessTheory Analyzer (Chrome extension)

Live Stockfish analysis for chess.com, without scanning or typing moves: the
extension reads the board straight from the page and shows the best move for
the side to move, the top engine lines, arrows on the board and a grade for the
last move played (same thresholds as ChessTheory's `MoveAnnotator`).

## Fair play

The extension is an **allowlist**. It only reads the board on pages where
engine help is allowed:

| Page | Active |
|---|---|
| Analysis board (`/analysis…`) | ✅ |
| Games against bots (`/play/computer…`) | ✅ |
| Finished games (`/game/…` once there is a result and no clock is ticking) | ✅ |
| Any game in progress (yours or someone else's), puzzles, everything else | ✅ |

The rules live in `src/content/policy.js` and are covered by tests.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open chess.com, click the extension icon: the side panel opens and starts analysing.

## How it works

- `src/content/` — content script. Reads pieces (`.piece.wp.square-52`) and the
  last-move highlights from `wc-chess-board`, builds a FEN, and sends it to the
  side panel over a port. Draws the arrows. All chess.com selectors are in the
  `SELECTORS` object in `content.js`.
- `src/sidepanel/` — UI and engine. Runs Stockfish 18 Lite (single-threaded
  WASM) in a Web Worker, validates positions with chess.js before sending them to
  the engine, and grades moves.
- `vendor/` — Stockfish.js 18.0.8 (`stockfish-18-lite-single`) and chess.js 1.0.0.

Side to move comes from the last-move highlight, then the move list; if the
side not to move is in check the guess is corrected automatically, and the panel
has a manual override. Castling rights are inferred from king/rook placement.

## Tests

```sh
npm test
```

## License

Stockfish is GPLv3 (`vendor/stockfish/COPYING.txt`); distributing this
extension with the bundled engine must comply with the GPL.
chess.js is BSD-2-Clause (`vendor/chessjs/LICENSE`).
