# AI account and filter scope

Ask your journal and daily recaps use the account selection and analysis filters shown on the page. The client sends the computed date range, rather than asking the server to reinterpret a relative range. The server validates that snapshot, then uses the same trade query and timezone as the journal before building any AI context.

- All accounts remains the default when no account filter is selected. An explicitly malformed or unknown account selection is rejected; it never falls back to all accounts.
- No matching trades produces a data-specific message without a provider call. A daily recap also requires closed trades on the requested local calendar day.
- Context includes the scope and per-account totals with account names and currencies. Mixed-currency sums are explicitly described as unconverted.
- Answers are labeled with their scope. Changing filters clears the answer and invalidates pending responses, including a switch away from and back to the same account. Leaving a page also invalidates pending responses.
- A daily note is still shared by date across accounts. Recaps for an account or other trade subset do not include that shared note in the provider context. An all-account, otherwise unfiltered day recap can still use the note. Date range filters alone do not narrow that day's trades further.
- A completed recap appends a labeled section to the latest draft, preserving edits made during generation. A response from an obsolete scope cannot append or save a recap.
- Single-trade critique continues to use the trade key and is unchanged.

## API contract

Both routes require a `filters` object using the journal's `AnalysisFilters` string fields; `{}` explicitly requests all trades. Ask also requires `question`, and recap requires a valid `date` in `YYYY-MM-DD` format. The UI sends `timeZone`; a mismatch with the server setting requires a page refresh. The routes reject unknown request fields, invalid filters, reversed ranges and missing account IDs. Recap additionally accepts `preview: true` to inspect its full AI input and an optional `fingerprint` to verify a preview before generation.

Successful responses retain `answer` or `recap` and add `scope: { label, timeZone }`. The display label masks monetary filter amounts, consistent with private filter descriptions. The provider receives the actual numeric filters and matching aggregates.

## Verification without an AI connection

Run `pnpm test apps/web/tests/ai-scope.test.ts apps/web/tests/ai-ui.test.ts apps/web/tests/ai-feedback.test.ts`.

The route tests use an isolated PostgreSQL schema and replace only `runAi`, recording the exact context from the real handlers. The fixture has Account A at +10 and Account B at -50; A alone must contain no B trade data, while a combined selection reports -40 and the separate account totals. Tests cover each supported filter, invalid selections, empty results, local-midnight boundaries, overnight time windows, shared notes and single-trade critique.

The React DOM tests use controlled delayed responses to exercise the actual Ask component and daily journal page. They verify outgoing filter snapshots, scope labels, account/date/timezone changes, returning to an earlier scope, obsolete errors, duplicate clicks, retries, unmounting and edits made while a recap is pending.

These checks verify data selection and UI behavior, not provider connectivity or generated prose quality. The normal local app still requires a configured AI provider to generate real answers. No mock-provider mode is included in the application. Existing shared-note writes from separate browser tabs remain last-write-wins; this change protects edits made in the active editor during generation.

## Dictation to structured Markdown

In a daily note, trade review, notebook entry, or other Markdown editor, choose **Structure with AI → Preview AI data → Generate Markdown** after dictating or typing. The action structures the entire current note using the selected AI provider. Review the preview, then choose **Use Markdown** to replace the draft through its normal save flow, or **Discard**. **Undo AI formatting** restores the original while the generated text remains unchanged in the open editor. If the note changes during generation or review, applying is disabled until you regenerate.

Customize **Settings → AI → Dictation to Markdown prompt**, retaining the `{{dictation}}` placeholder. This template is separate from inserted note templates and applies across note editors. **Restore default prompt** loads the default into the settings editor; save it to persist. The default preserves the note's language, first-person voice, numbers, uncertainty and facts, and only creates sections supported by the source.

### Optional trading-day context and input inspection

**Include trading-day context** lets you choose the local date, one account or all accounts, and these independent categories:

- Trade results, annotations (tags, mistakes, planned stops/targets and ratings), and execution fills. Activity includes trades opened, closed, or executed that day plus the explicitly linked trade when its account is selected. Day totals include only trades closed on that local date and stay separate by currency.
- Other trade notes for that selection.
- The saved daily journal, explicitly labeled as shared across accounts.
- Notebook notes linked to selected trades or that date; unlinked notes created/updated that day are shared. Deleted notebook folders are excluded.
- Shared routine checks recorded for the date. Missing checks are not inferred to be failures.

Daily editors default to their journal date. Trade editors default to their trade's account and closing/opening day. Notebook editors use their linked trade/day when available, otherwise their last-update day. Other editors start with today and let you select another date. The current editor draft replaces its saved copy, avoiding duplicate/conflicting versions of the same note. No dashboard filters are inherited silently; the date and account are displayed explicitly. These are current records, not historical snapshots.

**Preview AI data** retrieves the selected records without contacting the provider. Expand each source to read its full contents, follow its link, or inspect the exact user prompt and system instructions. The preview names the provider and model. Uncheck context entirely for note-only formatting. Privacy mode hides the detailed input until disabled.

