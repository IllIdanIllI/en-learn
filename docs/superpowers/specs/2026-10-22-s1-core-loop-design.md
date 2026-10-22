# S1 — Core loop: design spec

Date: 2026-10-22 · Status: draft for review
Requirements: "English Exam Coach — Requirements" v0.2 (21 Oct 2026), `app-design/PRODUCT.md`, `app-design/DESIGN.md`.

## 1. Goal and stages

v1 is split into three stages, each with its own spec → plan → implementation:

| Stage | Content |
|---|---|
| **S1 (this spec)** | Tauri shell, SQLite, `claude` wrapper, programme, day session, validation, answer checking, disputes, rule gaps, error bank, rulebook, re-checks, spelling, progress (no writing metric) |
| S2 | Writing + rewrite, errors-per-100-words metric, vocabulary decks, preposition deck, Markdown / Obsidian export, full DB export |
| S3 | Speaking: schemes, recording, local Whisper |

S1 acceptance = requirements §7 criteria 1–5.

## 2. Decisions taken during brainstorming

| # | Decision |
|---|---|
| D1 | Target macOS first. Keep core free of platform code so iOS stays possible later (only adapters change). Windows/Linux: best effort. |
| D2 | Answer that is natural English but not covered by the rulebook → verdict `rule_gap`, excluded from score; approving the proposed rule edit turns it into `correct`; rejecting keeps it excluded. |
| D3 | The app may propose a rule for a programme topic (FR-9), but writes it only after the learner confirms (this reconciles FR-9 with FR-17). |
| D4 | Topic closes after **2 correct checks, on dates ≥3 days apart, without support, with no error on that topic in between** (in the +1/+3/+7 series: the +3 and +7 checks). Basis: successive relearning (Rawson et al. 2018; Vaughn & Rawson 2011). |
| D5 | An error on an open topic **restarts** the series: new checks at +1/+3/+7 from the error date, success count reset. |
| D6 | Validation TD-1…TD-8 = code checks (TD-1, TD-4, TD-7, TD-8) + second LLM call (TD-2, TD-3, TD-5, TD-6). |
| D7 | Obsidian export is one-way (S2). |
| D8 | Native language default: Russian (configurable). |
| D9 | Seed data written from scratch: sample 3-week programme + starter rules with sources. Placement test = future idea, not v1. |
| D10 | Learner enters vocabulary manually (S2). |
| D11 | Model is a setting per call type; default `claude-sonnet-5-5` for all; any can be switched to `claude-haiku-5-5`. `--max-budget-usd` is an optional setting, empty by default. |
| D12 | Tests: Vitest for logic; Playwright screenshots for UI. Package manager: Yarn 4 (corepack), `node-modules` linker. |
| D13 | Architecture: everything in the webview with a pure TypeScript core (approach A). |
| D14 | Migrations: numbered `.sql` files run by TypeScript; data access: plain SQL in typed repo functions, no ORM; prompt passed to `claude` via stdin. |
| D15 | Spelling is in S1 (light day needs it). Speaking question on a light day is shown as text only until S3. |
| D16 | Until S2/S3, the `speaking` and `writing` weekday slots produce review + error spotting instead. |
| D17 | Consistency = practised days in the last `N` days, where `N = min(days since first session, 100)`. |

## 3. Architecture

- **Tauri 2** shell. Rust only registers plugins: `tauri-plugin-sql` (sqlite), `tauri-plugin-shell`, `tauri-plugin-fs`. No custom Rust commands.
- **React + TypeScript + Vite**, shadcn/ui + Tailwind, styled per `DESIGN.md`.
- **Core** (`src/core`) is pure TypeScript and depends only on interfaces in `ports.ts`:

```ts
interface Db { execute(sql: string, params?: unknown[]): Promise<void>; select<T>(sql: string, params?: unknown[]): Promise<T[]>; transaction<T>(fn: () => Promise<T>): Promise<T>; }
interface Llm { call<T>(req: LlmRequest): Promise<LlmResult<T>>; }       // kind, systemPrompt, userPrompt, schema, model, budget
interface Clock { today(): string; now(): string; }                        // local YYYY-MM-DD / ISO
interface PromptStore { load(name: string): Promise<{ system: string; schema: object }>; }
```

- **Adapters:** `tauri/` (TauriDb, ClaudeCli, FilePromptStore), `test/` (better-sqlite3 Db, FakeLlm), `preview/` (sql.js Db + FakeLlm, used only to run the UI in a plain browser for Playwright screenshots).
- The UI never writes SQL and never spawns processes; it calls core functions.

### 3.1 Project layout

