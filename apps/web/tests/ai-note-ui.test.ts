// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  generate: vi.fn(),
  inspect: vi.fn(),
  private: false,
}));
const defaults = {
  date: "2026-11-20",
  timeZone: "UTC",
  accountId: "",
  accounts: [{ id: "a", name: "Account A", currency: "USD" }],
};
vi.mock("@/lib/use-api", () => ({
  postJson: mocks.post,
  useApi: () => ({ data: defaults, error: null, loading: false, refresh: vi.fn() }),
}));
vi.mock("../src/components/rich-editor", () => ({
  Markdown: ({ children }: { children: string }) => children,
}));
vi.mock("../src/components/privacy", () => ({ usePrivacy: () => mocks.private }));
const { AiStructureNote } = await import("../src/components/ai-structure-note");
const input = {
  fingerprint: "snapshot",
  provider: "openai",
  model: "test",
  system: "System rules",
  prompt: "EXACT PRIVATE PROMPT",
  sources: [{ id: "trade:a", label: "A trade", content: "PRIVATE TRADE DATA", href: "/trades/a" }],
};
let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.private = false;
  mocks.inspect.mockReset().mockResolvedValue(input);
  mocks.generate.mockReset().mockResolvedValue({ markdown: "## Plan\nWait.", input });
  mocks.post
    .mockReset()
    .mockImplementation((_url, body) =>
      body.preview ? mocks.inspect(body) : mocks.generate(body),
    );
  changed.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = (value: string) =>
  act(async () => root.render(createElement(AiStructureNote, { value, onChange: changed })));
const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label)!;
const click = (label: string) => act(async () => button(label).click());
const prepare = async (text = "Wait.") => {
  await render(text);
  await click("Structure with AI");
  await click("Preview AI data");
};
it("previews exact context without generating, then applies explicitly and supports undo", async () => {
  await render("Wait.");
  await click("Structure with AI");
  expect(button("Generate Markdown").disabled).toBe(true);
  await click("Preview AI data");
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(container.textContent).toContain("EXACT PRIVATE PROMPT");
  expect(container.textContent).toContain("PRIVATE TRADE DATA");
  await click("Generate Markdown");
  expect(changed).not.toHaveBeenCalled();
  expect(mocks.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      text: "Wait.",
      fingerprint: "snapshot",
      context: expect.objectContaining({ date: "2026-11-20", trades: true }),
    }),
  );
  await click("Use Markdown");
  expect(changed).toHaveBeenLastCalledWith("## Plan\nWait.");
  await render("## Plan\nWait.");
  await click("Undo AI formatting");
  expect(changed).toHaveBeenLastCalledWith("Wait.");
});
it("invalidates previews on account/category changes and allows note-only input", async () => {
  await prepare();
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="AI context account"]',
    )!;
    select.value = "a";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(button("Generate Markdown").disabled).toBe(true);
  await click("Preview AI data");
  expect(mocks.inspect).toHaveBeenLastCalledWith(
    expect.objectContaining({ context: expect.objectContaining({ accountId: "a" }) }),
  );
  await act(async () =>
    (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click(),
  );
  expect(button("Generate Markdown").disabled).toBe(true);
  await click("Preview AI data");
  expect(mocks.inspect).toHaveBeenLastCalledWith(expect.objectContaining({ context: null }));
});
it("protects edits during generation and requires a fresh preview before regenerating", async () => {
  let resolve!: (value: unknown) => void;
  mocks.generate.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await prepare("Original");
  await click("Generate Markdown");
  await render("New dictation");
  await act(async () => resolve({ markdown: "Old result", input }));
  expect(button("Use Markdown").disabled).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  mocks.generate.mockResolvedValue({ markdown: "New result", input });
  await click("Preview AI data");
  await click("Regenerate Markdown");
  await click("Use Markdown");
  expect(changed).toHaveBeenCalledWith("New result");
});
it("does not accept a delayed preview for an older draft", async () => {
  let resolve!: (value: unknown) => void;
  mocks.inspect.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await render("Original");
  await click("Structure with AI");
  await click("Preview AI data");
  await render("New dictation");
  await act(async () => resolve(input));
  expect(button("Generate Markdown").disabled).toBe(true);
});
it("keeps the source on failures, supports retry and discard, and hides private data", async () => {
  mocks.private = true;
  await prepare();
  expect(container.textContent).not.toContain("EXACT PRIVATE PROMPT");
  expect(container.textContent).not.toContain("PRIVATE TRADE DATA");
  mocks.generate.mockRejectedValueOnce(new Error("AI is not configured"));
  await click("Generate Markdown");
  expect(container.textContent).toContain("AI is not configured");
  expect(changed).not.toHaveBeenCalled();
  await click("Generate Markdown");
  await click("Discard");
  expect(container.textContent).not.toContain("Use Markdown");
});
