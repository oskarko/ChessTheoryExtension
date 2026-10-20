import { Engine } from "./engine.js";
import { preparePosition, followingMove, pvToSan } from "./position.js";
import { judgeMove, toWhiteCp, QUALITIES } from "./quality.js";

const DEFAULTS = { depth: 20, lines: 3, arrows: true };
// Below this depth the evaluation is too noisy to grade the move that follows.
const MIN_JUDGE_DEPTH = 10;
// Depth at which the move is graded, unless the previous position was searched less deeply.
const JUDGE_DEPTH = 16;
const ARROW_STYLES = [
  { color: "#2f9e44", width: 2.6, opacity: 0.9 },
  { color: "#1c7ed6", width: 1.9, opacity: 0.7 },
  { color: "#868e96", width: 1.6, opacity: 0.6 },
];
const CONTEXT_LABELS = {
  analysis: "Tablero de análisis",
  computer: "Partida contra bot",
  finished: "Partida terminada",
};
const INACTIVE_TEXT = {
  "in-progress":
    "Partida en curso: el análisis está desactivado por juego limpio. Se activará en cuanto la partida termine.",
  "not-allowed":
    "Esta página no está permitida. Abre el tablero de análisis, una partida contra un bot o una partida terminada.",
  "no-content": "Abre chess.com en esta pestaña (o recárgala si acabas de instalar la extensión).",
};

const $ = (id) => document.getElementById(id);

let settings = { ...DEFAULTS };
let turnOverride = "auto";
let port = null;
let tabId = null;
let pageState = null; // last state from the content script
let position = null; // prepared position being analysed
let lines = []; // per multipv: { info, san }
let judgement = null; // { san, uci, prev } until the new position is deep enough, then { san, quality, loss }
// Recent evaluations by FEN, used to grade the move that leaves each position.
// chess.com passes through intermediate board states while animating, so the
// position right before the current one is not necessarily the one moved from.
const evaluations = new Map();
const MAX_EVALUATIONS = 64;
let renderQueued = false;
let lastArrowsKey = "";

const engine = new Engine(chrome.runtime.getURL("vendor/stockfish/stockfish-18-lite-single.js"), {
  onInfo(job, info) {
    if (!position || job.fen !== position.fen || info.bound) return;
    lines[info.multipv - 1] = { info, san: pvToSan(job.fen, info.pv) };
    lines.length = Math.min(lines.length, job.multipv);
    if (info.multipv === 1) recordEvaluation(info);
    if (info.multipv === 1 && info.depth >= Math.min(judgement?.prev?.depth ?? Infinity, JUDGE_DEPTH)) {
      finishJudgement();
    }
    scheduleRender();
  },
  onBestMove(job) {
    // The search may stop short of the previous depth (e.g. a forced mate).
    if (position && job.fen === position.fen) finishJudgement();
    scheduleRender();
  },
});

/** Grades the move that led here, comparing evals of both positions at a similar depth. */
function finishJudgement() {
  if (!judgement?.prev || !lines[0]) return;
  const { prev, san, uci } = judgement;
  judgement = {
    san,
    ...judgeMove({
      played: uci,
      engineBest: prev.bestMove,
      beforeCp: prev.whiteCp,
      afterCp: toWhiteCp(lines[0].info.score, position.turn),
      moverIsWhite: prev.fen.split(" ")[1] === "w",
    }),
  };
}

function recordEvaluation(top) {
  if (top.depth < MIN_JUDGE_DEPTH) return;
  const snapshot = { fen: position.fen, bestMove: top.pv[0], whiteCp: toWhiteCp(top.score, position.turn), depth: top.depth };
  evaluations.delete(position.fen); // re-insert to keep the map ordered by recency
  evaluations.set(position.fen, snapshot);
  if (evaluations.size > MAX_EVALUATIONS) evaluations.delete(evaluations.keys().next().value);
}

/** Finds the evaluated position that `lastMove` turns into `fen`, most recent first. */
function moveInto(fen, lastMove) {
  if (!lastMove) return null;
  for (const prev of [...evaluations.values()].reverse()) {
    const move = followingMove(prev.fen, lastMove, fen);
    if (move) return { ...move, prev };
  }
  return null;
}

