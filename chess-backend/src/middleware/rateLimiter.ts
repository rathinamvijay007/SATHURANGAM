import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { ApiResponse } from "../utils/ApiResponse";
import { Request, Response, NextFunction } from "express";

const handler = (_req: Request, res: Response) => {
  ApiResponse.error(res, "Too many requests. Please try again later.", 429);
};

/** General API rate limiter — applied globally */
export const globalRateLimiter = env.NODE_ENV === "test"
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      handler,
    });

/** Auth-specific rate limiter — stricter, applied only to /api/auth/* */
export const authRateLimiter = env.NODE_ENV === "test"
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.AUTH_RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      handler,
      skipSuccessfulRequests: false,
    });
