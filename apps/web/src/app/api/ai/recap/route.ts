import { createHash } from "node:crypto";
import { AI_REFLECTION_SYSTEM } from "@/lib/ai-instructions";
import { getAiModel, getAiProvider } from "@/server/settings";
import { eq } from "drizzle-orm";
import { computeMetrics, dayKeyOf } from "@luxalgo/journal-core";
import { db, journalDays } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { runAi } from "@/server/ai";
import { queryTrades } from "@/server/trades-query";
import { accountContext, readAiRequest } from "@/server/ai-scope";

/** Generate a session recap for one trading day from the day's actual trades. */
export const POST = handler(async (request: Request) => {
  const raw = await request.json();
  requireValue(raw && typeof raw === "object" && !Array.isArray(raw), "Invalid AI request");
  const { preview: inspect, fingerprint, ...body } = raw;
  requireValue(inspect === undefined || typeof inspect === "boolean", "Invalid preview option");
  const scope = await readAiRequest(body, "date");
  const { timeZone, filters } = scope;
  const date = scope.date!;

  const { trades } = await queryTrades(filters);
  const dayTrades = trades.filter(
    (trade) => trade.closedAt && dayKeyOf(trade.closedAt, timeZone) === date,
  );
  if (dayTrades.length === 0)
    return bad("No closed trades match this day and the selected filters");

  const metrics = computeMetrics(dayTrades, { timeZone });
  // Day notes are shared across accounts and cannot be attributed to a filtered subset.
  const onlyDateFilters = Object.keys(filters).every((key) => key === "from" || key === "to");
  const existingNote = onlyDateFilters
    ? (await db.select().from(journalDays).where(eq(journalDays.date, date)))[0]?.note
    : undefined;

  const tradeLines = dayTrades
    .map(
      (trade) =>
        `${JSON.stringify(scope.accounts.find((a) => a.id === trade.accountId)?.name)} | ${trade.symbol} ${trade.direction} qty ${trade.quantity} | entry ${trade.avgEntry} → exit ${trade.avgExit} | net ${trade.netPnl.toFixed(2)} | held ${Math.round((trade.durationMs ?? 0) / 60_000)}m` +
        (trade.annotations?.tags?.length ? ` | tags: ${trade.annotations.tags.join(", ")}` : "") +
        (trade.annotations?.mistakes?.length
          ? ` | mistakes: ${trade.annotations.mistakes.join(", ")}`
          : ""),
    )
    .join("\n");

  const prompt = `Write a session recap for ${date} in first person ("I"), 120-200 words, markdown with a
short "**Keep**" and "**Fix**" list at the end.

${scope.context}
${accountContext(dayTrades, scope)}

Day stats: net P&L ${metrics.netPnl.toFixed(2)}, ${metrics.closedTrades} trades,
win rate ${metrics.winRate === null ? "n/a" : (metrics.winRate * 100).toFixed(0)}%,
fees ${metrics.fees.toFixed(2)}.

Trades:
${tradeLines}

${existingNote ? `The trader's own note so far (respect it, build on it):\n${existingNote}` : ""}`;
  const sources = [
    { id: "scope", label: "Selected accounts, filters and timezone", content: scope.context },
    {
      id: "trades",
      label: `${dayTrades.length} closed trades and recorded annotations`,
      content: tradeLines,
    },
    ...(existingNote
      ? [
          {
            id: "journal",
            label: `Saved shared daily journal · ${date}`,
            href: `/journal/${date}`,
            content: existingNote,
          },
        ]
      : []),
  ];
  const content = {
    provider: await getAiProvider(),
    model: "",
    system: AI_REFLECTION_SYSTEM,
    prompt,
    sources,
  };
  content.model = await getAiModel(content.provider);
  const input = {
    ...content,
    fingerprint: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
  };
  if (inspect) return ok(input);
  if (fingerprint !== undefined)
    requireValue(
      fingerprint === input.fingerprint,
      "The recap data or AI settings changed. Preview AI data again.",
    );
  const recap = await runAi(prompt);

  return ok({ recap, scope: scope.scope, input });
});
