# S1 Feedback Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the learner's feedback F1–F7: data folder, code pre-grading, highlighting, pointer cursor, batch disputes, finish/close/extend a lesson, a better loader.

**Architecture:** Logic in pure TS under `src/core` behind the existing ports; Tauri-only code in `src/adapters/tauri`; UI in `src/ui`. One new migration `0002`. Two new Tauri plugins (dialog, persisted-scope), registration only.

**Tech Stack:** Tauri 2, React 19 + TS, Vitest (better-sqlite3), Playwright screenshots, Yarn 4.

**Spec:** `docs/superpowers/specs/2026-10-27-s1-feedback-round.md` (this round) and `docs/superpowers/specs/2026-10-22-s1-core-loop-design.md` (base).

## Global Constraints
- Checks after every task: `yarn typecheck`, `yarn lint`, `yarn test` all clean. UI tasks also `yarn e2e` (Playwright, browser preview mode).
- No SQL in `src/ui` (ESLint guard exists). UI strings only via `t()` with keys in both `src/core/i18n/ru.ts` and `en.ts`.
- Task content stays English; UI text follows the native language.
- Write safety: idempotent upserts, status flips last (S1 spec §3.1).
- Match surrounding code style; comments only where the code does not say it.
- Commit per task, message `feat: …`/`fix: …`, with the session's attribution trailer.

## Review Focus
1. An old DB (S1 schema, sessions without `item.wrong`/`block.round`) opens and its graded sessions render exactly as before → migration defaults + view test on a pre-0002 row (Task 1).
2. A 2+-word answer that only repeats unchanged text ("lives in") or adds a wrong word ("a Spain") must reach the LLM, never be auto-correct → autocheck tests (Task 2).
3. Editing answers after "Finish" asked a question, or reloading mid-extension, must not grade stale text or lose round-1 results → grade test with a graded round 1 + open round 2 (Task 4).
4. Moving the data folder into a folder that already has `enlearn.db`, or into a subfolder of the current one → refused, nothing touched (Task 8 plan tests).
5. A dispute batch whose reply omits one ref → retried once, then an error; nothing saved for the missing ref (Task 5).

---

### Task 1: `item.wrong`, `block.round` and the generator's `wrong` field (Sonnet)

**Files:**
- Create: `src/db/migrations/0002_feedback_round.sql`
- Modify: `prompts/generate_session.md`, `prompts/generate_session.schema.json`, `src/core/llm/types.ts`, `src/core/validate/taskChecks.ts`, `src/core/session/store.ts`, `src/core/db/repos/sessions.ts` (`NewItem`, `insertItem`, `insertBlock`, `GradingItem`, `listGradingItems`), `src/adapters/preview/previewLlm.ts`, `tests/fixtures/llm/generate_session.valid.json`, `evals/fixtures.ts`, `evals/cases/generate/*` if they hold generated items
- Test: `tests/core/validate/taskChecks.test.ts`, `tests/core/session/generate.test.ts`, `tests/core/db/migrate.test.ts`

**Interfaces:**
- Produces: SQL `ALTER TABLE item ADD COLUMN wrong TEXT;` and `ALTER TABLE block ADD COLUMN round INTEGER NOT NULL DEFAULT 1;`
- Produces: `GeneratedItem.wrong: string` ("" for gap items and for fix items whose expected is ✓); schema property `wrong` required, description "Fix items with a correction: the wrong fragment exactly as it appears in the prompt, once; otherwise empty string".
- Produces: `NewItem.wrong: string | null`, `GradingItem.wrong: string | null`; `insertBlock(db, sessionId, ord, spec, round = 1)`.