```
src-tauri/            Rust setup, capabilities
prompts/              <call>.md (system prompt) + <call>.schema.json, bundled as resources
seed/                 programme.json, rules/*.md
src/core/             ports, domain types, db (migrations runner + repos), programme, schedule,
                      session, validate, grading, rules, progress
src/adapters/         tauri/, test/, preview/
src/db/migrations/    0001_init.sql, ...
src/ui/               pages and components
```

## 4. Data model

Stored tables (S1). Derived data is never stored (see 4.1).

| Table | Fields |
|---|---|
| `meta` | schema_version |
| `settings` | key, value (native_language, model.<call>, budget_usd, accepted_shorthands) |
| `programme` | id, title, start_date, end_date |
| `topic` | id, key (slug), title, kind (`learn` / `notice`), programme_id, week_no (NULL = background) |
| `weekday_slot` | programme_id, weekday (1 = Mon … 7 = Sun), slot (`error_spotting` / `topic` / `second_set` / `speaking` / `writing` / `review_rewrite` / `rest`) |
| `rule` | id, topic_id, current_version |
| `rule_version` | rule_id, version, body (Markdown, FR-14 skeleton), sources (JSON), reason, created_at |
| `session` | id, date (unique), title, is_light, status (`generated` / `graded`), created_at, graded_at |
| `block` | id, session_id, ord, kind (`spelling` / `review` / `task` / `speaking`), format (`gap` / `fix` / `spot` / `spelling` / `question`), title, instruction, format_example, passage (for `spot`), minutes, support_used (bool) |
| `item` | id, block_id, ord, prompt, expected, topic_id, rule_id, rule_version, rule_section, status (`active` / `dropped` / `defect`), note |
| `answer` | item_id, text, verdict (`correct` / `wrong` / `rule_gap`), fix, rule_section, explanation, vocabulary_note, is_inattention, dispute_text, dispute_reply, dispute_decision (`keep` / `correct` / `drop`) |
| `session_feedback` | session_id, patterns (JSON array of sentences), tomorrow (JSON) |
| `rule_gap` | id, answer_item_id, rule_id, proposal (full new rule body), status (`pending` / `approved` / `rejected`) |
| `error` | id, was, should_be, kind (`grammar` / `spelling` / `inattention`), topic_id, item_id, date |
| `spelling_word` | id, word (unique), hint, mnemonic, created_at |
| `spelling_attempt` | word_id, session_id, date, correct |
| `llm_call` | id, session_id, kind, model, cost_usd, duration_ms, ok, error, created_at |

### 4.1 Derived data (computed in TypeScript, NF-4)

Computed on demand from the stored history, so disputes, drops and inattention tags take effect automatically:

- Block and session scores.
- Open topics table, check dates, closing (section 7).
- Progress log, consistency (D17).
- Spelling word state (section 7.3).

*Change vs the in-chat section 2:* `open_topic` / `topic_check` are no longer tables; they are a pure function of graded answers. Reason: recomputation after a dispute or inattention tag stays correct without update logic.

## 5. Programme

- **Setup page** (first launch): title, start/end dates, weekly topics (hardest → easiest, kind `learn` / `notice`), background topics, slot per weekday. Prefilled from `seed/programme.json`; seed rules are inserted with their topics.
- **Calendar** (pure functions): `weekNo(date) = floor(daysBetween(start, date) / 7) + 1`; `slotFor(date)` from `weekday_slot`; outside start…end → review-only day.
- **Error-spotting topics** for week N: topics with `week_no ≤ N` + background topics (FR-2).
- `notice` topics appear only in error-spotting texts, never in `topic` slots (FR-3). If the week's topic is `notice`, the `topic` and `second_set` slots produce an error-spotting text instead.
- **Missed days** don't shift anything: the calendar is date-based; overdue checks are included in the next session (FR-5).
- **Light day** (FR-4): toggle on Today before generating. Content: spelling (5 words), short review (≤5 items), one speaking question (text only). Logged as `is_light`; never counted as missed.

## 6. Day session

### 6.1 Generation

1. **Rule check (FR-9, D3):** if today's slot needs a topic whose rule is missing, Today shows "Rule for *topic* is missing" with **Draft rule**. The `rule_draft` call returns a rule body; the learner reviews/edits and saves it (version 1). Only then can the session be generated.
2. **Context (TS-4)**, assembled from the DB: date, week, slot, light flag, today's topic(s) with current rule versions, error-spotting topic list, errors from the last graded session, inattention errors from the last 14 days (fed into error-spotting texts, FR-25), due and overdue checks (7.1) with their topic rules, spelling words due (7.3).
3. **`generate_session` call** → JSON per schema: blocks in FR-7 order (spelling, review, task, speaking), each with format, instruction, format example, minutes, items (prompt, expected, topic key, rule section) or a passage + hidden errors for `spot`.
   - Spelling block items are built by code from `spelling_word` (prompt = stored hint, expected = word); the LLM is not used for them.
   - Speaking block: 1 question, always "Describe a time when…" type in S1 (FR-33), shown as text, not graded.
