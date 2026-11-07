# Several cards per word: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A practice of 10 words where each word gets 3 (new), 2 (in progress) or 1 (learned) cards, +1 after a mistake, shown in rounds.

**Architecture:** A new pure module `src/core/words/plan.ts` decides each word's cards, orders them into rounds and places the extra card. `buildPractice` uses it; the practice page adds the extra card on a mistake instead of today's "repeat at the end".

**Tech Stack:** TypeScript, React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-words-multi-card-design.md` (M1–M6).

## Global Constraints
- UI strings only in `src/core/i18n/{ru,en}.ts`, both languages; banned words "again", "снова", "опять" and the em dash "—" (`tests/core/i18n.test.ts`). The "·" separator is fine.
- Every interactive element has `cursor: pointer`, disabled `not-allowed` (no new controls here).
- Only the first answer to a word on a calendar day counts (`recordAnswer` already does this; do not change it).
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`. Before each commit: `yarn vitest run`, `yarn typecheck`, `yarn lint`; Task 3 also `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts`. screenshots.spec and csp.spec are out of scope.
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY`.

## Review Focus
1. A word whose stage drops after a wrong first card: the extra card must still be built (it must not go through the stage filter of `availableTypes`). Test in Task 1 (`cardOfType`) and Task 2.
2. Only the new word has a third card: its cards must not be back to back when another word can go between (new words go first in each round). Test in Task 1 (`orderRounds`).
3. A word with no Recall exercises at stage 2 (empty plan): it is left out, the practice does not crash. Test in Task 1.
4. A mistake on the last card of the practice: the extra card is appended and the practice does not end. Test in Task 1 (`insertExtra`) and Task 3 e2e.
5. "Use it" Skip on a word without translation exercises: the card is dropped and the practice moves on (no stuck card). Task 3.

---

### Task 1: Plan module

**Files:**
- Create: `src/core/words/plan.ts`
- Test: `tests/core/words/plan.test.ts`

**Interfaces:**
- Consumes: `pickCard`, `availableTypes`, `type Card` (`src/core/words/queue.ts`); `WordState` (`progress.ts`); `CardType`, `WordExercise` (`types.ts`).
- Produces:
  - `planCards(i: { state: WordState; exercises: WordExercise[]; lastUsed: Map<number, string>; rand: () => number }): Card[]`
  - `cardOfType(type: CardType, exercises: WordExercise[], lastUsed: Map<number, string>): Card | null`
  - `extraType(missed: CardType): CardType` (`'choice'` → `'anagram'`, otherwise the same type)
  - `orderRounds<T extends { wordId: number }>(plans: T[][]): (T & { round: number })[]` (rounds numbered from 1)
  - `insertExtra<T extends { wordId: number; round: number }>(cards: T[], at: number, extra: Omit<T, 'round'>): T[]`

- [ ] **Step 1: Write the failing tests** in `tests/core/words/plan.test.ts` (reuse the `exercise`/`state` helpers style of `tests/core/words/queue.test.ts`; `rand = () => 0`):
  - `planCards` new word (`reviewed: false`) with a gap exercise → types `['choice', 'anagram', 'gap_hint']`; without gap → `['choice', 'anagram', 'anagram']`.
  - in progress stage 1 (`reviewed: true, stage: 1`) → `['anagram', 'gap_hint']`; without gap → `['anagram', 'anagram']`.
  - stage 2 with gap + form → two different types, both from `['gap', 'form']`; with only two gap items → `['gap', 'gap']` with two different exercise ids; with one gap item → `['gap', 'gap']` (same id allowed); with no Recall exercises → `[]`.
  - stage 3 with translation → `['translation', 'use']`; without translation but with form → `['form', 'use']`; with neither → `['use']`.
  - learned (stage 4) → exactly one card, its type in `availableTypes(4, false, exercises)`.
  - two cards of the same type pick different items when there are enough (least recently used first, by `lastUsed`).
  - `cardOfType('gap', …)` returns a gap card regardless of stage; returns `null` when the type needs an exercise and there is none; `cardOfType('anagram', [], …)` → `{ type: 'anagram', exercise: null }`.
  - `extraType('choice') === 'anagram'`, `extraType('form') === 'form'`.
  - `orderRounds([[a1,a2],[b1,b2],[c1,c2,c3]])` → `c1 a1 b1 c2 a2 b2 c3`, rounds `1 1 1 2 2 2 3` (within a round, words with more cards first; equal counts keep input order).
  - `orderRounds([[a1,a2],[g1,g2,g3]])` → `g1 a1 g2 a2 g3` (no word twice in a row).
  - `orderRounds([[g1,g2,g3]])` → `g1 g2 g3` (only one word: allowed).
  - `orderRounds([])` → `[]`.
  - `insertExtra`: the extra goes after the last card of round `cards[at].round + 1` that sits after `at`, with that round number; when there is no such round it is appended with round `cards[at].round + 1`; a mistake on the last card appends; when the last card of the target round is the same word and the round holds another word, the extra goes one place earlier.

- [ ] **Step 2: Run** `yarn vitest run tests/core/words/plan.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/core/words/plan.ts`.**
  - Category: `!state.reviewed` → new; `stage === 4` → learned; else in progress (by its stage 1, 2, 3).
  - Picking: copy `lastUsed` into a local map; after each picked card with an exercise, set that exercise id to `'9999-12-31T00:00:00Z'` so the next pick of the same type prefers another item. Use `pickCard({ stage, firstCard: false, exercises, lastUsed: local, only: [type], rand })` for a fixed type, and `pickCard` with `only` = the remaining Recall types for the random stage-2 picks; `choice` is `{ type: 'choice', exercise: null }`.
  - `cardOfType` must not filter by stage (Review Focus 1): build the card directly with the same least-recently-used rule as `pickCard` (export a small helper from `queue.ts` if that avoids duplicating the item choice).
  - `orderRounds`: stable-sort the plans by length, longest first; round k = the k-th card of every plan that has one. (Then the last word of round k can equal the first of round k+1 only when round k holds one word.)
  - `insertExtra`: if the card just before the insertion point has the extra's `wordId` and the target round holds another word, insert one place earlier.

- [ ] **Step 4: Run** the test → PASS; then the Global Constraints checks.

- [ ] **Step 5: Commit** `feat(words): plan several cards per word in rounds`.

### Task 2: Practice builder (core)

**Files:**
- Modify: `src/core/words/constants.ts`, `src/core/words/queue.ts`, `src/core/words/practice.ts`
- Test: `tests/core/words/queue.test.ts`, `tests/core/words/practice.test.ts`

**Interfaces:**
- Consumes: Task 1 (`planCards`, `cardOfType`, `extraType`, `orderRounds`).
- Produces:
  - `PRACTICE_WORDS = 10` replaces `PRACTICE_SIZE` (remove `PRACTICE_SIZE`); `practiceQueue` slices to `PRACTICE_WORDS`.
  - `PracticeCard` = `{ wordId, word, card, options, letters, round: number }` (`repeat` removed).
  - `toPracticeCard(view: WordView, card: Card, all: Word[], rand: () => number): Omit<PracticeCard, 'round'>` (builds `options` and `letters` as `cardFor` does today).
  - `extraCardFor(view: WordView, missed: CardType, all: Word[], rand: () => number): Omit<PracticeCard, 'round'> | null` (type `extraType(missed)`, item via `cardOfType` with `lastUsed` from the view's reviews).
  - `swapForTranslation(view: WordView, all: Word[], rand: () => number): Omit<PracticeCard, 'round'> | null` (`cardOfType('translation', …)`).
  - `buildPractice(deps, extraNew)` returns `PracticeCard[]` ordered by `orderRounds`. `cardFor` is removed if nothing uses it after Task 3 (keep the `lastUsed` computation in one helper).

- [ ] **Step 1: Failing tests.** queue.test: `practiceQueue` returns at most 10 ids (12 due words → 10, most overdue first). practice.test (`buildPractice`, existing seed helpers): a never-reviewed word gives 3 cards, a reviewed stage-2 word 2, a stage-4 word 1; cards are in rounds (the first N cards have N distinct words, the new word first); every card has `round`; `extraCardFor` for a stage-2 word that just got a wrong answer (stage dropped to 1) still returns a card of the missed type; `extraCardFor(…, 'choice', …)` returns an anagram card; `swapForTranslation` returns `null` without translation exercises.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as in Interfaces. `buildPractice`: for each id of `practiceQueue`, `planCards` (with the view's `lastUsed`) → `toPracticeCard` each → `orderRounds`; words with an empty plan are left out.
- [ ] **Step 4: Run** Global Constraints checks → PASS (fix `typecheck` errors in `WordsPractice.tsx` only as far as needed to compile; Task 3 does the behaviour).
- [ ] **Step 5: Commit** `feat(words): practice of 10 words with several cards each`.

### Task 3: Practice page, strings, e2e, docs

**Files:**
- Modify: `src/ui/pages/WordsPractice.tsx`, `src/core/i18n/{ru,en}.ts`, `tests/e2e/words.spec.ts`, `docs/superpowers/handoff.md` (Words entry: one line with this spec and plan), `docs/superpowers/specs/2026-11-04-words-design.md` (V8: one line "Replaced by `2026-11-07-words-multi-card-design.md`" after the queue bullet).

**Interfaces:**
- Consumes: Task 1 `insertExtra`; Task 2 `PracticeCard`, `extraCardFor`, `swapForTranslation`.

- [ ] **Step 1: Failing e2e** (`?state=words`: 1 learned + 5 in progress + 1 new = 14 cards; read the seed in `src/adapters/preview/wordsSeed.ts` and confirm the numbers before asserting):
  - the header starts at `1 / 14`; the first 7 cards are 7 different words (round 1), `ephemeral` first;
  - the new word `ephemeral` shows choice, then anagram, then `gap_hint` across the rounds, never back to back;
  - a wrong answer on the first card makes the total `/ 15`, and that word gets one more card later in the practice; a second wrong answer on the same word does not grow the total;
  - a mistake on the last card adds a card instead of ending;
  - the end screen's "Готово: X из 7" counts words (first card in this practice);
  - ending early shows "Продолжить · ещё 10 слов";
  - update the existing practice tests whose counts change (`1 / 7`, `2 / 8`, `Готово: 7 из 7`, `1 / 10` and `Готово: 10 из 10` in `words-limit`: +10 now gives 10 new words × 3 cards = 30 cards; the `words-limit` answers lookup `LIMIT_WORD_ANSWERS` is by definition, check anagram and gap prompts resolve too, extend the lookup in the seed if not) and the "repeated at the end" test (rename to the extra-card rule).
- [ ] **Step 2: Run** `yarn playwright test tests/e2e/words.spec.ts` → the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `onResult`: keep `first` (first card per word in this practice, now without the `repeat` check); on `result === 'wrong'` and the word not yet in `extraGiven`, add it, reload views, `extraCardFor(view, pc.card.type, …)`, and `setCards(cur => insertExtra(cur, index, extra))`.
  - `skip`: `swapForTranslation`; with a card, replace the current one keeping its `round`; without, `advance`.
  - `advance` must read the latest `cards` (the extra card may have just been added): use the functional state or a ref so a mistake on the last card does not end the practice.
  - i18n: `words.more` → ru `Продолжить · ещё 10 слов`, en `Continue · 10 more words`.
- [ ] **Step 4: Run** Global Constraints checks + `tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts` → PASS. Update the handoff and the V8 line.
- [ ] **Step 5: Commit** `feat(words): extra card after a mistake, rounds in practice`.
