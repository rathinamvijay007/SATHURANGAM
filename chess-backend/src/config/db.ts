import { PrismaClient } from "@prisma/client";
import { env } from "./env";

const logLevels = env.NODE_ENV === "development"
  ? (["query", "error", "warn"] as const)
  : (["error"] as const);

export const prisma = new PrismaClient({
  log: logLevels,
});

/** Call on graceful shutdown to release the DB connection pool */
export const disconnectDB = async (): Promise<void> => {
  await prisma.$disconnect();
};