- [ ] Step 1: failing tests in `taskChecks.test.ts`: `fix item with a correction needs a wrong fragment` (expected "goes", wrong "" → message containing `TD-7: wrong fragment`), `wrong fragment must occur exactly once in the prompt` (prompt "He go and go", wrong "go" → violation; wrong "went" absent → violation), `✓ fix item and gap item must have empty wrong` (non-empty → violation).
- [ ] Step 2: failing test in `generate.test.ts`: a generated fix item's `wrong` is stored in `item.wrong`; spelling and spot items store NULL; blocks get `round = 1`.
- [ ] Step 3: failing test in `migrate.test.ts`: after all migrations an S1-style insert without `wrong`/`round` succeeds and reads back `wrong = NULL`, `round = 1`.
- [ ] Step 4: implement migration, types, schema, prompt line (in the fix item rules: "Also give `wrong`: the wrong fragment exactly as written in the prompt; it must occur once. For ✓ items and gap items `wrong` is \"\"."), checks, store, repo. Update fixtures and the preview LLM so every fix item carries a correct `wrong`.
- [ ] Step 5: `yarn typecheck && yarn lint && yarn test` → all pass. Commit.

### Task 2: Code pre-grading (Sonnet)

**Files:**
- Create: `src/core/grading/autocheck.ts`
- Modify: `src/core/grading/grade.ts`, `src/core/grading/precheck.ts` (built-in shorthands), `src/core/grading/input.ts` only if a helper is shared
- Test: `tests/core/grading/autocheck.test.ts`, `tests/core/grading/grade.test.ts`

**Interfaces:**
- Consumes: `GradingItem.wrong` (Task 1).
- Produces:
  - `normalizeAnswer(s: string): string`
  - `BUILTIN_SHORTHANDS = ['✓', '+']` (exported from `precheck.ts`; `+` and ✓ are always accepted and never asked about)
  - `autoCorrect(item: { format: 'gap' | 'fix'; prompt: string; expected: string; wrong: string | null }, answer: string): boolean`
  - `autoSpot(paragraphText: string, errors: { id: number; prompt: string; expected: string }[], learnerText: string): { found: number[] } | null` (null = send to LLM)

- [ ] Step 1: failing `autocheck.test.ts` cases, with `item = { format: 'fix', prompt: 'She lives in the Spain.', expected: 'Spain', wrong: 'the Spain' }`:
  - `'Spain'`, `' spain. '`, `'in Spain'`, `'She lives in Spain'` → true
  - `'lives in'`, `'a Spain'`, `'the Spain'`, `'Spain is'` → false
  - expected `'✓'`: answer `'✓'` → true, `'Spain'` → false
  - `wrong: null` → only an exact match of `expected` is true (`'in Spain'` → false)
  - gap `{ prompt: 'She ___ to school.', expected: 'goes', wrong: null }`: `'goes'`, `'goes to'` → true; `'to school'`, `'go'` → false
  - curly apostrophe: expected `"don't"`, answer `'don’t'` → true
- [ ] Step 2: failing `autoSpot` cases: paragraph with errors `{wrong 'has went', expected 'has gone'}` and `{wrong 'informations', expected 'information'}`; learner text `'has went → has gone'` → `{ found: [id1] }`; `'has went → has gone\ninformations -> information'` → both found; an extra unpaired line `'the cat → a cat'` → null; a paired line with a wrong correction `'has went → had went'` → null; empty text → `{ found: [] }`.
- [ ] Step 3: failing `grade.test.ts` cases: (a) all items auto-correct and spot code-graded → the fake LLM is never called and the session is graded with those verdicts; (b) one auto-correct and one non-matching item → the LLM batch contains only the non-matching item's ref; (c) answer `+` on a ✓ item → correct with no question asked.
- [ ] Step 4: implement. In `run()` after building `open`/`texts`: auto-correct gap/fix items become `GradeResult.items` entries `{ ref, verdict: 'correct', fix: '', ruleSection: item.ruleSection ?? '', explanation: '', vocabularyNote: '', question: '' }` merged into `graded.result`; code-graded paragraphs become `result.spot` entries `{ blockRef: 'b<ord>', paragraph, found: refs, extra: [] }`; only the rest go into `batch`. Precheck: a symbol in `BUILTIN_SHORTHANDS` maps to ✓ without a question; the grade prompt's shorthand line lists them.
- [ ] Step 5: all checks pass. Commit.

### Task 3: Finish lesson, sticky action bar, skipped items to review (Sonnet)

**Files:**
- Create: `src/ui/today/ActionBar.tsx`
- Modify: `src/core/grading/grade.ts` (`gradeSession` opts), `src/core/session/context.ts` (review input), `src/core/progress/history.ts` only if skipped rows need exposing, `src/ui/today/SessionPage.tsx`, i18n files
- Test: `tests/core/grading/grade.test.ts`, `tests/core/session/generate.test.ts` (context)

