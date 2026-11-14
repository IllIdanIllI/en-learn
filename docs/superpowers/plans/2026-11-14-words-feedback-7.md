# Words feedback round 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the learner the tools to show us, from the Mac app, why the voice adds noise, the sidebar freezes and the Words list flickers (a persistent debug log, devtools), and replace the speaker rings with one download notification.

**Architecture:** A pure log store in `src/core/debug/` (injected storage, testable in node) behind a UI singleton `logDebug(kind, text)`. Capture hooks (errors, console.error, stalls, clicks, routes) are installed once in `main.tsx`; the voice engine gets an injected `log` dep; the words job and Words page call `logDebug` directly. The download notification is decided by a pure function and shown by one host component in `AppShell` through the existing `sonner` `Toaster`.

**Tech Stack:** React 19/TS, Tailwind, `sonner` (already installed, `Toaster` in `AppShell`), Vitest (node env, `tests/**/*.test.ts`), Playwright e2e on the Vite preview, Tauri 2 (`tauri` crate feature `devtools`).

**Spec:** `docs/superpowers/specs/2026-11-14-words-feedback-7.md` (R1–R4). R4 is not implemented here.

## Global Constraints

- UI strings only in `src/core/i18n/{ru,en}.ts` (both files, same keys); no em dash; no "again"/"снова"/"опять"; no emoji in the UI. Log contents (entry texts, run headers) are English and not translated.
- Every interactive element `cursor: pointer`, disabled `not-allowed`; `label[for]` keeps the default cursor; new clickable things get a `tests/e2e/cursor.spec.ts` case.
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`.
- Commits end with exactly these two trailers, and **do not substitute your own model name**:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY
  ```
- Push after each commit: `git push -u origin claude/admiring-edison-vmhgdm`.
- Checks per task: `yarn typecheck`, `yarn lint`, `yarn vitest run <touched tests>`, touched e2e specs with `yarn playwright test <spec> --trace off`.
- Rust cannot be compiled in this container. The only Rust change is the Cargo feature in Task 2; it is listed for the Mac check.
- Pinned values from the spec: log cap **1000** entries over two runs; flush at most once per **1000 ms** and on `pagehide`; stall timer every **100 ms**, recorded when the delay is over **200 ms**; voice status percent logged at most every **10%**; clip outline **20** characters, `#` when the cell's peak `> 0.02`, else `.`; click text first **30** characters; "Copied" shown **2 s**; success notification closes after **4 s**, failure after **8 s**; shortcut Cmd+Shift+L (Mac), Ctrl+Shift+L elsewhere.
- Storage key for the log: `en-learn.debugLog`. Toast id: `voice-download`.

## Review Focus

1. **localStorage throws or is full** (WKWebView private mode, quota). Logging must go on in memory and never throw into the caller. Test in Task 1.
2. **console.error wrapped twice** (StrictMode, HMR re-running `main.tsx`). Each error must be logged once and still reach the console. Test in Task 1 (`installDebugCapture` is idempotent).
3. **The shortcut pressed while focus is in a text field, or with Alt.** Cmd+Shift+L copies; Cmd+L or Cmd+Alt+Shift+L do nothing. Test in Task 2.
4. **Voice files already on disk at start.** No download notification at all, the engine goes `idle → loading → ready`. Test in Task 4.
5. **Download fails after some progress.** The loading notification turns into the failure text (not a second notification), and the next press can show a new progress notification. Test in Task 4.

---

### Task 1: Log store and capture

**Files:**
- Create: `src/core/debug/log.ts`, `src/ui/debug/debugLog.ts`, `src/ui/debug/capture.ts`
- Modify: `src/ui/main.tsx` (install before `boot()`), `src/ui/app/boot.ts` (run line), `src/ui/app/AppShell.tsx` (route entry)
- Test: `tests/core/debugLog.test.ts`, `tests/ui/debugCapture.test.ts`

