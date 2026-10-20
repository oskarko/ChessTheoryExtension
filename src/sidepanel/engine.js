// Thin UCI driver around the Stockfish WASM worker.
//
// Only one search runs at a time. Asking for a new position while a search is
// running sends `stop` and queues the new job until the engine answers
// `bestmove`, so info lines of an old search never leak into the new one.

/** Parses a UCI `info` line that carries a score and a PV; returns null otherwise. */
export function parseInfo(line) {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;
  const tokens = line.split(" ");
  const info = { depth: 0, multipv: 1, score: null, pv: [], bound: null };
  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case "depth":
        info.depth = Number(tokens[++i]);
        break;
      case "multipv":
        info.multipv = Number(tokens[++i]);
        break;
      case "score": {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        info.score = kind === "mate" ? { mate: value } : { cp: value };
        if (tokens[i + 1] === "lowerbound" || tokens[i + 1] === "upperbound") info.bound = tokens[++i];
        break;
      }
      case "pv":
        info.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
    }
  }
  return info.score && info.pv.length ? info : null;
}

export class Engine {
  /**
   * @param {string} url worker script
   * @param {{onInfo: (job, info) => void, onBestMove: (job, move: string) => void}} handlers
   */
  constructor(url, { onInfo, onBestMove }) {
    this.onInfo = onInfo;
    this.onBestMove = onBestMove;
    this.current = null;
    this.pending = null;
    this.multipv = 0;
    this.ready = false;
    this.worker = new Worker(url);
    this.worker.onmessage = (e) => this.#receive(String(e.data));
    this.#send("uci");
  }

  /** Starts analysing `fen`; replaces whatever is running or queued. */
  analyse(fen, { depth, multipv }) {
    const job = { fen, depth, multipv };
    if (this.current || !this.ready) {
      this.pending = job;
      if (this.current) this.#send("stop");
      return job;
    }
    this.#start(job);
    return job;
  }

  /** Stops the running search and drops any queued one. */
  stop() {
    this.pending = null;
    if (this.current) {
      this.current.cancelled = true;
      this.#send("stop");
    }
  }

  #start(job) {
    if (job.multipv !== this.multipv) {
      this.#send(`setoption name MultiPV value ${job.multipv}`);
      this.multipv = job.multipv;
    }
    this.current = job;
    this.#send(`position fen ${job.fen}`);
    this.#send(`go depth ${job.depth}`);
  }

  #receive(line) {
    if (line === "uciok") {
      this.#send("setoption name Hash value 64");
      this.#send("isready");
    } else if (line === "readyok") {
      this.ready = true;
      this.#next();
    } else if (line.startsWith("bestmove")) {
      const job = this.current;
      this.current = null;
      if (job && !job.cancelled && !this.pending) this.onBestMove(job, line.split(" ")[1]);
      this.#next();
    } else if (this.current && !this.current.cancelled && !this.pending) {
      const info = parseInfo(line);
      if (info) this.onInfo(this.current, info);
    }
  }

  #next() {
    if (!this.pending || this.current || !this.ready) return;
    const job = this.pending;
    this.pending = null;
    this.#start(job);
  }

  #send(cmd) {
    this.worker.postMessage(cmd);
  }
}
