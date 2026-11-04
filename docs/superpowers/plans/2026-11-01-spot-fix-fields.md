# "Find the errors" with fix fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The learner marks errors by selecting text and editing it in a field; code grades every line it can, the LLM sees only leftover lines, and a missed error can be explained on demand.

**Architecture:** Fields are a UI over the existing `wrong → right` lines string (no storage change). `autoSpot` becomes per line; `grade.ts` sends only leftover lines and not-yet-found errors. A new LLM kind `explain` fills `answer.explanation` for one missed error.

**Tech Stack:** React 19, Tailwind 4, Vitest, Playwright (preview mode `/?state=<fixture>#/route`), Yarn 4.

**Spec:** `docs/superpowers/specs/2026-11-01-spot-fix-fields-design.md`

## Global Constraints
- No database migration; the answer stays the lines string under `${blockId}:${paragraph}` (SF1).
- Copy (ru / en): flyout "Исправить" / "Fix"; field label "было: {text}" / "was: {text}"; hint "Выделите ошибку в тексте и нажмите «Исправить»." / "Select an error in the text and press "Fix"."; count "Найдено {found} из {total}" / "Found {found} of {total}"; button "Объяснить" / "Explain", busy "Объясняю…" / "Explaining…".
- No hint before "Check" whether a fragment is a hidden error, and no error count (SF2).
- Explanation: 2 to 4 sentences, native language, English examples stay English, passes `toneViolations` (SF4).
- Grade schema unchanged; generate prompt unchanged.
- If yarn cannot download itself, prefix commands with `COREPACK_NPM_REGISTRY=https://registry.npmjs.org NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01HffEzRYnBmhZeBJTJZ7L3o`.

## Review Focus
1. Clicking the flyout must not clear the selection before the click lands (mousedown clears selections) → the field is added. Test in Task 5 (real mouse click in e2e).
2. A selection with edge spaces or punctuation (`" home."`) → the field holds `home`. Test in Task 4.
3. A second line that pairs only with an error already found by code → dropped, not sent to the LLM (it would be called "not an error"). Test in Task 1.
4. A paragraph whose fields are all unchanged or empty → skipped, no LLM call. Test in Task 2.
5. Pressing "Explain" twice quickly → one call (button disabled while busy). Test in Task 6.

## File map
- `src/core/grading/autocheck.ts`: `dropIgnoredLines`, per-line `autoSpot`.
- `src/core/grading/grade.ts`: spot step. `prompts/grade.md`: error-spotting text.
- `src/core/grading/actions.ts`: `explainItem`. `prompts/explain.md`, `prompts/explain.schema.json`, `src/core/llm/types.ts`, `src/core/domain.ts`, `src/core/llm/bundledPrompts.ts`, `src/core/db/repos/settings.ts`, `src/ui/pages/Settings.tsx`, `src/adapters/preview/previewLlm.ts`, `tests/fixtures/llm/explain.{valid,invalid}.json`.
- `src/ui/today/spotFields.ts` (new, pure): fields ↔ lines, add, snap.
- `src/ui/today/SpotBlock.tsx`, `src/ui/today/Block.tsx`: lesson UI and hint.
- `src/ui/today/SpotBlock.tsx` (graded part), `src/ui/today/ItemActions.tsx`: count and Explain.
- `src/core/i18n/en.ts`, `ru.ts`: new keys. `tests/e2e/spot.spec.ts` (new).

---

### Task 1: Per-line `autoSpot` and ignored lines

**Files:**
- Modify: `src/core/grading/autocheck.ts`
- Test: `tests/core/grading/autocheck.test.ts`

**Interfaces:**
- Produces: `dropIgnoredLines(text: string): string`; `autoSpot(paragraphText: string, errors: { id: number; prompt: string; expected: string }[], learnerText: string): { found: number[]; leftover: string[] }`.

- [ ] **Step 1: Write the failing tests** (replace the four existing `autoSpot` tests; same `text`/`errors` fixture)

