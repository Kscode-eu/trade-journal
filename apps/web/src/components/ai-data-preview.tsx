"use client";
import Link from "next/link";
import type { AiNotePreview } from "@/lib/ai-note-context";
import { usePrivacy } from "./privacy";

export function AiDataPreview({
  input,
  sent = false,
  description,
}: {
  input: AiNotePreview;
  sent?: boolean;
  description?: string;
}) {
  const privateMode = usePrivacy();
  return (
    <details className="rounded-md border text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium">
        {sent ? "View data used" : "View AI data"}
        <span className="ml-2 font-normal text-muted-foreground">
          {input.sources.filter((source) => source.id !== "scope").length} sources · {input.model}
        </span>
      </summary>
      <div className="max-h-80 space-y-2 overflow-y-auto overscroll-contain border-t p-3">
        <p className="font-medium">
          {sent ? "Data used for this result" : "AI input preview"} · {input.provider} ·{" "}
          {input.model}
        </p>
        <p className="text-muted-foreground">
          {description ??
            `Your current draft and saved prompt${input.sources.length ? `, plus ${input.sources.filter((s) => s.id !== "scope").length} reference sources below` : "; no additional journal data"}.`}{" "}
          {sent
            ? "This is the input used for this generation."
            : "Previewing does not contact the AI provider."}
        </p>
        {privateMode ? (
          <p>
            Turn off privacy mode to inspect the full input, which can contain financial data and
            private notes.
          </p>
        ) : (
          <>
            {input.sources.map((source) => (
              <details key={source.id} className="rounded border p-2">
                <summary className="cursor-pointer font-medium">{source.label}</summary>
                {source.href && (
                  <Link className="mt-2 inline-block underline" href={source.href}>
                    Open source
                  </Link>
                )}
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono">
                  {source.content}
                </pre>
              </details>
            ))}
            <details>
              <summary className="cursor-pointer font-medium">
                Exact prompt and instructions {sent ? "sent" : "to send"}
              </summary>
              <p className="mt-3 font-medium">System instructions</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
                {input.system}
              </pre>
              <p className="mt-3 font-medium">
                User prompt (includes your note and all selected data)
              </p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words">
                {input.prompt}
              </pre>
            </details>
          </>
        )}
      </div>
    </details>
  );
}
