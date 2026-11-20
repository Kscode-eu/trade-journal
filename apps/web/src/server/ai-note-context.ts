import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { dayKeyOf } from "@luxalgo/journal-core";
import {
  db,
  accounts,
  executions,
  journalDays,
  notes,
  folders,
  progressChecks,
  progressRules,
} from "@/db";
import {
  AI_NOTE_SYSTEM,
  selectDayContext,
  type AiNoteAnchor,
  type AiNoteContextOptions,
  type AiNotePreview,
  type AiNoteSource,
} from "@/lib/ai-note-context";
import { buildAiNotePrompt, DEFAULT_AI_NOTE_PROMPT, MAX_AI_NOTE_LENGTH } from "@/lib/ai-note";
import { isDay } from "./ai-scope";
import { requireValue } from "./api";
import { getAiModel, getAiProvider, getSetting, getTimeZone } from "./settings";
import { getTradeByKey, queryTrades } from "./trades-query";

export function readNoteAnchor(value: unknown): AiNoteAnchor {
  if (value === undefined) return {};
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    "Invalid note context anchor.",
  );
  const anchor = value as Record<string, unknown>;
  requireValue(
    Object.keys(anchor).every((k) => ["date", "tradeKey", "noteId"].includes(k)),
    "Unknown note context anchor.",
  );
  for (const [key, v] of Object.entries(anchor))
    requireValue(
      typeof v === "string" && v.length > 0 && v.length <= 1000 && (key !== "date" || isDay(v)),
      "Invalid note context anchor.",
    );
  return anchor as AiNoteAnchor;
}

export async function noteContextDefaults(anchor: AiNoteAnchor) {
  const timeZone = await getTimeZone();
  const accountRows = await db
    .select({ id: accounts.id, name: accounts.name, currency: accounts.currency })
    .from(accounts);
  let date = anchor.date;
  let tradeKey = anchor.tradeKey;
  if (anchor.noteId) {
    const note = (
      await db
        .select({ note: notes })
        .from(notes)
        .innerJoin(folders, eq(notes.folderId, folders.id))
        .where(and(eq(notes.id, anchor.noteId), isNull(folders.deletedAt)))
    )[0]?.note;
    requireValue(note, "This notebook note no longer exists.");
    date ??= note.dayDate ?? dayKeyOf(note.updatedAt, timeZone);
    tradeKey ??= note.tradeKey ?? undefined;
  }
  let accountId = "";
  if (tradeKey) {
    const trade = await getTradeByKey(tradeKey);
    requireValue(trade, "This trade no longer exists.");
    accountId = trade.accountId;
    // A linked trade is a better default than a notebook's last-edit date.
    if (!anchor.date) date = dayKeyOf(trade.closedAt ?? trade.openedAt, timeZone);
  }
  return {
    date: date ?? dayKeyOf(new Date().toISOString(), timeZone),
    timeZone,
    accountId,
    accounts: accountRows,
  };
}

export async function buildNotePreview(body: Record<string, unknown>): Promise<AiNotePreview> {
  requireValue(
    typeof body.text === "string" &&
      body.text.trim().length > 0 &&
      body.text.length <= MAX_AI_NOTE_LENGTH,
    `Enter a note between 1 and ${MAX_AI_NOTE_LENGTH.toLocaleString("en-US")} characters.`,
  );
  const anchor = readNoteAnchor(body.anchor);
  const template = (await getSetting("aiNotePrompt")) ?? DEFAULT_AI_NOTE_PROMPT;
  let sources: AiNoteSource[] = [];
  if (body.context !== undefined && body.context !== null) {
    requireValue(
      body.context && typeof body.context === "object" && !Array.isArray(body.context),
      "Invalid context selection.",
    );
    const context = body.context as Record<string, unknown>;
    requireValue(
      Object.keys(context).every((k) =>
        [
          "date",
          "timeZone",
          "accountId",
          "trades",
          "tradeNotes",
          "journal",
          "notebook",
          "routines",
        ].includes(k),
      ),
      "Unknown context option.",
    );
    requireValue(isDay(context.date), "Choose a valid context date.");
    for (const key of ["trades", "tradeNotes", "journal", "notebook", "routines"])
      requireValue(typeof context[key] === "boolean", "Choose which context data to include.");
    const defaults = await noteContextDefaults(anchor);
    requireValue(
      context.timeZone === defaults.timeZone,
      "Journal timezone changed. Reload the context options.",
    );
    requireValue(
      typeof context.accountId === "string" &&
        (context.accountId === "" || defaults.accounts.some((a) => a.id === context.accountId)),
      "The selected account no longer exists.",
    );
    const options = context as unknown as AiNoteContextOptions;
    const [tradeData, fills, journals, notebooks, routines] = await Promise.all([
      options.trades || options.tradeNotes || options.notebook
        ? queryTrades(options.accountId ? { accounts: options.accountId } : {})
        : Promise.resolve({ trades: [], rows: [] }),
      options.trades || options.tradeNotes || options.notebook
        ? db
            .select()
            .from(executions)
            .where(options.accountId ? eq(executions.accountId, options.accountId) : undefined)
        : Promise.resolve([]),
      options.journal
        ? db.select().from(journalDays).where(eq(journalDays.date, options.date))
        : Promise.resolve([]),
      options.notebook
        ? db
            .select({ note: notes })
            .from(notes)
            .innerJoin(folders, eq(notes.folderId, folders.id))
            .where(isNull(folders.deletedAt))
        : Promise.resolve([]),
      options.routines
        ? db
            .select({
              id: progressChecks.id,
              date: progressChecks.date,
              done: progressChecks.done,
              title: progressRules.title,
              stage: progressRules.stage,
            })
            .from(progressChecks)
            .innerJoin(progressRules, eq(progressChecks.ruleId, progressRules.id))
            .where(eq(progressChecks.date, options.date))
        : Promise.resolve([]),
    ]);
    sources = selectDayContext(
      {
        trades: tradeData.trades,
        tradeNotes: tradeData.rows,
        accounts: defaults.accounts,
        fills,
        journals,
        notebooks: notebooks.map((n) => n.note),
        routines,
      },
      options,
      anchor,
    );
  }
  const contextText = sources.length
    ? `\n\nSelected recorded context (reference evidence, not dictation):\n${sources.map((s) => `### ${s.label}${s.href ? ` (${s.href})` : ""}\n${s.content}`).join("\n\n")}`
    : "";
  const prompt = buildAiNotePrompt(template, body.text) + contextText;
  requireValue(
    prompt.length <= 160000,
    "Selected data is too large. Choose fewer context categories or a single account, then preview again. No data was sent to AI.",
  );
  const provider = await getAiProvider();
  const model = await getAiModel(provider);
  const content = { provider, model, system: AI_NOTE_SYSTEM, prompt, sources };
  return {
    ...content,
    fingerprint: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
  };
}
