# Words feedback round 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Find where Kokoro hangs on the Mac (step log), stop waiting for it after 20 s, show its status in Settings with Retry, pick a decent system voice, and fix the copy shortcut and click lines.

**Architecture:** A pure voice-choice function in `src/ui/words/systemVoice.ts` used by `speech.ts` and Settings. The engine logs its start steps, forwards worker `log` messages, runs a 20 s start timer only in `loading`, and gains `retry()`. A small `VoiceStatusRow` in Settings subscribes to the engine.

**Tech Stack:** React 19/TS, Vitest (node env, fake timers), Playwright on the Vite preview.

**Spec:** `docs/superpowers/specs/2026-11-14-words-feedback-8.md` (R1–R5). The learner chose: 20 s, Status + Retry, short process (no separate plan review).

## Global Constraints
- UI strings only in `src/core/i18n/{ru,en}.ts` (same keys in both); no em dash; no "again"/"снова"/"опять"; no emoji. Exact texts are in the spec R3; copy them verbatim.
- Every interactive element `cursor: pointer`; new buttons get a `tests/e2e/cursor.spec.ts` case.
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`.
- Commits end with exactly these two trailers, and **do not substitute your own model name**:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY
  ```
- Push after each commit: `git push -u origin claude/admiring-edison-vmhgdm`. Stage only your files. No subagents, no `send_message`.
- Checks per task: `yarn typecheck`, `yarn lint`, full `yarn vitest run` once before committing, the touched e2e specs with `yarn playwright test <spec> --trace off`.
- Pinned values: start limit **20 000 ms**, counted only while the status is `loading`; time-out reason exactly `start timed out after 20 s at: <last step>`; shortcut Mac `metaKey && altKey && !ctrlKey && !shiftKey && code === 'KeyL'`, elsewhere `ctrlKey && altKey && !metaKey && !shiftKey && code === 'KeyL'`, not on `repeat`.

## Review Focus
1. **The worker posts `ready` just after the 20 s timer fired.** The late `ready` must be ignored (the worker is terminated, status stays `failed`). Test in Task 2.
2. **A slow first download (minutes).** No time-out while `downloading`; the 20 s start only when the status becomes `loading`. Test in Task 2.
3. **Retry pressed while a retry is already running, or while a download runs.** No second load. Test in Task 2.
4. **`getVoices()` empty at first call (WebKit fills it later).** The choice returns none and the browser picks by language; Settings shows "default" until voices appear (re-read on `voiceschanged`). Test the function in Task 1; Settings listens in Task 3.
5. **A failed download vs a failed start.** A press retries a failed download (as now) but not a failed or timed-out start. Test in Task 2.

---

### Task 1: System voice choice, shortcut, click lines

**Files:**
- Create: `src/ui/words/systemVoice.ts`, `tests/ui/systemVoice.test.ts`
- Modify: `src/ui/words/speech.ts` (use the choice), `src/ui/debug/useCopyLogShortcut.ts` + `tests/ui/copyLogShortcut.test.ts` (new shortcut), `src/ui/debug/capture.ts` + `tests/ui/debugCapture.test.ts` (click text), `docs/macos-checklist.md` and `docs/superpowers/handoff.md` (Cmd+Shift+L → Cmd+Option+L)

**Interfaces:**
- Produces: `interface VoiceLike { name: string; lang: string; default?: boolean }`; `chooseSystemVoice<V extends VoiceLike>(voices: readonly V[], variant: SpellingVariant): V | null` (rules and lists verbatim from spec R4; language compared after `replace('_','-').toLowerCase()`; a name is "base name" = text before ` (`).
- `describeClick(...)` returns the text without the leading `click ` (`a "Settings" sidebar body=auto dialog=no`); the `click` and `click-done` kinds stay.

- [ ] **Step 1: Failing tests** `tests/ui/systemVoice.test.ts`: default matching voice wins over Samantha; `[Flo (en-US), Samantha]` → Samantha; `[Flo, Bells, Albert]` only → null; `Ava (Premium)` over `Samantha (Enhanced)` over `Alex`; en-US order Samantha before Alex; en-GB `[Daniel, Serena]` → Daniel; `en_GB` tag matches `en-GB`; no language match → null; empty list → null; `[Flo (en-US), Moira (en-US)]` → Moira (first remaining). Update `copyLogShortcut.test.ts` to the pinned shortcut (Mac: meta+alt+KeyL true; meta+shift+KeyL false; key `¬` with code `KeyL` true; repeat false; elsewhere ctrl+alt+KeyL true) and `debugCapture.test.ts` expected strings.
- [ ] **Step 2: Run** them — FAIL.
- [ ] **Step 3: Implement**; `speech.ts` sets `utterance.voice` from `chooseSystemVoice(synth.getVoices(), variant)` and keeps its log line. Docs: replace the shortcut everywhere it is mentioned.
- [ ] **Step 4: Run** checks + `yarn playwright test tests/e2e/settings-debug.spec.ts tests/e2e/words.spec.ts --trace off` (the shortcut e2e presses `Control+Alt+KeyL`, since the test browser is not a Mac) — PASS.
- [ ] **Step 5: Commit** `fix(voice): better system voice, Cmd+Option+L copy, single click word`.

### Task 2: Engine start log, 20 s limit, retry

