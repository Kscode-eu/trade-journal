import { afterEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const auth = vi.hoisted(() => ({ middleware: vi.fn(), getSession: vi.fn() }));
vi.mock("../src/server/auth0", () => ({ getAuth0: () => auth }));
import { middleware } from "../src/middleware";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function setup(session: unknown = null) {
  vi.stubEnv("JOURNAL_AUTH", "auth0");
  auth.getSession.mockResolvedValue(session);
  const response = NextResponse.next();
  response.cookies.set("rolling-session", "renewed");
  auth.middleware.mockResolvedValue(response);
  return response;
}
it("lets Auth0 handle callbacks without requiring an existing session", async () => {
  const expected = setup();
  expect(await middleware(new NextRequest("https://journal.test/auth/callback?code=test"))).toBe(
    expected,
  );
  expect(auth.getSession).not.toHaveBeenCalled();
});
it("redirects pages to login with a local return path", async () => {
  setup();
  const response = await middleware(new NextRequest("https://journal.test/trades?range=week"));
  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/auth/login");
  expect(location.searchParams.get("returnTo")).toBe("/trades?range=week");
});
it("returns JSON 401 for anonymous API calls, including password login", async () => {
  setup();
  for (const path of ["/api/accounts", "/api/auth"]) {
    const response = await middleware(new NextRequest(`https://journal.test${path}`));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  }
});
it("preserves rolling session cookies on authorized requests", async () => {
  const expected = setup({ user: { sub: "auth0|alice" } });
  const response = await middleware(new NextRequest("https://journal.test/trades"));
  expect(response).toBe(expected);
  expect(response.cookies.get("rolling-session")?.value).toBe("renewed");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
