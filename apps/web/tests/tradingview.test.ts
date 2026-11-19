// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TradingViewChart } from "../src/components/tradingview-chart";
import { tradingViewSymbol } from "../src/lib/tradingview";

const privacy = vi.hoisted(() => ({ enabled: false }));
vi.mock("../src/components/privacy", () => ({ usePrivacy: () => privacy.enabled }));
vi.mock("../src/components/trade-chart", () => ({
  TradeChart: () => createElement("p", null, "Recorded fills"),
}));
let root: Root;
let container: HTMLDivElement;
const trade = {
  key: "test",
  symbol: "EUR/USD",
  assetClass: "forex",
  direction: "long",
  openedAt: "2026-01-01",
  avgEntry: 1,
  netPnl: 0,
};
const config = () => JSON.parse(container.querySelector("script")!.textContent!);
const render = async (symbol = trade.symbol) => {
  await act(async () =>
    root.render(createElement(TradingViewChart, { trade: { ...trade, symbol }, executions: [] })),
  );
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  privacy.enabled = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});
it("normalizes pairs without guessing exchanges, broker suffixes, or futures contracts", () => {
  expect(tradingViewSymbol(" eur/usd ", "forex")).toBe("EURUSD");
  expect(tradingViewSymbol("btc-usdt", "crypto")).toBe("BTCUSDT");
  expect(tradingViewSymbol("NASDAQ:AAPL", "equity")).toBe("NASDAQ:AAPL");
  expect(tradingViewSymbol("BRK.B", "equity")).toBe("BRK.B");
  expect(tradingViewSymbol("ESZ6", "futures")).toBe("ESZ6");
  expect(tradingViewSymbol("EURUSD.pro", "forex")).toBe("EURUSD.PRO");
});
it("uses a saved mapping and replaces the widget on navigation and theme changes", async () => {
  localStorage.setItem("journal:tradingview:forex:EUR/USD", "OANDA:EURUSD");
  await render();
  expect(config().symbol).toBe("OANDA:EURUSD");
  await render("GBP/USD");
  expect(config().symbol).toBe("GBPUSD");
  await act(async () => document.documentElement.classList.add("dark"));
  expect(config().theme).toBe("dark");
  expect(container.querySelectorAll("script")).toHaveLength(1);
});
it("removes the external widget in privacy mode", async () => {
  await render();
  expect(container.querySelector("script")).not.toBeNull();
  privacy.enabled = true;
  await render();
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("Recorded fills");
});
it("offers recovery when the script fails and lets the user switch to fills", async () => {
  await render();
  await act(async () => container.querySelector("script")!.dispatchEvent(new Event("error")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not load");
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "Show recorded fills",
  )!;
  await act(async () => button.click());
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("Recorded fills");
});

it("loads symbol news only when opened and follows the saved ticker", async () => {
  localStorage.setItem("journal:tradingview:forex:EUR/USD", "OANDA:EURUSD");
  await render();
  expect(container.querySelectorAll("script")).toHaveLength(1);
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "Show symbol news",
  )!;
  await act(async () => button.click());
  const news = container.querySelector('script[src*="timeline"]')!;
  expect(JSON.parse(news.textContent!).symbol).toBe("OANDA:EURUSD");
  expect(container.textContent).toContain("not news from this trade’s dates");
  privacy.enabled = true;
  await render();
  expect(container.querySelectorAll("script")).toHaveLength(0);
});

it("recovers from a blocked embed and clears the loading state when an iframe appears", async () => {
  vi.useFakeTimers();
  try {
    await render();
    await act(async () => vi.advanceTimersByTime(20000));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "Retry",
    )!;
    await act(async () => button.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () =>
      container
        .querySelector(".tradingview-widget-container")!
        .appendChild(document.createElement("iframe")),
    );
    expect(container.querySelector("iframe")!.title).toContain("EURUSD");
    await act(async () => vi.advanceTimersByTime(20000));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
