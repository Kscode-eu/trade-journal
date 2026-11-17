import { eq } from "drizzle-orm";
import { db, accounts } from "@/db";
import { bad, handler, ok } from "@/server/api";
export const GET = handler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const account = (await db.select().from(accounts).where(eq(accounts.id, id)))[0];
    if (!account || account.broker !== "saxo" || !account.snapshotJson)
      return bad("No Saxo report is available.", 404);
    const snapshot = JSON.parse(account.snapshotJson);
    return ok(
      {
        currency: account.currency,
        fetchedAt: snapshot.fetchedAt,
        from: snapshot.from,
        to: snapshot.to,
        reports: snapshot.reports,
      },
      { headers: { "Content-Disposition": 'attachment; filename="saxo-reports.json"' } },
    );
  },
);