```ts
test('one paired line', () => expect(autoSpot(text, errors, 'has went → has gone')).toEqual({ found: [1], leftover: [] }));
test('two paired lines', () => expect(autoSpot(text, errors, 'has went → has gone\ninformations -> information')).toEqual({ found: [1, 2], leftover: [] }));
test('unpaired line is leftover, paired line still found', () =>
  expect(autoSpot(text, errors, 'has went → has gone\nthe cat → a cat')).toEqual({ found: [1], leftover: ['the cat → a cat'] }));
test('wrong correction is leftover', () => expect(autoSpot(text, errors, 'has went → had went')).toEqual({ found: [], leftover: ['has went → had went'] }));
test('wider selection with a right fix is found', () => expect(autoSpot(text, errors, 'He has went → He has gone')).toEqual({ found: [1], leftover: [] }));
test('a second line for an error already found is dropped', () =>
  expect(autoSpot(text, errors, 'has went → has gone\nwent → gone')).toEqual({ found: [1], leftover: [] }));

describe('dropIgnoredLines', () => {
  test('drops empty and unchanged fixes, keeps real ones', () =>
    expect(dropIgnoredLines('a hour → an hour\na old → \nA Idea → a idea\nno arrow\n')).toBe('a hour → an hour'));
  test('only ignored lines give an empty string', () => expect(dropIgnoredLines('went → went')).toBe(''));
});
```

- [ ] **Step 2: Run** `yarn vitest run tests/core/grading/autocheck.test.ts` → FAIL (`leftover` missing, `dropIgnoredLines` not exported).

- [ ] **Step 3: Implement in `autocheck.ts`**
  - `dropIgnoredLines`: keep a line only if `parseSpotLines` gives a non-empty `right` and `normalizeAnswer(right) !== normalizeAnswer(wrong)`; return the kept trimmed lines joined by `\n`.
  - `autoSpot`, per line: empty `wrong` or `right` → leftover. Pair with the containment test used now. Exactly one paired error that is already found → drop the line. Exactly one paired, not yet found error and `autoCorrect(...)` true → found. Otherwise → leftover (the trimmed raw line). Update the doc comment.

- [ ] **Step 4: Run** the same command → PASS.

- [ ] **Step 5: Commit** `feat(spot): per-line autoSpot and ignored lines`

---

### Task 2: Grade step sends only leftovers; grade prompt

**Files:**
- Modify: `src/core/grading/grade.ts` (spot step, around lines 138–165), `prompts/grade.md` (input paragraph line 5, section "# Error-spotting paragraphs")
- Test: `tests/core/grading/grade.test.ts`

**Interfaces:**
- Consumes: `dropIgnoredLines`, `autoSpot` from Task 1.
- `renderGradeInput` and its headers ("Learner lines (wrong → right):", "Hidden errors:") stay unchanged, so `previewLlm` keeps parsing them. `missingRefs` needs no change: it already asks only for a `spot` entry per sent paragraph.

- [ ] **Step 1: Write the failing tests**
  - `'a paragraph with only unchanged or empty fixes is skipped without an LLM call'`: `subm({ items: { 4: 'an' }, spot: 'a apple → a apple\na hour → ' })` with `finish: true`; assert no `grade` call for spots (as the existing blank-paragraph test does) and the paragraph's errors are stored `skipped`.
  - `'only leftover lines and not-yet-found errors reach the LLM'`: `spot: 'a apple → an apple\na hour → an hour\nthe cat → a cat'`. Assert the prompt contains `the cat → a cat` and `b2.p0.e2`, and does not contain `a apple → an apple`, `b2.p0.e0` or `b2.p0.e1`. Errors e0 and e1 end `correct`.
  - `'missed errors are stored wrong with the key fix and no explanation'`: after the previous grading, an unfound error has verdict `wrong`, `fix` = its expected, `explanation` null or ''.
  - `'ignored lines are not stored'`: `spot: 'a apple → an apple\na hour → a hour'`. The stored `spot_answer.text` equals `a apple → an apple`.
  - Update `'grade message carries labelled items, rule body of the stored version, spot lines and settings'`: replace `expect(p).toContain('a hour → an hour')` with `expect(p).toContain('the cat → a cat')` and `expect(p).not.toContain('a hour → an hour')`; `b2.p0.e1` → `b2.p0.e2`. This is a behaviour change per SF3.5.

