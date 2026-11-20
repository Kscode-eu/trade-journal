import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, notes, attachments, playbooks, trades, accounts } from "../src/db";
import { POST as create } from "../src/app/api/playbooks/route";
import { PATCH as edit, DELETE as remove } from "../src/app/api/playbooks/[id]/route";
import { GET as linked } from "../src/app/api/playbooks/[id]/trades/route";
import { PATCH as annotate } from "../src/app/api/trades/[key]/route";
import { POST as upload } from "../src/app/api/attachments/route";
import { GET as download, PUT as updateDrawing } from "../src/app/api/attachments/[id]/route";
import { attachmentMime } from "../src/lib/attachment-validation";
import { EXCALIDRAW_MIME } from "../src/lib/excalidraw-format";

const scene = { type: "excalidraw", version: 2, elements: [], appState: {}, files: {} };
const request = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/playbooks", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const fileRequest = (ownerId: string, value = scene, method = "POST") => {
  const form = new FormData();
  form.append("type", "playbook");
  form.append("id", ownerId);
  form.append(
    "file",
    new File([JSON.stringify(value)], "Setup.excalidraw", { type: EXCALIDRAW_MIME }),
  );
  return new Request("http://localhost/api/attachments", { method, body: form });
};
beforeEach(async () => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  await db.delete(attachments);
  await db.delete(playbooks);
  await db.delete(notes);
  await db.delete(trades);
  await db.delete(accounts);
});
afterAll(() => vi.unstubAllEnvs());

it("copies current notebook content and attachments without altering the source", async () => {
  await db.insert(notes).values({
    id: "note",
    folderId: "my-notes",
    title: "Old title",
    content: "Old draft",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  const bytes = Buffer.from(JSON.stringify(scene));
  await db.insert(attachments).values({
    id: "original",
    ownerType: "note",
    ownerId: "note",
    name: "Setup.excalidraw",
    mime: EXCALIDRAW_MIME,
    size: bytes.length,
    data: bytes,
    createdAt: "2026-01-01",
  });
  const response = await create(
    request({
      sourceNoteId: "note",
      name: "Breakout",
      description: "## Latest unsaved draft\nEntry rules",
    }),
  );
  expect(response.status).toBe(200);
  const { id } = await response.json();
  const book = (await db.select().from(playbooks).where(eq(playbooks.id, id)))[0]!;
  expect(book.description).toContain("Latest unsaved draft");
  expect(await db.select().from(notes)).toHaveLength(1);
  const copies = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.ownerType, "playbook"), eq(attachments.ownerId, id)));
  expect(copies).toHaveLength(1);
  expect(copies[0]!.id).not.toBe("original");
  expect(copies[0]!.data).toEqual(bytes);
  expect(
    (
      await edit(
        request(
          { name: "Updated", description: "## Plan", rules: ["Wait for confirmation"] },
          "PATCH",
        ),
        params(id),
      )
    ).status,
  ).toBe(200);
  expect((await db.select().from(playbooks))[0]).toMatchObject({
    name: "Updated",
    description: "## Plan",
    rulesJson: '["Wait for confirmation"]',
  });
  expect((await edit(request({ name: "  " }, "PATCH"), params(id))).status).toBe(400);
});

it("creates and edits drawings in place and rejects arbitrary JSON", async () => {
  const { id } = await (await create(request({ name: "Setup" }))).json();
  const response = await upload(fileRequest(id));
  expect(response.status).toBe(200);
  const attachment = await response.json();
  const updated = { ...scene, appState: { viewBackgroundColor: "#ffffff" } };
  expect((await updateDrawing(fileRequest(id, updated, "PUT"), params(attachment.id))).status).toBe(
    200,
  );
  const result = await download(new Request("http://localhost"), params(attachment.id));
  expect(await result.json()).toEqual(updated);
  expect(await db.select().from(attachments)).toHaveLength(1);
  expect(attachmentMime(new TextEncoder().encode('{"hello":"world"}'))).toBeNull();
  expect(
    attachmentMime(new TextEncoder().encode(JSON.stringify({ ...scene, elements: [null] }))),
  ).toBeNull();
  expect((await upload(fileRequest("missing"))).status).toBe(400);
});

it("links trades afterwards and removes links and drawing data when deleting a playbook", async () => {
  const { id } = await (await create(request({ name: "Setup" }))).json();
  await db
    .insert(accounts)
    .values({ id: "account", name: "Main", kind: "manual", createdAt: "2026-01-01" });
  await db.insert(trades).values({
    key: "trade",
    accountId: "account",
    symbol: "ES",
    direction: "long",
    status: "open",
    openedAt: "2026-01-01T10:00:00Z",
    quantity: 1,
    openQuantity: 1,
    avgEntry: 100,
    grossPnl: 0,
    netPnl: 0,
    fees: 0,
    executionCount: 1,
    executionIdsJson: "[]",
    exitsJson: "[]",
  });
  expect(
    (
      await annotate(request({ playbookId: id }, "PATCH"), {
        params: Promise.resolve({ key: "trade" }),
      })
    ).status,
  ).toBe(200);
  expect(
    (await (await linked(new Request("http://localhost"), params(id))).json()).trades,
  ).toHaveLength(1);
  await upload(fileRequest(id));
  expect(
    (await remove(new Request("http://localhost", { method: "DELETE" }), params(id))).status,
  ).toBe(200);
  expect((await db.select().from(trades))[0]!.playbookId).toBeNull();
  expect(await db.select().from(attachments)).toHaveLength(0);
});

it("serves PDFs inline for popup previews and keeps downloads available", async () => {
  const bytes = Buffer.from("%PDF-1.7");
  await db
    .insert(attachments)
    .values({
      id: "pdf-preview",
      ownerType: "note",
      ownerId: "note",
      name: "Review.pdf",
      mime: "application/pdf",
      size: bytes.length,
      data: bytes,
      createdAt: "2026-01-01",
    });
  const preview = await download(
    new Request("http://localhost/api/attachments/pdf-preview?preview=1"),
    params("pdf-preview"),
  );
  expect(preview.headers.get("Content-Disposition")).toMatch(/^inline;/);
  expect(preview.headers.get("Content-Type")).toBe("application/pdf");
  const file = await download(
    new Request("http://localhost/api/attachments/pdf-preview"),
    params("pdf-preview"),
  );
  expect(file.headers.get("Content-Disposition")).toMatch(/^attachment;/);
});
