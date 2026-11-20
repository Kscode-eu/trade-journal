import { beforeEach, expect, it, vi } from "vitest";
import { buildWeeklyReview } from "../src/lib/weekly-review";
const state = vi.hoisted(() => ({ run: vi.fn(), timezone: vi.fn() }));
vi.mock("@/server/ai", () => ({ runAi: state.run }));
vi.mock("@/server/settings", () => ({ getTimeZone: state.timezone }));
vi.mock("@/server/trades-query", () => ({ queryTrades: vi.fn() }));
vi.mock("@/db", () => ({
  db: {},
  accounts: {},
  journalDays: {},
  notes: {},
  folders: {},
  playbooks: {},
}));
vi.mock("@/server/auth", () => ({ passwordConfigured: () => false }));
const { generateWeeklyReview, loadWeeklyReview, weeklyPayload } =
  await import("../src/server/weekly-review");
const { POST } = await import("../src/app/api/ai/weekly-review/route");
const report = (note = "I waited for confirmation.") =>
  buildWeeklyReview(
    {
      trades: [],
      tradeNotes: [],
      accounts: [],
      journals: note ? [{ date: "2026-11-16", note }] : [],
      notebooks: [],
    },
    "2026-11-18",
    "UTC",
  );
beforeEach(() => {
  state.run.mockReset().mockResolvedValue("Evidence summary");
  state.timezone.mockReset().mockResolvedValue("UTC");
});
it("uses every evidence batch and the computed report for final guidance", async () => {
  const data = report("FIRST " + "x".repeat(50000) + " LAST LESSON");
  await generateWeeklyReview(data);
  expect(state.run).toHaveBeenCalledTimes(4);
  const prompts = state.run.mock.calls.map((c) => c[0] as string);
  expect(prompts[0]).toContain("FIRST");
  expect(prompts[2]).toContain("LAST LESSON");
  expect(prompts[3]).toContain('"closedTrades":0');
  expect(prompts[3]).toContain("Never combine different currencies");
  expect(prompts[3]).toContain("Evidence summary");
  expect(weeklyPayload(data).sources[0]).not.toHaveProperty("text");
});
it("generates notes-only reviews and rejects empty weeks without AI calls", async () => {
  await expect(generateWeeklyReview(report(""))).rejects.toThrow("No trades or notes");
  expect(state.run).not.toHaveBeenCalled();
  await generateWeeklyReview(report());
  expect(state.run).toHaveBeenCalledTimes(1);
  expect(state.run.mock.calls[0]![0]).toContain("I waited for confirmation");
});
it("stops on a failed batch instead of producing incomplete guidance", async () => {
  state.run.mockResolvedValueOnce("Batch one").mockRejectedValueOnce(new Error("Provider failed"));
  await expect(generateWeeklyReview(report("x".repeat(50000)))).rejects.toThrow("Provider failed");
  expect(state.run).toHaveBeenCalledTimes(2);
});
it("rejects impossible dates and changed timezones before loading data", async () => {
  await expect(loadWeeklyReview("2026-02-30")).rejects.toThrow("valid date");
  await expect(loadWeeklyReview("2026-11-16", "America/New_York")).rejects.toThrow(
    "timezone changed",
  );
});
it("rejects malformed or extra API fields", async () => {
  for (const body of [
    null,
    {},
    { date: "2026-11-16" },
    { date: "2026-11-16", timeZone: "UTC", accounts: "a" },
  ]) {
    const response = await POST(
      new Request("http://localhost/api/ai/weekly-review", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(400);
  }
  expect(state.run).not.toHaveBeenCalled();
});