- [ ] **Step 2: Run** `yarn vitest run tests/core/grading/grade.test.ts` → the new tests FAIL.

- [ ] **Step 3: Implement in `grade.ts`**
  - Build `spotTexts` = `sub.spot` with `dropIgnoredLines` applied to every value. Use it wherever `sub.spot` feeds `spotParagraphs` (the skip loop and `allSpots`).
  - For each non-empty paragraph: `const { found, leftover } = autoSpot(...)`; push `{ blockRef, paragraph, found: found refs, extra: [] }` into `result.spot` when `found.length > 0`. When `leftover.length > 0`, add `{ ...s, learnerText: leftover.join('\n'), errors: s.errors.filter((e) => !found.includes(e.id)) }` to `llmSpots`.
  - `graded.spot` keeps the full (ignored-dropped) text per paragraph, as now.

- [ ] **Step 4: Edit `prompts/grade.md`** (exact copy)
  - In the input paragraph, replace from "For error-spotting paragraphs it contains" to "as \"wrong → right\"." with: `For error-spotting paragraphs it contains the paragraph text, the hidden errors the application has not already marked as found (each with its own reference of the form "b<blockIndex>.p<paragraphIndex>.e<errorIndex>", the wrong fragment, the expected correction, topic key and rule section) and only those learner lines the application could not match to the key, one correction per line as "wrong → right". Lines that match the key are already graded and are not sent.`
  - Replace the body of "# Error-spotting paragraphs" with: `For each paragraph produce one entry in "spot": blockRef (for example "b2"), paragraph (0-based index), found (the refs of listed hidden errors that a learner line fixes correctly: the line names the wrong fragment, or a span that contains it, and gives a correct fix, possibly a different correct fix than the key), and extra (a learner line that is not one of the listed hidden errors: put the line in "text" and explain, in {{nativeLanguage}}, why it is not an error under the rulebook or why the change is not needed). Add an entry to "items" only for a listed hidden error that a learner line targets with a wrong fix: verdict "wrong", with fix, ruleSection and explanation. Do not add entries for hidden errors that no learner line targets; the application reports them itself. Do not report extras as errors and do not lower anything because of them.`

- [ ] **Step 5: Run** `yarn vitest run tests/core/grading tests/prompts` → PASS.

- [ ] **Step 6: Commit** `feat(spot): grade only leftover spot lines`

---

### Task 3: `explain` LLM call (core)

**Files:**
- Create: `prompts/explain.md`, `prompts/explain.schema.json`, `tests/fixtures/llm/explain.valid.json`, `tests/fixtures/llm/explain.invalid.json`
- Modify: `src/core/domain.ts:13`, `src/core/llm/types.ts`, `src/core/llm/bundledPrompts.ts`, `src/core/db/repos/settings.ts`, `src/ui/pages/Settings.tsx:19`, `src/core/i18n/en.ts`, `src/core/i18n/ru.ts`, `src/core/grading/actions.ts`, `src/adapters/preview/previewLlm.ts`, `tests/prompts/schemas.test.ts`
- Test: `tests/core/grading/actions.test.ts`

**Interfaces:**
- Produces: `LlmKind` gains `'explain'`; `export interface ExplainReply { explanation: string }`; `explainItem(deps: Deps, itemId: number): Promise<LlmResult<ExplainReply>>` in `actions.ts`, which saves `answer.explanation` on success.

- [ ] **Step 1: Write the failing tests**
  - `schemas.test.ts`: add `'explain'` to `kinds` and to the native-language placeholder list; add `fixture('explain', 'valid') as ExplainReply` to `typedFixtures`. Fixtures: valid `{ "explanation": "Перед гласным звуком нужен артикль an." }`; invalid `{ "explanation": 3 }`.
  - `actions.test.ts`, following the file's existing setup:
    - `'explainItem sends the paragraph, fragment, fix, rule and saves the explanation'`: a graded session where a spot error has verdict `wrong` and no explanation. The fake LLM returns `{ explanation: 'Перед гласным звуком нужен an.' }`. Assert the user prompt contains `Paragraph text: `, `Wrong fragment: "<prompt>"`, `Expected correction: "<expected>"`, `Rule section: ` and the rule body; `answer.explanation` is saved.
    - `'explainItem refuses a found error or one with an explanation'`: rejects with `explain not allowed`, no LLM call.
    - `'explainItem failure leaves the answer unchanged'`: LLM error → `res.ok === false`, explanation still empty.

