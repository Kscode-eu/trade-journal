// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ForexWorkspace } from "../src/components/forex-workspace";
import { ForexTool } from "../src/components/forex-tool";
import { EconomicMap } from "../src/components/economic-map";
import { DEFAULT_FOREX_WORKSPACE, FOREX_TOOLS } from "../src/lib/forex-workspace";
const api = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("../src/lib/use-api", () => ({
  useApi: () => ({ data: DEFAULT_FOREX_WORKSPACE, error: null, refresh: vi.fn() }),
  postJson: api.save,
}));
let root: Root;
let container: HTMLDivElement;
beforeAll(() => {
  for (const name of ["tv-seasonal-chart", "tv-ticker-tag", "tv-economic-map"])
    customElements.define(name, class extends HTMLElement {});
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.save.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("renders every forex tool using the current symbol or forex market configuration", async () => {
  for (const tool of FOREX_TOOLS) {
    await act(async () =>
      root.render(createElement(ForexTool, { tool: tool.id, symbol: "FX:GBPUSD" })),
    );
    const script = container.querySelector("script");
    if (tool.id === "seasonal" || tool.id === "tag") {
      expect(
        container
          .querySelector(tool.id === "tag" ? "tv-ticker-tag" : "tv-seasonal-chart")!
          .getAttribute("symbol"),
      ).toBe("FX:GBPUSD");
      expect(script).toBeNull();
    } else {
      expect(container.querySelectorAll("script")).toHaveLength(1);
      const config = JSON.parse(script!.textContent!);
      if (["crossrates", "heatmap"].includes(tool.id)) expect(config.currencies).toContain("GBP");
      else if (tool.id === "screener") expect(config.market).toBe("forex");
      else expect(script!.textContent).toContain("FX:GBPUSD");
    }
  }
});
it("applies pair presets across chart and tape and saves the chosen setup", async () => {
  api.save.mockImplementation(async (_url, body) => body);
  await act(async () => root.render(createElement(ForexWorkspace)));
  const pair = [...container.querySelectorAll("button")].find((b) => b.textContent === "GBPUSD")!;
  await act(async () => pair.click());
  expect(container.querySelector('script[src*="advanced-chart"]')!.textContent).toContain(
    "OANDA:GBPUSD",
  );
  expect(container.querySelector('script[src*="ticker-tape"]')!.textContent).toContain(
    "OANDA:GBPUSD",
  );
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = "technical";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector('script[src*="advanced-chart"]')).toBeNull();
  expect(container.querySelector('script[src*="technical-analysis"]')).not.toBeNull();
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.save).toHaveBeenCalledWith(
    "/api/markets/forex-workspace",
    { symbol: "OANDA:GBPUSD", tool: "technical", showTickerTape: true },
    "PUT",
  );
  expect(container.textContent).toContain("Workspace saved");
});
it("reports failed saves without claiming the workspace was saved", async () => {
  api.save.mockRejectedValue(new Error("Database unavailable"));
  await act(async () => root.render(createElement(ForexWorkspace)));
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("Database unavailable");
  expect(container.textContent).not.toContain("Workspace saved");
});
it("switches economic indicators on a single world map", async () => {
  await act(async () => root.render(createElement(EconomicMap)));
  expect(container.querySelector("tv-economic-map")!.getAttribute("metric")).toBe("intr");
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = "iryy";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelectorAll("tv-economic-map")).toHaveLength(1);
  expect(container.querySelector("tv-economic-map")!.getAttribute("metric")).toBe("iryy");
});
