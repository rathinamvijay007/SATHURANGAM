import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError, ForbiddenError } from "../errors/AppError";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  /** Convenience accessor kept for backward compatibility with existing controllers */
  userId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────

export const signAccessToken = (userId: string, role: string): string => {
  return jwt.sign({ userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const signRefreshToken = (userId: string, role: string): string => {
  return jwt.sign({ userId, role }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
};

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the Bearer access token in the Authorization header.
 * Attaches { userId, role } to req.user and req.userId (compat) on success.
 * Throws UnauthorizedError / ForbiddenError, forwarded to error middleware.
 */
export const authenticateJWT = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Authorization header must be 'Bearer <token>'"));
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return next(new UnauthorizedError("Access token is required"));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    req.userId = payload.userId; // backward compat for existing controllers
    next();
  } catch (err) {
    // jwt.verify throws JsonWebTokenError | TokenExpiredError — error middleware handles them
    next(err);
  }
};

/**
 * Role-based access control middleware factory.
 * Must be used AFTER authenticateJWT.
 *
 * Usage:
 *   router.delete("/:id", authenticateJWT, authorize("ADMIN"), deleteGame);
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`This action requires one of these roles: ${roles.join(", ")}`));
    }
    next();
  };
};
