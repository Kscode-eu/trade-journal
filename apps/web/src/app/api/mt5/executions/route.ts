import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AssetClass } from "@luxalgo/journal-core";
import type { ImportedExecution } from "@luxalgo/journal-importers";
import { accounts, db } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { insertExecutions } from "@/server/executions";
import { nowIso } from "@/server/ids";

const MAX_BODY_BYTES = 1_000_000;
const MAX_DEALS = 500;
const BROKER = "MetaTrader 5";
const ASSET_CLASSES = new Set<AssetClass>([
  "equity",
  "option",
  "futures",
  "forex",
  "crypto",
  "cfd",
  "other",
]);

interface Mt5Deal {
  ticket: string;
  positionId: string;
  order: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
  reportedGrossPnl?: number;
  assetClass?: AssetClass;
}

interface Mt5Body {
  account: {
    login: string;
    server: string;
    currency: string;
  };
  deals: Mt5Deal[];
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const authorized = (request: Request, secret: string): boolean => {
  const header = request.headers.get("authorization") ?? "";
  const candidate = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedBytes = Buffer.from(secret, "utf8");
  const candidateBytes = Buffer.from(candidate, "utf8");
  return (
    expectedBytes.length === candidateBytes.length && timingSafeEqual(expectedBytes, candidateBytes)
  );
};

const accountIdFor = (server: string, login: string): string =>
  `mt5_${createHash("sha256")
    .update(JSON.stringify([server, login]))
    .digest("base64url")
    .slice(0, 18)}`;

/** Token-authenticated ingestion used by the optional local MT5 Docker bridge. */
export const POST = handler(
  async (request: Request) => {
    const secret = process.env.MT5_INGEST_TOKEN ?? "";
    if (secret.length < 32) return bad("MT5 ingest is not configured securely.", 503);
    if (!authorized(request, secret)) return bad("Unauthorized", 401);

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES)
      return bad("Payload too large.", 413);
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return bad("Payload too large.", 413);
    const body = (() => {
      try {
        return JSON.parse(rawBody) as Mt5Body;
      } catch {
        return null;
      }
    })();
    requireValue(body && typeof body === "object", "A JSON body is required.");
    const login = body.account?.login?.trim();
    const server = body.account?.server?.trim();
    const currency = body.account?.currency?.trim().toUpperCase();
    requireValue(login && /^\d{1,30}$/.test(login), "Invalid MT5 account login.");
    requireValue(server && server.length <= 160, "Invalid MT5 server.");
    requireValue(currency && /^[A-Z0-9]{3,10}$/.test(currency), "Invalid account currency.");
    requireValue(
      Array.isArray(body.deals) && body.deals.length > 0 && body.deals.length <= MAX_DEALS,
      `Send 1–${MAX_DEALS} deals per request.`,
    );

    for (const deal of body.deals) {
      requireValue(
        deal &&
          /^\d{1,30}$/.test(deal.ticket) &&
          /^\d{1,30}$/.test(deal.positionId) &&
          Number.isSafeInteger(deal.order) &&
          deal.order >= 0 &&
          typeof deal.symbol === "string" &&
          deal.symbol.trim().length > 0 &&
          deal.symbol.length <= 100 &&
          ["buy", "sell"].includes(deal.side) &&
          finite(deal.quantity) &&
          deal.quantity > 0 &&
          finite(deal.price) &&
          finite(deal.fee) &&
          typeof deal.executedAt === "string" &&
          Number.isFinite(Date.parse(deal.executedAt)) &&
          (deal.reportedGrossPnl === undefined || finite(deal.reportedGrossPnl)) &&
          (deal.assetClass === undefined || ASSET_CLASSES.has(deal.assetClass)),
        "Every MT5 deal needs a ticket, position, side, symbol, quantity, price and timestamp.",
      );
    }

    const accountId = accountIdFor(server, login);
    await db
      .insert(accounts)
      .values({
        id: accountId,
        name: `MT5 ${login} · ${server}`,
        broker: BROKER,
        kind: "import",
        currency,
        initialBalance: 0,
        profitCalcMethod: "fifo",
        autoSync: false,
        createdAt: nowIso(),
      })
      .onConflictDoNothing();

    const account = (await db.select().from(accounts).where(eq(accounts.id, accountId)))[0];
    requireValue(
      account?.broker === BROKER && account.kind === "import",
      "MT5 account identity conflicts with an existing account.",
    );
    requireValue(!account.archivedAt, "Unarchive this MT5 account before syncing it.");

    const executions: ImportedExecution[] = body.deals.map((deal) => ({
      symbol: deal.symbol.trim().toUpperCase(),
      side: deal.side,
      quantity: deal.quantity,
      price: deal.price,
      fee: deal.fee,
      executedAt: deal.executedAt,
      assetClass: deal.assetClass,
      importMetadata: {
        id: `mt5-deal:${deal.ticket}`,
        group: `mt5-position:${deal.positionId}`,
        order: deal.order,
        preserveFee: true,
        ...(deal.reportedGrossPnl === undefined ? {} : { reportedGrossPnl: deal.reportedGrossPnl }),
      },
    }));
    return ok({ accountId, ...(await insertExecutions(accountId, executions, "import")) });
  },
  { public: true },
);
