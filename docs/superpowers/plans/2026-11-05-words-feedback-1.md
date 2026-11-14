# Words feedback round 1, start of day, app icon: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a started count, a page per word, a "+10 new words" button, a configurable start of the day with "Start a new day", and the new bamboo app icon with a Light/Night setting.

**Architecture:** The app's date moves into one pure function (`src/core/day.ts`) that every `Clock` uses after `configure()`; CoreProvider configures the clock from settings and re-checks the date each minute and on focus. Words changes stay in `src/core/words/*` (queue limit + overview fields) and the Words UI. The icon is a bundled Light icon plus a macOS-only Rust command that swaps the Dock icon to an embedded Night PNG.

**Tech Stack:** React + react-router, TypeScript, Vitest, Playwright, sql.js (preview) / tauri-plugin-sql, Tauri 2.12 (Rust), objc2 0.6.5 / objc2-app-kit 0.3.2 / objc2-foundation 0.3.2.

**Spec:** `docs/superpowers/specs/2026-11-05-words-feedback-1.md` (F1–F6). Background: `docs/superpowers/specs/2026-11-04-words-design.md`.

## Global Constraints

- Every interactive element has `cursor: pointer`, disabled ones `not-allowed` (CLAUDE.md); new pages/states get a case in `tests/e2e/cursor.spec.ts`.
- UI strings live in `src/core/i18n/{ru,en}.ts`; `tests/core/i18n.test.ts` bans "again", "снова", "опять" and the em dash "—" in them.
- Settings keys follow the existing camelCase convention of `Settings` (`src/core/db/repos/settings.ts`): the spec's `day_start_hour`, `day_override`, `words_extra_new` are stored as `dayStartHour`, `dayOverride`, `wordsExtraNew`. No migration (key/value table).
- Default start hour **5**; allowed whole hours **0–12 inclusive**.
- New-word limit = `NEW_PER_DAY` (10) + today's extra; "+10" adds exactly **10**.
- Bundled icon = **Light**; Night is macOS-only and only while the app runs.
- Before running yarn in this container: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`.
- Checks per task: `yarn vitest run <files>`, then before committing `yarn typecheck && yarn lint`; e2e with `yarn playwright test <spec>`.
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY`.

## Review Focus

1. **Start hour exactly at the boundary:** at 05:00:00 local with start hour 5 the date is the new day; at 04:59:59 it is the previous day. (Task 1 test.)
2. **Override older than the rule date:** a stored `dayOverride` from last week must not pull the date back (max rule). (Task 1 test.)
3. **Extra stored for another date:** `wordsExtraNew = { date: yesterday, extra: 20 }` gives limit 10 today. (Task 3 test.)
4. **Search text with spaces/Cyrillic in the URL:** `/words?q=при вет` round-trips through ← back. (Task 5 e2e.)
5. **Night icon at launch in dev:** Tauri's dev build sets the bundle icon on `RunEvent::Ready`; ours must be applied after it (Task 6, Mac checklist).

---

### Task 1: The app's date (core + clocks)

**Files:**
- Create: `src/core/day.ts`, `tests/core/day.test.ts`
- Modify: `src/core/ports.ts` (Clock), `src/adapters/tauri/clock.ts`, `src/adapters/test/fixedClock.ts`, `src/adapters/preview/fixtures.ts` (SteppedClock + `?early=1`), `src/core/db/repos/settings.ts`, `src/ui/app/boot.ts`

**Interfaces:**
- Produces:
  - `interface DayConfig { dayStartHour: number; overrideDate: ISODate | null }`, `DEFAULT_DAY: DayConfig = { dayStartHour: 5, overrideDate: null }`
  - `localDate(d: Date): ISODate` (local calendar date)
  - `ruleDate(now: Date, startHour: number): ISODate` = `localDate(new Date(y, m, d, h - startHour, min, s))` built from local components (so DST follows the local clock)
  - `appDate(now: Date, cfg: DayConfig): ISODate` = max(ruleDate, overrideDate) by string compare
  - `canStartNewDay(now: Date, cfg: DayConfig): boolean` = `cfg.dayStartHour > 0 && appDate(now, cfg) < localDate(now)`
  - `Clock` gains `calendarDate(): ISODate` and `configure(cfg: DayConfig): void`; also `canStartNewDay(): boolean`
  - `Settings` gains `dayStartHour: number` (default 5) and `dayOverride: ISODate | null` (default null)

