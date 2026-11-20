import { expect, it } from "vitest";
import {
  selectDayContext,
  type DayContextInput,
  type AiNoteContextOptions,
} from "../src/lib/ai-note-context";
import type { AnnotatedTrade } from "@luxalgo/journal-core";
const options: AiNoteContextOptions = {
  date: "2026-11-20",
  timeZone: "UTC",
  accountId: "a",
  trades: true,
  tradeNotes: true,
  journal: true,
  notebook: true,
  routines: true,
};
const trade = (
  key: string,
  accountId = "a",
  openedAt = "2026-11-20T09:00:00Z",
  closedAt: string | undefined = "2026-11-20T10:00:00Z",
): AnnotatedTrade => ({
  key,
  accountId,
  symbol: key,
  direction: "long",
  openedAt,
  closedAt,
  status: closedAt ? "win" : "open",
  quantity: 1,
  openQuantity: closedAt ? 0 : 1,
  avgEntry: 100,
  avgExit: closedAt ? 110 : undefined,
  grossPnl: 10,
  netPnl: 10,
  fees: 0,
  executionCount: 2,
  executionIds: [key],
  exits: [],
});
const fixture = (): DayContextInput => ({
  accounts: [
    { id: "a", name: "Account A", currency: "USD" },
    { id: "b", name: "Account B", currency: "EUR" },
  ],
  trades: [
    trade("today"),
    trade("other-account", "b"),
    trade("carried", "a", "2026-11-19T10:00:00Z", "2026-11-21T10:00:00Z"),
    trade("old", "a", "2026-11-18T10:00:00Z", "2026-11-19T10:00:00Z"),
  ],
  tradeNotes: [
    { key: "today", notes: "Today's note" },
    { key: "other-account", notes: "Excluded account note" },
    { key: "carried", notes: "Scaled today" },
    { key: "old", notes: "Old note" },
  ],
  fills: [
    {
      id: "carried",
      accountId: "a",
      symbol: "carried",
      side: "buy",
      quantity: 1,
      price: 100,
      fee: 1,
      executedAt: "2026-11-20T09:00:00Z",
    },
  ],
  journals: [
    { date: "2026-11-20", note: "Shared journal" },
    { date: "2026-11-19", note: "Wrong day" },
  ],
  notebooks: [
    {
      id: "shared",
      title: "Reflection",
      content: "Shared notebook",
      tradeKey: null,
      dayDate: null,
      createdAt: "2026-11-19T09:00:00Z",
      updatedAt: "2026-11-20T12:00:00Z",
    },
    {
      id: "other-account",
      title: "Other account",
      content: "Never include",
      tradeKey: "other-account",
      dayDate: null,
      createdAt: "2026-11-20T09:00:00Z",
      updatedAt: "2026-11-20T12:00:00Z",
    },
  ],
  routines: [{ id: "r", title: "Check plan", stage: "pre", date: "2026-11-20", done: true }],
});
it("scopes trades and linked notes by account and local day while including intraday scale-ins", () => {
  const sources = selectDayContext(fixture(), options);
  const ids = sources.map((s) => s.id);
  expect(ids).toContain("trade:carried");
  expect(ids).toContain("fills");
  expect(ids).not.toContain("trade:old");
  expect(ids).not.toContain("trade:other-account");
  expect(ids).not.toContain("notebook:other-account");
  const results = JSON.parse(sources.find((s) => s.id === "day-stats")!.content);
  expect(results[0].closedTrades).toBe(1);
  expect(results[0].netPnl).toBe(10);
  expect(sources.find((s) => s.id === "trade:carried")!.content).toContain(
    '"includedInDayResults": false',
  );
});
it("category switches omit deselected data and the current draft's saved copies", () => {
  const sources = selectDayContext(
    fixture(),
    { ...options, trades: false, routines: false, notebook: false },
    { tradeKey: "today", date: "2026-11-20" },
  );
  expect(sources.map((s) => s.id)).toEqual(["scope", "trade-note:carried"]);
  expect(
    sources.some((s) => s.content.includes("Today's note") || s.content.includes("Shared journal")),
  ).toBe(false);
});
it("only includes shared journal, notebook and routines when explicitly enabled", () => {
  const data = fixture();
  const selected = selectDayContext(data, options);
  expect(selected.map((s) => s.id)).toEqual(
    expect.arrayContaining(["journal:2026-11-20", "notebook:shared", "routines"]),
  );
  const off = selectDayContext(data, {
    ...options,
    journal: false,
    notebook: false,
    routines: false,
  });
  expect(
    off.some((s) => ["journal:2026-11-20", "notebook:shared", "routines"].includes(s.id)),
  ).toBe(false);
  expect(selectDayContext(data, options, { noteId: "shared" }).map((s) => s.id)).not.toContain(
    "notebook:shared",
  );
});
it("keeps currency totals separate for all accounts", () => {
  const sources = selectDayContext(fixture(), { ...options, accountId: "" });
  const stats = JSON.parse(sources.find((s) => s.id === "day-stats")!.content);
  expect(stats.map((m: { currency: string; netPnl: number }) => [m.currency, m.netPnl])).toEqual([
    ["EUR", 10],
    ["USD", 10],
  ]);
});
it("resolves fills and trade activity using local midnight instead of UTC dates", () => {
  const data = fixture();
  data.trades = [trade("boundary", "a", "2026-11-20T00:30:00Z", "2026-11-20T01:00:00Z")];
  data.fills = [];
  const sources = selectDayContext(data, { ...options, timeZone: "America/New_York" });
  expect(sources.map((s) => s.id)).not.toContain("trade:boundary");
  expect(selectDayContext(data, options).map((s) => s.id)).toContain("trade:boundary");
});
it("can include the linked trade outside the selected day but cannot cross the selected account", () => {
  expect(selectDayContext(fixture(), options, { tradeKey: "old" }).map((s) => s.id)).toContain(
    "trade:old",
  );
  expect(
    selectDayContext(fixture(), options, { tradeKey: "other-account" }).map((s) => s.id),
  ).not.toContain("trade:other-account");
});
it("preserves entire note content and produces deterministic source ordering", () => {
  const data = fixture();
  const text = "First " + "x".repeat(25000) + " Last";
  data.journals[0]!.note = text;
  const sources = selectDayContext(data, options);
  expect(sources.find((s) => s.id === "journal:2026-11-20")!.content).toBe(text);
  expect(
    selectDayContext(
      { ...data, trades: [...data.trades].reverse(), notebooks: [...data.notebooks].reverse() },
      options,
    ),
  ).toEqual(sources);
});
