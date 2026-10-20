// Reads the chess.com board and talks to the side panel over a port.
// Nothing runs until the side panel connects, and nothing is reported (and
// all arrows are removed) whenever the fair-play policy says the page is off.
(function () {
  const { evaluatePolicy, parsePieceClasses, parseSquareClass, buildPosition } = globalThis.CT;

  // chess.com selectors live here so they are easy to update when the site changes.
  const SELECTORS = {
    board: "wc-chess-board, chess-board",
    piece: ".piece",
    highlight: ".highlight",
    ignoredPieceContainer: ".promotion-window, .promotion-piece",
    moveListSelected:
      "wc-simple-move-list .selected, .move-list .selected, [class*='move-list'] .node.selected",
    result: ".game-result, .game-over-modal-content, [data-cy='game-over-modal'], .game-over-header-component",
    // chess.com keeps `clock-player-turn` after the game ends, so a clock counts as
    // running only if its displayed time actually changes (see clocksRunning).
    clock: ".clock-component",
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  let port = null;
  let lastSent = "";
  let observedBoard = null;
  let observer = null;
  let debounce = null;
  let timer = null;
  let arrows = [];
  let clockText = "";
  let clockChangedAt = 0;

  chrome.runtime.onConnect.addListener((p) => {
    if (p.name !== "ct-panel") return;
    if (port) port.disconnect();
    port = p;
    lastSent = "";
    port.onMessage.addListener(onPanelMessage);
    port.onDisconnect.addListener(() => {
      if (port === p) stop();
    });
    timer = setInterval(update, 500);
    update();
  });

  function stop() {
    port = null;
    clearInterval(timer);
    timer = null;
    observer?.disconnect();
    observer = null;
    observedBoard = null;
    arrows = [];
    removeOverlay();
  }

  function onPanelMessage(msg) {
    if (msg.type === "arrows") {
      arrows = msg.arrows || [];
      drawArrows();
    } else if (msg.type === "refresh") {
      lastSent = "";
      update();
    }
  }

  function findBoard() {
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll(SELECTORS.board)) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  function watch(board) {
    if (board === observedBoard) return;
    observer?.disconnect();
    observedBoard = board;
    if (!board) return;
    observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(update, 120);
    });
    observer.observe(board, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }

  function readState(board) {
    const policy = evaluatePolicy({
      pathname: location.pathname,
      hasResult: !!document.querySelector(SELECTORS.result),
      hasRunningClock: clocksRunning(),
    });
    if (!policy.allowed) return { allowed: false, context: policy.context };
    if (!board) return { allowed: true, context: policy.context, fen: null, error: "no-board" };

    const pieces = [];
    for (const el of board.querySelectorAll(SELECTORS.piece)) {
      if (el.closest(SELECTORS.ignoredPieceContainer)) continue;
      if (el.classList.contains("dragging")) return null; // mid-drag: wait for the drop
      const p = parsePieceClasses(el.className);
      if (p) pieces.push(p);
    }

    const position = buildPosition({
      pieces,
      highlights: lastMoveHighlights(board),
      moveListTurn: moveListTurn(),
    });
    if (!position) return { allowed: true, context: policy.context, fen: null, error: "invalid-board" };

    return {
      allowed: true,
      context: policy.context,
      flipped: board.classList.contains("flipped"),
      ...position,
    };
  }

  function clocksRunning() {
    const text = [...document.querySelectorAll(SELECTORS.clock)].map((el) => el.textContent).join("|");
    if (text !== clockText) {
      if (clockText) clockChangedAt = Date.now();
      clockText = text;
    }
    return Date.now() - clockChangedAt < 3000;
  }

  // Right-click annotations are also `.highlight`; last-move ones are yellow.
  function lastMoveHighlights(board) {
    const all = [...board.querySelectorAll(SELECTORS.highlight)]
      .map((el) => ({ el, square: parseSquareClass(el.className) }))
      .filter((h) => h.square);
    if (all.length <= 2) return all.map((h) => h.square);
    const yellow = all.filter(({ el }) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(el.style.backgroundColor || "");
      return m && Number(m[1]) > 180 && Number(m[2]) > 180 && Number(m[3]) < 150;
    });
    return (yellow.length === 2 ? yellow : all).map((h) => h.square);
  }

  function moveListTurn() {
    const node = document.querySelector(SELECTORS.moveListSelected);
    if (!node) return null;
    const cls = node.className + " " + (node.parentElement?.className || "");
    if (/\bwhite/.test(cls)) return "b";
    if (/\bblack/.test(cls)) return "w";
    return null;
  }

  function update() {
    if (!port) return;
    const board = findBoard();
    watch(board);
    const state = readState(board);
    if (!state) return;
    if (!state.allowed || !state.fen) {
      arrows = [];
      removeOverlay();
    }
    const key = JSON.stringify(state);
    if (key === lastSent) return;
    lastSent = key;
    if (state.fen) {
      // A new position makes the previous suggestion stale.
      arrows = [];
      removeOverlay();
    }
    port.postMessage({ type: "state", state });
  }

  // ---- arrows ---------------------------------------------------------------

  function removeOverlay() {
    document.querySelectorAll(".ct-overlay").forEach((el) => el.remove());
  }

  function drawArrows() {
    removeOverlay();
    const board = observedBoard;
    if (!board || !arrows.length) return;
    const flipped = board.classList.contains("flipped");

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ct-overlay");
    svg.setAttribute("viewBox", "0 0 100 100");
    const defs = document.createElementNS(SVG_NS, "defs");
    svg.appendChild(defs);

    arrows.forEach((a, i) => {
      const id = `ct-head-${i}`;
      const marker = document.createElementNS(SVG_NS, "marker");
      marker.setAttribute("id", id);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "5");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "2.4");
      marker.setAttribute("markerHeight", "2.4");
      marker.setAttribute("orient", "auto");
      const head = document.createElementNS(SVG_NS, "path");
      head.setAttribute("d", "M0,0 L10,5 L0,10 z");
      head.setAttribute("fill", a.color);
      marker.appendChild(head);
      defs.appendChild(marker);

      const from = center(a.from, flipped);
      const to = center(a.to, flipped);
      // Stop the shaft short so the arrow head lands in the target square.
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const shorten = 3.2;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x - (dx / len) * shorten);
      line.setAttribute("y2", to.y - (dy / len) * shorten);
      line.setAttribute("stroke", a.color);
      line.setAttribute("stroke-width", a.width || 2.2);
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("opacity", a.opacity ?? 0.85);
      line.setAttribute("marker-end", `url(#${id})`);
      svg.appendChild(line);
    });

    board.appendChild(svg);
  }

  function center(square, flipped) {
    const file = "abcdefgh".indexOf(square[0]);
    const rank = Number(square[1]) - 1;
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;
    return { x: col * 12.5 + 6.25, y: row * 12.5 + 6.25 };
  }
})();
