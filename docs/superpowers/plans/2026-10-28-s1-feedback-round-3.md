# S1 Feedback Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** H1–H7 of the spec: fewer ticks, hidden removed sentences, added-round layout, sticky close, results toggle, log cards, error-bank context.

**Architecture:** Same layering (core / adapters / ui). No migration: the error-bank context is derived from stored items (`item.wrong`, `block.passage`).

**Spec:** `docs/superpowers/specs/2026-10-28-s1-feedback-round-3.md`

## Global Constraints
- After every task: `yarn typecheck`, `yarn lint`, `yarn test` clean; UI tasks also `yarn e2e`.
- No SQL in `src/ui`; UI strings via `t()` with keys in ru and en; no em dashes in UI strings.
- Match surrounding style; sparse comments. Remove only what your change orphans.

## Review Focus
1. A defect item never reaches the DOM, graded or not, and block scores are unchanged (Task 1).
2. Numbering of an added round continues after the earlier task blocks, across several rounds; disputes on earlier items still work when unfolded (Task 2).
3. The sticky bar shows "Close lesson" only for today's graded session with nothing open, and never on an earlier day or a closed lesson (Task 2).
4. Error-bank cells are never ✓, a shorthand or empty, for every case in H7 incl. items without `wrong` and old `✓` answers (Task 4).

---

### Task 1: Ticks, hidden defects, results toggle (Haiku)
**Files:** `src/ui/today/chips.tsx`, `src/ui/today/GradedItem.tsx`, `src/core/session/view.ts`, `src/ui/today/LessonClosed.tsx`, `src/core/i18n/{ru,en}.ts`, `prompts/generate_session.md`, `src/adapters/preview/previewLlm.ts` (fix instruction/example text), tests in `tests/core/session/view*.test.ts`, e2e
- [ ] Failing test: `loadSessionView` of a graded session with a defect item does not return it (items and spot `errors`); scores unchanged.
- [ ] Implement H1, H2, H5. `input.fix` → "исправленный фрагмент" / "the corrected fragment"; new key `today.hideResults` "Скрыть результаты" / "Hide results". Drop the `item.status === 'defect'` branch of `notCountedReason` and `reason.defect` if unused afterwards. Prompt: rewrite TD-4's instruction sentence and the formatExample rule (an error sentence and its fix, never ✓); keep every other rule.
- [ ] e2e: graded state shows no `✓`/`✗` glyph in verdict chips; closed state toggle text flips. Update screenshots.
- [ ] Checks; commit `feat: fewer ticks, hidden removed sentences, results toggle text`.

### Task 2: Added-round layout and sticky close (Sonnet)
**Files:** `src/ui/today/SessionPage.tsx`, `src/ui/today/SessionHeader.tsx`, `src/ui/today/Block.tsx` (a way to render without title), i18n, `src/adapters/preview/fixtures.ts` if a graded-extra state is needed, e2e
- [ ] Implement H3 and H4. Latest round = max `block.round`; earlier = the rest. Number offset of a block = count of shown items in task blocks of lower rounds (spec H3). Toggle keys `today.showPrevious` / `today.hidePrevious` ("Показать предыдущие вопросы" / "Скрыть предыдущие вопросы", "Show previous questions" / "Hide previous questions"). Focus after grading: the latest round section (`tabIndex={-1}`) when rounds > 1, else `#feedback-title` as now. "Close lesson" moves into `ActionBar` (shown when `onClose` and graded and not open); remove it from the header.
- [ ] e2e (`?state=open-round`, plus a graded added round if the fixtures allow): the round shows no block title, first number is 7 (or the right offset), earlier blocks hidden until the toggle, then visible; close button sits in the sticky bar (`position: sticky` ancestor) and stays in the viewport after scrolling.
- [ ] Checks; commit `feat: added questions on top, earlier ones folded; close lesson in the action bar`.

### Task 3: Session log cards (Sonnet)
**Files:** `src/ui/progress/ProgressLog.tsx`, i18n, e2e
- [ ] Implement H6 with the existing `ProgressLogRow` (total = sums over `scores`; percent rounded). Keep the details toggle (`aria-expanded`, `data-testid="log-details"` on the opened part). Labels: `progress.total` ("{x} из {y} · {p}%" / "{x} of {y} · {p}%"), `progress.more` ("Подробнее" / "Details"); reuse existing keys for errors, disputes, defects, cost.
- [ ] e2e: `?state=progress` shows cards with the total line; expanding shows models. Screenshots light and dark.
- [ ] Checks; commit `feat: session log as cards`.

### Task 4: Error-bank context (Sonnet)
**Files:** Create `src/core/progress/errorContext.ts`; modify `src/core/db/repos/answers.ts` (`listGradedAnswerRows` adds `i.wrong`, `i.paragraph`, `b.passage`), `src/core/progress/{history,derive,tips}.ts`, `src/ui/pages/ErrorBank.tsx`, tests `tests/core/progress/errorContext.test.ts`, `derive`/`tips` tests, e2e
**Interfaces:** `type Snippet = { before: string; changed: string; after: string }` (`before`/`after` include "…" when cut); `ErrorBankRow` gets `was: Snippet; shouldBe: Snippet; sentence: string; hint: string | null`; `snippetText(s)` gives the plain string (used by tips).
- [ ] Failing tests for every H7 case (gap, fix ✓-answer, fix wrong-fragment answer, fix needless change, spot, spelling with hint, item without `wrong`, `+`/accepted shorthand answer, window cut with "…", LLM `fix` preferred over `expected` when present).
- [ ] Implement; ErrorBank renders `before` and `after` muted, `changed` highlighted (`font-semibold`, red tint for Было, green for Должно быть), `title` = full sentence, hint as a muted line under the row for spelling. Tips use `snippetText`; drop the ✓ filter if it becomes dead.
- [ ] e2e: `?state=progress#/errors` shows a context row with highlighted part. Screenshot.
- [ ] Checks; commit `feat: error bank with sentence context`.

### Task 5: Docs and final review
- [ ] `s1-decisions.md` (this round), `handoff.md`; whole-branch review of this round (Sonnet); one fix wave; push.
