import { eq } from "drizzle-orm";
import { accounts, db } from "@/db";
import { syncSaxo } from "./saxo";
const state = globalThis as typeof globalThis & { saxoTimer?: ReturnType<typeof setInterval> };
export function startSaxoScheduler() {
  if (state.saxoTimer) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const rows = await db.select().from(accounts).where(eq(accounts.broker, "saxo"));
      for (const account of rows) {
        if (!account.autoSync || account.archivedAt || !account.credentialsEnc) continue;
        try {
          await syncSaxo(account.id);
        } catch {
          console.warn(
            `Saxo sync failed for ${account.id}; use manual Sync to see the error or reconnect.`,
          );
        }
      }
    } catch {
      console.warn("Saxo scheduler could not read accounts.");
    } finally {
      busy = false;
    }
  };
  state.saxoTimer = setInterval(() => void tick(), 5 * 60 * 1000);
  state.saxoTimer.unref();
  void tick();
}
