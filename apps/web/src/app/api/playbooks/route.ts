import { and, asc, eq } from "drizzle-orm";
import { db, playbooks, trades, notes, attachments } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { newId, nowIso } from "@/server/ids";

export const GET = handler(async () => {
  const rows = await db.select().from(playbooks).orderBy(asc(playbooks.createdAt));
  const counts = new Map<string, number>();
  for (const trade of await db.select({ playbookId: trades.playbookId }).from(trades)) {
    if (trade.playbookId) counts.set(trade.playbookId, (counts.get(trade.playbookId) ?? 0) + 1);
  }
  return ok({
    playbooks: rows.map((row) => ({
      ...row,
      rules: JSON.parse(row.rulesJson) as string[],
      tradeCount: counts.get(row.id) ?? 0,
    })),
  });
});

export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    rules?: string[];
    sourceNoteId?: string;
  };
  if (typeof body.name !== "string" || !body.name.trim()) return bad("name is required");
  if (body.description !== undefined && typeof body.description !== "string")
    return bad("Invalid description");
  if (
    body.rules !== undefined &&
    (!Array.isArray(body.rules) || body.rules.some((rule) => typeof rule !== "string"))
  )
    return bad("Invalid rules");
  const id = newId();
  await db.transaction(async (tx) => {
    if (body.sourceNoteId) {
      const note = (await tx.select().from(notes).where(eq(notes.id, body.sourceNoteId)))[0];
      requireValue(note, "Source note not found");
    }
    await tx.insert(playbooks).values({
      id,
      name: body.name!.trim(),
      description: body.description ?? "",
      rulesJson: JSON.stringify(body.rules ?? []),
      createdAt: nowIso(),
    });
    if (body.sourceNoteId) {
      const files = await tx
        .select()
        .from(attachments)
        .where(and(eq(attachments.ownerType, "note"), eq(attachments.ownerId, body.sourceNoteId)));
      for (const file of files) {
        await tx.insert(attachments).values({
          ...file,
          id: newId(),
          ownerType: "playbook",
          ownerId: id,
          createdAt: nowIso(),
        });
      }
    }
  });
  return ok({ id });
});
