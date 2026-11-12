# Skyeng-like word training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate New words / Review trainings, new words in groups of 2–3 (word cards then mixed tests), a word comes back after one card when missed, a Skyeng-style word card with transcription, part of speech, sound, Already know and Remove.

**Architecture:** Task 1 adds the two word fields end to end (DB, repo, generation, forms, start-up regeneration). Task 2 builds the pure training logic in `src/core/words/` (queues per mode, groups, retry insertion, `known` replay). Task 3 wires the UI (Words page buttons, practice mode, word card, header) and the e2e tests.

**Tech Stack:** TypeScript, React, Tailwind, lucide-react, SQLite (sql.js in tests/preview), ts-fsrs, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-words-skyeng-flow.md` (S1–S6).

## Global Constraints
- UI strings only in `src/core/i18n/{ru,en}.ts`, both languages; banned "again", "снова", "опять" and the em dash "—" (`tests/core/i18n.test.ts`). No emoji in the UI (speaker = lucide `Volume2`).
- Every interactive element has `cursor: pointer`, disabled `not-allowed`; `tests/e2e/cursor.spec.ts` checks pages (add cases for new controls).
- Only a word's first answer on a calendar day counts (`recordAnswer`, unchanged). "Done: X of Y" = words whose first test in the training was not wrong, out of words tested.
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`. Before each commit: `yarn vitest run`, `yarn typecheck`, `yarn lint`; Task 3 also `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts --trace off`. Scratch logs only inside `.superpowers/sdd/<plan>/`, never at `/`.
- Never weaken or delete a test to pass; update tests only where this spec changes behaviour.
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY`.

## Review Focus
1. Retry insertion when the missed word's next card is its own (rounds with one word left): the extra goes after the next card of **another** word, else appended; never more than 2 extras per word; a wrong extra triggers the next extra (Task 2 tests).
2. Already know / Remove while that word's tests are still queued (and one is the immediately next card): all its remaining tests leave, the header total shrinks, no crash at the end of the list (Task 3 e2e + Task 2 helper test).
3. A new training with 1 word, and with 4 words (2+2): group order and the "only word left" exception (Task 2).
4. Start-up regeneration runs once: words already having a transcription are not regenerated; a word whose generation fails keeps an empty transcription and is retried only on the next start (Task 1).
5. Review training never includes never-answered words, and New training never includes reviewed words; the counts on the two buttons match what the training shows (Task 2 + Task 3).

---

### Task 1: Transcription and part of speech end to end

**Files:**
- Create: `src/db/migrations/0007_word_phonetics.sql`
- Modify: `src/core/words/types.ts` (`WordFields`), `src/core/db/repos/words.ts` (row type, `toWord`, `insertWord`, `updateWord`, `listWords`), `src/core/llm/types.ts` (`GeneratedWord`), `prompts/words.md`, `prompts/words.schema.json`, `src/core/words/generate.ts` (fill when empty), `src/core/words/name.ts` or a new `src/core/words/phonetics.ts` (start-up selection), `src/ui/words/WordsJobProvider.tsx`, `src/ui/words/WordForm.tsx` and `src/ui/words/WordDetails.tsx` (show/edit the two fields), `src/adapters/preview/previewLlm.ts` (fake reply returns both), `src/adapters/preview/fixtures.ts` / `wordsSeed.ts` (seed words get both), every other `WordFields` literal the type checker reports (`importParse.ts`, `ImportPanel.tsx`, tests).
- Test: `tests/core/db/words.test.ts`, `tests/core/words/generate.test.ts`, `tests/core/words/generated.test.ts` (if the problems check changes), a test for the start-up selection.

**Interfaces (produces):**
- `WordFields` gains `transcription: string` and `partOfSpeech: string` (default `''`). DB columns `transcription TEXT NOT NULL DEFAULT ''`, `part_of_speech TEXT NOT NULL DEFAULT ''`.
- `GeneratedWord` gains `transcription: string` (IPA between slashes) and `partOfSpeech: string` (English: noun, verb, adjective, adverb, phrasal verb, idiom, …). Schema: both required strings. Prompt: add both to "Fields to fill" (keep the learner's text when not `(missing)`); the user prompt lists `Transcription:` and `Part of speech:` like the other fields.
- `runBatch` fills `transcription` / `partOfSpeech` from the reply only when the stored value is empty (same rule as definition).
- `wordsMissingPhonetics(words: Word[]): number[]` — ids of words with `generation === 'ready'` and an empty (trimmed) `transcription`. `WordsJobProvider` on mount, after the existing name fix: `run(ids)` for these ids, once per app start (same ref guard). Order: name-fix ids and these ids are merged without duplicates into one `run` call.

- [ ] **Step 1: Tests.** words repo: insert/update/list round-trip the two fields; a row inserted without them reads `''`. generate: a reply with both fields fills empty ones and keeps the learner's non-empty ones. `wordsMissingPhonetics`: ready + empty → included; pending/failed or non-empty → excluded. Preview reply returns non-empty values for both.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** as in Interfaces. WordForm/WordDetails: two more text fields with `label[for]` titles ("Транскрипция"/"Transcription", "Часть речи"/"Part of speech"), saved like the others.
- [ ] **Step 4:** checks → PASS (also `yarn playwright test tests/e2e/words.spec.ts --trace off` if WordForm changed visible behaviour: adding/editing a word still works).
- [ ] **Step 5: Commit** `feat(words): transcription and part of speech`.

### Task 2: Training logic (pure core)

**Files:**
- Modify: `src/core/words/queue.ts`, `src/core/words/plan.ts`, `src/core/words/practice.ts`, `src/core/words/progress.ts`, `src/core/words/types.ts` (`CardType` gains `'known'`).
- Test: `tests/core/words/{queue,plan,practice,progress}.test.ts`.

**Interfaces (produces):**
- `type PracticeMode = 'new' | 'review'` (in `practice.ts`).
- `queue.ts`: `reviewQueue(words, today): number[]` — ready, reviewed, due ≤ today, most overdue first, max `PRACTICE_WORDS`; `newQueue(words, today, extraNew): number[]` — ready, never reviewed, within today's allowance, max `PRACTICE_WORDS`. `practiceQueue` is removed (or kept only if still used; no dead code).
- `plan.ts`: `groupSizes(n: number): number[]` — per S2 (1→[1], 2→[2], 3→[3], 4→[2,2], 5→[3,2], 6→[3,3], 7→[3,2,2], 8→[3,3,2], 9→[3,3,3], 10→[3,3,2,2], 0→[]).
- `plan.ts`: `newWordTests(hasGap: boolean): CardType[]` → `['choice','build', hasGap ? 'gap_hint' : 'anagram']`. `planCards` for a never-reviewed word returns these 3 tests (no `intro`).
- `plan.ts`: `insertRetry<T extends { wordId: number }>(cards: T[], at: number, extra: T): T[]` — inserts `extra` right after the first card after index `at` whose `wordId` differs from `extra.wordId`; if none, appends.
- `practice.ts`: `buildPractice(deps: Deps, mode: PracticeMode, extraNew = 0): Promise<PracticeCard[]>`.
  - `review`: as today's build for the review queue (planCards + `orderRounds` over the whole training).
  - `new`: for each group of `groupSizes(n)` over the new queue in order: the group's `intro` cards (word cards; `CardType` `'intro'` stays the name), then `orderRounds` over the group's test plans; `round` numbers keep increasing across groups.
- `practice.ts`: `isTest(pc: PracticeCard): boolean` (`card.type !== 'intro'`); `testPosition(cards: PracticeCard[], index: number): { k: number; n: number }` — n = tests in the list; k = 1 + tests before `index` (so on a word card k is the next test's number).
- `practice.ts`: `dropWord(cards: PracticeCard[], from: number, wordId: number): PracticeCard[]` — removes the word's cards after index `from`.
- `practice.ts`: `markKnown(deps: Deps, wordId: number): Promise<void>` — `recordAnswer` with `cardType: 'known'`, `exerciseId: null`, `result: 'correct'`, `text: ''`.
- `progress.ts`: in `replayWord`, a counted review with `cardType === 'known'` grades `Rating.Easy` and sets `stage = 4` (and `passedUse = true`).
- `wordsOverview` gains `newAvailable: number` and `reviewAvailable: number` (lengths of the two queues); `available` = their sum (Today link unchanged).
- Extra tests after a mistake are created by the existing `extraCardFor`; the "max 2 extras per word" counter lives in the UI (Task 3) — the core only provides `insertRetry`.

- [ ] **Step 1: Tests.**
  - `groupSizes` for 0…10 exactly as listed.
  - new training (sql.js db as in practice.test, 10 / 4 / 1 new words): cards are `[intro×g1, tests of g1, intro×g2, tests of g2, …]`; each word has exactly `choice, build, gap_hint|anagram` in that order; within a group no two neighbouring tests share a word unless only that word has tests left in the group (check across 30 seeds); the intro cards of a group are in queue order.
  - review training: contains only reviewed due words, no `intro`; new training contains only never-reviewed words.
  - `insertRetry`: `[a,b,c]` at 0 → `[a,b,X(a),c]`; `[a,a2,b]` at 0 with X of a → after b: `[a,a2,b,X]`; at the last index → appended; next card of the same word and nothing else → appended.
  - `testPosition`: list `[intro A, intro B, test, test, intro C, test]`: index 0 → {k:1,n:3}; index 2 → {k:1,n:3}; index 3 → {k:2,n:3}; index 4 → {k:3,n:3}.
  - `dropWord` removes only later cards of that word.
  - replay: a single `known` review → stage 4, `reviewed: true`, due in the future; `known` followed by a wrong answer on a later day goes down as usual.
  - `markKnown` saves one counted review of type `known`.
  - overview: `newAvailable` and `reviewAvailable` match the queues; existing `available` assertions updated to the sum.
  - Update existing tests that relied on the mixed practice / intro in `planCards` / `insertExtra` (replace `insertExtra` uses with `insertRetry`; remove `insertExtra` if unused — no dead code).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4:** checks → PASS (UI may fail to type-check where it calls `buildPractice(deps, extra)` / `insertExtra`: update those call sites minimally — `WordsPractice` passes `'review'` until Task 3, `insertExtra` → `insertRetry` — so typecheck stays green).
- [ ] **Step 5: Commit** `feat(words): new and review trainings, groups, retry after one card, already-known replay`.

### Task 3: UI: two trainings, word card, header, retries

**Files:**
- Create: `src/ui/words/WordCard.tsx` (the S4 layout), `src/ui/words/speech.ts` (`canSpeak(): boolean`, `speak(text: string, variant: 'en-GB' | 'en-US'): void`).
- Modify: `src/ui/pages/Words.tsx` (two buttons), `src/ui/pages/WordsPractice.tsx` (mode from `?mode=`, header via `testPosition`, retries, Already know / Remove), `src/ui/words/CardView.tsx` (intro renders `WordCard`; feedback word details use `WordCard` without the two text buttons), `src/ui/words/PracticeEnd.tsx` (Continue label per mode), `src/core/i18n/{ru,en}.ts`, `docs/superpowers/handoff.md` (one line), `docs/macos-checklist.md` (a "Words: sound" item: the speaker buttons speak the word and the example; if silent, note it for the `say` fallback), `src/adapters/preview/*` only if a seed change is needed.
- Test: `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`, `tests/e2e/helpers.ts`.

**Interfaces:** consumes Task 1 (`transcription`, `partOfSpeech`) and Task 2 (`PracticeMode`, `buildPractice(deps, mode, extra)`, `testPosition`, `insertRetry`, `dropWord`, `markKnown`, `newAvailable`, `reviewAvailable`, `extraCardFor`).

- i18n (both languages): `words.startNew` ru `Новые слова · {n}`, en `New words · {n}`; `words.startReview` ru `Повторение · {n}`, en `Review · {n}`; `words.more` becomes ru `Продолжить · ещё {n}`, en `Continue · {n} more`; `words.known` ru `Уже знаю это слово`, en `Already know this word`; `words.remove` ru `Удалить из словаря`, en `Remove from vocabulary`; `words.remove.confirm` ru `Удалить слово из словаря?`, en `Remove the word from the vocabulary?` (reuse `words.delete.yes`/`words.delete.no` for the buttons); `words.speak` ru `Произнести`, en `Play` (aria-label of the speaker buttons). Remove keys this change makes unused (`words.start`, `words.gotIt`, `words.instr.intro` if unused).

- [ ] **Step 1: E2E tests** (`?state=words` etc.; read the helpers first; `answer()` handles `intro` by clicking "Дальше" on the word card).
  - Words page: two buttons with counts ("Новые слова · 1", "Повторение · 6" in `?state=words` — verify the real numbers by running); a button with 0 is disabled (`aria-disabled`, `not-allowed`).
  - New training (`?state=words-limit` has many new words; check which state gives ≥4 new words): first cards are the word cards of group 1 (2 or 3 cards, `data-card-type="intro"`), then their tests (`choice`, `build`, `gap_hint`/`anagram` per word), then group 2's word cards; header shows `1 / N` on the first word card and on the first test, where N = 3 × words.
  - Retry: a wrong `choice` → after the next card (of another word) the same word comes back with a `build` test; header total +1; a word missed 3 times gets no more than 2 extras.
  - Already know on a word card: its tests do not appear, the header total drops by 3; on the Words page the word's stage is Learned.
  - Remove: asks (`Удалить слово из словаря?`), "Да" deletes; the word is gone from the Words page; "Нет" keeps it.
  - Word card shows the transcription and part of speech of the seed word, the translation under the word, the example with the word in bold.
  - Speaker: with `speechSynthesis` stubbed in `page.addInitScript`, two speaker buttons are shown and clicking calls `speak` with the word / the example; with `speechSynthesis` deleted, no speaker buttons.
  - Review training (`?mode=review`): no word cards, only reviewed words; Continue keeps `mode`.
  - Update existing tests that assumed one mixed practice, the intro inside rounds or "Понятно" (counts re-verified by running; record old → new in the report).
  - cursor.spec: both start buttons, speaker buttons, Already know, Remove, the confirm buttons → `pointer`; a disabled start button → `not-allowed`.
- **Notes:**
  - `WordCard` props: `{ word: Word; lang: Lang; onKnown?: () => void; onRemove?: () => void; spelling: 'en-GB' | 'en-US' }` (spelling from settings, as the prompts use it). Band: `bg-primary text-primary-foreground rounded-lg p-5`, word `text-3xl font-semibold` (`.answer`), speaker button right; translation under the word. Below: `transcription · partOfSpeech` (only non-empty parts), definition (`p.reading` — keep it the first `p.reading` so e2e `promptOf` still maps the card to its word), example with every case-insensitive whole-word occurrence of the word in `<strong>` and its own speaker button. Known/Remove as ghost buttons with lucide `Check`/`X`; Remove shows the inline confirmation (pattern of `WordDetails`).
  - Word card "Дальше" (primary, full width) calls `onNext`; no Skip; Enter repeat ignored (keep the existing intro guard).
  - WordsPractice: `mode` from `useSearchParams` (`'new'` when `mode=new`, else `'review'`); `extras: Map<wordId, number>` ref (max 2); on a wrong result, if the word's count < 2: `extraCardFor` → `insertRetry(cards, at, extra)` and count+1. Already know: `markKnown` then `setCards(dropWord(cards, index, wordId))` then advance; Remove: `deleteWord` then the same drop and advance. The `first` map ignores word cards (unchanged).
  - Header: `testPosition(cards, index)` → `k / n`.
  - Feedback after an answer: `WordCard` without `onKnown`/`onRemove`, plus the existing your-answer / right-answer lines and the dictionary link.
  - PracticeEnd: `canContinue` = the same mode still has words; label `words.more` with `n = min(left, 10)`; Continue reloads the same mode.
- [ ] **Step 2:** run → new tests FAIL.
- [ ] **Step 3: Implement** as in the notes.
- [ ] **Step 4:** checks + e2e → PASS.
- [ ] **Step 5: Commit** `feat(words): new and review trainings, Skyeng-style word card`.
