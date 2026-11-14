# Design: words feedback round 3 (2026-11-11)

Agreed with the learner in chat on 2026-11-11 after trying several cards per word. Binding where it says something; otherwise `2026-11-07-words-multi-card-design.md` (M1–M6) and `2026-11-04-words-design.md` (V1–V11) hold.

## H1. Anagram with letter tiles
- The `anagram` card (stage New) shows the shuffled letters as **tiles** (buttons). A tap on a tile adds its letter to the answer row and disables that tile; a tap on a placed letter puts it back. Typing a letter on the keyboard places the first unused tile with that letter (case-insensitive); Backspace returns the last placed letter.
- "Проверить" / "Check" or ↵ checks, as on other cards; it is enabled when at least one letter is placed. No hint button (as now).
- Every tile and placed letter has `cursor: pointer`; disabled tiles `not-allowed`.
- **New card type `spell`** ("Напишите слово" / "Write the word"): the current typed anagram (definition, shuffled letters shown, the learner types the word). It needs no exercise. It joins the **Recall** types (stage 2) next to gap / collocation / form / confusable, so it can also appear for Learned words and as a stage-3 lead when there is no translation. Its extra card after a mistake is `spell`.
- A missed `anagram` (tiles) gets an `anagram` extra card (as now); a missed choice still gets an `anagram`.

## H2. "Almost" includes a swap
- A typed answer (and the tile answer) is "Almost" when it is one edit away from an accepted answer, where an edit is one wrong letter, one missing or extra letter, **or two neighbouring letters swapped** ("recieve" for "receive"). Rules of V6 otherwise unchanged (one retry, a correct retry rates Hard).

## H3. One Skip on every card
- Every card shows one "Пропустить" / "Skip" button (ghost) while unanswered. It counts as **wrong**: the review is recorded with result `wrong` and empty text, the word gets its extra card (M1, once per practice), and the feedback shows the right answer (the word, plus "Правильный ответ" / "Right answer" with the accepted answers for exercise cards) with the word details as after a wrong answer, then "Дальше" / "Next".
- On "use it" there is no single answer: the feedback shows the word's example sentence (or the definition when the example is empty).
- The old "use it" Skip (swap to a translation card, nothing recorded) is removed, with `swapForTranslation` and its tests.
- Skip is disabled (`not-allowed`) while a check is running.

## H4. Words without a bracketed tail
- A bracketed part at the end of the word is removed and not kept: "incentive (for)" → "incentive", "rely (on) " → "rely". Rule: remove a trailing `(…)` with the spaces before it, once; the rest is trimmed. Words with brackets elsewhere are unchanged.
- Applied on import (the parsed Word field, before the duplicate check), when adding a word and when saving the fields form.
- **Saved words** are fixed once when the app starts (the Words job provider mounts): each saved word ending with a bracketed part is renamed and its exercises are created again through the words job (as "Regenerate" does). Reviews and progress stay. If the stripped name already belongs to another saved word, that word is left unchanged. Running it again finds nothing to fix.

## H5. Mixed order within a round
- Rounds stay (M3: round k holds the k-th card of each word; each word goes easy → hard). Within each round the cards are **shuffled** (the practice's random source).
- A word's cards are never back to back unless it is the only word left: when round k+1 would start with the word that ended round k, its first card is swapped with the first card in round k+1 of another word; when round k+1 holds only that word, the last card of round k is swapped with an earlier card of round k of another word (if any).
- The extra-card rule (M3) is unchanged.
- The rule "words with more cards first within a round" is dropped.

## H6. Testing
- Vitest: the bracket stripping (examples above, brackets in the middle, no brackets); the saved-words fix (renames, skips a clash, idempotent, returns the ids to regenerate); "Almost" with a swap, with one wrong letter, and a two-edit answer is wrong; `spell` in the Recall types and its extra card; shuffled rounds with a fixed random source (each round holds the right words, no word back to back in examples with 2+ words, one-word case allowed); Skip records a wrong review and gives the extra card.
- E2E (words.spec): tiles build the word by click and by keyboard, a placed letter goes back on click, Check; a tile answer with two neighbouring letters swapped gets "Почти"; Skip on a choice card shows the answer, counts wrong (header total grows by one); Skip on "use it" shows the example; an imported "incentive (for)" appears as "incentive". Existing tests that relied on the typed anagram or the old use-it Skip are updated.
- cursor.spec: tiles, placed letters and Skip are pointer; disabled tiles `not-allowed`.
