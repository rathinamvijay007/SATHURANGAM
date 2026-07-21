import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { NotFoundError, UnauthorizedError, ConflictError } from "../errors/AppError";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  UpdateProfileInput,
  ChangePasswordInput,
} from "../validators/userValidator";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/profile
// ─────────────────────────────────────────────────────────────────────────────
export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      avatar: true,
      rating: true,
      wins: true,
      losses: true,
      draws: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  if (!user) throw new NotFoundError("User");

  ApiResponse.success(res, { user }, "Profile retrieved successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/profile
// ─────────────────────────────────────────────────────────────────────────────
export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { username, avatar } = req.body as UpdateProfileInput;

  if (username) {
    const exists = await prisma.user.findFirst({
      where: { username, NOT: { id: req.user!.userId } },
      select: { id: true },
    });
    if (exists) throw new ConflictError("Username is already taken");
  }

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: {
      ...(username && { username }),
      ...(avatar !== undefined && { avatar }),
    },
    select: {
      id: true,
      username: true,
      email: true,
      avatar: true,
      rating: true,
      updatedAt: true,
    },
  });

  ApiResponse.success(res, { user }, "Profile updated successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/password
// ─────────────────────────────────────────────────────────────────────────────
export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { passwordHash: true },
  });

  if (!user) throw new NotFoundError("User");

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) throw new UnauthorizedError("Current password is incorrect");

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { passwordHash: newHash, refreshTokenHash: null }, // invalidate all sessions
  });

  ApiResponse.success(res, null, "Password changed successfully. Please log in again.");
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/leaderboard
// ─────────────────────────────────────────────────────────────────────────────
export const getLeaderboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      orderBy: { rating: "desc" },
      select: { id: true, username: true, avatar: true, rating: true, wins: true, losses: true, draws: true },
      take: limit,
      skip,
    }),
    prisma.user.count(),
  ]);

  const ranked = users.map((user, index) => ({ rank: skip + index + 1, ...user }));

  ApiResponse.success(res, {
    leaderboard: ranked,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, "Leaderboard retrieved successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id/stats
// ─────────────────────────────────────────────────────────────────────────────
export const getStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      avatar: true,
      rating: true,
      wins: true,
      losses: true,
      draws: true,
      createdAt: true,
    },
  });

  if (!user) throw new NotFoundError("User");

  const totalGames = user.wins + user.losses + user.draws;
  const winRate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) : 0;

  ApiResponse.success(res, {
    user,
    stats: { totalGames, winRate },
  }, "User stats retrieved successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id/matches
// ─────────────────────────────────────────────────────────────────────────────
export const getMatchHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  const userExists = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!userExists) throw new NotFoundError("User");

  const where = {
    OR: [{ whitePlayerId: id }, { blackPlayerId: id }],
    ...(status && { status }),
  };

  const [games, total] = await prisma.$transaction([
    prisma.game.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
      select: {
        id: true,
        status: true,
        outcome: true,
        fen: true,
        pgn: true,
        timeControl: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        whitePlayer: { select: { id: true, username: true, rating: true, avatar: true } },
        blackPlayer: { select: { id: true, username: true, rating: true, avatar: true } },
      },
    }),
    prisma.game.count({ where }),
  ]);

  ApiResponse.success(res, {
    games,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, "Match history retrieved successfully");
});
