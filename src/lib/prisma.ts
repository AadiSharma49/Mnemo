import { PrismaClient } from "@prisma/client";

/**
 * Neon's free tier suspends the database when idle; the first connection after
 * that takes a few seconds to wake it. Prisma's default 5s connect timeout gives
 * up first ("Can't reach database server"), so allow up to 30s unless the
 * connection string already sets its own values.
 */
function withTimeouts(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "30");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "30");
    return u.toString();
  } catch {
    return url;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: withTimeouts(process.env.DATABASE_URL) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
