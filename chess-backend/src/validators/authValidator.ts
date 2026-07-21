import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string({ error: "Username is required" })
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),
  password: z
    .string({ error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const loginSchema = z.object({
  loginId: z
    .string({ error: "Email or username is required" })
    .trim()
    .min(1, "Email or username cannot be empty"),
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password cannot be empty"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ error: "Refresh token is required" })
    .min(1, "Refresh token cannot be empty"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
