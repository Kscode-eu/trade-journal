// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "../src/components/ui/tooltip";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/use-api", () => ({
  useApi: () => ({
    data: {
      attachments: [
        { id: "image", name: "chart.png", mime: "image/png", size: 100 },
        { id: "pdf", name: "review.pdf", mime: "application/pdf", size: 200 },
      ],
    },
    refresh: mocks.refresh,
  }),
  postJson: vi.fn(),
}));
const { Attachments } = await import("../src/components/attachments");
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        ...["first", "second"].map((id) =>
          createElement(
            "section",
            { key: id },
            createElement("textarea"),
            createElement(Attachments, { type: "note", id }),
          ),
        ),
      ),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function transfer(kind: "drop" | "paste", files: File[], index = 0) {
  const event = new Event(kind, { bubbles: true, cancelable: true });
  Object.defineProperty(event, kind === "drop" ? "dataTransfer" : "clipboardData", {
    value: { files, types: files.length ? ["Files"] : ["text/plain"] },
  });
  await act(async () => container.querySelectorAll("textarea")[index]!.dispatchEvent(event));
  return event;
}
it("uploads dropped files to the containing note only", async () => {
  const files = [new File(["png"], "chart.png"), new File(["pdf"], "review.pdf")];
  expect((await transfer("drop", files, 1)).defaultPrevented).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [, options] of fetchMock.mock.calls) {
    expect(options.body.get("id")).toBe("second");
    expect(options.body.get("type")).toBe("note");
  }
});
it("accepts clipboard images and leaves text paste untouched", async () => {
  expect((await transfer("paste", [])).defaultPrevented).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await transfer("paste", [new File(["png"], "image.png")])).defaultPrevented).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![1].body.get("id")).toBe("first");
});
it("continues the batch after a rejected file and shows the failure", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Unsupported file" }) });
  await transfer("drop", [new File(["bad"], "bad.txt"), new File(["png"], "chart.png")]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "bad.txt: Unsupported file",
  );
});
it("keeps the file picker working", async () => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["png"], "chart.png")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["chart.png", "review.pdf"])(
  "opens %s in a popup and closes it without navigation",
  async (name) => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="Open ${name}"]`)!.click(),
    );
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain(name);
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
    if (name.endsWith(".png"))
      expect(dialog.querySelector("img")?.getAttribute("src")).toBe("/api/attachments/image");
    else
      expect(dialog.querySelector("object")?.getAttribute("data")).toBe(
        "/api/attachments/pdf?preview=1",
      );
    await act(async () =>
      [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent === "Close")!
        .click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  },
);
