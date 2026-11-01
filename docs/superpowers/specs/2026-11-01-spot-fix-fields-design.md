# Design: "Find the errors" with fix fields (2026-11-01)

Redesign of the error-spotting block (format `spot`), deferred from the Night grove spec (`specs/2026-10-31-design-night-grove.md`, Out of scope) and the open item in `s1-decisions.md` ("Find the errors in the text" block looks bad). Binding where it says something; otherwise the S1 spec and its feedback rounds hold. Agreed with the learner in chat on 2026-11-01.

Goal: the learner marks errors by selecting them in the text instead of typing `wrong → right` lines, and the LLM is called only for what code cannot decide.

## SF1. Storage stays as it is
- The fields are a new input for the existing answer: each paragraph's answer is still the `wrong → right` lines string under the key `${blockId}:${paragraph}` (drafts, `spot_answer`, grading input, session log).
- No database migration. Old sessions render and grade as before.
- A selection is kept as text, not as a position. Matching compares text (as `autoSpot` / `matchingLine` do now); every key fragment occurs exactly once in its paragraph (TD-8), so a repeated word in a learner selection is harmless.

## SF2. Lesson UI (before "Check")
- **Selecting.** Selecting text inside one paragraph shows a small flyout button "Исправить" / "Fix" above the selection. The selection snaps to whole words. No flyout for an empty or whitespace-only selection, or one that spans two paragraphs. A selection made with the keyboard (Shift+arrows) shows the flyout too; the flyout is a real button, reachable by keyboard.
- **Adding a fix.** Pressing "Fix" adds a field under the paragraph, prefilled with the fragment, and focuses it. The selection highlight disappears; the paragraph keeps no marks. If a field for the same fragment already exists, that field is focused instead of adding a duplicate.
- **Fields.** Each field shows the original fragment in small muted text above the input ("было: went" / "was: went") and has a ✕ button that removes it. Fields are ordered by the fragment's position in the paragraph (first occurrence).
- **No hints.** The flyout appears for any selection; nothing shows whether a fragment is a hidden error. No count of errors before "Check".
- **Drafts.** Every change serialises the fields to lines (`<original> → <field text>`, one per field, in field order) and saves them as the draft does now. Loading a draft parses the lines back into fields (`parseSpotLines`). A legacy line without an arrow becomes a field with an empty fix.
- The textarea and its placeholder (`input.spot`) are removed from the spot block.
- **Instruction.** The generated `instruction` and `formatExample` of a spot block describe typing `wrong → right`. For spot blocks the app shows its own fixed hint instead of both: "Выделите ошибку в тексте и нажмите «Исправить»." / "Select an error in the text and press "Fix"." This also covers old sessions; the generate prompt is not changed.

## SF3. Grading after "Check"
1. **Ignored lines.** A line whose fix is empty, or equal to its original after `normalizeAnswer`, is dropped before grading and is not stored ("spotted, no fix" is not tracked).
2. **Empty paragraph.** A paragraph with no lines left is "skipped" as now: its hidden errors are stored as skipped and not counted.
3. **Per-line check in code.** `autoSpot` changes from all-or-nothing to per line. A line that pairs with exactly one hidden error (same containment test as now), that error not already found, and whose fix passes `autoCorrect` → that error is **found**. Every other line is **leftover**: right fragment with a different fix, a fragment that is not in the key, or a fragment that pairs with several errors.
4. **Missed errors.** A hidden error no line found is stored as "wrong" with the key's fix and rule section and no explanation. `applyGraded` already does this for spot errors absent from `found`; no change needed there.
5. **LLM call.** Only paragraphs with leftover lines go to the grade call. Each sends the paragraph text, the hidden errors not yet found (with their refs), and only the leftover lines. If no paragraph has leftover lines (and no gap/fix item needs the LLM), there is no grade call.
6. **LLM reply** (schema unchanged). Per sent paragraph one `spot` entry: `found` = refs of not-yet-found errors that a leftover line fixes correctly (possibly a different correct fix than the key); `extra` = leftover lines that are not hidden errors, with an explanation. In `items`, an entry only for a hidden error that a leftover line targeted with a wrong fix (verdict "wrong", fix, ruleSection, explanation). The grader no longer writes entries for errors no line targets.
7. **Merge.** Local and LLM results are merged as now (`found` refs are unioned per paragraph). `missingRefs` already requires only a `spot` entry for every paragraph sent (it never required item entries for spot errors); no change.

Changes: `autoSpot` (`src/core/grading/autocheck.ts`), the spot step in `src/core/grading/grade.ts`, what is passed to `renderGradeInput` (its format is unchanged), the "Error-spotting paragraphs" section of `prompts/grade.md`.

## SF4. "Explain" for a missed error
- **Where.** After "Check", under each spot error with verdict "wrong" and no explanation (a missed error). Not for found errors, errors the grader already explained, skipped paragraphs, or other formats.
- **Call.** One new LLM call kind `explain` for that single error: the paragraph text, the wrong fragment, the key's fix, the topic key, the rule section name and the full rule body (as disputes send it). Reply schema: `{ "explanation": string }`, 2 to 4 sentences in the native language, English examples stay English. The prompt uses the grade prompt's tone rules, and the reply passes `toneViolations` (retried as other calls are).
- **While waiting.** The button shows a loading state; other actions stay usable.
- **Storage.** The reply is saved to `answer.explanation` of that item. The button then disappears and the explanation shows like a grader explanation; it survives a restart. No migration.
- **Errors.** A failed call shows the usual error text with "Повторить" / "Retry", as disputes do.
- New: `prompts/explain.md`, `prompts/explain.schema.json`, `'explain'` in `LlmKind` and `bundledPrompts`, one function next to `disputeItems` in `src/core/grading/actions.ts`, the button in `GradedItem`, a preview LLM reply in `src/adapters/preview/previewLlm.ts`. The call is logged in `llm_call` like the others.

## SF5. Results view (after "Check")
- Per paragraph: the text, then "Найдено 4 из 6" / "Found 4 of 6" (found out of the paragraph's counted hidden errors). A skipped paragraph shows no count.
- The learner's fixes are listed as now ("Ваши строки"), without ignored lines.
- Each hidden error keeps its current row (found / not found, `wrong → right`, rule link), plus "Explain" per SF4. Extras and disputes stay as they are.

## SF6. Testing
- Unit (Vitest): per-line `autoSpot`; fields ↔ lines (serialise, parse, legacy line without arrow); ignored lines; no grade call when every line is decided in code; only leftover lines and not-found errors reach the grade input; missed errors stored as "wrong" with the key fix; `missingRefs` for spot; the explain call (input, storage, failure).
- E2E (Playwright preview): select → flyout → field → edit → ✕; whole-word snapping; duplicate selection focuses the existing field; draft survives reload; "Check" → "Found N of M" → "Explain" shows an explanation.
- The grade prompt change is not evaluated against a real model in this work; the learner judges it in use.

## SF7. Docs
- `s1-decisions.md`: close the spot item. `handoff.md`: note the new block and the `explain` call.

## Known limitations
- A learner override at `<app data>/prompts/grade.md` (the prompt store prefers it per file) keeps the old error-spotting instructions; it must be updated by hand.
- A fragment that also occurs elsewhere in the paragraph is matched by text, not by the occurrence the learner selected.

## Out of scope
- Inline editing inside the paragraph; lasting highlights of fixed fragments; showing the error count before "Check"; tracking "spotted, no fix"; changes to generation, validation (TD-7, TD-8) or other block formats.
