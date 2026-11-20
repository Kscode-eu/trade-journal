import { eq } from "drizzle-orm";
import { db, attachments } from "@/db";
import { handler, ok, bad, requireValue } from "@/server/api";
import { attachmentMime, MAX_ATTACHMENT_SIZE } from "@/lib/attachment-validation";
import { EXCALIDRAW_MIME } from "@/lib/excalidraw-format";
type Context = { params: Promise<{ id: string }> };
export const GET = handler(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const a = (await db.select().from(attachments).where(eq(attachments.id, id)))[0];
  if (!a) return bad("Attachment not found", 404);
  const inline =
    a.mime.startsWith("image/") ||
    (a.mime === "application/pdf" && new URL(request.url).searchParams.get("preview") === "1");
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
});
export const DELETE = handler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  await db.delete(attachments).where(eq(attachments.id, id));
  return ok({ deleted: true });
});

/** Replace an editable drawing in place so its attachment link remains stable. */
export const PUT = handler(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const existing = (await db.select().from(attachments).where(eq(attachments.id, id)))[0];
  if (!existing) return bad("Attachment not found", 404);
  requireValue(existing.mime === EXCALIDRAW_MIME, "Only Excalidraw drawings can be edited.");
  requireValue(
    Number(request.headers.get("content-length") ?? 0) <= MAX_ATTACHMENT_SIZE + 10000,
    "Files must be 8 MB or smaller.",
  );
  const form = await request.formData();
  const file = form.get("file");
  requireValue(
    file instanceof File && file.size > 0 && file.size <= MAX_ATTACHMENT_SIZE,
    "Choose a drawing up to 8 MB.",
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  requireValue(attachmentMime(bytes) === EXCALIDRAW_MIME, "Invalid Excalidraw drawing.");
  await db
    .update(attachments)
    .set({ data: bytes, size: bytes.length, name: file.name.slice(0, 200) })
    .where(eq(attachments.id, id));
  return ok({ updated: true });
});
