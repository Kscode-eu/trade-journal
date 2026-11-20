import { computeMetrics, dayKeyOf, type AnnotatedTrade } from "@luxalgo/journal-core";

export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function weekOf(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const start = shiftDay(day, -((weekday + 6) % 7));
  return { start, end: shiftDay(start, 6) };
}
export interface WeeklySource {
  id: string;
  kind: "trade" | "journal" | "notebook";
  title: string;
  href: string;
  text: string;
}
export interface WeeklyInputs {
  trades: AnnotatedTrade[];
  tradeNotes: { key: string; notes: string | null }[];
  accounts: { id: string; name: string; currency: string }[];
  journals: { date: string; note: string }[];
  notebooks: {
    id: string;
    title: string;
    content: string;
    tradeKey: string | null;
    dayDate: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
}

/** Use closing dates for results; include notes on trades held during the week. */
export function buildWeeklyReview(input: WeeklyInputs, day: string, timeZone: string) {
  const { start, end } = weekOf(day);
  const inWeek = (date: string) => date >= start && date <= end;
  const relevant = input.trades.filter(
    (t) =>
      dayKeyOf(t.openedAt, timeZone) <= end &&
      (!t.closedAt || dayKeyOf(t.closedAt, timeZone) >= start),
  );
  const closed = relevant.filter(
    (t) => t.status !== "open" && t.closedAt && inWeek(dayKeyOf(t.closedAt, timeZone)),
  );
  const notes = new Map(input.tradeNotes.map((row) => [row.key, row.notes]));
  const accountNames = new Map(input.accounts.map((a) => [a.id, a.name]));
  const keys = new Set(relevant.map((t) => t.key));
  const sources: WeeklySource[] = relevant
    .filter((t) => notes.get(t.key)?.trim())
    .map((t) => ({
      id: `trade:${t.key}`,
      kind: "trade",
      title: `${t.symbol} · ${accountNames.get(t.accountId) ?? t.accountId}`,
      href: `/trades/${encodeURIComponent(t.key)}`,
      text: notes.get(t.key)!,
    }));
  sources.push(
    ...input.journals
      .filter((j) => inWeek(j.date) && j.note.trim())
      .map((j) => ({
        id: `journal:${j.date}`,
        kind: "journal" as const,
        title: j.date,
        href: `/journal/${j.date}`,
        text: j.note,
      })),
  );
  sources.push(
    ...input.notebooks
      .filter(
        (n) =>
          n.content.trim() &&
          ((n.tradeKey && keys.has(n.tradeKey)) ||
            (n.dayDate && inWeek(n.dayDate)) ||
            (!n.tradeKey &&
              !n.dayDate &&
              (inWeek(dayKeyOf(n.createdAt, timeZone)) ||
                inWeek(dayKeyOf(n.updatedAt, timeZone))))),
      )
      .map((n) => ({
        id: `notebook:${n.id}`,
        kind: "notebook" as const,
        title: n.title || "Untitled note",
        href: `/notebook?note=${encodeURIComponent(n.id)}`,
        text: n.content,
      })),
  );
  sources.sort((a, b) => a.id.localeCompare(b.id));
  const currencies = [
    ...new Set(
      closed.map((t) => input.accounts.find((a) => a.id === t.accountId)?.currency ?? "Unknown"),
    ),
  ].sort();
  const groups = currencies.map((currency) => {
    const trades = closed.filter(
      (t) => (input.accounts.find((a) => a.id === t.accountId)?.currency ?? "Unknown") === currency,
    );
    let cumulative = 0;
    const daily = Array.from({ length: 7 }, (_, i) => {
      const date = shiftDay(start, i);
      const dayTrades = trades.filter((t) => dayKeyOf(t.closedAt!, timeZone) === date);
      const netPnl = dayTrades.reduce((sum, t) => sum + t.netPnl, 0);
      cumulative += netPnl;
      return { date, netPnl, trades: dayTrades.length, cumNetPnl: cumulative };
    });
    return { currency, metrics: computeMetrics(trades, { timeZone }), daily };
  });
  return {
    start,
    end,
    timeZone,
    closedTrades: closed.length,
    relevantTrades: relevant.length,
    tradeNoteCount: sources.filter((s) => s.kind === "trade").length,
    journalNoteCount: sources.filter((s) => s.kind === "journal").length,
    notebookNoteCount: sources.filter((s) => s.kind === "notebook").length,
    groups,
    sources,
    tradeFacts: relevant.map((t) => ({
      key: t.key,
      href: `/trades/${encodeURIComponent(t.key)}`,
      account: accountNames.get(t.accountId),
      currency: input.accounts.find((a) => a.id === t.accountId)?.currency ?? "Unknown",
      symbol: t.symbol,
      direction: t.direction,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      status: t.status,
      includedInWeeklyResults: closed.includes(t),
      netPnl: t.status === "open" ? null : t.netPnl,
      annotations: t.annotations,
    })),
  };
}
export type WeeklyReviewData = ReturnType<typeof buildWeeklyReview>;
export type WeeklyReviewPayload = Omit<WeeklyReviewData, "sources" | "tradeFacts"> & {
  sources: Omit<WeeklySource, "text">[];
};
export interface WeeklyReviewResult {
  report: WeeklyReviewPayload;
  summary: string;
  generatedAt: string;
}

/** Keep all source text; split large weeks into labeled batches rather than truncating. */
export function weeklyEvidenceBatches(report: WeeklyReviewData, limit = 24000): string[] {
  const items = [
    ...report.tradeFacts.map((t) => ({ header: `Trade ${t.href}`, text: JSON.stringify(t) })),
    ...report.sources.map((s) => ({
      header: `Source ${s.id} ${s.href}`,
      text: `${s.title}\n${s.text}`,
    })),
  ];
  const batches: string[] = [];
  let current = "";
  for (const item of items) {
    const size = Math.max(1, limit - item.header.length - 32);
    for (let offset = 0; offset < item.text.length; offset += size) {
      const part = `${item.header}${offset ? " (continued)" : ""}\n${item.text.slice(offset, offset + size)}`;
      if (current && current.length + part.length + 2 > limit) {
        batches.push(current);
        current = "";
      }
      current += (current ? "\n\n" : "") + part;
    }
  }
  if (current) batches.push(current);
  return batches;
}