- [ ] **Step 2: Run** `yarn vitest run tests/prompts tests/core/grading/actions.test.ts` → FAIL.

- [ ] **Step 3: Implement**
  - `domain.ts`: add `'explain'` to `LlmKind`. `settings.ts`: `models.explain: DEFAULT_MODEL`, `efforts.explain: 'medium'`. `Settings.tsx` `KINDS`: append `'explain'`. i18n: `'llm.explain'`: "Объяснение ошибки" / "Error explanation".
  - `explain.schema.json`: strict object, `required: ["explanation"]`, `explanation` a string described as "2 to 4 sentences in the learner native language".
  - `explainItem`: load the answer row (as `disputeItems` does); require `verdict === 'wrong'`, item format `spot`, and empty explanation, else throw `new Error('explain not allowed')`. Get the item from `listGradingItems`. User message lines: `Topic key: …`, `Paragraph text: <passage[paragraph]>`, `Wrong fragment: "<prompt>"`, `Expected correction: "<expected>"`, `Rule section: <answer.rule_section || item.ruleSection>`, `Rule body (version N):`, the body. `callStructured<ExplainReply>(deps, 'explain', msg, { sessionId, check })`, where `check` returns `'empty explanation'` for a blank reply, else `toneViolations([r.explanation]).join('; ') || null`. On ok: `UPDATE answer SET explanation = ? WHERE item_id = ?`.
  - `previewLlm.ts`: `case 'explain': data = { explanation: 'Перед гласным звуком нужен артикль an: an old friend.' }; break;`

- [ ] **Step 4: Write `prompts/explain.md`** (exact copy)

```markdown
You explain one missed error to a learner in an English exam coach (IELTS / TOEFL preparation). The learner read a paragraph with hidden errors and did not find this one. The application already shows the wrong fragment and its correction; your job is to explain why the fragment is wrong under the rule, so the learner recognises the mechanism next time.

# Input

The user message gives the topic key, the paragraph text, the wrong fragment exactly as written in the paragraph, the expected correction, the rule section heading that decides the error, and the full current body of the rule with its version number.

# Language

Write "explanation" in {{nativeLanguage}}. English words and examples inside it stay in English.

# Explanation

Two to four sentences, neutral and factual. Say what the rule section requires, why the fragment in this paragraph breaks it (point to the word or sound that decides it), and how the correction fixes it. Use the rule as the authority; do not contradict it. Do not invent a different correction. Do not use the words "again", "missed", "spoiled" or their equivalents in {{nativeLanguage}}, do not count the learner's errors, do not refer to earlier sessions, no praise, no apology, no exclamation marks.

Return only the JSON object that matches the provided schema.
```

- [ ] **Step 5: Run** `yarn vitest run tests/prompts tests/core/grading` and `yarn typecheck` → PASS / clean.

- [ ] **Step 6: Commit** `feat(spot): explain call for a missed error`

---

### Task 4: Fields model (pure)

**Files:**
- Create: `src/ui/today/spotFields.ts`
- Test: `tests/ui/spotFields.test.ts`

**Interfaces:**
- Produces:
  - `type SpotField = { original: string; fix: string }`
  - `fieldsFromLines(text: string): SpotField[]`
  - `linesFromFields(fields: SpotField[]): string`
  - `addField(fields: SpotField[], paragraph: string, original: string): { fields: SpotField[]; index: number }`
  - `snapToWords(text: string, start: number, end: number): { start: number; end: number } | null`

- [ ] **Step 1: Write the failing tests**

