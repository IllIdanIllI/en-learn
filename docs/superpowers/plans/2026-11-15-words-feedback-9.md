# Words feedback round 9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No system voice in the app; a press before the voice is ready is held and played by Kokoro; one toast covers download, start, ready and failure (with Retry).

**Architecture:** The engine (`src/ui/voice/engine.ts`) loses its `system` dependency and holds the latest press until `ready`. The pure function `downloadToast` decides the toast from the engine state; `VoiceDownloadToast` renders it with sonner.

**Tech Stack:** TypeScript, React, sonner, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-words-feedback-9.md`

## Global Constraints
- Texts exactly as in the spec S1, S3, S4 (both `src/core/i18n/ru.ts` and `en.ts`).
- Every interactive element has `cursor: pointer` (`CLAUDE.md`); the toast's Retry button gets a case in `tests/e2e/cursor.spec.ts`.
- Touch only the files a task lists. Never weaken a test to pass; rewrite a test only where the spec changes the behaviour it checks.
- Do not commit; the coordinator commits.

## Review Focus
- A press while a Retry is running (status still `failed`, `loading` true) is held, not dropped. → Task 1 test.
- A held press whose synthesis fails after ready: silent, `sentenceError()` set. → Task 1 test.
- `stop()` between the press and ready: nothing plays at ready. → Task 1 test.
- Worker crash after ready (`ready → failed`): the failure toast shows. → Task 2 test.
- After Retry the status stays `failed` with `lastError() === null` for a moment: no failure toast. → Task 2 test.

---

### Task 1: Engine holds the press and drops the system voice

**Files:**
- Modify: `src/ui/voice/engine.ts`, `src/ui/app/boot.ts` (remove the `system:` line and imports it orphans)
- Test: `tests/ui/voiceEngine.test.ts`

**Interfaces (produces):**
- `KokoroDeps` no longer has `system`.
- `VoiceEngine` gains `sentenceError(): string | null`: the message of the latest press whose synthesis failed; null again at the next press. A change calls the subscribers.
- `speak()` doc: "Plays the text with Kokoro; a press before the voice is ready is held and played once it is. Never throws."

**Behaviour:**
- `speak` when status is not `ready`:
  - `status === 'failed' && !loading` → hold nothing, start nothing, call the subscribers (the toast shows again), log `press "<text>" <variant> silent-failed`.
  - otherwise hold `{ text, variant }` (replacing an earlier one), log `press "<text>" <variant> held`, and start `load()` when `status === 'idle' && !loading`.
- On the worker's `ready`: set the status, then play the held press through the same code path as a press on a ready voice (cache, `kokoro-wait`, token check).
- `stop()` and `fail()` clear the held press.
- Remove `startFailed` and `reachedLoading`: after any failure only `retry()` loads again.
- A failed synthesis of the latest press: no sound, `sentenceError` set, log `press "<text>" <variant> failed` (replaces `system-fallback`).
- `playClip` log line loses the `system=yes|no` field; the rest stays.

- [ ] **Step 1:** In `tests/ui/voiceEngine.test.ts` remove the `system` fake (`spoken`, `cancels`, `speakingNow`, `canSpeakNow`) and rewrite each test that asserted system speech to the behaviour above. Add tests: a held press plays at ready; two presses before ready → only the second plays; `stop()` before ready → no play; failure drops the held press; a press while failed starts no load and notifies a subscriber; a press during a running Retry is held and plays; Retry after a failed download loads again while a press does not; a failed synthesis sets `sentenceError()` and the next press clears it; no test may reference a system voice.
- [ ] **Step 2:** Run `npx vitest run tests/ui/voiceEngine.test.ts` → the new tests fail.
- [ ] **Step 3:** Implement in `engine.ts`; update `boot.ts`.
- [ ] **Step 4:** `npx vitest run tests/ui/voiceEngine.test.ts` → pass; `npx eslint src/ui/voice src/ui/app tests/ui/voiceEngine.test.ts` clean. (`npx tsc -b` may fail only in `previewEngine.ts` until Task 2 lands.)

### Task 2: Toast, Settings row, preview engine, texts

**Files:**
- Modify: `src/ui/voice/downloadToast.ts`, `src/ui/voice/VoiceDownloadToast.tsx`, `src/ui/voice/VoiceStatusRow.tsx`, `src/ui/voice/previewEngine.ts`, `src/core/i18n/ru.ts`, `src/core/i18n/en.ts`
- Test: `tests/ui/voiceDownloadToast.test.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/settings-voice.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces (consumes):** `VoiceEngine.sentenceError(): string | null` from Task 1 (being added in parallel; implement it in the preview engine as `() => null`).

