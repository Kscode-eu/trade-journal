import { afterEach, expect, it, vi } from "vitest";
import { saxoExecution, saxoGet, saxoPages } from "../src/server/saxo";
import { executionHash } from "../src/server/ids";
const trade = {
  AssetType: "Stock",
  TradeId: "1",
  InstrumentSymbol: "AAPL:xnas",
  TradeExecutionTime: "2026-01-02T12:00:00Z",
  Amount: 2,
  Price: 100,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("preserves side, quantity and distinct execution IDs", () => {
  expect(saxoExecution({ ...trade, Amount: -2 })).toMatchObject({
    side: "sell",
    quantity: 2,
    fee: 0,
  });
  expect(executionHash(saxoExecution(trade))).not.toBe(
    executionHash(saxoExecution({ ...trade, TradeId: "2" })),
  );
  expect(executionHash(saxoExecution(trade))).toBe(executionHash(saxoExecution(trade)));
});
it("maps additional asset classes and rejects missing execution timestamps", () => {
  expect(saxoExecution({ ...trade, AssetType: "ContractFutures" }).assetClass).toBe("futures");
  expect(saxoExecution({ ...trade, AssetType: "StockOption" }).assetClass).toBe("option");
  expect(saxoExecution({ ...trade, AssetType: "Etc" }).assetClass).toBe("equity");
  expect(() => saxoExecution({ ...trade, TradeExecutionTime: "2026-01-02" })).toThrow();
  expect(() => saxoExecution({ ...trade, Amount: NaN })).toThrow();
});
it("never sends tokens to an external pagination host", async () => {
  vi.stubEnv("SAXO_APP_KEY", "key");
  vi.stubEnv("SAXO_APP_SECRET", "secret");
  vi.stubEnv("SAXO_REDIRECT_URI", "http://localhost/api/saxo/callback");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(saxoGet("https://example.com/", "private")).rejects.toThrow("pagination");
  expect(fetch).not.toHaveBeenCalled();
});
it("follows pages and rejects pagination cycles", async () => {
  vi.stubEnv("SAXO_APP_KEY", "key");
  vi.stubEnv("SAXO_APP_SECRET", "secret");
  vi.stubEnv("SAXO_REDIRECT_URI", "http://localhost/api/saxo/callback");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Data: [trade], __next: "port/v1/accounts/me" }),
    }),
  );
  await expect(saxoPages("port/v1/accounts/me", "token")).rejects.toThrow(
    "pagination did not finish",
  );
});
