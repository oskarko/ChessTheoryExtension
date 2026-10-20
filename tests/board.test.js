import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { parsePieceClasses, buildPosition } = createRequire(import.meta.url)("../src/content/board.js");

const START = [
  "wr square-11", "wn square-21", "wb square-31", "wq square-41", "wk square-51", "wb square-61", "wn square-71", "wr square-81",
  ..."12345678".split("").map((f) => `wp square-${f}2`),
  ..."12345678".split("").map((f) => `bp square-${f}7`),
  "br square-18", "bn square-28", "bb square-38", "bq square-48", "bk square-58", "bb square-68", "bn square-78", "br square-88",
];
const pieces = (list) => list.map((c) => parsePieceClasses(`piece ${c}`));
const sq = (s) => ({ file: "abcdefgh".indexOf(s[0]) + 1, rank: Number(s[1]) });

test("parses chess.com piece classes in any order", () => {
  assert.deepEqual(parsePieceClasses("piece wp square-52"), { color: "w", type: "p", file: 5, rank: 2 });
  assert.deepEqual(parsePieceClasses("piece square-58 bk"), { color: "b", type: "k", file: 5, rank: 8 });
  assert.equal(parsePieceClasses("piece square-58"), null);
});

test("start position", () => {
  const pos = buildPosition({ pieces: pieces(START) });
  assert.equal(pos.fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  assert.equal(pos.turnSource, "default");
});

test("last-move highlights give side to move and en passant", () => {
  const list = START.map((c) => (c === "wp square-52" ? "wp square-54" : c));
  const pos = buildPosition({ pieces: pieces(list), highlights: [sq("e2"), sq("e4")] });
  assert.equal(pos.fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
  assert.equal(pos.lastMove, "e2e4");
  assert.equal(pos.turnSource, "highlight");
});

test("falls back to the move list for the side to move", () => {
  const pos = buildPosition({ pieces: pieces(START), moveListTurn: "b" });
  assert.equal(pos.turn, "b");
  assert.equal(pos.turnSource, "movelist");
});

test("missing king is not a position", () => {
  assert.equal(buildPosition({ pieces: pieces(START.filter((c) => c !== "bk square-58")) }), null);
});
