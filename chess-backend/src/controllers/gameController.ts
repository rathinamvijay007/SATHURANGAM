import { Request, Response } from "express";
import { prisma } from "../config/db";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { NotFoundError, ForbiddenError, ConflictError } from "../errors/AppError";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { gameEngineService } from "../services/gameEngineService";
import { updatePlayerRatings } from "../services/eloService";
import { CreateGameInput, MakeMoveInput, DrawActionInput } from "../validators/gameValidator";
import { logger } from "../utils/logger";

// Reusable player select projection to avoid N+1
const PLAYER_SELECT = { id: true, username: true, rating: true, avatar: true };

// Track pending draw offers: gameId → userId who offered
const pendingDrawOffers = new Map<string, string>();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/games  — paginated game history for current user
// ─────────────────────────────────────────────────────────────────────────────
export const getGameHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const orderBy = (req.query.orderBy as string) || "createdAt";
  const order = (req.query.order as "asc" | "desc") || "desc";

  const where = {
    OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
    ...(status && { status }),
  };

  const [games, total] = await prisma.$transaction([
    prisma.game.findMany({
      where,
      orderBy: { [orderBy]: order },
      take: limit,
      skip,
      include: {
        whitePlayer: { select: PLAYER_SELECT },
        blackPlayer: { select: PLAYER_SELECT },
      },
    }),
    prisma.game.count({ where }),
  ]);

  ApiResponse.success(res, {
    games,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, "Game history retrieved successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/games/:id  — detailed game by ID
// ─────────────────────────────────────────────────────────────────────────────
export const getGameDetails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
<<<<<<< HEAD
  const id = req.params.id as string;
=======
  const { id } = req.params;
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      whitePlayer: { select: PLAYER_SELECT },
      blackPlayer: { select: PLAYER_SELECT },
      moves: { orderBy: { moveNumber: "asc" } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, username: true } } },
      },
    },
  });

  if (!game) throw new NotFoundError("Game");

  ApiResponse.success(res, { game }, "Game details retrieved successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/games  — create a game (admin / internal)
// ─────────────────────────────────────────────────────────────────────────────
export const createGame = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { whitePlayerId, blackPlayerId, timeControl } = req.body as CreateGameInput;

  if (whitePlayerId === blackPlayerId) {
    throw new ConflictError("White and black player must be different users");
  }

  const { initialTimeMs } = gameEngineService.parseTimeControl(timeControl);

  const game = await prisma.game.create({
    data: {
      whitePlayerId,
      blackPlayerId,
      status: "WAITING",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      timeControl,
      whiteTimeLeftMs: initialTimeMs,
      blackTimeLeftMs: initialTimeMs,
    },
    include: {
      whitePlayer: { select: PLAYER_SELECT },
      blackPlayer: { select: PLAYER_SELECT },
    },
  });

  logger.info(`Game created: ${game.id}`);
  ApiResponse.success(res, { game }, "Game created successfully", 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/games/:id  — update game metadata (admin)
// ─────────────────────────────────────────────────────────────────────────────
export const updateGame = asyncHandler(async (req: Request, res: Response): Promise<void> => {
<<<<<<< HEAD
  const id = req.params.id as string;
=======
  const { id } = req.params;
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5

  const existing = await prisma.game.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Game");

  const allowedFields = ["status", "outcome", "fen", "pgn"];
  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updateData[field] = req.body[field];
  }

  const game = await prisma.game.update({
    where: { id },
    data: updateData,
    include: {
      whitePlayer: { select: PLAYER_SELECT },
      blackPlayer: { select: PLAYER_SELECT },
    },
  });

  ApiResponse.success(res, { game }, "Game updated successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/games/:id  — delete game (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteGame = asyncHandler(async (req: Request, res: Response): Promise<void> => {
<<<<<<< HEAD
  const id = req.params.id as string;
=======
  const { id } = req.params;
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5

  const existing = await prisma.game.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Game");

  await prisma.game.delete({ where: { id } });

  logger.info(`Game deleted: ${id}`);
  ApiResponse.success(res, null, "Game deleted successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/games/:id/move  — make a chess move
// ─────────────────────────────────────────────────────────────────────────────
export const makeMove = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
<<<<<<< HEAD
  const id = req.params.id as string;
=======
  const { id } = req.params;
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
  const { from, to, promotion } = req.body as MakeMoveInput;
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { id },
    select: { status: true, whitePlayerId: true, blackPlayerId: true },
  });
  if (!game) throw new NotFoundError("Game");
  if (game.status !== "IN_PROGRESS") throw new ConflictError("Game is not in progress");
  if (game.whitePlayerId !== userId && game.blackPlayerId !== userId) {
    throw new ForbiddenError("You are not a player in this game");
  }

  const result = await gameEngineService.makeMove(id, userId, { from, to, promotion });

  if (!result.success) {
    throw new ConflictError(result.error || "Invalid move");
  }

  if (result.gameOver) {
    logger.info(`Game ${id} ended: ${result.outcome} — winner: ${result.winner ?? "draw"}`);
  }

  ApiResponse.success(res, result, result.gameOver ? "Game over" : "Move made successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/games/:id/resign  — resign the game
// ─────────────────────────────────────────────────────────────────────────────
export const resignGame = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
<<<<<<< HEAD
  const id = req.params.id as string;
=======
  const { id } = req.params;
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { id },
    select: { status: true, whitePlayerId: true, blackPlayerId: true },
  });
  if (!game) throw new NotFoundError("Game");
  if (game.status !== "IN_PROGRESS") throw new ConflictError("Game is not in progress");
  if (game.whitePlayerId !== userId && game.blackPlayerId !== userId) {
    throw new ForbiddenError("You are not a player in this game");
  }

  const result = await gameEngineService.resign(id, userId);
  if (!result.success) throw new ConflictError(result.error || "Could not resign");

  // Update win/loss counters
  const winnerId = result.winner!;
  const loserId = userId;
  await prisma.$transaction([
    prisma.user.update({ where: { id: winnerId }, data: { wins: { increment: 1 } } }),
    prisma.user.update({ where: { id: loserId }, data: { losses: { increment: 1 } } }),
  ]);

  logger.info(`Game ${id}: user ${userId} resigned`);
  ApiResponse.success(res, result, "Resigned successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/games/:id/draw  — offer / accept / decline draw
// ─────────────────────────────────────────────────────────────────────────────
export const handleDraw = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
<<<<<<< HEAD
  const id = req.params.id as string;
=======
  const { id } = req.params;
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
  const { action } = req.body as DrawActionInput;
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { id },
    select: { status: true, whitePlayerId: true, blackPlayerId: true },
  });
  if (!game) throw new NotFoundError("Game");
  if (game.status !== "IN_PROGRESS") throw new ConflictError("Game is not in progress");
  if (game.whitePlayerId !== userId && game.blackPlayerId !== userId) {
    throw new ForbiddenError("You are not a player in this game");
  }

  if (action === "offer") {
    pendingDrawOffers.set(id, userId);
    ApiResponse.success(res, { gameId: id }, "Draw offer sent");
    return;
  }

  if (action === "decline") {
    pendingDrawOffers.delete(id);
    ApiResponse.success(res, { gameId: id }, "Draw offer declined");
    return;
  }

  // action === "accept"
  const offeredBy = pendingDrawOffers.get(id);
  if (!offeredBy || offeredBy === userId) {
    throw new ConflictError("No pending draw offer to accept");
  }

  pendingDrawOffers.delete(id);
  const result = await gameEngineService.drawByAgreement(id);
  if (!result.success) throw new ConflictError(result.error || "Could not complete draw");

  // Update draw counters for both players
  await prisma.$transaction([
    prisma.user.update({ where: { id: game.whitePlayerId }, data: { draws: { increment: 1 } } }),
    prisma.user.update({ where: { id: game.blackPlayerId }, data: { draws: { increment: 1 } } }),
  ]);

  logger.info(`Game ${id} ended in draw by agreement`);
  ApiResponse.success(res, result, "Draw accepted — game ended");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/games/:id/finish  — force finish a game (admin or server)
// ─────────────────────────────────────────────────────────────────────────────
export const finishGame = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
<<<<<<< HEAD
  const id = req.params.id as string;
=======
  const { id } = req.params;
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
  const { status, outcome, winnerId } = req.body as {
    status: string;
    outcome: string;
    winnerId?: string;
  };

  const game = await prisma.game.findUnique({
    where: { id },
    select: { id: true, status: true, whitePlayerId: true, blackPlayerId: true },
  });
  if (!game) throw new NotFoundError("Game");
  if (game.status === "WHITE_WON" || game.status === "BLACK_WON" || game.status === "DRAW") {
    throw new ConflictError("Game is already finished");
  }

  gameEngineService.cleanupGame(id);

  const updatedGame = await prisma.game.update({
    where: { id },
    data: { status, outcome, finishedAt: new Date() },
  });

  const ratingChanges = await updatePlayerRatings(
    id,
    status as "WHITE_WON" | "BLACK_WON" | "DRAW"
  );

  logger.info(`Game ${id} force-finished: ${status}`);
  ApiResponse.success(res, { game: updatedGame, ratingChanges, winnerId }, "Game finished");
});
