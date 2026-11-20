import { desc, eq, sql } from "drizzle-orm";
import { accounts, db, trades } from "@/db";
import { handler, ok } from "@/server/api";

export const GET = handler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    return ok({
      trades: await db
        .select({
          key: trades.key,
          symbol: trades.symbol,
          direction: trades.direction,
          openedAt: trades.openedAt,
          accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown account')`,
        })
        .from(trades)
        .leftJoin(accounts, eq(accounts.id, trades.accountId))
        .where(eq(trades.playbookId, id))
        .orderBy(desc(trades.openedAt)),
    });
  },
);
