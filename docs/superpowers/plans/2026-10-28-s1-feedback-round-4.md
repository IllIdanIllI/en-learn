# S1 Feedback Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** K1–K5 of the spec.

**Spec:** `docs/superpowers/specs/2026-10-28-s1-feedback-round-4.md`

## Global Constraints
- After every task: `yarn typecheck`, `yarn lint`, `yarn test` clean; UI tasks also `yarn e2e`.
- No SQL in `src/ui`; UI strings via `t()` with keys in ru and en; no em dashes in UI strings.
- Match surrounding style; sparse comments. Remove only what your change orphans.

## Review Focus
1. Word-level diff never yields an empty or ✓ cell; "__" only when one side's differing part is empty (Task 1).
2. Clearing skipped answers touches only that session's active gap/fix/spelling items with verdict `skipped`; spot errors and other answers stay (Task 3).
3. While solving, no answer key or other item reaches the DOM; grading grades only the cleared items; scores and topic state include the late answers (Task 3).

---

### Task 1: Word-level change, "__", highlighted tips, loader heading (Sonnet)
**Files:** `src/core/progress/errorContext.ts`, `src/core/progress/tips.ts`, `src/ui/today/Loader.tsx`, `src/ui/pages/ErrorBank.tsx` (move its `Context` renderer into a shared component, e.g. `src/ui/components/SnippetText.tsx`), i18n (`loader.tip`), tests `tests/core/progress/{errorContext,tips}.test.ts`, e2e
**Interfaces:** `WaitTip = { kind: 'error'; was: Snippet; should: Snippet } | { kind: 'spelling'; word: string; mnemonic: string }`.
- [ ] Failing tests: shared leading/trailing words move to context; extra word → should side "__"; missed word → was side "__"; differing middle on both sides stays highlighted; existing H7 cases still hold.
- [ ] Implement K1–K3. Tips keep the was≠should and no-tick filters.
- [ ] e2e: loader tip (use `?delay=` preview) shows a highlighted part; heading text. Checks; commit `feat: word-level error highlights with __, highlighted tips`.

### Task 2: Session log card (Sonnet)
**Files:** `src/ui/progress/ProgressLog.tsx`, i18n, e2e
- [ ] Implement K5 on the existing `ProgressLogRow`; details as a `<table>` (two columns). e2e: card shows the block list and bold total; details table rows. Screenshots light/dark. Checks; commit `feat: easier to read session log cards`.

### Task 3: Solve skipped questions (Sonnet)
**Files:** core: `src/core/db/repos/answers.ts` or `sessions.ts` (clear skipped answers; find today's/yesterday's sessions with skips), `src/core/session/view.ts` (in a graded session, a block with unanswered items lists only those items, without answer data, and no answered items of that block), `src/core/session/plan.ts` or a new `src/core/session/skipped.ts`; UI: `src/ui/pages/Today.tsx`, `src/ui/today/SessionPage.tsx` (solving mode: only open blocks/items), i18n; preview fixture state with skipped items; tests core + e2e.
**Interfaces:** `skippedToSolve(deps): Promise<{ sessionId: number; date: ISODate; count: number } | null>` (yesterday first); `reopenSkipped(db, sessionId): Promise<number>` (count cleared).
- [ ] Failing core tests: finds skips today/yesterday only (not two days ago, not spot, not question); yesterday first; reopen clears only skipped gap/fix/spelling answers of that session; view lists only unanswered items in such a block, no `expected`/answers; grading after reopen grades only those and scores/topic facts include them; answered items no longer appear as review input.
- [ ] Implement K4. Today page: button per spec; solving shows the session in solving mode (earlier day sessions too); after `graded` return to today's normal view.
- [ ] e2e on a new preview state: button with count, click shows only skipped items with original numbers, grade, button gone. Checks; commit `feat: solve skipped questions of today and yesterday`.

### Task 4: Docs and final review
- [ ] `s1-decisions.md`, `handoff.md`; final review (Sonnet); one fix wave; verify checks; push.
