// Fair-play gate. The extension is an allowlist: it only analyses pages where
// engine help is permitted. Anything not explicitly listed here stays off.
//
//   /analysis…                 analysis board (incl. reviewing finished games)
//   /play/computer…            games against chess.com bots
//   /game/…, /live/…, /daily/… only once the game has a result and no clock runs
//
// Everything else (online games, spectating games in progress, puzzles, …) is denied.
(function (root) {
  const ANALYSIS = /^\/analysis(\/|$)/;
  const COMPUTER = /^\/play\/computer(\/|$)/;
  const GAME = /^\/(game|live|daily)(\/|$)/;

  /**
   * @param {{pathname: string, hasResult: boolean, hasRunningClock: boolean}} page
   * @returns {{allowed: boolean, context: string}}
   */
  function evaluatePolicy({ pathname, hasResult, hasRunningClock }) {
    if (ANALYSIS.test(pathname)) return { allowed: true, context: "analysis" };
    if (COMPUTER.test(pathname)) return { allowed: true, context: "computer" };
    if (GAME.test(pathname)) return { allowed: true, context: "finished" };}

  const api = { evaluatePolicy };
  root.CT = Object.assign(root.CT || {}, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
