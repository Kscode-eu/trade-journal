"use client";
import { useEffect, useState } from "react";
import {
  DEFAULT_AI_NOTE_PROMPT,
  MAX_AI_NOTE_PROMPT_LENGTH,
  validAiNotePrompt,
} from "@/lib/ai-note";
import { postJson, useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

export function AiNoteSettings() {
  const { data, error, loading } = useApi<{ aiNotePrompt: string }>("/api/settings");
  const [prompt, setPrompt] = useState(DEFAULT_AI_NOTE_PROMPT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (data?.aiNotePrompt) setPrompt(data.aiNotePrompt);
  }, [data]);
  return (
    <div className="space-y-3 border-t pt-4">
      <Label htmlFor="ai-note-prompt">Dictation to Markdown prompt</Label>
      <p className="text-xs text-muted-foreground">
        Used by “Structure with AI” in note editors. Include {"{{dictation}}"} where your note
        belongs. Note editors can add trading-day context. Preview the exact prompt and selected
        data before sending them to your AI provider.
      </p>
      <Textarea
        id="ai-note-prompt"
        className="min-h-64 font-mono text-xs"
        value={prompt}
        maxLength={MAX_AI_NOTE_PROMPT_LENGTH}
        disabled={loading || busy || !data}
        onChange={(e) => {
          setPrompt(e.target.value);
          setMessage("");
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={loading || busy || !data || !validAiNotePrompt(prompt)}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            setFailure("");
            try {
              await postJson("/api/settings", { aiNotePrompt: prompt }, "PATCH");
              setMessage("Note prompt saved.");
            } catch (cause) {
              setFailure(cause instanceof Error ? cause.message : "Couldn’t save prompt.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save note prompt"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={loading || busy || !data}
          onClick={() => {
            setPrompt(DEFAULT_AI_NOTE_PROMPT);
            setMessage("Default restored. Save note prompt to keep it.");
          }}
        >
          Restore default prompt
        </Button>
      </div>
      {!validAiNotePrompt(prompt) && (
        <p className="text-xs text-destructive">
          Include {"{{dictation}}"} and keep the prompt within 8,000 characters.
        </p>
      )}
      {(failure || error) && (
        <p role="alert" className="text-xs text-destructive">
          {failure || error}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
