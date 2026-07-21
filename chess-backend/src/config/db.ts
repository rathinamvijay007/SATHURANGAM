import { PrismaClient } from "@prisma/client";
import { env } from "./env";

<<<<<<< HEAD
export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
=======
const logLevels = env.NODE_ENV === "development"
  ? (["query", "error", "warn"] as const)
  : (["error"] as const);

export const prisma = new PrismaClient({
  log: logLevels,
>>>>>>> a18fa7a5a2a380c797b998098cba9a4827c3c1c5
});

/** Call on graceful shutdown to release the DB connection pool */
export const disconnectDB = async (): Promise<void> => {
  await prisma.$disconnect();
};