**Interfaces:**
- Produces (`src/core/debug/log.ts`):
  - `interface LogEntry { t: number; kind: string; text: string }` (`t` = ms since this run's start, rounded).
  - `interface LogStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }`
  - `interface DebugLog { add(kind: string, text: string): void; entries(): { previous: LogEntry[]; current: LogEntry[] }; count(): number; text(): string; clear(): void; flush(): void }`
  - `createDebugLog(opts: { storage: LogStorage | null; now: () => number; wallClock: () => string; cap?: number }): DebugLog` (cap default 1000).
  - `const LOG_KEY = 'en-learn.debugLog'`
- Produces (`src/ui/debug/debugLog.ts`): `debugLog: DebugLog` (singleton over `window.localStorage`, `null` storage when reading `localStorage` throws), `logDebug(kind: string, text: string): void`.
- Produces (`src/ui/debug/capture.ts`):
  - `describeClick(target: { tag: string; label: string | null; text: string; inSidebar: boolean }, bodyPointerEvents: string, dialogOpen: boolean): string`
  - `createStallDetector(now: () => number, onStall: (ms: number) => void): { tick(): void }`
  - `installDebugCapture(win: Window, log: (kind: string, text: string) => void): void` (idempotent: a second call does nothing).

- [ ] **Step 1: Write failing tests `tests/core/debugLog.test.ts`**
  - `keeps this run and the previous one`: storage holds `{ previous: [a], current: [b] }` from an older start; a new `createDebugLog` has `previous = [b]` (the old `previous` dropped), `current` starts with one `run` entry whose text is the `wallClock()` value.
  - `caps at 1000 over both runs, dropping the previous run first, then the oldest current`: previous 600 + 500 adds → `count() === 1000`, previous trimmed from its start; then 1200 more adds → previous empty, current is the newest 1000.
  - `flush writes once to LOG_KEY`, `add alone does not write` (storage spy).
  - `storage that throws on getItem or setItem is ignored`: no throw from create/add/flush; entries kept in memory.
  - `text()` format: header `--- previous run ---`, then lines `+1.234s kind text`, then `--- this run ---` and its lines; with no previous entries the previous header is left out.
  - `clear()` empties both runs and writes the empty state on the next flush.
- [ ] **Step 2: Run `yarn vitest run tests/core/debugLog.test.ts`** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `src/core/debug/log.ts`.** Stored JSON `{ previous: LogEntry[]; current: LogEntry[] }`; a corrupt value counts as empty.
- [ ] **Step 4: Write failing tests `tests/ui/debugCapture.test.ts`**
  - `describeClick({ tag: 'A', label: 'Слова', text: 'Слова', inSidebar: true }, 'auto', false)` → `'click a "Слова" sidebar body=auto dialog=no'` (tag lowercased; label wins over text; text cut to 30 chars; `sidebar` only when `inSidebar`). Pin the exact string format: `` `click ${tag} "${labelOrText}"${inSidebar ? ' sidebar' : ''} body=${pe} dialog=${dialogOpen ? 'yes' : 'no'}` ``.
  - `createStallDetector`: ticks 100 ms apart report nothing; a tick 450 ms after the previous reports `350` (delay over the 100 ms period); a 280 ms gap reports nothing (180 ≤ 200).
  - `installDebugCapture` with a fake `win` (an `EventTarget` plus `console`, `setInterval`, `document` stub): an `error` event logs kind `error` with the message; `unhandledrejection` logs kind `rejection`; `console.error('x', 1)` logs kind `console` with `x 1` and still calls the original; calling `installDebugCapture` twice logs one entry per event.
- [ ] **Step 5: Run `yarn vitest run tests/ui/debugCapture.test.ts`** — Expected: FAIL.
- [ ] **Step 6: Implement `src/ui/debug/debugLog.ts` and `src/ui/debug/capture.ts`.** `installDebugCapture` adds: `error`/`unhandledrejection` listeners; the `console.error` wrapper; `setInterval(tick, 100)` with `createStallDetector(performance.now)` → kind `stall`, text `${ms}ms`; a capture-phase `pointerdown` listener building the `describeClick` input from the event target (`closest('a,button,[role],input,textarea,select') ?? target`, `aria-label`, `textContent`, `closest('nav') !== null`, `getComputedStyle(document.body).pointerEvents`, `document.querySelector('[role=dialog]') !== null`) → kind `click`; `setInterval(flush, 1000)` and a `pagehide` listener → `debugLog.flush()`.
- [ ] **Step 7: Wire it.** `main.tsx`: `installDebugCapture(window, logDebug)` before `boot()`. `boot.ts`: `bootTauri` logs kind `run`, text `tauri ${await getVersion()} ${navigator.userAgent}` (`getVersion` from `@tauri-apps/api/app`, allowed by `core:default`); `bootPreview` logs `preview ${navigator.userAgent}`. `AppShell`: `useEffect(() => logDebug('route', pathname), [pathname])`.
- [ ] **Step 8: Run** `yarn vitest run tests/core/debugLog.test.ts tests/ui/debugCapture.test.ts`, `yarn typecheck`, `yarn lint`, `yarn playwright test tests/e2e/words.spec.ts tests/e2e/settings-day.spec.ts --trace off` — Expected: all PASS (capture must not break existing pages).
- [ ] **Step 9: Commit** `feat(debug): persistent debug log with error, stall, click and route capture`.

### Task 2: Settings section, copy shortcut, devtools

**Files:**
- Create: `src/ui/debug/DebugLogSection.tsx`, `src/ui/debug/useCopyLogShortcut.ts`
- Modify: `src/ui/pages/Settings.tsx` (section at the very bottom, after the Setup link), `src/ui/app/AppShell.tsx` (mount the shortcut hook), `src/core/i18n/{ru,en}.ts`, `src-tauri/Cargo.toml` (`tauri = { version = "2.12.4", features = ["devtools"] }`), `docs/macos-checklist.md` (new section Y)
- Test: `tests/ui/copyLogShortcut.test.ts`, `tests/e2e/settings-debug.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes: `debugLog` (`count`, `text`, `clear`) from Task 1.
- Produces: `isCopyLogShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, mac: boolean): boolean` exported from `useCopyLogShortcut.ts`; `useCopyLogShortcut(lang: Lang): void`; `copyText(text: string): Promise<boolean>` (true when `navigator.clipboard.writeText` resolved).

i18n keys (ru / en, exact):
- `settings.debug`: `Журнал отладки` / `Debug log`
- `settings.debug.copy`: `Скопировать журнал` / `Copy log`
- `settings.debug.copied`: `Скопировано` / `Copied`
- `settings.debug.show`: `Показать журнал` / `Show log`
- `settings.debug.hide`: `Скрыть журнал` / `Hide log`
- `settings.debug.clear`: `Очистить` / `Clear`
- `settings.debug.count`: `Записей: {n}` / `Entries: {n}`
- `settings.debug.manual`: `Выделите текст и скопируйте` / `Select the text and copy it`
- `debug.copied`: `Журнал скопирован` / `Log copied`
- `debug.copyFailed`: `Не удалось скопировать журнал` / `Could not copy the log`

- [ ] **Step 1: Write failing `tests/ui/copyLogShortcut.test.ts`**: `isCopyLogShortcut` true for `{key:'l', metaKey, shiftKey}` on Mac and `{key:'L', ctrlKey, shiftKey}` off the Mac; false for no Shift, with Alt, Ctrl on Mac, Meta off the Mac, and `key: 'k'`.
- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: Implement** `useCopyLogShortcut.ts`: window `keydown` listener (works with focus in a field); on a match `preventDefault()`, `debugLog.flush()`, `copyText(debugLog.text())`, then `toast.success(t(lang,'debug.copied'))` or `toast.error(t(lang,'debug.copyFailed'))`. Mac test: `navigator.userAgent.includes('Mac')` (same as Words' `IS_MAC`).
- [ ] **Step 4: Implement `DebugLogSection`**: `<h2 className="title mt-10">` heading, the count line, buttons Copy (secondary), Show/Hide (ghost), Clear (ghost). Copy: on success the button row shows `settings.debug.copied` for 2 s (a `useSavedFlag`-style timer with 2000 ms; add an optional `ms` parameter to `useSavedFlag(ms = 3000)` rather than copying it); on failure open the text area, select its text, and show `settings.debug.manual`. The text area: `readOnly`, `rows={12}`, `font-mono text-xs`, `aria-label={t(lang,'settings.debug')}`; content = `debugLog.text()` read when opened or after Clear. Clear also refreshes the count.
- [ ] **Step 5: Write `tests/e2e/settings-debug.spec.ts`** (preview, `#/settings`): the section shows `Записей:` with a number > 0; Show opens a text area containing `--- this run ---` and a `route /settings` line; Clear makes the count `Записей: 1` or less after reopening (the click itself may add one entry: assert `≤ 2`); Copy with `context.grantPermissions(['clipboard-read','clipboard-write'])` shows `Скопировано` and the clipboard contains `--- this run ---`; pressing `ControlOrMeta+Shift+L` on `#/today` shows the `Журнал скопирован` toast.
- [ ] **Step 6: Add the cursor case** in `tests/e2e/cursor.spec.ts`: on `#/settings`, the three debug buttons are `pointer`, `wrongCursors` empty with the text area open.
- [ ] **Step 7: Cargo feature and checklist.** Edit `src-tauri/Cargo.toml` as above (no `Cargo.lock` change is expected; if `cargo metadata` is available, run it and commit any lock change). `docs/macos-checklist.md` section **Y. Debug tools (round 7)**: (1) `cargo check` passes with the `devtools` feature; (2) right-click in the app → "Inspect Element" opens the Web Inspector, Console has no CSP errors; (3) Settings → Debug log: Copy, Show, Clear work; (4) Cmd+Shift+L on Today shows "Журнал скопирован"; (5) after a restart, Show lists `--- previous run ---`.
- [ ] **Step 8: Run** `yarn vitest run tests/ui/copyLogShortcut.test.ts`, `yarn typecheck`, `yarn lint`, `yarn playwright test tests/e2e/settings-debug.spec.ts tests/e2e/cursor.spec.ts --trace off` — Expected: PASS.
- [ ] **Step 9: Commit** `feat(debug): debug log in Settings, Cmd+Shift+L copy, devtools in the app build`.