4. **Validation** (6.2). Then saved in one transaction with title "Week N, Ddd D Mon · Topic" (FR-11).

### 6.2 Validation (TD-1…TD-8, D6)

Code checks (fail → whole generation retried once, then error shown):
- TD-1: one format per block; `format_example` present; blanks are exactly `___`; no `—`, `–`, `-`, `…` used as a placeholder.
- TD-4: every `fix` block has at least one correct item and one wrong item.
- TD-7: every expected fix is 1–2 words.
- TD-8: `spot` passage = plain paragraphs, one line each; 5–7 errors per paragraph.
- Every item's topic key exists; every rule section reference exists in that rule.

LLM check — `validate_session` call (TD-2, TD-3, TD-5, TD-6): returns per item `ok` or `defect` + reason. Defective items get `status = defect` and are hidden. If a block loses all items, generation is retried once.

### 6.3 Today page states

`no programme` → setup · `rule missing` → draft rule · `no session` → empty state + **Start session** (+ Light day toggle) · `generating` → skeleton lines + "Building today's session…" · `generated` → full session, key hidden, one **Check answers** (⌘↵) · `needs clarification` → inline questions · `graded` → feedback summary on top, verdicts per item.

## 7. Scheduling

### 7.1 Topic checks (FR-30, FR-31, D4, D5)

Input: all graded answers ordered by date, each with topic, verdict, `is_inattention`, item status, and the block's `support_used`.

Per topic, replay events in date order:
- **Error event** = answer `wrong`, item `active`, not inattention. → topic `open`; pending checks := date +1, +3, +7; success list := empty.
- **Check event** = the topic has a pending check with due date ≤ session date, and the session contains active items on that topic. Result = correct if all those items are `correct`, else it is an error event (above). On correct: all pending checks with due date ≤ session date are marked done; if `support_used` is false the date is added to the success list.
- **Close:** success list has two dates ≥3 days apart → topic `closed`, pending checks cleared.
- Answers with verdict `rule_gap`, dropped or defect items: ignored.

Output: topic, status, history (dates and results), linked rule, next check dates. "Due today" = pending checks with due date ≤ today (overdue included).

### 7.2 Support

"Without support" = the learner did not open the rule panel from that block before submitting (`block.support_used`). Review blocks show no rule hints.

### 7.3 Spelling words (FR-45)

- A word is added when grading reports a spelling error (hint produced by the `grade` call under TD-3); that error counts as a wrong attempt on that date.
- Same replay as 7.1 on `spelling_attempt`: wrong → due +1/+3/+7; two correct attempts ≥3 days apart → retired.
- Per session: due words first (oldest due first), then not-retired words least recently tested; 10–15 words (5 on a light day). Block skipped if no words.
- Graded by code: case-insensitive exact match after trimming.

## 8. Answer checking

1. **Submit** (FR-19): all inputs at once; stored numbered by item.
2. **Pre-check in code** (FR-21): blank answers and symbols not in `accepted_shorthands` (empty at start) → inline question per item ("Is `+` = correct as is?"). Confirming a shorthand adds it to `accepted_shorthands`. Grading starts when no questions remain.
3. **`grade` call** with items, expected answers, the learner's answers and the cited rule sections. Returns per item: verdict (`correct` / `wrong` / `rule_gap` / `defect` / `needs_clarification`), fix, rule section, short explanation, vocabulary note (FR-27), spelling errors with hints; session level: patterns (FR-22), tomorrow's review list, rule-gap proposals.
   - `needs_clarification` → back to step 2 for those items, then only those are re-graded.
   - `defect` → item status `defect`, logged (FR-23).
4. **Tone check in code** (FR-26): feedback text containing "again", "spoiled", "missed", or a repeat count → treated as an invalid response (retry once).
5. **Apply** in one transaction: answers, errors (FR-29), spelling words, rule gaps, feedback.
6. **After grading**, per item: **Dispute** (FR-24), **Inattention** tag (FR-25, wrong items only), **Rule gap** approve / reject (D2).

### 8.1 Disputes (FR-24)

The learner writes an objection inline → `dispute` call returns the app's position with rule section and sources → the learner chooses **Keep grade**, **Count as correct** or **Drop item**. Stored in `answer.dispute_*`; scores and schedule recompute automatically.

### 8.2 Scores