- [ ] **Step 1: Write failing tests** in `tests/core/day.test.ts` (build `now` with `new Date(2026, 10, 5, h, m)` so they are local-time):
  - `ruleDate(04:59, 5) === '2026-11-04'`, `ruleDate(05:00, 5) === '2026-11-05'`, `ruleDate(00:30, 0) === '2026-11-05'`, `ruleDate(11:59, 12) === '2026-11-04'`, `ruleDate(12:00, 12) === '2026-11-05'`
  - `appDate(03:00 on 5 Nov, { 5, override '2026-11-05' }) === '2026-11-05'`; same override at 06:00 on 6 Nov gives `'2026-11-06'` (override stops mattering); override `'2026-10-29'` at 03:00 on 5 Nov gives `'2026-11-04'`
  - start hour changed while the override is set: `appDate(06:00 on 5 Nov, { 8, override '2026-11-05' }) === '2026-11-05'`
  - `canStartNewDay(03:00, {5,null}) === true`; `(06:00, {5,null}) === false`; `(03:00, {0,null}) === false`; `(03:00, {5,'2026-11-05'}) === false`
- [ ] **Step 2:** `yarn vitest run tests/core/day.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/core/day.ts`; extend `Clock`; `TauriClock` holds a `DayConfig` (default `DEFAULT_DAY`) and uses `new Date()`; `FixedClock.configure` stores the config but `today()` and `calendarDate()` stay the fixed date and `canStartNewDay()` returns false; `SteppedClock` keeps `set(date)` for building fixtures and, after a new `simulateEarly()` call, behaves as local time `(date + 1 day) 03:00`, so `today()` = `appDate(that, cfg)`, `calendarDate()` = date + 1; without `simulateEarly()`: `today()` = `calendarDate()` = the set date and `canStartNewDay()` = false (config ignored). Seeding runs before `configure()`, so with `simulateEarly()` the fixtures still seed at the set date (default config: 03:00 next day → rule date = set date). `buildPreview` calls `clock.simulateEarly()` when the URL has `early=1` (parse in `boot.ts` like `parsePreviewDelay`, pass into `buildPreview` as an option). Add the two settings with defaults. In `bootTauri` and `bootPreview`, after `getSettings`, call `clock.configure({ dayStartHour: settings.dayStartHour, overrideDate: settings.dayOverride })` before anything reads `today()` (move `getSettings` up in `bootTauri`; `loadSeedInput` is lazy so it is fine).
- [ ] **Step 4:** `yarn vitest run tests/core/day.test.ts tests/core/db` → PASS; full `yarn vitest run` stays green (FixedClock users unaffected).
- [ ] **Step 5: Commit** `feat(day): app date with a start hour and a new-day override`.

### Task 2: Start of day in the app (CoreProvider + Settings)

