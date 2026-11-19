// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_FOREX_WORKSPACE } from "../src/lib/forex-workspace";
import MarketsPage from "../src/app/markets/page";

const navigation = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) =>
    createElement("a", props, children),
}));
vi.mock("../src/lib/use-api", () => ({
  useApi: (url: string) => ({
    data: url.includes("forex-workspace") ? DEFAULT_FOREX_WORKSPACE : { highImportanceOnly: true },
    error: null,
    refresh: vi.fn(),
  }),
  postJson: vi.fn(),
}));
beforeAll(() => {
  customElements.define("tv-economic-calendar", class extends HTMLElement {});
});
let root: Root;
let container: HTMLDivElement;
const render = async (view: string) => {
  navigation.query = `view=${view}`;
  await act(async () => root.render(createElement(MarketsPage)));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("loads only the selected tool and replaces it when switching views", async () => {
  for (const [view, loader] of [
    ["calendar", "events"],
    ["news", "timeline"],
    ["heatmaps", "forex-heat-map"],
  ] as const) {
    await render(view);
    const scripts = container.querySelectorAll("script");
    if (loader === "events") {
      expect(scripts).toHaveLength(0);
      expect(container.querySelector("tv-economic-calendar")?.getAttribute("countries")).toBe("us");
    } else {
      expect(scripts).toHaveLength(1);
      expect(scripts[0]!.src).toContain(`embed-widget-${loader}.js`);
      expect(container.querySelector("tv-economic-calendar")).toBeNull();
    }
  }
});
it("switches heatmap markets without leaving the forex widget mounted", async () => {
  await render("heatmaps");
  const select = container.querySelector("select")!;
  await act(async () => {
    select.value = "stocks";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const scripts = container.querySelectorAll("script");
  expect(scripts).toHaveLength(1);
  expect(scripts[0]!.src).toContain("stock-heatmap");
  expect(JSON.parse(scripts[0]!.textContent!).dataSource).toBe("SPX500");
});

it("opens the forex desk for the default or unknown view", async () => {
  await render("invalid");
  expect(container.textContent).toContain("Forex desk");
  expect(container.querySelector('script[src*="advanced-chart"]')).not.toBeNull();
  expect(container.querySelector('script[src*="ticker-tape"]')).not.toBeNull();
  expect(container.querySelector("tv-economic-calendar")).toBeNull();
});
