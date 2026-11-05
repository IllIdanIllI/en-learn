# Design: words feedback round 1, start of day, app icon (2026-11-05)

Changes agreed with the learner in chat on 2026-11-05 after trying the Words feature. Binding where it says something; otherwise `2026-11-04-words-design.md` (V1–V11) and the earlier specs hold. Stages, the choice card and the 2-days rule stay as they are (V4, V5).

## F1. Started count (Words page)
- The Words header gains "Начато: 10 из 87" / "Started: 10 of 87": words with at least one counted review (`state.reviewed`) out of **all** words (including words whose exercises are pending or failed). `WordsOverview` gains a `started` field.
- The stage counts and "Due today" stay as they are.

## F2. A page per word
- A click on a list row opens a new route `/words/:id`, replacing the inline details (V9).
- Top left: a ← arrow back to the Words page.
- Content as in V9 details: the fields form with its own Save (above the exercises, as now), and the exercises editable per item.
- The page reloads when a words job finishes (`job.version`). While the word's exercises are being generated it shows the status (as the list does), and "Regenerate" is disabled while a words job runs.
- A bottom row: "← Назад" / "← Back", "Создать заново" / "Regenerate", "Удалить" / "Delete" (inline confirmation as now; after deleting, back to the Words page).
- The search text lives in the URL (`/words?q=…`), so ← and "← Back" return to the same filtered list. Open add/import panels and the scroll position are not kept.
- Both back controls (top ← and bottom "← Назад" / "← Back") are intended (learner's choice). The existing `words.back` key ("К словам") is not reused for them.
- An unknown or non-numeric id shows "Слово не найдено" / "Word not found" with the back arrow.
- Pointer cursor on every clickable element; `tests/e2e/cursor.spec.ts` gets cases for the word page (a seeded preview word id) and the not-found state.

## F3. "+10 new words"
- A button "+10 новых слов" / "+10 new words" on the practice end screen and on the Words page.
- **Today's limit** = 10 + today's extra. The extra is stored in the settings table as `words_extra_new` = `{ date, extra }`; a stored date other than today counts as 0, so it resets the next day. `practiceQueue` takes the extra as a parameter.
- **Shown** only when the limit is used up (words started today ≥ today's limit, "started today" = first counted review today, as now) **and** at least one word is `ready` and never reviewed.
- **A click** adds 10 to today's extra and starts a practice (the usual queue: due words first, then new words). Repeated clicks add 10 each. Leaving the practice early keeps the raised limit.
- **End screen:** "+10 new words" sits next to "Continue · 20 more" when both apply (due words left and the new limit used up).
- After a click, the Today link count (due + new allowed today) includes the extra words. Intended.
- Disabled (`not-allowed`) while a practice answer is being checked; a running generation job does not block it.

## F4. Start of the day
- **Setting** "Начало дня" / "Day starts at": whole hours 00:00 to 12:00 inclusive, default **05:00**. Stored as `day_start_hour` (number) in the settings table.
- **The app's date** ("today") = max(**rule date**, **override date**):
  - rule date = the local calendar date of (now − start hour), computed in local time (on a DST change day the shift follows the local clock);
  - override date = set by "Start a new day" (below); empty by default.
  - Before 05:00 on 5 Nov it is still 4 Nov.
- **How the clock gets it:** the Clock port stays synchronous. The Tauri clock (and the test and preview clocks) gain a `configure({ dayStartHour, overrideDate })`. Boot calls it after reading the settings, and saving either setting calls it at once, so no reload is needed.
- **Day change while the app is open:** the app re-checks its date every minute and when the window gets focus. When the date changes, the open page reloads its data (Today, Words, the garden).
- It applies everywhere the app uses today's date (`clock.today()`): lessons, words, the garden and moon phase, the streak, the weekday plan, review dates. Stored timestamps (`now()`) stay real time.
- **Existing data is not re-dated.** Anything stored before the update keeps its calendar date. (Only rows written between midnight and the start hour on the update day could look one day ahead; this resolves itself after the start hour.)
- **A lesson open across the start hour** behaves as it does across midnight today: the unfinished session of the old date is offered through the existing "earlier session" path and stays solvable and gradable.
- **"Начать новый день" / "Start a new day"** button in Settings:
  - enabled only while the app's date is behind the calendar date (that is, before the start hour); otherwise disabled with `not-allowed` and a hint "День уже начался" / "The day has already started"; hidden when the start hour is 00:00;
  - asks for inline confirmation, "Начать <date>?" / "Start <date>?";
  - stores `day_override` = the calendar date. Because today = max(rule date, override date), the override stops mattering by itself once the rule date reaches it (after the next start hour), and changing the start hour later stays consistent.
- Later (not now): the learner's idea of a "smart" start of day based on a gap in activity.

## F5. App icon
- New icon: "EN" (Alegreya Black) partly hidden in bamboo, with a gap between the composition and the tile edge. Two versions:
  - **Светлый / Light** (default): dark ink "EN" on cream;
  - **Ночной / Night**: gold "EN" on evergreen.
- The bundled icon (`.icns`, `.ico`, PNGs, made with `tauri icon` from a 1024 px master) is **Light**. Finder, Launchpad and the Dock while the app is closed always show it.
- **Setting** "Значок приложения" / "App icon": Light / Night (macOS only; the row is hidden on other platforms, where the command is a no-op).
- **How it works (macOS):**
  - The Night icon is a 1024 px PNG embedded in the binary (`include_bytes!`, `src-tauri/icons/night/icon.png`).
  - A Rust command `set_app_icon(night: bool)` sets the Dock icon with `NSApplication.setApplicationIconImage` on the main thread (as Tauri itself does in dev) and writes the choice to a small file in the app config folder.
  - At start, Rust `setup` reads that file and applies Night before the window shows, so there is no Light flash.
  - Changing the setting calls the command at once.
  - New direct dependencies, macOS only: `objc2` and `objc2-app-kit`, pinned to the versions already in `Cargo.lock`. The command is an app command in `generate_handler!`; it needs no capability entry, and CSP is unaffected.
- The SVG sources of both versions are kept in the repo next to the icons.
- Not in scope: a macOS 26 `.icon` (Liquid Glass) with automatic dark/light variants.

## F6. Testing
- Vitest: today's date with the start hour (before/after the hour, midnight, 00:00 and 12:00 settings), the override (max rule; it stops mattering after the next start hour; the start hour changed while it is set), the new-word limit with an extra (today and a stale date), the "+10" visibility rule, the started count.
- E2E: the word page (open, back with the search kept, regenerate, delete, unknown id); "+10 new words" on the end screen and the Words page; the Settings rows (start hour, Start a new day enabled/disabled/hidden, app icon); pointer cursor cases for the word page, the not-found state and Settings.
- Mac checklist: the Dock icon switches between Light and Night, and Night is shown from launch without a flash; the bundled icon in Finder; the date changes at the start hour with the app open.