// ---- connection to the active chess.com tab -------------------------------

async function connectToActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (port && tab.id === tabId) return;
  port?.disconnect();
  tabId = tab.id;
  resetAnalysis();
  const p = chrome.tabs.connect(tab.id, { name: "ct-panel" });
  port = p;
  p.onMessage.addListener((msg) => {
    if (msg.type === "state") onPageState(msg.state);
  });
  p.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // no content script in this tab
    if (port !== p) return;
    port = null;
    onPageState({ allowed: false, context: "no-content" });
  });
}

chrome.tabs.onActivated.addListener(() => connectToActiveTab());
// chess.com is a single-page app: in-page navigation keeps the port alive.
// Only a real reload drops it, and then we reconnect once the page is ready.
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === tabId && info.status === "complete" && !port) connectToActiveTab();
});
chrome.windows?.onFocusChanged.addListener(() => connectToActiveTab());

function resetAnalysis() {
  engine.stop();
  position = null;
  lines = [];
  judgement = null;
  evaluations.clear();
  sendArrows([]);
}

// ---- reacting to the page -------------------------------------------------

function onPageState(state) {
  pageState = state;
  if (!state.allowed || !state.fen) {
    resetAnalysis();
    render();
    return;
  }
  analyseCurrent();
}

function analyseCurrent() {
  const state = pageState;
  if (!state?.allowed || !state.fen) return;

  const prepared = preparePosition(state.fen, turnOverride);
  if (position && prepared.fen === position.fen && prepared.status === position.status) return;

  judgement = moveInto(prepared.fen ?? state.fen, state.lastMove);

  position = { ...prepared, turnSource: state.turnSource };
  lines = [];
  sendArrows([]);
  if (prepared.status === "ok") {
    engine.analyse(prepared.fen, { depth: settings.depth, multipv: settings.lines });
  } else {
    engine.stop();
  }
  render();
}

// ---- rendering -------------------------------------------------------------

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  // A timer rather than requestAnimationFrame: rAF pauses while the panel is hidden,
  // which would also freeze the board arrows.
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 100);
}

function formatScore(score, turn) {
  // Shown from white's point of view, like chess.com and ChessTheory.
  if (score.mate !== undefined) {
    const whiteMates = (score.mate > 0) === (turn === "w");
    return `${whiteMates ? "" : "-"}M${Math.abs(score.mate)}`;
  }
  const cp = turn === "w" ? score.cp : -score.cp;
  return (cp > 0 ? "+" : "") + (cp / 100).toFixed(2);
}

function whiteShare(whiteCp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.004 * whiteCp)) - 1);
}

function render() {
  const state = pageState;
  const active = !!state?.allowed;
  const status = $("status");
  status.textContent = active ? CONTEXT_LABELS[state.context] ?? "Activo" : "Inactivo";
  status.className = `pill ${active ? "pill-on" : "pill-off"}`;

  $("inactive").hidden = active && !!state.fen;
  $("analysis").hidden = !(active && state.fen && position);
  $("fen-card").hidden = !(active && position?.fen);

  if (!active) {
    $("inactive-text").textContent = INACTIVE_TEXT[state?.context] ?? INACTIVE_TEXT["no-content"];
    return;
  }
  if (!state.fen || !position) {
    $("inactive-text").textContent =
      state.error === "invalid-board"
        ? "La posición del tablero no es válida (¿falta algún rey?)."
        : "No encuentro el tablero en esta página.";
    return;
  }

  $("fen").textContent = position.fen ?? state.fen;
  $("turn-hint").hidden = !(turnOverride === "auto" && position.turnSource === "default" && !position.corrected);

  const side = position.turn === "w" ? "blancas" : "negras";
  if (position.status !== "ok") {
    $("to-move").textContent = "";
    $("eval").textContent = "";
    $("depth").textContent = "";
    $("lines").replaceChildren();
    $("best-move").textContent =
      position.status === "checkmate" ? "Jaque mate" : position.status === "stalemate" ? "Tablas (ahogado)" : "Posición inválida";
    $("evalbar-white").style.width = position.status === "checkmate" ? (position.turn === "w" ? "0%" : "100%") : "50%";
  } else {
    $("to-move").textContent = `Juegan ${side}`;
    const top = lines[0];
    if (top) {
      $("best-move").textContent = top.san[0] ?? top.info.pv[0];
      $("eval").textContent = formatScore(top.info.score, position.turn);
      $("depth").textContent = `Profundidad ${top.info.depth}`;
      $("evalbar-white").style.width = `${whiteShare(toWhiteCp(top.info.score, position.turn))}%`;
    } else {
      $("best-move").textContent = "…";
      $("eval").textContent = "";
      $("depth").textContent = "Calculando…";
    }
    $("lines").replaceChildren(...lines.filter(Boolean).map((l) => lineItem(l)));
    updateArrows();
  }

  const lm = $("last-move");
  lm.hidden = !judgement;
  if (judgement) {
    const text = $("last-move-text");
    if (judgement.quality) {
      const q = QUALITIES[judgement.quality];
      const loss = judgement.quality === "best" || judgement.loss <= 0 ? "" : ` (−${(judgement.loss / 100).toFixed(2)})`;
      text.innerHTML = "";
      const strong = document.createElement("strong");
      strong.textContent = judgement.san;
      const label = document.createElement("span");
      label.className = `q-${judgement.quality}`;
      label.textContent = ` ${q.symbol} ${q.label}${loss}`;
      text.append(strong, label);
    } else {
      text.textContent = `${judgement.san} — evaluando…`;
    }
  }
}

