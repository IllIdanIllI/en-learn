# Design: words feedback round 6 (2026-11-14)

Agreed with the learner in chat on 2026-11-13/14. Binding where it says something; otherwise `2026-11-12-words-skyeng-flow.md` (S1–S6), `2026-11-12-words-feedback-4.md` (K1–K7) and the earlier word specs hold. Round 6 item 4 (the `build` letter exercise) was praise: `build` is not changed.

## Why
The learner relies on the word card: it must show the transcription, sound natural, and give translations they can trust. Editing a word must be quick from a training and confirm that it saved, and the word list must be searchable from the keyboard.

## Approaches (picked in chat)
- **Voice**: Kokoro (open, Apache-2.0, 82M-parameter neural voice) run inside the app's web view with `kokoro-js` (picked) vs. native Rust + ONNX (faster, much more code, hard pronunciation step). Also considered and dropped: real dictionary recordings (single words only, not every word), macOS Premium voices (native code, the learner downloads voices), unofficial Google/Edge endpoints (can break). The model is downloaded on first use (picked) rather than bundled.
- **Translation trust**: online Wiktionary lookup per word through kaikki.org, stored with the word (picked) vs. a built-in Wiktionary table (offline, build step, stale data). A second AI check was dropped: an AI cannot verify an AI.
- **Edit from a training**: a side panel over the training (picked) vs. leaving for the word page and restoring the training.
- **Search**: Words page only (picked), not app-wide.

## R1. Transcription fill that works and is visible
- Cause found: the start-up fill reuses the full `words` call (all exercises for 5 words, just to read two fields) and swallows every failure (failed call, busy lock, reply without the fields), retrying only on the next app start.
- New AI call kind **`phonetics`** (`prompts/phonetics.md` + `phonetics.schema.json`, bundled like the others, overridable in the prompts folder, listed in Settings with model `claude-sonnet-5-5`, effort `low`). Input: up to 20 words (`### <word>` sections, with the definition as a sense hint). Output: `{ words: [{ word, transcription, partOfSpeech }] }`, one entry per word, `word` copied exactly. Transcription is IPA between slashes in the learner's spelling variant's pronunciation (British: Received Pronunciation; American: General American); part of speech as in S5.
- `generatePhonetics` uses this call instead of `words`; it still writes only empty fields and touches nothing else (S5). The `words` prompt also gets the British/American pronunciation line.
- **When**: on each visit of the Words page when no fill run or generation is going and some ready word has an empty transcription (not once per app run any more). A word whose reply came back with an empty transcription is not asked about again in this app run.
- **Visible**: while it runs the Words page shows "Добавляю транскрипции: X из Y" / "Adding transcriptions: X of Y" (aria-live, like the generation progress; it does not lock Regenerate or the trainings). A failure shows a notice "Не удалось добавить транскрипции: <message>" / "Could not add transcriptions: <message>" with a "Повторить" / "Retry" button. A busy lock is not a failure: the run stops quietly and starts at the next visit.

## R2. Kokoro voice
- The speaker buttons (S4) speak through Kokoro: `kokoro-js` (pinned version), model `onnx-community/Kokoro-82M-v1.0-ONNX`, quantised `q8` (about 90 MB; the size is measured on the Mac and written in the checklist), on the CPU (WASM) in a Web Worker so the page never freezes. Voice by spelling setting: British `bf_emma`, American `af_heart` (to confirm by ear on the Mac; constants in one place).
- **Download on first use**: the first press of a speaker starts the download and plays that text with the system voice (S5 behaviour) meanwhile. While downloading, the speaker buttons show a small progress ring / percent (`aria-label` "Загрузка голоса: N%" / "Loading voice: N%") and stay pressable (system voice). The model is stored in the app's data folder so it survives restarts and works offline afterwards; a failed or interrupted download leaves nothing half-used and is tried at the next press, while the system voice keeps working. How the files get there is fixed in R9.
- Generated audio is kept in memory per app run (key: voice + text), so a second press plays at once. Pressing while something plays stops it and plays the new text; a card that goes away stops its sound (as now).
- When Kokoro cannot run (no WASM, model failed to load) the system voice is used; when neither exists the buttons are hidden (as now).
- Licences (Apache-2.0 model and library; the GPL espeak-ng phonemiser that `kokoro-js` pulls in) are listed in the handoff; acceptable for this personal app.

