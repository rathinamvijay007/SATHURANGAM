import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { logger } from "../utils/logger";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../errors/AppError";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  AuthenticatedRequest,
} from "../middleware/authMiddleware";
import { RegisterInput, LoginInput, RefreshTokenInput } from "../validators/authValidator";

// Safe user projection — never expose passwordHash or refreshTokenHash
const SAFE_USER_SELECT = {
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
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { username, email, password } = req.body as RegisterInput;

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });

  if (existingUser) {
    const field = existingUser.username === username ? "Username" : "Email";
    throw new ConflictError(`${field} is already taken`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await prisma.user.create({
    data: { username, email, passwordHash },
    select: SAFE_USER_SELECT,
  });

  const accessToken = signAccessToken(newUser.id, newUser.role);
  const refreshToken = signRefreshToken(newUser.id, newUser.role);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  await prisma.user.update({
    where: { id: newUser.id },
    data: { refreshTokenHash },
  });

  logger.info(`New user registered: ${username}`);

  ApiResponse.success(res, { user: newUser, accessToken, refreshToken }, "User registered successfully", 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { loginId, password } = req.body as LoginInput;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: loginId }, { username: loginId }] },
  });

  // Use constant-time comparison to prevent timing attacks
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    logger.warn(`Failed login attempt for identifier: ${loginId}`);
    throw new UnauthorizedError("Invalid credentials");
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id, user.role);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash, lastLoginAt: new Date() },
  });

  logger.info(`User logged in: ${user.username}`);

  const safeUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    rating: user.rating,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    createdAt: user.createdAt,
  };

  ApiResponse.success(res, { user: safeUser, accessToken, refreshToken }, "Logged in successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────
export const refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { refreshToken: token } = req.body as RefreshTokenInput;

  let payload: { userId: string; role: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, refreshTokenHash: true },
  });

  if (!user || !user.refreshTokenHash) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const isValid = await bcrypt.compare(token, user.refreshTokenHash);
  if (!isValid) {
    // Possible token reuse attack — invalidate stored token
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: null },
    });
    logger.warn(`Refresh token reuse detected for userId: ${user.id}`);
    throw new UnauthorizedError("Refresh token has already been used");
  }

  // Rotate: issue a new pair
  const newAccessToken = signAccessToken(user.id, user.role);
  const newRefreshToken = signRefreshToken(user.id, user.role);
  const newHash = await bcrypt.hash(newRefreshToken, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: newHash },
  });

  ApiResponse.success(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, "Tokens refreshed");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { refreshTokenHash: null },
  });

  logger.info(`User logged out: ${req.user!.userId}`);
  ApiResponse.success(res, null, "Logged out successfully");
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
export const getMe = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: SAFE_USER_SELECT,
  });

  if (!user) throw new NotFoundError("User");

  ApiResponse.success(res, { user }, "Profile retrieved successfully");
});
