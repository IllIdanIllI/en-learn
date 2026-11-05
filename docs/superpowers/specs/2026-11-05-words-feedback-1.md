# Design: words feedback round 1, start of day, app icon (2026-11-05)

Changes agreed with the learner in chat on 2026-11-05 after trying the Words feature. Binding where it says something; otherwise `2026-11-04-words-design.md` (V1–V11) and the earlier specs hold. Stages, the choice card and the 2-days rule stay as they are (V4, V5).

## F1. Started count (Words page)
- The Words header gains "Начато: 10 из 87" / "Started: 10 of 87": words with at least one review (counted or not) out of all words.
- The stage counts and "Due today" stay as they are.

## F2. A page per word
- A click on a list row opens a new route `/words/:id`, replacing the inline details (V9).
- Top left: a ← arrow back to the Words page.
- Content as in V9 details: the fields form with its own Save, and the exercises editable per item.
- A bottom row: "← Назад" / "← Back", "Создать заново" / "Regenerate", "Удалить" / "Delete" (inline confirmation as now; after deleting, back to the Words page).
- An unknown id shows "Слово не найдено" / "Word not found" with the back arrow.
- Pointer cursor on every clickable element; `tests/e2e/cursor.spec.ts` gets a case for the word page.

## F3. "+10 new words"
- A button "+10 новых слов" / "+10 new words" on the practice end screen and on the Words page.
- Shown only when today's new-word limit is used up and words that were never reviewed and have exercises remain.
- A click raises today's limit by 10 (stored per date, so it resets the next day) and starts a practice.
- Repeated clicks add 10 each.

## F4. Start of the day
- **Setting** "Начало дня" / "Day starts at": an hour from 00:00 to 12:00, default **05:00**.
- The app's date ("today") is the local calendar date of (now − that hour). Before 05:00 on 5 Nov it is still 4 Nov.
- It applies everywhere the app uses today's date: lessons, words, the garden, the streak, review dates. Stored timestamps stay real time.
- **"Начать новый день" / "Start a new day"** button in Settings:
  - enabled only while the app's date is behind the calendar date (that is, before the start hour); otherwise disabled with `not-allowed` and a hint "День уже начался" / "The day has already started";
  - asks for inline confirmation, "Начать <date>?" / "Start <date>?";
  - moves the app's date to the calendar date at once. It applies once; the next day the hour rule works as usual.
- Later (not now): the learner's idea of a "smart" start of day based on a gap in activity.

## F5. App icon
- New icon: "EN" (Alegreya Black) partly hidden in bamboo, with a gap between the composition and the tile edge. Two versions:
  - **Светлый / Light** (default): dark ink "EN" on cream;
  - **Ночной / Night**: gold "EN" on evergreen.
- The bundled icon (`.icns`, `.ico`, PNGs, made with `tauri icon` from a 1024 px master) is **Light**. Finder, Launchpad and the Dock while the app is closed always show it.
- **Setting** "Значок приложения" / "App icon": Light / Night. With Night, the app sets its Dock icon on start and when the setting changes (macOS, `NSApplication.setApplicationIconImage`, as Tauri itself does in dev). Other platforms keep the bundled icon.
- The SVG sources of both versions are kept in the repo next to the icons.
- Not in scope: a macOS 26 `.icon` (Liquid Glass) with automatic dark/light variants.

## F6. Testing
- Vitest: today's date with the start hour (before/after the hour, midnight, 00:00 setting), the "Start a new day" override and its expiry, the new-word limit with extra words, the started count.
- E2E: the word page (open, back, regenerate, delete, unknown id); "+10 new words" on the end screen and the Words page; the Settings rows (start hour, Start a new day enabled/disabled, app icon); pointer cursor cases.
- Mac checklist: the Dock icon switches between Light and Night; the bundled icon in Finder.
