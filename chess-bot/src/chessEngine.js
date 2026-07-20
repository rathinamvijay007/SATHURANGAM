// Chess AI Engine (Minimax with Alpha-Beta Pruning & Piece-Square Tables)

// Piece weights for evaluation
const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

// Piece-Square Tables (PST) to guide positional play
// These tables are written from White's perspective (index 0 is a8, index 63 is h1)
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

// King Middle Game PST
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

// King End Game PST
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

// Flat 1D arrays of the PSTs for fast indexing
const pstMap = {
  p: PAWN_PST.flat(),
  n: KNIGHT_PST.flat(),
  b: BISHOP_PST.flat(),
  r: ROOK_PST.flat(),
  q: QUEEN_PST.flat(),
  k_mid: KING_MID_PST.flat(),
  k_end: KING_END_PST.flat()
};

// Help map board index to 0-63 row-major format
// chess.js squares are represented as 'a1', 'b1', ...
function getSquareIndex(square) {
  const file = square.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
  const rank = 8 - parseInt(square.charAt(1)); // '8' -> 0, '1' -> 7
  return rank * 8 + file;
}

// Check if endgame state (both queens gone, or one queen gone and remaining side has <= 1 minor piece)
function isEndgame(chessInstance) {
  let whitePieces = 0;
  let blackPieces = 0;
  let whiteQueen = false;
  let blackQueen = false;

  const board = chessInstance.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        if (piece.type === 'q') {
          if (piece.color === 'w') whiteQueen = true;
          else blackQueen = true;
        } else if (piece.type !== 'k') {
          if (piece.color === 'w') whitePieces++;
          else blackPieces++;
        }
      }
    }
  }

  if (!whiteQueen && !blackQueen) return true;
  if (whiteQueen && whitePieces <= 1) return true;
  if (blackQueen && blackPieces <= 1) return true;
  return false;
}

// Evaluate board from white's perspective
export function evaluateBoard(chessInstance, personality = 'standard') {
  let score = 0;
  const board = chessInstance.board();
  const endgame = isEndgame(chessInstance);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        let val = PIECE_VALUES[piece.type];
        const isWhite = piece.color === 'w';
        const index = r * 8 + c;
        
        // Flip row index for black
        const pstIndex = isWhite ? index : ((7 - r) * 8 + c);
        
        // Get PST value
        let pstVal = 0;
        if (piece.type === 'k') {
          pstVal = endgame ? pstMap.k_end[pstIndex] : pstMap.k_mid[pstIndex];
        } else {
          pstVal = pstMap[piece.type][pstIndex];
        }

        // Nelson ELO 1300 adjustment: values early/active Queen moves more
        if (personality === 'nelson' && piece.type === 'q') {
          // Incentivize Queen activity and center control aggressively
          pstVal += 15;
        }

        const totalValue = val + pstVal;
        if (isWhite) {
          score += totalValue;
        } else {
          score -= totalValue;
        }
      }
    }
  }

  // Draw buffer penalty/incentives
  if (chessInstance.inDraw()) {
    return 0; // Draw is neutral score
  }

  return score;
}

// Move ordering for Alpha-Beta efficiency (MVV-LVA)
function orderMoves(chessInstance, moves) {
  return moves.map(move => {
    let score = 0;
    
    // Sort captures by MVV-LVA (Most Valuable Victim - Least Valuable Aggressor)
    if (move.captured) {
      const victimValue = PIECE_VALUES[move.captured] || 0;
      const attackerValue = PIECE_VALUES[move.piece] || 0;
      score += 1000 + (victimValue - attackerValue / 100);
    }
    
    // Promote moves get priority
    if (move.promotion) {
      score += 900;
    }

    // Giving a check is highly prioritized
    // Note: check requires making the move and verifying, which is heavy,
    // so we can approximate or use simple flags if available,
    // but standard MVV-LVA + promotion is usually excellent.
    if (move.san.includes('+')) {
      score += 500;
    }

    // Penalize moving pieces into squares attacked by lower value pieces
    // (A simple heuristic that we can approximate)

    return { move, score };
  })
  .sort((a, b) => b.score - a.score)
  .map(item => item.move);
}

// Simple transposition cache to avoid re-evaluating identical positions
const transpositionTable = new Map();

export function clearTranspositionTable() {
  transpositionTable.clear();
}