## R3. Translations checked against a dictionary
- **Prompt**: `translation` becomes "the main general sense first, then up to two more common translations, comma-separated, most common first (e.g. `утверждение, заявление`); no rare, figurative or narrow senses unless the word has no other". It is still written only when the learner left the field empty; saved translations are not rewritten.
- **Lookup**: for each ready word the app fetches its Russian translations from Wiktionary through kaikki.org (the per-word English entry; exact URL and JSON shape checked on the Mac before the parser is finalised) and stores them on the word: `dict_translations` (JSON array of strings, sense order kept, duplicates removed, at most 8) and `dict_checked` (`''` = not yet, `'found'`, `'none'` = no entry or no Russian translations). New migration, defaults `'[]'` and `''`. Only with the app language Russian (`nativeLanguage = 'ru'`); with English nothing is fetched or shown.
- **When**: in the same Words-page fill run as R1 (after the phonetics part, same visibility and Retry), for ready words with `dict_checked = ''`, and right after a word's exercises are generated. A network failure leaves `dict_checked = ''` (tried at the next visit) and is shown like an R1 failure. Changing the word's spelling (the word itself) on the word page resets `dict_checked` to `''`.
- **Shown** on the word card (S4) and the word page: under the translation, a muted line "Словарь: утверждение, заявление, …" with a link "Wiktionary" to the entry. When the dictionary has translations and none of the AI's/learner's comma-separated translations matches one of them (case-insensitive, trimmed, ё = е), a warning line "Перевода нет в словаре, проверьте" with a lucide `AlertTriangle` icon (no emoji). `'none'` shows nothing.
- The check never changes the translation; the learner fixes it through R7 or the word page.

## R5. Search on the Words page
- The existing search field gets a lucide `Search` icon inside it, at the start (decorative, `aria-hidden`).
- **Cmd+F** (Ctrl+F on other systems) while the Words page is open focuses the field and selects its text, and the browser's own find is prevented. Not active on other pages.

## R6. Saved confirmation
- After a successful save of the word form (word page and R7 panel) and of an exercise, a "Сохранено" / "Saved" text with a lucide `Check` icon shows next to that Save button (`role="status"`), until that form changes or 3 s pass. On the Add-word form the form already closes; no change there. Errors stay as they are.

## R7. Edit the word from a training
- The word card (S4, before the answer) and the answer view (feedback) get a ghost button "Изменить слово" / "Edit word" with a lucide `Pencil` icon.
- It opens a right-side **modal** panel (the existing `Sheet`; unlike the rule panel it is modal) with the word's page content: the word as a title, the word form, exercises, Regenerate and Delete; no Back link. It closes with its close button, Esc or a click outside; focus returns to the Edit button.
- While it is open the training does not react to keys (letters, Enter, Backspace on tiles and inputs).
- After it closes, the current card shows the saved fields at once (word, translation, transcription, definition, example, dictionary line). Changed or regenerated **exercises** apply from the next training; the cards already planned stay.
- **Delete** in the panel works like Remove on the word card: the word's remaining tests leave the training and the panel closes.

## R8. Testing
- Vitest: phonetics prompt input and reply check; `generatePhonetics` uses the `phonetics` kind and writes only empty fields; the Words-page run trigger (missing words, not while running, empty reply not repeated); kaikki reply parser (Russian translations only, order, dedupe, max 8, no entry → none) with a recorded sample; the match rule (comma list, case, ё/е); migration and repo fields; `dict_checked` reset on a word rename; voice choice by spelling; audio cache key; fallback to system voice when Kokoro fails.
- E2E: transcription line on the word card; the fill progress and failure notice with Retry (preview LLM stubbed); dictionary line and warning on the word card (preview data); search icon and Cmd+F focus; "Сохранено" after saving a word and an exercise; Edit word opens the panel from the word card and from the answer view, keys do not reach the card while open, a saved translation shows on the card after closing, Delete removes the word's tests. Speaker press with Kokoro stubbed in preview (no real model in tests).
- cursor.spec: Edit word, the panel's buttons, Retry — `pointer`.
- Not testable here: real Kokoro, WASM under the Tauri CSP, the downloads, real kaikki replies (the sandbox cannot reach those hosts; the e2e server's CSP is not Tauri's). They go on the Mac checklist.
- Mac checklist: no CSP violations in the console; WKWebView WASM speed (go/no-go for R2); Kokoro download size, time to first sound, voices by ear, offline after download; kaikki lookup for "assertion" and a phrase; transcriptions filled after one Words-page visit.

