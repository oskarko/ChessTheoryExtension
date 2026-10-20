import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { evaluatePolicy } = createRequire(import.meta.url)("../src/content/policy.js");
const page = (pathname, extra = {}) => evaluatePolicy({ pathname, hasResult: false, hasRunningClock: false, ...extra });

test("analysis board and bot games are allowed", () => {
  assert.deepEqual(page("/analysis"), { allowed: true, context: "analysis" });
  assert.deepEqual(page("/analysis/game/live/123456"), { allowed: true, context: "analysis" });
  assert.deepEqual(page("/play/computer"), { allowed: true, context: "computer" });
  assert.deepEqual(page("/play/computer/discover"), { allowed: true, context: "computer" });
});

test("games are only allowed once finished", () => {
  assert.equal(page("/game/live/123").allowed, false);
  assert.equal(page("/game/daily/123").allowed, false);
  assert.equal(page("/game/live/123", { hasResult: true, hasRunningClock: true }).allowed, false);
  assert.deepEqual(page("/game/live/123", { hasResult: true }), { allowed: true, context: "finished" });
  assert.equal(page("/live/game/123", { hasResult: true }).allowed, true);
});

test("everything else is denied", () => {
  for (const p of ["/play/online", "/play", "/", "/puzzles/rated", "/puzzles/rush", "/tv", "/events/x", "/analysisx", "/play/computers"]) {
    assert.equal(page(p, { hasResult: true }).allowed, false, p);
  }
});
