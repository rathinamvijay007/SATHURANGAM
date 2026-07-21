import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { errorMiddleware } from "./middleware/errorMiddleware";
import { morganStream } from "./utils/logger";
import { NotFoundError } from "./errors/AppError";
import { ApiResponse } from "./utils/ApiResponse";

import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import gameRoutes from "./routes/gameRoutes";

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// Security headers
// ─────────────────────────────────────────────────────────────────────────────
app.use(helmet());

// ─────────────────────────────────────────────────────────────────────────────
// CORS — restrict to configured origin, allow credentials
// ─────────────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ─────────────────────────────────────────────────────────────────────────────
// Compression + request parsing
// ─────────────────────────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: "10kb" })); // Prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─────────────────────────────────────────────────────────────────────────────
// HTTP request logging (Morgan → Winston)
// ─────────────────────────────────────────────────────────────────────────────
const morganFormat = env.NODE_ENV === "production" ? "combined" : "dev";
app.use(morgan(morganFormat, { stream: morganStream }));

// ─────────────────────────────────────────────────────────────────────────────
// Global rate limiter
// ─────────────────────────────────────────────────────────────────────────────
app.use(globalRateLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// API Documentation (Swagger UI)
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "Sathurangam Chess API",
  customCss: ".swagger-ui .topbar { display: none }",
}));

// Raw OpenAPI JSON spec
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  ApiResponse.success(res, {
    status: "healthy",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }, "Server is healthy");
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/games", gameRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  next(new NotFoundError(`Endpoint ${req.method} ${req.originalUrl}`));
});

// ─────────────────────────────────────────────────────────────────────────────
// Centralized error middleware — MUST be last
// ─────────────────────────────────────────────────────────────────────────────
app.use(errorMiddleware);

export default app;
