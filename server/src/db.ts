// Single shared PrismaClient instance for the whole process.
// Re-using one client avoids exhausting the database connection pool.

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** Close the database connection cleanly on shutdown. */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
