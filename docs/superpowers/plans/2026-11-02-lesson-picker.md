# Lesson picker and lasting generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The learner ticks which blocks and task formats a lesson or an added round gets, and generation survives leaving the Today page.

**Architecture:** A `LessonChoice` flows from a picker UI into `generateSession` / `extendSession`, which build the generation context's block list from it (one generate call). The choice is stored on the session for rebuilds. A `GenerationProvider` above the routes owns the running job; a core guard refuses concurrent jobs.

**Tech Stack:** React 19, Tailwind 4 + shadcn, Vitest, Playwright preview mode (`/?state=<fixture>#/route`), sql.js / SQLite migrations, Yarn 4.

**Spec:** `docs/superpowers/specs/2026-11-02-lesson-picker-design.md`

## Global Constraints
- Copy (ru / en), exact:
  - rows: "Повторение"/"Review"; "Задание: вставить пропуск"/"Task: fill the gap"; "Задание: исправить предложение"/"Task: fix the sentence"; "Задание: найти ошибки"/"Task: find the errors"; "Правописание"/"Spelling"; "Говорение"/"Speaking";
  - reasons: "нет темы недели"/"no topic this week"; "нет правила"/"no rule"; "нет тем"/"no topics";
  - add-round button: "Добавить"/"Add".
