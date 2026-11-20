import { journalSchema } from "@/server/tenant";
import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { initializeDatabase } from "./bootstrap";

/** Local files hold the encryption key and caches; journal records live in PostgreSQL. */
export const dataDir = (): string => process.env.JOURNAL_DATA_DIR ?? join(process.cwd(), "data");

function createDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => console.error("PostgreSQL pool error", error));
  const ready = new Map<string, Promise<void>>();
  const initialize = (tenantSchema: string | undefined) => {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL must point to a PostgreSQL database.");
    const key = tenantSchema ?? "local";
    let promise = ready.get(key);
    if (!promise) {
      promise = initializeDatabase(pool, tenantSchema).catch((error) => {
        ready.delete(key);
        throw error;
      });
      ready.set(key, promise);
    }
    return promise;
  };
  // Every standalone query gets a transaction-local search path. Never leave a
  // tenant selection on a pooled connection or include public as a fallback.
  const query = pool.query.bind(pool);
  pool.query = (async (...args: Parameters<typeof query>) => {
    const tenantSchema = journalSchema();
    await initialize(tenantSchema);
    if (!tenantSchema) return query(...args);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('search_path', $1, true)", [tenantSchema]);
      const result = await client.query(...args);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }) as typeof pool.query;
  const database = drizzle(pool, { schema });
  type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
  const context = new AsyncLocalStorage<Transaction>();
  return new Proxy(database, {
    get(target, property) {
      if (property === "transaction") {
        return async <T>(callback: (tx: Transaction) => Promise<T>) => {
          const tenantSchema = journalSchema();
          await initialize(tenantSchema);
          const parent = context.getStore();
          return (parent ?? target).transaction(async (tx) => {
            if (!parent && tenantSchema)
              await tx.execute(sql`SELECT set_config('search_path', ${tenantSchema}, true)`);
            // Serialize compound mutations, as the previous immediate transactions did.
            if (!parent) await tx.execute(sql`SELECT pg_advisory_xact_lock(734821907)`);
            return context.run(tx, () => callback(tx));
          });
        };
      }
      const current = context.getStore() ?? target;
      const value = Reflect.get(current, property);
      return typeof value === "function" ? value.bind(current) : value;
    },
  });
}

const globalForDb = globalThis as unknown as { __journalDb?: ReturnType<typeof createDb> };
/** Singleton across Next dev hot reloads; helpers join the current transaction. */
export const db = globalForDb.__journalDb ?? (globalForDb.__journalDb = createDb());
export * from "./schema";
