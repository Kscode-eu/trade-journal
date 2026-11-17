import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { accounts, db } from "@/db";
import { handler, requireValue } from "@/server/api";
import { encryptJson } from "@/server/crypto";
import { saxoConfig, saxoToken, saxoGet, saxoPages } from "@/server/saxo";
import { createHash } from "node:crypto";
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const jar = await cookies();
  const state = jar.get("saxo_state")?.value;
  jar.delete("saxo_state");
  requireValue(
    state && state === url.searchParams.get("state"),
    "Saxo login expired. Start again from Import trades → Broker sync.",
  );
  const code = url.searchParams.get("code");
  requireValue(code && !url.searchParams.has("error"), "Saxo login was cancelled.");
  const token = await saxoToken({ grant_type: "authorization_code", code });
  const client = await saxoGet("port/v1/clients/me", token.access_token);
  requireValue(typeof client.ClientKey === "string", "Saxo client is missing.");
  const rows = await saxoPages("port/v1/accounts/me", token.access_token);
  // One journal account per Saxo account prevents mixing currencies and positions.
  for (const row of rows) {
    requireValue(
      typeof row.AccountKey === "string" && typeof row.Currency === "string",
      "Saxo account details are missing.",
    );
    const id = `saxo-${createHash("sha256").update(`${saxoConfig().api}:${client.ClientKey}:${row.AccountKey}`).digest("hex").slice(0, 24)}`;
    const credentialsEnc = encryptJson({
      ...token,
      accountKey: row.AccountKey,
      clientKey: client.ClientKey,
    });
    await db
      .insert(accounts)
      .values({
        id,
        name: `Saxo ${row.AccountId ?? row.Currency}`,
        broker: "saxo",
        kind: "sync",
        currency: row.Currency,
        credentialsEnc,
        autoSync: true,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({ target: accounts.id, set: { credentialsEnc } });
  }
  return NextResponse.redirect(new URL("/accounts", saxoConfig().redirect));
});