**Interfaces:**
- Produces: `gradeSession(deps, sessionId, sub, clarifications, opts?: { finish?: boolean })`; with `finish` every blank gap/fix/spelling item is skipped without a `blank` question.
- Produces: `ReviewEntry` gains `skipped: boolean`; `renderEntries` prints `| skipped` for them and shows the expected answer as fix.
- Produces: `ActionBar({ children }: { children: React.ReactNode })` — `sticky bottom-0` bar with background, top border, padding; later tasks put more buttons in it.
- i18n keys: `today.finish` ("Завершить урок" / "Finish lesson").

- [ ] Step 1: failing grade test: finish with two blank items and one answered → no questions, blanks stored `skipped`, answered graded.
- [ ] Step 2: failing context test: a skipped gap item of the last graded session appears in `reviewInputs` with `skipped: true` and `fix` = expected; spelling and spot items do not.
- [ ] Step 3: implement core; move "Check answers" into `ActionBar` and add "Finish lesson" (secondary) that calls `gradeSession(..., { finish: true })`. ⌘Enter still checks.
- [ ] Step 4: `yarn e2e` passes (update screenshot specs that locate the check button only if the selector changed; keep `#check-answers`). Commit.

### Task 4: Open rounds, "Add more questions", "Close lesson" (Sonnet)

**Files:**
- Create: `src/core/session/extend.ts`, `src/ui/today/LessonClosed.tsx`
- Modify: `src/core/session/view.ts`, `src/core/session/context.ts`, `src/core/session/validation.ts`, `src/core/grading/grade.ts`, `src/core/grading/apply.ts`, `src/core/db/repos/answers.ts` (`appendSessionFeedback`), `src/core/db/repos/sessions.ts`, `src/core/session/plan.ts`, `src/ui/pages/Today.tsx`, `src/ui/today/SessionPage.tsx`, `src/ui/today/SessionHeader.tsx`, `src/adapters/preview/previewLlm.ts` + `fixtures.ts` (a `?state=closed` fixture), i18n
- Test: `tests/core/session/extend.test.ts`, `tests/core/session/view.test.ts`, `tests/core/grading/grade.test.ts`, `tests/e2e/screenshots.spec.ts`

**Interfaces:**
- Consumes: `insertBlock(..., round)` (Task 1), `ActionBar` (Task 3).
- Produces:
  - `ViewBlock.round: number`, `ViewBlock.graded: boolean` (session graded and every active non-question item of the block has an answer row; a speaking block is graded when the session is); answer keys only on graded blocks. `SessionView.open: boolean` = status graded and some block not graded.
  - `extendSession(deps, sessionId, onStage?: (s: GenStage) => void): Promise<GenerateResult>` — today's graded session only, refuses while `open`. Builds a context with one block `{ kind: 'task', format }` and `extra: { prompts: string[] }` (today's prompts, not to repeat); `renderContext` prints "## Extra set" with "6 to 8 items, do not repeat these prompts: …"; `violations` caps the task block at 8 items when `ctx.extra` is set. Writes blocks with `round = max(round) + 1` and `ord` after the last block; no spelling block.
  - `GenStage = 'writing' | 'checking' | 'saving'` (exported from `generate.ts`; Task 6 also passes it from `generateSession`).
  - `gradeSession` accepts `status === 'graded'` when the session is open and grades only active items without an answer row; `applyGraded` calls `appendSessionFeedback` instead of overwrite for a session that already has feedback.
  - `TodayState` `session` gains `closed: boolean`; closing is remembered per session in settings key `closedSessions` (array of ids, last 30 kept) via `closeSession(db, id)` in `src/core/db/repos/sessions.ts`.
- i18n keys: `today.close`, `today.closed`, `today.showResults`, `today.addMore`, `today.addingMore`.

