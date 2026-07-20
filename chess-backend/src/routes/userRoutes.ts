import { Router } from "express";
import { getProfile, getLeaderboard } from "../controllers/userController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

router.get("/profile", authenticateJWT, getProfile);
router.get("/leaderboard", getLeaderboard);

export default router;
