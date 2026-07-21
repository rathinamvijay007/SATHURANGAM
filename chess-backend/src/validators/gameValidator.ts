import { z } from "zod";

const TIME_CONTROL_REGEX = /^\d+\+\d+$/;

export const createGameSchema = z.object({
  whitePlayerId: z.string().uuid("Invalid white player ID"),
  blackPlayerId: z.string().uuid("Invalid black player ID"),
  timeControl: z
    .string()
    .regex(TIME_CONTROL_REGEX, "Time control must be in format 'minutes+increment' e.g. '5+3'"),
});

export const makeMoveSchema = z.object({
  from: z
<<<<<<< HEAD
    .string()
    .length(2, "From square must be exactly 2 characters (e.g. 'e2')")
    .regex(/^[a-h][1-8]$/, "From square must be a valid chess square (e.g. 'e2')"),
  to: z
    .string()
    .length(2, "To square must be exactly 2 characters (e.g. 'e4')")
    .regex(/^[a-h][1-8]$/, "To square must be a valid chess square (e.g. 'e4')"),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

export const drawActionSchema = z.object({
  action: z.enum(["offer", "accept", "decline"]),
=======
    .string({ required_error: "From square is required" })
    .length(2, "From square must be exactly 2 characters (e.g. 'e2')")
    .regex(/^[a-h][1-8]$/, "From square must be a valid chess square (e.g. 'e2')"),
  to: z
    .string({ required_error: "To square is required" })
    .length(2, "To square must be exactly 2 characters (e.g. 'e4')")
    .regex(/^[a-h][1-8]$/, "To square must be a valid chess square (e.g. 'e4')"),
  promotion: z.enum(["q", "r", "b", "n"], { message: "Promotion must be q, r, b, or n" }).optional(),
});

export const drawActionSchema = z.object({
  action: z.enum(["offer", "accept", "decline"], {
    required_error: "Action is required",
    invalid_type_error: "Action must be 'offer', 'accept', or 'decline'",
  }),
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
});

export const gameIdParamSchema = z.object({
  id: z.string().uuid("Invalid game ID format"),
});

export const gameHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["IN_PROGRESS", "WHITE_WON", "BLACK_WON", "DRAW", "WAITING"]).optional(),
  orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type MakeMoveInput = z.infer<typeof makeMoveSchema>;
export type DrawActionInput = z.infer<typeof drawActionSchema>;
export type GameHistoryQuery = z.infer<typeof gameHistoryQuerySchema>;