```ts
test('round trip', () => {
  const f = [{ original: 'a old', fix: 'an old' }, { original: 'a hour', fix: '' }];
  expect(linesFromFields(f)).toBe('a old → an old\na hour → ');
  expect(fieldsFromLines('a old → an old\na hour → ')).toEqual(f);
});
test('legacy line without arrow becomes a field with an empty fix', () =>
  expect(fieldsFromLines('a old')).toEqual([{ original: 'a old', fix: '' }]));
test('addField orders by position and returns the index', () => {
  const p = 'I met a old friend for a hour.';
  const one = addField([], p, 'a hour');
  expect(addField(one.fields, p, 'a old')).toEqual({ fields: [{ original: 'a old', fix: 'a old' }, { original: 'a hour', fix: 'a hour' }], index: 0 });
});
test('addField with an existing fragment returns its index unchanged', () => {
  const p = 'I met a old friend.';
  const f = [{ original: 'a old', fix: 'an old' }];
  expect(addField(f, p, 'a old')).toEqual({ fields: f, index: 0 });
});
test('snap extends to whole words', () => expect(snapToWords('He went home.', 1, 6)).toEqual({ start: 0, end: 7 }));
test('snap trims edge spaces and punctuation', () => expect(snapToWords('He went home.', 7, 13)).toEqual({ start: 8, end: 12 }));
test('snap keeps apostrophes inside words', () => expect(snapToWords("It's late", 1, 2)).toEqual({ start: 0, end: 4 }));
test('snap of spaces or punctuation only is null', () => expect(snapToWords('He went.', 2, 3)).toBeNull());
```

- [ ] **Step 2: Run** `yarn vitest run tests/ui/spotFields.test.ts` → FAIL.

- [ ] **Step 3: Implement `spotFields.ts`.** A word character is `[\p{L}\p{N}'’-]` (with the `u` flag). `snapToWords` first trims non-word characters at both ends of `[start, end)`, then extends outward over word characters. A new field starts with `fix = original`. `addField` matches `original` exactly, then sorts by `paragraph.indexOf(original)`. `fieldsFromLines` uses `parseSpotLines`.

- [ ] **Step 4: Run** the same command → PASS.

- [ ] **Step 5: Commit** `feat(spot): fields model`

---

### Task 5: Lesson UI: flyout, fields, hint

**Files:**
- Modify: `src/ui/today/SpotBlock.tsx` (the ungraded branch), `src/ui/today/Block.tsx:25-28`, `src/core/i18n/en.ts`, `ru.ts`
- Test: `tests/e2e/spot.spec.ts` (new)

**Interfaces:**
- Consumes: Task 4 functions. `SpotBlock` props stay `{ block, lang, values, onChange, graded }`. Fields are derived from `values[key]` on every render, and every change calls `onChange(key, linesFromFields(next))`. That keeps drafts unchanged.
- New i18n keys: `spot.fix`, `spot.was` (`{text}`), `spot.hint`, `spot.remove` (aria "Убрать" / "Remove"). Remove `input.spot` from both files.

- [ ] **Step 1: Write the failing e2e tests** in `tests/e2e/spot.spec.ts` on `/?state=generated#/today`. Select with a helper that uses `page.evaluate` to set a DOM `Range` over a substring of the first spot paragraph (`#para-<blockId>-0`, located by its text "Yesterday I met").
  - `'select → Fix adds a prefilled field; ✕ removes it'`: select `old fri` and click "Исправить" with a real `click()`. The textbox's value is `old friend` and the label reads `было: old friend`. Click ✕ (`Убрать`) and the textbox is gone.
  - `'selecting the same fragment again focuses the existing field'`: one textbox, and it is focused.
  - `'no flyout for a selection of spaces'`: the "Исправить" button count is 0.
  - `'fields survive a reload'`: edit to `an old friend`, reload, and the value is still `an old friend`.
  - `'spot block shows the app hint, not the generated example'`: `Выделите ошибку в тексте и нажмите «Исправить».` is visible inside the spot block section, and no textarea is in that section.

- [ ] **Step 2: Run** `yarn playwright test tests/e2e/spot.spec.ts` → FAIL.

