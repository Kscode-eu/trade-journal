"use client";

import { useEffect, useId, useState } from "react";
import { tradingViewSymbol, validTradingViewSymbol } from "@/lib/tradingview";
import { usePrivacy } from "./privacy";
import { TradeChart, type ChartExecution, type ChartTrade } from "./trade-chart";
import { ForexTool } from "./forex-tool";
import type { ForexTool as Tool } from "@/lib/forex-workspace";
import { TradingViewWidget } from "./tradingview-widget";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function TradingViewChart(props: { trade: ChartTrade; executions: ChartExecution[] }) {
  const privacy = usePrivacy();
  // Remount mappings when navigating between instruments; privacy never mounts the embed.
  if (privacy) return <TradeChart {...props} />;
  return <MarketChart key={`${props.trade.assetClass}:${props.trade.symbol}`} {...props} />;
}

function MarketChart({ trade, executions }: { trade: ChartTrade; executions: ChartExecution[] }) {
  const initial = tradingViewSymbol(trade.symbol, trade.assetClass);
  const storageKey = `journal:tradingview:${trade.assetClass ?? "other"}:${trade.symbol}`;
  const [symbol, setSymbol] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [ready, setReady] = useState(false);
  const [fills, setFills] = useState(false);
  const [news, setNews] = useState(false);
  const [details, setDetails] = useState(false);
  const [detailTool, setDetailTool] = useState<Tool>("info");
  const [message, setMessage] = useState("");
  const inputId = useId();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && validTradingViewSymbol(saved)) {
        setSymbol(saved);
        setDraft(saved);
      }
    } catch {
      /* Storage can be disabled; the chart still works. */
    }
    setReady(true);
  }, [storageKey]);

  function apply(reset = false) {
    const next = reset ? initial : draft.trim().toUpperCase();
    if (!validTradingViewSymbol(next)) {
      setMessage("Enter a ticker such as NASDAQ:AAPL or OANDA:EURUSD.");
      return;
    }
    setSymbol(next);
    setDraft(next);
    setMessage("");
    try {
      if (reset) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, next);
    } catch {
      setMessage("Symbol applied for this visit. Browser storage is unavailable.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>TradingView market chart</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <div className="min-w-48 flex-1 space-y-1">
            <label htmlFor={inputId} className="text-xs text-muted-foreground">
              TradingView symbol for {trade.symbol}
            </label>
            <Input
              id={inputId}
              value={draft}
              maxLength={100}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="EXCHANGE:SYMBOL"
            />
          </div>
          <Button type="submit">Apply symbol</Button>
          <Button type="button" variant="outline" onClick={() => apply(true)}>
            Reset
          </Button>
          <Button type="button" variant="outline" onClick={() => setFills(!fills)}>
            {fills ? "Show TradingView" : "Show recorded fills"}
          </Button>
        </form>
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          If the symbol is unavailable or shows the wrong market, use the chart’s symbol search,
          then enter its EXCHANGE:SYMBOL above to remember it in this browser. Verify the exchange
          and contract; broker suffixes may differ. Some instruments cannot be embedded.
        </p>
        {fills ? (
          <TradeChart trade={trade} executions={executions} />
        ) : (
          ready && (
            <TradingViewWidget
              kind="advanced-chart"
              title={`Chart for ${symbol}`}
              height={500}
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
              options={{
                autosize: true,
                symbol,
                interval: "D",
                timezone: "Etc/UTC",
                style: "1",
                allow_symbol_change: true,
                calendar: false,
                support_host: "https://www.tradingview.com",
              }}
            />
          )
        )}
        <p className="text-xs text-muted-foreground">
          TradingView provides market prices, which may be delayed. This chart does not show your
          recorded entries or exits. Use Market data &amp; replay below for trade-period candles and
          estimates.
        </p>
        <div className="border-t pt-3">
          <Button variant="outline" aria-expanded={details} onClick={() => setDetails(!details)}>
            {details ? "Hide symbol details" : "Show symbol details"}
          </Button>
          {details && ready && (
            <div className="mt-3 space-y-3">
              <label className="flex flex-wrap items-center gap-2 text-sm">
                Symbol detail tool
                <select
                  className="rounded-md border bg-background px-3 py-2"
                  value={detailTool}
                  onChange={(event) => setDetailTool(event.target.value as Tool)}
                >
                  <option value="info">Symbol info</option>
                  <option value="technical">Technical analysis</option>
                  <option value="profile">Symbol profile</option>
                  <option value="seasonal">Seasonal chart</option>
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Current context for {symbol}, not a snapshot from this trade’s dates. All panels
                follow the symbol applied above.
              </p>
              <ForexTool tool={detailTool} symbol={symbol} />
            </div>
          )}
        </div>
        <div className="border-t pt-3">
          <Button variant="outline" aria-expanded={news} onClick={() => setNews(!news)}>
            {news ? "Hide symbol news" : "Show symbol news"}
          </Button>
          {news && ready && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Latest headlines for {symbol}, not news from this trade’s dates. If coverage is
                unavailable, try another exchange-qualified symbol or browse{" "}
                <a className="underline" href="/markets?view=news">
                  market news
                </a>
                .
              </p>
              <TradingViewWidget
                kind="timeline"
                title={`News for ${symbol}`}
                height={430}
                href="https://www.tradingview.com/news/"
                options={{
                  feedMode: "symbol",
                  symbol,
                  displayMode: "regular",
                  isTransparent: false,
                }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