- [ ] Step 1: failing `extend.test.ts`: extending a graded session adds one block with round 2 and 6–8 items, keeps round-1 answers; the user prompt contains every round-1 prompt under "Extra set"; extending an open session or another day's session returns an error; a fake LLM returning 9 items gets a check violation and a retry.
- [ ] Step 2: failing `view.test.ts`: round-1 block `graded: true` with `expected`, round-2 block `graded: false` without `expected`; `open: true`.
- [ ] Step 3: failing `grade.test.ts`: grading an open session sends only round-2 refs, keeps round-1 answers untouched, appends patterns.
- [ ] Step 4: implement core.
- [ ] Step 5: UI: per-block graded rendering in `SessionPage` (inputs for open blocks, `GradedItem` for graded ones); ActionBar shown while `status === 'generated' || open`. Graded and not open: header gets "Close lesson". Today: `closed` → `LessonClosed` card with "Show results" (renders the session read-only below) and "Add more questions" (loader from Task 6 once it exists; until then the StartSession skeleton text).
- [ ] Step 6: e2e: add screenshots `today-closed` and `today-open-round` (preview fixtures). All checks pass. Commit.

### Task 5: Disputes in one call (Sonnet)

**Files:**
- Modify: `prompts/dispute.md`, `prompts/dispute.schema.json`, `src/core/llm/types.ts`, `src/core/grading/actions.ts`, `src/ui/today/DisputeField.tsx`, `src/ui/today/ItemActions.tsx`, `src/ui/today/sessionActions.tsx`, `src/ui/today/SessionPage.tsx`, `src/adapters/preview/previewLlm.ts`, i18n
- Test: `tests/core/grading/actions.test.ts`

