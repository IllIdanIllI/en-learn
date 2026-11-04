# Design: writing, rewrite and the set-up panel (2026-11-02)

S2's writing part: a writing task, a rewrite task, the errors-per-100-words metric and a Writing page. It also redesigns the lesson picker (`specs/2026-11-02-lesson-picker-design.md`, LP1 and LP4 UI) into a set-up panel opened from the Start button. Binding where it says something; otherwise the S1 spec, its rounds and the lesson-picker spec hold. Agreed with the learner in chat on 2026-11-02. Out of S2 here: vocabulary and preposition decks, exports, ⌘K.

## W1. Writing task (lesson block)
- **Block:** new kind `writing`, format `essay`. An IELTS Task 2 prompt (opinion or discussion), target 250 words. No timer.
- **Prompt:** produced by the lesson's generate call as the block's `instruction`. Where natural, the prompt invites this week's grammar topic (for example a conditionals prompt in the conditionals week); it never names the grammar topic.
- **Editor:** a full-width textarea in Reading style; below it a quiet footer with the live word count ("212 / 250 слов" / "212 / 250 words"). Spellcheck and autocorrect off, as everywhere.
- **Draft:** saved as the learner types, through the existing draft store, under the key `w:${blockId}` (next to `i:` and `p:`).
- **Choice:** `LessonChoice` gains `writing: boolean` and `rewrite: boolean` (W3). Ticked by default:
  - `writing` on a `writing` slot day;
  - `rewrite` on a `review_rewrite` slot day, when a graded text exists.
  These slots no longer fall back to error spotting (closes D16 for writing). On these days the task defaults follow the existing rule for non-learn days (spot), unchanged.
- **Light day:** never includes writing or rewrite.
- **Added round ("Добавить вопросы"):** offers Письмо (writing) too, as a single essay block. Rewrite is not offered there.

## W2. Checking a text
- **When:** on "Проверить" / "Check", with the rest of the lesson. A text under 50 words is not checked: the block shows "Слишком коротко для проверки" / "Too short to check" and counts as skipped.
- **Call:** the existing grade call gets a "Texts" section: the prompt and the learner's text, plus the list of programme topics (key and title). It returns per text a list of errors. An error is:
  - `fragment`: the exact wrong text (it occurs in the text);
  - `fix`: the corrected fragment;
  - `topicKey`: a programme topic key, if one fits; else null;
  - `suggestedTopic`: when `topicKey` is null, a short name of the grammar or usage area it belongs to (for example "prepositions of time", "word choice"); else null;
  - `ruleSection` (when `topicKey` is set) and a short `explanation` (native language, tone rules as in grade).
- **Storage:** each error becomes an `item` of the writing block: `prompt` = the sentence that holds the fragment, `expected` = the fix, `topic_id`/`rule_id` from `topicKey` (null when none), and an `answer` with `text` = fragment, verdict `wrong`, fix, rule section, explanation. The `suggestedTopic` goes into a new nullable column `answer.suggested_topic`.
- **Result:** these items go to the error bank and future review like any wrong item. Disputes and "Объяснить" / "Explain" work on them as on other items.
- **The text itself** is stored in a new table `writing_text` (W5) with its word count.
- **Score:** a writing block has no "N of M" score; it shows `N ошибок · X на 100 слов` / `N errors · X per 100 words` (W4).

## W3. Rewrite task
- **Block:** kind `writing`, format `rewrite`. Instruction: "Перепишите свой последний текст без ошибок" / "Rewrite your last text without the errors".
- **Source:** the learner's most recent graded writing text (essay or rewrite) before today. The card is disabled with "нет текста" / "no text" when there is none.
- **Editor:** prefilled with the source text; the source's errors are listed above the editor (`wrong → right`) for reference.
- **Checking:** as W2.
- **Result:** two columns, original | rewrite, each with its errors per 100 words above it in Label style. Below 900px width the columns stack.

## W4. Errors per 100 words
- `rate = counted errors / words × 100`, one decimal. Counted errors are the block's items whose effective verdict is `wrong` (a dispute that counts an error as correct or drops it removes it). Words are counted by splitting on whitespace.
- Recomputed whenever a dispute changes a verdict (like other derived values).
- **Progress page:** a line chart of the rate per checked text (x: date, y: rate), with a dashed target line at 3 (PRODUCT.md target). Shown once at least one text is checked; otherwise one sentence: "Здесь появится график после первого текста" / "The chart appears after your first text".

