import { Router } from "express";
import { getGameHistory, getGameDetails } from "../controllers/gameController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

router.get("/history", authenticateJWT, getGameHistory);
router.get("/:id", authenticateJWT, getGameDetails);

export default router;
