# S1 feedback round (2026-10-27)

Changes the learner asked for after the S1 build. The S1 spec (`2026-10-22-s1-core-loop-design.md`) stays binding where this file says nothing.

## F1. Data folder
- Settings → "Data folder": shows the current folder, "Change…" opens a folder picker (Tauri dialog plugin).
- The chosen path is kept in `<appDataDir>/location.json` as `{ "dataDir": "<abs path>" }`. No file = default folder (the app data dir; the DB keeps its current location there).
- The folder holds `enlearn.db` (+ `-wal`/`-shm` if present), `prompts/` (overrides) and, from S2, exports.
- Change = move: refuse if the target already has `enlearn.db` or is the current folder or lies inside it. Otherwise close the DB, copy the DB files and `prompts/`, check every copy exists with the same size, write `location.json`, delete the old files, reload the app. Any failure before `location.json` is written leaves the old folder in use and removes partial copies.
- `tauri-plugin-persisted-scope` keeps the picked folder readable after a restart. Preview (browser) mode shows the row read-only.

## F2. Code check before the LLM
- Normalise: lower case, trim, collapse spaces, `’` → `'`, strip leading/trailing `.,!?;:"`.
- `+` is always a shorthand for ✓ (built in, like ✓).
- Gap and fix items: the generator now also returns `wrong` (fix items with a correction: the wrong fragment verbatim, occurring once in the prompt; otherwise ""). Stored in `item.wrong`.
  - original = prompt; corrected = prompt with `___` (gap) or `wrong` (fix) replaced by `expected`. No corrected sentence when `wrong` is missing or not found exactly once.
  - Expected ✓: answer ✓ → correct.
  - 1-word answer: correct iff it equals `expected`.
  - 2+ words: correct iff it equals `expected`, or its words are a contiguous run in corrected and not in original.
  - Anything else goes to the LLM. The code never decides "wrong".
- Spelling: unchanged (already code).
- Spot paragraph: code-graded iff every learner line pairs with a hidden error (same pairing as `matchingLine`) and its right side passes the rule above (original/corrected = paragraph text before/after replacing that error's wrong fragment). Paired errors are found, the others not found. Otherwise the whole paragraph goes to the LLM.
- No LLM call when everything is code-graded; patterns and "tomorrow" are then empty.

## F3. Highlighting
- Graded wrong item: card with tinted destructive background and a 3px left border; the learner's text struck through; the fix in semibold success colour. Correct items: no card, success tick chip. Not-counted items: muted, as now. Same for spot errors.

## F4. Pointer cursor
- `button`, `[role=button]`, `a`, `summary`, `label[for]`, `select`: `cursor: pointer`; disabled: `cursor: not-allowed`.

## F5. Disputes in one call
- Dispute texts are kept per item while the page is open. A sticky bar at the bottom of the page shows "Send disputes (N)" when N ≥ 1 typed and unsent. It sends all N in one `dispute` call. The per-item send stays (a batch of one).
- The `dispute` schema becomes `{ "replies": [ { "ref", "position", "ruleSection", "sources", "recommendation" } ] }`; every sent ref must come back (check, then retry once).

## F6. Finish, close, add more
- Before grading, the sticky bar holds "Check answers" and "Finish lesson". Finish = grade with every blank item skipped without asking; other questions (unknown symbols, LLM clarifications) are still asked.
- Skipped items of the last graded session go into the next session's review input (prompt and expected answer, marked skipped).
- A graded session of today shows a "Close lesson" button. Today with a closed lesson (and on every later visit that day) shows a card: "Lesson finished" · "Show results" · "Add more questions".
- "Add more questions" generates one extra task block of 6–8 gap or fix items (the task format of today if gap/fix, else fix) on today's task topic and the topics of today's counted mistakes (if none: the allowed topics of today), not repeating today's prompts. Same generate → validate → code check flow. Blocks get `round` = last round + 1.
- A block is open while one of its active items has no answer row. The session keeps status `graded`; grading accepts a graded session that has open blocks and grades only the open items. Feedback patterns and "tomorrow" lines of a later round are appended to the stored ones.
- Answer keys are shown per block only once that block is graded (FR-10 holds per block).

## F7. Loader
- Generation shows stages "Writing tasks" → "Checking tasks" → "Saving" (a second attempt restarts at "Writing tasks", marked "attempt 2"). Grading shows one stage "Checking answers".
- Estimate = sum, over the call kinds of the job, of the median `duration_ms` of the last 5 successful calls of that kind. No history: no bar, only elapsed time. Bar = elapsed / estimate, capped at 95 %; past the estimate it says "Taking longer than usual".
- While waiting, a card rotates every 6 s through up to 10 random error-bank entries ("was → should be") and spelling words with mnemonics. None: no card.
