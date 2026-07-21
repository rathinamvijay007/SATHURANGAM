import { Router } from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  getLeaderboard,
  getStats,
  getMatchHistory,
} from "../controllers/userController";
import { authenticateJWT } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import {
  updateProfileSchema,
  changePasswordSchema,
  userIdParamSchema,
  leaderboardQuerySchema,
  matchHistoryQuerySchema,
} from "../validators/userValidator";

const router = Router();

/**
 * @openapi
 * /api/users/profile:
 *   get:
 *     tags: [Users]
 *     summary: Get the authenticated user's profile
 */
router.get("/profile", authenticateJWT, getProfile);

/**
 * @openapi
 * /api/users/profile:
 *   patch:
 *     tags: [Users]
 *     summary: Update username or avatar
 */
router.patch(
  "/profile",
  authenticateJWT,
  validate(updateProfileSchema, "body"),
  updateProfile
);

/**
 * @openapi
 * /api/users/password:
 *   patch:
 *     tags: [Users]
 *     summary: Change authenticated user's password
 */
router.patch(
  "/password",
  authenticateJWT,
  validate(changePasswordSchema, "body"),
  changePassword
);

/**
 * @openapi
 * /api/users/leaderboard:
 *   get:
 *     tags: [Users]
 *     summary: Get paginated ELO leaderboard
 */
router.get("/leaderboard", validate(leaderboardQuerySchema, "query"), getLeaderboard);

/**
 * @openapi
 * /api/users/{id}/stats:
 *   get:
 *     tags: [Users]
 *     summary: Get win/loss/draw stats and rating for a specific user
 */
router.get("/:id/stats", validate(userIdParamSchema, "params"), getStats);

/**
 * @openapi
 * /api/users/{id}/matches:
 *   get:
 *     tags: [Users]
 *     summary: Get paginated match history for a specific user
 */
router.get(
  "/:id/matches",
  validate(userIdParamSchema, "params"),
  validate(matchHistoryQuerySchema, "query"),
  getMatchHistory
);

export default router;
