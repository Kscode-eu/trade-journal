import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { accounts, db, executions, trades } from "@/db";
import { decryptJson, encryptJson } from "./crypto";
import { executionProblem } from "./executions";
import { rebuildAccount } from "./rebuild";
import { executionHash, nowIso } from "./ids";
import { normalizeSaxo, saxoAssetClass, type SaxoReports } from "./saxo-normalize";
import { buildRoundTrips, type Execution } from "@luxalgo/journal-core";
import type { ImportedExecution } from "@luxalgo/journal-importers";

export function saxoConfig() {
  const key = process.env.SAXO_APP_KEY;
  const secret = process.env.SAXO_APP_SECRET;
  const redirect = process.env.SAXO_REDIRECT_URI;
  if (!key || !secret || !redirect)
    throw new Error(
      "Configure SAXO_APP_KEY, SAXO_APP_SECRET and SAXO_REDIRECT_URI on the server first.",
    );
  const sim = process.env.SAXO_ENVIRONMENT === "sim";
  return {
    key,
    secret,
    redirect,
    auth: `https://${sim ? "sim" : "live"}.logonvalidation.net`,
    api: `https://gateway.saxobank.com/${sim ? "sim/" : ""}openapi/`,
  };
}
export interface SaxoCredentials {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
}
export async function saxoToken(parameters: Record<string, string>): Promise<SaxoCredentials> {
  const c = saxoConfig();
  const response = await fetch(`${c.auth}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ ...parameters, redirect_uri: c.redirect }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Saxo authorization expired or failed. Connect Saxo again.");
  const token = await response.json();
  if (!token.access_token || !token.refresh_token || !(token.expires_in > 0))
    throw new Error("Saxo returned incomplete authorization.");
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
export async function saxoGet(path: string, token: string) {
  const c = saxoConfig();
  const url = new URL(path, c.api);
  if (!url.href.startsWith(c.api)) throw new Error("Invalid Saxo pagination URL.");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Saxo request failed (${response.status}). Reconnect if authorization expired.`,
    );
  return response.json();
}
export async function saxoPages(path: string, token: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  while (path) {
    if (seen.has(path) || seen.size >= 10000) throw new Error("Saxo pagination did not finish.");
    seen.add(path);
    const page = await saxoGet(path, token);
    if (!Array.isArray(page.Data)) throw new Error("Invalid Saxo response.");
    rows.push(...page.Data);
    path = page.__next || "";
    if (!path && typeof page.__count === "number" && page.__count > rows.length)
      throw new Error("Saxo returned an incomplete report; previous journal data was retained.");
  }
  return rows;
}
export function saxoExecution(row: Record<string, unknown>): ImportedExecution {
  const time = String(row.TradeExecutionTime ?? "");
  if (
    !row.TradeId ||
    !row.InstrumentSymbol ||
    !/(Z|[+-]\d\d:\d\d)$/.test(time) ||
    !Number.isFinite(Date.parse(time)) ||
    typeof row.Amount !== "number" ||
    !Number.isFinite(row.Amount) ||
    row.Amount === 0 ||
    typeof row.Price !== "number" ||
    !Number.isFinite(row.Price) ||
    row.Price < 0
  )
    throw new Error("Saxo returned an incomplete trade; no trades were imported.");
  // Stable identity preserves separate fills with identical prices, quantities and times.
  return {
    symbol: String(row.InstrumentSymbol),
    side: row.Amount > 0 ? "buy" : "sell",
    quantity: Math.abs(row.Amount),
    price: row.Price,
    executedAt: new Date(time).toISOString(),
    fee: 0,
    assetClass: saxoAssetClass(String(row.AssetType)),
    importMetadata: {
      id: createHash("sha256").update(String(row.TradeId)).digest("hex"),
      group: "saxo",
      order: 0,
      preserveFee: true,
    },
  };
}
let queue: Promise<unknown> = Promise.resolve();
const running = new Map<string, Promise<Awaited<ReturnType<typeof performSync>>>>();
export function syncSaxo(id: string) {
  const existing = running.get(id);
  if (existing) return existing;
  const promise = queue
    .then(() => performSync(id))
    .catch(async (error) => {
      const account = (await db.select().from(accounts).where(eq(accounts.id, id)))[0];
      if (account) {
        const previous = account.snapshotJson ? JSON.parse(account.snapshotJson) : {};
        await db
          .update(accounts)
          .set({
            snapshotJson: JSON.stringify({
              ...previous,
              syncError: error instanceof Error ? error.message : "Saxo sync failed",
              attemptedAt: nowIso(),
            }),
          })
          .where(eq(accounts.id, id));
      }
      throw error;
    })
    .finally(() => running.delete(id));
  queue = promise.catch(() => undefined);
  running.set(id, promise);
  return promise;
}
async function performSync(id: string) {
  const account = (await db.select().from(accounts).where(eq(accounts.id, id)))[0];
  if (!account?.credentialsEnc) throw new Error("Connect Saxo first.");
  let creds = decryptJson<SaxoCredentials & { accountKey: string; clientKey: string }>(
    account.credentialsEnc,
  );
  if (creds.expiresAt < Date.now() + 120000) {
    const oldToken = creds.refresh_token;
    const next = await saxoToken({ grant_type: "refresh_token", refresh_token: oldToken });
    const siblings = await db.select().from(accounts).where(eq(accounts.broker, "saxo"));
    for (const sibling of siblings) {
      if (!sibling.credentialsEnc) continue;
      const saved = decryptJson<typeof creds>(sibling.credentialsEnc);
      if (saved.refresh_token === oldToken)
        await db
          .update(accounts)
          .set({ credentialsEnc: encryptJson({ ...saved, ...next }) })
          .where(eq(accounts.id, sibling.id));
    }
    creds = { ...creds, ...next };
  }
  const from = process.env.SAXO_HISTORY_FROM || "2000-01-01";
  const to = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(Date.parse(from)) || from > to)
    throw new Error("SAXO_HISTORY_FROM must be a valid past date (YYYY-MM-DD).");
  const previous = account.snapshotJson ? JSON.parse(account.snapshotJson) : null;
  if (previous?.from && previous.from < from)
    throw new Error(
      "SAXO_HISTORY_FROM would remove saved history. Restore the previous start date or use a separate journal account.",
    );
  const scope = new URLSearchParams({ AccountKey: creds.accountKey, ClientKey: creds.clientKey });
  const history = new URLSearchParams({
    ...Object.fromEntries(scope),
    FromDate: from,
    ToDate: to,
    $top: "1000",
  });
  const token = creds.access_token;
  // Sequential requests avoid flooding the account's report rate limit.
  const reports: SaxoReports = {
    trades: await saxoPages(
      `cs/v1/reports/trades/${encodeURIComponent(creds.clientKey)}?${history}`,
      token,
    ),
    transactions: await saxoPages(
      `hist/v1/transactions?${history}&AccountKeys=${encodeURIComponent(creds.accountKey)}`,
      token,
    ),
    closed: await saxoPages(
      `cs/v1/reports/closedPositions/${encodeURIComponent(creds.clientKey)}/${from}/${to}?${scope}&$top=1000`,
      token,
    ),
    positions: await saxoPages(
      `port/v1/positions?${scope}&$top=1000&FieldGroups=PositionBase,PositionView,DisplayAndFormat`,
      token,
    ),
    balances: await saxoGet(`port/v1/balances?${scope}`, token),
  };
  const normalized = normalizeSaxo(reports, account.currency);
  const syncedAt = nowIso();
  const { fills: _, ...summary } = normalized;
  const result = await db.transaction(async () => {
    const result = await saveSaxoPositions(id, normalized.fills);
    await db
      .update(accounts)
      .set({
        lastSyncAt: syncedAt,
        snapshotJson: JSON.stringify({
          ...summary,
          reports,
          from,
          to,
          fetchedAt: syncedAt,
          syncError: null,
          version: 2,
        }),
      })
      .where(eq(accounts.id, id));
    return result;
  });
  return {
    ...result,
    accountId: id,
    equity: normalized.equity,
    positions: normalized.positions.length,
    syncedAt,
    skipped: 0,
    skippedReasons: normalized.warnings,
  };
}

