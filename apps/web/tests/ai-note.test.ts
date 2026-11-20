import { beforeEach, expect, it, vi } from "vitest";
import { buildAiNotePrompt, DEFAULT_AI_NOTE_PROMPT, validAiNotePrompt } from "../src/lib/ai-note";
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  get: vi.fn(),
  model: vi.fn(),
  accounts: {},
  journalDays: {},
  journal: "Original saved journal",
}));
vi.mock("@/server/ai", () => ({ runAi: mocks.run }));
vi.mock("@/server/settings", () => ({
  getSetting: mocks.get,
  getAiProvider: () => "openai",
  getAiModel: mocks.model,
  getTimeZone: () => "UTC",
}));
vi.mock("@/server/auth", () => ({ passwordConfigured: () => false }));
vi.mock("@/server/trades-query", () => ({ getTradeByKey: vi.fn(), queryTrades: vi.fn() }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) =>
        table === mocks.accounts
          ? [{ id: "a", name: "Account A", currency: "USD" }]
          : { where: () => [{ date: "2026-11-20", note: mocks.journal }] },
    }),
  },
  accounts: mocks.accounts,
  executions: {},
  journalDays: mocks.journalDays,
  notes: {},
  folders: {},
  progressChecks: {},
  progressRules: {},
  playbooks: {},
}));
const { POST } = await import("../src/app/api/ai/structure-note/route");
beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue("## Lessons\n\nWait.");
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.model.mockReset().mockResolvedValue("test-model");
  mocks.journal = "Original saved journal";
});
const send = (body: unknown) =>
  POST(
    new Request("http://localhost/api/ai/structure-note", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const preview = async (text = "Wait.") => (await send({ text, preview: true })).json();
it("previews the saved prompt without calling AI, then sends exactly the previewed input", async () => {
  mocks.get.mockResolvedValue("Organize: {{dictation}}");
  const text = "Bought $& at $100 {{dictation}}";
  const input = await preview(text);
  expect(input.prompt).toBe("Organize: Bought $& at $100 {{dictation}}");
  expect(mocks.run).not.toHaveBeenCalled();
  const response = await send({ text, fingerprint: input.fingerprint });
  expect(response.status).toBe(200);
  expect(mocks.run).toHaveBeenCalledWith(input.prompt, 8000, input.system);
  expect(await response.json()).toEqual({ markdown: "## Lessons\n\nWait.", input });
});
it("defaults to the built-in template and sends no extra data without context", async () => {
  const input = await preview();
  expect(input.prompt).toBe(buildAiNotePrompt(DEFAULT_AI_NOTE_PROMPT, "Wait."));
  expect(input.sources).toEqual([]);
});
it("rejects changed drafts, templates and models before generation", async () => {
  const input = await preview();
  expect((await send({ text: "New note", fingerprint: input.fingerprint })).status).toBe(400);
  mocks.get.mockResolvedValue("New template {{dictation}}");
  expect((await send({ text: "Wait.", fingerprint: input.fingerprint })).status).toBe(400);
  mocks.get.mockResolvedValue(null);
  mocks.model.mockResolvedValue("different-model");
  expect((await send({ text: "Wait.", fingerprint: input.fingerprint })).status).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
});
it("requires a matching preview and rejects malformed or oversized input", async () => {
  for (const body of [
    null,
    [],
    {},
    { text: 3 },
    { text: "   " },
    { text: "a".repeat(24001) },
    { text: "Wait." },
    { text: "Wait.", preview: "yes" },
    { text: "Wait.", unexpected: true },
    { text: "Wait.", preview: true, context: { date: "2026-02-30" } },
  ])
    expect((await send(body)).status).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
});
it("validates editable templates", () => {
  expect(validAiNotePrompt(DEFAULT_AI_NOTE_PROMPT)).toBe(true);
  for (const value of [null, 2, "", "Missing placeholder", "a".repeat(8000) + "{{dictation}}"])
    expect(validAiNotePrompt(value)).toBe(false);
});
it("returns provider failures without modifying notes", async () => {
  const input = await preview();
  mocks.run.mockRejectedValue(new Error("AI is not configured"));
  const response = await send({ text: "Wait.", fingerprint: input.fingerprint });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "AI is not configured" });
});

it("rejects a preview when the selected saved journal changes, before calling AI", async () => {
  const body = {
    text: "My dictated note",
    context: {
      date: "2026-11-20",
      timeZone: "UTC",
      accountId: "a",
      trades: false,
      tradeNotes: false,
      journal: true,
      notebook: false,
      routines: false,
    },
  };
  const response = await send({ ...body, preview: true });
  expect(response.status).toBe(200);
  const input = await response.json();
  expect(input.prompt).toContain("Original saved journal");
  mocks.journal = "Newly saved journal";
  const generated = await send({ ...body, fingerprint: input.fingerprint });
  expect(generated.status).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
});
