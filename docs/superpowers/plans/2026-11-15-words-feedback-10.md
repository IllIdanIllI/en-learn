# Words feedback round 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A word press plays at once in the usual case: the voice starts when a training opens, clips are prepared ahead (words first), and finished clips are kept on disk.

**Architecture:** The engine gets `warm()` and `plan()` (replacing `prefetch()`), sends one background request at a time, and reads/writes a `ClipStore` around the worker. `clipStore.ts` holds the store over a small `ClipIo`; `TauriClipIo` implements it with plugin-fs.

**Tech Stack:** TypeScript, React, Tauri plugin-fs, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-words-feedback-10.md`

## Global Constraints
- Cap: 200 MB (`200 * 1024 * 1024` bytes). Folder: `<dir>/clips`. 16-bit PCM.
- No new Tauri permissions: use only `readFile`, `open`+`write`, `mkdir`, `remove`, `stat`, `exists`, `readDir` from `@tauri-apps/plugin-fs` (all already allowed under `$APPDATA/voice/**`; `readDir` under `$APPDATA/**`).
- Touch only the files a task lists. Never weaken a test; change one only where the spec changes the behaviour it checks. Do not commit.
- The interfaces `StoredClip`, `ClipStore`, `ClipIo` already exist in `src/ui/voice/clipStore.ts`; do not change them.

## Review Focus
- A voice failure while a press waits on a disk read: the press is rejected, nothing dangles. → Task 2 test.
- A stored file with an odd byte length or a bad header → `get` returns null, no throw. → Task 1 test.
- Two `put`s past the cap in one run: the oldest goes first, the new clip stays. → Task 1 test.
- The plan changes while a planned clip is in flight: that clip finishes and is kept; the next one comes from the new plan. → Task 2 test.
- A press for a text whose planned request is in flight reuses that request (no second post). → Task 2 test.

---

### Task 1: Clip store

**Files:**
- Modify: `src/ui/voice/clipStore.ts` (add the implementation below the interfaces), `src/ui/voice/io.ts` (add `TauriClipIo`)
- Test: `tests/ui/voiceClipStore.test.ts` (new)

**Produces:**
- `clipKey(revision: string, voice: string, text: string): Promise<string>`: the first 32 hex characters of SHA-256 (`crypto.subtle`) of `` `${revision}|${voice}|${text}` ``.
- `createClipStore(io: ClipIo, dir: string, capBytes: number, log: (text: string) => void): ClipStore`.
- `class TauriClipIo implements ClipIo` in `io.ts`.

**Decisions:**
- File: `<dir>/<key>.s16`. Layout: bytes 0–3 the sample rate (uint32, little-endian), then the samples as int16 little-endian (`Math.round(clamp(x, -1, 1) * 32767)`); read back as `value / 32767`.
- `get`: missing → null; length < 4 or `(length - 4)` odd or rate 0 → null; an `io.read` that throws → log `clip read failed <message>`, null.
- The folder is listed once, lazily, at the first `get` or `put` (a failing `list` → treated as empty, logged). The store keeps name, size and age in memory; `put` adds the new file as the newest (replacing a same-named entry), then removes the oldest files while the total is over `capBytes` (never the file just written). A failing `write` or `remove` is logged (`clip save failed <message>`) and never thrown.
- `TauriClipIo.write`: `mkdir(parent, { recursive: true })`, then `open(path, { write: true, create: true, truncate: true })`, `write`, `close` (as `TauriVoiceIo.download` does). `read`: `exists` then `readFile`. `list`: `exists` → `readDir` → `stat` each file (`mtime` → ms, 0 when null).

- [ ] **Step 1:** Write `tests/ui/voiceClipStore.test.ts` with an in-memory `ClipIo` fake: round trip within 1/32767 per sample and the same rate; `get` of an unknown key → null; odd-length and too-short files → null; throwing read → null and a log line; cap: three clips of equal size with a cap of two → after the third `put` the first file is removed and the other two are readable; files already listed (with `modified` times) are removed oldest first; throwing write → no throw, a log line; `clipKey` is 32 hex chars, stable, and differs by revision, voice and text.
- [ ] **Step 2:** `npx vitest run tests/ui/voiceClipStore.test.ts` → fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass; `npx eslint src/ui/voice/clipStore.ts src/ui/voice/io.ts tests/ui/voiceClipStore.test.ts` clean.

### Task 2: Engine warm, plan and disk use; the training's plan

**Files:**
- Modify: `src/ui/voice/engine.ts`, `src/ui/voice/previewEngine.ts`, `src/ui/app/boot.ts`, `src/ui/words/WordCard.tsx`, `src/ui/pages/WordsPractice.tsx`
- Create: `src/ui/voice/planTexts.ts`
- Test: `tests/ui/voiceEngine.test.ts`, `tests/ui/voicePlanTexts.test.ts` (new)

**Consumes:** `ClipStore`, `StoredClip` (types, `src/ui/voice/clipStore.ts`); in `boot.ts` also `createClipStore`, `clipKey` (same file) and `TauriClipIo` (`src/ui/voice/io.ts`) — Task 1 adds these three in parallel; `tsc` may miss them until it lands.

**Interfaces (produces):**
- `VoiceEngine.warm(): void` — "Starts the voice when it is idle, without a press; does nothing otherwise."
- `VoiceEngine.plan(texts: string[], variant: SpellingVariant): void` — "The texts to prepare in the background, most wanted first; replaces the earlier plan. One is made at a time."
- `VoiceEngine.prefetch` is removed (also from the preview engine and `WordCard`).
- `KokoroDeps.clips?: { store: ClipStore; key: (voice: string, text: string) => Promise<string> }` — without it nothing is read or saved (the existing engine tests keep working).
- `planTexts(cards: { word: { word: string; example: string } }[], index: number): string[]` — the words of `cards[index..]` in order, then their non-empty examples in order, each text once.

**Behaviour:**
- `warm()`: `load()` when `status === 'idle' && !loading`.
- `plan()`: keeps the list and the variant, then calls the pump. The pump runs at `plan()`, at `ready`, and when a background request settles: if the status is `ready` and no background request is in flight, it takes the first planned text with no cache entry and requests it as a prefetch. A failed planned text is not retried by the pump in the same plan (no loop on a bad text).
- `request()`: with `deps.clips`, first `key()` then `store.get()`; a hit resolves the entry (log `disk "<text>"`) with no worker post; a miss posts to the worker as now. If the voice failed meanwhile (`worker === null`), the entry is rejected and dropped from the cache. On the worker's `audio` reply the clip is saved with `store.put` (not awaited; it never throws). Without `deps.clips` the post is synchronous exactly as today.
- `boot.ts`: `clips: { store: createClipStore(new TauriClipIo(), `${appData}/voice/clips`, 200 * 1024 * 1024, (text) => logDebug('voice', text)), key: (voice, text) => clipKey(VOICE_REVISION, voice, text) }`.
- `WordsPractice.tsx`: `voice.warm()` once when the page mounts with an engine; an effect on `cards`, `index`, `spelling`, `voice` calls `voice.plan(planTexts(cards, index), spelling)` when `cards` is loaded; on unmount `voice.plan([], spelling)`.
- `WordCard.tsx`: remove the prefetch effect (and what it orphans).
- `previewEngine.ts`: `warm: () => {}`, `plan: () => {}`, no `prefetch`.

- [ ] **Step 1:** Tests first. `tests/ui/voicePlanTexts.test.ts`: order (words then examples), start at `index`, empty examples skipped, a repeated word or example listed once, an index past the end → `[]`. `tests/ui/voiceEngine.test.ts`: replace the `prefetch` tests by `plan` equivalents (same intent), and add: `warm` on idle starts one load and a second `warm` or a press starts no other; `warm` when failed does nothing; with a plan of three texts on a ready voice one prefetch is posted, the next only after its reply, in order; a text already known is skipped; `plan` before ready starts at `ready`; a new plan while one clip is in flight → that clip is cached, the next post is the new plan's first text; a press during a planned clip is posted at once with `prefetch: false`; a press for the in-flight planned text posts nothing new and plays its clip; a failed planned text is not posted again and the pump moves on; with a fake `clips`: a disk hit plays with no `speak` post and logs `disk "…"`, a miss posts and the reply is passed to `put` with the key, a planned text found on disk makes the pump continue, a voice failure during a pending `get` rejects the press without sound.
- [ ] **Step 2:** Run both test files → the new tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run` → all pass; `npx eslint src tests/ui` clean; `npx tsc -b` clean once Task 1 has landed.

### Task 3 (coordinator): docs and final checks
- [ ] Mac checklist and handoff; `npx tsc -b`, `npx eslint .`, `npx vitest run`, Playwright `words`, `cursor`, `settings-voice`; a WebKitGTK run of the worker is not needed (the worker is unchanged); commit; push.