/** Replace only Saxo-owned accounting rows atomically; preserve stable IDs and annotations. */
export async function saveSaxoPositions(accountId: string, fills: ImportedExecution[]) {
  for (const fill of fills) {
    const problem = executionProblem(fill, "sync");
    if (problem) throw new Error(problem);
  }
  const prepared = fills.map((fill) => ({
    ...fill,
    id: `sx-${createHash("sha256").update(`${accountId}:${fill.importMetadata!.group}:${fill.importMetadata!.id}`).digest("hex").slice(0, 32)}`,
    accountId,
    source: "sync" as const,
  }));
  const predicted = buildRoundTrips(prepared as Execution[]);
  return db.transaction(async () => {
    const saved = await db
      .select()
      .from(executions)
      .where(and(eq(executions.accountId, accountId), eq(executions.source, "sync")));
    const owned = saved.filter((row) => {
      const meta = row.importMetadataJson ? JSON.parse(row.importMetadataJson) : {};
      return meta.group === "saxo" || meta.group?.startsWith("saxo-position:");
    });
    const oldTrades = await db.select().from(trades).where(eq(trades.accountId, accountId));
    const predictedKeys = new Set(predicted.map((t) => t.key));
    const ownedIds = new Set(owned.map((row) => row.id));
    const annotated = oldTrades
      .filter((t) => (JSON.parse(t.executionIdsJson) as string[]).some((id) => ownedIds.has(id)))
      .filter(
        (t) =>
          t.notes ||
          (t.tagsJson && t.tagsJson !== "[]") ||
          (t.mistakesJson && t.mistakesJson !== "[]") ||
          t.playbookId ||
          t.rating != null ||
          t.reviewedAt ||
          t.stopLoss != null ||
          t.profitTarget != null,
      );
    const carry = annotated.flatMap((t) => {
      if (predictedKeys.has(t.key)) return [];
      const group = t.key.split("|import:")[1];
      const matches = predicted.filter((n) => group && n.key.split("|import:")[1] === group);
      if (matches.length !== 1)
        throw new Error(
          "Saxo position reconciliation would change an annotated trade. Export its notes before migrating this account; no data was changed.",
        );
      return [{ old: t, key: matches[0]!.key }];
    });
    const hashes = new Map(owned.map((r) => [r.id, r.contentHash]));
    const knownHashes = new Set(owned.map((r) => r.contentHash));
    const kept = new Set(prepared.map((r) => r.id));
    const obsolete = owned.filter((r) => !kept.has(r.id));
    for (let i = 0; i < obsolete.length; i += 500)
      await db.delete(executions).where(
        inArray(
          executions.id,
          obsolete.slice(i, i + 500).map((r) => r.id),
        ),
      );
    let inserted = 0,
      duplicates = 0;
    for (const fill of prepared) {
      const contentHash = executionHash(fill);
      if (hashes.has(fill.id) || knownHashes.has(contentHash)) duplicates++;
      else inserted++;
      const row = {
        accountId,
        symbol: fill.symbol,
        side: fill.side,
        quantity: fill.quantity,
        price: fill.price,
        fee: fill.fee,
        executedAt: fill.executedAt,
        assetClass: fill.assetClass,
        source: "sync" as const,
        contentHash,
        importMetadataJson: JSON.stringify(fill.importMetadata),
      };
      await db
        .insert(executions)
        .values({ ...row, id: fill.id, createdAt: nowIso() })
        .onConflictDoUpdate({ target: executions.id, set: row });
    }
    await rebuildAccount(accountId);
    for (const { old, key } of carry)
      await db
        .update(trades)
        .set({
          notes: old.notes,
          tagsJson: old.tagsJson,
          mistakesJson: old.mistakesJson,
          playbookId: old.playbookId,
          rating: old.rating,
          reviewedAt: old.reviewedAt,
          stopLoss: old.stopLoss,
          profitTarget: old.profitTarget,
        })
        .where(eq(trades.key, key));
    return { inserted, duplicates };
  });
}
