import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ValidationError } from "../errors/AppError";

type ValidationTarget = "body" | "params" | "query";

/**
 * Middleware factory that validates a specific part of the request (body/params/query)
 * against a Zod schema.
 *
 * On failure, throws a ValidationError with per-field detail that the error
 * middleware will format into { success: false, message, errors: [...] }.
 *
 * Usage:
 *   router.post("/register", validate(registerSchema, "body"), register);
 */
export const validate = (schema: ZodSchema, target: ValidationTarget = "body") => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return next(new ValidationError("Validation failed", errors));
    }

    // Replace the target with the parsed (type-coerced, stripped) value
    req[target] = result.data;
    next();
  };
};
