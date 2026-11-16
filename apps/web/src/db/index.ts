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
  let ready: Promise<void> | undefined;
  const initialize = () => {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL must point to a PostgreSQL database.");
    return (ready ??= initializeDatabase(pool).catch((error) => {
      ready = undefined;
      throw error;
    }));
  };
  // Defer connections until the first query so Next.js builds need no live database.
  const query = pool.query.bind(pool);
  pool.query = ((...args: Parameters<typeof query>) =>
    initialize().then(() => query(...args))) as typeof pool.query;
  const database = drizzle(pool, { schema });
  type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
  const context = new AsyncLocalStorage<Transaction>();
  return new Proxy(database, {
    get(target, property) {
      if (property === "transaction") {
        return async <T>(callback: (tx: Transaction) => Promise<T>) => {
          await initialize();
          const parent = context.getStore();
          return (parent ?? target).transaction(async (tx) => {
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
