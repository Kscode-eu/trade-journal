export async function register() {
  // Keep Node-only dependencies inside the runtime branch so Next can exclude
  // the entire import from its Edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { startSaxoScheduler } = await import("./server/saxo-scheduler");
    startSaxoScheduler();
  }
}
