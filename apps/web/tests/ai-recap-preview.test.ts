import { beforeEach, expect, it, vi } from "vitest";
import type { AnnotatedTrade } from "@luxalgo/journal-core";
const state = vi.hoisted(() => ({ run: vi.fn(), trades: [] as AnnotatedTrade[] }));
vi.mock("@/server/ai", () => ({ runAi: state.run }));
vi.mock("@/server/auth", () => ({ passwordConfigured: () => false }));
vi.mock("@/server/settings", () => ({ getAiProvider: () => "openai", getAiModel: () => "test" }));
vi.mock("@/server/trades-query", () => ({ queryTrades: () => ({ trades: state.trades }) }));
vi.mock("@/server/ai-scope", () => ({
  readAiRequest: () => ({
    date: "2026-11-20",
    filters: { accounts: "a" },
    timeZone: "UTC",
    accounts: [{ id: "a", name: "Account A" }],
    context: "Account A only",
    scope: { label: "Account A", timeZone: "UTC" },
  }),
  accountContext: () => "Amounts USD",
}));
vi.mock("@/db", () => ({ db: {}, journalDays: {} }));
const { POST } = await import("../src/app/api/ai/recap/route");
const request = (body: unknown) =>
  POST(
    new Request("http://localhost/api/ai/recap", { method: "POST", body: JSON.stringify(body) }),
  );
beforeEach(() => {
  state.run.mockReset().mockResolvedValue("Recap");
  state.trades = [
    {
      key: "a",
      accountId: "a",
      symbol: "AAPL",
      direction: "long",
      openedAt: "2026-11-20T09:00:00Z",
      closedAt: "2026-11-20T10:00:00Z",
      status: "win",
      quantity: 1,
      openQuantity: 0,
      avgEntry: 100,
      avgExit: 110,
      grossPnl: 10,
      netPnl: 10,
      fees: 0,
      executionCount: 2,
      executionIds: [],
      exits: [],
    },
  ];
});
it("shows exact recap inputs without an AI call and returns the used input after generation", async () => {
  const input = await (await request({ preview: true })).json();
  expect(input.prompt).toContain("net P&L 10.00");
  expect(input.sources.map((s: { id: string }) => s.id)).not.toContain("journal");
  expect(state.run).not.toHaveBeenCalled();
  const result = await (await request({ fingerprint: input.fingerprint })).json();
  expect(state.run).toHaveBeenCalledWith(input.prompt);
  expect(result.input).toEqual(input);
});
it("rejects a stale recap preview without calling the provider", async () => {
  const input = await (await request({ preview: true })).json();
  state.trades[0]!.netPnl = 20;
  const result = await request({ fingerprint: input.fingerprint });
  expect(result.status).toBe(400);
  expect(state.run).not.toHaveBeenCalled();
});
