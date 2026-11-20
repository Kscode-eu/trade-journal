import { db, trades, accounts } from "@/db";
import { desc, eq, sql } from "drizzle-orm";
import { handler, ok } from "@/server/api";

/** Bound both database work and response size for trade-link searches. */
export const GET = handler(async (request: Request) => {
  const search = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const matches = await db
    .select({
      key: trades.key,
      playbookId: trades.playbookId,
      symbol: trades.symbol,
      direction: trades.direction,
      openedAt: trades.openedAt,
      accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown account')`,
    })
    .from(trades)
    .leftJoin(accounts, eq(accounts.id, trades.accountId))
    .where(
      sql`strpos(lower(${trades.symbol} || ' ' || ${trades.openedAt} || ' ' || COALESCE(${accounts.name}, 'Unknown account')), ${search}) > 0`,
    )
    .orderBy(desc(trades.openedAt))
    .limit(51);
  return ok({ trades: matches.slice(0, 50), hasMore: matches.length > 50 });
});
