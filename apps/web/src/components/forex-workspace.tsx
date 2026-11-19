"use client";

import { useState } from "react";
import {
  DEFAULT_FOREX_WORKSPACE,
  FOREX_PAIRS,
  FOREX_TOOLS,
  forexWatchlist,
  parseForexWorkspace,
  type ForexWorkspace as Preferences,
} from "@/lib/forex-workspace";
import { postJson, useApi } from "@/lib/use-api";
import { ForexTool } from "./forex-tool";
import { TradingViewWidget } from "./tradingview-widget";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const URL = "/api/markets/forex-workspace";
export function ForexWorkspace() {
  const { data, error, refresh } = useApi<Preferences>(URL);
  if (error)
    return (
      <div role="alert" className="space-y-2">
        <p>Could not load the forex workspace: {error}</p>
        <Button variant="outline" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  if (!data) return <p role="status">Loading forex workspace…</p>;
  return <Workspace initial={data} />;
}
function Workspace({ initial }: { initial: Preferences }) {
  const [preferences, setPreferences] = useState(initial);
  const [draft, setDraft] = useState(initial.symbol);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const selected = FOREX_TOOLS.find((item) => item.id === preferences.tool)!;
  function change(next: Preferences) {
    setPreferences(next);
    setStatus("Unsaved changes");
    setError("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = parseForexWorkspace({ ...preferences, symbol: draft });
      const saved = await postJson<Preferences>(URL, next, "PUT");
      setPreferences(saved);
      setDraft(saved.symbol);
      setStatus("Workspace saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save workspace.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Forex desk</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose a pair and a tool. Presets work immediately; save your workspace to return to the
            same setup.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2" aria-label="Currency pair presets">
            {FOREX_PAIRS.map((symbol) => (
              <Button
                key={symbol}
                variant={preferences.symbol === symbol ? "secondary" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => {
                  setDraft(symbol);
                  change({ ...preferences, symbol });
                }}
              >
                {symbol.split(":")[1]}
              </Button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="min-w-48 flex-1 space-y-1 text-sm">
              TradingView pair
              <Input
                value={draft}
                disabled={busy}
                maxLength={100}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setStatus("Unsaved changes");
                }}
                placeholder="OANDA:EURUSD"
              />
            </label>
            <label className="min-w-48 flex-1 space-y-1 text-sm">
              Tool
              <select
                className="block w-full rounded-md border bg-background px-3 py-2"
                value={preferences.tool}
                disabled={busy}
                onChange={(event) =>
                  change({ ...preferences, tool: event.target.value as Preferences["tool"] })
                }
              >
                {[...new Set(FOREX_TOOLS.map((item) => item.group))].map((group) => (
                  <optgroup key={group} label={group}>
                    {FOREX_TOOLS.filter((item) => item.group === group).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : "Apply & save workspace"}
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              type="button"
              onClick={() => {
                setDraft(DEFAULT_FOREX_WORKSPACE.symbol);
                change(DEFAULT_FOREX_WORKSPACE);
              }}
            >
              Reset defaults
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.showTickerTape}
                disabled={busy}
                onChange={(event) =>
                  change({ ...preferences, showTickerTape: event.target.checked })
                }
              />
              Show currency ticker tape
            </label>
            <p role="status" className="text-xs text-muted-foreground">
              {status}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            The selected pair is {preferences.symbol}. For a different provider or broker suffix,
            enter its exchange-qualified ticker and apply. Cross-rate tables and screeners cover the
            broader forex market.
          </p>
        </CardContent>
      </Card>
      {preferences.showTickerTape && (
        <TradingViewWidget
          kind="ticker-tape"
          title="Major currency tickers"
          href="https://www.tradingview.com/markets/currencies/"
          height={95}
          options={{
            symbols: forexWatchlist(preferences.symbol).map((proName) => ({ proName })),
            showSymbolLogo: true,
            displayMode: "adaptive",
            isTransparent: false,
          }}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {selected.name} · {preferences.symbol}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{selected.description}</p>
        </CardHeader>
        <CardContent>
          <ForexTool tool={preferences.tool} symbol={preferences.symbol} />
        </CardContent>
      </Card>
    </div>
  );
}