## W5. Data
- Migration `0005_writing.sql`:
  - `block.kind` CHECK gains `writing`; `block.format` CHECK gains `essay` and `rewrite` (SQLite: the `block` table is rebuilt, keeping its rows and ids);
  - `writing_text`: `block_id` (PK, references block, cascade), `text`, `words`, `source_block_id` (nullable, the rewrite's source), `created_at`;
  - `answer.suggested_topic TEXT` (nullable).
- `session.choice` JSON: older stored choices have no `writing`/`rewrite`; reading them treats both as false.

## W6. Writing page
- Sidebar item "Письмо" / "Writing" (lucide `pen-line`), after Error bank.
- A table of checked texts, newest first: date, prompt (one line, cut), kind (Эссе / Переписывание; Essay / Rewrite), words, rate.
- A row expands in place to show that text's checked result: the text with its errors underlined and the error list, as in W2 (read-only; disputes stay on Today). There is no separate past-lesson route.
- Empty state: "Здесь будут ваши тексты" / "Your texts will appear here".

## W7. Error bank: errors without a topic
- Errors with no topic are grouped under "Другое" / "Other". Each shows its `suggested_topic` as a muted label ("возможная тема: prepositions of time" / "possible topic: prepositions of time").
- Within "Other", errors with the same suggested topic sit together, so recurring areas are visible as material for new rules. Creating a rule from them is not part of this spec.

## W8. Set-up panel (replaces the picker UI)
- **Start button:** a split button: "Начать сессию" and a gear segment (lucide `settings`, 1.5 stroke), both in the primary colour, separated by a thin divider. The main part starts the lesson with the current choice (the day's defaults until changed). The gear toggles the set-up panel under the button; while open, the gear segment shows a pressed state (`aria-expanded`). Pressing the main part closes the panel. Rest day (learner, 2026-11-04): the same controls as a normal day ("Начать сессию", gear, "Лёгкий день" toggle off); the rest-day defaults (review, spelling) stay.
- "Лёгкий день" stays a separate toggle button next to it, behaviour unchanged.
- **Panel:** cards instead of checkboxes, in three groups:
  - Повторение / Review: Повторение (only when review is available);
  - Задания / Tasks: Вставить пропуск, Исправить предложение, Найти ошибки;
  - Ещё / More: Правописание, Говорение, Письмо, Переписать.
- **Card:** title, a fixed one-line example in Reading style and a muted one-line description (texts as in the approved mockup). A selected card has the primary border, a tinted background and a ✓ badge. An unavailable card is dimmed and shows its reason instead of the example. Cards are buttons with `aria-pressed`, keyboard focusable; pointer cursor, `not-allowed` when unavailable.
- **"Добавить вопросы":** the same cards for Вставить пропуск, Исправить предложение, Найти ошибки, Письмо, then "Добавить".
- Defaults, reasons, the disabled start when nothing is selected, and the generation behaviour stay as in the lesson-picker spec.
- **Pointer cursor:** every interactive element shows the pointer (cards, gear segment, native checkboxes elsewhere); disabled ones show `not-allowed`.

## W9. Testing
- **Unit:** grade input with a Texts section; storing errors as items with topic or suggested topic; too-short text skipped; rate computation and recomputation after a dispute; rewrite source selection and the "no text" reason; default choice on writing and review_rewrite days; old choice JSON without the new keys; migration 0005 keeps existing blocks.
- **E2E (preview):** the gear opens the panel, toggling cards changes the lesson; writing block: type, word count, check, underlined errors and rate; rewrite: prefilled and two columns; Writing page lists the text; Progress shows the chart; error bank shows "Other" with a possible topic; pointer cursor on cards and the gear segment.
- The preview LLM returns a writing prompt and a fixed list of errors (one with a topic, one without).

## Out of scope
Timer, IELTS Task 1, creating rules from "Other" errors, vocabulary/preposition decks, exports, ⌘K, writing on light days.
