import { z } from "zod";

export const registerSchema = z.object({
  username: z
<<<<<<< HEAD
    .string()
=======
    .string({ required_error: "Username is required" })
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
  email: z
<<<<<<< HEAD
    .string()
=======
    .string({ required_error: "Email is required" })
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
    .trim()
    .toLowerCase()
    .email("Invalid email address"),
  password: z
<<<<<<< HEAD
    .string()
=======
    .string({ required_error: "Password is required" })
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const loginSchema = z.object({
  loginId: z
<<<<<<< HEAD
    .string()
    .trim()
    .min(1, "Email or username cannot be empty"),
  password: z
    .string()
=======
    .string({ required_error: "Email or username is required" })
    .trim()
    .min(1, "Email or username cannot be empty"),
  password: z
    .string({ required_error: "Password is required" })
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
    .min(1, "Password cannot be empty"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z
<<<<<<< HEAD
    .string()
=======
    .string({ required_error: "Refresh token is required" })
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
    .min(1, "Refresh token cannot be empty"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