## R9. Builder decisions (from the spec review)
- **Order of work**: R1, R5, R6, R7, R3, R2. R2 carries the platform risk and may slip without blocking the rest.
- **Network goes through Rust**: one Tauri command family in `src-tauri` (using `reqwest`, added as a direct dependency). Requests are made one at a time, with a generic User-Agent `en-learn`, and only to allowlisted hosts. The web view never fetches external hosts, so the CSP `connect-src` stays as is.
  - `fetch_text(url)`: host allowlist `kaikki.org`.
  - `download_file(url, dest, expected_size)`: host allowlist `huggingface.co` (redirects followed). It streams to `<dest>.part`, emits progress events, checks the final size, then renames. Any failure deletes the `.part`.
  - In TS this is a `Net` port in `deps` (Tauri adapter, preview stub, test fake).
- **Kokoro wiring**:
  - `kokoro-js` and its ONNX runtime are pinned exact and loaded by dynamic `import()` inside a Vite-bundled module worker (`new Worker(new URL(...), { type: 'module' })`).
  - The ORT and phonemiser `.wasm` files ship as local assets (`wasmPaths`), with `numThreads = 1` (no cross-origin isolation in WKWebView).
  - Model and voice files live in `<appDataDir>/voice/`. The main thread reads them with plugin-fs and hands the bytes to the worker. Transformers.js runs with `allowRemoteModels = false` and a custom cache that serves those bytes.
  - CSP and devCsp gain `'wasm-unsafe-eval'` in `script-src` and `worker-src 'self' blob:`. plugin-fs scope covers `$APPDATA/voice/**`.
  - Playback uses an `AudioContext` from the PCM the worker returns, so no `media-src` is needed.
  - A `VoiceEngine` port (`status`, `progress`, `speak(text, variant)`, `stop()`) sits behind `speech.ts`. A shared voice context holds the download progress for every speaker button.
  - Each `speak` gets an id. A newer press or `stop` cancels or ignores older results, and the system-voice fallback started during a download is not followed by Kokoro audio for the same press.
- **R1 run state**:
  - The provider gets a separate fill state: `fill: {done,total}|null`, `fillError`, `retryFill()`. It does not touch `progress`/`running`, so Regenerate and the trainings stay free.
  - Trigger: the Words page mount effect, plus Retry. It is guarded by `looping` against StrictMode double mounts. The "empty reply, not asked again this run" set is a ref in the provider.
  - The once-per-run `phoneticsStarted` guard is removed, and a busy lock no longer clears pending fill work in a way that blocks the next visit.
  - Progress total = words needing phonetics + words needing a dictionary lookup. Only the phonetics step takes the LLM job lock; the dictionary step does not. With the app in English, only phonetics runs.
- **New LLM kind `phonetics`** is added in: `LlmKind` (`src/core/domain.ts`), `DEFAULT_SETTINGS.models/efforts`, `bundledPrompts.ts`, Settings `KINDS`, the i18n kind labels (ru/en), and the preview LLM switch. It has its own reply check: every requested word exactly once. It does not use `checkWordsReply` or `wordProblems`.
- **DB**:
  - Migration 0008 adds `dict_translations TEXT NOT NULL DEFAULT '[]'` and `dict_checked TEXT NOT NULL DEFAULT ''`, plus the `Word` type, row mapping and preview seed.
  - Dictionary results are written only by a separate repo function `setDict(id, translations, checked)`. `updateWord` leaves the two fields alone, except that it resets them to `'[]'`/`''` when the stored `word` text changes (a test proves phonetics and exercise writes keep them).
- **kaikki endpoint**: the first R3 task is a probe that fetches the per-word English entry for "assertion" and for a phrase ("give up") and commits the two replies as test fixtures. The parser is written against them. If kaikki has no usable per-word endpoint, R3 stops and comes back to the learner. Phrases are looked up like single words; no entry means `'none'`, so nothing is shown.
- **Match rule**: split the shown translation on commas. Normalise each item and each dictionary translation: trim, lowercase, `ё`→`е`, drop parenthesised parts and trailing punctuation. A match is equality of a whole item, not a substring. An empty translation shows no warning. The dictionary line and the warning show only with the app in Russian, so `en.ts` needs only the R1 notice, Retry and progress strings.
- **R7 mechanics**:
  - The panel body is extracted from `WordPage.tsx`/`WordDetails` into a component with `onClose`/`onDeleted` instead of routing; the word page uses the same component.
  - `WordsPractice` gets a `paused` flag while the panel is open, and every training key handler returns early when paused.
  - On close, the current word is reloaded by id from the DB into the training's word map (the planned cards are kept).
  - Delete calls the same path as Remove (`dropWord`), with a unit test.
- **R6**: "changes" means any edit of that form's fields. The timer is cleared on unmount. The status is per exercise.
- **R5**: the listener is registered only while the Words page is mounted and does nothing while a dialog is open.