**Files:**
- Modify: `src/ui/app/CoreProvider.tsx`, `src/ui/pages/Settings.tsx`, `src/core/i18n/{ru,en}.ts`
- Create: `src/ui/app/useDayWatch.ts`
- Test: `tests/e2e/settings-day.spec.ts` (new), `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes: Task 1 `Clock.configure/calendarDate/canStartNewDay`, settings `dayStartHour`, `dayOverride`.
- Produces: `dayWatcher(clock: Clock, onChange: () => void): () => void` in `src/core/day.ts` (the returned function is the `check`, not a cleanup; it that calls `onChange` only when `clock.today()` differs from the last value it saw; the first value is read when the watcher is made); `useDayWatch(clock, onChange)` in `src/ui/app/useDayWatch.ts` runs that `check` every 60 000 ms and on `window` `focus`, and cleans both up.

- [ ] **Step 1a: Write a failing unit test** in `tests/core/day.test.ts`: with a fake clock whose `today()` returns a mutable value, `dayWatcher` → `check()` with no change does not call `onChange`; after the value changes, one `check()` calls it once and a second `check()` does not.
- [ ] **Step 1b: Write the failing e2e** `tests/e2e/settings-day.spec.ts` (preview, `?state=words`):
  - Settings shows a "Day starts at" select with value `05:00` and options `00:00`…`12:00` (13 options).
  - Without `early`: the "Start a new day" button is disabled with the hint "The day has already started"; computed cursor `not-allowed`.
  - Selecting `00:00` hides the button.
  - With `&early=1`: the button is enabled; click → inline "Start <date>?" with Start/Cancel; Start → the button becomes disabled (date moved). No reload assertions anywhere: the preview DB is in-memory and reseeds on load. The date in the confirm is the calendar date in `formatTitleDate` style (`src/core/dates.ts`).
- [ ] **Step 2:** `yarn vitest run tests/core/day.test.ts` and `yarn playwright test tests/e2e/settings-day.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - CoreProvider: inside `refresh`'s `.then`, call `deps.clock.configure({ dayStartHour: s.dayStartHour, overrideDate: s.dayOverride })` **before** `setSettings`/`setVersion`, so pages that reload on the new `version` already see the new date (a `useEffect` would run after the children's loaders). Boot configures the first time (Task 1). `useDayWatch(deps.clock, refresh)`.
  - Settings: two rows after Design (keep them after the existing first combobox; cursor.spec uses `getByRole('combobox').first()`). "Day starts at": `Select` with `00:00`…`12:00`, saves `dayStartHour` (number), with `settings.dayStartHint` as the row hint (the `Row` `hint` prop). The e2e opens the Select (Radix) before counting options. "Start a new day": button (secondary) + hint; disabled when `!deps.clock.canStartNewDay()`; hidden when `dayStartHour === 0`; confirm inline (pattern of the Words delete confirm); Start saves `dayOverride = deps.clock.calendarDate()`.
  - i18n (ru / en): `settings.dayStart` "Начало дня" / "Day starts at"; `settings.dayStartHint` "До этого часа идёт предыдущий день" / "Until this hour it is still the previous day"; `settings.newDay` "Начать новый день" / "Start a new day"; `settings.newDay.confirm` "Начать {date}?" / "Start {date}?"; `settings.newDay.yes` "Начать" / "Start"; `settings.newDay.no` "Отмена" / "Cancel"; `settings.newDay.started` "День уже начался" / "The day has already started".
  - cursor.spec: add a Settings case with `early=1` (enabled button) next to the existing Settings case.
- [ ] **Step 4:** run the new spec, `tests/e2e/cursor.spec.ts`, `yarn vitest run tests/core/i18n.test.ts`, typecheck, lint → PASS.
- [ ] **Step 5: Commit** `feat(settings): day start hour and start a new day`.

### Task 3: Words core: started count and extra new words

**Files:**
- Modify: `src/core/words/queue.ts`, `src/core/words/practice.ts`, `src/core/words/constants.ts` (add `EXTRA_NEW_STEP = 10`), `src/core/db/repos/settings.ts`
- Test: `tests/core/words/queue.test.ts`, `tests/core/words/practice.test.ts` (existing files; add cases)

**Interfaces:**
- Produces:
  - `Settings.wordsExtraNew: { date: ISODate; extra: number } | null` (default null)
  - `extraNewFor(stored: Settings['wordsExtraNew'], today: ISODate): number` (0 when null or another date) in `queue.ts`
  - `practiceQueue(words, today, extraNew = 0)`: `newLimit = max(0, NEW_PER_DAY + extraNew − startedToday)`
  - `canAddNew(words: QueueWord[], today, extraNew): boolean` = startedToday ≥ NEW_PER_DAY + extraNew **and** some word is `ready` and `!state.reviewed`
  - `WordsOverview` gains `started: number` (views with `state.reviewed`, over all words) and `canAddNew: boolean`; `wordsOverview(db, today, extraNew = 0)`
  - `buildPractice(deps, extraNew = 0)`
  - `addExtraNew(db: Db, today: ISODate): Promise<void>` in `practice.ts`: reads settings, writes `wordsExtraNew = { date: today, extra: extraNewFor(...) + 10 }`

- [ ] **Step 1: Write failing tests:**
  - queue: 10 started today + 3 fresh ready → `practiceQueue(..., 0)` has no fresh ids; with `extraNew = 10` it has the 3; `extraNewFor({ date: '2026-11-04', extra: 20 }, '2026-11-05') === 0`; `canAddNew` true for 10 started + 1 fresh ready, false when the only fresh word is `pending`/`failed`, false when 9 started.
  - practice: `wordsOverview` `started` counts reviewed words incl. one whose generation is `failed` but has a review; `addExtraNew` twice on the same day gives extra 20, then on the next day `extraNewFor` → 0.