- One generate call per lesson / added round. `formats` order is always gap, fix, spot.
- Migration 0004 adds a nullable `session.choice` TEXT (JSON); old rows stay valid.
- Busy result: `{ ok: false, code: 'busy', message: 'A lesson is already being generated' }`.
- If yarn cannot download itself, prefix commands with `COREPACK_NPM_REGISTRY=https://registry.npmjs.org NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- `tests/e2e/csp.spec.ts` fails for an environmental reason (Vite HMR socket blocked); ignore it.
- Commit trailer (blank line before), naming the model that wrote the commit:
  - `Co-Authored-By: Claude <Model> 5.5 <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01HffEzRYnBmhZeBJTJZ7L3o`

## Review Focus
1. A day outside the programme (`plan.kind === 'review_only'`, `weekNo` null) → gap/fix rows disabled "нет темы недели", lesson still starts with review/spelling/speaking. Test in Task 1.
2. Choice with only spelling ticked → the lesson is built without any LLM call (no review, task or speaking block to generate). Test in Task 2.
3. Rebuild of a pre-migration session (choice NULL) → uses today's defaults, no crash. Test in Task 2.
4. Leaving Today while an added round generates, then pressing nothing → exactly one round is added. Test in Task 4 (e2e) and the core guard test.
5. Extra round with spot ticked and no spotting topics → spot row disabled, no LLM call with an empty topic list. Test in Task 3.

---

### Task 1: Choice model and options (pure core)

**Files:** Create `src/core/session/choice.ts`; Test `tests/core/session/choice.test.ts`.

**Interfaces (Produces):**
- `type TaskFormat = 'gap' | 'fix' | 'spot'`
- `interface LessonChoice { review: boolean; formats: TaskFormat[]; spelling: boolean; speaking: boolean }`
- `type RowReason = 'no_week_topic' | 'no_rule' | 'no_topics'`
- `interface LessonOptions { reviewAvailable: boolean; formats: Record<TaskFormat, RowReason | null>; defaults: LessonChoice }` (null = available)
- `lessonOptions(deps: Deps, d: ISODate, rest: boolean): Promise<LessonOptions>`. Uses `loadDayInfo`, `spottingTopics`, the week topic (`topics.find(t => t.weekNo === plan.weekNo)`), `info.rules`. Review is available when the review input or the due topics would be non-empty. Use the same sources `buildGenerationContext` uses: export a small helper from context.ts if needed, without duplicating logic.
- `normaliseChoice(c: LessonChoice): LessonChoice`: formats deduped and sorted gap, fix, spot.

- [ ] **Step 1: failing tests:**
  - normal learn day: the defaults tick the programme's format only (`plan.task.format`), plus spelling, speaking, and review if available;
  - spot day: spot ticked; gap/fix available with the week topic;
  - rest day: only review (if available) and spelling;
  - outside the programme: gap/fix `no_week_topic`, spot `no_topics` when none;
  - week topic without rule: gap/fix `no_rule`;
  - `normaliseChoice` order and dedupe.
  
  Build fixtures the way `tests/core/session/*.test.ts` already do (look for a programme/seed helper there).
- [ ] **Step 2:** run `yarn vitest run tests/core/session/choice.test.ts` → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** PASS. Then `yarn typecheck`, `yarn lint`.
- [ ] **Step 5:** commit `feat(lesson): choice model and options`.

### Task 2: Generation from a choice (context, validation, prompt, storage, rebuild)

**Files:** `src/core/session/context.ts`, `src/core/session/validation.ts`, `src/core/session/generate.ts`, `src/core/db/repos/sessions.ts`, new `src/db/migrations/0004_session_choice.sql`, `prompts/generate_session.md`, `src/adapters/preview/previewLlm.ts` (only if needed), tests in `tests/core/session/`.

**Interfaces:**
- `buildGenerationContext(deps, d, light, choice?: LessonChoice)`: without a choice, today's behaviour.
- `BlockSpec` gains `topicKey?: string`.
- `GenerationContext.taskTopic` = the gap/fix topic (the week topic) when gap or fix is chosen; on a notice-topic spot day with only spot chosen, it stays the notice topic.
- `generateSession(deps, { light, choice? }, onStage)`: stores `JSON.stringify(normaliseChoice(choice))` in `session.choice`.
- `rebuildSession` reads it back (NULL → defaults from `lessonOptions`).
- `getSessionChoice(db, sessionId): Promise<LessonChoice | null>` in sessions.ts.

- [ ] **Step 1: failing tests:**
  - the context for `{formats:['gap','spot']}` has task blocks gap (topic = week topic) and spot, and its render contains `N. task (format gap, topic <key>)` and `N. task (format spot)`;
  - speaking unticked → no speaking block;
  - `violations` flags a wrong format in the second task block and accepts the right sequence;
  - spelling unticked → no spelling block written;
  - only spelling ticked → lesson created with no `generate_session` call;
  - the choice is stored, and a rebuild reuses it;
  - a rebuild of a session with NULL choice works.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** implement.
  - `violations`: compare kinds in order, and the formats of task blocks, against `ctx.blocks`. This replaces the single `taskFormat` check.
  - Prompt: replace "in this order: review block (kind "review"), task block (kind "task"), speaking block (kind "speaking")" with "exactly the blocks listed under "Blocks to produce", in that order; there may be several task blocks". Make the task-block rule say "each task block follows its listed format: gap or fix on the listed topic's rule; spot over the error-spotting topics (or the listed notice topic)".
  - Check the preview LLM still parses the lines (its regex expects `N. kind (format f[, topic k])`).
- [ ] **Step 4:** GREEN. Then `yarn vitest run`, typecheck, lint, `yarn playwright test tests/e2e/screenshots.spec.ts tests/e2e/spot.spec.ts` (no regressions).
- [ ] **Step 5:** commit `feat(lesson): generate from a choice`.

### Task 3: Added round with formats

**Files:** `src/core/session/extend.ts`, `src/core/session/validation.ts`, `prompts/generate_session.md` (Extra set rule), `src/core/session/choice.ts` (`extendOptions`), tests.

**Interfaces:**
- `extendOptions(deps, sessionId): Promise<{ formats: Record<TaskFormat, RowReason | null>; defaults: TaskFormat[] }>`. The default is the first round's task format if gap or fix, else fix. gap/fix are disabled with `no_topics` when no topic exists. spot is disabled with `no_topics` when the spotting topics are empty.
- `extendSession(deps, sessionId, formats: TaskFormat[], onStage?)`.

- [ ] **Step 1: failing tests:**
  - `['fix','spot']` gives one generate call with two task blocks; the spot block uses `ctx.spotTopics`;
  - the "6 to 8 items" check applies to gap/fix only;
  - empty formats → `{ ok:false }` with no call;
  - spot with no spotting topics → refused with no call;
  - the existing extend tests keep passing with `['fix']` / their first-round format.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** implement. In the prompt's "Extra set" rule: "produce only the task blocks it asks for (formats as given), each gap or fix block with 6 to 8 items on its topic, each spot block as usual". Keep "none repeating a prompt listed there".
- [ ] **Step 4:** GREEN, full vitest, typecheck, lint.
- [ ] **Step 5:** commit `feat(lesson): added round with chosen formats`.

### Task 4: Generation outlives the page

**Files:** new `src/core/session/jobLock.ts`, `src/core/session/generate.ts`, `src/core/session/extend.ts`, new `src/ui/app/GenerationProvider.tsx`, `src/ui/app/routes.tsx`, `src/ui/pages/Today.tsx`, tests `tests/core/session/jobLock.test.ts`, `tests/e2e/lesson-picker.spec.ts` (new).

**Interfaces:**
- `withJobLock<T>(db: Db, job: () => Promise<T>, busy: T): Promise<T>`, keyed by a `WeakSet<Db>`. `GenerateErrorCode` gains `'busy'`.
- `useGeneration(): { running: boolean; progress: { stage: GenStage; attempt: number } | null; error: GenError | null; run(job: (onStage: OnStage) => Promise<GenerateResult>): Promise<void>; clearError(): void; version: number }`. `version` increments when a job ends, so Today reloads.
- Today uses `useGeneration()` instead of its local `starting` / `generating` / `progress` / `genError` state. Keep its behaviour (refresh after an added round, the focus reload skipped while running).

- [ ] **Step 1: failing tests:**
  - unit: two concurrent `extendSession` calls → one runs, the other returns `code 'busy'`, and only one round exists;
  - e2e: on `/?state=graded#/today` start an added round. The preview LLM answers instantly, so add a preview-only delay hook only if needed. Navigate to Настройки and back, and assert the loader or the new round is shown and no second round can be added while running. If instant preview answers make this untestable, assert instead that after returning there is exactly one added round and say so in the report.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN, full vitest, typecheck, lint, spot + screenshots e2e.
- [ ] **Step 5:** commit `feat(lesson): generation outlives the Today page`.

### Task 5: Picker before a lesson (UI)

**Files:** `src/ui/today/StartSession.tsx`, new `src/ui/today/LessonPicker.tsx`, `src/ui/pages/Today.tsx`, i18n `en.ts` / `ru.ts`, `tests/e2e/lesson-picker.spec.ts`.

**Interfaces:**
- `LessonPicker({ lang, options, value, onChange, disabled })` renders the rows (Global Constraints copy) as labelled checkboxes. Use the app's existing checkbox/toggle pattern; check `src/ui/components/ui/` and the setup form first. Disabled rows show their reason.
- `StartSession` loads `lessonOptions` and keeps the choice in state, initialised from `defaults`. `onStart(light, choice)`. The button is disabled when nothing is ticked.

- [ ] **Step 1: failing e2e:**
  - `/?state=no_session#/today` shows the rows with the defaults ticked;
  - unticking "Говорение" and starting gives no speaking block;
  - ticking "Задание: найти ошибки" as well gives two task blocks;
  - unticking all disables "Начать сессию";
  - `/?state=rest#/today` ticks only review (if shown) and spelling.
- [ ] **Steps 2–4:** RED, implement, GREEN. Also run screenshots and grove e2e (update only assertions that the new rows legitimately change, and list them).
- [ ] **Step 5:** commit `feat(lesson): picker before a lesson`.

### Task 6: Picker for an added round (UI)

**Files:** `src/ui/today/LessonClosed.tsx` (or wherever `today.addMore` is rendered), `src/ui/pages/Today.tsx`, i18n, `tests/e2e/lesson-picker.spec.ts`.

- [ ] **Step 1: failing e2e (on `/?state=graded#/today`):**
  - pressing "Добавить вопросы" shows the three format rows with the default ticked and a "Добавить" button;
  - ticking spot as well and pressing "Добавить" adds two task blocks;
  - nothing ticked disables "Добавить".
- [ ] **Steps 2–4:** RED, implement (reuse `LessonPicker` with only the format rows), GREEN.
- [ ] **Step 5:** commit `feat(lesson): picker for an added round`.

### Task 7: Docs and full check
- [ ] Note the feature in `docs/superpowers/handoff.md` (spec and plan paths, preview states used). Close nothing in `s1-decisions.md` unless an item matches.
- [ ] `yarn typecheck && yarn lint && yarn vitest run && yarn playwright test`: all pass except csp.
- [ ] Commit `docs: lesson picker`.
