import { eq, sql } from "drizzle-orm";
import { beforeEach, afterAll, expect, it, vi } from "vitest";
vi.stubEnv("JOURNAL_PASSWORD", "");
// Refuse to run without setup-db.ts's randomly generated, isolated schema.
const match = /^-c search_path=(test_[a-f0-9]{32})$/.exec(process.env.PGOPTIONS ?? "");
if (!match) throw new Error("Calendar tests require the isolated test schema.");
const isolatedSchema = match[1];
const { db, settings } = await import("../src/db");
const { getSetting } = await import("../src/server/settings");
const { GET, PATCH } = await import("../src/app/api/markets/calendar-settings/route");
const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/markets/calendar-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
beforeEach(async () => {
  const result = await db.execute(sql`select current_schema() as schema`);
  expect(result.rows[0]?.schema).toBe(isolatedSchema);
  await db.delete(settings).where(eq(settings.key, "economicCalendarHighImportanceOnly"));
});
afterAll(() => vi.unstubAllEnvs());
it("defaults to high importance and persists both toggle states in the database", async () => {
  expect(await (await GET()).json()).toEqual({ highImportanceOnly: true });
  for (const highImportanceOnly of [false, true]) {
    expect((await patch({ highImportanceOnly })).status).toBe(200);
    expect(await getSetting("economicCalendarHighImportanceOnly")).toBe(String(highImportanceOnly));
    expect(await (await GET()).json()).toEqual({ highImportanceOnly });
  }
});
it.each([{}, null, [], { highImportanceOnly: "false" }, { highImportanceOnly: 0 }])(
  "rejects invalid preferences without overwriting the saved value: %j",
  async (body) => {
    await patch({ highImportanceOnly: false });
    expect((await patch(body)).status).toBe(400);
    expect(await (await GET()).json()).toEqual({ highImportanceOnly: false });
  },
);
