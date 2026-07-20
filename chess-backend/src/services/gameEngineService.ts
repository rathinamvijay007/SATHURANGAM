import { Chess } from "chess.js";
import { prisma } from "../config/db";
import { updatePlayerRatings } from "./eloService";

export interface ActiveGame {
  gameId: string;
  chess: Chess;
  whitePlayerId: string;
  blackPlayerId: string;
  whiteTimeLeftMs: number;
  blackTimeLeftMs: number;
  timeIncrementMs: number;
  lastMoveAt: number; // timestamp in ms
  activeTimeout: NodeJS.Timeout | null;
}

class GameEngineService {
  private activeGames = new Map<string, ActiveGame>();
  
  // Callback when a game ends due to timeout
  public onGameTimeout: ((gameId: string, winnerId: string, elapsedDetails: any) => void) | null = null;

  /**
   * Parse time control string (e.g. "3+2", "10+0")
   */
  public parseTimeControl(timeControl: string): { initialTimeMs: number; incrementMs: number } {
    const parts = timeControl.split("+");
    const minutes = parseInt(parts[0]) || 10;
    const incrementSeconds = parseInt(parts[1]) || 0;

    return {
      initialTimeMs: minutes * 60 * 1000,
      incrementMs: incrementSeconds * 1000,
    };
  }

  /**
   * Initializes a game in memory and starts the initial clock for White.
   */
  public async startGame(
    gameId: string,
    whitePlayerId: string,
    blackPlayerId: string,
    timeControl: string
  ): Promise<ActiveGame> {
    const { initialTimeMs, incrementMs } = this.parseTimeControl(timeControl);
    const now = Date.now();

    const activeGame: ActiveGame = {
      gameId,
      chess: new Chess(),
      whitePlayerId,
      blackPlayerId,
      whiteTimeLeftMs: initialTimeMs,
      blackTimeLeftMs: initialTimeMs,
      timeIncrementMs: incrementMs,
      lastMoveAt: now,
      activeTimeout: null,
    };

    // Set timeout for White's first move
    this.scheduleTimeout(activeGame, whitePlayerId, initialTimeMs);

    this.activeGames.set(gameId, activeGame);
    return activeGame;
  }

  /**
   * Schedules a server-side timeout execution when a player's clock runs down to 0.
   */
  private scheduleTimeout(game: ActiveGame, playerId: string, timeLeftMs: number) {
    if (game.activeTimeout) {
      clearTimeout(game.activeTimeout);
    }

    game.activeTimeout = setTimeout(() => {
      this.handleTimeout(game.gameId, playerId);
    }, timeLeftMs);
  }

