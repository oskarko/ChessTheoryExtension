// Game accuracy, following lichess's published AccuracyPercent formula (chess.com's
// CAPS2 is not public but works the same way): each move is scored by how much
// winning chance it gives away, then moves are averaged per side.

/** White's winning chance (0–100) for a white-positive centipawn eval. */
export function winPercent(whiteCp) {
  const cp = Math.max(-1000, Math.min(1000, whiteCp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Accuracy (0–100) of a move, from the mover's winning chance before and after it. */
export function moveAccuracy(winBefore, winAfter) {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1)); // +1: uncertainty bonus, as lichess does
}

function stdDev(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

/**
 * @param {{moverIsWhite: boolean, beforeCp: number, afterCp: number}[]} moves in game order, white-positive evals
 * @returns {{white: number|null, black: number|null}}
 */
export function gameAccuracy(moves) {
  if (moves.length === 0) return { white: null, black: null };
  const wins = [winPercent(moves[0].beforeCp), ...moves.map((m) => winPercent(m.afterCp))];

  // Moves in volatile stretches of the game weigh more than quiet ones.
  const size = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));
  const weights = moves.map((_, i) => {
    const start = Math.max(0, Math.min(i + 2 - size, wins.length - size));
    return Math.max(0.5, Math.min(12, stdDev(wins.slice(start, start + size))));
  });

  const sides = { white: [], black: [] };
  moves.forEach((m, i) => {
    const [before, after] = [winPercent(m.beforeCp), winPercent(m.afterCp)];
    const accuracy = m.moverIsWhite ? moveAccuracy(before, after) : moveAccuracy(100 - before, 100 - after);
    sides[m.moverIsWhite ? "white" : "black"].push({ accuracy, weight: weights[i] });
  });

  const combine = (xs) => {
    if (xs.length === 0) return null;
    const weighted = xs.reduce((a, x) => a + x.accuracy * x.weight, 0) / xs.reduce((a, x) => a + x.weight, 0);
    // The harmonic mean is what makes a single blunder drag the whole game down.
    const harmonic = xs.length / xs.reduce((a, x) => a + 1 / Math.max(x.accuracy, 1e-6), 0);
    return (weighted + harmonic) / 2;
  };
  return { white: combine(sides.white), black: combine(sides.black) };
}
