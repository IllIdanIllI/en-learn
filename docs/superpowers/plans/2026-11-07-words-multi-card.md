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
- Consumes: `pickCard`, `availableTypes`, `type Card` (`src/core/words/queue.ts`; `pickExercise` is added there in this task); `WordState` (`progress.ts`); `CardType`, `WordExercise` (`types.ts`).
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
  - `insertExtra`: the extra goes after the last card of round `cards[at].round + 1` that sits after `at`, with that round number; when there is no such round it is appended with round `cards[at].round + 1`; a mistake on the last card appends. Neighbour rule: if the card just before **or just after** the insertion point has the extra's `wordId` and the target round holds another word, insert one place earlier. Test: `cards = g1 a1 b1 | g2 a2 b2 | g3` (rounds 1 1 1 2 2 2 3), `insertExtra(cards, 0, gX)` → `g1 a1 b1 g2 a2 gX b2 g3` (target end of round 2 is before `g3`, so one place earlier, round 2).

- [ ] **Step 2: Run** `yarn vitest run tests/core/words/plan.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/core/words/plan.ts`.**
  - Item choice: export `pickExercise(pool: WordExercise[], lastUsed: Map<number, string>): WordExercise | null` from `queue.ts` with the logic now inside `pickCard` (queue.ts:57-64: never-used with the lowest id first, else the oldest `lastUsed`, ties by id); `pickCard` uses it too (its existing tests must still pass).
  - `cardOfType(type, exercises, lastUsed)`: no stage filter (Review Focus 1). `choice`, `anagram`, `use` → `{ type, exercise: null }`; other types map to their exercise type (`gap_hint`/`gap` → `gap`, `collocation`, `form`, `confusable`, `translation`) and take `pickExercise`; `null` when the pool is empty.
  - `planCards` builds **every** card with `cardOfType` on a local copy of `lastUsed`; after each card with an exercise, set that exercise id to `'9999-12-31T00:00:00Z'` in the local map so the next card of the same type prefers another item. Do not call `pickCard` here (its stage filter returns nothing for Recall types at stage 3).
    - new (`!state.reviewed`): `choice`, `anagram`, then `gap_hint` if a gap exercise exists else `anagram`.
    - stage 1: `anagram`, then `gap_hint` if a gap exists else `anagram`.
    - stage 2: Recall types present = those of `gap`, `collocation`, `form`, `confusable` with exercises (in that order); none → `[]`. First type = `recall[floor(rand() * recall.length)]`; second = a random one of the others, or the same type when there is only one.
    - stage 3: `translation` if a translation exercise exists, else a random Recall type if any (else nothing); then `use`.
    - stage 4: one card of a random type from `availableTypes(4, false, exercises)`.
  - `orderRounds`: stable-sort the plans by length, longest first; round k = the k-th card of every plan that has one. (The last word of round k can equal the first of round k+1 only when round k holds one word.)

- [ ] **Step 4: Run** the test → PASS; then the Global Constraints checks.

- [ ] **Step 5: Commit** `feat(words): plan several cards per word in rounds`.

### Task 2: Practice builder (core)

**Files:**
- Modify: `src/core/words/constants.ts`, `src/core/words/queue.ts`, `src/core/words/practice.ts`, `src/ui/pages/WordsPractice.tsx` (compile only)
- Test: `tests/core/words/queue.test.ts`, `tests/core/words/practice.test.ts`

**Interfaces:**
- Consumes: Task 1 (`planCards`, `cardOfType`, `extraType`, `orderRounds`).
- Produces:
  - `PRACTICE_WORDS = 10` replaces `PRACTICE_SIZE` (remove `PRACTICE_SIZE`; its users are queue.ts:3 and :98); `practiceQueue` slices to `PRACTICE_WORDS`. Note: `wordsOverview.available` (Today link, Words page) is therefore capped at 10. Intended (M5).
  - `PracticeCard` = `{ wordId, word, card, options, letters, round: number }` (`repeat` removed; its users are practice.ts:49, :75 and WordsPractice.tsx:74, :89).
  - `lastUsedOf(view: WordView): Map<number, string>` (the loop now at the top of `cardFor`).
  - `toPracticeCard(view: WordView, card: Card, all: Word[], rand: () => number): Omit<PracticeCard, 'round'>` (builds `options` and `letters` as `cardFor` does today).
  - `extraCardFor(view: WordView, missed: CardType, all: Word[], rand: () => number): Omit<PracticeCard, 'round'> | null` (`cardOfType(extraType(missed), view.exercises, lastUsedOf(view))` → `toPracticeCard`).
  - `swapForTranslation(view: WordView, all: Word[], rand: () => number): Omit<PracticeCard, 'round'> | null` (`cardOfType('translation', …)`).
  - `buildPractice(deps, extraNew)` returns `PracticeCard[]` ordered by `orderRounds`.
  - `cardFor` is removed (its users WordsPractice.tsx:7, :79, :88 switch to `extraCardFor` / `swapForTranslation`).