**Interfaces:**
- Produces: `DisputeBatchReply = { replies: (DisputeReply & { ref: string })[] }`; `disputeItems(deps, entries: { itemId: number; text: string }[]): Promise<LlmResult<DisputeBatchReply>>` (all items of one session; one call; check = every sent ref returned, refs `d1..dN` in send order); `disputeItem(deps, itemId, text)` = `disputeItems` with one entry, return type unchanged for its callers (map to that item's reply).
- Produces: `SessionActions.disputes: Record<number, string>`, `setDispute(itemId: number, text: string)`, `sendDisputes(ids?: number[]): Promise<void>`.
- i18n: `dispute.sendAll` ("Отправить возражения ({n})" / "Send disputes ({n})").

- [ ] Step 1: failing tests: two disputes → one LLM call, both replies saved; reply missing one ref → retried once, then error, nothing saved for either; single `disputeItem` still works.
- [ ] Step 2: implement core and the prompt (input is a list of numbered items, each with the fields of today's single message; one reply per ref).
- [ ] Step 3: UI: dispute text lives in `SessionActions`; per-item "Send" sends that one; ActionBar shows "Send disputes (N)" on graded blocks when N ≥ 1 unsent. All checks + e2e pass. Commit.

### Task 6: Loader with stages, estimate and tips (Haiku)

**Files:**
- Create: `src/core/llm/estimate.ts`, `src/core/progress/tips.ts`, `src/ui/today/Loader.tsx`
- Modify: `src/core/session/generate.ts` (`onStage`), `src/ui/today/StartSession.tsx`, `src/ui/pages/Today.tsx`, `src/ui/today/SessionPage.tsx` (grading), `src/ui/today/LessonClosed.tsx`, i18n
- Test: `tests/core/llm/estimate.test.ts`, `tests/core/progress/tips.test.ts`

**Interfaces:**
- Consumes: `GenStage` (Task 4).
- Produces: `estimateMs(db: Db, kinds: LlmKind[]): Promise<number | null>` (sum of per-kind median of the last 5 `ok = 1` durations; null if any kind has none); `waitTips(db: Db, limit = 10): Promise<{ was: string; should: string }[]>` (error-bank wrong answers with a fix, plus spelling words with a mnemonic as `{ was: word, should: mnemonic }`, shuffled); `generateSession(deps, opts, onStage?)`; `Loader({ lang, stages, current, attempt, estimateMs, tips })`.
- i18n: `loader.writing`, `loader.checking`, `loader.saving`, `loader.grading`, `loader.attempt`, `loader.left` ("≈ {s} с"), `loader.longer`, `loader.tip`.

- [ ] Step 1: failing tests: median of [10,30,20] = 20; only last 5 used; failed calls ignored; null without history. Tips: returns at most `limit`; empty DB → [].
- [ ] Step 2: implement; `Loader` ticks once per second, bar capped at 95 %, rotates tips every 6 s, `role="status"`.
- [ ] Step 3: use it for generation, extension and grading. e2e screenshot `today-generating` updated. Commit.

### Task 7: Pointer cursor, stronger highlighting, ✓ button (Haiku)

**Files:**
- Modify: `src/ui/styles/globals.css`, `src/ui/today/GradedItem.tsx`, `src/ui/today/chips.tsx` if needed, `src/ui/today/ItemRow.tsx`, i18n
- Test: `tests/e2e/screenshots.spec.ts`

- [ ] Step 1: CSS base rule per spec F4.
- [ ] Step 2: `GradedItem` per spec F3 (wrong: `rounded-md border-l-[3px] border-destructive bg-destructive/8 px-3 py-2`, learner text `line-through`, fix `font-semibold text-success`).
- [ ] Step 3: fix-format `ItemRow`: small ghost button "✓" (aria-label `input.markCorrect`) right of the input that sets the value to ✓.
- [ ] Step 4: e2e: assert `getComputedStyle(button).cursor === 'pointer'` on the Today page; refresh graded screenshots. Commit.

### Task 8: Data folder (Sonnet)

**Files:**
- Create: `src/core/dataFolder.ts`, `src/adapters/tauri/dataFolder.ts`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `package.json` (`@tauri-apps/plugin-dialog`), `src/adapters/tauri/db.ts` (`openTauriDb(path?: string)` + `close`), `src/ui/app/boot.ts`, `src/ui/app/CoreProvider.tsx` (`dataDir`, `moveDataDir?`), `src/ui/pages/Settings.tsx`, i18n, `docs/macos-checklist.md`, `README.md` (what the folder holds)
- Test: `tests/core/dataFolder.test.ts`

**Interfaces:**
- Produces (pure): `planMove(from: string, to: string, present: string[]): { ok: true; copies: { from: string; to: string }[] } | { ok: false; reason: 'same' | 'inside' | 'occupied' }` — `present` = relative paths existing in `from` (`enlearn.db`, `enlearn.db-wal`, `enlearn.db-shm`, files under `prompts/`) plus target probe results passed as `occupied` by the caller; paths compared after trimming trailing `/`.
- Produces (adapter): `readDataDir(appDataDir): Promise<string | null>`, `moveDataDir(current, target, closeDb): Promise<void>` (copy → verify sizes with `stat` → write `location.json` → remove old → caller reloads).
- Rust: `.plugin(tauri_plugin_dialog::init())`, `.plugin(tauri_plugin_persisted_scope::init())` after fs. Capabilities: `dialog:allow-open`; fs `allow-copy-file`, `allow-mkdir`, `allow-remove`, `allow-stat`, `allow-write-text-file`, `allow-read-text-file`, `allow-exists`, `allow-read-dir` with scopes `$APPDATA/**` and `$APPCONFIG/**` (picked folders come in through the dialog's runtime scope).
- i18n: `settings.dataDir`, `settings.dataDirChange`, `settings.dataDirMoving`, `settings.dataDir.err.same|inside|occupied|failed`.

- [ ] Step 1: failing `planMove` tests: same path → `same`; `/a/b` → `/a/b/c` → `inside`; occupied → `occupied`; otherwise the copy list maps every present file under the new folder.
- [ ] Step 2: implement core + adapter + boot (DB at `sqlite:<dir>/enlearn.db` when `location.json` exists, else unchanged `sqlite:enlearn.db`; prompts from `<dir>/prompts`).
- [ ] Step 3: Settings row (preview: read-only path, no button). `cargo check` in `src-tauri` passes; JS checks + e2e pass.
- [ ] Step 4: macOS checklist: steps to verify a move, a restart after a move, and the refusal cases. Commit.

### Task 9: Docs and final review
- [ ] Update `docs/superpowers/s1-decisions.md` (decisions of this round) and `docs/superpowers/handoff.md`.
- [ ] Whole-branch review (Sonnet), fix findings, push.
