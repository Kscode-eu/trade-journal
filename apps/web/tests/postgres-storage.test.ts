import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, accounts, attachments, marketCsvDatasets, propAccounts, settings } from "../src/db";
import { setSetting } from "../src/server/settings";

it("round-trips binary attachments, booleans, millisecond timestamps and financial precision", async () => {
  const binary = Buffer.from([0, 255, 128, 1, 0]);
  await db.insert(attachments).values({
    id: "binary",
    ownerType: "note",
    ownerId: "note",
    name: "file.bin",
    mime: "application/octet-stream",
    size: binary.length,
    data: binary,
    createdAt: "2026-01-01",
  });
  expect((await db.select().from(attachments))[0]?.data).toEqual(binary);
  await db.insert(accounts).values({
    id: "precision",
    name: "Precision",
    kind: "manual",
    autoSync: true,
    initialBalance: 123456789.123456,
    createdAt: "2026-01-01",
  });
  expect((await db.select().from(accounts))[0]).toMatchObject({
    autoSync: true,
    initialBalance: 123456789.123456,
  });
  await db.insert(propAccounts).values({
    id: "large",
    firm: "Test",
    name: "Large",
    program: "evaluation",
    status: "active",
    currency: "USD",
    sizeMinor: 5000000000,
    openedOn: "2026-01-01",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  expect((await db.select().from(propAccounts))[0]?.sizeMinor).toBe(5000000000);
  await db.insert(marketCsvDatasets).values({
    id: "ms",
    name: "Candles",
    symbol: "TEST",
    resolution: "1m",
    currency: "USD",
    priceBasis: "raw",
    barsJson: "[]",
    barCount: 1,
    firstTime: 1735689600000,
    lastTime: 1735689660000,
    importedAt: "2026-01-01",
  });
  expect((await db.select().from(marketCsvDatasets))[0]?.firstTime).toBe(1735689600000);
});

it("keeps helpers in the parent transaction and isolates nested rollback with a savepoint", async () => {
  await db.transaction(async () => {
    await setSetting("outer", "kept");
    await expect(
      db.transaction(async () => {
        await setSetting("inner", "discarded");
        throw new Error("rollback nested");
      }),
    ).rejects.toThrow("rollback nested");
    expect(await db.select().from(settings).where(eq(settings.key, "inner"))).toEqual([]);
    await setSetting("after", "kept");
  });
  expect((await db.select().from(settings)).map((row) => row.key).sort()).toEqual([
    "after",
    "outer",
  ]);
  await expect(
    db.transaction(async () => {
      await setSetting("outer", "changed");
      await db.transaction(async () => {
        await setSetting("nested", "discarded");
      });
      throw new Error("rollback outer");
    }),
  ).rejects.toThrow("rollback outer");
  expect((await db.select().from(settings).where(eq(settings.key, "outer")))[0]?.value).toBe(
    "kept",
  );
  expect(await db.select().from(settings).where(eq(settings.key, "nested"))).toEqual([]);
});