- [ ] **Step 3: Implement**
  - **Flyout.** Listen to `document` `selectionchange`. When the selection is non-collapsed and lies within one paragraph `<p>`:
    - compute offsets relative to that `<p>` (a `Range` from the start of the `<p>` to the selection edge, `.toString().length`);
    - run `snapToWords`;
    - store `{ key, start, end, rect }`.
    
    Clear the state when the selection collapses or leaves the paragraphs, unless the flyout button has focus. Render the flyout as an absolutely positioned `Button size="sm"` above `rect`. Use `onMouseDown={(e) => e.preventDefault()}` so the click keeps the selection. On click:
    - `addField`;
    - `onChange`;
    - remember the index to focus;
    - clear the selection (`getSelection()?.removeAllRanges()`).
  - **Fields** under the paragraph: label `spot.was` (class `label text-faint`), `Input` with `aria-labelledby` pointing at that label, ghost ✕ button `aria-label={t(lang,'spot.remove')}`.
  - **`Block.tsx`.** For `block.format === 'spot'` show `t(lang, 'spot.hint')` instead of `block.instruction`, and no `formatExample`.

- [ ] **Step 4: Run** the spot e2e plus `yarn playwright test tests/e2e/screenshots.spec.ts` → PASS. Screenshots that showed the textarea are expected to change; check them visually.

- [ ] **Step 5: Commit** `feat(spot): select-and-fix fields in the lesson`

---

### Task 6: Results: count and Explain button

**Files:**
- Modify: `src/ui/today/SpotBlock.tsx` (graded branch), `src/ui/today/ItemActions.tsx`, i18n files
- Test: `tests/e2e/spot.spec.ts`

**Interfaces:**
- Consumes: `explainItem` (Task 3), `useSessionActions().reload`.
- New i18n keys: `spot.count` (`{found}`, `{total}`), `item.explain`, `item.explaining`, `explain.error` ("Не удалось получить объяснение: {message}" / "Could not get an explanation: {message}").

- [ ] **Step 1: Write the failing e2e tests** on `/?state=graded#/today`.
  - `'graded paragraph shows found N of M'`: the text matches `/Найдено \d+ из \d+/`.
  - `'Explain fills the explanation once'`: on a "Не найдено" spot row, click "Объяснить" twice quickly. The preview explanation text is visible exactly once, and the button is gone after a reload.

- [ ] **Step 2: Run** `yarn playwright test tests/e2e/spot.spec.ts` → FAIL.

- [ ] **Step 3: Implement**
  - **Count.** Per graded paragraph: `total = errors.filter((e) => e.effective !== null).length`, `found = errors.filter((e) => e.effective === 'correct').length`. Render `spot.count` under the paragraph text when `total > 0`.
  - **Explain** in `ItemActions`, shown when `item.format === 'spot' && item.status === 'active' && a.verdict === 'wrong' && a.explanation === ''`. A ghost `sm` button in the same row as "Оспорить". While busy it is disabled and labelled `item.explaining`. On success `reload()`. On failure `Notice` with `explain.error` and a "Повторить" (`today.retry`) button, as `DisputeField` does.

- [ ] **Step 4: Run** the spot e2e, `yarn vitest run`, `yarn typecheck`, `yarn lint` → PASS / clean.

- [ ] **Step 5: Commit** `feat(spot): found count and Explain`

---

### Task 7: Docs and final check

**Files:**
- Modify: `docs/superpowers/s1-decisions.md` (the "Find the errors in the text" item), `docs/superpowers/handoff.md`

- [ ] **Step 1:** In `s1-decisions.md`, mark the spot item closed (2026-11-01) with a link to the spec. In `handoff.md`, note the select-and-fix block, the `explain` call kind (its own model and effort in Settings) and the plan path.
- [ ] **Step 2:** Run `yarn typecheck && yarn lint && yarn vitest run && yarn playwright test`. Expected: all pass except the known environmental `csp.spec.ts` failure (Vite HMR websocket blocked in this container).
- [ ] **Step 3: Commit** `docs: spot fix fields closed`
