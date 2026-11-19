"use client";
import { useState } from "react";
import { TradingViewElement } from "./tradingview-element";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
export function EconomicMap() {
  const [metric, setMetric] = useState("intr");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Economic map</CardTitle>
        <p className="text-sm text-muted-foreground">
          Compare the economic backdrop behind currencies. Start with interest rates, then explore
          inflation, GDP, unemployment and government debt.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Economic indicator
          <select
            className="rounded-md border bg-background px-3 py-2"
            value={metric}
            onChange={(event) => setMetric(event.target.value)}
          >
            <option value="intr">Interest rate</option>
            <option value="iryy">Inflation rate</option>
            <option value="gdp">GDP</option>
            <option value="ur">Unemployment rate</option>
            <option value="gdg">Government debt / GDP</option>
          </select>
        </label>
        <TradingViewElement
          kind="economics"
          attributes={{ metric, "hide-selection": true, region: "global" }}
          title="World economics"
          href="https://www.tradingview.com/markets/world-economy/charts-global-trends/"
          height={620}
        />
      </CardContent>
    </Card>
  );
}
