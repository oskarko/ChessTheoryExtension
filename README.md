# ChessTheory Analyzer (Chrome extension for chess.com)

Live Stockfish analysis for [chess.com](https://www.chess.com), without scanning
or typing moves: the extension reads the board straight from the page and shows,
in Chrome's side panel:

- **Best move** for the side to move, with the evaluation (from white's point of
  view, like chess.com) and an evaluation bar.
- **Top engine lines** (1–5, configurable) in SAN.
- **Arrows on the board** for the top three moves (green, blue, grey), which can
  be turned off.
- **Last move grade** — Best ★, Excellent !, Good ✓, Inaccuracy !?, Mistake ?,
  Blunder ?? — with the centipawns lost, using the same thresholds as
  ChessTheory's `MoveAnnotator`.
- **Game accuracy** for white and black, computed with lichess's published
  formula (chess.com's own CAPS2 formula is not public but works the same way).
  See [Accuracy](#accuracy).
- **Side-to-move override** (Auto / White / Black) for positions where it can't
  be inferred.
- **FEN** of the current position, with a copy button.
- **Settings**: search depth (10–30, default 20), number of lines and arrows,
  saved across sessions.

Everything runs locally in the browser: Stockfish 18 Lite runs as WebAssembly
inside the extension and nothing is sent to any server.

## Where it works

The extension only runs on `https://www.chess.com/*`. Which pages it analyses is
decided in `src/content/policy.js` (covered by `tests/policy.test.js`):

| chess.com page | Active |
|---|---|
| Analysis board (`/analysis…`) | ✅ |
| Games against bots (`/play/computer…`) | ✅ |
| Games under `/game/…`, `/live/…`, `/daily/…`, finished or in progress (in progress shows a fair-play warning) | ✅ |
| Anything else (puzzles, home, profiles…) | ❌ |

> **Fair play.** This repository is published for study and training. Using
> engine assistance in games against other people breaks chess.com's
> [Fair Play Policy](https://www.chess.com/legal/fair-play) and gets accounts
> closed: chess.com detects it mainly by statistically analysing the moves
> played, so no extension can hide it. Use it to review your games, against
> bots and on the analysis board.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open chess.com, click the extension icon: the side panel opens and starts
   analysing.

Requires Chrome 116 or later. Permissions: `sidePanel` and `storage` only.

## How it works

- `src/content/` — content script injected into chess.com.
  - `board.js` reads the pieces (`.piece.wp.square-52`) and last-move
    highlights from `wc-chess-board` and builds a FEN.
  - `policy.js` decides whether the current page is analysed.
  - `content.js` watches the board for changes, sends the position to the side
    panel over a port and draws the arrows (`overlay.css`). All chess.com
    selectors live in its `SELECTORS` object, so a chess.com redesign usually
    only needs changes there.
- `src/sidepanel/` — UI and engine.
  - `engine.js` runs Stockfish in a Web Worker and parses its UCI output.
  - `position.js` validates positions with chess.js before sending them to the
    engine, detects mate/stalemate and converts lines to SAN.
  - `quality.js` grades each move by the centipawns the mover lost.
  - `accuracy.js` computes game accuracy.
  - `sidepanel.js` ties everything together and renders the panel.
- `vendor/` — Stockfish.js 18.0.8 (`stockfish-18-lite-single`) and chess.js 1.0.0.

**Side to move** comes from the last-move highlight, then the move list; if the
side not to move is in check the guess is corrected automatically, and the panel
has a manual override. **Castling rights** are inferred from king/rook placement.

**Move grading** compares the engine's evaluation before and after the move at a
similar depth (at least 10, graded at 16). Evaluations are kept per FEN, because
chess.com passes through intermediate board states while animating moves.

## Accuracy

Each evaluation is turned into a winning chance:

```
win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)     cp clamped to ±1000
```

Each move scores by how much winning chance the mover gave away:

```
accuracy = 103.1668 * exp(-0.04354 * (win%before - win%after)) - 3.1669  (+1, capped at 100)
```

Each side's accuracy is the average of:

- a **weighted mean**, where moves in volatile stretches of the game (higher
  standard deviation of win% in a sliding window) weigh more, and
- a **harmonic mean**, which is why a single blunder drags the whole game down.

This explains why accuracy varies so much between games (60 vs 99): one big
blunder sinks it, inaccuracies in an already winning position barely cost
anything, and short games or games with many book/forced moves score higher.

The panel only counts moves it has actually seen and graded, so to get the
accuracy of a whole game, step through it move by move. Each move counts once
(going back and forth doesn't duplicate it), and the count resets when the board
returns to the starting position.

## Tests

```sh
npm test
```

Covers the page policy, board reading, UCI parsing, move grading, position
handling and accuracy.

## License

[GPLv3](LICENSE), because the extension bundles Stockfish, which is GPLv3
(`vendor/stockfish/COPYING.txt`). chess.js is BSD-2-Clause
(`vendor/chessjs/LICENSE`).
