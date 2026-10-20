// Move-quality grading, ported from ChessTheory's MoveAnnotator.swift so both
// apps label moves the same way (lichess-style thresholds, centipawns lost by
// the mover).

export const QUALITIES = {
  best: { label: "Mejor", symbol: "★" },
  excellent: { label: "Excelente", symbol: "!" },
  good: { label: "Buena", symbol: "✓" },
  inaccuracy: { label: "Imprecisión", symbol: "!?" },
  mistake: { label: "Error", symbol: "?" },
  blunder: { label: "Error grave", symbol: "??" },
};

/**
 * Converts a UCI score (relative to the side to move) into white-positive
 * centipawns, folding mates into the same scale: closer mates score higher.
 * @param {{cp?: number, mate?: number}} score
 * @param {'w'|'b'} turn side to move in the analysed position
 */
export function toWhiteCp(score, turn) {
  let relative;
  if (score.mate === undefined) {
    relative = score.cp;
  } else if (score.mate === 0) {
    relative = -10_000; // side to move is already mated
  } else {
    const magnitude = 10_000 - Math.abs(score.mate) * 10;
    relative = score.mate > 0 ? magnitude : -magnitude;
  }
  return turn === "w" ? relative : -relative;
}

/**
 * @param {object} p
 * @param {string} p.played     move played, UCI
 * @param {string} p.engineBest engine's top choice before the move, UCI
 * @param {number} p.beforeCp   white-positive eval before the move
 * @param {number} p.afterCp    white-positive eval after the move
 * @param {boolean} p.moverIsWhite
 * @returns {{quality: keyof QUALITIES, loss: number}}
 */
export function judgeMove({ played, engineBest, beforeCp, afterCp, moverIsWhite }) {
  const loss = moverIsWhite ? beforeCp - afterCp : afterCp - beforeCp;
  let quality;
  // Promotions: chess.com's board can't tell us the promoted piece, so compare squares only.
  if (played.slice(0, 4) === engineBest.slice(0, 4)) quality = "best";
  else if (loss <= 10) quality = "excellent";
  else if (loss <= 30) quality = "good";
  else if (loss <= 80) quality = "inaccuracy";
  else if (loss <= 150) quality = "mistake";
  else quality = "blunder";
  return { quality, loss };
}