### Task 3: Voice and Words events in the log

**Files:**
- Create: `src/ui/voice/outline.ts`
- Modify: `src/ui/voice/engine.ts` (`KokoroDeps.log?`, `play` end callback, `system.speaking`), `src/ui/app/boot.ts` (pass `log: logDebug`, `speaking`), `src/ui/words/speech.ts` (log the picked voice), `src/ui/words/WordsJobProvider.tsx` (fill events), `src/ui/pages/Words.tsx` (list reload event)
- Test: `tests/ui/voiceOutline.test.ts`, `tests/ui/voiceEngine.test.ts`

**Interfaces:**
- Produces: `outline(pcm: Float32Array, cells?: number, threshold?: number): string` (defaults 20, 0.02; each cell is the max `|x|` over its slice; an empty `pcm` gives `''`).
- Changes `KokoroDeps`:
  - `log?: (kind: string, text: string) => void`
  - `system` gains `speaking(): boolean`
  - `play: (pcm: Float32Array, rate: number, onEnd: () => void) => { stop(): void }` (`playPcm` sets `source.onended = onEnd`).
- Log entries (kind `voice`, exact texts; `<t>` = text in double quotes, `<v>` = variant):
  - status change: `status <status>`; while downloading, `status downloading <p>%` with `p` a multiple of 10, each logged once.
  - press: `press <t> <v> kokoro-cached` | `kokoro-wait` | `system-not-ready` | `system-fallback` (the last when a waited clip rejects and the system voice speaks).
  - clip start: `play <t> <samples> samples <rate>Hz <seconds with 2 decimals>s <outline> system=<yes|no> clip=<yes|no>` (`system` = `deps.system.speaking()` before `system.cancel()`; `clip` = a previous clip had started and not ended).
  - clip end: `end <t>`; stop: `stop`.
  - error from the worker: `error <message first 200 chars>`.
