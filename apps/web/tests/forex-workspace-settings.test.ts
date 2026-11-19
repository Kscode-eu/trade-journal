import { eq, sql } from "drizzle-orm";
import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { DEFAULT_FOREX_WORKSPACE } from "../src/lib/forex-workspace";
vi.stubEnv("JOURNAL_PASSWORD", "");
const match = /^-c search_path=(test_[a-f0-9]{32})$/.exec(process.env.PGOPTIONS ?? "");
if (!match) throw new Error("Forex tests require the isolated test schema.");
const { db, settings } = await import("../src/db");
const { getSetting, setSetting } = await import("../src/server/settings");
const { GET, PUT } = await import("../src/app/api/markets/forex-workspace/route");
const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/markets/forex-workspace", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );
beforeEach(async () => {
  const result = await db.execute(sql`select current_schema() as schema`);
  expect(result.rows[0]?.schema).toBe(match[1]);
  await db.delete(settings).where(eq(settings.key, "forexWorkspace"));
});
afterAll(() => vi.unstubAllEnvs());
it("returns forex defaults and saves settings independently of the economic calendar", async () => {
  await setSetting("economicCalendarHighImportanceOnly", "false");
  expect(await (await GET()).json()).toEqual(DEFAULT_FOREX_WORKSPACE);
  const saved = { symbol: "FX:GBPUSD", tool: "technical", showTickerTape: false };
  expect((await put(saved)).status).toBe(200);
  expect(JSON.parse((await getSetting("forexWorkspace"))!)).toEqual(saved);
  expect(await (await GET()).json()).toEqual(saved);
  expect(await getSetting("economicCalendarHighImportanceOnly")).toBe("false");
});
it.each([
  null,
  {},
  { symbol: "EURUSD", tool: "chart", showTickerTape: true },
  { symbol: "FX:EURUSD", tool: "unknown", showTickerTape: true },
  { symbol: "FX:EURUSD", tool: "chart", showTickerTape: "true" },
])("rejects invalid settings without changing the workspace: %j", async (body) => {
  await put(DEFAULT_FOREX_WORKSPACE);
  expect((await put(body)).status).toBe(400);
  expect(await (await GET()).json()).toEqual(DEFAULT_FOREX_WORKSPACE);
});