- [ ] **Step 2:** `yarn vitest run tests/core/words` → FAIL.
- [ ] **Step 3: Implement** the signatures above; callers pass `extraNewFor(settings.wordsExtraNew, today)` (read via `getSettings`).
- [ ] **Step 4:** `yarn vitest run tests/core/words` → PASS; full vitest green.
- [ ] **Step 5: Commit** `feat(words): started count and extra new words per day`.

### Task 4: Words UI: started count and "+10 new words"

**Files:**
- Modify: `src/ui/pages/Words.tsx`, `src/ui/pages/WordsPractice.tsx`, `src/ui/words/PracticeEnd.tsx`, `src/ui/today/WordsLink.tsx`, `src/adapters/preview/fixtures.ts` + `wordsSeed.ts` (state `words-limit`), `src/core/i18n/{ru,en}.ts`
- Test: `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes: Task 3 (`wordsOverview(..., extra)`, `canAddNew`, `started`, `addExtraNew`, `buildPractice(deps, extra)`, `extraNewFor`).
- Produces: preview state `words-limit`, seeded by a separate `seedLimitWords` branch in `buildPreview` from a new `LIMIT_WORDS` list in `wordsSeed.ts` (not `PREVIEW_WORDS`, whose counts the existing words.spec asserts: "1 / 7", "1 / 9"):
  - 10 ready words, each with one counted review today (`correct`, so the next due date is in the future, not due today);
  - 11 ready never-reviewed words (exercises via the same `exercisesOf` shape);
  - its own answers map `LIMIT_WORD_ANSWERS` (exported like `PREVIEW_WORD_ANSWERS`) so the e2e can answer every card.

- [ ] **Step 1: Write failing e2e** in `words.spec.ts`:
  - `?state=words`: header shows "Started: X of Y" with the seeded counts (Y includes the failed word).
  - `?state=words-limit`: Words page shows "+10 new words"; "Start practice" is disabled; click "+10 new words" → practice opens with a new word's first card (choice card).
  - `words-limit` end screen: after "+10", answer all 10 cards (each new word's first card is the choice card; use `LIMIT_WORD_ANSWERS`) → the end screen shows "+10 new words" (20 started, limit 20, 1 fresh word left).
  - "Start practice" when disabled is an `<a aria-disabled>` without `href`: find it with `getByText`, not `getByRole('link')`.
  - `?state=words`: no "+10 new words" button.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Words header: `t('words.started', { x: started, y: total })` after the stage list. "+10" button (secondary) when `canAddNew`: `await addExtraNew(deps.db, today)` then `navigate('/words/practice')`. Every loader that needs the extra (Words page, WordsPractice, WordsLink) reads `getSettings(deps.db)` inside the loader (not `core.settings`, which is stale after `addExtraNew`). WordsPractice passes it to `buildPractice` and `wordsOverview`; `Ended` gains `canAddNew`; PracticeEnd shows "+10 new words" when `canAddNew` (click → `addExtraNew`, then restart like `onContinue`). WordsLink passes the extra. Disable the button while the end-screen action runs. i18n: `words.started` "Начато: {x} из {y}" / "Started: {x} of {y}"; `words.addNew` "+10 новых слов" / "+10 new words".
- [ ] **Step 4:** words.spec, cursor.spec (add `words-limit` Words page case), i18n test (add every new key to both ru and en), typecheck, lint → PASS.
- [ ] **Step 5: Commit** `feat(words): started count and +10 new words button`.

### Task 5: A page per word

**Files:**
- Create: `src/ui/pages/WordPage.tsx`
- Modify: `src/ui/app/routes.tsx` (add `words/:id` after `words/practice`), `src/ui/pages/Words.tsx` (rows link to the page, search in `?q=`; remove inline details), `src/ui/words/WordDetails.tsx` (bottom row with Back, Regenerate disabled while `job.running` (a words job runs; `busy` means the lock is held by a lesson), Delete; `onDeleted` navigates to `/words`), `src/core/i18n/{ru,en}.ts`
- Test: `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes: `loadWordViews`, `WordDetails({ view, onChanged })` (add `onDeleted: () => void` and `backTo: string`), `useWordsJob()` (`version`, `busy`, `active`).
- Produces: route `/words/:id`; `Words` reads/writes the search via `useSearchParams` key `q` (replace history entry while typing).