// Quiescence Search: search only captures to avoid the horizon effect
function quiescenceSearch(chessInstance, alpha, beta, isWhite) {
  const activeColor = chessInstance.turn();
  const sideMultiplier = activeColor === 'w' ? 1 : -1;
  const standPatScore = evaluateBoard(chessInstance) * sideMultiplier;

  if (isWhite) {
    if (standPatScore >= beta) return beta;
    if (standPatScore > alpha) alpha = standPatScore;

    // Generate only capture moves
    const rawMoves = chessInstance.moves({ verbose: true }).filter(m => m.captured);
    const orderedMovesList = orderMoves(chessInstance, rawMoves);

    for (const move of orderedMovesList) {
      chessInstance.move(move);
      const score = quiescenceSearch(chessInstance, alpha, beta, false);
      chessInstance.undo();

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    if (standPatScore <= alpha) return alpha;
    if (standPatScore < beta) beta = standPatScore;

    const rawMoves = chessInstance.moves({ verbose: true }).filter(m => m.captured);
    const orderedMovesList = orderMoves(chessInstance, rawMoves);

    for (const move of orderedMovesList) {
      chessInstance.move(move);
      const score = quiescenceSearch(chessInstance, alpha, beta, true);
      chessInstance.undo();

      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

// Minimax with Alpha-Beta Pruning
function minimax(chessInstance, depth, alpha, beta, isMaximizing, personality = 'standard') {
  // Transposition check
  const fen = chessInstance.fen().split(' ').slice(0, 4).join(' '); // Simple FEN representation
  const cached = transpositionTable.get(fen);
  if (cached && cached.depth >= depth) {
    return cached.score;
  }

  // Base cases
  if (depth === 0) {
    const qScore = quiescenceSearch(chessInstance, alpha, beta, isMaximizing);
    return qScore;
  }

  if (chessInstance.isGameOver()) {
    if (chessInstance.inCheckmate()) {
      // Checkmate score is weighted by depth so engine finds fastest mate
      return isMaximizing ? -25000 + (5 - depth) : 25000 - (5 - depth);
    }
    return 0; // Draw/stalemate
  }

  const rawMoves = chessInstance.moves({ verbose: true });
  const orderedMovesList = orderMoves(chessInstance, rawMoves);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of orderedMovesList) {
      chessInstance.move(move);
      const evaluation = minimax(chessInstance, depth - 1, alpha, beta, false, personality);
      chessInstance.undo();
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Beta cut-off
    }
    transpositionTable.set(fen, { score: maxEval, depth });
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of orderedMovesList) {
      chessInstance.move(move);
      const evaluation = minimax(chessInstance, depth - 1, alpha, beta, true, personality);
      chessInstance.undo();
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Alpha cut-off
    }
    transpositionTable.set(fen, { score: minEval, depth });
    return minEval;
  }
}

// Main AI API: returns the best move for the active turn
export function getBestMove(chessInstance, botType = 'beth') {
  const turn = chessInstance.turn(); // 'w' or 'b'
  const isWhite = turn === 'w';
  const possibleMoves = chessInstance.moves({ verbose: true });

  if (possibleMoves.length === 0) return null;

  // Martin: ELO 250 (plays randomly 80% of the time, otherwise depth 1 minimax)
  if (botType === 'martin') {
    if (Math.random() < 0.8) {
      const randomIndex = Math.floor(Math.random() * possibleMoves.length);
      return possibleMoves[randomIndex];
    }
    // Else do a quick depth 1 search to take free pieces
    return getMinimaxBestMove(chessInstance, 1, isWhite, 'standard');
  }

  // Nelson: ELO 1300 (heavy Queen bias, depth 3 search)
  if (botType === 'nelson') {
    return getMinimaxBestMove(chessInstance, 3, isWhite, 'nelson');
  }

  // Beth: ELO 1800 (depth 4 positional search)
  if (botType === 'beth') {
    return getMinimaxBestMove(chessInstance, 4, isWhite, 'standard');
  }

  // Antigravity AI: ELO 2200 (depth 4/5 optimized search with caching)
  if (botType === 'antigravity') {
    // If fewer pieces are on the board, we can search deeper (depth 5)
    const pieceCount = chessInstance.board().flat().filter(p => p !== null).length;
    const depth = pieceCount < 12 ? 5 : 4;
    return getMinimaxBestMove(chessInstance, depth, isWhite, 'standard');
  }

  // Default to Beth
  return getMinimaxBestMove(chessInstance, 4, isWhite, 'standard');
}

// Find the best move using minimax alpha-beta search
function getMinimaxBestMove(chessInstance, depth, isWhite, personality) {
  const possibleMoves = chessInstance.moves({ verbose: true });
  const orderedMovesList = orderMoves(chessInstance, possibleMoves);

  let bestMove = null;
  let alpha = -Infinity;
  let beta = Infinity;

  if (isWhite) {
    let bestValue = -Infinity;
    for (const move of orderedMovesList) {
      chessInstance.move(move);
      const boardValue = minimax(chessInstance, depth - 1, alpha, beta, false, personality);
      chessInstance.undo();
      if (boardValue > bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
      alpha = Math.max(alpha, boardValue);
    }
  } else {
    let bestValue = Infinity;
    for (const move of orderedMovesList) {
      chessInstance.move(move);
      const boardValue = minimax(chessInstance, depth - 1, alpha, beta, true, personality);
      chessInstance.undo();
      if (boardValue < bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
      beta = Math.min(beta, boardValue);
    }
  }

  return bestMove;
}
