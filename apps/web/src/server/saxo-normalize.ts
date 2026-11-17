import { createHash } from "node:crypto";
import type { AssetClass } from "@luxalgo/journal-core";
import type { ImportedExecution } from "@luxalgo/journal-importers";

// Saxo returns different report schemas. Validate every accounting field used
// below; retain original reports separately instead of treating missing values as zero.
export type SaxoRow = Record<string, any>;
export interface SaxoReports {
  trades: SaxoRow[];
  transactions: SaxoRow[];
  closed: SaxoRow[];
  positions: SaxoRow[];
  balances: SaxoRow;
}
export function saxoAssetClass(type: string): AssetClass {
  if (/Option/.test(type)) return "option";
  if (type === "ContractFutures" || type === "FuturesStrategy") return "futures";
  if (/^Cfd|^Srd/.test(type)) return "cfd";
  if (/^Fx/.test(type)) return "forex";
  if (["Stock", "Etf", "Etc", "Etn", "Fund", "MutualFund", "Rights"].includes(type))
    return "equity";
  return "other";
}
const number = (v: unknown, field: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error(`Saxo report is missing a valid ${field}. No accounting changes were saved.`);
  return v;
};
const required = (v: unknown, field: string): string => {
  if ((typeof v !== "string" && typeof v !== "number") || String(v).length === 0)
    throw new Error(`Saxo report is missing ${field}.`);
  return String(v);
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (v: unknown): string | undefined =>
  typeof v === "string" && /(Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : undefined;
const dateOnly = (v: unknown): string => {
  const date = String(v ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))
    throw new Error("Saxo report is missing a trade date.");
  return date + "T00:00:00.000Z";
};

/** Transaction costs are signed cash flows. Preserve commission credits/rebates. */
export function saxoFee(tx: SaxoRow | undefined): number | undefined {
  if (!tx || tx.IsIntradayData) return undefined;
  if (!Array.isArray(tx.Bookings))
    return typeof tx.TotalCost === "number" ? -tx.TotalCost : undefined;
  return -tx.Bookings.reduce((sum: number, b: SaxoRow) => {
    const cost =
      ["TransactionCosts", "OngoingCosts", "IncidentalCosts"].includes(b.CostClass) ||
      /commission|fee|tax/i.test(String(b.AmountType));
    // Conversion costs on principal are not classified as transaction costs.
    return (
      sum +
      (cost
        ? number(b.BookedAmount, "booking amount")
        : typeof b.ConversionCost === "number"
          ? b.ConversionCost
          : 0)
    );
  }, 0);
}

/**
 * Journal positions, not an invented reconstruction of missing fills. One group
 * per Saxo opening position keeps hedges and partial closes separate. Closed P&L
 * is Saxo's net amount in account currency, including FX and settlement effects.
 */
export function normalizeSaxo(reports: SaxoReports, currency: string) {
  if (reports.balances.Currency !== currency)
    throw new Error("Saxo balance currency does not match the journal account.");
  const warnings = new Set<string>();
  const transactions = new Map<string, SaxoRow>();
  const frontToBack = new Map<string, string>();
  for (const tx of reports.transactions) {
    if (tx.Currency && tx.Currency !== currency)
      throw new Error("Saxo transaction currency does not match the account.");
    if (tx.TransactionType !== "Trade" || tx.IsReversal) continue;
    for (const fill of tx.Trades ?? []) {
      const id = required(fill.TradeId ?? tx.TradeId, "trade ID");
      // A later settled record supersedes intraday information.
      if (!transactions.has(id) || !tx.IsIntradayData) transactions.set(id, { ...tx, fill });
      if (fill.PositionId) frontToBack.set(String(fill.PositionId), id);
    }
    if (tx.FrontOfficeTradeId && tx.TradeId)
      frontToBack.set(String(tx.FrontOfficeTradeId), String(tx.TradeId));
  }
  const tradeById = new Map(reports.trades.map((t) => [String(t.TradeId), t]));
  type Group = {
    id: string;
    symbol: string;
    asset: AssetClass;
    price: number;
    direction: "long" | "short";
    time: string;
    quantity: number;
    closes: SaxoRow[];
    openFee: number;
    priceCurrency?: string;
    multiplier?: number;
    liveFee?: number;
    conversionRate?: number;
  };
  const groups = new Map<string, Group>();
  const closeTotals = new Map<string, number>();
  for (const row of reports.closed) {
    const id = required(row.ClosePositionId, "closing position ID");
    closeTotals.set(
      id,
      (closeTotals.get(id) ?? 0) + Math.abs(number(row.Amount, "closed quantity")),
    );
  }
  const timeFor = (id: string, date: unknown, price: number, side: number): string => {
    const f = transactions.get(id)?.fill;
    const r = tradeById.get(id);
    const source =
      f && Math.abs(f.Price - price) < 1e-7 && Math.sign(f.TradedQuantity) === side
        ? f
        : r && Math.abs(r.Price - price) < 1e-7 && Math.sign(r.Amount) === side
          ? r
          : undefined;
    const time = iso(source?.TradeExecutionTime);
    if (time) return time;
    warnings.add(
      "Some position dates have day precision only; midnight UTC marks the report date, not a known execution time.",
    );
    return dateOnly(date);
  };
  for (const row of reports.closed) {
    if (row.AccountCurrency !== currency)
      throw new Error("Saxo closed-position currency does not match the account.");
    const openId = required(row.OpenPositionId, "opening position ID");
    const symbol = required(row.InstrumentSymbol, "instrument symbol");
    const amount = number(row.Amount, "closed quantity");
    if (!amount) throw new Error("Saxo returned a zero closed-position quantity.");
    const price = number(row.OpenPrice, "opening price");
    number(row.ClosePrice, "closing price");
    number(row.PnLAccountCurrency, "realized P&L");
    const direction = amount > 0 ? "long" : "short";
    const key = `${symbol}:${openId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        id: openId,
        symbol,
        asset: saxoAssetClass(row.AssetType),
        price,
        direction,
        time: timeFor(openId, row.TradeDateOpen, price, Math.sign(amount)),
        quantity: 0,
        closes: [],
        openFee: 0,
        priceCurrency: row.InstrumentCurrency,
      };
      groups.set(key, g);
    }
    if (g.direction !== direction || Math.abs(g.price - price) > 1e-7)
      throw new Error(`Saxo opening position ${openId} has inconsistent prices or direction.`);
    g.quantity += Math.abs(amount);
    g.closes.push(row);
  }
  const positions = reports.positions
    .filter((p) => p.PositionBase?.Status !== "Closed")
    .map((p) => {
      const b = p.PositionBase ?? {};
      const v = p.PositionView ?? {};
      const d = p.DisplayAndFormat ?? {};
      const id = required(p.PositionId, "live position ID");
      const openId = frontToBack.get(id) ?? id;
      const symbol = required(d.Symbol, "position symbol");
      const amount = number(b.Amount, "open quantity");
      const price = number(b.OpenPrice, "open price");
      if (!amount) throw new Error("Saxo returned a zero open-position quantity.");
      const key = `${symbol}:${openId}`;
      let g = groups.get(key);
      if (!g) {
        const time = iso(b.ExecutionTimeOpen);
        if (!time) throw new Error(`Saxo ${symbol} has no opening timestamp.`);
        g = {
          id: openId,
          symbol,
          asset: saxoAssetClass(b.AssetType),
          price,
          direction: amount > 0 ? "long" : "short",
          time,
          quantity: 0,
          closes: [],
          openFee: 0,
          priceCurrency: d.Currency,
        };
        groups.set(key, g);
      }
      if (g.direction !== (amount > 0 ? "long" : "short") || Math.abs(g.price - price) > 1e-7)
        throw new Error(`Saxo ${symbol} open and closed lots disagree.`);
      g.quantity += Math.abs(amount);
      if (
        g.asset === "equity" &&
        typeof b.OpenPriceIncludingCosts === "number" &&
        typeof v.ConversionRateOpen === "number"
      ) {
        g.liveFee =
          (g.liveFee ?? 0) + (b.OpenPriceIncludingCosts - price) * amount * v.ConversionRateOpen;
      }
      return {
        id,
        symbol,
        description: d.Description,
        assetType: b.AssetType,
        quantity: amount,
        entryPrice: price,
        currentPrice: typeof v.CurrentPrice === "number" ? v.CurrentPrice : null,
        priceCurrency: d.Currency,
        marketValue:
          typeof v.MarketValueInBaseCurrency === "number" ? v.MarketValueInBaseCurrency : null,
        unrealizedPnl:
          typeof v.ProfitLossOnTradeInBaseCurrency === "number"
            ? v.ProfitLossOnTradeInBaseCurrency
            : null,
        estimatedCosts:
          typeof v.TradeCostsTotalInBaseCurrency === "number"
            ? -v.TradeCostsTotalInBaseCurrency
            : null,
        priceDelayMinutes: v.CurrentPriceDelayMinutes ?? null,
        priceAsOf: v.CurrentPriceLastTraded ?? null,
        expiry:
          b.OptionsData?.ExpiryDate ?? transactions.get(openId)?.Instrument?.ExpiryDate ?? null,
        strike: b.OptionsData?.Strike ?? transactions.get(openId)?.Instrument?.Strike ?? null,
      };
    });
  const fills: ImportedExecution[] = [];
  const riskMultipliers: Record<string, number> = {};
  for (const g of groups.values()) {
    const tx = transactions.get(g.id);
    const fee = saxoFee(tx);
    const sourceQuantity = Math.abs(tx?.fill?.TradedQuantity ?? g.quantity);
    g.openFee = fee === undefined ? (g.liveFee ?? 0) : (fee * g.quantity) / sourceQuantity;
    if (fee === undefined && g.liveFee === undefined)
      warnings.add(
        "Some opening costs are unavailable separately. Closed net P&L still uses Saxo's reported amount; gross P&L and fee breakdowns for those lots are incomplete.",
      );
    if (g.asset === "equity") g.multiplier = 1;
    const r = tradeById.get(g.id);
    const f = tx?.fill;
    const qty = f?.TradedQuantity ?? r?.Amount;
    const price = f?.Price ?? r?.Price;
    const value = f?.TradedValue ?? r?.TradedValue;
    if (typeof value === "number" && qty && price) {
      const multiplier = Math.abs(value / (qty * price));
      // Monetary traded values may be rounded; equity unit size is always one.
      if (g.asset === "equity") g.multiplier = 1;
      else if (Number.isFinite(multiplier) && multiplier > 0) g.multiplier = multiplier;
    }
    const group = `saxo-position:${g.id}:${g.symbol}`;
    const rate = g.priceCurrency === currency ? 1 : (g.conversionRate ?? tx?.ConversionRate);
    if (g.multiplier && typeof rate === "number" && rate > 0)
      riskMultipliers[group] = g.multiplier * rate;
    const metadata = {
      group,
      preserveFee: true,
      saxo: {
        reconstructed: true,
        positionId: g.id,
        priceCurrency: g.priceCurrency,
        contractMultiplier: g.multiplier,
      },
    };
    fills.push({
      symbol: g.symbol,
      side: g.direction === "long" ? "buy" : "sell",
      quantity: g.quantity,
      price: g.price,
      fee: g.openFee,
      executedAt: g.time,
      assetClass: g.asset,
      importMetadata: { ...metadata, id: "open", order: 0 },
    });
    const seen = new Set<string>();
    for (const row of g.closes) {
      const closeId = String(row.ClosePositionId);
      const identity = hash(
        JSON.stringify([closeId, row.TradeDateClose, row.Amount, row.ClosePrice]),
      );
      if (seen.has(identity)) throw new Error("Saxo returned duplicate closed-position rows.");
      seen.add(identity);
      const quantity = Math.abs(row.Amount);
      // If Saxo reports the same ID on both legs, its sole fee belongs to the entry.
      const closeFee =
        closeId === g.id
          ? 0
          : ((saxoFee(transactions.get(closeId)) ?? 0) * quantity) / closeTotals.get(closeId)!;
      if (closeId !== g.id && saxoFee(transactions.get(closeId)) === undefined)
        warnings.add(
          "Some closing costs are unavailable separately; closed net P&L remains broker-reported.",
        );
      let time = timeFor(
        closeId,
        row.TradeDateClose,
        row.ClosePrice,
        g.direction === "long" ? -1 : 1,
      );
      if (time < g.time) {
        // Back-office value dates can precede the actual opening execution.
        const actual = iso(transactions.get(closeId)?.fill?.TradeExecutionTime);
        if (actual && actual >= g.time) time = actual;
        else {
          time = g.time;
          warnings.add(
            "Some settlement rows lack an ordered execution time; their duration is unavailable and represented as zero.",
          );
        }
      }
      fills.push({
        symbol: g.symbol,
        side: g.direction === "long" ? "sell" : "buy",
        quantity,
        price: row.ClosePrice,
        fee: closeFee,
        executedAt: time,
        assetClass: g.asset,
        importMetadata: {
          ...metadata,
          id: `close:${identity}`,
          order: 1,
          reportedGrossPnl: row.PnLAccountCurrency + closeFee + (g.openFee * quantity) / g.quantity,
        },
      });
    }
  }
  const ledger = reports.transactions
    .filter((t) => t.TransactionType !== "Trade")
    .map((t) => ({
      id: String(t.BookingId ?? t.BkRecordId ?? t.CorporateActionId),
      date: t.Date,
      type: t.TransactionType,
      event: t.EventDisplay ?? t.Event,
      symbol: t.Instrument?.Symbol ?? "",
      amount: number(t.BookedAmount, "cash transaction amount"),
      currency: t.Currency,
      costs: typeof t.TotalCost === "number" ? -t.TotalCost : null,
    }));
  const realizedPnl = reports.closed.reduce((sum, r) => sum + r.PnLAccountCurrency, 0);
  const unrealizedPnl = positions.every((p) => p.unrealizedPnl !== null)
    ? positions.reduce((sum, p) => sum + p.unrealizedPnl!, 0)
    : null;
  return {
    fills,
    positions,
    ledger,
    warnings: [...warnings],
    equity: number(reports.balances.TotalValue, "equity"),
    cash: number(reports.balances.CashBalance, "cash balance"),
    realizedPnl,
    unrealizedPnl,
    closedPositions: reports.closed.length,
    sourceTrades: reports.trades.length,
    riskMultipliers,
    fees: fills.reduce((sum, f) => sum + f.fee, 0),
  };
}
