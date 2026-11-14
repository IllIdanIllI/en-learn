# Design: words feedback round 4 (2026-11-12)

Agreed with the learner in chat on 2026-11-11/12. Binding where it says something; otherwise `2026-11-11-words-feedback-3.md` (H1–H6), `2026-11-07-words-multi-card-design.md` (M1–M6) and `2026-11-04-words-design.md` (V1–V11) hold.

## K1. Skip on the Check row
- Skip ("Пропустить" / "Skip", ghost) sits on the same row as Check, after it (and after "First letter" where that button is shown): typed cards (`spell`, `gap_hint`, `gap`, `collocation`, `form`), `translation`, tiles (`anagram`) and "use it".
- Cards without a Check button (`choice`, `confusable`, `build`) keep Skip on its own row under the card.
- Skip behaviour is unchanged (H3); it is not shown on the `intro` card, after an answer, or while the translation self-mark buttons are shown.

## K2. Tiles in several rows
- Letter tiles (`anagram` and `build`) are bigger (at least 44 × 44 px, larger letter) and are laid out in rows of **at most 6** tiles, centred. A word of 6 letters or fewer stays one row.

## K3. Words with a space
- Tile cards (`anagram`, `build`) show an answer row of **empty slots**, one per letter, with a visible gap where the word has a space ("give up" → `_ _ _ _   _ _`). Placed letters fill the slots in order and step over the gap; there is no space tile. The answer is the letters with the spaces put back, and it is checked against the word as written.
- The shuffled letters are shuffled **within each word** of a phrase and keep the spaces between words ("give up" → "vgie pu"). Tiles show the letters without the spaces (in that order); the `spell` card shows them with the spaces.
- One-word answers look the same as before, apart from the slots.

## K4. New words: intro card and easy tiles
- **Intro card** (`intro`, new): shows the word, its translation, definition and example and the dictionary link (as in the feedback after an answer), and one button "Понятно" / "Got it" that moves on. It is not a test: no review is saved, it does not count for "Done: X of Y", it has no Skip. It counts in the header position and total ("1 / 24").
- **Easy tiles** (`build`, new; "Соберите слово по буквам" / "Build the word letter by letter"): the definition, the empty slots (K3) and the tiles. The learner places letters **in order**:
  - a tile with the next letter of the word (case-insensitive; any tile with that letter) goes into the next slot;
  - a tile with another letter flashes red (about 0.6 s), stays where it is and costs **one of 3 attempts**; the attempts left are shown as 3 dots, used ones hollow, with the text label "Попытки: 2 из 3" / "Attempts: 2 of 3" for screen readers;
  - typing a letter works the same as tapping the first unused tile with that letter (Russian layout as in H1); a letter that is on no unused tile is ignored and costs nothing; Backspace does nothing;
  - when the last slot is filled the answer is saved at once: **correct** with no mistakes, **Hard** with 1 or 2 mistakes; the 3rd mistake ends the card as **wrong**, with the feedback as after a wrong answer (the word is shown) and the extra card (M1);
  - no Check and no hint button; Skip as on other cards (counts wrong, H3).
- **Plan of a new word** (replaces M2 "New word"): `intro` → `choice` → `build` → `gap_hint`; without a gap exercise: `intro` → `choice` → `build` → `anagram`. So a new word has 3 tested cards plus the intro (M1 counts stay: 3 tested, +1 after a mistake).
- Rounds (H5) are unchanged: round 1 holds the intro cards of new words and the first cards of the other words, so a word's intro is followed by its own pick only when it is the only word left.
- **Extra card** after a mistake: a missed `choice` or `build` gets `build`; other types as now (same type).
- Stage New on later days (in progress, stage 1) is unchanged: `anagram` (tiles with Check) and `gap_hint`.
- Learned words, stages 2–4 and `spell` are unchanged.

## K5. Fill-the-word clue in the app's language
- `gap_hint`, `gap` and `collocation` cards show one clue line above the sentence: with the app in Russian, the word's **translation** from the list; in English, the word's English **definition**. When that field is empty, the other one is shown.
- The sentence translation (`translation` of a gap exercise) is no longer shown on any card (it equalled the filled-in sentence when the app was in English).
- `form` (has its cue word), `confusable` (options) and `translation` cards are unchanged.

## K6. Sentences that reveal the word
- A `gap`, `collocation` or `form` exercise **reveals the word** when its text, with the `___` taken out, contains the word itself or one of the exercise's accepted answers, as a whole word or phrase, case-insensitive ("Intermittent ___ showers kept…" for "intermittent").
- **Generation** (code only, the AI instructions are unchanged): exercises that reveal the word are dropped before they are saved; the word's other exercises are kept. A word is marked failed only when no gap exercise is left after dropping (the other range rules stay as they are and are checked on the reply as received).
- **Saved exercises** that reveal the word are left in the database but never shown in practice (they are filtered out when the practice loads the word's exercises).

## K7. Testing
- Vitest: plan of a new word (intro, choice, build, gap_hint; fallback anagram), `build` extra card for missed choice/build; shuffling within words of a phrase (spaces kept, letters per word kept, differs from the word); answer with spaces put back for slots; the reveal check (word, answer, case, whole word only — "rely" in "reliable" does not reveal, phrase words, `___` removed); generation drops revealing exercises and fails a word only with no gap left; practice skips saved revealing exercises.
- E2E (words.spec): intro card shows the word and "Got it" moves on without a saved review (the end count is unchanged); build: right letters fill the slots and the card ends correct, a wrong letter costs an attempt (dots), 3 wrong letters end the card wrong and add a card (header total +1); a phrase with a space shows the gap and is accepted; the fill-the-word clue is the translation in Russian and the definition in English; Skip is on the same row as Check on a typed card. Existing tests that relied on the old new-word order are updated.
- cursor.spec: "Got it" and build tiles — pointer; disabled tiles `not-allowed`. Build slots are not buttons (letters are placed in order and cannot be taken back); anagram placed letters stay buttons (H1).
