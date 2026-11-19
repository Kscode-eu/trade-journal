"use client";

import {
  FOREX_CURRENCIES,
  FOREX_TOOLS,
  forexWatchlist,
  type ForexTool as Tool,
} from "@/lib/forex-workspace";
import { TradingViewWidget, type TradingViewWidgetKind } from "./tradingview-widget";
import { TradingViewElement } from "./tradingview-element";

export function ForexTool({ tool, symbol }: { tool: Tool; symbol: string }) {
  const title = FOREX_TOOLS.find((item) => item.id === tool)!.name;
  const href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
  const symbols = forexWatchlist(symbol);
  if (tool === "seasonal" || tool === "tag")
    return (
      <TradingViewElement
        kind={tool === "seasonal" ? "seasonal" : "tickerTag"}
        attributes={{ symbol }}
        title={`${title} · ${symbol}`}
        href={href}
        height={tool === "tag" ? 150 : 520}
      />
    );
  const widgets: Partial<
    Record<Tool, { kind: TradingViewWidgetKind; options: Record<string, unknown>; height?: number }>
  > = {
    chart: {
      kind: "advanced-chart",
      options: {
        symbol,
        autosize: true,
        interval: "60",
        timezone: "Etc/UTC",
        style: "1",
        allow_symbol_change: false,
        support_host: "https://www.tradingview.com",
      },
    },
    mini: {
      kind: "mini-symbol-overview",
      options: { symbol, dateRange: "3M", chartOnly: false },
      height: 350,
    },
    comparison: {
      kind: "symbol-overview",
      options: {
        symbols: symbols.slice(0, 4).map((pair) => [pair, `${pair}|1D`]),
        chartOnly: false,
        autosize: true,
        showVolume: false,
      },
    },
    info: { kind: "symbol-info", options: { symbol, isTransparent: false }, height: 250 },
    technical: {
      kind: "technical-analysis",
      options: {
        symbol,
        interval: "1h",
        showIntervalTabs: true,
        displayMode: "multiple",
        isTransparent: false,
      },
      height: 470,
    },
    profile: { kind: "symbol-profile", options: { symbol, isTransparent: false }, height: 420 },
    quote: { kind: "single-quote", options: { symbol, isTransparent: false }, height: 180 },
    tickers: {
      kind: "tickers",
      options: { symbols: symbols.map((proName) => ({ proName })), isTransparent: false },
      height: 300,
    },
    overview: {
      kind: "market-overview",
      options: {
        dateRange: "3M",
        showChart: true,
        showSymbolLogo: true,
        isTransparent: false,
        tabs: [{ title: "Forex", symbols: symbols.map((s) => ({ s, d: s.split(":")[1] })) }],
      },
    },
    data: {
      kind: "market-quotes",
      options: {
        symbolsGroups: [{ name: "Forex", symbols: symbols.map((name) => ({ name })) }],
        showSymbolLogo: true,
        isTransparent: false,
      },
    },
    crossrates: {
      kind: "forex-cross-rates",
      options: { currencies: FOREX_CURRENCIES, isTransparent: false },
      height: 500,
    },
    heatmap: {
      kind: "forex-heat-map",
      options: { currencies: FOREX_CURRENCIES, isTransparent: false },
      height: 500,
    },
    screener: {
      kind: "screener",
      options: {
        market: "forex",
        defaultColumn: "overview",
        defaultScreen: "general",
        showToolbar: true,
        isTransparent: false,
      },
      height: 650,
    },
    news: {
      kind: "timeline",
      options: { symbol, feedMode: "symbol", displayMode: "regular", isTransparent: false },
    },
  };
  const widget = widgets[tool]!;
  return <TradingViewWidget {...widget} title={`${title} · ${symbol}`} href={href} />;
}
