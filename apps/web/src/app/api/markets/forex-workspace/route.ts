import { handler, ok, RequestError } from "@/server/api";
import { getSetting, setSetting } from "@/server/settings";
import { DEFAULT_FOREX_WORKSPACE, parseForexWorkspace } from "@/lib/forex-workspace";
const KEY = "forexWorkspace";
export const GET = handler(async () => {
  const saved = await getSetting(KEY);
  return ok(saved ? parseForexWorkspace(JSON.parse(saved)) : DEFAULT_FOREX_WORKSPACE);
});
export const PUT = handler(async (request: Request) => {
  let preferences;
  try {
    preferences = parseForexWorkspace(await request.json());
  } catch (error) {
    throw new RequestError(
      error instanceof Error ? error.message : "Enter valid workspace settings.",
    );
  }
  await setSetting(KEY, JSON.stringify(preferences));
  return ok(preferences);
});
