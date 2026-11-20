import { handler, ok } from "@/server/api";
import { noteContextDefaults, readNoteAnchor } from "@/server/ai-note-context";

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const anchor = readNoteAnchor(Object.fromEntries(params));
  return ok(await noteContextDefaults(anchor));
});
