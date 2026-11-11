# Words feedback round 3: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tile anagram + typed `spell` task, "Almost" for a swap, one Skip on every card, words without a bracketed tail, shuffled rounds.

**Architecture:** Core changes (check, card types, round order, word names) are pure and unit-tested; the card view gets the tiles and Skip; the words job provider fixes saved names once at start.

**Tech Stack:** TypeScript, React, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-words-feedback-3.md` (H1–H6).

## Global Constraints
- UI strings only in `src/core/i18n/{ru,en}.ts`, both languages; banned "again", "снова", "опять" and the em dash "—" (`tests/core/i18n.test.ts`).
- Every interactive element has `cursor: pointer`, disabled `not-allowed` (global rule in `src/ui/styles/globals.css` covers `button`); `tests/e2e/cursor.spec.ts` checks pages.
- Only the first answer to a word on a calendar day counts (`recordAnswer`, unchanged). A word gets at most one extra card per practice (M1, unchanged).
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`. Before each commit: `yarn vitest run`, `yarn typecheck`, `yarn lint`; tasks touching UI also `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts`. screenshots.spec and csp.spec are out of scope.
- Never weaken or delete a test to pass; update only what this spec changes.
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY`.

## Review Focus
1. Shuffled rounds with 2 words, where round k+1 holds only one word: no back-to-back unless unavoidable. Test in Task 1.
2. A swap at the very start/end of the word ("ecieve r" style edges: "ecreive", "receiev") is Almost; two swaps are wrong. Test in Task 1.
3. Skip pressed twice fast, or after "Almost": exactly one wrong review and one extra card. Task 2.
4. Tiles with repeated letters ("committee"): each tile is used once, putting a letter back re-enables the right tile. Task 2.
5. A saved word "incentive (for)" while "incentive" already exists: left unchanged, no crash on the unique index. Task 3.

---

### Task 1: Core: Almost with a swap, `spell` type, shuffled rounds

**Files:** Modify `src/core/words/check.ts`, `src/core/words/types.ts`, `src/core/words/queue.ts`, `src/core/words/plan.ts`, `src/core/words/practice.ts`; Test `tests/core/words/check.test.ts`, `tests/core/words/queue.test.ts`, `tests/core/words/plan.test.ts`, `tests/core/words/practice.test.ts`.

**Interfaces (produces):**
- `CardType` gains `'spell'` (no exercise; `EXERCISE_OF` has no entry for it, so `cardOfType('spell', …)` → `{ type: 'spell', exercise: null }`).
- `availableTypes(2, …)` = the exercise-backed Recall types (as now) **plus `'spell'` last**; stage 4 = stage 2 + stage 3 as now (so it includes `spell`). Stage 1 and the first card are unchanged.
- `toPracticeCard` sets `letters` for `'spell'` as for `'anagram'`.
- `checkTyped` unchanged signature; "almost" = optimal-string-alignment distance 1 (one substitution, insertion, deletion, or one adjacent transposition).
- `orderRounds<T extends { wordId: number }>(plans: T[][], rand: () => number): (T & { round: number })[]`; `buildPractice` passes its `rand`.

- [ ] **Step 1: Tests.**
  - check.test: `checkTyped('recieve', ['receive'])` → `'almost'`; `'ecreive'` → `'almost'`; `'receiev'` → `'almost'`; `'rceieve'` (two swaps) → `'wrong'`; `'recxive'` → `'almost'` (as now); `'receive'` → `'correct'`.
  - queue.test: update the `availableTypes` stage 2 and stage 4 expectations to include `'spell'` (stage 2 with no exercises → `['spell']`).
  - plan.test: stage 2 with no Recall exercises now → `['spell', 'spell']` (the only type, used twice; replaces the old "no Recall exercises → []" case); stage 2 with gap + form → two different types from `['gap', 'form', 'spell']`; stage 3 without translation and without Recall exercises → `['spell', 'use']`; `extraType('spell') === 'spell'`.
  - plan.test `orderRounds` with `rand` (use a seeded generator, e.g. mulberry32 from `src/adapters/preview/fixtures.ts` or a local copy): every round k contains exactly the k-th cards; for 50 seeds and plans `[[a1,a2],[b1,b2],[c1,c2,c3]]` and `[[a1,a2],[g1,g2,g3]]`, no two neighbours share a wordId; `[[g1,g2,g3]]` → `g1 g2 g3`; `[]` → `[]`.
  - practice.test: replace assertions that depended on "longest plan first" order (e.g. "new word first") with round-membership assertions.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** OSA distance in `check.ts` (replace `levenshtein`; keep the length guard `|Δlength| ≤ 1`). `orderRounds`: round k = the k-th card of every plan (input order), then shuffle the round (Fisher–Yates with `rand`); then for each round k ≥ 2 whose first word equals the previous round's last word: swap its first card with the first card of another word in the same round; if none, swap the previous round's last card with the latest earlier card of that round whose word differs from both its new neighbours (skip if none).
- [ ] **Step 4:** checks → PASS.
- [ ] **Step 5: Commit** `feat(words): swap counts as Almost, spell task, shuffled rounds`.

### Task 2: Card view: tiles, spell, Skip

**Files:** Modify `src/ui/words/CardView.tsx`, `src/ui/pages/WordsPractice.tsx`, `src/core/words/practice.ts` (remove `swapForTranslation`), `src/core/i18n/{ru,en}.ts`; Test `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`, `tests/core/words/practice.test.ts` (drop `swapForTranslation` tests).

**Interfaces:** Consumes Task 1 (`'spell'`, `letters` for spell). `CardProps.onSkip` is removed; Skip goes through `onResult('wrong', '', false)`.

- [ ] **Step 1: E2E tests** (`?state=words`, Russian UI; read the helpers `answer`, `advanceTo`, `runCards` in words.spec first and extend `answer()` for tiles: click tiles in word order).
  - Tiles: on an `anagram` card the letters are buttons; clicking them in order builds the word, Проверить → Верно; clicking a placed letter returns it (its tile is enabled again); typing letters on the keyboard places tiles and Backspace removes the last.
  - Tile answer with two neighbouring letters swapped → "Почти: одна буква не та. Попробуйте ещё раз." then the right order → Верно.
  - `spell` card (reach it with `advanceTo(page, 'spell')` if the seed yields one; otherwise assert through a unit-level check and note it): letters shown as text, a text field, typing the word → Верно.
  - Skip on a choice card: the feedback shows "Неверно" and the word; the header total grows by one; Skip on a `use` card shows the word's example sentence; no card has two Skip buttons.
  - Update tests that used the typed anagram or the old use-it Skip ("use it: Skip replaces the card with a translation card" → becomes the Skip-counts-wrong test).
  - cursor.spec: on an anagram card, tiles, a placed letter and Skip are `pointer`; a used (disabled) tile is `not-allowed`.
- [ ] **Step 2:** run → new tests FAIL.
- [ ] **Step 3: Implement.**
  - `anagram`: tiles from `pc.letters` (one button per letter, index-keyed so repeated letters work); answer row of placed letters (buttons, click = return); keyboard on the card: a letter places the first unused matching tile (case-insensitive), Backspace returns the last; ↵ checks. The answer string = placed letters joined; check with `checkTyped(answer, [word.word])` (Almost retry clears nothing: the learner rearranges). Instruction `words.instr.anagram` (unchanged text "Соберите слово из букв").
  - `spell`: the old anagram rendering (letters as text + input, no hint); add `'spell'` to `TYPED`; instruction key `words.instr.spell`: ru `Напишите слово`, en `Write the word`; accepted = `[word.word]`.
  - Skip: one ghost `words.skip` button on every unanswered card (disabled while `checking`/`saving`); it calls `finish({ result: 'wrong', text: '' })`. `use` keeps no other skip. FeedbackView: when `fb.result === 'wrong'` and the card has exercise answers (gap, gap_hint, collocation, form, confusable, translation), show `words.rightAnswer`: ru `Правильный ответ: {text}`, en `Right answer: {text}` with the answers joined by " / ". The word, definition and example are already shown (that covers `use`).
  - WordsPractice: remove the `skip` handler and `swapForTranslation` use; the extra card comes from the normal wrong path.
- [ ] **Step 4:** checks + e2e → PASS.
- [ ] **Step 5: Commit** `feat(words): letter tiles, spell task and Skip on every card`.

### Task 3: Words without a bracketed tail + docs

**Files:** Create `src/core/words/name.ts`; Modify `src/core/words/importParse.ts`, `src/ui/words/WordForm.tsx`, `src/ui/words/WordsJobProvider.tsx`, `docs/superpowers/handoff.md` (Words entry: one line with this spec and plan); Test `tests/core/words/name.test.ts`, `tests/core/words/importParse.test.ts`, `tests/e2e/words.spec.ts`.

**Interfaces (produces):**
- `cleanWordName(s: string): string` — removes one trailing `\s*\([^)]*\)` then trims.
- `fixSavedWordNames(db: Db): Promise<number[]>` — for each word where `cleanWordName(word) !== word`: skip it if another word has the cleaned name (case-insensitive, `word_word_ci` is `lower(word)`); else `updateWord` with the cleaned name and the other fields unchanged; returns the renamed ids.

- [ ] **Step 1: Tests.** name.test: `'incentive (for)'` → `'incentive'`; `'rely (on) '` → `'rely'`; `'a (b) c'` → unchanged; `'plain'` → unchanged; `'x (a) (b)'` → `'x (a)'`. `fixSavedWordNames` (sql.js test db as in practice.test): renames and returns ids; a clash with an existing `incentive` leaves `incentive (for)` unchanged; a second run returns `[]`. importParse.test: a card with `**Word:** incentive (for)` parses as `incentive`, and counts as a duplicate when `incentive` is stored. words.spec: importing a card with `**Word:** incentive (for)` shows a row `incentive`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** importParse: apply `cleanWordName` to the Word field before the duplicate key. WordForm: save `cleanWordName(text)` (the empty check uses the cleaned name). WordsJobProvider: on mount, once (ref guard for StrictMode), `fixSavedWordNames(deps.db)` then `run(ids)` when not empty; errors go to the existing `error` state.
- [ ] **Step 4:** checks + `tests/e2e/words.spec.ts` → PASS. Update the handoff.
- [ ] **Step 5: Commit** `feat(words): drop a bracketed tail from words, fix saved words once`.
