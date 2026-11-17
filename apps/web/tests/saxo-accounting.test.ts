import { expect, it } from "vitest";
import { normalizeSaxo, saxoFee, type SaxoReports } from "../src/server/saxo-normalize";
import { buildRoundTrips, type Execution } from "@luxalgo/journal-core";
import { accounts, db, trades, executions } from "../src/db";
import { eq } from "drizzle-orm";
import { saveSaxoPositions } from "../src/server/saxo";
const reports = (): SaxoReports => ({
  trades: [],
  transactions: [],
  closed: [],
  positions: [],
  balances: { Currency: "EUR", TotalValue: 10000, CashBalance: 9000 },
});
const closed = (extra = {}) => ({
  AccountCurrency: "EUR",
  InstrumentCurrency: "USD",
  AssetType: "ContractFutures",
  InstrumentSymbol: "MESZ6",
  OpenPositionId: "1",
  ClosePositionId: "2",
  Amount: 1,
  AmountOpen: 1,
  AmountClose: -1,
  OpenPrice: 6000,
  ClosePrice: 6010,
  PnLAccountCurrency: 39,
  TradeDateOpen: "2026-10-01",
  TradeDateClose: "2026-10-02",
  ...extra,
});
const tx = (id: string, fee: number, quantity: number, price: number) => ({
  Currency: "EUR",
  TransactionType: "Trade",
  TradeId: id,
  FrontOfficeTradeId: `front-${id}`,
  Bookings: [{ AmountType: "Commission", CostClass: "TransactionCosts", BookedAmount: -fee }],
  Trades: [
    {
      TradeId: id,
      PositionId: `front-${id}`,
      TradedQuantity: quantity,
      Price: price,
      TradedValue: -price * quantity * 5,
      TradeExecutionTime: `2026-10-0${id}T12:00:00Z`,
    },
  ],
});
function trips(n: ReturnType<typeof normalizeSaxo>) {
  return buildRoundTrips(
    n.fills.map((f, i) => ({
      ...f,
      id: String(i),
      accountId: "test",
      source: "sync",
    })) as Execution[],
  );
}
it("uses broker net P&L in account currency and includes opening and closing costs once", () => {
  const r = reports();
  r.closed = [closed()];
  r.transactions = [tx("1", 3, 1, 6000), tx("2", 2, -1, 6010)];
  const n = normalizeSaxo(r, "EUR");
  const t = trips(n)[0]!;
  expect(t.netPnl).toBe(39);
  expect(t.grossPnl).toBe(44);
  expect(t.fees).toBe(5);
  expect(t.assetClass).toBe("futures");
  expect(n.fills[0]!.importMetadata!.saxo!.contractMultiplier).toBe(5);
});
it("allocates fees on partial closes and retains the remaining open quantity", () => {
  const r = reports();
  r.closed = [closed({ Amount: 1 })];
  r.transactions = [tx("1", 6, 2, 6000), tx("2", 2, -1, 6010)];
  r.positions = [
    {
      PositionId: "front-1",
      PositionBase: {
        Amount: 1,
        AssetType: "ContractFutures",
        OpenPrice: 6000,
        ExecutionTimeOpen: "2026-10-01T12:00:00Z",
      },
      DisplayAndFormat: { Symbol: "MESZ6", Currency: "USD" },
      PositionView: { ProfitLossOnTradeInBaseCurrency: 20 },
    },
  ];
  const n = normalizeSaxo(r, "EUR");
  const t = trips(n)[0]!;
  expect(t.openQuantity).toBe(1);
  expect(t.grossPnl).toBe(44);
  expect(t.netPnl).toBe(36);
  expect(n.realizedPnl).toBe(39);
  expect(n.unrealizedPnl).toBe(20);
});
it("separates option strikes and long/short positions", () => {
  const r = reports();
  r.positions = [225, 230].map((strike, i) => ({
    PositionId: String(strike),
    PositionBase: {
      Amount: i ? -1 : 1,
      AssetType: "StockOption",
      OpenPrice: 4 + i,
      ExecutionTimeOpen: "2026-10-01T12:00:00Z",
    },
    DisplayAndFormat: { Symbol: `TEST/20X26P${strike}:xcbf`, Currency: "USD" },
    PositionView: { ProfitLossOnTradeInBaseCurrency: 10 },
  }));
  const n = normalizeSaxo(r, "EUR");
  expect(trips(n)).toHaveLength(2);
  expect(trips(n).map((t) => t.direction)).toEqual(["long", "short"]);
  expect(trips(n).every((t) => t.assetClass === "option")).toBe(true);
});
it("retains dividends and transfers outside trading P&L and applies rebates", () => {
  const r = reports();
  r.transactions = [
    { TransactionType: "CashTransfer", Currency: "EUR", BookedAmount: 500, BookingId: "deposit" },
    {
      TransactionType: "CorporateAction",
      Currency: "EUR",
      BookedAmount: 12,
      BookingId: "dividend",
    },
  ];
  const n = normalizeSaxo(r, "EUR");
  expect(n.ledger).toHaveLength(2);
  expect(n.fills).toHaveLength(0);
  expect(n.realizedPnl).toBe(0);
  expect(
    saxoFee({
      Bookings: [
        { AmountType: "Commission", CostClass: "TransactionCosts", BookedAmount: -3 },
        { AmountType: "Client Commission Credit", CostClass: "NotAssigned", BookedAmount: 3 },
        {
          AmountType: "Belgium Stock Exchange 0.12%",
          CostClass: "TransactionCosts",
          BookedAmount: -1,
        },
      ],
    }),
  ).toBe(1);
});
it("blocks malformed accounting data and mismatched currency", () => {
  const r = reports();
  r.closed = [closed({ PnLAccountCurrency: undefined })];
  expect(() => normalizeSaxo(r, "EUR")).toThrow("P&L");
  expect(() => normalizeSaxo(reports(), "USD")).toThrow("currency");
});
it("repeated sync updates fees without duplicating positions or losing notes", async () => {
  await db
    .insert(accounts)
    .values({
      id: "saxo-test",
      name: "Saxo",
      kind: "sync",
      broker: "saxo",
      currency: "EUR",
      createdAt: new Date().toISOString(),
    });
  const r = reports();
  r.closed = [closed()];
  r.transactions = [tx("1", 3, 1, 6000), tx("2", 2, -1, 6010)];
  await saveSaxoPositions("saxo-test", normalizeSaxo(r, "EUR").fills);
  const first = (await db.select().from(trades).where(eq(trades.accountId, "saxo-test")))[0]!;
  await db.update(trades).set({ notes: "Keep my journal notes" }).where(eq(trades.key, first.key));
  r.transactions[1] = tx("2", 4, -1, 6010);
  r.closed[0]!.PnLAccountCurrency = 37;
  const result = await saveSaxoPositions("saxo-test", normalizeSaxo(r, "EUR").fills);
  expect(result.inserted).toBe(0);
  const saved = await db.select().from(trades).where(eq(trades.accountId, "saxo-test"));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ netPnl: 37, fees: 7, notes: "Keep my journal notes" });
  expect(
    await db.select().from(executions).where(eq(executions.accountId, "saxo-test")),
  ).toHaveLength(2);
});
