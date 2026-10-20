// Page gate. The extension is an allowlist: it only analyses the pages listed
// here. Anything not explicitly listed stays off.
//
//   /analysis…                 analysis board (incl. reviewing finished games)
//   /play/computer…            games against chess.com bots
//   /game/…, /live/…, /daily/… games, finished or in progress; in progress is reported
//                              separately so the panel can show the fair-play warning
//
// Everything else (/play/online lobby, puzzles, TV, …) is denied.
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
    if (GAME.test(pathname)) {
      return { allowed: true, context: hasResult && !hasRunningClock ? "finished" : "in-progress" };
    }
    return { allowed: false, context: "not-allowed" };
  }

  const api = { evaluatePolicy };
  root.CT = Object.assign(root.CT || {}, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
