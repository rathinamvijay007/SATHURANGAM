import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import confetti from 'canvas-confetti';
import { soundManager } from './soundManager';
import { getBestMove, evaluateBoard, clearTranspositionTable } from './chessEngine';
import { getPieceImg } from './chessPieces';
import './App.css';

// Bot Profiles details
const BOTS = {
  martin: { name: 'Martin', elo: 250, avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60', tag: 'martin' },
  nelson: { name: 'Nelson', elo: 1300, avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&auto=format&fit=crop&q=60', tag: 'nelson' },
  beth: { name: 'Beth', elo: 1800, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60', tag: 'beth' },
  antigravity: { name: 'Antigravity AI', elo: 2200, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=60', tag: 'antigravity' }
};

const TIME_CONTROLS = {
  unlimited: { name: 'Unlimited', seconds: Infinity },
  rapid: { name: '10 Min (Rapid)', seconds: 600 },
  blitz: { name: '3 Min (Blitz)', seconds: 180 },
  bullet: { name: '1 Min (Bullet)', seconds: 60 }
};

function App() {
  // Game instance & History states
  const [game, setGame] = useState(() => new Chess());
  const [board, setBoard] = useState(() => game.board());
  const [turn, setTurn] = useState('w');
  const [history, setHistory] = useState([]); // List of verbose move objects
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 means viewing current live state
  
  // UI & Selection states
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [checkSquare, setCheckSquare] = useState(null);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [theme, setTheme] = useState('neo-green');
  const [soundOn, setSoundOn] = useState(true);
  
  // Players & Bots setup
  const [selectedBot, setSelectedBot] = useState('martin');
  const [timeControl, setTimeControl] = useState('rapid');
  const [botThinking, setBotThinking] = useState(false);
  
  // Evaluation & Game Review States
  const [evaluation, setEvaluation] = useState(0); // centipawns (from white's perspective)
  const [moveQualities, setMoveQualities] = useState([]); // Classifications for each move: 'best', 'blunder', etc.
  const [accuracyStats, setAccuracyStats] = useState(null); // { whiteAccuracy, blackAccuracy, counts }
  const [showReview, setShowReview] = useState(false);
  
  // Timers states
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const timerIntervalRef = useRef(null);
  
  // Promotion selection dialog
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to }

  // Game over overlay
  const [gameOverModal, setGameOverModal] = useState(null); // { title, reason, isWin }

  // 1. Manage Active Game Timers
  useEffect(() => {
    // Clear old timer
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    const limit = TIME_CONTROLS[timeControl].seconds;
    if (limit === Infinity || game.isGameOver() || gameOverModal) return;

    timerIntervalRef.current = setInterval(() => {
      if (turn === 'w') {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            handleTimeout('w');
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            handleTimeout('b');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timerIntervalRef.current);
  }, [turn, timeControl, game, gameOverModal]);

  // Reset timers on time control selection
  useEffect(() => {
    const limit = TIME_CONTROLS[timeControl].seconds;
    setWhiteTime(limit);
    setBlackTime(limit);
  }, [timeControl]);

  // 2. Play bot move when it is black's turn and game is active
  useEffect(() => {
    if (turn === 'b' && !game.isGameOver() && !gameOverModal && !botThinking && historyIndex === -1) {
      setBotThinking(true);
      
      // Calculate delay based on ELO to simulate thinking
      const baseDelay = selectedBot === 'martin' ? 400 : selectedBot === 'nelson' ? 800 : selectedBot === 'beth' ? 1200 : 1800;
      const thinkingDelay = baseDelay + Math.random() * 500;

      setTimeout(() => {
        const botMove = getBestMove(game, selectedBot);
        if (botMove) {
          executeMove(botMove.from, botMove.to, botMove.promotion || 'q');
        }
        setBotThinking(false);
      }, thinkingDelay);
    }
  }, [turn, game, selectedBot, gameOverModal, historyIndex]);

  // Clear transp table on unmount
  useEffect(() => {
    return () => clearTranspositionTable();
  }, []);

  // Helper: Format Time into MM:SS
  const formatTime = (timeInSecs) => {
    if (timeInSecs === Infinity) return '∞';
    const mins = Math.floor(timeInSecs / 60);
    const secs = timeInSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper: Get Checkmate or Draw State checking compatibility with older chess.js
  const checkCheckmate = (g) => {
    return g.inCheckmate ? g.inCheckmate() : (g.isCheckmate ? g.isCheckmate() : false);
  };

  const checkDraw = (g) => {
    if (g.inDraw) return g.inDraw();
    return g.isDraw ? g.isDraw() : (g.inStalemate() || g.inThreefoldRepetition() || g.inInsufficientMaterial());
  };

  // Timeout handler
  const handleTimeout = (timedOutColor) => {
    clearInterval(timerIntervalRef.current);
    if (soundOn) soundManager.playGameOver(timedOutColor === 'b');
    
    if (timedOutColor === 'w') {
      setGameOverModal({
        title: 'Black Wins!',
        reason: 'White ran out of time.',
        isWin: false
      });
    } else {
      triggerConfetti();
      setGameOverModal({
        title: 'White Wins!',
        reason: 'Black ran out of time.',
        isWin: true
      });
    }
  };

  // Resign handler
  const handleResign = () => {
    if (game.isGameOver() || gameOverModal) return;
    clearInterval(timerIntervalRef.current);
    if (soundOn) soundManager.playGameOver(false);

    setGameOverModal({
      title: 'Black Wins!',
      reason: 'White resigned.',
      isWin: false
    });
  };

  // Trigger celebration confetti
  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
  };

  // Classify move compared to best move evaluation drop
  const classifyMove = (evalBefore, evalAfter, playedMove, bestMoveScore, isWhiteTurn, isOpening) => {
    const scoreDiff = isWhiteTurn ? (bestMoveScore - evalAfter) : (evalAfter - bestMoveScore);
    const drop = Math.abs(scoreDiff);

    // Book move check (approximate for first 5 full moves)
    if (isOpening && drop <= 15) return 'book';

    if (drop === 0) {
      // If it's a winning tactical blow, mark it brilliant!
      if (Math.abs(evalAfter) > 600 && Math.abs(evalBefore) < 150) {
        return 'brilliant';
      }
      return 'best';
    }
    
    if (drop <= 20) return 'excellent';
    if (drop <= 50) return 'good';
    if (drop <= 100) return 'inaccuracy';
    if (drop <= 200) return 'mistake';
    return 'blunder';
  };

  // Calculate Accuracies and Quality Summary
  const compileGameReview = (movesList, qualities) => {
    if (movesList.length === 0) return;
    
    let whiteTotalLoss = 0;
    let whiteCount = 0;
    let blackTotalLoss = 0;
    let blackCount = 0;

    const counts = {
      white: { brilliant: 0, great: 0, best: 0, book: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      black: { brilliant: 0, great: 0, best: 0, book: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
    };

    qualities.forEach((q, idx) => {
      const isWhite = idx % 2 === 0;
      const key = isWhite ? 'white' : 'black';
      
      counts[key][q.quality]++;

      // Calculate centipawn drop (capped at 400 to avoid mate inflation)
      const loss = Math.min(q.drop, 400);
      if (isWhite) {
        whiteTotalLoss += loss;
        whiteCount++;
      } else {
        blackTotalLoss += loss;
        blackCount++;
      }
    });

    const whiteAvgLoss = whiteCount > 0 ? (whiteTotalLoss / whiteCount) : 0;
    const blackAvgLoss = blackCount > 0 ? (blackTotalLoss / blackCount) : 0;

    // Chess.com style accuracy formula: 100 * e^(-0.005 * avg_loss)
    const whiteAccuracy = Math.round(100 * Math.exp(-0.003 * whiteAvgLoss));
    const blackAccuracy = Math.round(100 * Math.exp(-0.003 * blackAvgLoss));

    setAccuracyStats({
      whiteAccuracy,
      blackAccuracy,
      counts
    });
  };

  // Execute board move update
  const executeMove = (from, to, promotion = 'q') => {
    const isWhiteTurn = game.turn() === 'w';
    const isOpening = history.length < 10;
    
    // Check values before move for evaluation comparison
    const evalBefore = evaluateBoard(game);

    // Calculate best move score to compare against played move
    const moves = game.moves({ verbose: true });
    let bestMoveVal = isWhiteTurn ? -Infinity : Infinity;
    
    moves.forEach(m => {
      game.move(m);
      const val = evaluateBoard(game);
      game.undo();
      if (isWhiteTurn) {
        if (val > bestMoveVal) bestMoveVal = val;
      } else {
        if (val < bestMoveVal) bestMoveVal = val;
      }
    });

    // Determine move outcomes (check, capture, promote)
    const checkState = game.inCheck();
    let moveObj = null;
    try {
      moveObj = game.move({ from, to, promotion });
    } catch (e) {
      return; // Invalid move
    }

    if (!moveObj) return;

    // Audio Playback
    if (soundOn) {
      if (moveObj.promotion) {
        soundManager.playPromote();
      } else if (game.inCheck()) {
        soundManager.playCheck();
      } else if (moveObj.captured) {
        soundManager.playCapture();
      } else {
        soundManager.playMove();
      }
    }

    // Determine evaluation after move
    const evalAfter = evaluateBoard(game);
    const drop = Math.abs(evalAfter - bestMoveVal);
    const quality = classifyMove(evalBefore, evalAfter, moveObj, bestMoveVal, isWhiteTurn, isOpening);

    // Update move history lists
    const updatedHistory = [...history, moveObj];
    const updatedQualities = [...moveQualities, { quality, drop }];

    // Set board states
    setHistory(updatedHistory);
    setMoveQualities(updatedQualities);
    setBoard(game.board());
    setTurn(game.turn());
    setLastMove({ from, to });
    setSelectedSquare(null);
    setLegalMoves([]);
    setEvaluation(evalAfter);

    // Handle check glow
    if (game.inCheck()) {
      // Find king of active side
      const boardGrid = game.board();
      let kSq = null;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardGrid[r][c];
          if (p && p.type === 'k' && p.color === game.turn()) {
            kSq = String.fromCharCode(97 + c) + (8 - r);
          }
        }
      }
      setCheckSquare(kSq);
    } else {
      setCheckSquare(null);
    }

    // Handle Game Over
    if (game.isGameOver()) {
      clearInterval(timerIntervalRef.current);
      
      let winnerColor = null;
      let modalReason = 'Draw';
      
      if (checkCheckmate(game)) {
        winnerColor = isWhiteTurn ? 'w' : 'b';
        modalReason = `Checkmate. ${winnerColor === 'w' ? 'White' : 'Black'} wins!`;
        if (soundOn) soundManager.playGameOver(winnerColor === 'w');
      } else if (game.inDraw ? game.inDraw() : false) {
        modalReason = 'Game drawn.';
        if (soundOn) soundManager.playGameOver(true);
      } else if (game.inStalemate()) {
        modalReason = 'Stalemate.';
        if (soundOn) soundManager.playGameOver(true);
      } else if (game.inThreefoldRepetition()) {
        modalReason = 'Threefold repetition draw.';
        if (soundOn) soundManager.playGameOver(true);
      } else if (game.inInsufficientMaterial()) {
        modalReason = 'Draw by insufficient material.';
        if (soundOn) soundManager.playGameOver(true);
      }

      setGameOverModal({
        title: winnerColor ? (winnerColor === 'w' ? 'White Wins!' : 'Black Wins!') : 'Draw Game',
        reason: modalReason,
        isWin: winnerColor === 'w'
      });

      if (winnerColor === 'w') {
        triggerConfetti();
      }

      // Compile game review stats
      compileGameReview(updatedHistory, updatedQualities);
    }
  };

  // 3. User Square Selection & Move Handling
  const handleSquareClick = (square) => {
    // If viewing historical positions, click does nothing
    if (historyIndex !== -1 || botThinking || game.isGameOver() || gameOverModal) return;

    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square.charAt(1));
    const piece = board[rank][file];

    // If legal move indicator clicked, execute the move!
    if (legalMoves.includes(square)) {
      // Check for pawn promotion (White pawn to 8th rank, Black pawn to 1st rank)
      const selectedPiece = board[8 - parseInt(selectedSquare.charAt(1))][selectedSquare.charCodeAt(0) - 97];
      if (
        selectedPiece && 
        selectedPiece.type === 'p' && 
        ((selectedPiece.color === 'w' && square.charAt(1) === '8') || 
         (selectedPiece.color === 'b' && square.charAt(1) === '1'))
      ) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }

      executeMove(selectedSquare, square);
      return;
    }

    // Select piece click
    if (piece && piece.color === 'w') {
      setSelectedSquare(square);
      // Retrieve legal moves for selection
      const moves = game.moves({ square, verbose: true });
      setLegalMoves(moves.map(m => m.to));
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };

  // Drag and Drop implementation
  const handleDragStart = (e, square) => {
    if (historyIndex !== -1 || botThinking || game.isGameOver() || gameOverModal) {
      e.preventDefault();
      return;
    }
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square.charAt(1));
    const piece = board[rank][file];

    if (piece && piece.color === 'w') {
      setSelectedSquare(square);
      const moves = game.moves({ square, verbose: true });
      setLegalMoves(moves.map(m => m.to));
      e.dataTransfer.setData('text/plain', square);
    } else {
      e.preventDefault();
    }
  };

  const handleDrop = (e, targetSquare) => {
    e.preventDefault();
    const sourceSquare = e.dataTransfer.getData('text/plain');
    if (sourceSquare && legalMoves.includes(targetSquare)) {
      // Check for pawn promotion
      const rank = 8 - parseInt(sourceSquare.charAt(1));
      const file = sourceSquare.charCodeAt(0) - 97;
      const piece = board[rank][file];

      if (
        piece && 
        piece.type === 'p' && 
        ((piece.color === 'w' && targetSquare.charAt(1) === '8') || 
         (piece.color === 'b' && targetSquare.charAt(1) === '1'))
      ) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        return;
      }

      executeMove(sourceSquare, targetSquare);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Required to allow drop
  };

  // Promotion choice execution
  const resolvePromotion = (promotionPiece) => {
    if (!pendingPromotion) return;
    executeMove(pendingPromotion.from, pendingPromotion.to, promotionPiece);
    setPendingPromotion(null);
  };

  // Reset Game
  const startNewGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setBoard(newGame.board());
    setTurn('w');
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);
    setCheckSquare(null);
    setEvaluation(0);
    setMoveQualities([]);
    setAccuracyStats(null);
    setShowReview(false);
    setGameOverModal(null);
    clearTranspositionTable();

    const limit = TIME_CONTROLS[timeControl].seconds;
    setWhiteTime(limit);
    setBlackTime(limit);
  };

  // Takeback / Undo last 2 moves (Player and Bot move)
  const handleUndo = () => {
    if (historyIndex !== -1 || botThinking || history.length < 2) return;
    
    // Undo Bot move
    game.undo();
    // Undo Player move
    game.undo();

    // Recompute history
    const hist = game.history({ verbose: true });
    const last = hist.length > 0 ? hist[hist.length - 1] : null;

    setBoard(game.board());
    setTurn(game.turn());
    setHistory(hist);
    setMoveQualities(moveQualities.slice(0, -2));
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setSelectedSquare(null);
    setLegalMoves([]);
    setCheckSquare(game.inCheck() ? findKingSquare(game.turn()) : null);
    setEvaluation(evaluateBoard(game));
  };

  const findKingSquare = (color) => {
    const boardGrid = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = boardGrid[r][c];
        if (p && p.type === 'k' && p.color === color) {
          return String.fromCharCode(97 + c) + (8 - r);
        }
      }
    }
    return null;
  };

  // Flip board
  const handleFlipBoard = () => {
    setBoardFlipped(!boardFlipped);
  };

  // Navigation of historical positions
  const viewHistoricalPosition = (index) => {
    if (botThinking) return;

    if (index === historyIndex) return;

    const tempGame = new Chess();
    for (let i = 0; i <= index; i++) {
      tempGame.move(history[i]);
    }

    setBoard(tempGame.board());
    setHistoryIndex(index);
    
    // Highlight historical moves
    const currentMove = history[index];
    setLastMove({ from: currentMove.from, to: currentMove.to });
    setCheckSquare(tempGame.inCheck() ? findKingSquare(tempGame.turn()) : null);
    setEvaluation(evaluateBoard(tempGame));
  };

  const resumeLivePosition = () => {
    setBoard(game.board());
    setHistoryIndex(-1);
    const last = history.length > 0 ? history[history.length - 1] : null;
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setCheckSquare(game.inCheck() ? findKingSquare(game.turn()) : null);
    setEvaluation(evaluateBoard(game));
  };

  // Render Captured Pieces helper
  const getCapturedPieces = (color) => {
    const startingCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const currentCounts = { p: 0, n: 0, b: 0, r: 0, q: 0 };

    // Count existing pieces on board
    game.board().flat().forEach(p => {
      if (p && p.color === color && p.type !== 'k') {
        currentCounts[p.type]++;
      }
    });

    const captured = [];
    Object.keys(startingCounts).forEach(type => {
      const diff = startingCounts[type] - currentCounts[type];
      for (let i = 0; i < diff; i++) {
        captured.push({ type, color });
      }
    });

    return captured;
  };

  // Calculate material difference score
  const getMaterialAdvantage = () => {
    const whiteVal = getCapturedPieces('b').reduce((sum, p) => sum + (PIECE_VALUES[p.type] / 100), 0);
    const blackVal = getCapturedPieces('w').reduce((sum, p) => sum + (PIECE_VALUES[p.type] / 100), 0);
    const diff = whiteVal - blackVal;
    
    if (diff > 0) return { text: `+${diff}`, side: 'w' };
    if (diff < 0) return { text: `+${Math.abs(diff)}`, side: 'b' };
    return null;
  };

  const matDiff = getMaterialAdvantage();

  // 4. Build Board Grid Coordinates
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const orderedFiles = boardFlipped ? [...files].reverse() : files;
  const orderedRanks = boardFlipped ? [...ranks].reverse() : ranks;

  // Calculate percentage for evaluation bar
  // Score is centipawns. +500 means White up 5 pawns. -500 means Black up 5 pawns.
  // We cap visual bar at +10 and -10.
  const getEvalPercentage = () => {
    if (game.isGameOver() && checkCheckmate(game)) {
      return turn === 'w' ? 0 : 100; // 0% white fill on black win, 100% white fill on white win
    }
    const cap = 1000; // 10 pawns
    const score = Math.max(-cap, Math.min(cap, evaluation));
    
    // percentage of white advantage
    return 50 + (score / (cap * 2)) * 100;
  };

  const evalPercent = getEvalPercentage();
  const evaluationScoreText = (evaluation / 100).toFixed(1);

  return (
    <div className={`app-container theme-${theme}`}>
      
      {/* Header bar */}
      <header className="app-header">
        <div className="logo-section">
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="16" fill="var(--bg-secondary)"/>
            <path d="M50 20L30 50H70L50 20Z" fill="var(--accent-color)"/>
            <rect x="35" y="55" width="30" height="10" rx="3" fill="var(--text-main)"/>
            <rect x="25" y="70" width="50" height="10" rx="4" fill="var(--text-main)"/>
          </svg>
          <h1>Chess<span>Bot</span></h1>
        </div>

        <div className="header-controls">
          <select 
            className="control-select" 
            value={timeControl} 
            onChange={(e) => setTimeControl(e.target.value)}
            disabled={history.length > 0}
          >
            {Object.keys(TIME_CONTROLS).map(tc => (
              <option key={tc} value={tc}>{TIME_CONTROLS[tc].name}</option>
            ))}
          </select>

          <select 
            className="control-select" 
            value={theme} 
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="neo-green">Neo-Green</option>
            <option value="wood">Classic Wood</option>
            <option value="midnight">Midnight Blue</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="glass">Glassmorphism</option>
          </select>

          <button 
            className="icon-btn" 
            onClick={() => setSoundOn(!soundOn)}
            title={soundOn ? "Mute sounds" : "Unmute sounds"}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="game-layout">
        
        {/* Left board section */}
        <div className="board-column">
          
          {/* Opponent Bot Panel */}
          <div className="player-panel">
            <div className="player-info">
              <img 
                src={BOTS[selectedBot].avatar} 
                alt={BOTS[selectedBot].name} 
                className="player-avatar"
              />
              <div className="player-details">
                <span className="player-name">{BOTS[selectedBot].name}</span>
                <span className="player-rating">Bot • ELO {BOTS[selectedBot].elo}</span>
                <div className="captured-list">
                  {getCapturedPieces('w').map((p, idx) => (
                    <img 
                      key={idx} 
                      src={getPieceImg(p.color, p.type)} 
                      className="captured-icon"
                      alt=""
                    />
                  ))}
                  {matDiff && matDiff.side === 'b' && (
                    <span className="material-diff">{matDiff.text}</span>
                  )}
                </div>
              </div>
            </div>
            <div className={`player-timer ${turn === 'b' && historyIndex === -1 ? 'active-timer' : ''} ${blackTime < 30 ? 'low-time' : ''}`}>
              {formatTime(blackTime)}
            </div>
          </div>

          {/* Chessboard & Eval Bar Container */}
          <div className="board-container-wrapper">
            
            {/* Visual Advantage Evaluation Bar */}
            <div className="evaluation-bar-container">
              {/* White Advantage portion (filled from bottom) */}
              <div 
                className="evaluation-bar-fill white-fill" 
                style={{ height: `${evalPercent}%` }}
              >
                {evalPercent >= 15 && (
                  <span className="evaluation-text white-text">
                    {evaluationScoreText > 0 ? `+${evaluationScoreText}` : evaluationScoreText}
                  </span>
                )}
              </div>
              {/* Black Advantage portion (remainder) */}
              <div 
                className="evaluation-bar-fill black-fill" 
                style={{ height: `${100 - evalPercent}%` }}
              >
                {evalPercent <= 85 && (
                  <span className="evaluation-text black-text">
                    {evaluationScoreText < 0 ? evaluationScoreText : `+${evaluationScoreText}`}
                  </span>
                )}
              </div>
            </div>

            {/* Chessboard grid */}
            <div className="chessboard-wrapper">
              <div className="board-grid">
                {orderedRanks.map((rank) =>
                  orderedFiles.map((file) => {
                    const square = `${file}${rank}`;
                    const fileIdx = file.charCodeAt(0) - 97;
                    const rankIdx = 8 - parseInt(rank);
                    const piece = board[rankIdx][fileIdx];
                    const isDark = (fileIdx + rankIdx) % 2 === 1;
                    
                    const isSelected = selectedSquare === square;
                    const isLegal = legalMoves.includes(square);
                    const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
                    const isCheck = checkSquare === square;

                    let squareClass = `board-square ${isDark ? 'square-dark-color' : 'square-light-color'}`;
                    if (isSelected) squareClass += ' square-selected-highlight';
                    else if (isLastMove) squareClass += ' square-last-move-highlight';
                    if (isCheck) squareClass += ' square-check-glow';

                    // Coordinates details
                    const showRankLabel = boardFlipped ? file === 'h' : file === 'a';
                    const showFileLabel = boardFlipped ? rank === '8' : rank === '1';

                    return (
                      <div 
                        key={square} 
                        className={squareClass}
                        onClick={() => handleSquareClick(square)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, square)}
                      >
                        {/* Display piece if present */}
                        {piece && (
                          <div 
                            className={`chess-piece ${selectedSquare === square ? 'dragging' : ''}`}
                            style={{ backgroundImage: `url(${getPieceImg(piece.color, piece.type)})` }}
                            draggable
                            onDragStart={(e) => handleDragStart(e, square)}
                          />
                        )}

                        {/* Legal Move Indicators */}
                        {isLegal && (
                          <div className={piece ? "capture-indicator" : "move-indicator"} />
                        )}

                        {/* Coordinates labels */}
                        {showRankLabel && (
                          <span className="square-coord coord-rank">{rank}</span>
                        )}
                        {showFileLabel && (
                          <span className="square-coord coord-file">{file}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Promotion Choice Dialog Overlay */}
              {pendingPromotion && (
                <div className="promotion-overlay">
                  <div className="promotion-panel">
                    {['q', 'r', 'b', 'n'].map((pType) => (
                      <div 
                        key={pType} 
                        className="promotion-option"
                        onClick={() => resolvePromotion(pType)}
                      >
                        <div 
                          className="promotion-piece" 
                          style={{ backgroundImage: `url(${getPieceImg('w', pType)})` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Game Over Modal popup */}
              {gameOverModal && (
                <div className="modal-overlay">
                  <div className="gameover-modal">
                    <h2 className={`gameover-title ${gameOverModal.isWin === true ? 'win' : (gameOverModal.isWin === false ? 'loss' : 'draw')}`}>
                      {gameOverModal.title}
                    </h2>
                    <p className="gameover-reason">{gameOverModal.reason}</p>
                    <button className="primary-btn" onClick={startNewGame}>
                      Play Again
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Player Info Panel */}
          <div className="player-panel">
            <div className="player-info">
              <img 
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=60" 
                alt="Player" 
                className="player-avatar"
              />
              <div className="player-details">
                <span className="player-name">Player (You)</span>
                <span className="player-rating">Rating • 1500 ELO</span>
                <div className="captured-list">
                  {getCapturedPieces('b').map((p, idx) => (
                    <img 
                      key={idx} 
                      src={getPieceImg(p.color, p.type)} 
                      className="captured-icon"
                      alt=""
                    />
                  ))}
                  {matDiff && matDiff.side === 'w' && (
                    <span className="material-diff">{matDiff.text}</span>
                  )}
                </div>
              </div>
            </div>
            <div className={`player-timer ${turn === 'w' && historyIndex === -1 ? 'active-timer' : ''} ${whiteTime < 30 ? 'low-time' : ''}`}>
              {formatTime(whiteTime)}
            </div>
          </div>

        </div>

        {/* Right Sidebar Section */}
        <div className="sidebar-column">
          
          {/* Active Status Header */}
          {botThinking && (
            <div className="game-status-text bot-thinking">
              Thinking... ELO calculation in progress
            </div>
          )}
          {game.inCheck() && !game.isGameOver() && (
            <div className="game-status-text" style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}>
              Check! Defend your King.
            </div>
          )}

          {/* Bot personality selection panel */}
          <div className="sidebar-card">
            <div className="card-header">
              <span>Select Opponent Bot</span>
            </div>
            <div className="card-body">
              <div className="bots-grid">
                {Object.keys(BOTS).map((botKey) => {
                  const b = BOTS[botKey];
                  return (
                    <div 
                      key={botKey} 
                      className={`bot-card ${selectedBot === botKey ? 'selected-bot' : ''}`}
                      onClick={() => {
                        if (history.length === 0) setSelectedBot(botKey);
                      }}
                      style={{ opacity: history.length > 0 ? 0.6 : 1, cursor: history.length > 0 ? 'not-allowed' : 'pointer' }}
                      title={history.length > 0 ? "Cannot change opponent mid-game" : `Play against ${b.name}`}
                    >
                      <img src={b.avatar} alt={b.name} className="bot-card-avatar" />
                      <span className="bot-card-name">{b.name}</span>
                      <span className="bot-card-elo">{b.elo} ELO</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Game controls and history panel */}
          <div className="sidebar-card" style={{ flex: 1 }}>
            <div className="card-header">
              <span>Game Control</span>
              {historyIndex !== -1 && (
                <button 
                  className="secondary-btn" 
                  style={{ padding: '3px 8px', fontSize: '0.75rem', backgroundColor: 'var(--accent-color)', color: '#fff' }}
                  onClick={resumeLivePosition}
                >
                  Resume Live
                </button>
              )}
            </div>
            <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* Controls Row */}
              <div className="controls-row">
                <button className="primary-btn" onClick={startNewGame}>
                  🔄 New Game
                </button>
                <button className="secondary-btn" onClick={handleFlipBoard} title="Flip Board Perspective">
                  🔁 Flip Board
                </button>
              </div>

              <div className="controls-row">
                <button 
                  className="secondary-btn" 
                  onClick={handleUndo} 
                  disabled={history.length < 2 || historyIndex !== -1}
                  title="Undo last move pair"
                >
                  ↩ Undo Move
                </button>
                <button 
                  className="danger-btn" 
                  onClick={handleResign}
                  disabled={game.isGameOver() || gameOverModal}
                >
                  🏳 Resign
                </button>
              </div>

              {/* Move Log Table */}
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Move Log</div>
              <div className="move-log-container">
                <table className="move-log-table">
                  <tbody>
                    {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => {
                      const whiteMoveIdx = i * 2;
                      const blackMoveIdx = i * 2 + 1;
                      const whiteMove = history[whiteMoveIdx];
                      const blackMove = history[blackMoveIdx];

                      const whiteQuality = moveQualities[whiteMoveIdx]?.quality;
                      const blackQuality = moveQualities[blackMoveIdx]?.quality;

                      return (
                        <tr key={i} className="move-log-row">
                          <td className="move-log-number">{i + 1}.</td>
                          <td 
                            className={`move-log-cell ${historyIndex === whiteMoveIdx ? 'active-history-move' : ''}`}
                            onClick={() => viewHistoricalPosition(whiteMoveIdx)}
                          >
                            {whiteMove.san}
                            {whiteQuality && (
                              <span className={`move-badge badge-${whiteQuality}`}>
                                {whiteQuality}
                              </span>
                            )}
                          </td>
                          <td 
                            className={`move-log-cell ${historyIndex === blackMoveIdx ? 'active-history-move' : ''}`}
                            onClick={() => {
                              if (blackMove) viewHistoricalPosition(blackMoveIdx);
                            }}
                          >
                            {blackMove ? blackMove.san : ''}
                            {blackQuality && (
                              <span className={`move-badge badge-${blackQuality}`}>
                                {blackQuality}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Review triggers */}
              {game.isGameOver() && accuracyStats && (
                <button 
                  className="primary-btn" 
                  style={{ backgroundColor: '#1baca6' }}
                  onClick={() => setShowReview(!showReview)}
                >
                  {showReview ? 'Show Move Log' : '📊 Game Review / Accuracy'}
                </button>
              )}

              {/* Game Review Stats display */}
              {showReview && accuracyStats && (
                <div className="game-review-panel">
                  <div className="review-accuracy-container">
                    <div className="accuracy-circle">
                      <div className="accuracy-value white-accuracy">
                        {accuracyStats.whiteAccuracy}%
                      </div>
                      <span className="accuracy-label">Your Accuracy</span>
                    </div>
                    <div className="accuracy-circle">
                      <div className="accuracy-value black-accuracy">
                        {accuracyStats.blackAccuracy}%
                      </div>
                      <span className="accuracy-label">{BOTS[selectedBot].name} ELO</span>
                    </div>
                  </div>

                  <div className="review-stats-grid">
                    <div className="stat-item">
                      <span className="stat-label"><span className="stat-dot dot-brilliant"></span> Brilliant</span>
                      <span className="stat-counts">{accuracyStats.counts.white.brilliant}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label"><span className="stat-dot dot-best"></span> Best Move</span>
                      <span className="stat-counts">{accuracyStats.counts.white.best}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label"><span className="stat-dot dot-book"></span> Book Move</span>
                      <span className="stat-counts">{accuracyStats.counts.white.book}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label"><span className="stat-dot dot-good"></span> Good</span>
                      <span className="stat-counts">{accuracyStats.counts.white.good}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label"><span className="stat-dot dot-inaccuracy"></span> Inaccuracies</span>
                      <span className="stat-counts">{accuracyStats.counts.white.inaccuracy}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label"><span className="stat-dot dot-mistake"></span> Mistakes</span>
                      <span className="stat-counts">{accuracyStats.counts.white.mistake}</span>
                    </div>
                    <div className="stat-item" style={{ gridColumn: 'span 2' }}>
                      <span className="stat-label" style={{ color: 'var(--danger-color)' }}>
                        <span className="stat-dot dot-blunder"></span> Blunders Committed
                      </span>
                      <span className="stat-counts" style={{ color: 'var(--danger-color)' }}>
                        {accuracyStats.counts.white.blunder}
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>

      </main>
    </div>
  );
}

export default App;
