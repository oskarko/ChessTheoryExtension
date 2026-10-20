import { test } from "node:test";
import assert from "node:assert/strict";
import { winPercent, moveAccuracy, gameAccuracy } from "../src/sidepanel/accuracy.js";

test("win percent is symmetric and clamped", () => {
  assert.equal(winPercent(0), 50);
  assert.ok(Math.abs(winPercent(300) + winPercent(-300) - 100) < 1e-9);
  assert.equal(winPercent(5000), winPercent(1000));
});

test("move accuracy drops with lost winning chance", () => {
  assert.equal(moveAccuracy(50, 60), 100);
  assert.equal(moveAccuracy(50, 50), 100);
  assert.ok(moveAccuracy(50, 45) > 80 && moveAccuracy(50, 45) < 85);
  assert.ok(moveAccuracy(80, 20) < 10);
});

test("one blunder drags a clean game down; quiet moves in a won position cost little", () => {
  const steady = Array.from({ length: 20 }, (_, i) => ({ moverIsWhite: i % 2 === 0, beforeCp: 20, afterCp: 20 }));
  assert.ok(gameAccuracy(steady).white > 99);

  const blunder = steady.map((m, i) => (i === 10 ? { ...m, afterCp: -600 } : i === 11 ? { ...m, beforeCp: -600, afterCp: -600 } : i > 11 ? { ...m, beforeCp: -600, afterCp: -600 } : m));
  const { white, black } = gameAccuracy(blunder);
  assert.ok(white < 80, `white ${white}`);
  assert.ok(black > 99, `black ${black}`);

  const lose150 = (from) => gameAccuracy([{ moverIsWhite: true, beforeCp: from, afterCp: from - 150 }]).white;
  assert.ok(lose150(900) > 90 && lose150(0) < 70, `${lose150(900)} vs ${lose150(0)}`);
  assert.deepEqual(gameAccuracy([]), { white: null, black: null });
});