**Decisions:**
- `ToastAction` = `{ kind: 'progress'; percent } | { kind: 'starting' } | { kind: 'success' } | { kind: 'failure'; message } | null`. `downloadToast(prev, next, fraction, lastPercent, error)` keeps its signature:
  - `next === 'downloading'` → progress, each whole percent once (as now);
  - `next === 'loading' && prev !== 'loading'` → starting;
  - `next === 'ready'` and `prev` is `downloading` or `loading` → success;
  - `next === 'failed' && error !== null` → failure (whatever `prev` is, also `failed → failed`);
  - else null.
- `VoiceDownloadToast`: starting → `toast.loading(t('voice.start.progress'), { id: 'voice-download', duration: Infinity })`; success → `voice.ready`, 4000; failure → `toast.error(t('voice.failed', { message }), { id: 'voice-download', duration: 8000, action: { label: t('settings.voice.retry'), onClick: () => voice.retry() } })`. Separately: when `voice.sentenceError()` is non-null and differs from the last one shown (a ref, reset when it is null) → `toast.error(t('voice.speak.failed', { message }), { id: 'voice-speak', duration: 8000 })`.
- i18n: add `voice.start.progress`, `voice.ready`, `voice.failed`, `voice.speak.failed` (texts from spec S3/S4); delete `voice.download.done` and `voice.download.failed`; `settings.voice.failed` loses its second sentence.
- `VoiceStatusRow`: the system voice line (and its `voiceschanged` effect) only when `voice === null`.
- `previewEngine`: new mode `starting` (status `loading`, never ready); `retry()` in `failed` mode goes `loading` → `ready` after 300 ms, notifying both times; `speak` while failed notifies the subscribers; update the doc comment.

- [ ] **Step 1:** Rewrite `tests/ui/voiceDownloadToast.test.ts` for the rules above, including `ready → failed` with an error → failure, `failed → failed` with error null → null, `idle → loading` → starting, `loading → loading` → null, `loading → ready` → success, `downloading → loading` → starting. Run → fails.
- [ ] **Step 2:** Implement the files above. Run `npx vitest run` → all pass (the engine test file may be mid-change by Task 1; report it, do not edit it).
- [ ] **Step 3:** E2E: update `words.spec.ts` (the downloaded case expects "Голос готов"; add: `?voice=starting` shows "Голос запускается…"; `?voice=failed` shows "Голос не работает: start timed out after 20 s at: worker model loading" with a "Повторить" button whose click ends in "Голос готов"); update `settings-voice.spec.ts` (failed text without the second sentence; with a Kokoro engine no "Системный голос" line; scope the Settings Retry button so the toast's button does not make the locator ambiguous); add the cursor case for the toast's Retry in `cursor.spec.ts`.
- [ ] **Step 4:** Run `npx playwright test tests/e2e/words.spec.ts tests/e2e/settings-voice.spec.ts tests/e2e/cursor.spec.ts --trace off` → pass (`csp.spec.ts` is a known unrelated failure and is not in this run).

### Task 3 (coordinator): docs and final checks
- [ ] `docs/macos-checklist.md`: add the round 9 check from the spec; `docs/superpowers/handoff.md`: record the root cause, the fix and round 9.
- [ ] `npx tsc -b`, `npx eslint .`, `npx vitest run`, full Playwright; commit; push.
