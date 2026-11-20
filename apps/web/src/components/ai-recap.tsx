"use client";

import { useState } from "react";
import { AiDataPreview } from "./ai-data-preview";
import type { AiNotePreview } from "@/lib/ai-note-context";
import { Sparkles } from "lucide-react";
import type { AnalysisFilters } from "@luxalgo/journal-core";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";
import { postJson } from "@/lib/use-api";
import { useAiRequest, type AiScope } from "@/lib/use-ai-request";

/** The parent keys this component by date, filters and timezone. */
export function AiRecap({
  date,
  filters,
  timeZone,
  disabled,
  onRecap,
}: {
  date: string;
  filters: AnalysisFilters;
  timeZone: string;
  disabled: boolean;
  onRecap: (result: { recap: string; scope: AiScope }) => void;
}) {
  const [input, setInput] = useState<AiNotePreview | null>(null);
  const [sent, setSent] = useState(false);
  const { run, busy, error, dismiss } = useAiRequest();
  const generate = () =>
    run(
      () =>
        postJson<{ recap: string; scope: AiScope; input?: AiNotePreview }>("/api/ai/recap", {
          date,
          filters,
          timeZone,
          ...(input ? { fingerprint: input.fingerprint } : {}),
        }),
      (result) => {
        setInput(result.input ?? null);
        setSent(true);
        onRecap(result);
      },
    );
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void generate()}
        disabled={busy || disabled}
      >
        <Sparkles />
        {busy ? "Writing…" : "AI recap"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy || disabled}
        onClick={() =>
          void run(
            () =>
              postJson<AiNotePreview>("/api/ai/recap", { date, filters, timeZone, preview: true }),
            (result) => {
              setInput(result);
              setSent(false);
            },
          )
        }
      >
        Preview recap data
      </Button>
      {input && (
        <AiDataPreview
          input={input}
          sent={sent}
          description="The selected day's closed trades, calculated results, and the saved day note when all accounts and trades are included. Unsaved text and attachments are not sent."
        />
      )}
      {error && <AiNotice error={error} onRetry={() => void generate()} onDismiss={dismiss} />}
    </div>
  );
}
