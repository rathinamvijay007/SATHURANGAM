// Chess AI Engine — Minimax with Alpha-Beta Pruning & Piece-Square Tables
// Compatible with chess.js v1.x API

// ─── Piece weights ────────────────────────────────────────────────────────────
export const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

// ─── Piece-Square Tables (from White's perspective) ───────────────────────────
const PAWN_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_PST = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_PST = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [0,  0,  0,  5,  5,  0,  0,  0]
];

const QUEEN_PST = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [-5,  0,  5,  5,  5,  5,  0, -5],
  [0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  5,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_MID_PST = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20, 20,  0,  0,  0,  0, 20, 20],
  [20, 30, 10,  0,  0, 10, 30, 20]
];

const KING_END_PST = [
  [-50,-40,-30,-20,-20,-30,-40,-50],
  [-30,-20,-10,  0,  0,-10,-20,-30],
  [-30,-10, 20, 30, 30, 20,-10,-30],
  [-30,-10, 30, 40, 40, 30,-10,-30],
  [-30,-10, 30, 40, 40, 30,-10,-30],
  [-30,-10, 20, 30, 30, 20,-10,-30],
  [-30,-30,  0,  0,  0,  0,-30,-30],
  [-50,-30,-30,-30,-30,-30,-30,-50]
];

const pstMap = {
  p: PAWN_PST.flat(),
  n: KNIGHT_PST.flat(),
  b: BISHOP_PST.flat(),
  r: ROOK_PST.flat(),
  q: QUEEN_PST.flat(),
  k_mid: KING_MID_PST.flat(),
  k_end: KING_END_PST.flat()
};

// ─── chess.js v1.x compatible helper wrappers ─────────────────────────────────

/** Returns true if the game is in checkmate (chess.js v1.x API) */
function isCheckmateState(g) {
  return typeof g.isCheckmate === 'function' ? g.isCheckmate() : false;
}

/** Returns true if the game is a draw of any kind (chess.js v1.x API) */
function isDrawState(g) {
  if (typeof g.isDraw === 'function') return g.isDraw();
  // Fallback — chess.js may expose individual checks
  return (
    (typeof g.isStalemate === 'function' && g.isStalemate()) ||
    (typeof g.isThreefoldRepetition === 'function' && g.isThreefoldRepetition()) ||
    (typeof g.isInsufficientMaterial === 'function' && g.isInsufficientMaterial())
  );
}

// ─── Endgame detector ─────────────────────────────────────────────────────────
function isEndgame(g) {
  let whitePieces = 0, blackPieces = 0;
  let whiteQueen = false, blackQueen = false;

  g.board().forEach(row => row.forEach(piece => {
    if (!piece) return;
    if (piece.type === 'q') {
      piece.color === 'w' ? (whiteQueen = true) : (blackQueen = true);
    } else if (piece.type !== 'k') {
      piece.color === 'w' ? whitePieces++ : blackPieces++;
    }
  }));

  if (!whiteQueen && !blackQueen) return true;
  if (whiteQueen && whitePieces <= 1) return true;
  if (blackQueen && blackPieces <= 1) return true;
  return false;
}

// ─── Board Evaluation (from White's perspective) ──────────────────────────────
export function evaluateBoard(g, personality = 'standard') {
  if (isDrawState(g)) return 0;

  let score = 0;
  const endgame = isEndgame(g);

  g.board().forEach((row, r) => row.forEach((piece, c) => {
    if (!piece) return;

    const isWhite = piece.color === 'w';
    const pstIndex = isWhite ? (r * 8 + c) : ((7 - r) * 8 + c);

    let pstVal = 0;
    if (piece.type === 'k') {
      pstVal = endgame ? pstMap.k_end[pstIndex] : pstMap.k_mid[pstIndex];
    } else {
      pstVal = pstMap[piece.type][pstIndex];
    }

    if (personality === 'nelson' && piece.type === 'q') pstVal += 15;

    const total = PIECE_VALUES[piece.type] + pstVal;
    score += isWhite ? total : -total;
  }));

  return score;
}