  /**
   * Handles the clock reaching zero for a player.
   */
  private async handleTimeout(gameId: string, losingPlayerId: string) {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    const winnerId = losingPlayerId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    const outcome = losingPlayerId === game.whitePlayerId ? "BLACK_WON" : "WHITE_WON";

    // Deduct remaining time
    if (losingPlayerId === game.whitePlayerId) {
      game.whiteTimeLeftMs = 0;
    } else {
      game.blackTimeLeftMs = 0;
    }

    // Clean up game memory
    this.cleanupGame(gameId);

    // Save state to database
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: outcome,
        outcome: "TIMEOUT",
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        whiteTimeLeftMs: game.whiteTimeLeftMs,
        blackTimeLeftMs: game.blackTimeLeftMs,
      },
    });

    // Update Elo
    const ratingChanges = await updatePlayerRatings(gameId, outcome);

    // Trigger callback
    if (this.onGameTimeout) {
      this.onGameTimeout(gameId, winnerId, {
        outcome: "TIMEOUT",
        winnerColor: winnerId === game.whitePlayerId ? "white" : "black",
        ratingChanges,
        fen: game.chess.fen(),
      });
    }
  }

  /**
   * Makes a move in the active game.
   */
  public async makeMove(
    gameId: string,
    playerId: string,
    moveInput: { from: string; to: string; promotion?: string }
  ): Promise<{
    success: boolean;
    error?: string;
    move?: any;
    fen?: string;
    whiteTimeLeftMs?: number;
    blackTimeLeftMs?: number;
    gameOver?: boolean;
    outcome?: string;
    winner?: string;
    ratingChanges?: any;
  }> {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return { success: false, error: "Game not found in active matches" };
    }

    const chess = game.chess;
    const activeColor = chess.turn(); // 'w' or 'b'
    const isWhiteTurn = activeColor === "w";

    // Verify turn authorization
    const activePlayerId = isWhiteTurn ? game.whitePlayerId : game.blackPlayerId;
    if (playerId !== activePlayerId) {
      return { success: false, error: "It is not your turn" };
    }

    const now = Date.now();
    const elapsed = now - game.lastMoveAt;

    // Deduct time and apply increment
    if (isWhiteTurn) {
      game.whiteTimeLeftMs -= elapsed;
      if (game.whiteTimeLeftMs <= 0) {
        // Handle timeout immediately
        await this.handleTimeout(gameId, game.whitePlayerId);
        return { success: true, gameOver: true, outcome: "TIMEOUT", winner: game.blackPlayerId };
      }
      game.whiteTimeLeftMs += game.timeIncrementMs;
    } else {
      game.blackTimeLeftMs -= elapsed;
      if (game.blackTimeLeftMs <= 0) {
        // Handle timeout immediately
        await this.handleTimeout(gameId, game.blackPlayerId);
        return { success: true, gameOver: true, outcome: "TIMEOUT", winner: game.whitePlayerId };
      }
      game.blackTimeLeftMs += game.timeIncrementMs;
    }

    // Try executing move
    try {
      const moveResult = chess.move({
        from: moveInput.from,
        to: moveInput.to,
        promotion: moveInput.promotion,
      });

      if (!moveResult) {
        // Invalid move
        return { success: false, error: "Invalid move" };
      }

      // Move is valid. Update lastMoveAt
      game.lastMoveAt = now;

      // Persist move to database
      const dbMove = await prisma.move.create({
        data: {
          gameId,
          moveNumber: chess.history().length,
          playerColor: isWhiteTurn ? "W" : "B",
          notation: moveResult.san,
          fenAfter: chess.fen(),
          timeLeftMs: isWhiteTurn ? game.whiteTimeLeftMs : game.blackTimeLeftMs,
        },
      });

      // Check if game is over
      let gameOver = false;
      let outcome: string | null = null;
      let gameStatus = "IN_PROGRESS";
      let winner: string | null = null;
      let ratingChanges = null;

      if (chess.isGameOver()) {
        gameOver = true;
        this.cleanupGame(gameId);

        if (chess.isCheckmate()) {
          outcome = "CHECKMATE";
          if (isWhiteTurn) {
            gameStatus = "WHITE_WON";
            winner = game.whitePlayerId;
          } else {
            gameStatus = "BLACK_WON";
            winner = game.blackPlayerId;
          }
        } else if (chess.isStalemate()) {
          outcome = "STALEMATE";
          gameStatus = "DRAW";
        } else if (chess.isThreefoldRepetition()) {
          outcome = "THREEFOLD_REPETITION";
          gameStatus = "DRAW";
        } else if (chess.isInsufficientMaterial()) {
          outcome = "INSUFFICIENT_MATERIAL";
          gameStatus = "DRAW";
        } else if (chess.isDraw()) {
          outcome = "FIFTY_MOVES";
          gameStatus = "DRAW";
        }

        // Save completed game state
        await prisma.game.update({
          where: { id: gameId },
          data: {
            status: gameStatus,
            outcome,
            fen: chess.fen(),
            pgn: chess.pgn(),
            whiteTimeLeftMs: game.whiteTimeLeftMs,
            blackTimeLeftMs: game.blackTimeLeftMs,
            lastMoveAt: new Date(now),
          },
        });

        // Update Ratings
        ratingChanges = await updatePlayerRatings(
          gameId,
          gameStatus as "WHITE_WON" | "BLACK_WON" | "DRAW"
        );
      } else {
        // Game continues, update active database record
        await prisma.game.update({
          where: { id: gameId },
          data: {
            fen: chess.fen(),
            pgn: chess.pgn(),
            whiteTimeLeftMs: game.whiteTimeLeftMs,
            blackTimeLeftMs: game.blackTimeLeftMs,
            lastMoveAt: new Date(now),
          },
        });

        // Schedule timeout for the next player
        const nextPlayerId = isWhiteTurn ? game.blackPlayerId : game.whitePlayerId;
        const nextPlayerTimeLeft = isWhiteTurn ? game.blackTimeLeftMs : game.whiteTimeLeftMs;
        this.scheduleTimeout(game, nextPlayerId, nextPlayerTimeLeft);
      }

      return {
        success: true,
        move: dbMove,
        fen: chess.fen(),
        whiteTimeLeftMs: game.whiteTimeLeftMs,
        blackTimeLeftMs: game.blackTimeLeftMs,
        gameOver,
        outcome: outcome || undefined,
        winner: winner || undefined,
        ratingChanges,
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Invalid move attempt" };
    }
  }

  /**
   * Resigns a game.
   */
  public async resign(gameId: string, playerId: string) {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return { success: false, error: "Game not active" };
    }

    const winnerId = playerId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    const outcomeStatus = playerId === game.whitePlayerId ? "BLACK_WON" : "WHITE_WON";

    this.cleanupGame(gameId);

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: outcomeStatus,
        outcome: "RESIGNATION",
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
      },
    });

    const ratingChanges = await updatePlayerRatings(gameId, outcomeStatus as "WHITE_WON" | "BLACK_WON");

    return {
      success: true,
      gameOver: true,
      outcome: "RESIGNATION",
      winner: winnerId,
      ratingChanges,
    };
  }

  /**
   * Draw agreement.
   */
  public async drawByAgreement(gameId: string) {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return { success: false, error: "Game not active" };
    }

    this.cleanupGame(gameId);

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: "DRAW",
        outcome: "DRAW_AGREEMENT",
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
      },
    });

    const ratingChanges = await updatePlayerRatings(gameId, "DRAW");

    return {
      success: true,
      gameOver: true,
      outcome: "DRAW_AGREEMENT",
      ratingChanges,
    };
  }

  /**
   * Gets an active game.
   */
  public getActiveGame(gameId: string): ActiveGame | undefined {
    return this.activeGames.get(gameId);
  }

  /**
   * Cleans up timer and removes game from in-memory cache.
   */
  public cleanupGame(gameId: string) {
    const game = this.activeGames.get(gameId);
    if (game) {
      if (game.activeTimeout) {
        clearTimeout(game.activeTimeout);
      }
      this.activeGames.delete(gameId);
    }
  }
}

export const gameEngineService = new GameEngineService();
export default gameEngineService;
