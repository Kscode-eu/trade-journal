import { afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// Each test file gets its own schema. Never bootstrap or delete a user's journal.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://journal:journal@localhost:5432/journal_test";
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: process.env.DATABASE_URL, options: "", max: 1 });
await admin.query(`CREATE SCHEMA "${schema}"`);
process.env.PGOPTIONS = `-c search_path=${schema}`;
export const testPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
afterAll(async () => {
  const globalDb = globalThis as unknown as { __journalDb?: { $client: Pool } };
  if (globalDb.__journalDb) await globalDb.__journalDb.$client.end();
  delete globalDb.__journalDb;
  await testPool.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
});
