# S1 feedback round 3 (2026-10-28)

Binding where it says something; otherwise the S1 spec and the round 1 and round 2 specs hold.

## H1. Fewer ticks
- Verdict chips show the word only ("Верно" / "Неверно", "Найдено" / "Не найдено"): no ✓ / ✗ glyph.
- A graded item whose answer is ✓ (or an accepted shorthand) shows no answer text after the chip.
- The fix input placeholder is "исправленный фрагмент" / "the corrected fragment" (no ✓).
- Generation prompt: the fix-block instruction tells the learner to press ✓ when the sentence is correct, otherwise to type the corrected fragment. The formatExample of a fix block always shows a sentence with an error and its corrected fragment, never a ✓ (task content must stay English, so "→ верно" is not possible). Sessions built earlier keep their text.
- The ✓ button in the fix input and the topic status "✓" on the Progress page stay.

## H2. Removed sentences stay hidden
- Items with status `defect` (removed by the quality check while the lesson was built) are never shown on the Today page, before or after grading. Scores do not count them, as before. The Progress log still counts defects per lesson.

## H3. Added questions
- When a graded session has rounds above 1, the page shows, under the header: the latest round's blocks with no block title (the one-line instruction and format example stay), then one toggle button "Показать предыдущие вопросы" / "Скрыть предыдущие вопросы" (`aria-expanded`), folded by default. Unfolded, it shows the results summary and all earlier blocks in their usual form and numbering.
- Item numbers in an added round continue the numbering of the task blocks before it (task with 6 items → the added items start at 7; a third round continues after the second).
- After the latest round is graded its results stay on top and the earlier part stays folded; focus goes to the top of the latest round.
- A session without added rounds looks as now.

## H4. Close button
- "Закрыть урок" moves from the header into the sticky bottom action bar, shown whenever today's session is graded with nothing left to answer.

## H5. Results toggle
- On a closed lesson the button reads "Показать результаты" while folded and "Скрыть результаты" while unfolded.

## H6. Session log as cards
- The Progress log becomes a list of cards, newest first. A card: date, lesson title, "Лёгкий день" tag when light; the total score "X из Y · Z%" over all blocks and rounds (counted items only; no score line when nothing was counted) with per-block scores in a small line; number of errors; cost; patterns as short lines; a "Подробнее" toggle (`aria-expanded`) with disputes, defects, models, calls (and failed), tokens.

## H7. Error bank with context
- "Было" and "Должно быть" show the changed words with up to 4 words of the sentence on each side ("…" where cut); the changed words are highlighted. The full sentence shows on hover (`title`). Computed by code from stored data, so earlier errors get it too.
- Cases:
  - gap: the blank filled with the learner's answer / with the right answer;
  - fix with an error, answered ✓: the original wrong fragment / the correction;
  - fix with an error, answered with a wrong fragment: the learner's fragment in place of the wrong fragment / the correction;
  - fix without an error, "fixed" by the learner: the learner's fragment alone / the original sentence (cut to the window around its middle when long);
  - spot: the wrong text in its paragraph / the correction in its place;
  - spelling: the learner's spelling / the word, with the hint as a muted line under the row.
- A cell is never ✓, a shorthand or empty. When the fragment cannot be placed (older items without a stored wrong fragment), the cell shows the plain answer or correction, and "Было" falls back to the original sentence when the answer was ✓.
- Wait tips use the same plain text.
