import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express route handler and forwards any rejected promise
 * to Express's next(err), which triggers the centralized error middleware.
 *
 * This eliminates try/catch boilerplate in every controller function.
 *
 * Usage:
 *   router.get("/profile", asyncHandler(getProfile));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