**Files:**
- Modify: `src/ui/voice/engine.ts`, `src/ui/voice/kokoro.worker.ts`, `src/ui/voice/previewEngine.ts` (`retry` + `?voice=failed`), any other `VoiceEngine` fakes in tests
- Test: `tests/ui/voiceEngine.test.ts`

**Interfaces:**
- `VoiceEngine.retry(): void` — when the status is `failed` and no load runs: clears the start-failed mark and starts `load()` (download if files are missing, otherwise start). Otherwise does nothing.
- `KokoroDeps.startLimitMs?: number` (default 20 000; tests may pass it but the default is what boot uses).
- Worker → page message `{ type: 'log'; text: string }`, logged by the engine as `worker <text>`. Worker texts (exact): `started` (module top level), `init <n> files`, `fetch <path> <bytes>B` / `fetch <path> 404` (in the fetch shim, only for the model files), `model loading`, `model loaded <ms>ms`.
- Engine texts (exact, kind `voice`): `load read <path> <bytes>B <ms>ms`, `load worker created`, `load init sent`; worker `error` event: `worker error <message> <filename>:<lineno>` (then the existing crash failure); `messageerror`: `worker messageerror`.
- "Last step" = the text of the last `load …` or `worker …` line of this start, e.g. `start timed out after 20 s at: worker model loading`.

- [ ] **Step 1: Failing tests** (fake timers; FakeWorker can `reply({ type: 'log', text })`):
  - start steps: with files on disk, a press logs `load read …` for each of the 6 files, `load worker created`, `load init sent`; a worker `log` message `model loading` is logged as `worker model loading`.
  - time-out: after the status becomes `loading`, advancing 19 999 ms keeps `loading`; at 20 000 ms → `failed`, `lastError()` is `start timed out after 20 s at: worker model loading` (the last step seen), the worker is terminated; a later `ready` from that worker changes nothing.
  - download does not count: with a missing file whose download resolves after 60 000 fake ms, no time-out happens during the download, and the status reaches `loading`.
  - ready in time clears the timer (advancing past 20 s after `ready` keeps `ready`).
  - after a start failure (time-out or worker error), a press speaks with the system voice and does not create a new worker; `retry()` creates one; `retry()` twice in a row creates only one.
  - after a failed download, a press starts a new load (unchanged behaviour).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Worker posts its log lines with `self.postMessage({ type: 'log', text })` (never throwing). Engine: start the timer when it sets `loading`, clear it on `ready` and in `fail()`; time-out calls `fail(new Error(...))`; a `startFailed` flag set by any failure after the status reached `loading`; `speak()` only calls `load()` when `!startFailed`. Preview `?voice=failed`: status `failed`, `lastError()` `start timed out after 20 s at: worker model loading`, `retry()` turns it `ready` and notifies.
- [ ] **Step 4: Run** checks + `yarn playwright test tests/e2e/words.spec.ts --trace off` — PASS.
- [ ] **Step 5: Commit** `feat(voice): voice start steps in the log, 20 s start limit, retry`.

### Task 3: Voice row in Settings

**Files:**
- Create: `src/ui/voice/VoiceStatusRow.tsx`
- Modify: `src/ui/pages/Settings.tsx` (row just before `<DebugLogSection />`), `src/core/i18n/{ru,en}.ts`, `docs/macos-checklist.md` (section Z: Settings voice row; log shows start steps up to `ready` or the time-out line)
- Test: `tests/e2e/settings-debug.spec.ts` (or a new `tests/e2e/settings-voice.spec.ts`), `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes: `useVoice()`, `VoiceEngine.status/progress/lastError/subscribe/retry` (Task 2), `chooseSystemVoice` (Task 1), `settings.spellingVariant` (`'american'` → `en-US`, else `en-GB`).
- i18n keys (texts verbatim from spec R3): `settings.voice`, `settings.voice.idle`, `settings.voice.downloading` (`{n}`), `settings.voice.loading`, `settings.voice.ready`, `settings.voice.failed` (`{reason}`), `settings.voice.system` (`{name}`), `settings.voice.systemDefault`, `settings.voice.retry`.

- [ ] **Step 1: E2E first** (preview): `#/settings?…` with `?voice=ok` shows `Готов`; `?voice=downloading` shows `Загрузка: 40%`; `?voice=failed` shows `Не работает: start timed out after 20 s at: worker model loading. Звучит системный голос.` and a `Повторить` button, clicking it shows `Готов`; without `?voice=` the row shows only a `Системный голос:` line. Cursor case: Retry is `pointer`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the row with the existing Settings `Row` pattern; status via `useSyncExternalStore` over `subscribe`/`status`+`progress` (snapshot must be a stable primitive, e.g. `${status}|${Math.floor(progress*100)}|${lastError}`); system voice name re-read on `speechSynthesis` `voiceschanged` (guard `canSpeak()`).
- [ ] **Step 4: Run** checks + the e2e specs — PASS.
- [ ] **Step 5: Commit** `feat(voice): voice status and Retry in Settings`.

### After the tasks (lead)
- Final review (Sonnet), one fix wave, re-review; lead runs typecheck, lint, full vitest, e2e `words cursor settings-day settings-icon settings-debug csp screenshots` (+ settings-voice); handoff line for round 8.
