// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
const state = vi.hoisted(() => ({
  serialize: vi.fn(),
  load: vi.fn(),
  saved: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@excalidraw/excalidraw", () => ({
  serializeAsJSON: state.serialize,
  loadFromBlob: state.load,
  Excalidraw: ({
    excalidrawAPI,
    onChange,
  }: {
    excalidrawAPI: (api: unknown) => void;
    onChange: (elements: unknown[], app: unknown, files: unknown) => void;
  }) => {
    useEffect(() => {
      excalidrawAPI({ getSceneElements: () => [], getAppState: () => ({}), getFiles: () => ({}) });
      onChange([], {}, {});
    }, []);
    return createElement(
      "button",
      { onClick: () => onChange([{ id: "shape", version: 1 }], {}, {}) },
      "Draw shape",
    );
  },
}));
const { default: DrawingEditor } = await import("../src/components/drawing-editor");
const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock
    .mockReset()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ id: "drawing" }),
      blob: async () => new Blob(),
    });
  state.serialize.mockReset().mockReturnValue('{"type":"excalidraw","version":2,"elements":[]}');
  state.load.mockReset().mockResolvedValue({ elements: [] });
  state.saved.mockReset();
  state.close.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = (attachment?: { id: string; name: string }) =>
  act(async () =>
    root.render(
      createElement(DrawingEditor, {
        type: "playbook",
        ownerId: "book",
        attachment,
        onSaved: state.saved,
        onClose: state.close,
      }),
    ),
  );
const click = (label: string) =>
  act(async () =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === label)!
      .click(),
  );
it("saves a new drawing with its owner", async () => {
  await render();
  await click("Save drawing");
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(url).toBe("/api/attachments");
  expect(options.method).toBe("POST");
  expect(options.body.get("type")).toBe("playbook");
  expect(options.body.get("id")).toBe("book");
  expect(options.body.get("file").name).toBe("Setup drawing.excalidraw");
  expect(state.saved).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});
it("reopens drawings and updates the existing attachment", async () => {
  await render({ id: "drawing", name: "Entry.excalidraw" });
  expect(state.load).toHaveBeenCalledOnce();
  await click("Save drawing");
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/attachments/drawing",
    expect.objectContaining({ method: "PUT" }),
  );
});
it("keeps the drawing open on a failed save and permits retry", async () => {
  await render();
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: "Storage unavailable" }),
  });
  await click("Save drawing");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("Storage unavailable");
  expect(state.close).not.toHaveBeenCalled();
  await click("Save drawing");
  expect(state.saved).toHaveBeenCalledOnce();
});
it("asks before discarding drawing edits", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await render();
  await click("Draw shape");
  await click("Close");
  expect(confirm).toHaveBeenCalled();
  expect(state.close).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await click("Close");
  expect(state.close).toHaveBeenCalledOnce();
  confirm.mockRestore();
});
