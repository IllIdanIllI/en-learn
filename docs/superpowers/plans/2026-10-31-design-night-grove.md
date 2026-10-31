# Night Grove Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Night grove" design (tokens, fonts, pixel garden in the sidebar, small lesson-page details) with a Settings switch back to the current "Lamp" design.

**Architecture:** A `design` setting drives `<html data-design="grove|lamp">`; all Night grove CSS hangs off `[data-design='grove']`, so Lamp is untouched. Pixel art is built by pure functions (pixel rows) rendered by one `<Pixel>` component whose colours are CSS tokens. Garden data (moon phase, yesterday's correct answers, today closed) comes from pure core functions.

**Tech Stack:** React 19, Tailwind 4 + shadcn tokens, Vitest, Playwright (preview mode with sql.js), `@fontsource/*`.

**Spec:** `docs/superpowers/specs/2026-10-31-design-night-grove.md` (N1–N9). Prototype reference: `docs/superpowers/notes/2026-10-31-night-grove-prototype/` (pixel maps in `sprites4.js`, colours in `yoru3.css`).

## Global Constraints
- Lamp renders exactly as today except the N7 fixes (no side stripe, no strike-through on wrong items).
- Night grove styling only under `[data-design='grove']`; colours only via tokens; no `#000`/`#fff`.
- UI strings exist in both `ru.ts` and `en.ts`; no em dashes; no "again"/"снова" wording (enforced by `tests/core/i18n.test.ts`).
- Fonts bundled offline: `@fontsource/murecho` and `@fontsource/alegreya`, Latin and Cyrillic subsets only.
- Decorations are `aria-hidden`, `pointer-events: none`, not focusable; only the firefly glow animates (opacity), and not under `prefers-reduced-motion`.
- Day/night = effective theme (dark = night), never the clock.
- Sprite pixel = 2 CSS px (lantern 3 px), SVG `<rect>` runs with `shape-rendering="crispEdges"`.
- Yarn: if `yarn` cannot download itself, run with `COREPACK_NPM_REGISTRY=https://registry.npmjs.org`.

## Review Focus
1. Theme "system" and the OS switching dark/light while the app is open: garden night/day must follow without reload (test in Task 1, Task 7).
2. Switching the design in Settings: decorations appear/disappear immediately, no reload (test in Task 7).
3. Minimum window height 640 px: the garden must not cover the menu (test in Task 7).
4. Empty database or no session yesterday: no fireflies, no geta, no crash (test in Task 5).
5. Long lessons: answer meter with 60 fields must stay inside the 672 px content column (test in Task 6).

---

### Task 1: Design setting, `data-design`, effective dark flag, Settings row

**Files:**
- Modify: `src/core/db/repos/settings.ts` (add `design: 'grove' | 'lamp'`, default `'grove'`)
- Modify: `src/ui/app/CoreProvider.tsx` (`useTheme` returns `isDark`; new effect sets `data-design`; `Core` gains `isDark: boolean`)
- Modify: `src/ui/pages/Settings.tsx` (Segmented row after the theme row)
- Modify: `src/core/i18n/ru.ts`, `src/core/i18n/en.ts`
- Test: `tests/core/db/settings.test.ts`, `tests/e2e/grove.spec.ts` (new)

**Interfaces:**
- Produces: `Settings['design']`; `useCore().isDark: boolean` (true when the `dark` class is on `<html>`, updates on OS change under "system"); `<html data-design>`.
- i18n keys: `settings.design` = "Оформление" / "Design"; `settings.design.grove` = "Ночная роща" / "Night grove"; `settings.design.lamp` = "Лампа" / "Lamp".

- [ ] **Step 1: Tests.** In `settings.test.ts` add `design: 'grove'` to the expected defaults object (behaviour change per spec N1) and a test `design round-trips` (`setSetting(db,'design','lamp')` → `getSettings(db).design === 'lamp'`). In `tests/e2e/grove.spec.ts`: `test('design switch applies immediately')`: goto `/?state=no_session#/settings`; expect `html` attribute `data-design` = `grove`; click radio/segment "Лампа"; expect `data-design` = `lamp` without reload; click "Ночная роща" → `grove`. `test('system theme follows the OS')`: set theme "Как в системе", `page.emulateMedia({ colorScheme: 'light' })` → `html` has no `dark` class; `colorScheme: 'dark'` → has `dark`.
- [ ] **Step 2:** Run `yarn test tests/core/db/settings.test.ts` and `yarn e2e tests/e2e/grove.spec.ts`; expected FAIL (missing `design`, no attribute, no segment).
- [ ] **Step 3: Implement.** `useTheme(theme): boolean` keeps the current logic and also stores the applied value in state. `useEffect` sets `document.documentElement.dataset.design = settings.design`. Settings row mirrors the theme row (`Segmented`, `save('design', v)`), options in order grove, lamp.
- [ ] **Step 4:** Re-run both commands; expected PASS. Run `yarn test tests/core/i18n.test.ts`; PASS.
- [ ] **Step 5: Commit** `feat: design setting with Night grove default and Lamp switch`.

### Task 2: Night grove tokens and fonts

**Files:**
- Create: `src/ui/styles/grove.css` (imported from `globals.css` after the existing `.dark` block)
- Modify: `src/ui/styles/globals.css` (one `@import "./grove.css";`), `package.json` + `yarn.lock` (`yarn add @fontsource/murecho @fontsource/alegreya`)
- Test: `tests/e2e/grove.spec.ts`

**Interfaces:**
- Produces: tokens of spec N2 under `[data-design='grove']` and `.dark[data-design='grove']`, plus every `--px-*` and `--firefly` token copied from `yoru3.css` (light block → `[data-design='grove']`, dark block → `.dark[data-design='grove']`). Font roles of spec N3 under `[data-design='grove']`: `body` Murecho, `.headline, .title` Murecho 700, `.reading` Alegreya 1.125rem / 1.55.
- Font imports: `@fontsource/murecho/{latin,cyrillic}-{400,500,700}.css`, `@fontsource/alegreya/{latin,cyrillic}-{400,700}.css`, `@fontsource/alegreya/{latin,cyrillic}-400-italic.css` (check the exact file names in `node_modules/@fontsource/*/`; use the subset files, not `index.css`).

- [ ] **Step 1: Test** `test('grove and lamp tokens and fonts')`: at `/?state=generated#/today` with theme dark: grove → `getComputedStyle(body).backgroundColor` equals the computed value of `oklch(0.2 0.022 165)` (compute it in the page via a probe element), `getComputedStyle(h1.headline).fontFamily` contains `Murecho`, a `.reading` element's font contains `Alegreya`; switch to lamp in Settings → body background equals computed `oklch(0.205 0.012 65)` and headline font contains `Literata`.
- [ ] **Step 2:** `yarn e2e tests/e2e/grove.spec.ts -g tokens` → FAIL.
- [ ] **Step 3:** Add the dependencies and `grove.css`.
- [ ] **Step 4:** Re-run → PASS. `yarn build` succeeds; no CSP change needed (fonts are files or data URIs, both allowed).
- [ ] **Step 5: Commit** `feat: Night grove colours and fonts`.

### Task 3: N7 fixes for wrong items (both designs)

**Files:**
- Modify: `src/ui/today/GradedItem.tsx:32,45,49`
- Test: `tests/e2e/screenshots.spec.ts` (new test in the existing graded section)

- [ ] **Step 1: Test** `test('a wrong item has a full border and no strike-through')` at `/?state=graded#/today`, for design lamp and grove: the first wrong item's container has computed `borderLeftWidth` `1px` equal to `borderTopWidth`, and `main .line-through` count is 0.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Line 32: replace `border-l-[3px] border-destructive bg-destructive/8` with `border border-destructive/40 bg-destructive/8`. Lines 45 and 49: drop `line-through`, keep `text-muted-foreground`.
- [ ] **Step 4:** Run → PASS; existing screenshot tests PASS.
- [ ] **Step 5: Commit** `fix: wrong items without side stripe or strike-through`.

### Task 4: Moon phase

**Files:**
- Create: `src/core/moon.ts`
- Test: `tests/core/moon.test.ts`

**Interfaces:**
- Produces: `moonPhase(date: ISODate): number` in `[0, 1)`; 0 = new, 0.5 = full. Noon UTC of `date`, reference new moon `2000-01-06T18:14:00Z`, synodic month `29.530588853` days.

- [ ] **Step 1: Test** (distance on the circle, tolerance 0.04): new moon on `2024-04-08` (solar eclipse) → near 0; full moon on `2000-01-21`, `2025-09-07`, `2026-03-03` (lunar eclipses) → near 0.5; result always `>= 0` and `< 1` for `1999-12-31`.
- [ ] **Step 2:** `yarn test tests/core/moon.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: moon phase of a date`.

### Task 5: Garden state

**Files:**
- Create: `src/core/progress/garden.ts`
- Test: `tests/core/progress/garden.test.ts`

**Interfaces:**
- Consumes: `loadProgressLog(db)` (`ProgressLogRow.date`, `.scores[].correct`), `getSessionByDate(db, date)`, `getSettings(db).closedSessions`, `addDays`.
- Produces: `FIREFLY_MAX = 12`; `loadGardenState(db: Db, today: ISODate): Promise<{ fireflies: number; todayClosed: boolean }>`. `fireflies` = sum of `scores[].correct` of the graded session dated `addDays(today, -1)`, capped at `FIREFLY_MAX`; 0 without one. `todayClosed` = today's session exists and its id is in `closedSessions`.

- [ ] **Step 1: Tests** (seed like `tests/core/progress/history.test.ts`): empty db → `{ fireflies: 0, todayClosed: false }`; graded session on `2026-10-20` with 1 correct, today `2026-10-21` → `fireflies: 1`; same data, today `2026-10-22` → 0; 15 correct answers yesterday → 12; today's session id in `closedSessions` → `todayClosed: true`, not in it → false.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: garden state from yesterday's answers and today's lesson`.

### Task 6: Pixel sprites

**Files:**
- Create: `src/ui/grove/sprites.ts` (pure builders), `src/ui/grove/Pixel.tsx`
- Test: `tests/ui/groveSprites.test.ts`

**Interfaces:**
- Produces: `type PixelRows = string[]`; `PALETTE: Record<string, string>` (char → `var(--px-…)`, as `PAL` in `sprites4.js`); builders ported from `sprites4.js`: `grove(w: number, h: number): PixelRows` (spec option A layout, deterministic), `fence(w: number): PixelRows`, `SHOOT`, `lantern(lit: boolean): PixelRows`, `moon(phase: number, r?: number): PixelRows`, `GETA`, `LEAF`, `DRY_LEAF` (`LEAF` with `y` for `f`), `divider(cols: number): PixelRows`, `stalkMeter(states: ('ok'|'bad'|'empty')[], maxCols?: number): PixelRows`.
- `stalkMeter`: segment length `clamp(floor(maxCols / n) - 1, 3, 9)` (default `maxCols = 300`, i.e. 600 px at scale 2), nodes between segments, the sprouting leaf after the last `ok`.
- `<Pixel rows={PixelRows} scale?: number className?: string />` renders `<svg aria-hidden viewBox="0 0 w h" width={w*scale} height={h*scale} shape-rendering="crispEdges">` with merged horizontal `<rect>` runs; unknown chars are transparent.

- [ ] **Step 1: Tests:** `grove(110, 78)` returns 78 rows of length 110 and is identical on two calls; `moon(0)` contains no `m`, `moon(0.5)` contains no `E` inside the disc; `lantern(false)` contains no `w`/`m`; `stalkMeter` with 7 states is `7*(9+1)+1` wide, with 60 states is at most 300 wide; `divider(300)` is 300 wide.
- [ ] **Step 2:** `yarn test tests/ui/groveSprites.test.ts` → FAIL.
- [ ] **Step 3:** Port the builders and write `Pixel`.
- [ ] **Step 4:** → PASS; `yarn typecheck` clean.
- [ ] **Step 5: Commit** `feat: pixel sprite builders for Night grove`.

### Task 7: Sidebar garden

**Files:**
- Create: `src/ui/grove/Garden.tsx`, `src/ui/grove/useGarden.ts`
- Modify: `src/ui/app/Sidebar.tsx` (nav gets `relative`; render `<Garden />` last when `settings.design === 'grove'`), `src/ui/styles/grove.css` (firefly keyframes, reduced motion)
- Test: `tests/e2e/grove.spec.ts`

**Interfaces:**
- Consumes: `useCore().isDark`, `useCore().version`, `deps.clock.today()`, `loadGardenState`, `moonPhase`, sprites, `<Pixel>`.
- Produces: `<Garden>` root `div[data-garden][aria-hidden="true"]` with `data-night="true|false"`, absolutely placed at the nav bottom, `hidden min-[1100px]:block`, `pointer-events-none`; children `[data-moon]` (night only, top-left of the free sky, placed directly under the last nav link), `[data-firefly]` × `fireflies` (night only, over the grove, `animation-delay` staggered), `[data-lantern][data-lit]`, `[data-geta]` (only when `todayClosed`, outlined with three `drop-shadow`s in `--background`), fence, two shoots, grove. Layout as `decorate6.js` option A (grove at most 78 rows, fence full width, lantern left at scale 3, shoots right).

- [ ] **Step 1: Tests:** grove dark at `/?state=graded#/today` → `[data-garden]` visible with `data-night="true"`, `[data-moon]` count 1, `[data-lantern]` `data-lit="true"`; light theme → `data-night="false"`, no `[data-moon]`, no `[data-firefly]`, lantern `data-lit="false"`; `/?state=closed#/today` → `[data-geta]` count 1, graded state → 0; Lamp → no `[data-garden]`; viewport 1000 px wide → garden not visible; viewport 1280×640 → garden box top ≥ last nav link bottom; theme "system" + `emulateMedia` dark → light flips `data-night`.
- [ ] **Step 2:** `yarn e2e tests/e2e/grove.spec.ts -g garden` → FAIL.
- [ ] **Step 3:** Implement `useGarden()` (loads `loadGardenState(deps.db, deps.clock.today())`, reloads on `version`) and `Garden`.
- [ ] **Step 4:** → PASS; take screenshots `test-results/screens/grove-garden-{dark,light}.png` and look at them.
- [ ] **Step 5: Commit** `feat: Night grove sidebar garden`.

### Task 8: Lesson-page details

**Files:**
- Create: `src/ui/grove/segments.ts`, `src/ui/grove/AnswerMeter.tsx`, `src/ui/grove/ScoreBar.tsx`
- Modify: `src/ui/today/Block.tsx` (leaf before the heading; `Block` gains prop `divider: boolean` → `<Pixel rows={divider(…)} />` above the section), `src/ui/today/SessionPage.tsx` (pass `divider={i > 0}`; render `<AnswerMeter>` after `SessionHeader` when not graded), `src/ui/today/FeedbackSummary.tsx` (`<ScoreBar>` after the heading), `src/ui/pages/ErrorBank.tsx:73` (`DRY_LEAF` before the "was" text), `src/core/i18n/ru.ts`, `src/core/i18n/en.ts`
- Test: `tests/ui/groveSegments.test.ts`, `tests/e2e/grove.spec.ts`

**Interfaces:**
- Produces: `answerSegments(view: SessionView, items: Record<number, string>, spot: Record<string, string>): boolean[]` — one entry per ungraded answer field in block order (items of non-`question`, non-speaking blocks; one per spot paragraph keyed `${blockId}:${index}`), true when trimmed text is non-empty. `scoreSegments(view: SessionView): ('ok' | 'bad')[]` — graded items and spot errors in block and item order, skipping speaking/`question` blocks and items whose `effective` is null/undefined; `'correct'` → `'ok'`, anything else → `'bad'`.
- Every grove element renders only when `settings.design === 'grove'`.
- i18n: `grove.answered` = "Ответов: {n} из {m}" / "Answered: {n} of {m}"; `grove.correct` = "Верно {n} из {m}" / "Correct: {n} of {m}".

- [ ] **Step 1: Tests:** unit — `answerSegments` on a view with a gap block (2 items, one filled) and a spot block (1 paragraph, filled) → `[true, false, true]`; a question block adds nothing; `scoreSegments` on a graded view with effective `correct, wrong, null` → `['ok','bad']`. e2e — grove `/?state=generated#/today`: text "Ответов: 0 из" visible; fill the first input → "Ответов: 1 из"; `/?state=graded#/today` shows "Верно 3 из 6"; every `h2.title` inside a block has a leading `svg`; `/?state=graded#/errors` rows have an `svg`; Lamp: none of these.
- [ ] **Step 2:** `yarn test tests/ui/groveSegments.test.ts` and `yarn e2e tests/e2e/grove.spec.ts -g lesson` → FAIL.
- [ ] **Step 3:** Implement; `ScoreBar` = big `N / M` (heading font, tabular), the `grove.correct` line, `stalkMeter(scoreSegments(view))` at scale 2 (wrong = `y` dry colours).
- [ ] **Step 4:** → PASS; screenshots of Today answering and checked, both themes, looked at.
- [ ] **Step 5: Commit** `feat: Night grove details on lesson pages`.

### Task 9: Documentation and final verification

**Files:**
- Create: `app-design/DESIGN-night-grove.md` (same frontmatter/sections shape as `DESIGN.md`: tokens of N2, fonts N3, garden and its drivers N4, lesson details N5, sprites N6, do's and don'ts)
- Modify: `app-design/DESIGN.md` (note at top: two designs; this file is Lamp; Night grove in `DESIGN-night-grove.md`), `docs/superpowers/s1-decisions.md` (close the "Design pass" open item with a pointer to the spec; spot-block item stays open), `docs/superpowers/handoff.md` (state, test counts)

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run `yarn typecheck`, `yarn lint`, `yarn test`, `yarn e2e`, `cargo check` (in `src-tauri`); all clean. Record the new Vitest and Playwright counts in the handoff.
- [ ] **Step 3:** Screenshots of Today (answering, checked), Lesson closed, Progress, Error bank, Settings, loader in both designs and both themes; look at each for overlap, clipping and contrast.
- [ ] **Step 4: Commit** `docs: Night grove design system, decisions and handoff`.
