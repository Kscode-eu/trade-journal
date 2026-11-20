"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { AdherenceReport } from "@/components/adherence-report";
import { Attachments } from "@/components/attachments";
import { FilterBar } from "@/components/filter-bar";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor";
import { ReviewExport } from "@/components/review-export";
import { VoiceNote } from "@/components/voice-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { postJson, useApi } from "@/lib/use-api";
import { useAutosave } from "@/lib/use-autosave";
import { tradeLinkLabel, tradePath, type LinkableTrade } from "@/lib/trade-links";
import { cn } from "@/lib/utils";

interface Playbook {
  id: string;
  name: string;
  description: string;
  rules: string[];
  tradeCount: number;
}

export default function PlaybooksPage() {
  return (
    <Suspense>
      <Playbooks />
    </Suspense>
  );
}

function Playbooks() {
  const linkedId = useSearchParams()?.get("playbook");
  const { data, error, refresh } = useApi<{ playbooks: Playbook[] }>("/api/playbooks");
  const [selectedId, setSelectedId] = useState<string | null>(linkedId ?? null);
  const [failure, setFailure] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (linkedId) setSelectedId(linkedId);
  }, [linkedId]);
  const selected = data?.playbooks.find((book) => book.id === selectedId) ?? data?.playbooks[0];
  const create = async () => {
    setCreating(true);
    setFailure("");
    try {
      const result = await postJson<{ id: string }>("/api/playbooks", {
        name: "Untitled playbook",
      });
      setSelectedId(result.id);
      refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not create playbook");
    } finally {
      setCreating(false);
    }
  };
  return (
    <div>
      <FilterBar
        title="Playbooks"
        actions={
          <Button size="sm" disabled={creating} onClick={() => void create()}>
            <Plus />
            {creating ? "Creating…" : "New playbook"}
          </Button>
        }
      />
      {(failure || error) && (
        <p role="alert" className="p-4 text-sm text-destructive">
          {failure || error}
        </p>
      )}
      <div className="grid gap-4 p-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Playbooks" className="space-y-1">
          {data?.playbooks.map((book) => (
            <button
              key={book.id}
              onClick={() => setSelectedId(book.id)}
              aria-current={selected?.id === book.id ? "page" : undefined}
              className={cn(
                "block w-full rounded-md border p-3 text-left hover:bg-accent/40",
                selected?.id === book.id && "bg-accent",
              )}
            >
              <span className="block truncate text-sm font-medium">{book.name}</span>
              <span className="text-xs text-muted-foreground">{book.tradeCount} linked trades</span>
            </button>
          ))}
          {data?.playbooks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Create a playbook, or open a notebook note and choose Create playbook.
            </p>
          )}
        </nav>
        {selected && <PlaybookEditor key={selected.id} book={selected} onChanged={refresh} />}
      </div>
    </div>
  );
}