- `speech.ts` logs kind `voice`, text `system <t> <v> voice=<name> (<lang>)` or `voice=default` when none matched.
- `WordsJobProvider`: kind `words`, `fill start phonetics=<n> dict=<n>`, `fill <done>/<total>`, `fill end ok` | `fill end busy` | `fill end error <message>`. `Words.tsx`: kind `words`, `list reload` each time its `useLoaded` loader runs.

- [ ] **Step 1: Write failing `tests/ui/voiceOutline.test.ts`**: silence of 24000 samples → 20 dots; 24000 samples loud only in samples 6000–17999 → `.....##########.....`; `outline(new Float32Array(0)) === ''`.
- [ ] **Step 2: Extend `tests/ui/voiceEngine.test.ts`** (the fake deps gain `log` collecting `[kind, text]`, `speaking`, and a `play` that stores `onEnd`): a press before ready logs `press "pivotal" en-GB system-not-ready`; a ready press then reply logs `kokoro-wait` and a `play "pivotal" … system=no clip=no` line whose outline has 20 characters; a second press of the same text logs `kokoro-cached`; a press while the first clip has not ended logs `clip=yes` (the first clip is stopped as now); calling the stored `onEnd` logs `end "pivotal"`; a rejected request logs `system-fallback`; download progress 0.05, 0.12, 0.13, 0.31 logs `downloading 10%` once and `30%` once.
- [ ] **Step 3: Run** `yarn vitest run tests/ui/voiceOutline.test.ts tests/ui/voiceEngine.test.ts` — Expected: new tests FAIL, old ones PASS.
- [ ] **Step 4: Implement** `outline.ts`, the engine changes (log through `deps.log?.(…)`, never throwing), `playPcm(pcm, rate, onEnd)`, boot wiring (`system: { canSpeak, speak, cancel: cancelSpeech, speaking: () => window.speechSynthesis.speaking }`, `log: logDebug`), the `speech.ts`, `WordsJobProvider` and `Words.tsx` log calls.
- [ ] **Step 5: Run** the two test files, `yarn vitest run` (whole suite), `yarn typecheck`, `yarn lint` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(debug): voice, system voice and Words fill events in the debug log`.

### Task 4: Download notification instead of speaker rings

**Files:**
- Create: `src/ui/voice/downloadToast.ts`, `src/ui/voice/VoiceDownloadToast.tsx`
- Modify: `src/ui/voice/download.ts` (`onStart`), `src/ui/voice/engine.ts` (`downloading` only when a file is missing; `lastError()`), `src/ui/voice/previewEngine.ts` (`downloaded` mode, real `subscribe`), `src/ui/app/AppShell.tsx` (mount the host), `src/ui/words/WordCard.tsx` (remove `VoiceRing` and `useVoiceDownload`), `src/ui/voice/VoiceProvider.tsx` (remove `useVoiceDownload`), `src/core/i18n/{ru,en}.ts` (remove `words.voice.loading`, add keys below)
- Test: `tests/ui/voiceDownloadToast.test.ts`, `tests/ui/voiceDownload.test.ts`, `tests/ui/voiceEngine.test.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- `ensureVoiceFiles(io, dir, onProgress, onStart?: () => void)`: `onStart` is called once, before the first download, only when some file is missing.
- Engine: `load()` goes `idle → loading` when nothing is missing, `idle → downloading → loading` otherwise; `VoiceEngine.lastError(): string | null` (message of the last failure, `null` after a new `load()` starts).
- `type ToastAction = { kind: 'progress'; percent: number } | { kind: 'success' } | { kind: 'failure'; message: string } | null`
- `downloadToast(prev: VoiceStatus, next: VoiceStatus, fraction: number, lastPercent: number | null, error: string | null): ToastAction` — `progress` when `next === 'downloading'` and `Math.floor(fraction*100) !== lastPercent`; `success` when `prev === 'downloading'` and `next` is `loading` or `ready`; `failure` when `prev === 'downloading'` and `next === 'failed'` (message = `error ?? ''`); otherwise `null`.
- Preview `?voice=downloaded`: starts `downloading` at fraction 1, then after 300 ms becomes `ready` and notifies (records spoken texts like `ok`). `?voice=downloading` stays at 0.4 as now, and now notifies subscribers once on subscribe so the host shows 40%.

