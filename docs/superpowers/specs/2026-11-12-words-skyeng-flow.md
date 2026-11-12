# Design: Skyeng-like word training (2026-11-12)

Agreed with the learner in chat on 2026-11-12 after round 4, modelled on the Skyeng app (word card screenshot shared in chat; Skyeng rules from its help centre: a word is learning until 6 correct answers, a wrong answer brings the word back after one card). Our exercise types stay. Binding where it says something; otherwise `2026-11-12-words-feedback-4.md` (K1–K7), `2026-11-11-words-feedback-3.md`, `2026-11-07-words-multi-card-design.md` and `2026-11-04-words-design.md` hold. It supersedes M3 (rounds over the whole practice) and M5 (one practice of 10 words) of the multi-card design, and the intro card of K4.

## S1. Two trainings
- **"Новые слова" / "New words"**: never-answered ready words, up to 10 per training, within today's new-word allowance (10 + "+10 new words", unchanged).
- **"Повторение" / "Review"**: due words (most overdue first), up to 10 per training. Card plans per word as now (in progress 2, learned 1), ordered in rounds over the whole training as now (H5); no word cards.
- The Words page shows two buttons, each with its count of available words (not capped at 10: all due words; new words left in today's allowance), the button disabled (`not-allowed`) at 0. The Today link keeps one line with the total (unchanged).
- Route `/words/practice?mode=new|review`. The end screen ("Готово: X из Y", Moved up / Moved down, unchanged) offers "Продолжить · ещё N" / "Continue · N more" for the same mode when words of that mode are left (N = min(left, 10)); "+10 new words" stays where it is now.

## S2. New-word training
- The words are split into **groups**: n ≤ 3 → one group of n; otherwise groups of 3, with the remainder handled so no group has 1 word: n % 3 = 1 → the last two groups are 2 + 2; n % 3 = 2 → the last group is 2 (10 → 3,3,2,2; 8 → 3,3,2; 7 → 3,2,2; 5 → 3,2; 4 → 2,2).
- For each group in order: the **word cards** (S4) of its words, in queue order, then the group's **tests**: 3 per word, `choice` → `build` → `gap_hint` (`anagram` when the word has no gap exercise). Tests are arranged in rounds within the group (round k = the k-th test of each word), shuffled within the round, and a word's tests are never back to back unless it is the only word with tests left (the rule of H5, applied to the group). A group's tests all come before the next group's word cards.
- A word removed or marked known on its word card (S4) loses its tests.

## S3. Mistakes (both trainings)
- A wrong answer (including Skip, the 3rd mistake on build tiles) puts **another test of the same word** after **one** other card: it is inserted right after the next card that belongs to another word; when no such card is left, it is appended. Its type follows `extraType` (unchanged).
- This repeats until the word is answered right, up to **2 extra tests per word per training**. It replaces "one extra card at the end of the next round" (M3).
- Counting is unchanged: only a word's first answer of the day counts for FSRS and the stage; "Done: X of Y" uses each word's first test in the training.

## S4. Word card (replaces the intro card)
Layout from the Skyeng screenshot, without a picture:
- A coloured band (primary colour) with the word large and a **speaker icon button** (lucide `Volume2`, no emoji), and the translation under the word.
- Under the band: transcription · part of speech (each shown only when not empty), the definition, the example with the word in **bold** and its own speaker icon button.
- Two text buttons with icons: "Уже знаю это слово" / "Already know this word" (lucide `Check`) and "Удалить из словаря" / "Remove from vocabulary" (lucide `X`, asks for confirmation inline, as the Delete on the word page), and a full-width primary "Дальше" / "Next".
- **Already know**: saves a counted review of card type `known` with result `correct`; the replay treats a `known` review as an Easy rating and sets the stage to Learned (4). The word's tests leave this training; from then on it comes only in Review.
- **Remove**: deletes the word (as on the word page); its tests leave this training.
- Word cards are **not counted** in the header: the header shows "k / N" where N is the number of tests in the training (growing with extra tests) and k the number of the current test, or of the next test while a word card shows.
- The word details shown after an answer use the same layout without the two text buttons and with the existing "Дальше"; the dictionary link stays under them.

## S5. Transcription, part of speech, sound
- Two new word fields, `transcription` (IPA between slashes, e.g. `/kənˈfɛdərɪt/`) and `partOfSpeech` (English, e.g. `noun`, `verb`, `phrasal verb`), stored on the word (new migration, default `''`), shown on the word page fields and editable there like the other fields.
- The `words` generation call returns both (prompt and schema updated; filled only when the learner left them empty, as the other fields). Saved ready words with an empty transcription get the two fields **once per app start** through the words job, in a phonetics-only mode: the same `words` call, but only the two empty fields are written; exercises, generation state, reviews and progress stay, and the words stay practisable while it runs. A failed call changes nothing (retried on the next start).
- Sound: the speaker buttons speak the word or the example with the system voice (Web Speech `speechSynthesis`, an English voice matching the spelling setting: en-GB or en-US). When speech synthesis is not available the buttons are not shown. Checked on the Mac (checklist); the macOS `say` command is a later fallback if needed.

## S6. Testing
- Vitest: group sizes for n = 1…10; the new-word training order (cards then tests per group, 3 tests per word, no back to back within a group except one word); the mistake insertion (after one card of another word, appended at the end, max 2 extra, repeats on a wrong extra); `known` review replay (stage 4, Easy); queues for both modes (limits, due order, new allowance); migration and repo fields; generation fills the new fields only when empty; the start-up regeneration picks words with an empty transcription once.
- E2E (words.spec): two buttons with counts; a new-word training shows word cards of a group, then its tests, then the next group's cards; the header ignores word cards; a wrong answer brings the word back after one card; Already know removes the word's tests and the word shows as Learned on the Words page; Remove asks and deletes; the word card shows transcription and part of speech; a Review training holds only due words; Continue keeps the mode. The speaker button is hidden in the test browser when `speechSynthesis` is missing, and shown and clickable when present (stub it).
- cursor.spec: the two buttons, the speaker buttons, Already know, Remove and its confirmation buttons are `pointer`; a disabled training button `not-allowed`.
