// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  buildWeeklyReview,
  type WeeklyReviewPayload,
  type WeeklyReviewResult,
} from "../src/lib/weekly-review";
const state = vi.hoisted(() => ({ post: vi.fn(), privacy: false }));
vi.mock("@/lib/use-api", () => ({ postJson: state.post }));
vi.mock("@/components/charts/daily-bars", () => ({ DailyBars: () => null }));
vi.mock("@/components/charts/equity-area", () => ({ EquityArea: () => null }));
vi.mock("@/components/rich-editor", () => ({
  Markdown: ({ children }: { children: string }) => children,
}));
vi.mock("@/components/privacy", () => ({
  usePrivacy: () => state.privacy,
  MonetaryValue: ({ children }: { children: string }) => children,
}));
const { WeeklyReview } = await import("../src/components/weekly-review");
const report = (date = "2026-11-16"): WeeklyReviewPayload =>
  buildWeeklyReview(
    {
      trades: [],
      tradeNotes: [],
      accounts: [],
      journals: [{ date, note: "My note" }],
      notebooks: [],
    },
    date,
    "UTC",
  );
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.post.mockReset();
  state.privacy = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = (data = report()) =>
  act(async () => root.render(createElement(WeeklyReview, { key: data.start, initial: data })));
const generate = () =>
  Array.from(container.querySelectorAll("button")).find((b) =>
    /Generate weekly|Regenerate weekly|Reviewing your/.test(b.textContent ?? ""),
  )!;
it("generates only on demand with the displayed week and updates the matching snapshot", async () => {
  const data = report();
  state.post.mockResolvedValue({
    report: data,
    summary: "Weekly guidance",
    generatedAt: "2026-11-20T12:00:00Z",
  });
  await render();
  expect(state.post).not.toHaveBeenCalled();
  await act(async () => generate().click());
  expect(state.post).toHaveBeenCalledWith("/api/ai/weekly-review", {
    date: "2026-11-16",
    timeZone: "UTC",
  });
  expect(container.textContent).toContain("Weekly guidance");
});
it("does not show a delayed response after switching weeks and prevents duplicate calls", async () => {
  let resolve!: (value: WeeklyReviewResult) => void;
  state.post.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await render();
  await act(async () => {
    generate().click();
    generate().click();
  });
  expect(state.post).toHaveBeenCalledTimes(1);
  await render(report("2026-11-23"));
  await act(async () =>
    resolve({ report: report(), summary: "OLD WEEK", generatedAt: "2026-11-20T12:00:00Z" }),
  );
  expect(container.textContent).not.toContain("OLD WEEK");
  expect(container.textContent).toContain("2026-11-23 – 2026-11-29");
});
it("keeps charts available on provider errors and supports retry while protecting private prose", async () => {
  state.post.mockRejectedValueOnce(new Error("AI is not configured"));
  await render();
  await act(async () => generate().click());
  expect(container.textContent).toContain("AI is not configured");
  state.privacy = true;
  state.post.mockResolvedValue({
    report: report(),
    summary: "SECRET $100",
    generatedAt: "2026-11-20T12:00:00Z",
  });
  await act(async () => generate().click());
  expect(container.textContent).not.toContain("SECRET");
  expect(container.textContent).toContain("Turn off privacy mode");
});
