import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { matchmakingService } from "../services/matchmakingService";
import { gameEngineService } from "../services/gameEngineService";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-chess-key-2026";

// Keep track of active sockets by userId
const userSockets = new Map<string, string>(); // userId -> socketId

export const setupSocketHandlers = (io: Server): void => {
  // Middleware to authenticate socket connection
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    
    if (!token) {
      return next(new Error("Authentication error: Token required"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  // Handle Matchmaking Match Found event
  matchmakingService.onMatchFound = async (match) => {
    const { gameId, whitePlayerId, blackPlayerId, timeControl } = match;

    const whiteSocketId = userSockets.get(whitePlayerId);
    const blackSocketId = userSockets.get(blackPlayerId);

    // Notify White player
    if (whiteSocketId) {
      io.to(whiteSocketId).emit("matchFound", {
        gameId,
        color: "white",
        opponentId: blackPlayerId,
        timeControl,
      });
    }

    // Notify Black player
    if (blackSocketId) {
      io.to(blackSocketId).emit("matchFound", {
        gameId,
        color: "black",
        opponentId: whitePlayerId,
        timeControl,
      });
    }
  };

  // Handle Game Clock Timeout event
  gameEngineService.onGameTimeout = (gameId, winnerId, elapsedDetails) => {
    io.to(gameId).emit("gameOver", {
      outcome: "TIMEOUT",
      winner: winnerId,
      ratingChanges: elapsedDetails.ratingChanges,
      fen: elapsedDetails.fen,
    });
  };

  // Connection Handler
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId;
    userSockets.set(userId, socket.id);
    console.log(`User connected: ${userId} (Socket: ${socket.id})`);

    // --- MATCHMAKING EVENTS ---

    socket.on("joinQueue", async (data: { timeControl: string }) => {
      const { timeControl } = data;
      if (!timeControl) {
        socket.emit("error", { message: "Time control is required" });
        return;
      }
      
      console.log(`User ${userId} joined queue for ${timeControl}`);
      await matchmakingService.joinQueue(userId, timeControl);
      socket.emit("queueJoined", { timeControl });
    });

    socket.on("leaveQueue", () => {
      console.log(`User ${userId} left all queues`);
      matchmakingService.leaveQueue(userId);
      socket.emit("queueLeft");
    });

    // --- GAMEPLAY EVENTS ---

    socket.on("joinGame", async (data: { gameId: string }) => {
      const { gameId } = data;
      if (!gameId) {
        socket.emit("error", { message: "Game ID is required" });
        return;
      }

      // Check if game exists in database
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          whitePlayer: { select: { id: true, username: true } },
          blackPlayer: { select: { id: true, username: true } },
        },
      });

      if (!game) {
        socket.emit("error", { message: "Game not found" });
        return;
      }

      // Join the socket.io room
      socket.join(gameId);
      console.log(`User ${userId} joined socket room: ${gameId}`);

      // If game is active and not already in memory, load it
      if (game.status === "IN_PROGRESS" && !gameEngineService.getActiveGame(gameId)) {
        await gameEngineService.startGame(
          gameId,
          game.whitePlayerId,
          game.blackPlayerId,
          game.timeControl
        );
        // Sync time from database
        const active = gameEngineService.getActiveGame(gameId);
        if (active) {
          active.whiteTimeLeftMs = game.whiteTimeLeftMs;
          active.blackTimeLeftMs = game.blackTimeLeftMs;
        }
      }

      // Broadcast join
      socket.to(gameId).emit("playerJoined", { userId });
      socket.emit("gameSynced", {
        gameId: game.id,
        status: game.status,
        fen: game.fen,
        timeControl: game.timeControl,
        whiteTimeLeftMs: game.whiteTimeLeftMs,
        blackTimeLeftMs: game.blackTimeLeftMs,
      });
    });

    socket.on("makeMove", async (data: { gameId: string; from: string; to: string; promotion?: string }) => {
      const { gameId, from, to, promotion } = data;

      if (!gameId || !from || !to) {
        socket.emit("error", { message: "Invalid move parameters" });
        return;
      }

      const result = await gameEngineService.makeMove(gameId, userId, { from, to, promotion });

      if (!result.success) {
        socket.emit("moveRejected", { error: result.error });
        return;
      }

      if (result.gameOver) {
        // Broadcast move and game over
        io.to(gameId).emit("moveMade", {
          move: result.move,
          fen: result.fen,
          whiteTimeLeftMs: result.whiteTimeLeftMs,
          blackTimeLeftMs: result.blackTimeLeftMs,
        });

        io.to(gameId).emit("gameOver", {
          outcome: result.outcome,
          winner: result.winner,
          ratingChanges: result.ratingChanges,
        });
      } else {
        // Broadcast move only
        io.to(gameId).emit("moveMade", {
          move: result.move,
          fen: result.fen,
          whiteTimeLeftMs: result.whiteTimeLeftMs,
          blackTimeLeftMs: result.blackTimeLeftMs,
        });
      }
    });

    socket.on("offerDraw", (data: { gameId: string }) => {
      const { gameId } = data;
      if (!gameId) return;
      socket.to(gameId).emit("drawOffered", { byPlayerId: userId });
    });

    socket.on("declineDraw", (data: { gameId: string }) => {
      const { gameId } = data;
      if (!gameId) return;
      socket.to(gameId).emit("drawDeclined", { byPlayerId: userId });
    });

    socket.on("acceptDraw", async (data: { gameId: string }) => {
      const { gameId } = data;
      if (!gameId) return;

      const result = await gameEngineService.drawByAgreement(gameId);
      if (result.success) {
        io.to(gameId).emit("gameOver", {
          outcome: "DRAW_AGREEMENT",
          ratingChanges: result.ratingChanges,
        });
      } else {
        socket.emit("error", { message: result.error || "Could not accept draw" });
      }
    });

    socket.on("resign", async (data: { gameId: string }) => {
      const { gameId } = data;
      if (!gameId) return;

      const result = await gameEngineService.resign(gameId, userId);
      if (result.success) {
        io.to(gameId).emit("gameOver", {
          outcome: "RESIGNATION",
          winner: result.winner,
          ratingChanges: result.ratingChanges,
        });
      } else {
        socket.emit("error", { message: result.error || "Could not resign" });
      }
    });

    socket.on("sendChatMessage", async (data: { gameId: string; content: string }) => {
      const { gameId, content } = data;
      if (!gameId || !content) return;

      try {
        const message = await prisma.chatMessage.create({
          data: {
            gameId,
            senderId: userId,
            content,
          },
          include: {
            sender: {
              select: { username: true },
            },
          },
        });

        io.to(gameId).emit("chatMessage", {
          id: message.id,
          gameId: message.gameId,
          senderId: message.senderId,
          senderUsername: message.sender.username,
          content: message.content,
          createdAt: message.createdAt,
        });
      } catch (err) {
        socket.emit("error", { message: "Could not send chat message" });
      }
    });

    // --- DISCONNECT ---

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${userId} (Socket: ${socket.id})`);
      userSockets.delete(userId);
      matchmakingService.leaveQueue(userId);
    });
  });
};