function PlaybookEditor({ book, onChanged }: { book: Playbook; onChanged: () => void }) {
  const [name, setName] = useState(book.name);
  const [description, setDescription] = useState(book.description);
  const [rules, setRules] = useState(book.rules.join("\n"));
  const [failure, setFailure] = useState("");
  const editor = useRef<RichEditorHandle>(null);
  const { save, status, flush } = useAutosave(`/api/playbooks/${book.id}`, "PATCH", onChanged);
  const changeContent = (value: string) => {
    setDescription(value);
    save({ description: value });
  };
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Playbook name"
            className="min-w-0 flex-1 text-lg font-semibold"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) save({ name: event.target.value });
            }}
          />
          <VoiceNote
            onPrepare={() => editor.current?.focus()}
            onText={(text) => changeContent(description ? `${description} ${text}` : text)}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete playbook"
            onClick={async () => {
              if (
                !confirm(
                  `Delete "${name}" and its attachments? Trades keep their data but lose the link.`,
                )
              )
                return;
              try {
                await flush();
                await postJson(`/api/playbooks/${book.id}`, undefined, "DELETE");
                onChanged();
              } catch (error) {
                setFailure(error instanceof Error ? error.message : "Delete failed");
              }
            }}
          >
            <Trash2 />
          </Button>
        </div>
        {!name.trim() && (
          <p role="alert" className="text-sm text-destructive">
            Enter a name to save the title.
          </p>
        )}
        <RichEditor
          editorRef={editor}
          value={description}
          onChange={changeContent}
          placeholder="Describe your setup, market context, entries, exits, risk management and examples…"
        />
        <div className="space-y-1">
          <label htmlFor="playbook-rules" className="text-sm font-medium">
            Trade checklist · one rule per line
          </label>
          <p className="text-xs text-muted-foreground">
            These rules appear on linked trades for adherence tracking.
          </p>
          <Textarea
            id="playbook-rules"
            value={rules}
            className="min-h-32"
            onChange={(event) => {
              setRules(event.target.value);
              save({
                rules: event.target.value
                  .split("\n")
                  .map((rule) => rule.trim())
                  .filter(Boolean),
              });
            }}
            placeholder={"Confirm the setup\nDefine entry and invalidation\nCheck risk limit"}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span role="status">{status}</span>
          <Button variant="ghost" size="sm" onClick={() => void flush()}>
            Save now
          </Button>
        </div>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        <ReviewExport
          document={{ title: name, lines: [description, "", "## Trade checklist", rules] }}
        />
        <Attachments type="playbook" id={book.id} />
        <LinkedTrades id={book.id} onChanged={onChanged} />
        <AdherenceReport key={`${book.tradeCount}:${book.rules.join("|")}`} bookId={book.id} />
      </CardContent>
    </Card>
  );
}

function LinkedTrades({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, refresh } = useApi<{ trades: LinkableTrade[] }>(
    `/api/playbooks/${id}/trades`,
  );
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const lookup = useApi<{
    trades: (LinkableTrade & { playbookId: string | null })[];
    hasMore: boolean;
  }>(searching ? `/api/trades/lookup?q=${encodeURIComponent(search)}` : null);
  const link = async (key: string, playbookId: string | null) => {
    setBusy(true);
    setFailure("");
    try {
      await postJson(`/api/trades/${encodeURIComponent(key)}`, { playbookId }, "PATCH");
      refresh();
      lookup.refresh();
      onChanged();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not update trade link");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 border-t pt-3" aria-label="Linked trades">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Linked trades</h2>
        <Button variant="outline" size="sm" onClick={() => setSearching(!searching)}>
          {searching ? "Close search" : "Link trades"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Link trades now or assign this playbook from a trade later. Each trade has one playbook.
      </p>
      {(failure || error || lookup.error) && (
        <p role="alert" className="text-sm text-destructive">
          {failure || error || lookup.error}
        </p>
      )}
      {searching && (
        <div className="space-y-2 rounded-md border p-3">
          <Input
            aria-label="Search trades to link"
            placeholder="Search symbol, date or account…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {lookup.loading && <p className="text-xs text-muted-foreground">Loading trades…</p>}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {lookup.data?.trades.map((trade) => (
              <div key={trade.key} className="flex items-center justify-between gap-2 text-xs">
                <Link className="min-w-0 break-words underline" href={tradePath(trade.key)}>
                  {tradeLinkLabel(trade)}
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || trade.playbookId === id}
                  onClick={() => {
                    if (
                      trade.playbookId &&
                      !confirm("Move this trade from its current playbook to this one?")
                    )
                      return;
                    void link(trade.key, id);
                  }}
                >
                  {trade.playbookId === id ? "Linked" : trade.playbookId ? "Move here" : "Link"}
                </Button>
              </div>
            ))}
          </div>
          {lookup.data?.hasMore && (
            <p className="text-xs text-muted-foreground">
              Showing 50 results. Refine your search for more.
            </p>
          )}
          {lookup.data?.trades.length === 0 && (
            <p className="text-xs text-muted-foreground">No trades found.</p>
          )}
        </div>
      )}
      {data?.trades.length === 0 && (
        <p className="text-sm text-muted-foreground">No linked trades yet.</p>
      )}
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {data?.trades.map((trade) => (
          <div key={trade.key} className="flex items-center justify-between gap-2 text-xs">
            <Link className="min-w-0 break-words underline" href={tradePath(trade.key)}>
              {tradeLinkLabel(trade)}
            </Link>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void link(trade.key, null)}
            >
              Unlink
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
