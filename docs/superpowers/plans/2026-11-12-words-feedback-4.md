# Words feedback round 4: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip on the Check row, tiles in rows of 6 with slots and spaces, an intro card and easy tiles (`build`) for new words, the fill-the-word clue in the app's language, and no exercises that reveal the word.

**Architecture:** Pure core helpers (plan, letters, reveal check, clue, build scoring) with unit tests; generation drops revealing exercises and practice filters saved ones; CardView gets the intro and build cards, slots, the clue and the Skip row.

**Tech Stack:** TypeScript, React, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-words-feedback-4.md` (K1–K7).

## Global Constraints
- UI strings only in `src/core/i18n/{ru,en}.ts`, both languages; banned "again", "снова", "опять" and the em dash "—" (`tests/core/i18n.test.ts`).
- Every interactive element has `cursor: pointer`, disabled `not-allowed` (global rule in `src/ui/styles/globals.css` covers `button`); `tests/e2e/cursor.spec.ts` checks pages.
- Only the first answer to a word on a calendar day counts (`recordAnswer`, unchanged). A word gets at most one extra card per practice (M1, unchanged). The intro card never calls `recordAnswer`.
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`. Before each commit: `yarn vitest run`, `yarn typecheck`, `yarn lint`; Task 2 also `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts --trace off`. screenshots.spec and csp.spec are out of scope.
- Never weaken or delete a test to pass; update only what this spec changes.
- The AI prompt (`prompts/words.md`, `prompts/words.schema.json`) is **not** changed (K6: code only).
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY`.

## Review Focus
1. `revealsWord`: whole-word match only ("rely" vs "reliable"), case-insensitive, `___` removed, regex special characters in the word escaped. Task 1.
2. Generation: a word whose every gap reveals is failed; otherwise its revealing exercises are dropped and the rest saved. Task 1.
3. Build card: repeated letters ("committee"), the 3rd mistake ends the card exactly once (one wrong review, one extra card), a finished card ignores further taps and keys. Task 2.
4. Intro card: no review saved, "Done: X of Y" unchanged, the header counts it. Task 2.
5. Slots with a space: placed letters step over the gap; the anagram answer is checked with the space. Task 2.

---

### Task 1: Core: card types, plan, letters, reveal check, clue

**Files:** Modify `src/core/words/types.ts`, `src/core/words/plan.ts`, `src/core/words/check.ts`, `src/core/words/constants.ts`, `src/core/words/practice.ts`, `src/core/words/generated.ts`, `src/core/words/generate.ts`; Test `tests/core/words/{plan,check,practice,generated,generate}.test.ts` (use the existing test files; create one only if missing).

**Interfaces (produces):**
- `CardType` gains `'intro'` and `'build'` (no exercise: `EXERCISE_OF` has no entry; `cardOfType` returns `{ type, exercise: null }`).
- `planCards` for a new word (`!state.reviewed`): `['intro', 'choice', 'build', hasGap ? 'gap_hint' : 'anagram']`. Other stages unchanged.
- `extraType`: `'choice'` and `'build'` → `'build'`; `'intro'` never gets one (it is never answered); others unchanged.
- `toPracticeCard`: `letters` for `anagram`, `build` and `spell`.
- `anagram(word, rand)`: shuffles the letters **within each space-separated part** and joins the parts with one space; the result differs from the word when any part has two different letters (keep the existing retry and fallback idea per whole phrase); one-word behaviour as now (no space in the result).
- `withSpaces(letters: string, word: string): string` — puts the spaces of `word` back into `letters` at the same positions (`withSpaces('giveup', 'give up') === 'give up'`); used by tile cards to build the answer.
- `BUILD_ATTEMPTS = 3` in `constants.ts`; `buildResult(mistakes: number): ReviewResult` — 0 → `'correct'`, 1–2 → `'hard'`, ≥ 3 → `'wrong'`.
- `revealsWord(text: string, answers: string[], word: string): boolean` — `text` with every `___` replaced by a space; true when `word` or any non-empty answer occurs as a whole word/phrase, case-insensitive (boundaries: start/end or a character that is not a letter, digit or apostrophe; escape regex characters).
- `clueOf(word: Word, lang: 'ru' | 'en'): string` — `ru`: `translation` (trimmed), else `definition`; `en`: `definition`, else `translation`.
- `loadWordViews` drops exercises of type `gap`, `collocation`, `form` that `revealsWord(e.prompt, e.answers, word.word)` (so planning, extra cards and `availableTypes` never see them).
- `withoutRevealing(g: GeneratedWord, word: string): GeneratedWord` in `generated.ts` — drops `gaps` (sentence/answer), `collocations` (phrase/answer) and `forms` (sentence/answer) that reveal the word. `runBatch` in `generate.ts`: after `wordProblems(g, w.word)` is empty, `const kept = withoutRevealing(g, w.word)`; if `kept.gaps.length === 0` → `setGeneration(failed)`, `failed++`, continue; else save `exercisesFrom(kept)`.

- [ ] **Step 1: Tests.**
  - plan.test: new word with a gap → `['intro','choice','build','gap_hint']`; without → `['intro','choice','build','anagram']`; `extraType('choice') === 'build'`, `extraType('build') === 'build'`; existing new-word cases updated to the new plan (card counts in M1 tests: a new word's plan has 4 cards, 3 of them tested).
  - check.test: `anagram('give up', rand)` for several seeds: has one space at index 4, the first part is a permutation of "give" and the second of "up", and differs from "give up"; one-word cases unchanged; `withSpaces('giveup','give up')`, `withSpaces('abc','abc')`; `buildResult(0|1|2|3)`; `revealsWord('Intermittent ___ showers', ['rain'], 'intermittent') === true`; `revealsWord('It was ___ reliable', ['rely'], 'rely') === false`; answer match (`'They ___ it; superseded rules'`, `['superseded']`, `'supersede'`) → true; phrase word (`'Do not give up ___'`, `['x']`, `'give up'`) → true; `'___ showers kept on'` with the word → false; a word with a regex character (`'c++'`) does not throw; `clueOf` for both languages and both fallbacks.
  - practice.test: a word whose saved gap exercise reveals the word gets no card from it (a view built with one revealing gap and one clean gap plans the clean one; `loadWordViews` drops it).
  - generated/generate tests: `withoutRevealing` keeps clean items; a reply where every gap reveals marks the word failed; a reply with one revealing gap saves the others (check the saved exercise count).
- **Binding review notes for Task 1:**
  - `anagram` callers: `toPracticeCard` only; tile cards in Task 2 strip spaces from `pc.letters` themselves.
  - `spellingsOf` stays as is (with and without spaces).
  - Preview seed (`src/adapters/preview/wordsSeed.ts`) must contain no revealing exercise; verify with a one-off check in a test (e.g. every seed exercise passes `!revealsWord`), so the seeded card counts do not change silently.
  - Do not touch `availableTypes`' `firstCard` branch.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4:** checks → PASS.
- [ ] **Step 5: Commit** `feat(words): intro and build cards in the plan, phrase letters, reveal check, clue`.

### Task 2: Card view and practice

**Files:** Modify `src/ui/words/CardView.tsx`, `src/ui/pages/WordsPractice.tsx` (only if needed for the intro), `src/core/i18n/{ru,en}.ts`, `src/adapters/preview/wordsSeed.ts` and `src/adapters/preview/fixtures.ts` (phrase state), `docs/superpowers/handoff.md`, `docs/superpowers/specs/2026-11-07-words-multi-card-design.md` (one note under M2 "New word": superseded by feedback-4 K4); Test `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`, `tests/e2e/helpers.ts`.

**Interfaces:** consumes Task 1.

- i18n (both languages): `words.gotIt` ru `Понятно`, en `Got it`; `words.instr.intro` ru `Новое слово`, en `New word`; `words.instr.build` ru `Соберите слово по буквам`, en `Build the word letter by letter`; `words.attempts` ru `Попытки: {left} из {total}`, en `Attempts: {left} of {total}`.

- [ ] **Step 1: E2E tests** (`?state=words`, Russian UI; read `answer`, `advanceTo`, `playUntil`, `runCards` first).
  - Helpers: `answer()` handles `intro` (click "Понятно", no "Дальше") and `build` (right: tap tiles in word order; wrong: tap a tile whose letter is not the next letter 3 times, then "Дальше"). Add `tapBuild(card, letters)` to `helpers.ts` if useful.
  - Intro: the first ephemeral card is `intro`, shows the word "ephemeral" and its definition; "Понятно" moves on; ephemeral's cards are `intro, choice, build, gap_hint` in that order and never back to back (update the existing "ephemeral shows choice, anagram and gap_hint…" test and the wrong-answer variant: after a wrong choice the extra card is `build`).
  - Build: right letters fill the slots and the card ends "Верно" without a Check button; one wrong tile → dots show 2 of 3 (`Попытки: 2 из 3`) and the card goes on; 3 wrong tiles → "Неверно", the header total grows by one.
  - Phrase: a new preview state `words-phrase` (fixtures.ts + wordsSeed.ts): one never-reviewed ready word "give up" (with gap, collocation, form, confusable and translation exercises that do not reveal it) plus three words not due (reviewed, due in the future) for the choice options. Its build card shows a gap between the slot groups (the slots of "give" and "up" are in two groups) and tapping g,i,v,e,u,p ends "Верно"; on its gap_hint card (or an anagram if no gap) the answer with the space is accepted.
  - Clue: on a `gap_hint` card the clue line is the word's translation (ru); after switching Settings → language English (see `settings-day.spec.ts`), a fill-the-word card shows the definition; the gap sentence translation is not shown.
  - Skip row: on a typed card (`gap_hint`) "Пропустить" and "Проверить" have the same parent element; on a `choice` card Skip is present.
  - cursor.spec: "Понятно" and a build tile are `pointer`; a used anagram tile stays `not-allowed`; the inline loop handles `intro` and `build`.
  - The end count after a practice with new words does not include intro cards (assert "Готово: X из Y" with Y = words practised).
- **Binding review notes for Task 2:**
  - `promptOf` in words.spec reads the first `p.reading` of the card; keep it the definition on `intro`, `choice`, `anagram`, `build`, `spell`, and the sentence on fill-the-word cards. The clue line (K5) is **not** `p.reading` (plain `p`, muted).
  - Intro: renders word (`.answer` headline), translation, definition (`p.reading`), example, dictionary link and a primary "Понятно" button that calls `onNext()` directly; focus it on mount so Enter works; no Skip, no `onResult`.
  - Build state: `placed: number[]` (tile indexes, in order), `mistakes: number`, `flash: number | null` (cleared by a 600 ms timeout, cleaned up on unmount). Target = `word.word` without spaces, compared case-insensitively. Tap tile i (not placed, card not locked): if `letters[i]` equals the next target letter → place; else `mistakes + 1`, flash i. When placed reaches the target length → `finish({ result: buildResult(mistakes), text: withSpaces(placedLetters, word.word) })`; when mistakes reaches `BUILD_ATTEMPTS` → `finish({ result: 'wrong', text: withSpaces(placedLetters, …) })`. Guarded by the existing `finished` ref. Keyboard (window listener, same rules as the anagram one): a letter that is the next target letter places the first unused tile with it; a letter on another unused tile is a mistake and flashes that tile; a letter on no unused tile is ignored; Backspace and Enter do nothing.
  - Attempts: three dots (filled = left), wrapper with `aria-label`/text `t('words.attempts', { left, total: BUILD_ATTEMPTS })` (a visually hidden span is fine).
  - Slots (anagram and build): one box per letter of `word.word`, grouped per space-separated part, a visible gap between groups; filled boxes show placed letters in order. Anagram: filled boxes are buttons (`data-testid="placed"`, click = return that letter, as now); empty boxes and all build boxes are not buttons. Anagram answer = `withSpaces(placedLetters, word.word)`, accepted `[word.word]` (replace the current "remove spaces" comparison). Keep Almost (H2) for the anagram.
  - Tiles: from `pc.letters` without spaces; `data-testid="tile"`; at least 44×44 px with a larger letter; laid out in rows of at most 6, centred (e.g. CSS grid with `min(6, n)` columns and `justify-content: center`).
  - Skip row (K1): typed cards and translation: Check, First letter (where shown), Skip in one flex row; anagram: Check and Skip in one row; use: Check and Skip in one row; choice, confusable, build: Skip alone in a row under the card. Same disabled rules as now. Remove the separate Skip row for the cards that now have it inline.
  - Clue (K5): on `gap_hint`, `gap`, `collocation`: `clueOf(word, lang)` in a muted `p` above the sentence; remove the `ex.translation` line.
  - `spell` shows `pc.letters` with the spaces (Task 1 gives them).
  - WordsPractice: the intro card never reaches `onResult`, so `first`/`extraGiven` stay untouched; no other change expected. The CardView key already includes the index.
  - Update the comment on `PREVIEW_WORDS` in wordsSeed.ts (the first practice's card count and that ephemeral starts with intro) and the e2e tests that hard-code card totals (14/15/20/30) after counting them again: a new word now has 4 cards.
  - Handoff: one line "Words feedback round 4 (2026-11-12): …" with the spec and plan paths.
- [ ] **Step 2:** run → new tests FAIL.
- [ ] **Step 3: Implement** as in the notes.
- [ ] **Step 4:** checks + e2e → PASS.
- [ ] **Step 5: Commit** `feat(words): intro and easy tiles, slots with spaces, clue in the app language, Skip on the Check row`.

---

## Binding notes from the plan review (apply on top of the tasks above)

**Task 1**
- Module placement: `revealsWord`, `withSpaces`, `buildResult`, `clueOf` in `check.ts`; `BUILD_ATTEMPTS` in `constants.ts`.
- `LIMIT_WORDS` seed: `limitWord()` in `wordsSeed.ts` puts the word in every gap/collocation/form prompt, so all of them reveal. Rewrite the prompts so they do not contain the word and stay unique (e.g. `Gap ${i}-1 ___.`, `Collocation ${i} ___`, `Form ${i} ___.`); keep `LIMIT_WORD_ANSWERS` consistent (keyed by prompt). Add a vitest that every exercise of `PREVIEW_WORDS` and `LIMIT_WORDS` passes `!revealsWord`.
- Unit tests to update explicitly (new behaviour, not weakening): practice.test "ten new words give 30 cards" → 40, round 1 is intro cards (fix `options`/`letters` assertions on the first 10); "card counts by stage" → `[4, 2, 1]` and the per-round test gets round 4; `extraCardFor(…, 'choice')` → `build`; "no word back to back across 50 practices": add a second 4-card word so rounds 3–4 hold 2+ words, or assert "no neighbours share a word unless that round holds only one word"; check.test "spaces are removed before shuffling" → rewrite per K3.
- `withSpaces` with a partial string: insert a space only before a letter whose index passes a gap; never a trailing space: `withSpaces('giveu','give up') === 'give u'`, `withSpaces('give','give up') === 'give'`, `withSpaces('giv','give up') === 'giv'`.
- `anagram`: split on single spaces, skip empty parts; `canDiffer = parts.some(p => new Set(p).size > 1)`; if false return the joined original; otherwise up to 20 attempts shuffling each part; then fallback: rotate the first part that can differ by one letter (never across parts).
- `revealsWord`: normalise ’ to '; return false when the word (trimmed) is empty, and ignore empty answers; escape with `/[.*+?^${}()|[\]\\]/g`; inside a phrase allow `\s+` between parts; match with flags `iu` and boundaries `(?<![\p{L}\p{N}'])…(?![\p{L}\p{N}'])`. Tests also: `revealsWord('', [], 'up') === false`, `revealsWord('x ___', [''], '') === false`.
- Between the Task 1 and Task 2 commits the app plans `intro`/`build` cards that CardView cannot render yet; acceptable (Task 2 follows at once), do not stub.

**Task 2**
- Build state without races: keep `placed` and `mistakes` in state **and** refs (`placedRef`, `mistakesRef`) updated synchronously; compute the next list locally (`next = [...placedRef.current, i]`), then `setPlaced(next)` and `finish` when full; never call `finish`/`setMistakes` inside a state updater. Key handlers return early when `finished.current` or locked, and ignore `e.repeat`. Clear the previous flash timeout before setting a new one; clear on unmount.
- DOM contract: tiles `data-testid="tile"`, placed tiles render `disabled` (anagram and build); slots `data-testid="slot"` inside one `data-testid="slot-group"` per word part; anagram filled slots are buttons with `data-testid="placed"` (as now); build slots are plain elements.
- Tile grid: `cols = Math.min(6, n)` in JS, `style={{ gridTemplateColumns: \`repeat(${cols}, 2.75rem)\` }}`, `justify-content: center`; tiles `h-11 min-w-11` with larger text.
- K1 layout: on typed cards the Input stays on its own line; Check, First letter (where shown) and Skip go together in one flex row under it (same for translation, anagram and use).
- `spell` with a space: render the letters per word group (a visible gap between groups), not one joined string.
- Intro: "Понятно" focused on mount; it ignores Enter auto-repeat (`e.repeat`), and the `Дальше` focus logic is unchanged.
- e2e/cursor updates (counts re-counted after the change; expected now: 14→15, import test 20→23, failed-word 14→15, 30→40, wrong-choice 15→16; verify each by running):
  - words-limit's first card is `intro`; "first seven cards … ephemeral first" → ephemeral's first card is `intro`.
  - "Ending early": answer until the first non-intro card is answered, then assert the end count dynamically (intro cards are not counted).
  - Ephemeral order `intro, choice, build, gap_hint`; adjacency assertion: no two neighbours share a word **unless only that word has cards left in the round** (ephemeral's build and gap_hint may be consecutive in the `words` seed). After a wrong choice the extra is `build`; drop the "extra not next to ephemeral" assertion where it cannot hold. "A second wrong answer adds no card" is rewritten around `build`.
  - cursor.spec anagram case: use `?state=words` and `advanceTo('anagram')` (stage-1 words) with `PREVIEW_WORD_ANSWERS`; add a separate `build` case in `words-limit`; the 30→40 end-screen loop branches on `intro` ("Понятно", no "Дальше").
  - `words-phrase`: add to `PREVIEW_STATES` and the seeding `if` in fixtures.ts; export `PHRASE_WORDS` and `PHRASE_WORD_ANSWERS` from wordsSeed.ts; the three other words have `reviews: ['2026-10-20']` (not due on TUESDAY); no failed word is added in this state (intended).
  - Re-verify that `spell`, `translation` and `use` still appear in the first `words` practice (seeded rand changed); if not, adjust the seed, never drop the test.
