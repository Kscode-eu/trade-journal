import { afterAll, expect, it, vi } from "vitest";

const previousToken = process.env.MT5_INGEST_TOKEN;
process.env.MT5_INGEST_TOKEN = "test-token-that-is-at-least-32-characters";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { POST } = await import("../src/app/api/mt5/executions/route");
const { accounts, db, executions, trades } = await import("../src/db");

const payload = {
  account: { login: "12345678", server: "Broker-Demo", currency: "usd" },
  deals: [
    {
      ticket: "1001",
      positionId: "9001",
      order: 0,
      symbol: "eurusd",
      side: "buy",
      quantity: 1,
      price: 1.1,
      fee: 1,
      executedAt: "2026-01-02T10:00:00.123Z",
    },
    {
      ticket: "1002",
      positionId: "9001",
      order: 1,
      symbol: "eurusd",
      side: "sell",
      quantity: 1,
      price: 1.2,
      fee: 2,
      reportedGrossPnl: 50,
      executedAt: "2026-01-02T11:00:00.456Z",
    },
  ],
};

const request = (token: string) =>
  new Request("http://localhost/api/mt5/executions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

it("rejects an invalid MT5 bridge token", async () => {
  expect((await POST(request("wrong-token"))).status).toBe(401);
});

it("rejects oversized MT5 snapshots", async () => {
  const response = await POST(
    new Request("http://localhost/api/mt5/executions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MT5_INGEST_TOKEN}` },
      body: " ".repeat(1_000_001),
    }),
  );
  expect(response.status).toBe(413);
});

it("creates one MT5 account and deduplicates repeated deal snapshots", async () => {
  const first = await POST(request(process.env.MT5_INGEST_TOKEN!));
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ inserted: 2, duplicates: 0 });

  const second = await POST(request(process.env.MT5_INGEST_TOKEN!));
  expect(await second.json()).toMatchObject({ inserted: 0, duplicates: 2 });
  expect(await db.select().from(accounts)).toMatchObject([
    {
      name: "MT5 12345678 · Broker-Demo",
      broker: "MetaTrader 5",
      kind: "import",
      currency: "USD",
    },
  ]);
  expect(await db.select().from(executions)).toHaveLength(2);
  expect(await db.select().from(trades)).toMatchObject([
    { symbol: "EURUSD", grossPnl: 50, fees: 3, netPnl: 47 },
  ]);
});

afterAll(() => {
  vi.unstubAllEnvs();
  if (previousToken === undefined) delete process.env.MT5_INGEST_TOKEN;
  else process.env.MT5_INGEST_TOKEN = previousToken;
});