- [ ] **Step 1: Write failing e2e** in `words.spec.ts` (`?state=words`):
  - click a word → URL `/words/<id>`, heading is the word, fields form and exercises visible, bottom row has "← Back", "Regenerate", "Delete"; top-left ← link (aria-label "Back to words").
  - type "при вет" in search, open a word, press top ← → the list is filtered and the field still holds "при вет"; same with bottom "← Back".
  - Delete → confirm → back on `/words` and the word is gone.
  - `/words/999999` and `/words/abc` → "Word not found" with the ← link.
  - Regenerate on the word page → the page shows "Creating exercises…" and then the exercises again (preview LLM).
  - Update the existing helpers: `row()` and every `getByRole('button', { name: <word> })` / `aria-expanded` use in words.spec.ts (around lines 46, 80, 94, 100, 104) become `getByRole('link', { name: <word> })` and page navigation.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** WordPage: `useParams`, `Number(id)`; not an integer or missing → not-found; reload on `job.version`; shows "Creating exercises…" (existing `words.creating`) when `job.active.has(id)`. Back target = `/words` plus the `q` the list passed via router `state` (`navigate(`/words/${id}`, { state: { q } })`), falling back to `/words`. Top ← is a `Link` with lucide `ArrowLeft`. i18n: `word.back` "← Назад" / "← Back"; `word.backAria` "Назад к словам" / "Back to words"; `word.notFound` "Слово не найдено" / "Word not found".
- [ ] **Step 4:** words.spec, cursor.spec (cases: word page for the first seeded word id, not-found), i18n, typecheck, lint → PASS.
- [ ] **Step 5: Commit** `feat(words): a page per word`.

### Task 6: App icon (assets, setting, Dock command)

**Files:**
- Already in the repo (made with the plan): `src-tauri/icons/source/light.svg`, `src-tauri/icons/source/night.svg` (the SVGs use Alegreya 800 from `node_modules/@fontsource/alegreya`, loaded by a relative `@font-face`)
- Create: `scripts/render-icons.mjs`, `src-tauri/icons/night/icon.png`
- Modify: `src-tauri/icons/*` (regenerated), `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`, `src/core/db/repos/settings.ts`, `src/ui/app/CoreProvider.tsx` (`CoreInit.setAppIcon?`), `src/ui/app/boot.ts`, `src/ui/pages/Settings.tsx`, `src/core/i18n/{ru,en}.ts`, `docs/macos-checklist.md`
- Test: `tests/e2e/settings-icon.spec.ts` (new), `tests/e2e/cursor.spec.ts` if a new state is needed

**Interfaces:**
- Produces: `Settings.appIcon: 'light' | 'night'` (default `'light'`); `CoreInit.setAppIcon?: (night: boolean) => Promise<void>` (Tauri on macOS: `invoke('set_app_icon', { night })`; preview: records the last value on `window.__appIcon` for tests; absent elsewhere); Rust command `set_app_icon(app: AppHandle, night: bool) -> Result<(), String>`.