i18n keys (ru / en, exact):
- `voice.download.progress`: `Загрузка голоса: {n}%` / `Downloading the voice: {n}%`
- `voice.download.done`: `Голос загружен` / `Voice downloaded`
- `voice.download.failed`: `Не удалось загрузить голос: {message}. Пока звучит системный голос.` / `Could not download the voice: {message}. The system voice is used for now.`

- [ ] **Step 1: Write failing `tests/ui/voiceDownloadToast.test.ts`**: the four branches of `downloadToast` with exact values (`('idle','downloading',0.004,null,null)` → progress 0; same percent as `lastPercent` → null; `('downloading','loading',1,100,null)` → success; `('downloading','failed',0.3,30,'HTTP 500')` → failure `HTTP 500`; `('idle','loading',0,null,null)` → null; `('loading','ready',…)` → null).
- [ ] **Step 2: Extend `tests/ui/voiceDownload.test.ts`**: `onStart` called once when one file is missing; never called when all sizes match. Extend `tests/ui/voiceEngine.test.ts`: with every file on disk the statuses seen are `loading`, `ready` (no `downloading`); a failed download sets `lastError()` to its message.
- [ ] **Step 3: Run** `yarn vitest run tests/ui/voiceDownloadToast.test.ts tests/ui/voiceDownload.test.ts tests/ui/voiceEngine.test.ts` — Expected: new tests FAIL.
- [ ] **Step 4: Implement** `downloadToast.ts`, the `download.ts` and engine changes, and `VoiceDownloadToast` (subscribes to `useVoice()`; keeps `prev` status and `lastPercent` in refs; `progress` → `toast.loading(text, { id: 'voice-download', duration: Infinity })`; `success` → `toast.success(done, { id, duration: 4000 })`; `failure` → `toast.error(failed, { id, duration: 8000 })`; renders nothing). Mount it inside `AppShell` next to `<Toaster />`. Remove `VoiceRing`, `useVoiceDownload`, the `relative` wrapper span if it only served the ring, and the `words.voice.loading` key.
- [ ] **Step 5: Update e2e.** In `tests/e2e/words.spec.ts` replace the ring test with: `?voice=downloading` → a toast with text `Загрузка голоса: 40%` is visible, the card has no `role=img` named `Загрузка голоса…`, the first speaker is enabled; new test `?voice=downloaded` → `Голос загружен` toast appears. `tests/e2e/cursor.spec.ts`: keep the downloading case (the speaker stays `pointer`), `wrongCursors` empty with the toast showing.
- [ ] **Step 6: Run** `yarn vitest run`, `yarn typecheck`, `yarn lint`, `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts --trace off` — Expected: PASS.
- [ ] **Step 7: Commit** `feat(voice): one download notification instead of speaker rings`.

