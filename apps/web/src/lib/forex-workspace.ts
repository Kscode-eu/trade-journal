import { validTradingViewSymbol } from "./tradingview";

export const FOREX_PAIRS = [
  "OANDA:EURUSD",
  "OANDA:GBPUSD",
  "OANDA:USDJPY",
  "OANDA:USDCHF",
  "OANDA:AUDUSD",
  "OANDA:USDCAD",
  "OANDA:NZDUSD",
] as const;
export const FOREX_CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"];
export const FOREX_TOOLS = [
  {
    id: "chart",
    name: "Advanced chart",
    group: "Charts",
    description: "Explore price action and indicators for the selected pair.",
  },
  {
    id: "mini",
    name: "Mini chart",
    group: "Charts",
    description: "A compact view of the selected pair’s recent price path.",
  },
  {
    id: "comparison",
    name: "Symbol overview",
    group: "Charts",
    description: "Compare the selected pair with major currency pairs.",
  },
  {
    id: "seasonal",
    name: "Seasonal chart",
    group: "Charts",
    description: "Explore historical seasonal patterns. Coverage varies by instrument.",
  },
  {
    id: "info",
    name: "Symbol info",
    group: "Symbol details",
    description: "Price, change and market information for the selected pair.",
  },
  {
    id: "technical",
    name: "Technical analysis",
    group: "Symbol details",
    description:
      "Compare TradingView’s indicator summaries across timeframes. These are current readings, not trade-date signals.",
  },
  {
    id: "profile",
    name: "Symbol profile",
    group: "Symbol details",
    description: "Read background information for the selected currency pair where available.",
  },
  {
    id: "quote",
    name: "Single ticker",
    group: "Tickers",
    description: "A compact quote for your selected pair.",
  },
  {
    id: "tickers",
    name: "Currency tickers",
    group: "Tickers",
    description: "Quotes for the selected pair and the major currencies.",
  },
  {
    id: "tag",
    name: "Ticker tag",
    group: "Tickers",
    description: "A compact symbol tag with an interactive chart popover.",
  },
  {
    id: "overview",
    name: "Market overview",
    group: "Watchlists",
    description: "Track a ready-made watchlist of major currency pairs.",
  },
  {
    id: "data",
    name: "Market data",
    group: "Watchlists",
    description: "Compare currency quotes in a table.",
  },
  {
    id: "crossrates",
    name: "Forex cross rates",
    group: "Forex tools",
    description: "Compare exchange rates across eight major currencies.",
  },
  {
    id: "heatmap",
    name: "Forex heatmap",
    group: "Forex tools",
    description: "See relative currency strength across the major pairs.",
  },
  {
    id: "screener",
    name: "Forex screener",
    group: "Forex tools",
    description: "Scan currency pairs using TradingView’s technical and performance filters.",
  },
  {
    id: "news",
    name: "Pair news",
    group: "News",
    description:
      "Read the latest headlines for the selected pair. Some feeds may have no coverage.",
  },
] as const;
export type ForexTool = (typeof FOREX_TOOLS)[number]["id"];
export interface ForexWorkspace {
  symbol: string;
  tool: ForexTool;
  showTickerTape: boolean;
}
export const DEFAULT_FOREX_WORKSPACE: ForexWorkspace = {
  symbol: FOREX_PAIRS[0],
  tool: "chart",
  showTickerTape: true,
};
export function parseForexWorkspace(value: unknown): ForexWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Enter valid forex workspace settings.");
  const item = value as Record<string, unknown>;
  if (
    typeof item.symbol !== "string" ||
    !validTradingViewSymbol(item.symbol.trim().toUpperCase()) ||
    !item.symbol.includes(":")
  )
    throw new Error("Enter an exchange-qualified symbol, such as OANDA:EURUSD.");
  if (!FOREX_TOOLS.some((tool) => tool.id === item.tool))
    throw new Error("Choose an available forex tool.");
  if (typeof item.showTickerTape !== "boolean")
    throw new Error("Ticker tape must be enabled or disabled.");
  return {
    symbol: item.symbol.trim().toUpperCase(),
    tool: item.tool as ForexTool,
    showTickerTape: item.showTickerTape,
  };
}
export function forexWatchlist(symbol: string) {
  return [...new Set([symbol, ...FOREX_PAIRS])];
}
