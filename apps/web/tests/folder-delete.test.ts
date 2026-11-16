import { afterAll, expect, it, vi } from "vitest";
import { testPool } from "./setup-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const previous = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-folder-delete-"));
process.env.JOURNAL_DATA_DIR = scratch;
vi.stubEnv("JOURNAL_PASSWORD", "");
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
// Exercise the additive upgrade from the existing folder schema.
const legacy = testPool;
await legacy.query(`CREATE TABLE folders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL
)`);

const { db, folders, notes } = await import("../src/db");
const { BOOTSTRAP_SQL } = await import("../src/db/bootstrap");
const { DELETE } = await import("../src/app/api/folders/[id]/route");
const { GET, POST } = await import("../src/app/api/notes/route");
const { PATCH } = await import("../src/app/api/notes/[id]/route");

const removeFolder = (id: string) =>
  DELETE(new Request(`http://localhost/api/folders/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
const createFolder = async (id: string) =>
  await db.insert(folders).values({ id, name: id, kind: "user", createdAt: "2026-01-01" });

it.each(["custom", "trade-notes", "daily-journal", "session-recaps"])(
  "removes %s while preserving all note fields and keeps it removed after bootstrap",
  async (id) => {
    if (id === "custom") await createFolder(id);
    const note = {
      id: `note-${id}`,
      folderId: id,
      title: "Keep this note",
      content: "Full content",
      tagsJson: '["review"]',
      tradeKey: "linked-trade",
      dayDate: "2026-10-05",
      createdAt: "2026-10-01",
      updatedAt: "2026-10-02",
    };
    await db.insert(notes).values(note);
    expect((await removeFolder(id)).status).toBe(200);
    expect((await db.select().from(notes).where(eq(notes.id, note.id)))[0]).toEqual({
      ...note,
      folderId: "my-notes",
    });
    await db.$client.query(BOOTSTRAP_SQL);
    const listed = await (await GET(new Request("http://localhost/api/notes"))).json();
    expect(listed.folders.some((folder: { id: string }) => folder.id === id)).toBe(false);
    expect((await removeFolder(id)).status).toBe(404);
  },
);

it.each(["all", "my-notes"])("keeps the essential %s view", async (id) => {
  expect((await removeFolder(id)).status).toBe(400);
  expect((await db.select().from(folders).where(eq(folders.id, id)))[0]?.deletedAt).toBeNull();
});

it("returns not found for a missing folder", async () => {
  expect((await removeFolder("missing")).status).toBe(404);
});

it("rolls back moving notes if folder removal fails", async () => {
  await createFolder("rollback");
  await db.insert(notes).values({
    id: "rollback-note",
    folderId: "rollback",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  await db.$client.query(
    `CREATE FUNCTION fail_folder_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Failed to remove folder'; END $$; CREATE TRIGGER fail_folder_delete BEFORE UPDATE ON folders FOR EACH ROW WHEN (NEW.id = 'rollback') EXECUTE FUNCTION fail_folder_delete()`,
  );
  try {
    expect((await removeFolder("rollback")).status).toBe(500);
    expect((await db.select().from(notes).where(eq(notes.id, "rollback-note")))[0]?.folderId).toBe(
      "rollback",
    );
    expect(
      (await db.select().from(folders).where(eq(folders.id, "rollback")))[0]?.deletedAt,
    ).toBeNull();
  } finally {
    await db.$client.query(
      "DROP TRIGGER fail_folder_delete ON folders; DROP FUNCTION fail_folder_delete()",
    );
  }
});

it("rejects creating or moving notes into a removed folder", async () => {
  const response = await POST(
    new Request("http://localhost/api/notes", {
      method: "POST",
      body: JSON.stringify({ folderId: "trade-notes", title: "New note" }),
    }),
  );
  expect(response.status).toBe(404);
  const updated = await PATCH(
    new Request("http://localhost/api/notes/note-custom", {
      method: "PATCH",
      body: JSON.stringify({ folderId: "trade-notes" }),
    }),
    { params: Promise.resolve({ id: "note-custom" }) },
  );
  expect(updated.status).toBe(404);
  expect((await db.select().from(notes).where(eq(notes.id, "note-custom")))[0]?.folderId).toBe(
    "my-notes",
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
  if (previous === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = previous;
  rmSync(scratch, { recursive: true, force: true });
});
