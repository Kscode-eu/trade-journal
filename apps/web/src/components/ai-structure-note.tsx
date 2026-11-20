"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { MAX_AI_NOTE_LENGTH } from "@/lib/ai-note";
import { postJson, useApi } from "@/lib/use-api";
import { useAiRequest } from "@/lib/use-ai-request";
import type {
  AiNoteAnchor,
  AiNoteContextDefaults,
  AiNoteContextOptions,
  AiNotePreview,
} from "@/lib/ai-note-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Markdown } from "./rich-editor";
import { AiDataPreview } from "./ai-data-preview";

const CATEGORIES = [
  ["trades", "Trade results, annotations and executions"],
  ["tradeNotes", "Other trade notes"],
  ["journal", "Daily journal (shared across accounts)"],
  ["notebook", "Related notebook notes (can include shared notes)"],
  ["routines", "Routine checks (shared across accounts)"],
] as const;

export function AiStructureNote({
  value,
  onChange,
  anchor = {},
}: {
  value: string;
  onChange(value: string): void;
  anchor?: AiNoteAnchor;
}) {
  const request = useAiRequest();
  const [open, setOpen] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const [options, setOptions] = useState<Partial<AiNoteContextOptions>>({});
  const params = new URLSearchParams(Object.entries(anchor));
  const {
    data: defaults,
    error: contextError,
    loading,
    refresh,
  } = useApi<AiNoteContextDefaults>(open ? `/api/ai/note-context?${params}` : null);
  const context: AiNoteContextOptions | null =
    includeContext && defaults
      ? {
          date: defaults.date,
          timeZone: defaults.timeZone,
          accountId: defaults.accountId,
          trades: true,
          tradeNotes: true,
          journal: true,
          notebook: false,
          routines: false,
          ...options,
        }
      : null;
  const body = { text: value, anchor, context };
  const signature = JSON.stringify(body);
  const latestSignature = useRef(signature);
  latestSignature.current = signature;
  const [phase, setPhase] = useState("preview");
  const [preview, setPreview] = useState<{ signature: string; input: AiNotePreview } | null>(null);
  const [draft, setDraft] = useState<{
    source: string;
    signature: string;
    markdown: string;
    input: AiNotePreview;
  } | null>(null);
  const [undo, setUndo] = useState<{ source: string; markdown: string } | null>(null);
  const freshPreview = preview?.signature === signature;
  const stale = draft !== null && draft.signature !== signature;
  const unavailable =
    request.busy ||
    !value.trim() ||
    value.length > MAX_AI_NOTE_LENGTH ||
    (includeContext && (!defaults || loading || !!contextError));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(!open)}>
          Structure with AI
        </Button>
        {undo && undo.markdown === value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(undo.source);
              setUndo(null);
            }}
          >
            Undo AI formatting
          </Button>
        )}
      </div>
      {open && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Turn your note into structured Markdown using your selected context.{" "}
            <Link href="/settings#ai-settings" className="underline">
              Edit prompt or configure AI in Settings
            </Link>
            .
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeContext}
              disabled={request.busy}
              onChange={(e) => setIncludeContext(e.target.checked)}
            />
            Include trading-day context
          </label>
          {includeContext && (
            <details className="rounded-md border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                Context settings
                {context && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {context.date} ·{" "}
                    {context.accountId
                      ? defaults?.accounts.find((a) => a.id === context.accountId)?.name
                      : "All accounts"}
                  </span>
                )}
                {contextError && (
                  <span className="ml-2 text-destructive">Couldn’t load options</span>
                )}
              </summary>
              <div className="space-y-3 border-t p-3">
                {loading && (
                  <p role="status" className="text-xs">
                    Loading context options…
                  </p>
                )}
                {contextError && (
                  <div role="alert" className="text-xs text-destructive">
                    {contextError}
                    <Button type="button" size="sm" variant="ghost" onClick={refresh}>
                      Reload context options
                    </Button>
                  </div>
                )}
                {defaults && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={request.busy || loading}
                    onClick={refresh}
                  >
                    Refresh context options
                  </Button>
                )}
                {context && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs">
                        Context date ({context.timeZone})
                        <Input
                          aria-label="AI context date"
                          type="date"
                          value={context.date}
                          disabled={request.busy}
                          onChange={(e) => setOptions((old) => ({ ...old, date: e.target.value }))}
                        />
                      </label>
                      <label className="space-y-1 text-xs">
                        Account
                        <select
                          aria-label="AI context account"
                          className="h-9 w-full rounded-md border bg-background px-2"
                          value={context.accountId}
                          disabled={request.busy}
                          onChange={(e) =>
                            setOptions((old) => ({ ...old, accountId: e.target.value }))
                          }
                        >
                          <option value="">All accounts</option>
                          {defaults?.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} · {a.currency}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="space-y-2">
                      {CATEGORIES.map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={context[key]}
                            disabled={request.busy}
                            onChange={(e) =>
                              setOptions((old) => ({ ...old, [key]: e.target.checked }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Includes trades opened, closed, or executed on this date
                      {anchor.tradeKey
                        ? ", plus this linked trade when its account is selected"
                        : ""}
                      . Notebook notes use links or their creation/update date. Shared notes and
                      routine checks may describe other accounts. The current draft replaces its
                      saved copy; attachments and credentials are never included.
                    </p>
                  </>
                )}
              </div>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={unavailable}
              onClick={() => {
                setPhase("preview");
                void request.run(
                  () =>
                    postJson<AiNotePreview>("/api/ai/structure-note", { ...body, preview: true }),
                  (input) => setPreview({ signature, input }),
                );
              }}
            >
              {request.busy && phase === "preview" ? "Loading AI data…" : "Preview AI data"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={unavailable || !freshPreview}
              onClick={() => {
                if (!preview || preview.signature !== signature) return;
                setPhase("generate");
                setDraft(null);
                void request.run(
                  () =>
                    postJson<{ markdown: string; input: AiNotePreview }>("/api/ai/structure-note", {
                      ...body,
                      fingerprint: preview.input.fingerprint,
                    }),
                  (result) => setDraft({ source: value, signature, ...result }),
                );
              }}
            >
              {request.busy && phase === "generate"
                ? "Structuring…"
                : draft
                  ? "Regenerate Markdown"
                  : "Generate Markdown"}
            </Button>
          </div>
          {!freshPreview && (
            <p className="text-xs text-muted-foreground">
              Preview AI data before generating
              {preview ? " again: your draft or context selection changed" : ""}.
            </p>
          )}
          {value.length > MAX_AI_NOTE_LENGTH && (
            <p role="alert" className="text-xs text-destructive">
              Shorten your note to 24,000 characters before generating.
            </p>
          )}
          {request.error && (
            <p role="alert" className="text-xs text-destructive">
              {request.error}
            </p>
          )}
          {freshPreview &&
            preview &&
            (!draft || preview.input.fingerprint !== draft.input.fingerprint) && (
              <AiDataPreview input={preview.input} />
            )}
          {draft && (
            <>
              <div
                aria-label="AI Markdown preview"
                className="max-h-96 overflow-auto rounded-md border p-3"
              >
                <Markdown>{draft.markdown}</Markdown>
              </div>
              {stale && (
                <p role="status" className="text-xs text-muted-foreground">
                  Your note or context changed. Preview the data and regenerate before applying.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={stale || request.busy}
                  onClick={() => {
                    if (latestSignature.current !== draft.signature) return;
                    setUndo(draft);
                    onChange(draft.markdown);
                    setDraft(null);
                    setOpen(false);
                  }}
                >
                  Use Markdown
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              </div>
              <AiDataPreview input={draft.input} sent />
            </>
          )}
        </div>
      )}
    </div>
  );
}
