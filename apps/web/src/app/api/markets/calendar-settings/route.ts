import { handler, ok, requireValue } from "@/server/api";
import { getSetting, setSetting } from "@/server/settings";

const KEY = "economicCalendarHighImportanceOnly";

export const GET = handler(async () =>
  ok({ highImportanceOnly: (await getSetting(KEY)) !== "false" }),
);

export const PATCH = handler(async (request: Request) => {
  const body = await request.json();
  requireValue(
    body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof body.highImportanceOnly === "boolean",
    "High importance only must be true or false.",
  );
  await setSetting(KEY, String(body.highImportanceOnly));
  return ok({ highImportanceOnly: body.highImportanceOnly });
});
