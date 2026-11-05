# Design: words feedback round 2 (2026-11-05)

Agreed with the learner in chat on 2026-11-05 after trying round 1. Binding where it says something; otherwise `2026-11-05-words-feedback-1.md` (F1–F6) and `2026-11-04-words-design.md` hold. G1 replaces F1 ("Started").

## G1. Words header
- **Buttons:** "Начать практику" / "Start practice" and "+10 новых слов" / "+10 new words" sit together in one row with the normal button gap (the +10 rule of F3 is unchanged).
- **One summary line** under the buttons: "В процессе: 10 · Выучено: 0 · Всего: 21" / "In progress: 10 · Learned: 0 · Total: 21".
  - **In progress** = words with at least one counted review that are not Learned (`state.reviewed && stage < 4`).
  - **Learned** = stage 4. **Total** = all words (incl. pending or failed generation).
- **Bar** next to the line: the width is Total; learned words in the success colour, in-progress words in the primary colour, the rest empty. It has an accessible label repeating the line; it is not interactive.
- **"Подробнее ▾" / "Details ▾"** (a button, `aria-expanded`) opens a small panel; the button then reads "Скрыть ▴" / "Hide ▴". The panel lists: "К повторению сегодня" / "Due today", then the stage counts "Новое" / "New", "Вспоминание" / "Recall", "Употребление" / "Use" (as now; stage 1 includes words not started yet).
- **Collapsed by default.** The open/closed state is remembered in the settings table as `wordsStatsOpen` (boolean, default false).
- The old stage list, "К повторению сегодня: N" line and "Начато: X из Y" are removed from the header. `WordsOverview` replaces `started` with `inProgress`, `learned`, `total`.

## G2. Sticky back arrow (word page)
- The top-left ← on `/words/:id` stays visible while the page scrolls (sticky at the top of the scroll area, with the page background behind it so content scrolls under it). The bottom row is unchanged.

## G3. Definition and Example as text areas
- In the word fields form (the word page and the "Add word" form), Definition and Example are multi-line text areas (3 rows, the user can resize vertically). Other fields stay single-line.

## G4. Field titles are not pointer
- Field titles (`<label for=…>` of text inputs, text areas, selects) no longer show the pointer cursor anywhere in the app: `label[for]` is removed from the global pointer rule in `src/ui/styles/globals.css` and from the `INTERACTIVE` list in `tests/e2e/cursor.spec.ts`. Clicking a title still focuses its field. (The app has no checkbox or radio inputs.)
- CLAUDE.md's pointer rule gets one clause: field titles are not treated as interactive.

## G5. "Open in dictionary" in the Link title
- The Link field title reads "Ссылка (открыть в словаре)" / "Link (open in dictionary)", where the part in brackets is the dictionary link (same target as now: `wordLink(word, link)`, opened through the opener; built from the current field values).
- In the "Add word" form the bracket part is shown only when the Word field is not empty.
- The separate "Открыть в словаре" / "Open in dictionary" link under the form is removed.

## G6. Testing
- Vitest: `wordsOverview` `inProgress` / `learned` / `total` (a Learned word is not in progress; a failed-generation reviewed word counts in progress; total includes all).
- E2E (words.spec): the summary line values in `words` and `words-limit`; Details opens and closes the panel with Due today and the stage counts; the +10 button is in the same row as Start practice; the word page ← stays in view after scrolling to the bottom; Definition and Example are `textarea`s; the Link title contains the dictionary link and the old link is gone.
- cursor.spec: field titles are no longer checked; the Details button and the dictionary link are pointer; a computed-style check that a field title (`label[for]`) has the default cursor.
