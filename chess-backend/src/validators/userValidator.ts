import { z } from "zod";

export const updateProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores")
    .optional(),
  avatar: z
    .string()
    .url("Avatar must be a valid URL")
    .max(500, "Avatar URL too long")
    .optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Current password is required" })
      .min(1, "Current password is required"),
    newPassword: z
      .string({ error: "New password is required" })
      .min(8, "New password must be at least 8 characters")
      .max(72, "New password must be at most 72 characters"),
    confirmPassword: z
      .string({ error: "Confirm password is required" })
      .min(1, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const leaderboardQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid("Invalid user ID format"),
});

export const matchHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["IN_PROGRESS", "WHITE_WON", "BLACK_WON", "DRAW", "WAITING"]).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