Block score = correct / counted, where counted = active items with verdict `correct` or `wrong`. Speaking blocks are not scored. Shown in tabular numbers, no colours without words (`DESIGN.md`).

## 9. Rulebook (FR-12…FR-18)

- Rules page: list by topic, rule view (Markdown rendered: Formula table → Examples → Explanation → Traps → Sources), version history, manual edit (= new version with reason).
- `rule_draft` prompt enforces FR-13…FR-16 and the shared skeleton; output is reviewed before save (D3).
- Rule gaps (FR-18): approve → new rule version from the proposal, answer becomes `correct`.
- Rule language = `native_language`; examples in English.

## 10. LLM integration (TS-3…TS-5)

Call kinds: `rule_draft`, `generate_session`, `validate_session`, `grade`, `dispute`. Each has `prompts/<kind>.md` and `prompts/<kind>.schema.json`. A user copy in `<app data>/prompts/` overrides the bundled one (NF-3).

Invocation (stdin = user prompt with the assembled context):

```
claude -p --output-format json --json-schema '<schema>' --system-prompt '<prompt file>'
       --tools "" --model <model.kind> --no-session-persistence --strict-mcp-config
       [--max-budget-usd <budget>]
```

- Working directory: app data dir (no `CLAUDE.md` there). `--bare` is not used: it disables OAuth sign-in.
- Timeout 180 s, then the process is killed.
- Response: CLI JSON envelope → structured result → validated with Ajv against the same schema (TS-5) → retry once → error shown. Every call is logged in `llm_call` with the cost reported by the CLI (NF-6).
- To verify in the first implementation task (spike): the envelope field names for the structured result and cost, and whether `--json-schema` takes inline JSON.

### 10.1 Finding `claude` (NF-8, approved point 4, **changed**)

The shell plugin only runs programs listed in the capability scope at build time; a path typed in Settings cannot be allowed at runtime. So:
- Scope lists fixed locations: `$HOME/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude` (arguments limited by validators to the flags above).
- Startup check runs `claude --version` and `claude auth status --json` at each location; the first that works is used.
- If none works, the setup page lists the locations checked and the fix: install with the official installer, or `ln -s "$(which claude)" ~/.local/bin/claude`, then run `claude` and sign in.
- To verify in the spike: that `$HOME` expands in the scope `cmd`.

## 11. UI (S1)

Sidebar: Today, Progress, Rules, Error bank, Settings (Words, Writing, Speaking hidden until S2/S3). All per `DESIGN.md`: warm dark default + paper theme, Literata bundled locally, no modals (inline fields, rule side panel 420px), verdicts with icon + word, spellcheck/autocorrect off in answer inputs, keyboard: ⌘↵ submit, ⌘K command menu deferred to S2.

- **Progress:** consistency grid (D17), progress log per session (date, score per block, errors, patterns, disputes, defects), open topics table (7.1), cost per session.
- **Error bank:** table was → should be, kind, topic, date; filter by kind and topic.
- **Settings:** native language, model per call kind, budget (optional), theme, `claude` status, "Open prompts folder".

## 12. Error handling

- CLI missing / not signed in → setup page (10.1), never a silent failure.
- CLI error, timeout, invalid JSON, schema or validation failure → one retry → inline Dusk Note notice with the exact message and **Retry**.
- DB writes per operation are transactions; a failed generation saves nothing.
- Migrations run at startup; a failed migration stops the app with the error shown.

## 13. Testing

- **Vitest, pure logic:** calendar, error-spotting topic set, scheduling replay (open, restart, close, support, overdue, inattention, drops), spelling selection, scores, consistency, TD code checks, shorthand pre-check, tone check, context assembly.
- **Vitest + better-sqlite3:** migrations and repos against the real SQL.
- **Flow tests with FakeLlm:** generate → validate → submit → clarify → grade → dispute / drop → recompute; invalid response → retry → error.
- **UI:** Playwright screenshots of each page state against Vite with the `preview` adapters (DESIGN.md requirement).
- **Manual on macOS:** real `claude` calls (cannot run in CI; needs sign-in).
- `tsc --noEmit` and ESLint clean.

## 14. Not in S1

Writing, metric, vocabulary and preposition decks, exports, speaking recording/Whisper, ⌘K command menu, iOS.

## 15. Open points to confirm at review

1. 10.1 replaces the "custom path in Settings" from approved point 4 (not technically possible with a scoped shell permission).
2. 4.1 makes open topics derived instead of stored.
3. 7.2 defines "without support" as not opening the rule panel from that block.
4. Inattention errors from the last 14 days feed error-spotting texts (6.1 step 2): is 14 days right?
