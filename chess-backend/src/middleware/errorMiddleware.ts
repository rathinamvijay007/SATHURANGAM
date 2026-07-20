import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { AppError, ConflictError, UnauthorizedError, NotFoundError } from "../errors/AppError";
import { ApiResponse } from "../utils/ApiResponse";
import { logger } from "../utils/logger";
import { env } from "../config/env";

/**
 * Centralized Express error-handling middleware.
 *
 * Must be registered LAST in app.ts (after all routes).
 * Catches:
 *   - AppError subclasses (operational errors)   → expose message to client
 *   - Prisma P2002 (unique constraint violation)  → mapped to ConflictError
 *   - Prisma P2025 (record not found)             → mapped to NotFoundError
 *   - JWT errors                                  → mapped to UnauthorizedError
 *   - Unknown errors                              → 500, message hidden in production
 */
export const errorMiddleware = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // --- Prisma-specific error mapping ---
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const fields = (err.meta?.target as string[])?.join(", ") ?? "field";
      const mapped = new ConflictError(`A record with that ${fields} already exists`);
      ApiResponse.error(res, mapped.message, mapped.statusCode);
      return;
    }
    if (err.code === "P2025") {
      const mapped = new NotFoundError("Record");
      ApiResponse.error(res, mapped.message, mapped.statusCode);
      return;
    }
  }

  // --- JWT error mapping ---
  if (err.name === "JsonWebTokenError" || err.name === "NotBeforeError") {
    const mapped = new UnauthorizedError("Invalid token");
    ApiResponse.error(res, mapped.message, mapped.statusCode);
    return;
  }
  if (err.name === "TokenExpiredError") {
    const mapped = new UnauthorizedError("Token has expired");
    ApiResponse.error(res, mapped.message, mapped.statusCode);
    return;
  }

  // --- Operational AppError ---
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error("Non-operational error:", { message: err.message, stack: err.stack });
    }
    ApiResponse.error(res, err.message, err.statusCode, err.errors);
    return;
  }

  // --- Unknown / programming error ---
  logger.error("Unhandled error:", { message: err.message, stack: err.stack });
  const message =
    env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please try again later."
      : err.message;
  ApiResponse.error(res, message, 500);
};
