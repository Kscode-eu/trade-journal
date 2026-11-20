import { afterEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../src/server/auth0", () => ({ getAuth0: () => auth }));
import { handler } from "../src/server/api";
import { journalSchema } from "../src/server/tenant";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("rejects anonymous Auth0 requests before any handler runs", async () => {
  vi.stubEnv("JOURNAL_AUTH", "auth0");
  auth.getSession.mockResolvedValue(null);
  const action = vi.fn(() => new Response("private"));
  expect((await handler(action)()).status).toBe(401);
  expect(action).not.toHaveBeenCalled();
});
it("selects the journal from the verified session and releases request context", async () => {
  vi.stubEnv("JOURNAL_AUTH", "auth0");
  auth.getSession.mockResolvedValue({ user: { sub: "auth0|alice" } });
  const response = await handler(() => new Response(journalSchema()))();
  expect(await response.text()).toMatch(/^user_[a-f0-9]{56}$/);
  expect(() => journalSchema()).toThrow();
});
it("partial Auth0 configuration still requires a session", async () => {
  vi.stubEnv("AUTH0_DOMAIN", "example.auth0.com");
  auth.getSession.mockResolvedValue(null);
  expect((await handler(() => new Response("private"))()).status).toBe(401);
});
