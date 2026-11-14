# Design: words feedback round 7 (2026-11-14)

Agreed with the learner in chat on 2026-11-14. Binding where it says something; otherwise round 6 (`2026-11-14-words-feedback-6.md`, R1–R9) and the earlier word specs hold.

## Learner's report
1. The voice sounds much worse: on every press it says the word and "other words or noise" (seen on "Pivotal", not tied to one word).
2. On the first start, on Today, the sidebar links did nothing until the app was restarted; only the Today exercises worked.
3. The Words page list flickered (the whole list), roughly while the transcriptions and dictionary were being filled.
4. While the model downloads, the progress ring shows on both speakers of a card at once. Wanted instead: one notification with the download progress, and a notice when it is done.
5. Debug logging is welcome, but the learner cannot open the developer tools in the app.

## What was checked (2026-11-14)
- The app's own Kokoro worker, with the same q8 model and voices, run in Chromium here: "pivotal" is 0.95 s (`bf_emma`) / 1.35 s (`af_heart`) with one block of sound and nothing before or after it; a sentence is clean too. The learner listened to q8 and fp32 samples made this way: both good, no difference, "far from what we had in the app". So the model is fine and stays q8; what reaches the learner's ears in the app is different (playback path, the system voice fallback, or WebKit itself). Not decidable without evidence from the Mac.
- Items 2 and 3 do not reproduce in the browser preview (every sidebar link works in six app states, about 350 ms per click). They happen only in the Mac app.
- Item 4 is by design in round 6 (R2 put the ring on every speaker) and is changed here.
- Decision: no guessed fixes for items 1–3. This round adds the tools that show the cause on the Mac (R1, R2) and changes the download feedback (R3). Items 1–3 are fixed in a follow-up from the learner's log (R4).

## R1. Debug log
- An in-app log of events, kept in `localStorage` so it survives a restart (item 2 needed a restart, and Settings could not be reached before it). It keeps this run and the previous run, at most 1000 entries in all (oldest dropped). Writes are batched (at most once per second, and on `pagehide`), so logging never slows the page. A storage failure (full, blocked) is ignored: the log then lives in memory only.
- Each entry: time (ms since the run started, plus the clock time on the run's first entry), a short kind and a short text. No personal data beyond the words being spoken.
- **Recorded:**
  - Run start: app version, user agent, preview or Tauri.
  - Errors: `window` `error` and `unhandledrejection`, and every `console.error` (passed on to the console as before).
  - Main-thread stalls: a timer every 100 ms; a delay over 200 ms is recorded with its length.
  - Clicks: every `pointerdown` (capture phase) with the element under the pointer (tag, `aria-label` or first 30 characters of text, and whether it is inside the sidebar), the `pointer-events` value of `body`, and whether a dialog is open. Route changes (the new path).
  - Voice engine: status changes (with download percent at most every 10%); each press with its text, spelling variant and path (`kokoro-cached`, `kokoro-wait`, `system-not-ready`, `system-fallback`); each Kokoro clip played (samples, rate, length in seconds, and a 20-character loudness outline like `.....#####...`); each stop; whether the system voice was speaking (`speechSynthesis.speaking`) or another clip was still playing when a clip started; when a clip ends.
  - System voice: the voice picked (name and language) and the text, on each system-voice press.
  - Words page: fill start, each progress step, end (with result); each list reload of the Words page.
- **Settings** gets a section "Журнал отладки" / "Debug log" at the bottom, with:
  - "Скопировать журнал" / "Copy log": copies the whole log as plain text (one entry per line, the previous run first under a header line) and shows "Скопировано" / "Copied" for 2 s (same pattern as `useSavedFlag`). When the clipboard is refused, the text area below opens with the text selected and a line "Выделите текст и скопируйте" / "Select the text and copy it".
  - "Показать журнал" / "Show log": a read-only text area with the same text.
  - "Очистить" / "Clear": empties the log.
  - A line with the number of entries.
- **Keyboard**: Cmd+Shift+L (Ctrl+Shift+L off the Mac) copies the log from any page, with a short notification "Журнал скопирован" / "Log copied" (or the clipboard error), so it works even when the sidebar does not.
- All new strings in `src/core/i18n/{ru,en}.ts`; no em dash; no "again/снова/опять"; no emoji. Buttons follow the cursor rule; `tests/e2e/cursor.spec.ts` covers the new Settings controls.

## R2. Developer tools in the app build
- The `tauri` crate gets the `devtools` Cargo feature, so the installed app has the Web Inspector: right-click, "Inspect Element". (On macOS this uses a private WebKit API; fine for this personal app, it is not sold in the App Store.)
- The Mac checklist gets a step: right-click in the app, "Inspect Element" opens, the Console shows no CSP errors.

## R3. Voice download notification
- The progress rings on the speaker buttons are removed (`VoiceRing`, its `aria-label` key and the per-card `useVoiceDownload` re-render).
- One notification (the app's existing `sonner` `Toaster`, bottom right) appears only when voice files are actually being downloaded (not when they are already on disk):
  - While downloading: "Загрузка голоса: N%" / "Downloading the voice: N%", updated at most once per whole percent; it stays until the download ends (no auto-close, no close needed).
  - On success: the same notification turns into "Голос загружен" / "Voice downloaded" and closes after 4 s.
  - On failure: "Не удалось загрузить голос: <message>. Пока звучит системный голос." / "Could not download the voice: <message>. The system voice is used for now." Closes after 8 s. The next press tries the download as now (round 6 R2).
- The speakers stay pressable during the download (system voice, as now).
- The notification host is one component in `AppShell` subscribing to the voice engine; the engine tells it whether files are being fetched (a new `downloading` status is entered only when some file is missing).
- The preview's `?voice=downloading` keeps working for e2e (it shows the notification at 40%); a new `?voice=downloaded` shows the success notification.

## R4. Follow-up (not in this round)
- The learner uses the app with R1–R3, reproduces items 1–3 if they happen, and sends the copied log. Items 1–3 are then fixed from that evidence in a new round.

## Tests
- Vitest: the log store (cap of 1000, two runs kept, previous run read back after a "restart", storage failure ignored, batching); the stall detector (fake timers); the click entry text; the engine's log entries per press path and the clip outline; the download notification decisions (shown only when files are missing, percent steps, success and failure texts).
- E2E (preview): Settings debug log section (show, copy with "Copied", clear, count); Cmd/Ctrl+Shift+L notification; the download notification with `?voice=downloading` and `?voice=downloaded`; no ring on the speakers; cursor spec for the new controls.
- Mac checklist: R2 step; download notification on a fresh voice folder; the log after a few presses shows the voice path and clip outline.
