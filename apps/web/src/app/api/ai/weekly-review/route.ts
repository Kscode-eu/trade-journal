import { handler, ok, requireValue } from "@/server/api";
import { generateWeeklyReview, loadWeeklyReview, weeklyPayload } from "@/server/weekly-review";

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  return ok(weeklyPayload(await loadWeeklyReview(params.get("date") ?? undefined)));
});

export const POST = handler(async (request: Request) => {
  const body = await request.json();
  requireValue(
    body && typeof body === "object" && !Array.isArray(body),
    "Invalid weekly review request.",
  );
  requireValue(
    Object.keys(body).every((key) => ["date", "timeZone"].includes(key)),
    "Unknown weekly review field.",
  );
  requireValue(
    typeof body.date === "string" && typeof body.timeZone === "string",
    "Choose a week and timezone.",
  );
  const report = await loadWeeklyReview(body.date, body.timeZone);
  const summary = await generateWeeklyReview(report);
  return ok({ report: weeklyPayload(report), summary, generatedAt: new Date().toISOString() });
});
