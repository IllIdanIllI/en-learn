# Design: writing evaluation, strong parts, error types (2026-11-15)

Agreed with the learner in chat on 2026-11-15. Binding where it says something; otherwise the writing specs hold.

## Why
A checked text shows only its errors. The learner cannot tell how good the text is, what is strong in it, or whether the errors are mostly spelling or something else.

## Choices (picked in chat)
- Evaluation: an approximate IELTS band, overall plus the four criteria with one line each.
- Strong parts: highlighted in the text beside the errors, plus a short list.
- A count of errors by type above the review.
- Only texts checked from now on; texts checked earlier show what they show today.
- A chat about the text is a separate, later round (its messages will be saved with the text). Not built here.

## T1. What the AI returns (`grade`, the `texts` entries)
Each entry of `texts` gains, next to `errors`:
- `errors[].kind`: one of `spelling`, `grammar`, `vocabulary`, `punctuation`. Spelling: a misspelt word. Vocabulary: a wrong word or collocation. Punctuation: commas, apostrophes, capital letters, end marks. Grammar: everything else.
- `strengths`: 0 to 5 entries `{ fragment, note }`. `fragment` is copied character for character from the text, 2 to 15 words, and overlaps no error fragment. `note` says in the native language, in one short factual sentence, why it is good (a precise word, a natural collocation, a correct complex structure, a clear link). No strength is invented: a text with nothing notable gets an empty array.
- `assessment`: `{ taskResponse, coherence, vocabulary, grammar }`, each `{ band, note }`. `band` is 1 to 9 in steps of 0.5 by the public IELTS Writing Task 2 band descriptors; `note` is one short factual sentence in the native language naming what decides the band. For a `rewrite` text every band is 0 and every note is "" (a rewrite is not assessed).
- The prompt (`prompts/grade.md`, section Texts) and `prompts/grade.schema.json` describe these fields. The notes follow the tone rules and go through the tone check.

Reply checks (`textProblems`), each a rejection like the existing ones:
- a strength fragment that is empty or not in the text, a strength without a note, a strength that overlaps an error fragment (same occurrence search as the marking), more than 5 strengths;
- an essay band that is not one of 1, 1.5, … 9, or a criterion without a note; a rewrite band other than 0.

## T2. Storage (migration 0009)
- `answer.error_kind TEXT` (null for answers that are not writing errors and for old ones).
- `writing_text.assessment TEXT`: JSON `{ taskResponse, coherence, vocabulary, grammar }` as returned; null for a rewrite, a text too short to check, and old texts.
- `writing_text.strengths TEXT`: JSON array `{ fragment, note }[]`; null for a text too short to check and old texts.

## T3. Overall band
Computed in the app, not asked from the AI: the mean of the four bands rounded to the nearest half band, a quarter rounding up (6.25 → 6.5, 6.75 → 7.0), as IELTS does.

## T4. What the learner sees
On a checked text, in Today and on the Writing page (same component):
1. **Evaluation**, above the text, only when the text has an assessment: a line "Примерная оценка IELTS: 6.0" / "Approximate IELTS band: 6.0", then four rows: criterion name, band, note. Names: "Ответ на задание" / "Task response", "Связность" / "Coherence and cohesion", "Лексика" / "Vocabulary", "Грамматика" / "Grammar". Under them one muted line: "Оценка приблизительная: её ставит ИИ, а не экзаменатор." / "The band is approximate: an AI gives it, not an examiner."
2. **Error types**, on the rate line's place, only when at least one error has a kind: the existing rate line, then "Орфография 8 · Грамматика 12 · Лексика 4 · Пунктуация 2" / "Spelling 8 · Grammar 12 · Vocabulary 4 · Punctuation 2". Only kinds with a count above zero, in that order; errors counted are the ones with effective verdict wrong (a dropped dispute leaves the count).
3. **The text**: errors underlined as today; strong parts with a green dotted underline (`decoration-success`, `data-strength`). Where a strength would overlap an error, the error wins and the strength is not marked.
4. **Each error in the list** shows its type as a small label (the same four names), when it has one.
5. **Strong parts**, after the error list, only when there are any: heading "Сильные места" / "Strong parts", then per entry the fragment in quotes and its note.
- In a rewrite's two columns the source text ("before") also shows its own strong parts in the text; lists and evaluation are shown for the block's own text only.
- Nothing here is interactive, so there are no new cursor cases.

## Tests
- Vitest: reply checks (each rejection above, and a valid reply); the overall band rounding (quarters, halves); apply stores kind, assessment and strengths, and a rewrite or short text stores nulls; the view and `loadWritingTexts` return them; old rows (nulls) load; marking with two kinds of fragments (overlap: error wins); the grade input and schema carry the new fields; tone check covers the new notes.
- E2E (preview, canned grade reply with kinds, two strengths and an assessment): a checked essay shows the evaluation, the type counts, a green-marked strength, the type label on an error and the strong parts list, in Today and on the Writing page; a text without assessment (seeded old row) shows none of them.
