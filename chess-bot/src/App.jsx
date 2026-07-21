import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import confetti from 'canvas-confetti';
import { soundManager } from './soundManager';
import { getBestMove, evaluateBoard, clearTranspositionTable, PIECE_VALUES } from './chessEngine';
import { getPieceImg } from './chessPieces';
import { apiLogin, apiRegister, apiLogout, apiGetMe, apiGetLeaderboard, clearTokens, getToken } from './api';
import './App.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const BOTS = {
  martin:      { name: 'Martin',         elo: 250,  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60', tag: 'martin' },
  nelson:      { name: 'Nelson',         elo: 1300, avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&auto=format&fit=crop&q=60', tag: 'nelson' },
  beth:        { name: 'Beth',           elo: 1800, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60', tag: 'beth' },
  antigravity: { name: 'Antigravity AI', elo: 2200, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=60', tag: 'antigravity' }
};

const TIME_CONTROLS = {
  unlimited: { name: 'Unlimited',      seconds: Infinity },
  rapid:     { name: '10 Min (Rapid)', seconds: 600 },
  blitz:     { name: '3 Min (Blitz)',  seconds: 180 },
  bullet:    { name: '1 Min (Bullet)', seconds: 60 }
};

// ─── chess.js v1.x safe wrappers ──────────────────────────────────────────────
const isCheckmate = (g) => typeof g.isCheckmate === 'function' ? g.isCheckmate() : false;
const isStalemate = (g) => typeof g.isStalemate === 'function' ? g.isStalemate() : false;
const isThreefold = (g) => typeof g.isThreefoldRepetition === 'function' ? g.isThreefoldRepetition() : false;
const isInsufficient = (g) => typeof g.isInsufficientMaterial === 'function' ? g.isInsufficientMaterial() : false;
const isDraw = (g) => typeof g.isDraw === 'function' ? g.isDraw() : (isStalemate(g) || isThreefold(g) || isInsufficient(g));

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  // Game state
  const [game, setGame]                   = useState(() => new Chess());
  const [board, setBoard]                 = useState(() => new Chess().board());
  const [turn, setTurn]                   = useState('w');
  const [history, setHistory]             = useState([]);
  const [historyIndex, setHistoryIndex]   = useState(-1);

  // UI state
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves]         = useState([]);
  const [lastMove, setLastMove]             = useState(null);
  const [checkSquare, setCheckSquare]       = useState(null);
  const [boardFlipped, setBoardFlipped]     = useState(false);
  const [theme, setTheme]                   = useState('neo-green');
  const [soundOn, setSoundOn]               = useState(true);

  // Bot & game config
  const [selectedBot, setSelectedBot]     = useState('martin');
  const [timeControl, setTimeControl]     = useState('rapid');
  const [playerColor, setPlayerColor]     = useState('w'); // 'w' = human plays white, 'b' = human plays black
  const [botThinking, setBotThinking]     = useState(false);

  // Evaluation & review
  const [evaluation, setEvaluation]           = useState(0);
  const [moveQualities, setMoveQualities]     = useState([]);
  const [accuracyStats, setAccuracyStats]     = useState(null);
  const [showReview, setShowReview]           = useState(false);

  // Timers
  const [whiteTime, setWhiteTime]   = useState(600);
  const [blackTime, setBlackTime]   = useState(600);
  const timerIntervalRef            = useRef(null);

  // Promotion dialog
  const [pendingPromotion, setPendingPromotion] = useState(null);

  // Game over
  const [gameOverModal, setGameOverModal] = useState(null);

  // Backend auth state
  const [currentUser, setCurrentUser]   = useState(null);
  const [authModal, setAuthModal]       = useState(null); // 'login' | 'register' | null
  const [authForm, setAuthForm]         = useState({ username: '', email: '', loginId: '', password: '' });
  const [authError, setAuthError]       = useState('');
  const [authLoading, setAuthLoading]   = useState(false);
  const [leaderboard, setLeaderboard]   = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const backendOnline                   = useRef(false);

  // ── Boot: restore session from localStorage ──────────────────────────────
  useEffect(() => {
    if (getToken()) {
      apiGetMe()
        .then(user => { setCurrentUser(user); backendOnline.current = true; })
        .catch(() => { clearTokens(); });
    } else {
      // Ping backend to check if it is available
      fetch('http://localhost:5000/health').then(() => { backendOnline.current = true; }).catch(() => {});
    }
  }, []);

  // ── Timer logic ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const limit = TIME_CONTROLS[timeControl].seconds;
    if (limit === Infinity || game.isGameOver() || gameOverModal) return;

    timerIntervalRef.current = setInterval(() => {
      if (turn === 'w') {
        setWhiteTime(prev => { if (prev <= 1) { handleTimeout('w'); return 0; } return prev - 1; });
      } else {
        setBlackTime(prev => { if (prev <= 1) { handleTimeout('b'); return 0; } return prev - 1; });
      }
    }, 1000);

    return () => clearInterval(timerIntervalRef.current);
  }, [turn, timeControl, game, gameOverModal]);

  useEffect(() => {
    const limit = TIME_CONTROLS[timeControl].seconds;
    setWhiteTime(limit === Infinity ? Infinity : limit);
    setBlackTime(limit === Infinity ? Infinity : limit);
  }, [timeControl]);

  // ── Bot move trigger ──────────────────────────────────────────────────────
  // Bot plays whichever color the human is NOT playing
  const botColor = playerColor === 'w' ? 'b' : 'w';

  useEffect(() => {
    if (
      turn === botColor &&
      !game.isGameOver() &&
      !gameOverModal &&
      !botThinking &&
      historyIndex === -1
    ) {
      setBotThinking(true);
      const delay = { martin: 400, nelson: 800, beth: 1200, antigravity: 1800 }[selectedBot] || 800;
      const jitter = Math.random() * 500;

      const timer = setTimeout(async () => {
        try {
          const depth = { martin: 2, nelson: 6, beth: 10, antigravity: 14 }[selectedBot] || 10;
          const res = await fetch('https://chess-api.com/v1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: game.fen(), depth })
          });
          const data = await res.json();
          if (data && data.from && data.to) {
            const promotion = data.move && data.move.length === 5 ? data.move[4] : undefined;
            executeMove(data.from, data.to, promotion);
          } else {
             const moves = game.moves({ verbose: true });
             const fallback = moves[Math.floor(Math.random() * moves.length)];
             if (fallback) executeMove(fallback.from, fallback.to, fallback.promotion || 'q');
          }
        } catch (e) {
           const moves = game.moves({ verbose: true });
           const fallback = moves[Math.floor(Math.random() * moves.length)];
           if (fallback) executeMove(fallback.from, fallback.to, fallback.promotion || 'q');
        } finally {
          setBotThinking(false);
        }
      }, delay + jitter);

      return () => clearTimeout(timer);
    }
  }, [turn, game, selectedBot, gameOverModal, historyIndex, botColor]);

  useEffect(() => () => clearTranspositionTable(), []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTime = (s) => {
    if (!isFinite(s)) return '∞';
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const findKingSquare = useCallback((g, color) => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = g.board()[r][c];
        if (p && p.type === 'k' && p.color === color) {
          return String.fromCharCode(97 + c) + (8 - r);
        }
      }
    }
    return null;
  }, []);

  const triggerConfetti = () => confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

  // ── Move quality analysis ─────────────────────────────────────────────────
  const classifyMove = (evalBefore, evalAfter, bestScore, isWhiteTurn, isOpening) => {
    const drop = Math.abs(isWhiteTurn ? (bestScore - evalAfter) : (evalAfter - bestScore));
    if (isOpening && drop <= 15) return 'book';
    if (drop === 0) return Math.abs(evalAfter) > 600 && Math.abs(evalBefore) < 150 ? 'brilliant' : 'best';
    if (drop <= 20)  return 'excellent';
    if (drop <= 50)  return 'good';
    if (drop <= 100) return 'inaccuracy';
    if (drop <= 200) return 'mistake';
    return 'blunder';
  };

  const compileGameReview = (movesList, qualities) => {
    if (!movesList.length) return;
    let wLoss = 0, wCount = 0, bLoss = 0, bCount = 0;
    const counts = {
      white: { brilliant:0, best:0, book:0, good:0, excellent:0, inaccuracy:0, mistake:0, blunder:0 },
      black: { brilliant:0, best:0, book:0, good:0, excellent:0, inaccuracy:0, mistake:0, blunder:0 }
    };

    qualities.forEach(({ quality, drop }, idx) => {
      const key = idx % 2 === 0 ? 'white' : 'black';
      if (counts[key][quality] !== undefined) counts[key][quality]++;
      const loss = Math.min(drop, 400);
      if (key === 'white') { wLoss += loss; wCount++; }
      else { bLoss += loss; bCount++; }
    });

    const acc = (loss, count) => count > 0 ? Math.round(100 * Math.exp(-0.003 * (loss / count))) : 100;
    setAccuracyStats({ whiteAccuracy: acc(wLoss, wCount), blackAccuracy: acc(bLoss, bCount), counts });
  };

  // ── Execute move (single source of truth) ─────────────────────────────────
  const executeMove = (from, to, promotion = 'q') => {
    const isWhiteTurn = game.turn() === 'w';
    const isOpening   = history.length < 10;
    const evalBefore  = evaluateBoard(game);

    // Best move score for quality classification
    let bestScore = isWhiteTurn ? -Infinity : Infinity;
    game.moves({ verbose: true }).forEach(m => {
      game.move(m);
      const v = evaluateBoard(game);
      game.undo();
      if (isWhiteTurn ? v > bestScore : v < bestScore) bestScore = v;
    });

    // Apply move
    let moveObj;
    try { moveObj = game.move({ from, to, promotion }); }
    catch { return; }
    if (!moveObj) return;

    // Sound
    if (soundOn) {
      if (moveObj.promotion)  soundManager.playPromote();
      else if (game.inCheck()) soundManager.playCheck();
      else if (moveObj.captured) soundManager.playCapture();
      else soundManager.playMove();
    }

    const evalAfter  = evaluateBoard(game);
    const drop       = Math.abs(evalAfter - bestScore);
    const quality    = classifyMove(evalBefore, evalAfter, bestScore, isWhiteTurn, isOpening);

    const newHistory    = [...history, moveObj];
    const newQualities  = [...moveQualities, { quality, drop }];

    setHistory(newHistory);
    setMoveQualities(newQualities);
    setBoard(game.board());
    setTurn(game.turn());
    setLastMove({ from, to });
    setSelectedSquare(null);
    setLegalMoves([]);
    setEvaluation(evalAfter);
    setCheckSquare(game.inCheck() ? findKingSquare(game, game.turn()) : null);

    // Game over detection using v1.x safe wrappers
    if (game.isGameOver()) {
      clearInterval(timerIntervalRef.current);
      let title = 'Draw Game', reason = 'Draw', isWin = null;

      if (isCheckmate(game)) {
        const winner = isWhiteTurn ? 'w' : 'b';
        title  = winner === 'w' ? 'White Wins!' : 'Black Wins!';
        reason = `Checkmate! ${winner === 'w' ? 'White' : 'Black'} wins.`;
        isWin  = winner === playerColor;
        if (soundOn) soundManager.playGameOver(isWin);
        if (isWin) triggerConfetti();
      } else if (isStalemate(game)) {
        reason = 'Stalemate — draw.';
        if (soundOn) soundManager.playGameOver(false);
      } else if (isThreefold(game)) {
        reason = 'Threefold repetition — draw.';
        if (soundOn) soundManager.playGameOver(false);
      } else if (isInsufficient(game)) {
        reason = 'Insufficient material — draw.';
        if (soundOn) soundManager.playGameOver(false);
      } else if (isDraw(game)) {
        reason = 'Draw (50-move rule or agreement).';
        if (soundOn) soundManager.playGameOver(false);
      }

      setGameOverModal({ title, reason, isWin });
      compileGameReview(newHistory, newQualities);
    }
  };

  // ── Square click handler ──────────────────────────────────────────────────
  const handleSquareClick = (square) => {
    if (historyIndex !== -1 || botThinking || game.isGameOver() || gameOverModal) return;
    // Only allow human to move their pieces
    if (game.turn() !== playerColor) return;

    const file  = square.charCodeAt(0) - 97;
    const rank  = 8 - parseInt(square.charAt(1));
    const piece = board[rank][file];

    if (legalMoves.includes(square)) {
      // Check promotion
      const selFile = selectedSquare.charCodeAt(0) - 97;
      const selRank = 8 - parseInt(selectedSquare.charAt(1));
      const selPiece = board[selRank][selFile];
      if (
        selPiece?.type === 'p' &&
        ((selPiece.color === 'w' && square.charAt(1) === '8') ||
         (selPiece.color === 'b' && square.charAt(1) === '1'))
      ) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
      executeMove(selectedSquare, square);
      return;
    }

    if (piece && piece.color === playerColor) {
      setSelectedSquare(square);
      setLegalMoves(game.moves({ square, verbose: true }).map(m => m.to));
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDragStart = (e, square) => {
    if (historyIndex !== -1 || botThinking || game.isGameOver() || gameOverModal || game.turn() !== playerColor) {
      e.preventDefault();
      return;
    }
    const file  = square.charCodeAt(0) - 97;
    const rank  = 8 - parseInt(square.charAt(1));
    const piece = board[rank][file];

    if (piece && piece.color === playerColor) {
      setSelectedSquare(square);
      setLegalMoves(game.moves({ square, verbose: true }).map(m => m.to));
      e.dataTransfer.setData('text/plain', square);
    } else {
      e.preventDefault();
    }
  };

  const handleDrop = (e, target) => {
    e.preventDefault();
    const src = e.dataTransfer.getData('text/plain');
    if (!src || !legalMoves.includes(target)) return;

    const file  = src.charCodeAt(0) - 97;
    const rank  = 8 - parseInt(src.charAt(1));
    const piece = board[rank][file];

    if (
      piece?.type === 'p' &&
      ((piece.color === 'w' && target.charAt(1) === '8') ||
       (piece.color === 'b' && target.charAt(1) === '1'))
    ) {
      setPendingPromotion({ from: src, to: target });
      return;
    }
    executeMove(src, target);
  };

  const handleDragOver = (e) => e.preventDefault();

  const resolvePromotion = (piece) => {
    if (!pendingPromotion) return;
    executeMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  };

  // ── Timeout ───────────────────────────────────────────────────────────────
  const handleTimeout = (timedColor) => {
    clearInterval(timerIntervalRef.current);
    const winColor = timedColor === 'w' ? 'b' : 'w';
    const isWin = winColor === playerColor;
    if (soundOn) soundManager.playGameOver(isWin);
    if (isWin) triggerConfetti();
    setGameOverModal({
      title: winColor === 'w' ? 'White Wins!' : 'Black Wins!',
      reason: `${timedColor === 'w' ? 'White' : 'Black'} ran out of time.`,
      isWin
    });
  };

  // ── Resign ────────────────────────────────────────────────────────────────
  const handleResign = () => {
    if (game.isGameOver() || gameOverModal) return;
    clearInterval(timerIntervalRef.current);
    if (soundOn) soundManager.playGameOver(false);
    const winColor = playerColor === 'w' ? 'b' : 'w';
    setGameOverModal({
      title: winColor === 'w' ? 'White Wins!' : 'Black Wins!',
      reason: `${playerColor === 'w' ? 'White' : 'Black'} resigned.`,
      isWin: false
    });
  };

  // ── New game ──────────────────────────────────────────────────────────────
  const startNewGame = () => {
    const g = new Chess();
    setGame(g);
    setBoard(g.board());
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
    setWhiteTime(limit === Infinity ? Infinity : limit);
    setBlackTime(limit === Infinity ? Infinity : limit);

    // If human plays black, flip board by default
    setBoardFlipped(playerColor === 'b');
  };

  // ── Undo (take back 2 plies) ──────────────────────────────────────────────
  const handleUndo = () => {
    if (historyIndex !== -1 || botThinking || history.length < 2) return;
    game.undo();
    game.undo();
    const hist = game.history({ verbose: true });
    const last = hist[hist.length - 1] ?? null;
    setBoard(game.board());
    setTurn(game.turn());
    setHistory(hist);
    setMoveQualities(moveQualities.slice(0, -2));
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setSelectedSquare(null);
    setLegalMoves([]);
    setCheckSquare(game.inCheck() ? findKingSquare(game, game.turn()) : null);
    setEvaluation(evaluateBoard(game));
  };

  // ── History navigation ────────────────────────────────────────────────────
  const viewHistoricalPosition = (index) => {
    if (botThinking) return;
    const temp = new Chess();
    for (let i = 0; i <= index; i++) temp.move(history[i]);
    setBoard(temp.board());
    setHistoryIndex(index);
    setLastMove({ from: history[index].from, to: history[index].to });
    setCheckSquare(temp.inCheck() ? findKingSquare(temp, temp.turn()) : null);
    setEvaluation(evaluateBoard(temp));
  };

  const resumeLivePosition = () => {
    setBoard(game.board());
    setHistoryIndex(-1);
    const last = history[history.length - 1] ?? null;
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setCheckSquare(game.inCheck() ? findKingSquare(game, game.turn()) : null);
    setEvaluation(evaluateBoard(game));
  };

  // ── Captured pieces ───────────────────────────────────────────────────────
  const getCapturedPieces = (color) => {
    const start = { p:8, n:2, b:2, r:2, q:1 };
    const cur   = { p:0, n:0, b:0, r:0, q:0 };
    game.board().flat().forEach(p => { if (p && p.color === color && p.type !== 'k') cur[p.type]++; });
    const caps = [];
    Object.keys(start).forEach(t => { for (let i = 0; i < start[t] - cur[t]; i++) caps.push({ type:t, color }); });
    return caps;
  };

  const getMaterialAdvantage = () => {
    const wVal = getCapturedPieces('b').reduce((s, p) => s + (PIECE_VALUES[p.type] / 100), 0);
    const bVal = getCapturedPieces('w').reduce((s, p) => s + (PIECE_VALUES[p.type] / 100), 0);
    const diff = wVal - bVal;
    if (diff > 0) return { text: `+${diff}`, side: 'w' };
    if (diff < 0) return { text: `+${Math.abs(diff)}`, side: 'b' };
    return null;
  };

  // ── Eval bar ──────────────────────────────────────────────────────────────
  const getEvalPercentage = () => {
    if (game.isGameOver() && isCheckmate(game)) return turn === 'w' ? 0 : 100;
    const cap   = 1000;
    const score = Math.max(-cap, Math.min(cap, evaluation));
    return 50 + (score / (cap * 2)) * 100;
  };

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      let user;
      if (authModal === 'login') {
        user = await apiLogin(authForm.loginId, authForm.password);
      } else {
        user = await apiRegister(authForm.username, authForm.email, authForm.password);
      }
      setCurrentUser(user);
      setAuthModal(null);
      setAuthForm({ username:'', email:'', loginId:'', password:'' });
    } catch (err) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await apiLogout();
    setCurrentUser(null);
  };

  const handleShowLeaderboard = async () => {
    if (!showLeaderboard) {
      try {
        const data = await apiGetLeaderboard();
        setLeaderboard(data.leaderboard || []);
      } catch { setLeaderboard([]); }
    }
    setShowLeaderboard(!showLeaderboard);
  };

  // ── Board layout ──────────────────────────────────────────────────────────
  const files = ['a','b','c','d','e','f','g','h'];
  const ranks = ['8','7','6','5','4','3','2','1'];
  const orderedFiles = boardFlipped ? [...files].reverse() : files;
  const orderedRanks = boardFlipped ? [...ranks].reverse() : ranks;

  const evalPercent = getEvalPercentage();
  const evalText    = (evaluation / 100).toFixed(1);
  const matDiff     = getMaterialAdvantage();
  const botInfo     = BOTS[selectedBot];

  return (
    <div className={`app-container theme-${theme}`}>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="logo-section">
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="16" fill="var(--bg-secondary)"/>
            <path d="M50 20L30 50H70L50 20Z" fill="var(--accent-color)"/>
            <rect x="35" y="55" width="30" height="10" rx="3" fill="var(--text-main)"/>
            <rect x="25" y="70" width="50" height="10" rx="4" fill="var(--text-main)"/>
          </svg>
          <h1>Chess<span>Bot</span></h1>
        </div>

        <div className="header-controls">
          <select className="control-select" value={timeControl} onChange={e => setTimeControl(e.target.value)} disabled={history.length > 0}>
            {Object.entries(TIME_CONTROLS).map(([k,v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>

          <select className="control-select" value={theme} onChange={e => setTheme(e.target.value)}>
            <option value="neo-green">Neo-Green</option>
            <option value="wood">Classic Wood</option>
            <option value="midnight">Midnight Blue</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="glass">Glassmorphism</option>
          </select>

          <button className="icon-btn" onClick={() => setSoundOn(!soundOn)} title={soundOn ? 'Mute' : 'Unmute'}>
            {soundOn ? '🔊' : '🔇'}
          </button>

          {/* Auth button */}
          {currentUser ? (
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'0.8rem', color:'var(--accent-color)', fontWeight:600 }}>
                ♟ {currentUser.username} ({currentUser.rating})
              </span>
              <button className="secondary-btn" style={{ padding:'4px 10px', fontSize:'0.75rem' }} onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <div style={{ display:'flex', gap:'6px' }}>
              <button className="secondary-btn" style={{ padding:'4px 10px', fontSize:'0.75rem' }} onClick={() => { setAuthModal('login'); setAuthError(''); }}>Login</button>
              <button className="primary-btn" style={{ padding:'4px 10px', fontSize:'0.75rem' }} onClick={() => { setAuthModal('register'); setAuthError(''); }}>Sign Up</button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main className="game-layout">

        {/* ── Left: Board Column ── */}
        <div className="board-column">

          {/* Opponent panel (bot — always top) */}
          <div className="player-panel">
            <div className="player-info">
              <img src={botInfo.avatar} alt={botInfo.name} className="player-avatar"/>
              <div className="player-details">
                <span className="player-name">{botInfo.name}</span>
                <span className="player-rating">Bot • ELO {botInfo.elo}</span>
                <div className="captured-list">
                  {getCapturedPieces(playerColor === 'w' ? 'w' : 'b').map((p,i) => (
                    <img key={i} src={getPieceImg(p.color, p.type)} className="captured-icon" alt=""/>
                  ))}
                  {matDiff && matDiff.side === botColor && <span className="material-diff">{matDiff.text}</span>}
                </div>
              </div>
            </div>
            <div className={`player-timer ${turn === botColor && historyIndex === -1 ? 'active-timer' : ''} ${(botColor==='w'?whiteTime:blackTime) < 30 ? 'low-time' : ''}`}>
              {formatTime(botColor === 'w' ? whiteTime : blackTime)}
            </div>
          </div>

          {/* Board + Eval Bar */}
          <div className="board-container-wrapper">
            <div className="evaluation-bar-container">
              <div className="evaluation-bar-fill white-fill" style={{ height:`${evalPercent}%` }}>
                {evalPercent >= 15 && <span className="evaluation-text white-text">{Number(evalText) > 0 ? `+${evalText}` : evalText}</span>}
              </div>
              <div className="evaluation-bar-fill black-fill" style={{ height:`${100-evalPercent}%` }}>
                {evalPercent <= 85 && <span className="evaluation-text black-text">{Number(evalText) < 0 ? evalText : `+${evalText}`}</span>}
              </div>
            </div>

            <div className="chessboard-wrapper">
              <div className="board-grid">
                {orderedRanks.map(rank => orderedFiles.map(file => {
                  const square  = `${file}${rank}`;
                  const fi      = file.charCodeAt(0) - 97;
                  const ri      = 8 - parseInt(rank);
                  const piece   = board[ri][fi];
                  const isDark  = (fi + ri) % 2 === 1;
                  const isSel   = selectedSquare === square;
                  const isLegal = legalMoves.includes(square);
                  const isLast  = lastMove && (lastMove.from === square || lastMove.to === square);
                  const isChk   = checkSquare === square;

                  let cls = `board-square ${isDark ? 'square-dark-color' : 'square-light-color'}`;
                  if (isSel)       cls += ' square-selected-highlight';
                  else if (isLast) cls += ' square-last-move-highlight';
                  if (isChk)       cls += ' square-check-glow';

                  const showRank = boardFlipped ? file === 'h' : file === 'a';
                  const showFile = boardFlipped ? rank === '8' : rank === '1';

                  return (
                    <div key={square} className={cls}
                      onClick={() => handleSquareClick(square)}
                      onDragOver={handleDragOver}
                      onDrop={e => handleDrop(e, square)}
                    >
                      {piece && (
                        <img
                          className={`chess-piece ${selectedSquare === square ? 'dragging' : ''}`}
                          src={getPieceImg(piece.color, piece.type)}
                          alt={`${piece.color}${piece.type}`}
                          draggable
                          onDragStart={e => handleDragStart(e, square)}
                        />
                      )}
                      {isLegal && <div className={piece ? 'capture-indicator' : 'move-indicator'}/>}
                      {showRank && <span className="square-coord coord-rank">{rank}</span>}
                      {showFile && <span className="square-coord coord-file">{file}</span>}
                    </div>
                  );
                }))}
              </div>

              {/* Promotion dialog */}
              {pendingPromotion && (
                <div className="promotion-overlay">
                  <div className="promotion-panel">
                    {['q','r','b','n'].map(p => (
                      <div key={p} className="promotion-option" onClick={() => resolvePromotion(p)}>
                        <div className="promotion-piece" style={{ backgroundImage:`url(${getPieceImg(playerColor, p)})` }}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Game over modal */}
              {gameOverModal && (
                <div className="modal-overlay">
                  <div className="gameover-modal">
                    <h2 className={`gameover-title ${gameOverModal.isWin === true ? 'win' : gameOverModal.isWin === false ? 'loss' : 'draw'}`}>
                      {gameOverModal.title}
                    </h2>
                    <p className="gameover-reason">{gameOverModal.reason}</p>
                    <button className="primary-btn" onClick={startNewGame}>Play Again</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Player panel (human — always bottom) */}
          <div className="player-panel">
            <div className="player-info">
              <img
                src={currentUser?.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=60'}
                alt="Player"
                className="player-avatar"
              />
              <div className="player-details">
                <span className="player-name">{currentUser ? currentUser.username : 'Player (You)'}</span>
                <span className="player-rating">
                  {currentUser
                    ? `ELO ${currentUser.rating} • W${currentUser.wins}/L${currentUser.losses}/D${currentUser.draws}`
                    : `Rating • Guest`}
                </span>
                <div className="captured-list">
                  {getCapturedPieces(playerColor === 'w' ? 'b' : 'w').map((p,i) => (
                    <img key={i} src={getPieceImg(p.color, p.type)} className="captured-icon" alt=""/>
                  ))}
                  {matDiff && matDiff.side === playerColor && <span className="material-diff">{matDiff.text}</span>}
                </div>
              </div>
            </div>
            <div className={`player-timer ${turn === playerColor && historyIndex === -1 ? 'active-timer' : ''} ${(playerColor==='w'?whiteTime:blackTime) < 30 ? 'low-time' : ''}`}>
              {formatTime(playerColor === 'w' ? whiteTime : blackTime)}
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="sidebar-column">

          {/* Status */}
          {botThinking && <div className="game-status-text bot-thinking">🤖 {botInfo.name} is thinking...</div>}
          {game.inCheck() && !game.isGameOver() && (
            <div className="game-status-text" style={{ color:'var(--danger-color)', borderColor:'var(--danger-color)' }}>
              ⚠️ Check! Defend your King.
            </div>
          )}

          {/* Bot selection */}
          <div className="sidebar-card">
            <div className="card-header"><span>Select Opponent</span></div>
            <div className="card-body">
              <div className="bots-grid">
                {Object.entries(BOTS).map(([key, b]) => (
                  <div
                    key={key}
                    className={`bot-card ${selectedBot === key ? 'selected-bot' : ''}`}
                    onClick={() => { if (history.length === 0) setSelectedBot(key); }}
                    style={{ opacity: history.length > 0 ? 0.6 : 1, cursor: history.length > 0 ? 'not-allowed' : 'pointer' }}
                    title={history.length > 0 ? 'Cannot change mid-game' : `Play vs ${b.name}`}
                  >
                    <img src={b.avatar} alt={b.name} className="bot-card-avatar"/>
                    <span className="bot-card-name">{b.name}</span>
                    <span className="bot-card-elo">{b.elo} ELO</span>
                  </div>
                ))}
              </div>

              {/* Play as color */}
              <div style={{ marginTop:'10px', display:'flex', gap:'8px', alignItems:'center' }}>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Play as:</span>
                <button
                  className={playerColor === 'w' ? 'primary-btn' : 'secondary-btn'}
                  style={{ padding:'4px 12px', fontSize:'0.78rem' }}
                  disabled={history.length > 0}
                  onClick={() => setPlayerColor('w')}
                >♔ White</button>
                <button
                  className={playerColor === 'b' ? 'primary-btn' : 'secondary-btn'}
                  style={{ padding:'4px 12px', fontSize:'0.78rem' }}
                  disabled={history.length > 0}
                  onClick={() => setPlayerColor('b')}
                >♚ Black</button>
              </div>
            </div>
          </div>

          {/* Controls & Move Log */}
          <div className="sidebar-card" style={{ flex:1 }}>
            <div className="card-header">
              <span>Game Control</span>
              {historyIndex !== -1 && (
                <button className="secondary-btn" style={{ padding:'3px 8px', fontSize:'0.75rem', backgroundColor:'var(--accent-color)', color:'#fff' }} onClick={resumeLivePosition}>
                  Resume Live
                </button>
              )}
            </div>
            <div className="card-body" style={{ flex:1, display:'flex', flexDirection:'column' }}>
              <div className="controls-row">
                <button className="primary-btn" onClick={startNewGame}>🔄 New Game</button>
                <button className="secondary-btn" onClick={() => setBoardFlipped(!boardFlipped)} title="Flip Board">🔁 Flip</button>
              </div>
              <div className="controls-row">
                <button className="secondary-btn" onClick={handleUndo} disabled={history.length < 2 || historyIndex !== -1}>↩ Undo</button>
                <button className="danger-btn" onClick={handleResign} disabled={!!game.isGameOver() || !!gameOverModal}>🏳 Resign</button>
              </div>

              {/* Move Log */}
              <div style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text-muted)', marginBottom:'4px' }}>Move Log</div>
              <div className="move-log-container">
                <table className="move-log-table">
                  <tbody>
                    {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => {
                      const wi = i * 2, bi = i * 2 + 1;
                      const wm = history[wi], bm = history[bi];
                      const wq = moveQualities[wi]?.quality, bq = moveQualities[bi]?.quality;
                      return (
                        <tr key={i} className="move-log-row">
                          <td className="move-log-number">{i+1}.</td>
                          <td className={`move-log-cell ${historyIndex === wi ? 'active-history-move' : ''}`} onClick={() => viewHistoricalPosition(wi)}>
                            {wm.san}{wq && <span className={`move-badge badge-${wq}`}>{wq}</span>}
                          </td>
                          <td className={`move-log-cell ${historyIndex === bi ? 'active-history-move' : ''}`} onClick={() => bm && viewHistoricalPosition(bi)}>
                            {bm ? bm.san : ''}{bq && <span className={`move-badge badge-${bq}`}>{bq}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Review */}
              {game.isGameOver() && accuracyStats && (
                <button className="primary-btn" style={{ backgroundColor:'#1baca6', marginTop:'8px' }} onClick={() => setShowReview(!showReview)}>
                  {showReview ? 'Show Move Log' : '📊 Game Review'}
                </button>
              )}
              {showReview && accuracyStats && (
                <div className="game-review-panel">
                  <div className="review-accuracy-container">
                    <div className="accuracy-circle">
                      <div className="accuracy-value white-accuracy">{accuracyStats.whiteAccuracy}%</div>
                      <span className="accuracy-label">White Accuracy</span>
                    </div>
                    <div className="accuracy-circle">
                      <div className="accuracy-value black-accuracy">{accuracyStats.blackAccuracy}%</div>
                      <span className="accuracy-label">Black Accuracy</span>
                    </div>
                  </div>
                  <div className="review-stats-grid">
                    {[['brilliant','Brilliant'],['best','Best Move'],['book','Book Move'],['good','Good'],['inaccuracy','Inaccuracy'],['mistake','Mistake'],['blunder','Blunder']].map(([k,label]) => (
                      <div key={k} className="stat-item" style={k==='blunder'?{gridColumn:'span 2'}:{}}>
                        <span className="stat-label"><span className={`stat-dot dot-${k}`}></span> {label}</span>
                        <span className="stat-counts" style={k==='blunder'?{color:'var(--danger-color)'}:{}}>{accuracyStats.counts.white[k]??0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard (backend) */}
          <div className="sidebar-card">
            <div className="card-header">
              <span>🏆 Leaderboard</span>
              <button className="secondary-btn" style={{ padding:'3px 8px', fontSize:'0.75rem' }} onClick={handleShowLeaderboard}>
                {showLeaderboard ? 'Hide' : 'Show'}
              </button>
            </div>
            {showLeaderboard && (
              <div className="card-body">
                {leaderboard.length === 0
                  ? <p style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Backend offline or no players yet.</p>
                  : leaderboard.slice(0, 10).map((p, i) => (
                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', padding:'3px 0', borderBottom:'1px solid var(--border-color)' }}>
                      <span>{i+1}. {p.username}</span>
                      <span style={{ color:'var(--accent-color)', fontWeight:600 }}>{p.rating}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── Auth Modal ── */}
      {authModal && (
        <div className="modal-overlay" onClick={() => setAuthModal(null)}>
          <div className="gameover-modal" style={{ maxWidth:'340px' }} onClick={e => e.stopPropagation()}>
            <h2 className="gameover-title" style={{ fontSize:'1.3rem' }}>
              {authModal === 'login' ? '🔐 Login' : '📝 Create Account'}
            </h2>
            <form onSubmit={handleAuthSubmit} style={{ display:'flex', flexDirection:'column', gap:'10px', marginTop:'12px' }}>
              {authModal === 'register' && (
                <input
                  className="control-select" style={{ width:'100%', padding:'8px', boxSizing:'border-box' }}
                  type="text" placeholder="Username" required minLength={3}
                  value={authForm.username}
                  onChange={e => setAuthForm({ ...authForm, username: e.target.value })}
                />
              )}
              {authModal === 'register' && (
                <input
                  className="control-select" style={{ width:'100%', padding:'8px', boxSizing:'border-box' }}
                  type="email" placeholder="Email" required
                  value={authForm.email}
                  onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                />
              )}
              {authModal === 'login' && (
                <input
                  className="control-select" style={{ width:'100%', padding:'8px', boxSizing:'border-box' }}
                  type="text" placeholder="Email or Username" required
                  value={authForm.loginId}
                  onChange={e => setAuthForm({ ...authForm, loginId: e.target.value })}
                />
              )}
              <input
                className="control-select" style={{ width:'100%', padding:'8px', boxSizing:'border-box' }}
                type="password" placeholder="Password" required minLength={8}
                value={authForm.password}
                onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
              />
              {authError && <p style={{ color:'var(--danger-color)', fontSize:'0.8rem', margin:0 }}>{authError}</p>}
              <button className="primary-btn" type="submit" disabled={authLoading}>
                {authLoading ? 'Please wait...' : authModal === 'login' ? 'Login' : 'Create Account'}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setAuthModal(authModal === 'login' ? 'register' : 'login')}>
                {authModal === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
