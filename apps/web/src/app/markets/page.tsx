"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ForexWorkspace } from "@/components/forex-workspace";
import { EconomicMap } from "@/components/economic-map";
import { EconomicCalendar } from "@/components/economic-calendar";
import { TradingViewWidget } from "@/components/tradingview-widget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MarketsPage() {
  return (
    <Suspense fallback={<p className="p-4">Loading market tools…</p>}>
      <Markets />
    </Suspense>
  );
}

function Markets() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("view");
  const view = ["calendar", "news", "heatmaps", "economics"].includes(requested ?? "")
    ? requested!
    : "forex";
  const [heatmap, setHeatmap] = useState("forex");
  return (
    <div>
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h1 className="mr-auto text-base font-semibold">Markets</h1>
        <Link className="text-sm underline underline-offset-4" href="/journal">
          Open daily journal
        </Link>
      </header>
      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Prepare for your next session</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Check economic releases, scan headlines and compare market strength. Record the events
            and themes that matter in your daily journal.
          </p>
        </div>
        <Tabs
          value={view}
          onValueChange={(next) => router.replace(`/markets?view=${next}`, { scroll: false })}
        >
          <TabsList aria-label="Market tools">
            <TabsTrigger value="forex">Forex desk</TabsTrigger>
            <TabsTrigger value="economics">Economics</TabsTrigger>
            <TabsTrigger value="calendar">Economic calendar</TabsTrigger>
            <TabsTrigger value="news">Market news</TabsTrigger>
            <TabsTrigger value="heatmaps">Heatmaps</TabsTrigger>
          </TabsList>
          <TabsContent value="forex">{view === "forex" && <ForexWorkspace />}</TabsContent>
          <TabsContent value="economics">{view === "economics" && <EconomicMap />}</TabsContent>
          <TabsContent value="calendar">
            <Card>
              <CardHeader>
                <CardTitle>Economic events</CardTitle>
                <p className="text-sm text-muted-foreground">
                  US economic releases, filtered to high importance by default. Turn off the toggle
                  to include all importance levels. Check the calendar’s displayed time zone before
                  planning a session.
                </p>
              </CardHeader>
              <CardContent>{view === "calendar" && <EconomicCalendar />}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="news">
            <Card>
              <CardHeader>
                <CardTitle>Latest market headlines</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Scan broad market coverage. Open a trade’s symbol news panel for headlines tied to
                  its mapped ticker.
                </p>
              </CardHeader>
              <CardContent>
                {view === "news" && (
                  <TradingViewWidget
                    kind="timeline"
                    title="Market news"
                    href="https://www.tradingview.com/news/"
                    height={650}
                    options={{
                      feedMode: "all_symbols",
                      displayMode: "regular",
                      isTransparent: false,
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="heatmaps">
            <Card>
              <CardHeader>
                <CardTitle>Market strength</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Compare stock sectors or major currency pairs before reviewing your setups.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  Market
                  <select
                    className="rounded-md border bg-background px-3 py-2"
                    value={heatmap}
                    onChange={(event) => setHeatmap(event.target.value)}
                  >
                    <option value="stocks">Stocks · S&amp;P 500</option>
                    <option value="forex">Forex · major currencies</option>
                  </select>
                </label>
                {view === "heatmaps" &&
                  (heatmap === "stocks" ? (
                    <TradingViewWidget
                      kind="stock-heatmap"
                      title="Stock heatmap"
                      href="https://www.tradingview.com/heatmap/stock/"
                      height={650}
                      options={{
                        dataSource: "SPX500",
                        blockSize: "market_cap_basic",
                        blockColor: "change",
                        grouping: "sector",
                        exchanges: [],
                        hasTopBar: true,
                        isDataSetEnabled: true,
                        isZoomEnabled: true,
                        hasSymbolTooltip: true,
                      }}
                    />
                  ) : (
                    <TradingViewWidget
                      kind="forex-heat-map"
                      title="Forex heatmap"
                      href="https://www.tradingview.com/markets/currencies/"
                      height={500}
                      options={{
                        currencies: ["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"],
                        isTransparent: false,
                      }}
                    />
                  ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <p className="max-w-3xl text-xs text-muted-foreground">
          Current market context from TradingView. Journal account and date filters do not apply
          here. Coverage and delays vary by market; widgets do not save historical snapshots to your
          journal.
        </p>
      </div>
    </div>
  );
}
