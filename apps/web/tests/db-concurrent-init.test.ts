import { expect, it } from "vitest";
import { Pool } from "pg";
import { testPool } from "./setup-db";
import { initializeDatabase } from "../src/db/bootstrap";

it("bootstraps concurrently and preserves records on repeated initialization", async () => {
  const pools = Array.from(
    { length: 6 },
    () => new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
  );
  try {
    await Promise.all(pools.map((pool) => initializeDatabase(pool)));
    expect((await testPool.query("SELECT count(*)::int AS n FROM folders")).rows[0]).toEqual({
      n: 5,
    });
    await testPool.query(
      "INSERT INTO accounts (id, name, kind, created_at) VALUES ('kept', 'Kept', 'manual', '2026-01-01')",
    );
    await Promise.all(pools.map((pool) => initializeDatabase(pool)));
    expect((await testPool.query("SELECT name FROM accounts WHERE id = 'kept'")).rows[0].name).toBe(
      "Kept",
    );
    expect((await testPool.query("SELECT count(*)::int AS n FROM folders")).rows[0].n).toBe(5);
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
  }
});
