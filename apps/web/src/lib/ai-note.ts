export const MAX_AI_NOTE_LENGTH = 24000;
export const MAX_AI_NOTE_PROMPT_LENGTH = 8000;
export const DEFAULT_AI_NOTE_PROMPT = `Turn my dictated trading journal note into clear, structured Markdown.
Use headings for Context, Setup and plan, Execution, Emotions, Lessons, and Next steps only when the note contains relevant information.
Remove filler words and repetition, correct punctuation, and keep my first-person voice and original language.
Preserve all stated numbers, symbols, dates, uncertainty, links, and important details. Do not invent facts, analysis, or advice.
If recorded context is supplied, use it to clarify facts. Put any added facts in a separate Recorded context section with source links; flag conflicts without changing what I said.
Use bullet points where helpful and checkboxes only for actions I actually mentioned.
Return only the Markdown note, without a code fence or introductory explanation.

My note:
{{dictation}}`;

export function validAiNotePrompt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_AI_NOTE_PROMPT_LENGTH &&
    value.includes("{{dictation}}")
  );
}

export function buildAiNotePrompt(template: string, dictation: string): string {
  return template.replaceAll("{{dictation}}", () => dictation);
}
