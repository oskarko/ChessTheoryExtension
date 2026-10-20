import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInfo } from "../src/sidepanel/engine.js";
import { judgeMove, toWhiteCp } from "../src/sidepanel/quality.js";
import { preparePosition, followingMove, pvToSan } from "../src/sidepanel/position.js";

test("parses UCI info lines", () => {
  const info = parseInfo("info depth 12 seldepth 19 multipv 2 score cp -37 nodes 29760 nps 875294 time 34 pv e7e5 g1f3 b8c6");
  assert.deepEqual(info, { depth: 12, multipv: 2, score: { cp: -37 }, pv: ["e7e5", "g1f3", "b8c6"], bound: null });
  assert.deepEqual(parseInfo("info depth 20 score mate -3 lowerbound pv h7h8").score, { mate: -3 });
  assert.equal(parseInfo("info depth 20 currmove e2e4 currmovenumber 1"), null);
});

test("scores are folded to white's point of view", () => {
  assert.equal(toWhiteCp({ cp: 50 }, "b"), -50);
  assert.equal(toWhiteCp({ mate: 2 }, "w"), 9980);
  assert.equal(toWhiteCp({ mate: 2 }, "b"), -9980);
  assert.equal(toWhiteCp({ mate: 0 }, "w"), -10000);
});

test("grades moves like MoveAnnotator.swift", () => {
  const j = (beforeCp, afterCp, moverIsWhite = true) =>
    judgeMove({ played: "a2a3", engineBest: "e2e4", beforeCp, afterCp, moverIsWhite }).quality;
  assert.equal(judgeMove({ played: "e2e4", engineBest: "e2e4", beforeCp: 30, afterCp: -500, moverIsWhite: true }).quality, "best");
  assert.equal(j(30, 20), "excellent");
  assert.equal(j(30, 0), "good");
  assert.equal(j(30, -50), "inaccuracy");
  assert.equal(j(30, -120), "mistake");
  assert.equal(j(30, -121), "blunder");
  assert.equal(j(-30, 100, false), "mistake");
});

test("fixes an impossible side to move", () => {
  // Black king in check from the rook, so it must be black to move.
  const p = preparePosition("4k3/8/8/8/8/8/8/4RK2 w - - 0 1");
  assert.equal(p.status, "ok");
  assert.equal(p.turn, "b");
  assert.equal(p.corrected, true);
  assert.equal(preparePosition("4k3/8/8/8/8/8/8/4RK2 w - - 0 1", "w").status, "invalid");
});

test("detects mate and stalemate", () => {
  assert.equal(preparePosition("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1").status, "checkmate");
  assert.equal(preparePosition("7k/8/6QK/8/8/8/8/8 b - - 0 1").status, "stalemate");
});

test("links consecutive positions and renders SAN", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const next = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  assert.deepEqual(followingMove(start, "e2e4", next), { san: "e4", uci: "e2e4" });
  assert.equal(followingMove(start, "d2d4", next), null);
  assert.deepEqual(pvToSan(start, ["e2e4", "e7e5", "g1f3", "zzzz"]), ["e4", "e5", "Nf3"]);
});
