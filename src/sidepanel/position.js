// Position helpers on top of chess.js: sanity-checks the FEN read from the
// page before it reaches Stockfish (an illegal position can crash the WASM
// engine) and renders UCI moves as SAN.
import { Chess } from "../../vendor/chessjs/chess.js";

function withTurn(fen, turn) {
  const parts = fen.split(" ");
  if (parts[1] === turn) return fen;
  parts[1] = turn;
  parts[3] = "-"; // an en-passant square is only valid for the original side to move
  return parts.join(" ");
}

function load(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/**
 * @param {string} fen FEN read from the board
 * @param {'auto'|'w'|'b'} override user's choice of side to move
 * @returns {{status: 'ok'|'checkmate'|'stalemate'|'invalid', fen?: string, turn?: 'w'|'b', corrected?: boolean}}
 */
export function preparePosition(fen, override = "auto") {
  const guessed = override === "auto" ? fen : withTurn(fen, override);
  const turn = guessed.split(" ")[1];
  const other = withTurn(guessed, turn === "w" ? "b" : "w");

  let chess = load(guessed);
  let corrected = false;
  // The side that is not to move can never be in check. If it is, the turn
  // guess is wrong — fix it in auto mode, refuse otherwise.
  const otherChess = load(other);
  if (chess && otherChess?.isCheck()) {
    if (override !== "auto") return { status: "invalid" };
    chess = otherChess;
    corrected = true;
  }
  if (!chess) return { status: "invalid" };

  const result = { fen: chess.fen(), turn: chess.turn(), corrected };
  if (chess.isCheckmate()) return { status: "checkmate", ...result };
  if (chess.isStalemate()) return { status: "stalemate", ...result };
  return { status: "ok", ...result };
}

/**
 * Checks that `lastMove` (UCI squares, as read from the highlights) turns
 * `prevFen` into `nextFen`, i.e. the new position follows the analysed one.
 * @returns {{san: string, uci: string} | null}
 */
export function followingMove(prevFen, lastMove, nextFen) {
  if (!prevFen || !lastMove) return null;
  const target = nextFen.split(" ")[0];
  for (const promotion of [undefined, "q", "r", "b", "n"]) {
    const chess = load(prevFen);
    if (!chess) return null;
    let move;
    try {
      move = chess.move({ from: lastMove.slice(0, 2), to: lastMove.slice(2, 4), promotion });
    } catch {
      continue;
    }
    if (chess.fen().split(" ")[0] === target) {
      return { san: move.san, uci: move.from + move.to + (move.promotion || "") };
    }
  }
  return null;
}

/** Converts a UCI principal variation into SAN, stopping at the first illegal move. */
export function pvToSan(fen, pv, max = 12) {
  const chess = load(fen);
  if (!chess) return [];
  const out = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}
