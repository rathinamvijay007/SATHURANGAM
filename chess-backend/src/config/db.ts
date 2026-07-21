import { PrismaClient } from "@prisma/client";
import { env } from "./env";

export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

/** Call on graceful shutdown to release the DB connection pool */
export const disconnectDB = async (): Promise<void> => {
  await prisma.$disconnect();
};
