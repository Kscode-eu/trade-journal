import { handler, ok, requireValue } from "@/server/api";
import { runAi } from "@/server/ai";
import { buildNotePreview } from "@/server/ai-note-context";

export const POST = handler(async (request: Request) => {
  const body = await request.json();
  requireValue(
    body && typeof body === "object" && !Array.isArray(body),
    "Enter a note to structure.",
  );
  requireValue(
    Object.keys(body).every((key) =>
      ["text", "anchor", "context", "preview", "fingerprint"].includes(key),
    ),
    "Unknown note AI field.",
  );
  requireValue(
    body.preview === undefined || typeof body.preview === "boolean",
    "Invalid preview option.",
  );
  const preview = await buildNotePreview(body);
  if (body.preview === true) return ok(preview);
  requireValue(
    typeof body.fingerprint === "string" && body.fingerprint === preview.fingerprint,
    "Your note, selected data, prompt, or AI settings changed. Preview AI data again before generating.",
  );
  const markdown = await runAi(preview.prompt, 8000, preview.system);
  return ok({ markdown, input: preview });
});
