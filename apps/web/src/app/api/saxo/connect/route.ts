import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handler } from "@/server/api";
import { saxoConfig } from "@/server/saxo";
export const POST = handler(async (request: Request) => {
  const c = saxoConfig();
  if (request.headers.get("origin") !== new URL(c.redirect).origin)
    return new Response("Invalid origin", { status: 403 });
  const state = randomBytes(32).toString("hex");
  (await cookies()).set("saxo_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: c.redirect.startsWith("https:"),
    path: "/api/saxo",
    maxAge: 600,
  });
  return NextResponse.redirect(
    `${c.auth}/authorize?${new URLSearchParams({ response_type: "code", client_id: c.key, redirect_uri: c.redirect, state })}`,
    303,
  );
});
