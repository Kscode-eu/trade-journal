import { afterAll, expect, it, vi } from "vitest";
import { testPool } from "./setup-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOOTSTRAP_SQL } from "../src/db/bootstrap";

const scratch = mkdtempSync(join(tmpdir(), "journal-ibkr-upgrade-"));
vi.stubEnv("JOURNAL_DATA_DIR", scratch);
const legacy = testPool;
await legacy.query(BOOTSTRAP_SQL.replace("  ibkr_sync_time_zone TEXT,\n", ""));
await legacy.query(
  "INSERT INTO accounts (id, name, kind, broker, created_at) VALUES ('old', 'Original history', 'sync', 'ibkr-flex', '2026-01-01')",
);
const before = (await legacy.query("SELECT * FROM accounts")).rows[0];
const { db, accounts } = await import("../src/db");

it("adds nullable provenance to existing accounts without claiming their old timezone", async () => {
  await db.select().from(accounts);
  const { ibkr_sync_time_zone, ...after } = (await db.$client.query("SELECT * FROM accounts"))
    .rows[0];
  expect(ibkr_sync_time_zone).toBeNull();
  expect(after).toEqual(before);
  expect((await db.select().from(accounts))[0]?.ibkrSyncTimeZone).toBeNull();
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});
