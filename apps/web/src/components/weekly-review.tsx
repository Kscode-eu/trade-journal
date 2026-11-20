"use client";
import { dayKeyOf } from "@luxalgo/journal-core";
import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { postJson } from "@/lib/use-api";
import { useAiRequest } from "@/lib/use-ai-request";
import { shiftDay, type WeeklyReviewPayload, type WeeklyReviewResult } from "@/lib/weekly-review";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DailyBars } from "@/components/charts/daily-bars";
import { EquityArea } from "@/components/charts/equity-area";
import { Markdown } from "@/components/rich-editor";
import { Pnl } from "@/components/pnl";
import { usePrivacy } from "@/components/privacy";
import { fmtPercent } from "@/lib/utils";

export function WeeklyReview({ initial }: { initial: WeeklyReviewPayload }) {
  const [result, setResult] = useState<WeeklyReviewResult | null>(null);
  const { run, busy, error } = useAiRequest();
  const privateMode = usePrivacy();
  const report = result?.report ?? initial;
  const today = dayKeyOf(new Date().toISOString(), report.timeZone);
  const partial = report.start <= today && report.end >= today;
  const empty = report.relevantTrades === 0 && report.sources.length === 0;
  const generate = () =>
    void run(
      () =>
        postJson<WeeklyReviewResult>("/api/ai/weekly-review", {
          date: report.start,
          timeZone: report.timeZone,
        }),
      setResult,
    );
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 p-4 text-sm">
        <p className="font-medium">
          {report.start} – {report.end} · All accounts · {report.timeZone}
          {partial ? " · Week in progress" : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Monday–Sunday. Performance uses trades closed this week. Notes include trades held during
          the week, daily journals, and notebook entries linked to the week or created/updated
          during it. Global dashboard filters do not apply here. Notes use their current saved text.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Closed trades", report.closedTrades],
          ["Trade notes", report.tradeNoteCount],
          ["Daily journal notes", report.journalNoteCount],
          ["Notebook notes", report.notebookNoteCount],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle>{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
      {report.groups.map((group) => (
        <section
          key={group.currency}
          className="space-y-3"
          aria-label={`${group.currency} performance`}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <h2 className="font-semibold">Performance · {group.currency}</h2>
            <span>
              Net <Pnl value={group.metrics.netPnl} currency={group.currency} />
            </span>
            <span>{group.metrics.closedTrades} closed trades</span>
            <span>{fmtPercent(group.metrics.winRate, 1)} win rate</span>
            <span>
              {group.metrics.wins} wins / {group.metrics.losses} losses / {group.metrics.breakevens}{" "}
              breakeven
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily net P&amp;L · {group.currency}</CardTitle>
              </CardHeader>
              <CardContent>
                <DailyBars data={group.daily} currency={group.currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cumulative net P&amp;L · {group.currency}</CardTitle>
              </CardHeader>
              <CardContent>
                <EquityArea
                  data={[
                    { t: shiftDay(report.start, -1), cumNetPnl: 0 },
                    ...group.daily.map((d) => ({ t: d.date, cumNetPnl: d.cumNetPnl })),
                  ]}
                  currency={group.currency}
                  curve="stepAfter"
                />
              </CardContent>
            </Card>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">View chart data</summary>
            <div className="mt-2 overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Closed trades</th>
                    <th>Net P&amp;L</th>
                    <th>Cumulative P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {group.daily.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{d.trades}</td>
                      <td>
                        <Pnl value={d.netPnl} currency={group.currency} />
                      </td>
                      <td>
                        <Pnl value={d.cumNetPnl} currency={group.currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ))}
      {!report.groups.length && (
        <p className="text-sm text-muted-foreground">
          No trades closed this week.{" "}
          {empty
            ? "Choose another week or add journal notes to begin."
            : "You can still review your notes and open-trade context."}
        </p>
      )}
      {report.groups.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Currencies are shown separately, without conversion or a combined monetary total.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>AI summary and guidance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a review from all the sources above using your configured AI provider. Larger
            weeks may need several requests. Charts are calculated directly from recorded trades.{" "}
            <Link href="/settings#ai-settings" className="underline">
              AI settings
            </Link>
          </p>
          <Button disabled={busy || empty} onClick={generate}>
            <Sparkles />
            {busy
              ? "Reviewing your week…"
              : result
                ? "Regenerate weekly review"
                : "Generate weekly review"}
          </Button>
          {busy && (
            <p role="status" className="text-xs text-muted-foreground">
              Reading trade results and notes. You can switch weeks; this result will stay with its
              original week.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {result && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Generated {new Date(result.generatedAt).toLocaleString()} · Snapshot of saved data
                at generation time. Regenerate after editing notes or importing trades. This review
                is kept for this page visit.
              </p>
              {privateMode ? (
                <p className="text-sm text-muted-foreground">
                  Turn off privacy mode to read the AI review, which may contain financial amounts.
                </p>
              ) : (
                <Markdown>{result.summary}</Markdown>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {!!report.sources.length && (
        <Card>
          <CardHeader>
            <CardTitle>Notes included · {report.sources.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm">View source notes</summary>
              <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
                {report.sources.map((source) => (
                  <li key={source.id}>
                    <Link className="underline underline-offset-4" href={source.href}>
                      {source.title}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{source.kind}</span>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
