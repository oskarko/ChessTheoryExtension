// Turns what chess.com draws on its board into a FEN string.
//
// chess.com renders each piece as `<div class="piece wp square-52">`:
// colour+type (`wp` = white pawn) and `square-<file><rank>`, both 1-based.
// The last move is marked with two `<div class="highlight square-XY">`.
// These functions are DOM-free so they can be unit tested in Node.
(function (root) {
  const PIECE = /^([wb])([pnbrqk])$/;
  const SQUARE = /^square-([1-8])([1-8])$/;

  /** @returns {{file:number, rank:number} | null} 1-based file/rank */
  function parseSquareClass(classString) {
    for (const token of classString.split(/\s+/)) {
      const m = SQUARE.exec(token);
      if (m) return { file: Number(m[1]), rank: Number(m[2]) };
    }
    return null;
  }

  /** @returns {{color:'w'|'b', type:string, file:number, rank:number} | null} */
  function parsePieceClasses(classString) {
    let color = null;
    let type = null;
    for (const token of classString.split(/\s+/)) {
      const m = PIECE.exec(token);
      if (m) {
        color = m[1];
        type = m[2];
      }
    }
    const square = parseSquareClass(classString);
    if (!color || !square) return null;
    return { color, type, ...square };
  }

  function squareName({ file, rank }) {
    return "abcdefgh"[file - 1] + rank;
  }

  /**
   * @param {object} input
   * @param {Array<{color:string,type:string,file:number,rank:number}>} input.pieces
   * @param {Array<{file:number,rank:number}>} [input.highlights] last-move squares
   * @param {'w'|'b'|null} [input.moveListTurn] side to move according to the move list
   * @returns {{fen:string, turn:'w'|'b', turnSource:string, lastMove:string|null} | null}
   *          null when the board is not a playable position (e.g. missing king).
   */
  function buildPosition({ pieces, highlights = [], moveListTurn = null }) {
    const grid = new Map(); // "file,rank" -> piece
    for (const p of pieces) grid.set(`${p.file},${p.rank}`, p);
    const at = (file, rank) => grid.get(`${file},${rank}`);

    const kings = pieces.filter((p) => p.type === "k");
    if (kings.filter((k) => k.color === "w").length !== 1) return null;
    if (kings.filter((k) => k.color === "b").length !== 1) return null;

    // Last move: of the two highlighted squares, the occupied one is the
    // destination and its piece belongs to the side that just moved.
    let lastMove = null;
    let mover = null;
    const marked = dedupe(highlights);
    if (marked.length === 2) {
      const occupied = marked.filter((s) => at(s.file, s.rank));
      if (occupied.length === 1) {
        const to = occupied[0];
        const from = marked.find((s) => s !== to);
        mover = at(to.file, to.rank).color;
        lastMove = squareName(from) + squareName(to);
      }
    }

    let turn = "w";
    let turnSource = "default";
    if (mover) {
      turn = mover === "w" ? "b" : "w";
      turnSource = "highlight";
    } else if (moveListTurn) {
      turn = moveListTurn;
      turnSource = "movelist";
    }

    const rows = [];
    for (let rank = 8; rank >= 1; rank--) {
      let row = "";
      let empty = 0;
      for (let file = 1; file <= 8; file++) {
        const p = at(file, rank);
        if (!p) {
          empty++;
          continue;
        }
        if (empty) row += empty;
        empty = 0;
        row += p.color === "w" ? p.type.toUpperCase() : p.type;
      }
      if (empty) row += empty;
      rows.push(row);
    }

    // Castling rights can't be read from the board; assume they still exist
    // whenever king and rook sit on their original squares.
    const is = (file, rank, color, type) => {
      const p = at(file, rank);
      return !!p && p.color === color && p.type === type;
    };
    let castling = "";
    if (is(5, 1, "w", "k")) {
      if (is(8, 1, "w", "r")) castling += "K";
      if (is(1, 1, "w", "r")) castling += "Q";
    }
    if (is(5, 8, "b", "k")) {
      if (is(8, 8, "b", "r")) castling += "k";
      if (is(1, 8, "b", "r")) castling += "q";
    }

    let enPassant = "-";
    if (lastMove) {
      const from = marked.find((s) => squareName(s) === lastMove.slice(0, 2));
      const to = marked.find((s) => squareName(s) === lastMove.slice(2, 4));
      const piece = at(to.file, to.rank);
      if (piece.type === "p" && from.file === to.file && Math.abs(from.rank - to.rank) === 2) {
        enPassant = squareName({ file: to.file, rank: (from.rank + to.rank) / 2 });
      }
    }

    const fen = `${rows.join("/")} ${turn} ${castling || "-"} ${enPassant} 0 1`;
    return { fen, turn, turnSource, lastMove };
  }

  function dedupe(squares) {
    const seen = new Set();
    return squares.filter((s) => {
      const key = `${s.file},${s.rank}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const api = { parsePieceClasses, parseSquareClass, buildPosition, squareName };
  root.CT = Object.assign(root.CT || {}, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
