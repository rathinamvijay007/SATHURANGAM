import { Router } from "express";
import {
  getGameHistory,
  getGameDetails,
  createGame,
  updateGame,
  deleteGame,
  makeMove,
  resignGame,
  handleDraw,
  finishGame,
} from "../controllers/gameController";
import { authenticateJWT, authorize } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import {
  createGameSchema,
  gameIdParamSchema,
  gameHistoryQuerySchema,
  makeMoveSchema,
  drawActionSchema,
} from "../validators/gameValidator";

const router = Router();

// All game routes require authentication
router.use(authenticateJWT);

/**
 * @openapi
 * /api/games:
 *   get:
 *     tags: [Games]
 *     summary: Get paginated game history for the authenticated user
 */
router.get("/", validate(gameHistoryQuerySchema, "query"), getGameHistory);

/**
 * @openapi
 * /api/games:
 *   post:
 *     tags: [Games]
 *     summary: Create a new game (Admin only)
 */
router.post("/", authorize("ADMIN"), validate(createGameSchema), createGame);

/**
 * @openapi
 * /api/games/{id}:
 *   get:
 *     tags: [Games]
 *     summary: Get detailed game info including moves and chat
 */
router.get("/:id", validate(gameIdParamSchema, "params"), getGameDetails);

/**
 * @openapi
 * /api/games/{id}:
 *   put:
 *     tags: [Games]
 *     summary: Update game metadata (Admin only)
 */
router.put("/:id", authorize("ADMIN"), validate(gameIdParamSchema, "params"), updateGame);

/**
 * @openapi
 * /api/games/{id}:
 *   delete:
 *     tags: [Games]
 *     summary: Delete a game record (Admin only)
 */
router.delete("/:id", authorize("ADMIN"), validate(gameIdParamSchema, "params"), deleteGame);

/**
 * @openapi
 * /api/games/{id}/move:
 *   post:
 *     tags: [Games]
 *     summary: Make a chess move in an active game
 */
router.post(
  "/:id/move",
  validate(gameIdParamSchema, "params"),
  validate(makeMoveSchema, "body"),
  makeMove
);

/**
 * @openapi
 * /api/games/{id}/resign:
 *   post:
 *     tags: [Games]
 *     summary: Resign the current game
 */
router.post("/:id/resign", validate(gameIdParamSchema, "params"), resignGame);

/**
 * @openapi
 * /api/games/{id}/draw:
 *   post:
 *     tags: [Games]
 *     summary: Offer, accept, or decline a draw
 */
router.post(
  "/:id/draw",
  validate(gameIdParamSchema, "params"),
  validate(drawActionSchema, "body"),
  handleDraw
);

/**
 * @openapi
 * /api/games/{id}/finish:
 *   post:
 *     tags: [Games]
 *     summary: Force-finish a game (Admin only)
 */
router.post("/:id/finish", authorize("ADMIN"), validate(gameIdParamSchema, "params"), finishGame);

export default router;