### After the tasks (lead)
- Final whole-branch review (Sonnet), fixes, then the lead runs typecheck, lint, full vitest, and e2e `words cursor settings-day settings-icon settings-debug csp screenshots`.
- Update `docs/superpowers/handoff.md` (round 7 line; R4 waits for the learner's log) and the Mac checklist (download notification on an empty voice folder; a log after a few presses shows `press`/`play` lines with outlines).

## Binding review notes (plan review, 2026-11-14)

These override the task text where they differ. Each task's implementer must read the notes for its task.

**Task 1**
- `debugLog.ts` must be safe in node: the storage lookup is in try/catch, and `typeof window === 'undefined'`, a missing `localStorage` or a throw all mean `null` storage. Create the store lazily on first use (`logDebug` or `debugLog` access), so importing the module (from `speech.ts` in Task 3) never touches `window`.
- `capture.ts` does not import `debugLog.ts`. Signature becomes `installDebugCapture(win: Window, log: (kind: string, text: string) => void, flush: () => void): void`; `main.tsx` passes `logDebug` and `() => debugLog.flush()`.
- Idempotency is marked on the `win` object itself (`win.__debugCapture = true`), not a module flag. The code uses only `win.console`, `win.setInterval`, `win.document`, `win.addEventListener`, `win.performance` (no globals). The fake `win` in tests records `setInterval` callbacks without running them; error and rejection events are plain `Event`s with `message`/`reason` assigned (node has no `ErrorEvent`/`PromiseRejectionEvent`). The `pointerdown` handler does nothing unless `e.target instanceof win.Element` (guard with `typeof win.Element === 'function'`).
- Stall detector: `last` is set at creation; a tick while `win.document.hidden` only resets `last`; a `visibilitychange` resets `last`. Add a test: a 900 ms gap while hidden reports nothing.
- `console.error` entry text: each argument `Error` → `message`, string → itself, other → `JSON.stringify` in try/catch with `String(arg)` fallback; joined with spaces, cut to 300 characters. The wrapper body is in try/catch, never calls `console.error` itself, and always calls the original.
- `flush()` writes only when something changed since the last write (dirty flag; `clear()` sets it).
- `bootTauri`: `getVersion()` is in try/catch, falling back to `unknown`; boot never fails because of the log.

**Task 2**
- `useSavedFlag(ms = SHOW_MS)`: the default keeps `WordForm` and `WordDetails` unchanged.
- The count line is a snapshot read on mount, on Show, after Copy and after Clear. After Clear it reads exactly `Записей: 0`; the e2e asserts that.
- `isCopyLogShortcut` compares `e.key.toLowerCase() === 'l'`. The shortcut e2e also calls `grantPermissions(['clipboard-read','clipboard-write'])`.

**Task 3**
- `system=` is the value of the engine's guarded `system.speaking()` read in `speak()` **before** `system.cancel()`, kept with the press and printed when that press's clip starts.
- `clip=`: each played clip gets an id; `onEnd` clears the "playing" mark only if it is the current clip's id. `end <t>` is logged for every clip, stopped ones included.
- Percent logging: the last logged bucket starts at 0 in each `load()`; a bucket `floor(p*10)*10` is logged only when greater than the last (so `0%` is never logged). The test values stand.
- `outline`: cell `i` covers samples `[floor(i*n/cells), floor((i+1)*n/cells))`; an empty cell is `.`.
- The engine tests that expect `downloading` must use a fake `io` with a missing file (they stay valid after Task 4).

**Task 4**
- `load()` sets a synchronous `loading` flag (or the status `loading`) at its start, so a press during the size checks never starts a second load; `setStatus` ignores an unchanged status. With every file present the statuses seen are exactly `loading`, `ready`.
- `load()` resets `fraction = 0` and `lastError = null`; `fail()` sets `lastError` before `setStatus('failed')`.
- The host updates `prev` on every notify (also `downloading → downloading`) and resets `lastPercent` to `null` whenever the status is not `downloading`.
- `VoiceEngine.lastError()` is implemented by `previewEngine` and every fake engine in tests.
- Preview `?voice=downloaded`: `status` is mutable; the 300 ms timer starts on the first `subscribe`, once (StrictMode subscribes twice).
- E2E finds toasts with `page.getByText(...)`.

**Trailers:** the Global Constraints trailers (Claude Opus 5.5) are correct as written, whatever a subagent's own harness says.
