import { Router } from "express";
import { register, login, refreshToken, logout, getMe } from "../controllers/authController";
import { authenticateJWT } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import { authRateLimiter } from "../middleware/rateLimiter";
import { registerSchema, loginSchema, refreshTokenSchema } from "../validators/authValidator";

const router = Router();

// Apply stricter rate limiting to all auth endpoints
router.use(authRateLimiter);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 */
router.post("/register", validate(registerSchema), register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Login with email/username and password
 */
router.post("/login", validate(loginSchema), login);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Exchange a refresh token for a new access token
 */
router.post("/refresh", validate(refreshTokenSchema), refreshToken);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Invalidate the current refresh token (logout)
 */
router.post("/logout", authenticateJWT, logout);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get the currently authenticated user's profile
 */
router.get("/me", authenticateJWT, getMe);

export default router;
