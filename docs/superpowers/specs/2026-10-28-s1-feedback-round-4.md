# S1 feedback round 4 (2026-10-28)

Binding where it says something; otherwise the S1 spec and rounds 1–3 hold.

## K1. Loader heading
- The tip card heading reads "Пока вы ждёте" / "While you are waiting".

## K2. Word-level change with "__"
- In the error-bank context (round 3, H7) the highlighted part is only the words that differ between "Было" and "Должно быть": words shared at the start and end of the two fragments move into the muted context.
- When one side's differing part is empty (an extra word written, or a needed word missed), that side shows "__" as its highlighted part. Example: "the films" → "films" shows Было "**the** films", Должно быть "**__** films".
- A cell is still never ✓, a shorthand or empty.

## K3. Tips with highlights
- Error-bank wait tips render like the error bank: context muted, changed part red (Было) / green (Должно быть), with the same component. Spelling tips (word → mnemonic) stay plain text.

## K4. Solving skipped questions
- Skipped = an active gap, fix or spelling item of a graded session whose answer verdict is `skipped` (left blank at "Finish"). Spot paragraphs and speaking blocks are not included.
- When today's or yesterday's (calendar day before) graded session has skipped items, the Today page shows a button "Решить пропущенные ({n})" / "Solve skipped ({n})": above today's lesson, or on the start screen when today's lesson is not built yet; also when today's lesson is closed. With skips on both days, the button takes yesterday's first.
- Click: the skipped answers of that session are cleared (the items become unanswered) and the page shows only those items as inputs, with their original numbers, under the session title; every other item and block is hidden. "Проверить ответы" grades only them (the open-round grading already grades unanswered items only); "Завершить урок" skips blanks again.
- Late answers count like normal ones: block scores, topic progress, error bank; an answered item no longer comes back as review input.
- After grading, the page returns to its usual view of today.

## K5. Session log card
- Title bold, date muted. Results as a list, one line per block ("Орфография — **2 из 4**"), with the bold total "**9 из 12 · 75%**". "Ошибок: **3**". Patterns as a bulleted list.
- "Подробнее" opens a two-column table: Споры, Дефекты, Модель, Вызовы (failed in brackets), and tokens as four rows (input, cache read, cache write, output).
