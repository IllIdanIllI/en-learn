# Words feedback round 2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reorganise the Words header (in progress / learned / total + collapsible details), make the word page's ← sticky, Definition/Example text areas, field titles without the pointer cursor, and the dictionary link inside the Link title.

**Architecture:** `wordsOverview` gains the three counts; the header becomes a small summary component in `src/ui/words/`; form and CSS changes are local.

**Tech Stack:** React, TypeScript, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-words-feedback-2.md` (G1–G6).

## Global Constraints
- Every interactive element has `cursor: pointer`, disabled `not-allowed`; **field titles (`label[for]`) are no longer pointer** (G4).
- UI strings in `src/core/i18n/{ru,en}.ts`, both languages; banned "again", "снова", "опять", em dash "—" (the "·" separator is fine).
- Settings keys camelCase (`wordsStatsOpen`, default false); `tests/core/db/settings.test.ts` asserts the full defaults object.
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`. Before committing: `yarn vitest run`, `yarn typecheck`, `yarn lint`, `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts` (+ any spec you touch). screenshots.spec (flaky env) and csp.spec (known) are not in scope.
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY`.

## Review Focus
1. A Learned word that was reviewed must not count as In progress (stage 4 excluded).
2. Bar widths when Total is 0 (empty list): no division by zero, no NaN width.
3. The header with nothing to practise: Start practice disabled (`aria-disabled` link) still sits in the same row as +10.
4. Sticky ← must not cover the page title or the first field when at the top.
5. The dictionary link inside a `<label>`: clicking it opens the dictionary and does not just focus the input.

---

### Task 1: Words header (G1)

**Files:** Modify `src/core/words/practice.ts`, `src/core/db/repos/settings.ts`, `src/ui/pages/Words.tsx`, `src/core/i18n/{ru,en}.ts`; Create `src/ui/words/WordsSummary.tsx`; Test `tests/core/words/practice.test.ts`, `tests/core/db/settings.test.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`.

**Interfaces:**
- Produces: `WordsOverview` = `{ counts, dueToday, available, nextDue, canAddNew, inProgress: number, learned: number, total: number }` (`started` removed; update its callers and tests). `Settings.wordsStatsOpen: boolean` (default false). `WordsSummary({ overview, lang })` renders the line, bar, Details toggle and panel; it reads/saves `wordsStatsOpen` through `useCore()` (`settings`, `deps.db`, `refresh`) like Settings does.

- [ ] **Step 1: Failing tests.** practice.test: views with one Learned word (reviewed, stage 4), two in progress (one with failed generation), three never reviewed → `inProgress 2, learned 1, total 6`. words.spec (`?state=words`, then `words-limit`): the summary line text matches the seeded counts (read the expected numbers from the seed); Details (button, `aria-expanded=false`) → panel shows "Due today" and New/Recall/Use counts → Hide closes it; Start practice and +10 share one parent row (`words-limit`); the old "Started"/"Начато" text is gone. cursor.spec: `words` case with the panel open.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Counts in `wordsOverview`. `WordsSummary`: the line "{inProgress label}: X · {learned label}: Y · {total label}: Z"; bar `role="img"` with `aria-label` = the line, two segments by percentage of total (0 when total is 0); toggle saves `wordsStatsOpen`. Words.tsx: buttons row `flex flex-wrap items-center gap-3` with Start practice and +10; then `WordsSummary`. i18n (ru / en): `words.inProgress` "В процессе" / "In progress"; `words.learned` "Выучено" / "Learned"; `words.total` "Всего" / "Total"; `words.details` "Подробнее" / "Details"; `words.hide` "Скрыть" / "Hide"; reuse `words.due`-style text for "К повторению сегодня" / "Due today" as a label + number (add `words.dueLabel` if the existing key embeds the number). Remove keys that become unused (`words.started`).
- [ ] **Step 4:** checks from Global Constraints → PASS.
- [ ] **Step 5: Commit** `feat(words): in-progress summary with details panel`.

### Task 2: Word page and fields (G2–G5) + docs

**Files:** Modify `src/ui/pages/WordPage.tsx`, `src/ui/words/WordForm.tsx`, `src/ui/words/WordDetails.tsx`, `src/ui/styles/globals.css`, `tests/e2e/cursor.spec.ts`, `tests/e2e/words.spec.ts`, `src/core/i18n/{ru,en}.ts`, `CLAUDE.md` (one clause), `docs/superpowers/handoff.md` (Words entry: round 2, spec + plan paths).

**Interfaces:** Consumes `wordLink(word, link)` (`src/core/words/link.ts`), `ExternalLink`, `Textarea` (`src/ui/components/ui/textarea.tsx`).

- [ ] **Step 1: Failing tests (words.spec, `?state=words`, `/words/1`):** after scrolling to the bottom the top ← link is still in the viewport (`toBeInViewport()`); Definition and Example are `textarea`; the Link field title contains a link "открыть в словаре" whose `href` is the word's dictionary link; the old standalone link under the form is gone; "Add word" form: the bracket link appears only after typing a word. cursor.spec: add a check that `label[for]` elements have `cursor: auto`/`default` (computed), and remove `label[for]` from `INTERACTIVE`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Sticky: the ← row `sticky top-0 z-10 bg-background` with vertical padding, inside the scrolling `<main>`. WordForm: Definition and Example `Textarea rows={3}` (`resize-y`). Link title: `<label for=…>{Link label}</label>` followed by ` (` + `ExternalLink` + `)` outside the `<label>` element so a click opens the link (same line). Remove the old link block in WordDetails and its now-unused imports/keys. globals.css: drop `label[for]` from the pointer selector list. CLAUDE.md UI rule: add "Field titles (`label[for]`) are not interactive and keep the default cursor." i18n: `words.openLinkShort` "открыть в словаре" / "open in dictionary" (or reuse `words.openLink` if its text fits lower-case in brackets; remove the old key if unused).
- [ ] **Step 4:** checks → PASS. Update `docs/superpowers/handoff.md` Words entry.
- [ ] **Step 5: Commit** `feat(words): sticky back arrow, text areas, dictionary link in the Link title`.
