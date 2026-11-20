import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, settings, accounts, journalDays } from "../src/db";
import { journalSchema, withJournalUser } from "../src/server/tenant";
import { testPool } from "./setup-db";
import { randomUUID } from "node:crypto";

const users = [randomUUID(), randomUUID()];
const schemas: string[] = [];
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  for (const schema of schemas) await testPool.query(`DROP SCHEMA "${schema}" CASCADE`);
});
const enable = () => {
  vi.stubEnv("JOURNAL_AUTH", "auth0");
  vi.stubEnv("AUTH0_DOMAIN", "test.example.com");
};

describe("private user journals", () => {
  it("fails closed without a verified identity and explicitly assigns legacy data", () => {
    enable();
    expect(() => journalSchema()).toThrow("Authenticated journal context required");
    vi.stubEnv("JOURNAL_LEGACY_OWNER_SUB", users[0]!);
    expect(withJournalUser(users[0]!, journalSchema)).toBe("public");
    expect(withJournalUser(users[1]!, journalSchema)).toMatch(/^user_[a-f0-9]{56}$/);
  });

  it("isolates concurrent users, fixed keys, guessed IDs and nested transactions", async () => {
    enable();
    schemas.push(...users.map((user) => withJournalUser(user, journalSchema)!));
    await Promise.all(
      users.map((user) =>
        withJournalUser(user, async () => {
          await db.insert(settings).values({ key: "private", value: user });
          await db.insert(journalDays).values({ date: "2026-11-20", note: user, updatedAt: "now" });
          await db.transaction(async () => {
            await db
              .insert(accounts)
              .values({ id: user, name: user, kind: "manual", createdAt: "now" });
            await db.transaction(async () => {
              expect((await db.select().from(settings))[0]?.value).toBe(user);
            });
          });
        }),
      ),
    );
    for (let i = 0; i < 12; i++) {
      await Promise.all(
        users.map((user, index) =>
          withJournalUser(user, async () => {
            expect((await db.select().from(settings))[0]?.value).toBe(user);
            expect((await db.select().from(journalDays))[0]?.note).toBe(user);
            const other = users[1 - index]!;
            expect(await db.select().from(accounts).where(eq(accounts.id, other))).toEqual([]);
            expect(await db.delete(accounts).where(eq(accounts.id, other)).returning()).toEqual([]);
          }),
        ),
      );
    }
    await withJournalUser(users[0]!, async () => {
      await expect(
        db.transaction(async () => {
          await db.update(settings).set({ value: "rolled back" });
          throw new Error("abort");
        }),
      ).rejects.toThrow("abort");
      expect((await db.select().from(settings))[0]?.value).toBe(users[0]);
    });
    await expect(db.select().from(settings)).rejects.toMatchObject({
      cause: { message: "Authenticated journal context required" },
    });
  });
});
