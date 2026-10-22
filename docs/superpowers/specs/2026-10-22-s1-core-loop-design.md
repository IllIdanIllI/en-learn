# S1 — Core loop: design spec

Date: 2026-10-22 · Status: draft for review (rev. 2, after independent review)
Requirements: "English Exam Coach — Requirements" v0.2 (21 Oct 2026), `app-design/PRODUCT.md`, `app-design/DESIGN.md`.

## 1. Goal and stages

v1 is split into three stages, each with its own spec → plan → implementation:

| Stage | Content |
|---|---|
| **S1 (this spec)** | Tauri shell, SQLite, `claude` wrapper, programme, day session, validation, answer checking, disputes, rule gaps, error bank, rulebook, re-checks, spelling, progress (no writing metric), README / `.gitignore` |
| S2 | Writing + rewrite, errors-per-100-words metric (FR-32), vocabulary decks, preposition deck, Markdown / Obsidian export (FR-11 export, NF-2), ⌘K command menu |
| S3 | Speaking: schemes, recording, local Whisper |

S1 acceptance = requirements §7 criteria 1–5.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Target macOS first. Core free of platform code so iOS stays possible later (only adapters change). Windows/Linux: best effort. |
| D2 | Answer that is natural English but not covered by the rulebook → verdict `rule_gap`, excluded from score; approving the proposed rule edit makes it count as correct; rejecting keeps it excluded. |
| D3 | The app may propose a rule for a programme topic (FR-9), but writes it only after the learner confirms. |
| D4 | A topic closes after **2 correct checks on dates ≥3 days apart, without support, with no error on that topic in between** (FR-31). Basis: successive relearning (Rawson et al. 2018; Vaughn & Rawson 2011). |
| D5 | An error on an open or closed topic **restarts** the series: checks at +1/+3/+7 from the error date, successes reset. |
| D6 | Validation TD-1…TD-8 = code checks + a second LLM call (6.3). |
| D7 | Obsidian export is one-way (S2). |
| D8 | Native language default: Russian (configurable: Russian, English). It applies to rules **and UI text** (NF-5); tasks are in English. |
| D9 | Seed data written from scratch: sample 3-week programme + rules for its topics, with sources. Placement test = future idea. |
| D10 | Learner enters vocabulary manually (S2). |
| D11 | Model is a setting per call kind; default `claude-sonnet-5-5`; any kind can be switched to `claude-haiku-5-5`. `--max-budget-usd` is an optional setting, empty by default (learner's decision; deviates from TS-3/NF-6 wording "per call cap"). |
| D12 | Tests: Vitest for logic; Playwright screenshots for UI. Yarn 4 (corepack), `node-modules` linker. |
| D13 | Architecture: everything in the webview with a pure TypeScript core. |
| D14 | Migrations: numbered `.sql` files run by TypeScript; plain SQL in typed repo functions, no ORM; user prompt passed to `claude` as the last argument after `--` (`claude -p` waits for stdin EOF and the Tauri shell cannot close stdin). |
| D15 | Spelling is in S1. The speaking question is shown as text only until S3. |
| D16 | Until S2/S3, slots that need writing or recording produce review + error spotting (table 6.1). |
| D17 | Consistency = practised days in the last `N` days, `N = min(days since first session, 100)`; light days counted separately. |
| D18 | Open topics, error bank, scores, progress log and spelling word state are **derived** from stored answers, never stored (4.1). |
| D19 | "Without support" = the learner did not open the rule of that topic during that session before submitting. |
| D20 | Inattention errors from the last 14 days feed error-spotting texts (FR-25). |
| D21 | `claude` is looked up at fixed locations (10.2); no custom path setting. |
| D22 | Topics removed from the programme but still referenced are archived (`topic.archived = 1`, `week_no = NULL`) and no longer appear in error-spotting texts. |
| D23 | `fix` sentences are shown unmarked (no brackets or underline); the learner answers `✓` or the corrected fragment, and the wrong fragment occurs exactly once in the sentence. |
| D24 | Task content is always English; a code check rejects Cyrillic letters in it (6.3). Block titles and instructions are exempt. |

## 3. Architecture

- **Tauri 2.** Rust only registers plugins: `tauri-plugin-sql` (sqlite), `tauri-plugin-shell` (scoped to `claude`), `tauri-plugin-fs` (read-only scope `$APPDATA/prompts/**`). No custom Rust commands.
- **React + TypeScript + Vite**, shadcn/ui + Tailwind, styled per `DESIGN.md`. UI strings in a small dictionary module (`ru`, `en`).
- **Core** (`src/core`) is pure TypeScript and depends only on `ports.ts`:

```ts
interface Db { execute(sql: string, params?: unknown[]): Promise<void>; select<T>(sql: string, params?: unknown[]): Promise<T[]>; }
interface Llm { call<T>(req: LlmRequest): Promise<LlmResult<T>>; }   // kind, systemPrompt, userPrompt, schema, model, budget, timeoutMs
interface Clock { today(): string; now(): string; }                    // local YYYY-MM-DD / ISO
interface PromptStore { load(kind: string): Promise<{ system: string; schema: object }>; }
```

- **Adapters:** `tauri/` (TauriDb, ClaudeCli, PromptStore), `test/` (better-sqlite3 Db, FakeLlm), `preview/` (sql.js Db + FakeLlm; only to run the UI in a browser for Playwright screenshots). Migrations use only SQL supported by all three engines (no `RETURNING`, no JSON functions).
- The UI never writes SQL and never spawns processes; it calls core functions.
- Today page re-reads `Clock.today()` on window focus (midnight rollover).

### 3.1 Write safety (no cross-call transactions)

`tauri-plugin-sql` runs on a connection pool, so `BEGIN … COMMIT` across separate calls is not reliable. Design instead:
- **Session generation:** rows are written with `session.status = 'draft'`; the status flips to `generated` as the last write. Drafts are deleted at startup and before a new generation.
- **Grading:** writes are idempotent upserts keyed by `item_id`; `session.status = 'graded'` is the last write. If applying fails, the learner can press **Retry**, which re-applies the same graded result (kept in memory) without a new LLM call.
- Spike verifies whether the plugin supports multi-statement `execute`; if it does, related writes are batched.

### 3.2 Project layout

```
src-tauri/            Rust setup, capabilities
prompts/              <kind>.md + <kind>.schema.json (imported into the bundle with Vite ?raw)
seed/                 programme.json, rules/*.md
src/core/             ports, domain types, db (migrations runner + repos), programme, schedule,
                      session, validate, grading, rules, progress, i18n
src/adapters/         tauri/, test/, preview/
src/db/migrations/    0001_init.sql, ...
src/ui/               pages and components
README.md             setup in <10 min, what is sent to Anthropic (NF-7, NF-9); LICENSE (MIT, exists)
.gitignore            node_modules, dist, target, *.db, *.sqlite (NF-2)
```

## 4. Data model

| Table | Fields |
|---|---|
| `meta` | schema_version |
| `settings` | key, value: `native_language`, `model.<kind>`, `budget_usd`, `accepted_shorthands` (JSON, seeded `["✓"]`), `spelling_variant` (`british` default / `american`), `theme` |
| `programme` | id, title, start_date, end_date. **One programme** in S1 (setup replaces it only when the learner confirms). |
| `topic` | id, key (unique slug), title, kind (`learn` / `notice`), week_no (NULL = background; at most one topic per week_no) |
| `weekday_slot` | weekday (1 = Mon … 7 = Sun, PK), slot (`error_spotting` / `topic` / `second_set` / `speaking` / `writing` / `review_rewrite` / `rest`) |
| `rule` | id, topic_id (unique), current_version |
| `rule_version` | rule_id, version, body (Markdown, FR-14 skeleton), sources (JSON), reason, created_at |
| `session` | id, date (unique), title, is_light, status (`draft` / `generated` / `graded`), created_at, graded_at |
| `session_support` | session_id, topic_id — rule of that topic opened before submit (D19) |
| `block` | id, session_id, ord, kind (`spelling` / `review` / `task` / `speaking`), format (`gap` / `fix` / `spot` / `spelling` / `question`), title, instruction, format_example, passage (JSON paragraphs, `spot` only), minutes |
| `item` | id, block_id, ord, prompt, expected, paragraph (`spot` only), topic_id (NULL for spelling), rule_id, rule_version, rule_section, spelling_word_id (spelling only), is_check (bool), status (`active` / `dropped` / `defect`), note |
| `answer` | item_id (PK), text, verdict (`correct` / `wrong` / `rule_gap` / `skipped`), fix, rule_section, explanation, vocabulary_note, is_inattention, dispute_text, dispute_reply, dispute_decision (`keep` / `correct` / `drop`) |
| `spot_answer` | block_id, paragraph, text — raw learner lines for a `spot` paragraph |
| `extra_finding` | block_id, paragraph, text, explanation — a `spot` correction that was not an error (shown, not scored) |
| `session_feedback` | session_id (PK), patterns (JSON), tomorrow (JSON) — display only |
| `rule_gap` | id, item_id, rule_id, proposal (full new body), explanation, sources (JSON), status (`pending` / `approved` / `rejected`) |
| `spelling_word` | id, word (unique), hint, mnemonic, created_at |
| `spelling_attempt` | word_id, session_id, correct — one row per word per session |
| `llm_call` | id, session_id (NULL for rule drafts), kind, model, cost_usd, duration_ms, ok, error, response (raw text, for debugging), created_at |

### 4.1 Derived data (computed in TypeScript, NF-4)

**Effective verdict** of an answer, used by everything below:
1. item `dropped` / `defect`, or `dispute_decision = drop` → not counted;
2. `dispute_decision = correct` → `correct`;
3. `rule_gap` with approved gap → `correct`; pending or rejected → not counted;
4. `skipped` → not counted;
5. otherwise the stored verdict.

Derived from it: block and session scores (8.4), open topics (7.1), spelling word state (7.2), **error bank** (rows: was = answer text, should be = fix, kind = `spelling` for spelling items / `inattention` if tagged / `grammar` otherwise, topic, date = session date; from graded sessions only), progress log and consistency (11).

## 5. Programme

- **Setup page** (first launch): title, start/end dates, one topic per week (hardest → easiest, kind `learn` / `notice`), background topics, slot per weekday. Prefilled from `seed/programme.json`; seed rules are inserted with their topics.
- **Calendar** (pure functions): `weekNo(date) = floor(daysBetween(start, date) / 7) + 1`; slot from `weekday_slot`; dates outside start…end → `review_only` day (title "Review, Tue 20 Oct").
- **Error-spotting topics** for week N: topics with `week_no ≤ N` + background topics (FR-2), only those **with a rule** (TD-5). Topics without a rule are listed on Today as "No rule yet" with **Draft rule**.
- **Missed days** don't shift anything: the calendar is date-based; overdue checks are carried into the next session (FR-5).
- **Light day** (FR-4): toggle on Today. Content: spelling (5 words), review (≤5 items), speaking question (text). Never counted as missed. Logged as `is_light` and shown as "Light day" in the progress log.

## 6. Day session

### 6.1 Blocks per slot

| Slot | Task block (S1) |
|---|---|
| `error_spotting` | `spot`: text on the error-spotting topics (§5) + inattention errors (D20) |
| `topic` | week topic, `learn`: gap or fix task on its rule. Week topic `notice`: `spot` instead (FR-3) |
| `second_set` | if the week topic had a counted wrong answer this week: second set on it; else `spot` |
| `review_rewrite`, `speaking`, `writing` | `spot` (D16) |
| `rest` / `review_only` | no task block |

Every session: spelling (if words due, 7.2) → review (if anything to review) → task → speaking question (text). Vocabulary block (FR-7 #5) is S2. S1 gives one speaking question, always "Describe a time when…" (FR-33; the second question is S3). On a `rest` day Today says "Rest day" and offers **Start light day**.

### 6.2 Generation

1. **Rule check (FR-9, D3):** if the task block needs a topic with no rule, Today shows "Rule for *topic* is missing" with **Draft rule** (9). Generation is blocked until it is saved.
2. **Context (TS-4)** from the DB: date, week, slot, light flag, task topic with its rule (current version), error-spotting topics with rules, review input = counted wrong answers of the **last graded session** (FR-8 says "yesterday"; after missed days the last graded session is used), inattention errors from the last 14 days, topics with checks due today or overdue (7.1) with rules, spelling words due (7.2).
3. **`generate_session` call** → JSON per schema: blocks (format, instruction, filled format example, minutes) and items (prompt, expected, topic key, rule section, `is_check`), or for `spot`: paragraphs + hidden errors (paragraph, wrong fragment, correction, topic key, rule section).
   - Review block: ≤12 items (light ≤5); omitted if no input. Every due topic gets ≥1 item in the review block with `is_check = true`.
   - Spelling items are built by code (prompt = stored hint, expected = word), not by the LLM.
   - Correct items in `fix` tasks have expected `✓`.
4. **Validation** (6.3), then the session is written as `draft` and flipped to `generated` (3.1). Title: "Week 3, Tue 20 Oct · Conditionals" (topic title capitalised as stored).
5. **Attempts:** at most 2 generation attempts per **Start session** press. Each attempt costs one `generate_session` + one `validate_session` call. After 2 failures: error notice with **Retry**.

### 6.3 Validation (TD-1…TD-8)

Code checks (run on the generated JSON, and again after defect items are removed):
- TD-1: one format per block; `format_example` present; blanks are exactly `___`; no standalone placeholder token (`-`, `–`, `—`, `…`, `_` runs other than `___`) between spaces or brackets.
- TD-4: every `fix` block has ≥1 item with expected `✓` and ≥1 with a correction.
- TD-7: in `fix` and `spot`, every correction is 1–2 words.
- English only (D24): any Cyrillic letter in task content (item prompt and expected, paragraph text, error wrong and correction, question, format example) is a violation `EN: task content must be English`; block title and instruction are exempt.
- TD-8: `spot` paragraphs are single lines; 5–7 hidden errors per paragraph.
- Every topic key exists and has a rule; every rule section exists in that rule; every due topic has a check item in the review block; minimum 3 items per `gap` / `fix` block.

LLM check — `validate_session` (TD-2, TD-3, TD-5, TD-6): per item `ok` or `defect` + reason. Defect items: `status = defect`, hidden, logged (FR-23). If the code checks fail after removal (e.g. a `spot` paragraph drops below 5 errors), the attempt fails (6.2 step 5). Acceptance criterion 3 relies on this call for TD-2.

### 6.4 Today page states

`no programme` → setup · `rule missing` → draft rule · `rest day` → message + Start light day · `no session` → empty state, **Start session**, Light day toggle · `generating` → skeleton + "Building today's session…" · `generated` → full session, key hidden, **Check answers** (⌘↵), ghost **Rebuild** (discards the ungraded session; also used to switch light day on/off) · `needs clarification` → inline questions · `graded` → feedback summary on top, verdicts per item.

Ungraded sessions from earlier days stay viewable, are not counted as practised, and are ignored by context and scheduling.

## 7. Scheduling

### 7.1 Topic checks (FR-30, FR-31, D4, D5)

Input: graded sessions in date order. Per topic, keep state: `status` (none / open / closed), `pending` (set of due dates), `successes` (list of dates), `history` (date, event).

For each session date `d`, take the topic's **counted** answers in that session (effective verdict `correct` / `wrong`, not inattention). Evaluate **once per (topic, session)**:
1. Any `wrong` → **error**: status open (reopens a closed topic), pending := {d+1, d+3, d+7}, successes := [], history += "error".
2. Else, if status open and some pending date ≤ d and the topic has a counted `is_check` item in the session → **check passed**: remove all pending dates ≤ d; if the topic is not in `session_support` for this session, successes += d; history += "check correct" (or "check correct, with support").
   - If successes holds two dates ≥3 days apart → status closed, pending := {}, history += "closed".
   - Else if pending is empty → pending := {d + 3} (the topic never stays open without a next check).
3. Otherwise → no event.

Topic kind (`learn` / `notice` / background) does not change the rules. Output per topic: status, history, linked rule, next check dates. "Due today" = pending dates ≤ today.

Example: error on day 0 → checks 1, 3, 7. Correct on 1, 3, 7 without support → successes [1, 3, 7] → closes on day 7 (1 and 7 are 6 days apart; 1 and 3 are not enough).

### 7.2 Spelling words (FR-45)

- A word is created when grading reports a spelling error in any answer (hint from the `grade` call, TD-3). It counts as a wrong attempt in that session (deduplicated: one attempt per word per session; wrong wins).
- Same replay as 7.1 per word on `spelling_attempt` (no support concept): wrong → due +1/+3/+7 (reactivates a retired word); two correct attempts ≥3 days apart → retired; pending empty and not retired → due d+3.
- Selection per session: due words (oldest due first) up to 15; if fewer than 10, fill with non-retired words tested least recently, up to 10. Light day: 5. Block omitted if no words.
- Graded by code: trimmed, case-insensitive exact match against the word in `spelling_variant`.
- After grading, each spelling item shows an inline **Mnemonic** field (saved to `spelling_word.mnemonic`); the mnemonic is shown with the item in later sessions after grading, never before.

## 8. Answer checking

### 8.1 Input

- `gap`, `fix`, `spelling`: one input per item. `fix` placeholder: "✓ or the corrected fragment".
- `spot`: one textarea per paragraph, one correction per line as `wrong → right` (format example shown).
- `question`: no input in S1.
- **Check answers** submits everything at once (FR-19).

### 8.2 Pre-check in code (FR-21)

- Blank answer → inline question: "Skip this item?" Yes → verdict `skipped` (not counted); No → the learner fills it.
- Answer that is only symbols and not in `accepted_shorthands` (e.g. `+`, `v`, `ok`) → "Does `+` mean correct as is?" Yes → added to `accepted_shorthands` and treated as `✓`.
- Grading starts when no questions remain.

### 8.3 Grading

1. Spelling items: graded by code (7.2).
2. **`grade` call** with each item (prompt, expected, rule section text of the item's stored `rule_version`) and the learner's answer; `spot` paragraphs with hidden errors and the learner's lines. Grading accepts any correct fix covered by the rulebook, not only the expected string (TD-7); a correct fix outside the rulebook → `rule_gap` (D2). Returns per item: verdict (`correct` / `wrong` / `rule_gap` / `defect` / `needs_clarification`), fix, rule section, short explanation, vocabulary note (FR-27); per `spot` paragraph: which hidden errors were found, extra findings; session level: patterns (FR-22), tomorrow's review list, spelling errors with hints, rule-gap proposals (full new rule body, explanation, sources).
3. `needs_clarification` → inline question, then only those items are re-graded.
4. **Tone check in code** (FR-26) on prose fields only (patterns, explanations, tomorrow): word-boundary match on a banned list (ru + en: "again", "missed", "spoiled", "снова", "опять", "упустил", …) and repeat counts (`\b\d+\s*(times|раз[а]?)\b`). Failure = invalid response.
5. **Retries** (all calls, 10.1): one retry for invalid JSON / schema / tone failures and timeouts; no retry for not-signed-in or budget-exceeded errors.
6. **Apply** (3.1): answers, `spot` results, extra findings, rule gaps, spelling words/attempts, feedback; status `graded` last.

### 8.4 Scores

Block score = correct / counted (effective verdicts, 4.1). `spot`: one item per hidden error, so score = errors found / errors in the text; extra findings are shown as "Not an error" in feedback and do not affect the score. Speaking is not scored.

### 8.5 After grading (per item)

- **Dispute** (FR-24), on `wrong` and `rule_gap` items: inline text → `dispute` call returns the app's position, rule section and sources → the learner picks **Keep grade**, **Count as correct** or **Drop item** (ghost / secondary buttons, DESIGN.md). Logged in `answer.dispute_*`; everything derived recomputes.
- **Inattention** (FR-25), on `wrong` items: toggle; recomputes the error bank and schedule.
- **Rule gap** (D2): proposal shown inline with **Approve** (new rule version from the proposal) / **Reject**.
- Vocabulary note (FR-27): shown under the item in Dusk Note style, not counted.

## 9. Rulebook (FR-12…FR-18)

- Rules page: list by topic, rule view (Formula table → Examples → Explanation → Traps → Sources; empty sections skipped), version history, manual edit (= new version with reason).
- `rule_draft` call input: topic, native language, the skeleton, and the topic's error-bank rows **excluding inattention** (FR-13, FR-17). Output is shown for review and editing; saved only on confirm (D3).
- Already generated sessions keep their `item.rule_version`; grading uses that version.
- Rule language = `native_language`; examples in English.

## 10. LLM integration (TS-3…TS-5)

Call kinds: `rule_draft`, `generate_session`, `validate_session`, `grade`, `dispute`. Bundled `prompts/<kind>.md` + `prompts/<kind>.schema.json`; a user copy in `<app data>/prompts/` overrides the bundled one (NF-3). Settings shows that folder's path.

### 10.1 Invocation

```
claude -p --output-format json --json-schema '<schema JSON>' --system-prompt '<prompt text>'
       --tools "" --model <model.kind> --no-session-persistence --strict-mcp-config
       [--max-budget-usd <budget>] -- '<user prompt with the assembled context>'
```

The user prompt is the last argument after `--`, not stdin: `claude -p` waits for stdin EOF and the Tauri shell cannot close stdin.

- Working directory: app data dir (no `CLAUDE.md`). `--bare` is not used: it disables OAuth sign-in.
- Env: `PATH` extended with `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` (an npm-installed `claude` needs `node` on PATH; apps started from Finder get a minimal PATH).
- Timeouts: `generate_session` 300 s, others 120 s; then the process is killed.
- Response: CLI JSON envelope → structured result → Ajv validation against the same schema (TS-5) → retry rules in 8.3 step 5 → inline error. Every call is logged in `llm_call` with the CLI-reported cost (NF-6); Progress shows cost per session.
- macOS argument size limit (~1 MB) is far above the prompt sizes; Windows' 32 KB command-line limit may require `--system-prompt-file` later (best effort, D1).

### 10.2 Finding `claude` (NF-8, D21)

- Shell scope: one entry per location — `$HOME/.local/bin/claude`, `$HOME/.claude/local/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude` — each allowing three argument shapes: `--version`; `auth status --json`; the call in 10.1 (fixed flags + regex validators for the schema, prompt, model and budget values).
- Startup check: at each location run `--version`, then `auth status --json`; the first that is installed and signed in is used.
- If none: setup page lists the locations checked and the fix: official installer, or `ln -s "$(which claude)" ~/.local/bin/claude`, then run `claude` and sign in; **Check now** button.

### 10.3 Spike (first implementation task)

Verify, with fallbacks:
1. CLI envelope field names for the structured result and cost; `--json-schema` takes inline JSON; `--model claude-sonnet-5-5` accepted (fallback: aliases `sonnet` / `haiku`).
2. `$HOME` expands in shell scope `cmd` (fallback: setup page asks for the symlink in `/usr/local/bin`).
3. Arg validators accept multi-line values.
4. `tauri-plugin-sql` multi-statement `execute` (3.1).
5. Budget-exceeded error shape.

## 11. UI (S1)

Sidebar: Today, Progress, Rules, Error bank, Settings. Words, Writing, Speaking are hidden until S2/S3 (deviation from DESIGN.md's 8 items, temporary). All per `DESIGN.md`: warm dark default + paper theme, Literata bundled locally, no modals (inline fields, rule side panel 420px), verdicts with icon + word, spellcheck/autocorrect off, ⌘↵ submit.

- **Today:** header line with total minutes and "Read §N before block K" derived from the task block's items; opening any rule from a session records `session_support` (D19).
- **Progress:** consistency grid (10 × 10; days before the first session drawn as empty outlines; practised = sage 70%, light = sage 35%); caption "Practised X of the last N days, Y light" (D17); progress log per graded session (date, light label, score per block, errors, patterns, disputes, defects, cost); open topics table (7.1).
- **Error bank:** derived table (4.1) was → should be, kind, topic, date; filters by kind and topic.
- **Rules:** 9.
- **Settings:** native language, spelling variant, model per call kind, budget (optional), theme, `claude` status, prompts folder path.

## 12. Error handling

- CLI missing / not signed in → setup page (10.2), never a silent failure.
- CLI errors, timeouts, invalid responses → retry rules (8.3 step 5) → inline Dusk Note notice with the exact message and **Retry**.
- Failed generation leaves only a `draft`, removed later (3.1). Failed grading apply → **Retry** re-applies the kept result.
- Migrations run at startup; a failed migration stops the app with the error shown.

## 13. Testing

- **Vitest, pure logic:** calendar and slot table, error-spotting topic set, effective verdict, scheduling replay (open, restart, reopen closed, support, overdue collapse, extra +3 check, closing, drops, inattention, rule gaps, skipped), spelling replay and selection, scores incl. `spot`, consistency, TD code checks, pre-check, tone check, context assembly.
- **Vitest + better-sqlite3:** migrations and repos against real SQL; draft cleanup; idempotent grading apply.
- **Flow tests with FakeLlm:** generate → validate (defect removal, attempt cap) → submit → clarify → grade → dispute / drop / inattention / rule gap → recompute; invalid response → retry → error; no retry on auth error.
- **UI:** Playwright screenshots of every Today state and each page with the `preview` adapters.
- **Manual on macOS:** real `claude` calls (need sign-in; not automatable here).
- `tsc --noEmit` and ESLint clean.

## 14. Not in S1

Writing and FR-32 metric, vocabulary block and decks, preposition deck, FR-11 / NF-2 exports, speaking recording / Whisper and the second daily question, ⌘K command menu, iOS.

## 15. Accepted deviations from the requirements

1. FR-8 "yesterday's mistakes" → mistakes of the last graded session (6.2).
2. D11: budget cap optional, empty by default (TS-3, NF-6).
3. D16: speaking / writing / rewrite slots produce error spotting until S2/S3.
4. DESIGN.md sidebar shows 5 of 8 items until S2/S3.
