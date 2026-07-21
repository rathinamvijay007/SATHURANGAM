import { Server, Socket } from "socket.io";
import { prisma } from "../config/db";
import { matchmakingService } from "../services/matchmakingService";
import { gameEngineService } from "../services/gameEngineService";
import { verifyAccessToken } from "../middleware/authMiddleware";
import { logger } from "../utils/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SocketError {
  event: string;
  message: string;
  code?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────────────────────────────────────

/** userId → socketId — tracks currently connected sockets */
const userSockets = new Map<string, string>();

/** gameId → userId — tracks pending draw offers */
const pendingDrawOffers = new Map<string, string>();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const emitError = (socket: Socket, event: string, message: string, code?: string): void => {
  const payload: SocketError = { event, message, ...(code && { code }) };
  socket.emit("error", payload);
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

export const setupSocketHandlers = (io: Server): void => {

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication error: Token required"));
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      next();
    } catch {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  // ── Global game timeout callback ───────────────────────────────────────────
  gameEngineService.onGameTimeout = (gameId, winnerId, details) => {
    logger.info(`Game ${gameId} ended by timeout. Winner: ${winnerId}`);
    io.to(gameId).emit("gameOver", {
      outcome: "TIMEOUT",
      winner: winnerId,
      ratingChanges: details.ratingChanges,
      fen: details.fen,
    });
  };

  // ── Matchmaking callback ───────────────────────────────────────────────────
  matchmakingService.onMatchFound = async ({ gameId, whitePlayerId, blackPlayerId, timeControl }) => {
    logger.info(`Match found: ${gameId} (${whitePlayerId} vs ${blackPlayerId})`);

    const notify = (playerId: string, color: "white" | "black", opponentId: string) => {
      const socketId = userSockets.get(playerId);
      if (socketId) {
        io.to(socketId).emit("matchFound", { gameId, color, opponentId, timeControl });
      }
    };

    notify(whitePlayerId, "white", blackPlayerId);
    notify(blackPlayerId, "black", whitePlayerId);
  };

  // ── Connection ─────────────────────────────────────────────────────────────
  io.on("connection", (socket: Socket) => {
    const userId: string = socket.data.userId;
    userSockets.set(userId, socket.id);
    logger.info(`Socket connected: userId=${userId} socketId=${socket.id}`);

    // ── MATCHMAKING ──────────────────────────────────────────────────────────

    socket.on("joinQueue", async (data: { timeControl: string }) => {
      if (!data?.timeControl) {
        return emitError(socket, "joinQueue", "timeControl is required", "MISSING_FIELD");
      }
      logger.debug(`User ${userId} joining queue: ${data.timeControl}`);
      await matchmakingService.joinQueue(userId, data.timeControl);
      socket.emit("queueJoined", { timeControl: data.timeControl });
    });

    socket.on("leaveQueue", () => {
      logger.debug(`User ${userId} leaving queue`);
      matchmakingService.leaveQueue(userId);
      socket.emit("queueLeft");
    });

    // ── GAME ROOM ────────────────────────────────────────────────────────────

    socket.on("joinGame", async (data: { gameId: string }) => {
      if (!data?.gameId) {
        return emitError(socket, "joinGame", "gameId is required", "MISSING_FIELD");
      }

      const game = await prisma.game.findUnique({
        where: { id: data.gameId },
        include: {
          whitePlayer: { select: { id: true, username: true, avatar: true, rating: true } },
          blackPlayer: { select: { id: true, username: true, avatar: true, rating: true } },
        },
      });

      if (!game) {
        return emitError(socket, "joinGame", "Game not found", "NOT_FOUND");
      }

      socket.join(data.gameId);
      logger.debug(`User ${userId} joined room: ${data.gameId}`);

      // Reconnection: reload game into memory if it was active but dropped
      if (game.status === "IN_PROGRESS" && !gameEngineService.getActiveGame(data.gameId)) {
        await gameEngineService.startGame(
          data.gameId,
          game.whitePlayerId,
          game.blackPlayerId,
          game.timeControl
        );
        const active = gameEngineService.getActiveGame(data.gameId);
        if (active) {
          active.whiteTimeLeftMs = game.whiteTimeLeftMs;
          active.blackTimeLeftMs = game.blackTimeLeftMs;
          if (game.lastMoveAt) active.lastMoveAt = game.lastMoveAt.getTime();
        }
      }

      socket.to(data.gameId).emit("playerJoined", { userId });
      socket.emit("gameSynced", {
        gameId: game.id,
        status: game.status,
        fen: game.fen,
        pgn: game.pgn,
        timeControl: game.timeControl,
        whiteTimeLeftMs: game.whiteTimeLeftMs,
        blackTimeLeftMs: game.blackTimeLeftMs,
        whitePlayer: game.whitePlayer,
        blackPlayer: game.blackPlayer,
      });
    });

    socket.on("leaveGame", (data: { gameId: string }) => {
      if (!data?.gameId) return;
      socket.leave(data.gameId);
      socket.to(data.gameId).emit("playerLeft", { userId });
      logger.debug(`User ${userId} left room: ${data.gameId}`);
    });

    // ── GAMEPLAY ─────────────────────────────────────────────────────────────

    socket.on("makeMove", async (data: { gameId: string; from: string; to: string; promotion?: string }) => {
      if (!data?.gameId || !data.from || !data.to) {
        return emitError(socket, "makeMove", "gameId, from, and to are required", "MISSING_FIELD");
      }

      const result = await gameEngineService.makeMove(data.gameId, userId, {
        from: data.from,
        to: data.to,
        promotion: data.promotion,
      });

      if (!result.success) {
        return socket.emit("moveRejected", { error: result.error });
      }

      // Always broadcast the move to both players
      io.to(data.gameId).emit("moveMade", {
        move: result.move,
        fen: result.fen,
        whiteTimeLeftMs: result.whiteTimeLeftMs,
        blackTimeLeftMs: result.blackTimeLeftMs,
      });

      if (result.gameOver) {
        // Update win/loss/draw counters
        if (result.outcome !== "DRAW" && result.outcome !== "STALEMATE" &&
            result.outcome !== "THREEFOLD_REPETITION" && result.outcome !== "INSUFFICIENT_MATERIAL" &&
            result.outcome !== "FIFTY_MOVES" && result.winner) {
          const game = gameEngineService.getActiveGame(data.gameId);
          const loserId = result.winner === game?.whitePlayerId ? game?.blackPlayerId : game?.whitePlayerId;
          if (result.winner && loserId) {
            await prisma.$transaction([
              prisma.user.update({ where: { id: result.winner }, data: { wins: { increment: 1 } } }),
              prisma.user.update({ where: { id: loserId }, data: { losses: { increment: 1 } } }),
            ]).catch(() => {}); // Non-fatal
          }
        } else if (!result.winner) {
          const activeGame = gameEngineService.getActiveGame(data.gameId);
          if (activeGame) {
            await prisma.$transaction([
              prisma.user.update({ where: { id: activeGame.whitePlayerId }, data: { draws: { increment: 1 } } }),
              prisma.user.update({ where: { id: activeGame.blackPlayerId }, data: { draws: { increment: 1 } } }),
            ]).catch(() => {}); // Non-fatal
          }
        }

        io.to(data.gameId).emit("gameOver", {
          outcome: result.outcome,
          winner: result.winner,
          ratingChanges: result.ratingChanges,
        });
        logger.info(`Game ${data.gameId} ended: ${result.outcome}`);
      }
    });

    // ── DRAW HANDLING ────────────────────────────────────────────────────────

    socket.on("offerDraw", (data: { gameId: string }) => {
      if (!data?.gameId) return emitError(socket, "offerDraw", "gameId is required", "MISSING_FIELD");
      pendingDrawOffers.set(data.gameId, userId);
      socket.to(data.gameId).emit("drawOffered", { byPlayerId: userId });
    });

    socket.on("declineDraw", (data: { gameId: string }) => {
      if (!data?.gameId) return emitError(socket, "declineDraw", "gameId is required", "MISSING_FIELD");
      pendingDrawOffers.delete(data.gameId);
      socket.to(data.gameId).emit("drawDeclined", { byPlayerId: userId });
    });

    socket.on("acceptDraw", async (data: { gameId: string }) => {
      if (!data?.gameId) return emitError(socket, "acceptDraw", "gameId is required", "MISSING_FIELD");

      const offeredBy = pendingDrawOffers.get(data.gameId);
      if (!offeredBy || offeredBy === userId) {
        return emitError(socket, "acceptDraw", "No pending draw offer", "NO_OFFER");
      }

      pendingDrawOffers.delete(data.gameId);
      const result = await gameEngineService.drawByAgreement(data.gameId);

      if (!result.success) {
        return emitError(socket, "acceptDraw", result.error || "Could not accept draw", "DRAW_FAILED");
      }

      // Update draw counters
      const game = await prisma.game.findUnique({
        where: { id: data.gameId },
        select: { whitePlayerId: true, blackPlayerId: true },
      });
      if (game) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: game.whitePlayerId }, data: { draws: { increment: 1 } } }),
          prisma.user.update({ where: { id: game.blackPlayerId }, data: { draws: { increment: 1 } } }),
        ]).catch(() => {});
      }

      io.to(data.gameId).emit("gameOver", {
        outcome: "DRAW_AGREEMENT",
        ratingChanges: result.ratingChanges,
      });
      logger.info(`Game ${data.gameId} ended in draw by agreement`);
    });

    // ── RESIGN ───────────────────────────────────────────────────────────────

    socket.on("resign", async (data: { gameId: string }) => {
      if (!data?.gameId) return emitError(socket, "resign", "gameId is required", "MISSING_FIELD");

      const result = await gameEngineService.resign(data.gameId, userId);

      if (!result.success) {
        return emitError(socket, "resign", result.error || "Could not resign", "RESIGN_FAILED");
      }

      if (result.winner) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: result.winner }, data: { wins: { increment: 1 } } }),
          prisma.user.update({ where: { id: userId }, data: { losses: { increment: 1 } } }),
        ]).catch(() => {});
      }

      io.to(data.gameId).emit("gameOver", {
        outcome: "RESIGNATION",
        winner: result.winner,
        ratingChanges: result.ratingChanges,
      });
      logger.info(`Game ${data.gameId}: user ${userId} resigned`);
    });

    // ── CHAT ─────────────────────────────────────────────────────────────────

    socket.on("sendChatMessage", async (data: { gameId: string; content: string }) => {
      if (!data?.gameId || !data.content?.trim()) {
        return emitError(socket, "sendChatMessage", "gameId and content are required", "MISSING_FIELD");
      }

      const content = data.content.trim().slice(0, 500); // Sanitize length

      try {
        const message = await prisma.chatMessage.create({
          data: { gameId: data.gameId, senderId: userId, content },
          include: { sender: { select: { username: true } } },
        });

        io.to(data.gameId).emit("chatMessage", {
          id: message.id,
          gameId: message.gameId,
          senderId: message.senderId,
          senderUsername: message.sender.username,
          content: message.content,
          createdAt: message.createdAt,
        });
      } catch {
        emitError(socket, "sendChatMessage", "Could not send message", "DB_ERROR");
      }
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────

    socket.on("disconnect", (reason) => {
      logger.info(`Socket disconnected: userId=${userId} reason=${reason}`);
      userSockets.delete(userId);
      matchmakingService.leaveQueue(userId);
    });
  });
};
