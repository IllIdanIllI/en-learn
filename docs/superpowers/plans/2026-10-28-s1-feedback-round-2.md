# S1 Feedback Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** G1–G6 of the spec: calmer tips, styled selects, Opus, effort per call kind, ✓ inside the fix input, lesson stats.

**Architecture:** Same layering as before (core / adapters / ui). No migration: stats are derived from stored CLI envelopes; effort is a setting.

**Tech Stack:** Tauri 2, React 19 + TS, Radix (`radix-ui`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-s1-feedback-round-2.md`

## Global Constraints
- After every task: `yarn typecheck`, `yarn lint`, `yarn test` clean; UI tasks also `yarn e2e`; capability changes also `cargo check` in `src-tauri`.
- No SQL in `src/ui`; UI strings via `t()` with keys in ru and en.
- Match surrounding style; sparse comments.

## Review Focus
1. A saved settings row from before this round (no `efforts` key) loads with the defaults → settings test (Task 3).
2. The capability call shapes must still match the exact argument list `buildClaudeArgs` produces, with and without `--max-budget-usd` → capability/args test (Task 3).
3. ✓ toggled on, then the learner edits nothing and grades: stored `✓` is graded correct without the LLM when expected ✓ → grade test (Task 4).
4. A `llm_call.response` that is empty, not JSON, or an error envelope without `usage` → counted as a call with 0 tokens, no crash (Task 5).
5. The styled select keeps working with keyboard only and keeps the existing `id`/label associations used by e2e (Task 2).

---

### Task 1: Tips and Opus (Haiku)
**Files:** `src/core/progress/tips.ts`, `src/ui/today/Loader.tsx`, `src/ui/pages/Settings.tsx` (`MODELS`), `tests/core/progress/tips.test.ts`
- [ ] Failing test: error-bank rows with `was` ✓/`+` or `should` ✓/`+` are not returned; others are.
- [ ] Implement the filter; tip rotation 6000 → 8000 ms; `MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']`.
- [ ] Checks; commit `feat: steadier tips without ✓ entries, and Opus in the model list`.

### Task 2: Styled select (Sonnet)
**Files:** Create `src/ui/components/ui/select.tsx`; modify `src/ui/pages/Settings.tsx`, `src/ui/setup/SlotPicker.tsx`, `src/ui/pages/ErrorBank.tsx`; delete `src/ui/components/ui/native-select.tsx` when unused; `tests/e2e/screenshots.spec.ts`
**Interfaces:** Produces `Select({ id, value, onValueChange, options: { value: string; label: string }[], 'aria-label'?, className?, disabled? })` (Radix Select inside; trigger carries `id` so `<label htmlFor>` keeps working).
- [ ] Build the component per spec G2; replace all four uses (keep `data-model-kind` on the Settings triggers).
- [ ] e2e: open a Settings model select with the keyboard (focus trigger, Enter, ArrowDown, Enter) and assert the value changed; update tests that used `selectOption` on native selects; screenshots of an open select in light and dark.
- [ ] Checks; commit `feat: styled selects`.

### Task 3: Effort per call kind (Sonnet)
**Files:** `src/core/db/repos/settings.ts`, `src/core/ports.ts` (`LlmRequest.effort`), `src/core/llm/call.ts`, `src/core/llm/claude.ts`, `src-tauri/capabilities/default.json`, `src/ui/pages/Settings.tsx`, i18n, `scripts/`/`evals/` callers of `buildClaudeArgs` if any, tests in `tests/core/db/settings.test.ts`, `tests/core/llm/*`
**Interfaces:** Consumes `Select` (Task 2). Produces `Settings.efforts: Record<LlmKind, Effort>`, `type Effort = 'low' | 'medium' | 'high'` (in `src/core/domain.ts`), `LlmRequest.effort: Effort`.
- [ ] Failing tests: defaults (`grade` high, others medium); an old settings row without `efforts` loads defaults and a partial `efforts` merges like `models`; `buildClaudeArgs` puts `--effort <level>` right after `--model <m>`; a test that every call shape in `src-tauri/capabilities/default.json` matches the argument list `buildClaudeArgs` produces (literal args equal, validator slots match), with and without budget.
- [ ] Implement; Settings shows an Effort select per call kind beside its model (copy: `settings.effort` "Усилие" / "Effort", `settings.effort.low|medium|high` "Низкое|Среднее|Высокое" / "Low|Medium|High", hint `settings.effortHint` "Меньше — дешевле и быстрее, но меньше размышлений" / "Lower is cheaper and faster, with less thinking").
- [ ] Checks incl. `cargo check`; commit `feat: effort level per call kind`.

### Task 4: ✓ inside the fix input (Sonnet)
**Files:** `src/ui/today/ItemRow.tsx`, i18n, `tests/core/grading/grade.test.ts`, `tests/e2e/screenshots.spec.ts`
- [ ] Failing grade test: answer `✓` (as the toggle stores it) on an item expecting ✓ → correct, no LLM call; on an item expecting a correction → sent to the LLM.
- [ ] Implement per spec G5 (copy `input.correctAsIs` "Верно как есть" / "Correct as it is"; keep `input.markCorrect` as the button's aria-label). Drafts keep `✓` so a reload restores the pressed state.
- [ ] e2e: click → input disabled, placeholder shown, button `aria-pressed=true`; click again → enabled and empty; the input's text box starts right of the button (input `padding-left` ≥ button width + gap, checked via bounding boxes); screenshot.
- [ ] Checks; commit `feat: mark-as-correct toggle inside the fix input`.

### Task 5: Lesson stats (Sonnet)
**Files:** Create `src/core/progress/usage.ts`; modify `src/core/progress/history.ts` and/or `derive.ts` (progress rows), `src/ui/progress/ProgressLog.tsx`, i18n, `tests/core/progress/usage.test.ts`, e2e
**Interfaces:** Produces `parseUsage(raw: string | null): { input: number; cacheRead: number; cacheWrite: number; output: number }` and per-session `{ models: string[]; calls: number; failedCalls: number; tokens: same shape }` on the progress row.
- [ ] Failing tests: `parseUsage` on a real envelope fixture (`tests/fixtures/cli/envelope-success.json`), on '', on non-JSON, on an envelope without `usage` → zeros; per-session aggregation over several calls incl. a failed one.
- [ ] Implement; ProgressLog: a details toggle per row (button with `aria-expanded`) showing models, calls (and failed), tokens in a compact line with thousands separators (copy keys `progress.details`, `progress.models`, `progress.calls`, `progress.failed`, `progress.tokens.input|cacheRead|cacheWrite|output`; ru/en wording chosen by the implementer, short).
- [ ] e2e: expand a row in `?state=` with calls and see the models line. Checks; commit `feat: model, calls and tokens per lesson`.

### Task 6: Docs and final review
- [ ] `s1-decisions.md` (this round), `handoff.md`; whole-branch review of this round (Sonnet); one fix wave; push.
