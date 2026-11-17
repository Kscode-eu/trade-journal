"use client";
import { MonetaryValue } from "@/components/privacy";
import { fmtMoney } from "@/lib/utils";

export interface SaxoSnapshot {
  equity?: number;
  cash?: number;
  realizedPnl?: number;
  unrealizedPnl?: number | null;
  fees?: number;
  sourceTrades?: number;
  closedPositions?: number;
  from?: string;
  to?: string;
  fetchedAt?: string;
  syncError?: string | null;
  warnings?: string[];
  positions?: Array<{
    id: string;
    symbol: string;
    assetType: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number | null;
    priceCurrency?: string;
    unrealizedPnl: number | null;
    priceDelayMinutes?: number | null;
    expiry?: string | null;
    strike?: number | null;
  }>;
  ledger?: Array<{
    id: string;
    date: string;
    event: string;
    type: string;
    amount: number;
    currency: string;
  }>;
}
export function SaxoAccountDetails({
  snapshot: s,
  accountId,
  currency,
}: {
  snapshot: SaxoSnapshot | null;
  accountId: string;
  currency: string;
}) {
  const money = (value: number | null | undefined, c = currency) =>
    value == null ? "Unavailable" : <MonetaryValue>{fmtMoney(value, c)}</MonetaryValue>;
  return (
    <div className="space-y-3 text-sm">
      {s?.syncError && (
        <p role="alert" className="text-destructive">
          Sync failed: {s.syncError}
          {s.fetchedAt ? " Previous data is still shown." : ""}
        </p>
      )}
      {!s?.fetchedAt && (
        <p className="text-muted-foreground">Connected. Use Sync to fetch positions and history.</p>
      )}
      {s?.fetchedAt && (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-muted-foreground">Broker equity</dt>
              <dd>{money(s.equity)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cash balance</dt>
              <dd>{money(s.cash)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Closed net P&amp;L</dt>
              <dd>{money(s.realizedPnl)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Open P&amp;L before costs</dt>
              <dd>{money(s.unrealizedPnl)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Identified position costs</dt>
              <dd>{money(s.fees)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {s.sourceTrades} source trades · {s.closedPositions} closed-position records ·{" "}
            {s.positions?.length ?? 0} open lots. Updated{" "}
            {s.fetchedAt.slice(0, 19).replace("T", " ")} UTC.
          </p>
          <p className="text-xs text-muted-foreground">
            Journal executions are reconstructed from Saxo positions. Closed P&amp;L uses Saxo’s
            account-currency amounts. Quotes remain in instrument currency. Cash movements and
            dividends are listed separately.
          </p>
          <details>
            <summary className="cursor-pointer">
              Open positions ({s.positions?.length ?? 0})
            </summary>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Quantity</th>
                    <th>Entry</th>
                    <th>Latest</th>
                    <th>P&amp;L ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {s.positions?.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2">
                        {p.symbol}
                        <div className="text-muted-foreground">
                          {p.assetType}
                          {p.expiry ? ` · ${p.expiry.slice(0, 10)}` : ""}
                          {p.strike != null ? ` · strike ${p.strike}` : ""}
                          {p.priceDelayMinutes ? ` · ${p.priceDelayMinutes} min delay` : ""}
                        </div>
                      </td>
                      <td>{p.quantity}</td>
                      <td>{money(p.entryPrice, p.priceCurrency)}</td>
                      <td>{money(p.currentPrice, p.priceCurrency)}</td>
                      <td>{money(p.unrealizedPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary className="cursor-pointer">
              Cash, dividends and other activity ({s.ledger?.length ?? 0})
            </summary>
            <div className="max-h-72 overflow-auto">
              <table className="mt-2 w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {s.ledger?.map((entry, i) => (
                    <tr key={`${entry.id}:${i}`} className="border-t">
                      <td className="py-1">{entry.date?.slice(0, 10)}</td>
                      <td>{entry.event}</td>
                      <td>{money(entry.amount, entry.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <a className="underline" href={`/api/accounts/${accountId}/saxo`} download>
            Download all Saxo source reports
          </a>
          {!!s.warnings?.length && (
            <details>
              <summary className="cursor-pointer">Data notes ({s.warnings.length})</summary>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {s.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
