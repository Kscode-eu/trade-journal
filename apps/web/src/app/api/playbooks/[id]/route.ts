import { and, eq } from "drizzle-orm";
import { db, playbooks, trades, attachments, missedTrades, tradeRuleChecks } from "@/db";
import { bad, handler, ok } from "@/server/api";

type Params = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const existing = (await db.select().from(playbooks).where(eq(playbooks.id, id)))[0];
  if (!existing) return bad("Playbook not found", 404);
  const body = (await request.json()) as { name?: string; description?: string; rules?: string[] };
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim()))
    return bad("name is required");
  if (body.description !== undefined && typeof body.description !== "string")
    return bad("Invalid description");
  if (
    body.rules !== undefined &&
    (!Array.isArray(body.rules) || body.rules.some((rule) => typeof rule !== "string"))
  )
    return bad("Invalid rules");
  await db
    .update(playbooks)
    .set({
      name: body.name?.trim() ?? existing.name,
      description: body.description ?? existing.description,
      rulesJson: body.rules ? JSON.stringify(body.rules) : existing.rulesJson,
    })
    .where(eq(playbooks.id, id));
  return ok({ updated: true });
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  await db.transaction(async (tx) => {
    await tx.update(trades).set({ playbookId: null }).where(eq(trades.playbookId, id));
    await tx.update(missedTrades).set({ playbookId: null }).where(eq(missedTrades.playbookId, id));
    await tx.delete(tradeRuleChecks).where(eq(tradeRuleChecks.playbookId, id));
    await tx
      .delete(attachments)
      .where(and(eq(attachments.ownerType, "playbook"), eq(attachments.ownerId, id)));
    await tx.delete(playbooks).where(eq(playbooks.id, id));
  });
  return ok({ deleted: true });
});