- [ ] **Step 1: Tests.** In `practice.test.ts` the helper `addReady` creates words without exercises: add exercises with `replaceExercises` (`src/core/db/repos/words.ts:132`). Stages by counted reviews (all correct, on different dates, as in `src/adapters/preview/wordsSeed.ts`): none = new; 1 review = stage 1; 2 = stage 2; 4 = stage 3; stage 4 needs 6 spread reviews (copy the dates of `resilient` in the seed).
  - **Replace** (behaviour changes by spec M5, not regressions): practice.test.ts:47-58 (10 new words: now 30 cards, the first 10 are `choice` with 10 distinct words, then anagrams; no `repeat` field) and queue.test.ts:171-180 "total is at most 20" (now at most 10).
  - **Add:** a never-reviewed word gives 3 cards, a stage-2 word with gap + form exercises 2, a stage-4 word 1; the first N cards are N distinct words, the new word first; every card has `round`; `extraCardFor` for a stage-2 word whose first answer was wrong (stage now 1) with missed type `form` returns a `form` card; `extraCardFor(…, 'choice', …)` returns an `anagram` card; `swapForTranslation` returns `null` without translation exercises.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as in Interfaces. `buildPractice`: for each id of `practiceQueue`, `planCards({ state, exercises, lastUsed: lastUsedOf(view), rand })` → `toPracticeCard` each → `orderRounds`; words with an empty plan are left out. In `WordsPractice.tsx` make only the minimal compile changes (replace `cardFor` calls with `extraCardFor(view, pc.card.type, …)` and `swapForTranslation`, drop `repeat`); Task 3 does the behaviour.
- [ ] **Step 4: Run** Global Constraints checks → PASS.
- [ ] **Step 5: Commit** `feat(words): practice of 10 words with several cards each`.

### Task 3: Practice page, strings, e2e, docs

**Files:**
- Modify: `src/ui/pages/WordsPractice.tsx`, `src/core/i18n/{ru,en}.ts`, `src/adapters/preview/wordsSeed.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`, `docs/superpowers/handoff.md` (Words entry: one line with this spec and plan), `docs/superpowers/specs/2026-11-04-words-design.md` (V8: one line "Replaced by `2026-11-07-words-multi-card-design.md`" after the queue bullet).

**Interfaces:**
- Consumes: Task 1 `insertExtra`; Task 2 `PracticeCard`, `extraCardFor`, `swapForTranslation`.

- [ ] **Step 1: E2E** (`?state=words`: 1 learned + 5 in progress + 1 new = 1 + 10 + 3 = 14 cards; confirm against `src/adapters/preview/wordsSeed.ts`).
  - Seed: `LIMIT_WORD_ANSWERS` (wordsSeed.ts:141) maps definitions only, so `gap_hint` prompts do not resolve: add each limit word's gap sentences (`...w.gaps.map((g) => [g, w.word])`, check the field shape). Update the stale seeded-order comment at wordsSeed.ts:23-26.
  - New tests: header starts `1 / 14`; the first 7 cards are 7 different words, `ephemeral` first; `ephemeral` shows `choice`, `anagram`, `gap_hint` in that order across the practice, never back to back; a wrong answer on the first card (ephemeral's choice) makes the total `/ 15`, the extra card (an `anagram`) comes later and not next to another `ephemeral` card; a second wrong answer on `ephemeral` does not grow the total; a mistake on the last card adds a card instead of showing the end screen; ending early shows "Продолжить · ещё 10 слов".
  - **Update** (counts change by spec): words.spec.ts:85 `1 / 9` → `1 / 20` (7 seeded words = 14 cards + 2 imported new words = 6); :109 `1 / 7` → `1 / 14`; :189-200 loop to 14 cards with `${i + 1} / 14` and `Готово: 7 из 7`; :157-186 `words-limit` → `1 / 30` and answer 30 cards with `answer()`-style typing for `anagram`/`gap_hint` (look up `LIMIT_WORD_ANSWERS`), end `Готово: 10 из 10`; :271-279 Continue → "Продолжить · ещё 10 слов", then `1 / 11` (six due words left: 1 + 5 × 2).
  - **Rewrite** :257-269 ("a wrong answer is repeated at the end"): ephemeral is now first, so answer the first card wrong and assert the extra card rule; for the moved-down check, answer `resilient`'s card wrong only when its type is not `use` (the preview checker always accepts use); assert moved up/down only for words whose result is deterministic in the test.
  - `tests/e2e/cursor.spec.ts:87-100` clicks choice options 10 times: answer by card type instead (choice/confusable click, others type the answer), for all cards up to the end screen.
- [ ] **Step 2: Run** `yarn playwright test tests/e2e/words.spec.ts` → the new tests FAIL.
- [ ] **Step 3: Implement** in `WordsPractice.tsx`.
  - Rename the `repeated` ref to `extraGiven`. `onResult`: after `recordAnswer` (so the missed item is in the reviews), keep `first` (first card per word in this practice; no `repeat` check); on `result === 'wrong'` and the word not in `extraGiven`: add it, `loadWordViews`, `extraCardFor(view, pc.card.type, …)`, `setCards((cur) => (cur ? insertExtra(cur, index, extra) : cur))`.
  - `advance` needs no change: `onResult` finishes before the Next button shows, so the re-render already has the longer list. Do not call `advance` inside a state updater.
  - `skip`: `swapForTranslation`; with a card, replace the current one keeping `round: pc.round`; without, **remove** the current card from the list (the total drops by one) and finish when it was the last.
  - i18n: `words.more` → ru `Продолжить · ещё 10 слов`, en `Continue · 10 more words`.
- [ ] **Step 4: Run** Global Constraints checks + `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts` → PASS. Update the handoff and the V8 line.
- [ ] **Step 5: Commit** `feat(words): extra card after a mistake, rounds in practice`.