// ─── Move ordering (MVV-LVA + promotions + checks) ───────────────────────────
function orderMoves(g, moves) {
  return moves
    .map(move => {
      let score = 0;
      if (move.captured) {
        score += 1000 + (PIECE_VALUES[move.captured] || 0) - (PIECE_VALUES[move.piece] || 0) / 100;
      }
      if (move.promotion) score += 900;
      if (move.san && move.san.includes('+')) score += 500;
      return { move, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.move);
}

// ─── Transposition table ──────────────────────────────────────────────────────
const transpositionTable = new Map();

export function clearTranspositionTable() {
  transpositionTable.clear();
}

// ─── Quiescence Search ────────────────────────────────────────────────────────
function quiescenceSearch(g, alpha, beta, isWhite) {
  const sideMultiplier = g.turn() === 'w' ? 1 : -1;
  const standPat = evaluateBoard(g) * sideMultiplier;

  if (isWhite) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const captures = orderMoves(g, g.moves({ verbose: true }).filter(m => m.captured));
    for (const move of captures) {
      g.move(move);
      const score = quiescenceSearch(g, alpha, beta, false);
      g.undo();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
    const captures = orderMoves(g, g.moves({ verbose: true }).filter(m => m.captured));
    for (const move of captures) {
      g.move(move);
      const score = quiescenceSearch(g, alpha, beta, true);
      g.undo();
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

// ─── Minimax with Alpha-Beta Pruning ─────────────────────────────────────────
function minimax(g, depth, alpha, beta, isMaximizing, personality = 'standard') {
  const fen = g.fen().split(' ').slice(0, 4).join(' ');
  const cached = transpositionTable.get(fen);
  if (cached && cached.depth >= depth) return cached.score;

  if (depth === 0) return quiescenceSearch(g, alpha, beta, isMaximizing);

  if (g.isGameOver()) {
    if (isCheckmateState(g)) {
      return isMaximizing ? -25000 + (5 - depth) : 25000 - (5 - depth);
    }
    return 0; // Draw/stalemate
  }

  const moves = orderMoves(g, g.moves({ verbose: true }));

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      g.move(move);
      const eval_ = minimax(g, depth - 1, alpha, beta, false, personality);
      g.undo();
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    transpositionTable.set(fen, { score: maxEval, depth });
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      g.move(move);
      const eval_ = minimax(g, depth - 1, alpha, beta, true, personality);
      g.undo();
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    transpositionTable.set(fen, { score: minEval, depth });
    return minEval;
  }
}

// ─── Internal: run minimax and return best move ───────────────────────────────
function getMinimaxBestMove(g, depth, isWhite, personality) {
  const moves = orderMoves(g, g.moves({ verbose: true }));
  let bestMove = null;
  let alpha = -Infinity;
  let beta = Infinity;

  if (isWhite) {
    let bestVal = -Infinity;
    for (const move of moves) {
      g.move(move);
      const val = minimax(g, depth - 1, alpha, beta, false, personality);
      g.undo();
      if (val > bestVal) { bestVal = val; bestMove = move; }
      alpha = Math.max(alpha, val);
    }
  } else {
    let bestVal = Infinity;
    for (const move of moves) {
      g.move(move);
      const val = minimax(g, depth - 1, alpha, beta, true, personality);
      g.undo();
      if (val < bestVal) { bestVal = val; bestMove = move; }
      beta = Math.min(beta, val);
    }
  }

  return bestMove;
}

// ─── Public API: returns the best move for the bot ───────────────────────────
/**
 * @param {Chess} g - chess.js v1.x instance
 * @param {string} botType - 'martin' | 'nelson' | 'beth' | 'antigravity'
 */
export function getBestMove(g, botType = 'beth') {
  const isWhite = g.turn() === 'w';
  const moves = g.moves({ verbose: true });
  if (moves.length === 0) return null;

  switch (botType) {
    case 'martin':
      // 80% random, 20% depth-1 greedy
      if (Math.random() < 0.8) return moves[Math.floor(Math.random() * moves.length)];
      return getMinimaxBestMove(g, 1, isWhite, 'standard');

    case 'nelson':
      return getMinimaxBestMove(g, 3, isWhite, 'nelson');

    case 'beth':
      return getMinimaxBestMove(g, 4, isWhite, 'standard');

    case 'antigravity': {
      const pieceCount = g.board().flat().filter(Boolean).length;
      const depth = pieceCount < 12 ? 5 : 4;
      return getMinimaxBestMove(g, depth, isWhite, 'standard');
    }

    default:
      return getMinimaxBestMove(g, 4, isWhite, 'standard');
  }
}