- [ ] **Step 1: Render the PNGs.** `scripts/render-icons.mjs` (Playwright `chromium`, viewport 1024×1024, `omitBackground: true`) renders each SVG to `src-tauri/icons/source/<name>.png`. Run `node scripts/render-icons.mjs`; then `yarn tauri icon src-tauri/icons/source/light.png`; keep only the files that existed before in `src-tauri/icons/` (delete new `android/`, `ios/`, any extra sizes); copy `source/night.png` to `src-tauri/icons/night/icon.png`. Verify: `file src-tauri/icons/icon.icns src-tauri/icons/night/icon.png` shows a Mac icon and a 1024×1024 PNG; look at `128x128.png`.
- [ ] **Step 2: Write failing e2e** `settings-icon.spec.ts` (preview): Settings shows "App icon" with Light selected; choosing Night sets `window.__appIcon === true` and the Night option is selected; choosing Light sets it to `false`; cursor pointer on both options. No reload assertion (in-memory preview DB). Declare `__appIcon?: boolean` on `Window` in a `declare global` block in `boot.ts`.
- [ ] **Step 3:** run → FAIL.
- [ ] **Step 4: Implement the frontend.** Setting row (Segmented) shown only when `setAppIcon` exists; on change save `appIcon` then `setAppIcon(value === 'night')`. Boot (Tauri) defines `setAppIcon` only when `navigator.userAgent` contains `Mac`. i18n: `settings.appIcon` "Значок приложения" / "App icon"; `settings.appIcon.light` "Светлый" / "Light"; `settings.appIcon.night` "Ночной" / "Night"; `settings.appIconHint` "Ночной значок виден в Dock, пока приложение открыто" / "The Night icon shows in the Dock while the app is open".
- [ ] **Step 5: Implement Rust.**
  - `Cargo.toml`: `[target.'cfg(target_os = "macos")'.dependencies]` `objc2 = "0.6.5"`, `objc2-app-kit = { version = "0.3.2", default-features = false, features = ["std", "NSApplication", "NSResponder", "NSImage"] }`, `objc2-foundation = { version = "0.3.2", default-features = false, features = ["std", "NSData"] }` (the versions already in `Cargo.lock`; Tauri uses the same features).
  - `lib.rs`: `const NIGHT_PNG: &[u8] = include_bytes!("../icons/night/icon.png");` (macOS only). `fn apply_icon(night: bool)` (macOS): `MainThreadMarker::new()` (return if None), `NSApplication::sharedApplication`, Night → `NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(NIGHT_PNG))` and `setApplicationIconImage(Some(..))`; Light → `setApplicationIconImage(None)` (restores the bundle icon). Other OS: no-op.
  - The choice is stored in `app_config_dir()/app_icon.txt` (`night` or `light`). Command `set_app_icon` writes it, then `app.run_on_main_thread(move || apply_icon(night))`. Register in `generate_handler!`.
  - `fn stored_night<R: Runtime>(app: &AppHandle<R>) -> bool` reads `app_icon.txt` (missing/unreadable → false). The command does `std::fs::create_dir_all(config_dir)` before writing.
  - Apply in `setup` (before the window shows): `if stored_night(app.handle()) { apply_icon(true) }` (setup runs on the main thread).
  - Also on Ready, so it wins over Tauri's own dev-mode icon: replace `.run(generate_context!()).expect(..)` with `.build(generate_context!()).expect("error while building tauri application").run(|app, event| { if let tauri::RunEvent::Ready = event { if stored_night(app) { apply_icon(true) } } })`. No capability entry (app command).
  - `apply_icon` imports `objc2::{AllocAnyThread, MainThreadMarker}`, `objc2_app_kit::{NSApplication, NSImage}`, `objc2_foundation::NSData`; `setApplicationIconImage` is `unsafe` → wrap in `unsafe {}`.
  - Step 1 (the PNG) must exist before this compiles (`include_bytes!`).
  - `cargo check` cannot run in this container (GTK missing) and the macOS code would not compile on Linux anyway: read the diff carefully against the objc2 0.6 / objc2-app-kit 0.3 API (`~/.cargo/registry/src/*/tauri-2.12.5/src/app.rs` lines around 2732–2746 use the same calls).
- [ ] **Step 6:** e2e spec, cursor.spec, i18n, typecheck, lint → PASS. Add to `docs/macos-checklist.md` a new section S: Dock shows Night from launch (release and `tauri dev`), switching back to Light restores the bundle icon (in `tauri dev` there is no bundle, so Light may show a generic icon until restart), Finder/Launchpad show Light, the date changes at the start hour with the app open, "Start a new day" before 05:00.
- [ ] **Step 7: Commit** `feat(icon): bamboo EN icon with a Light/Night Dock setting`.

### Task 7: Docs

**Files:** `docs/superpowers/handoff.md` (Words bullet: this round, spec + plan paths, preview states `words-limit`, `early=1`), `docs/superpowers/s1-decisions.md` (Words section: start of day, extra new words, icon).

- [ ] **Step 1:** update both files; full `yarn vitest run`, `yarn typecheck`, `yarn lint`, e2e `words`, `settings-day`, `settings-icon`, `cursor` → PASS.
- [ ] **Step 2: Commit** `docs: words feedback round 1`.
