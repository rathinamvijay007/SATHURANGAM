import { Response } from "express";

interface SuccessPayload<T> {
  success: true;
  message: string;
  data: T;
}

interface ErrorPayload {
  success: false;
  message: string;
  errors?: Record<string, string>[];
}

/**
 * Standardized API response builder.
 *
 * Every HTTP response in the app goes through one of these two methods,
 * ensuring a consistent { success, message, data } / { success, message, errors } envelope.
 */
export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message = "Success",
    statusCode = 200
  ): Response<SuccessPayload<T>> {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(
    res: Response,
    message = "An error occurred",
    statusCode = 500,
    errors?: Record<string, string>[]
  ): Response<ErrorPayload> {
    const payload: ErrorPayload = { success: false, message };
    if (errors?.length) payload.errors = errors;
    return res.status(statusCode).json(payload);
  }
}
