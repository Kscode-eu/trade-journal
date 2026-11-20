import { expect, it } from "vitest";
import {
  buildWeeklyReview,
  weekOf,
  weeklyEvidenceBatches,
  type WeeklyInputs,
} from "../src/lib/weekly-review";
import type { AnnotatedTrade } from "@luxalgo/journal-core";
const trade = (
  key: string,
  accountId: string,
  closedAt: string | undefined,
  netPnl = 10,
): AnnotatedTrade => ({
  key,
  accountId,
  symbol: key,
  direction: "long",
  openedAt: "2026-11-10T10:00:00Z",
  closedAt,
  status: closedAt ? (netPnl > 0 ? "win" : "loss") : "open",
  quantity: 1,
  openQuantity: closedAt ? 0 : 1,
  avgEntry: 100,
  avgExit: closedAt ? 100 + netPnl : undefined,
  grossPnl: netPnl,
  netPnl,
  fees: 0,
  executionCount: 2,
  executionIds: [],
  exits: [],
});
const input = (): WeeklyInputs => ({
  trades: [
    trade("carry", "a", "2026-11-16T12:00:00Z", 10),
    trade("eur", "b", "2026-11-17T12:00:00Z", -20),
    trade("old", "a", "2026-11-15T12:00:00Z"),
    trade("open", "a", undefined, 999),
    trade("next", "a", "2026-11-23T12:00:00Z", 500),
  ],
  accounts: [
    { id: "a", name: "USD account", currency: "USD" },
    { id: "b", name: "EUR account", currency: "EUR" },
  ],
  tradeNotes: ["carry", "eur", "old", "open", "next"].map((key) => ({ key, notes: `Note ${key}` })),
  journals: [
    { date: "2026-11-16", note: "Monday note" },
    { date: "2026-11-22", note: "Sunday note" },
    { date: "2026-11-23", note: "Excluded" },
  ],
  notebooks: [],
});
it("normalizes weeks across years and leap days", () => {
  expect(weekOf("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  expect(weekOf("2024-02-29")).toEqual({ start: "2024-02-26", end: "2024-03-03" });
});
it("uses closing dates, keeps carried-trade notes and never sums currencies", () => {
  const report = buildWeeklyReview(input(), "2026-11-18", "UTC");
  expect(report.closedTrades).toBe(2);
  expect(report.groups.map((g) => [g.currency, g.metrics.netPnl])).toEqual([
    ["EUR", -20],
    ["USD", 10],
  ]);
  expect(report.groups[1]!.daily).toHaveLength(7);
  expect(report.groups[1]!.daily.at(-1)!.cumNetPnl).toBe(10);
  expect(report.sources.map((s) => s.id)).toContain("trade:open");
  expect(report.sources.map((s) => s.id)).not.toContain("trade:old");
  expect(report.journalNoteCount).toBe(2);
  expect(report.tradeFacts.find((t) => t.key === "next")!.includedInWeeklyResults).toBe(false);
});
it("uses the journal timezone at midnight, including a DST week", () => {
  const data = input();
  data.trades = [trade("boundary", "a", "2026-11-16T00:30:00Z")];
  expect(buildWeeklyReview(data, "2026-11-18", "UTC").closedTrades).toBe(1);
  expect(buildWeeklyReview(data, "2026-11-18", "America/New_York").closedTrades).toBe(0);
  data.trades = [
    { ...trade("dst", "a", "2026-11-02T04:30:00Z"), openedAt: "2026-10-30T12:00:00Z" },
  ];
  expect(buildWeeklyReview(data, "2026-11-01", "America/New_York").closedTrades).toBe(1);
});
it("includes linked notebook notes and unlinked notes created or updated in the week once", () => {
  const data = input();
  const note = {
    id: "linked",
    title: "Notebook",
    content: "Evidence",
    tradeKey: "carry",
    dayDate: null,
    createdAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-01T12:00:00Z",
  };
  data.notebooks = [
    note,
    { ...note, id: "updated", tradeKey: null, updatedAt: "2026-11-18T12:00:00Z" },
    { ...note, id: "day", tradeKey: null, dayDate: "2026-11-22" },
    { ...note, id: "outside", tradeKey: "old" },
  ];
  const report = buildWeeklyReview(data, "2026-11-18", "UTC");
  expect(report.notebookNoteCount).toBe(3);
  expect(report.sources.map((s) => s.id)).not.toContain("notebook:outside");
});
it("supports notes-only weeks and preserves the end of long evidence with source labels", () => {
  const data = input();
  data.trades = [];
  data.journals = [{ date: "2026-11-16", note: "START" + "x".repeat(50000) + "FINAL LESSON" }];
  const report = buildWeeklyReview(data, "2026-11-18", "UTC");
  expect(report.closedTrades).toBe(0);
  expect(report.groups).toEqual([]);
  const batches = weeklyEvidenceBatches(report);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.every((b) => b.length <= 24000 && b.includes("/journal/2026-11-16"))).toBe(true);
  expect(batches.join("")).toContain("FINAL LESSON");
});
