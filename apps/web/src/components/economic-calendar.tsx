"use client";

import { useState } from "react";
import { postJson, useApi } from "@/lib/use-api";
import { TradingViewElement } from "./tradingview-element";
import { Button } from "./ui/button";

const SETTINGS_URL = "/api/markets/calendar-settings";

export function EconomicCalendar() {
  const { data, error, refresh } = useApi<{ highImportanceOnly: boolean }>(SETTINGS_URL);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const highImportanceOnly = saved ?? data?.highImportanceOnly ?? true;

  async function save(next: boolean) {
    setSaving(true);
    setSaveError("");
    try {
      const result = await postJson<{ highImportanceOnly: boolean }>(
        SETTINGS_URL,
        { highImportanceOnly: next },
        "PATCH",
      );
      setSaved(result.highImportanceOnly);
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Could not save the calendar preference.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (error)
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p>Could not load your calendar preference: {error}</p>
        <Button variant="outline" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading calendar preference…
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">United States</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={highImportanceOnly}
            disabled={saving}
            onChange={(event) => void save(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          High importance only
        </label>
        <span role="status" className="text-xs text-muted-foreground">
          {saving ? "Saving…" : saved !== null ? "Saved" : "Preference saved in your journal"}
        </span>
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError} Your previous preference is still selected. Toggle again to retry.
        </p>
      )}
      <CalendarWidget highImportanceOnly={highImportanceOnly} />
    </div>
  );
}

function CalendarWidget({ highImportanceOnly }: { highImportanceOnly: boolean }) {
  return (
    <TradingViewElement
      kind="calendar"
      title="US economic calendar"
      href="https://www.tradingview.com/economic-calendar/"
      height={650}
      attributes={{ countries: "us", "high-importance-only": highImportanceOnly }}
    />
  );
}
