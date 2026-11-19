// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EconomicCalendar } from "../src/components/economic-calendar";
const api = vi.hoisted(() => ({
  data: { highImportanceOnly: true } as { highImportanceOnly: boolean } | null,
  error: null as string | null,
  save: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../src/lib/use-api", () => ({
  useApi: () => ({ data: api.data, error: api.error, refresh: api.refresh }),
  postJson: api.save,
}));
let root: Root;
let container: HTMLDivElement;
const render = async () => {
  await act(async () => root.render(createElement(EconomicCalendar)));
};
const toggle = () => container.querySelector('input[role="switch"]') as HTMLInputElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.data = { highImportanceOnly: true };
  api.error = null;
  api.save.mockReset();
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
it("loads the supplied module, fixes US coverage, and follows theme changes", async () => {
  await render();
  const script = document.head.querySelector(
    'script[src="https://widgets.tradingview-widget.com/w/en/tv-economic-calendar.js"]',
  )!;
  expect(script.getAttribute("type")).toBe("module");
  await act(async () => {
    customElements.define("tv-economic-calendar", class extends HTMLElement {});
    script.dispatchEvent(new Event("load"));
  });
  const widget = container.querySelector("tv-economic-calendar")!;
  expect(widget.getAttribute("countries")).toBe("us");
  expect(widget.hasAttribute("high-importance-only")).toBe(true);
  await act(async () => document.documentElement.classList.add("dark"));
  expect(widget.getAttribute("theme")).toBe("dark");
});
it("saves the toggle and removes the boolean attribute for all importance levels", async () => {
  api.save.mockResolvedValue({ highImportanceOnly: false });
  await render();
  await act(async () => toggle().click());
  expect(api.save).toHaveBeenCalledWith(
    "/api/markets/calendar-settings",
    { highImportanceOnly: false },
    "PATCH",
  );
  expect(toggle().checked).toBe(false);
  expect(
    container.querySelector("tv-economic-calendar")!.hasAttribute("high-importance-only"),
  ).toBe(false);
  expect(container.querySelector("tv-economic-calendar")!.getAttribute("countries")).toBe("us");
  await act(async () => root.unmount());
  api.data = { highImportanceOnly: false };
  root = createRoot(container);
  await render();
  expect(toggle().checked).toBe(false);
});
it("retains the saved filter on save failure", async () => {
  api.save.mockRejectedValue(new Error("Database unavailable"));
  await render();
  await act(async () => toggle().click());
  expect(toggle().checked).toBe(true);
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("Database unavailable");
});
it("does not mount an incorrectly filtered calendar while preferences load or fail", async () => {
  api.data = null;
  await render();
  expect(container.querySelector("tv-economic-calendar")).toBeNull();
  api.error = "Database unavailable";
  await render();
  expect(container.querySelector("tv-economic-calendar")).toBeNull();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
