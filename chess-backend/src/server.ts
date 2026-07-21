import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { env } from "./config/env";
import { disconnectDB } from "./config/db";
import { setupSocketHandlers } from "./sockets/socketHandler";
import { logger } from "./utils/logger";

const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO — use validated env for CORS, not wildcard
// ─────────────────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

setupSocketHandlers(io);

// ─────────────────────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────────────────────
server.listen(env.PORT, () => {
  logger.info(`✅ Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  logger.info(`📖 API Docs available at http://localhost:${env.PORT}/api/docs`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown — closes server and DB connection pool cleanly
// ─────────────────────────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    logger.info("HTTP server closed");
    await disconnectDB();
    logger.info("Database disconnected");
    process.exit(0);
  });

  // Force exit after 10 seconds if shutdown stalls
  setTimeout(() => {
    logger.error("Graceful shutdown timeout — forcing exit");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Catch unhandled promise rejections and uncaught exceptions
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection:", { reason });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", { message: err.message, stack: err.stack });
  process.exit(1);
});
