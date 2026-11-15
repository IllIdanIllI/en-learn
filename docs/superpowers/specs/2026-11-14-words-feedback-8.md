# Design: words feedback round 8 (2026-11-14)

Agreed with the learner in chat on 2026-11-14. Binding where it says something; otherwise round 7 (`2026-11-14-words-feedback-7.md`) and round 6 hold.

## Evidence (the learner's first debug log, Mac app)
- The voice files were already on disk (no download). The first press set the status to `loading`, and it stayed `loading` for over two minutes: no `ready`, no `error`. Every press used the system voice. Kokoro hangs somewhere between reading the model files and the model starting in the worker; the log does not say where.
- The system voice picked for `en-US` was **Flo**, a low-quality macOS "Eloquence" voice: our code takes the first voice whose language matches. This is the "much worse" sound.
- Cmd+Shift+L never reaches the page (a Console `keydown` listener printed nothing); macOS takes it (the system Services shortcut).
- The sidebar worked in that run, no stall over 200 ms was logged, and the Words list reloaded only on entry. Items 2 and 3 of round 7 still wait for a log of a run where they happen.
- Click lines read `click click a "…"`: the kind and the text both start with `click`.

## R1. Step log for the voice start
- The engine logs each start step (kind `voice`): `load read <path> <bytes>B <ms>ms` per file, `load worker created`, `load init sent`.
- The worker reports its own steps to the page as `{ type: 'log', text }` messages, logged as `worker <text>`: `started`, `init <n> files`, `fetch <path> <bytes>B` (or `fetch <path> 404`) for each file the model loader asks for, `model loading`, `model loaded <ms>ms`.
- A worker `error` event logs its message, file and line; a `messageerror` event is logged too.

## R2. Start time limit
- The download has no time limit (round 6/7 behaviour, with the progress notification).
- From the moment the files are on disk (status `loading`) Kokoro gets **20 seconds** to report ready. After that the engine gives up for this run: the worker is terminated, the status becomes `failed` with the reason `start timed out after 20 s at: <last step>`, and that line is logged.
- The system voice plays at once on every press while Kokoro starts, as now; nobody waits for the 20 s.
- After a start failure or a time-out, presses do **not** start Kokoro again in this run (unlike a failed download, which a press retries as now). Only the Settings Retry button (R3) or the next app start tries again.

## R3. Voice status in Settings
- Settings gets a row "Голос" / "Voice" (before the debug log section) showing the engine status, live:
  - idle: "Загрузится при первом нажатии на динамик" / "Loads at the first speaker press"
  - downloading: "Загрузка: N%" / "Downloading: N%"
  - loading: "Запускается" / "Starting"
  - ready: "Готов" / "Ready"
  - failed: "Не работает: <reason>. Звучит системный голос." / "Not working: <reason>. The system voice is used."
- Under it, the system voice that would be used for the learner's spelling variant: "Системный голос: <name> (<lang>)" / "System voice: <name> (<lang>)", or "Системный голос: по умолчанию" / "System voice: default" when none matches.
- When failed, a "Повторить" / "Retry" button starts the voice again (download if files are missing, otherwise start), with the same notification and time limit.
- Without the Kokoro engine (browser preview without `?voice=`) the row shows only the system voice line.

## R4. Better system voice
- Among the voices whose language matches the spelling variant: the browser's default voice if it matches; else drop the macOS Eloquence and novelty voices (name before " (": Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley, Albert, Bad News, Bahh, Bells, Boing, Bubbles, Cellos, Fred, Good News, Jester, Junior, Kathy, Organ, Ralph, Superstar, Trinoids, Whisper, Wobble, Zarvox); then prefer a name containing "Premium", then "Enhanced", then the preferred names in order (en-US: Samantha, Alex, Ava, Allison, Susan, Tom, Nicky; en-GB: Daniel, Serena, Kate, Oliver, Stephanie); else the first remaining; else no voice set (the browser picks by language).
- One function decides this; speech and Settings (R3) use it.

## R5. Log fixes
- The copy shortcut becomes **Cmd+Option+L** on the Mac and **Ctrl+Alt+L** elsewhere, matched by `e.code === 'KeyL'` (Option changes `e.key` on the Mac). The Mac checklist, handoff and any UI hint follow.
- Click lines lose the doubled word: `click a "Settings" sidebar …` (the text no longer starts with `click`; same for `click-done`).

## Tests
- Vitest: the voice choice function (default wins; Flo and Bells dropped; Premium over Enhanced over named; preferred order per variant; nothing matching → none); the engine start time limit with fake timers (time-out after 20 s in `loading` → `failed` with the last step in the reason, worker terminated, a later press does not start it, Retry does; the download time does not count); the worker step lines reaching the log; the shortcut matcher with `code`.
- E2E (preview): Settings shows the voice row with the preview statuses (`?voice=ok` → Ready, `?voice=downloading` → Downloading: 40%, a new `?voice=failed` → Not working with Retry) and the system voice line; cursor case for Retry.
- Mac checklist: the log after a press shows the start steps up to `ready` or the time-out line; Settings shows the status; Cmd+Option+L copies.