function lineItem({ info, san }) {
  const li = document.createElement("li");
  const score = document.createElement("span");
  score.className = "score";
  score.textContent = formatScore(info.score, position.turn);
  const pv = document.createElement("span");
  pv.className = "pv";
  const first = document.createElement("b");
  first.textContent = san[0] ?? info.pv[0];
  pv.append(first, " " + san.slice(1).join(" "));
  li.append(score, pv);
  return li;
}

function updateArrows() {
  if (!settings.arrows || !lines[0] || lines[0].info.depth < 8) {
    sendArrows([]);
    return;
  }
  const arrows = lines
    .filter(Boolean)
    .slice(0, ARROW_STYLES.length)
    .map((l, i) => ({ from: l.info.pv[0].slice(0, 2), to: l.info.pv[0].slice(2, 4), ...ARROW_STYLES[i] }));
  sendArrows(arrows);
}

function sendArrows(arrows) {
  const key = JSON.stringify(arrows);
  if (key === lastArrowsKey) return;
  lastArrowsKey = key;
  port?.postMessage({ type: "arrows", arrows });
}

// ---- controls ---------------------------------------------------------------

function bindControls() {
  const depth = $("setting-depth");
  const linesSelect = $("setting-lines");
  const arrows = $("setting-arrows");
  depth.value = settings.depth;
  $("depth-value").textContent = settings.depth;
  linesSelect.value = settings.lines;
  arrows.checked = settings.arrows;

  depth.addEventListener("input", () => ($("depth-value").textContent = depth.value));
  depth.addEventListener("change", () => saveSettings({ depth: Number(depth.value) }));
  linesSelect.addEventListener("change", () => saveSettings({ lines: Number(linesSelect.value) }));
  arrows.addEventListener("change", () => saveSettings({ arrows: arrows.checked }));

  for (const button of $("turn-override").querySelectorAll("button")) {
    button.addEventListener("click", () => {
      turnOverride = button.dataset.value;
      for (const b of $("turn-override").querySelectorAll("button")) {
        b.setAttribute("aria-pressed", String(b === button));
      }
      position = null; // force a re-analysis with the new side to move
      analyseCurrent();
    });
  }

  $("copy-fen").addEventListener("click", () => navigator.clipboard.writeText($("fen").textContent));
}

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
  lastArrowsKey = "";
  if ("depth" in patch || "lines" in patch) {
    position = null;
    analyseCurrent();
  } else {
    render();
  }
}

(async function init() {
  try {
    const stored = await chrome.storage.local.get("settings");
    settings = { ...DEFAULTS, ...stored.settings };
  } catch {
    // keep defaults
  }
  bindControls();
  render();
  connectToActiveTab();
})();