Generation requires the preview fingerprint. The server rebuilds the request and rejects it if the draft, selected records, prompt, provider, or model has changed. Client-side selection changes invalidate the preview too. Generated notes retain a **Data used for this result** inspection panel. Additional facts must be placed in a separate **Recorded context** section with source links; conflicts with dictation should be flagged rather than silently rewritten.

`GET /api/ai/note-context` accepts optional `date`, `tradeKey`, and `noteId` anchors and returns safe account choices, date and timezone defaults. `POST /api/ai/structure-note` accepts `{ text, anchor?, context?, preview: true }` for inspection, then the same inputs plus `fingerprint` for generation. A `context` object contains `date`, `timeZone`, `accountId` (empty string means all accounts), and boolean `trades`, `tradeNotes`, `journal`, `notebook`, and `routines` fields. Use `context: null` for no extra data. Generation returns `{ markdown, input }`.

Notes are limited to 24,000 characters; templates to 8,000 characters with `{{dictation}}`; the complete prompt to 160,000 characters. Oversized context is rejected explicitly, never silently truncated. Attachments and credentials are not included. Generation does not save the note; applying uses the editor's existing save flow.

Daily recaps also offer **Preview recap data** and show the actual input used after generation. Their existing account/filter rules still apply, including exclusion of shared daily notes from filtered recaps. A previewed recap is checked against its fingerprint before generation. Recaps use saved data; use note structuring when the current unsaved draft should be included.

## Further AI opportunities

Existing features already cover filtered journal questions, daily recaps, weekly reviews, single-trade critiques, and assisted import parsing. The next useful additions, based on current journal workflows, would be:

| Priority | Addition                                                   | Existing data to use                                               | Review behavior                                                                               |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1        | Suggest tags, mistakes and a matching playbook from a note | Trade notes, existing tags/mistakes, playbooks                     | Offer existing labels with supporting excerpts; apply only selected suggestions               |
| 2        | Compare recurring behaviors across weeks                   | Filtered closed trades, annotations, rule checks                   | Compute metrics in code; have AI explain patterns with linked trade examples and sample sizes |
| 3        | Turn repeated lessons into a draft playbook checklist      | User-selected reviews and existing playbook rules                  | Show a draft for editing before creating rules; never mark a rule followed automatically      |
| 4        | Find related journal notes                                 | Notebook entries and daily notes explicitly included in the search | Return dated links and excerpts; respect account scope and shared-note boundaries             |

These are follow-up ideas, not implemented features. Tag suggestions are the smallest next step because they fit the existing trade annotation workflow and can reuse the new preview/apply interaction.

## Weekly review

**Weekly review** in the left navigation opens an all-account Monday–Sunday review. Choose a date or step between weeks. This page deliberately uses its own week selection, independent of dashboard filters, and labels that scope. Charts load without an AI call; **Generate weekly review** sends the saved evidence to the configured provider.

- Performance counts trades closed during the week in the journal display timezone, including trades opened before the week. Daily and cumulative net P&L charts, win rate, and counts are calculated in code. Monetary results remain separate by currency. Cumulative P&L starts at zero for each week, not at the account balance.
- Evidence includes notes on trades held at any point during the week; all daily journal notes dated within it; and notebook notes linked to those trades/dates. Unlinked notebook notes qualify when created or last updated in the week. Deleted folders are excluded. Notes are current saved versions, not historical snapshots; notebook update dates do not imply that the entire note describes that week. Attachments are not read.
- Trade notes and journal notes are read in full. Large evidence collections are split into batches with source labels and summarized before final synthesis. Every batch must succeed; over 30 batches is rejected before generation instead of silently omitting sources. Multiple provider requests may therefore be needed.
- Guidance cites source links and focuses on recorded behaviors and three measurable process improvements. It must distinguish observations from hypotheses and identify missing evidence. Prior-week comparisons are not inferred. Notes-only weeks are supported.
- A completed generation returns both the computed report and prose from the same in-memory snapshot. Changing weeks, refreshing, or leaving the page invalidates pending UI responses. Reviews remain in page memory for the current visit; they are not automatically saved to journal notes. Refresh/re-generate after editing data. Privacy mode conceals financial chart labels, monetary table cells, and generated prose.

`GET /api/ai/weekly-review?date=YYYY-MM-DD` returns the computed report and source links (without full note text); omitting the date chooses the current week in the journal timezone. `POST` accepts `{ date, timeZone }`, validates that timezone, and returns `{ report, summary, generatedAt }`. Both routes use the normal session authentication wrapper.

Focused tests cover week/year boundaries, local midnight and DST, carried trades, currency separation, source inclusion, notes-only weeks, complete evidence batching, provider failures, invalid requests, duplicate clicks, privacy, and obsolete responses. They mock the provider; they do not verify generated prose quality or live provider connectivity.
