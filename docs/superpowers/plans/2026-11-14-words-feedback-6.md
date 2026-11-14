# Words feedback round 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transcriptions that actually fill (visibly), a natural Kokoro voice, translations cross-checked against Wiktionary, Cmd+F search, a "Saved" confirmation and a word edit panel inside trainings.

**Architecture:** A new small `phonetics` LLM kind and a visible "fill run" in `WordsJobProvider` (phonetics, then dictionary lookups). Outside HTTP goes through the official Tauri HTTP plugin (Rust side, scoped hosts) behind a `Net` port. Kokoro runs in a module Web Worker, fed model bytes that the app downloads once into `<appData>/voice/`. The edit panel is a modal `Sheet` reusing `WordDetails`.

**Tech Stack:** Tauri 2, React 19/TS, Tailwind, lucide-react, sql.js/SQLite migrations, Vitest (node env), Playwright; new: `@tauri-apps/plugin-http` + `tauri-plugin-http`, `kokoro-js@1.2.1` (pulls `@huggingface/transformers` 3.x, `phonemizer`).

**Spec:** `docs/superpowers/specs/2026-11-14-words-feedback-6.md` (R1–R9). One deviation, decided at planning and noted in the spec: R9's "Rust command family with reqwest" became the official HTTP plugin. It does the same job (Rust-side requests, host scope, streamed body) with no custom Rust, and the logic stays testable in TS.

## Global Constraints

- UI strings only in `src/core/i18n/{ru,en}.ts` (both files, same keys); no em dash; no "again"/"снова"/"опять"; no emoji in the UI (lucide icons only).
- Every interactive element `cursor: pointer`, disabled `not-allowed`; `label[for]` keeps the default cursor; new clickable things get a `tests/e2e/cursor.spec.ts` case.
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`.
- Commits end with exactly these two trailers, and **do not substitute your own model name**:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY
  ```
- Push after each commit: `git push -u origin claude/admiring-edison-vmhgdm`.
- Checks per task: `yarn typecheck`, `yarn lint`, `yarn vitest run <touched tests>`, and the touched e2e specs with `yarn playwright test <spec> --trace off`.
- Rust cannot be compiled in this container (GTK libraries missing). Rust/Cargo edits stay minimal and are listed for the Mac check.
- Pinned values: Kokoro model `onnx-community/Kokoro-82M-v1.0-ONNX`, revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231`, dtype `q8` (file `onnx/model_quantized.onnx`, 92361116 bytes); `config.json` 44, `tokenizer.json` 3497, `tokenizer_config.json` 113, `voices/bf_emma.bin` 522240, `voices/af_heart.bin` 522240 bytes. Voices: British `bf_emma`, American `af_heart`.
- kaikki URL: `https://kaikki.org/dictionary/English/meaning/<w[0]>/<w[0..2]>/<encodeURIComponent(w)>.jsonl` with `w` = the word lowercased and trimmed (`a` → `/a/a/a.jsonl`). 404 means no entry. Recorded replies: `src/adapters/preview/kaikki/{assertion,compel,nudge,give up}.jsonl`.

## Review Focus

1. **Stress marks and tags in kaikki words** (`утвержде́ние`, `сдать pf trans.`, `бро́сить pf the habit`). The dictionary line must show `утверждение`, `сдать`, `бросить`. Test in Task 5.
2. **Typing into the edit panel while a build card is open.** Letters must not place tiles or cost attempts. Test in Task 4 (e2e: type in the panel's translation field on a build card, attempts stay 3).
3. **Fill run on a Words page visit while a generation runs, and StrictMode double mount.** Exactly one run, no `busy` notice. Test in Task 2.
4. **Speaker pressed twice quickly, or a card change during Kokoro synthesis.** Only the last text plays, nothing plays after the card is gone. Test in Task 7.
5. **Interrupted model download (network drop mid-file).** No `.part` or short file is used; the next press restarts the download; the system voice keeps working. Test in Task 7.

---

### Task 1: `phonetics` LLM kind; phonetics run uses it

**Files:**
- Create: `prompts/phonetics.md`, `prompts/phonetics.schema.json`
- Modify: `src/core/domain.ts` (LlmKind), `src/core/llm/bundledPrompts.ts`, `src/core/llm/types.ts` (reply type), `src/core/db/repos/settings.ts` (defaults: model `claude-sonnet-5-5`, effort `low`), `src/ui/pages/Settings.tsx:21` (KINDS), `src/core/i18n/{ru,en}.ts` (`llm.phonetics`: "Слова: транскрипции" / "Words: transcriptions"), `src/adapters/preview/previewLlm.ts` (case `phonetics`), `src/core/words/generate.ts` (`runPhoneticsBatch`), `src/core/words/generated.ts` (check), `src/core/words/constants.ts`, `prompts/words.md` (pronunciation line)
- Test: `tests/core/words/generate.test.ts`, `tests/core/words/generated.test.ts`, `tests/core/db/settings.test.ts`, the prompts test under `tests/prompts/` if it enumerates kinds

**Interfaces:**
- Produces: `LlmKind` gains `'phonetics'`. `interface PhoneticsReply { words: { word: string; transcription: string; partOfSpeech: string }[] }`. `checkPhoneticsReply(reply: PhoneticsReply, requested: string[]): string | null` (every requested word exactly once, case-insensitive trimmed; same messages as `checkWordsReply`). `PHONETICS_BATCH = 20`. `generatePhonetics(deps, ids, onProgress?)` unchanged in signature, now batches of 20 with kind `phonetics`.

- [ ] **Step 1: Failing tests**
  - `generated.test.ts`: `checkPhoneticsReply` returns null for a full reply, `word "x" is missing from the reply` for a missing one, `appears 2 times` for a duplicate.
  - `generate.test.ts` `generatePhonetics uses the phonetics kind in batches of 20`: 25 ready words without transcription, FakeLlm records requests. Expect 2 calls, both `kind === 'phonetics'`, with 20 and 5 `### ` sections in `userPrompt`. Only empty fields are written. Exercises, generation and other fields are unchanged (adapt the existing phonetics tests from `words` to `phonetics` replies).
  - `settings.test.ts`: defaults contain `phonetics: 'claude-sonnet-5-5'` and effort `low`; stored settings without the key read the default.
- [ ] **Step 2: Run, expect FAIL** — `yarn vitest run tests/core/words tests/core/db/settings.test.ts`
- [ ] **Step 3: Implement**
  - Prompt input: `### <word>` then `Definition: <text or (missing)>` (sense hint).
  - Prompt rules: IPA between slashes in {{spellingVariant}} pronunciation. British = Received Pronunciation, American = General American. Part of speech as in `words.md`. One entry per word, `word` copied exactly.
  - Schema: strict `additionalProperties: false`.
  - Add the same British/American pronunciation sentence to the `transcription` line of `prompts/words.md`.
  - `runPhoneticsBatch` calls `callStructured<PhoneticsReply>(deps, 'phonetics', ...)` with `checkPhoneticsReply`. Its user prompt is built by a new `phoneticsPrompt(words: Word[]): string` in `generate.ts`.
- [ ] **Step 4: Run, expect PASS**, plus `yarn typecheck && yarn lint`.
- [ ] **Step 5: Commit** `feat(words): phonetics LLM kind for the transcription fill`

### Task 2: Visible fill run on every Words page visit

**Files:**
- Create: `src/core/words/fill.ts`
- Modify: `src/ui/words/WordsJobProvider.tsx`, `src/ui/pages/Words.tsx`, `src/core/i18n/{ru,en}.ts`, `src/adapters/preview/fixtures.ts` + `wordsSeed.ts` (state `words-fill`: three ready words with empty transcription/partOfSpeech; previewLlm's `phonetics` fills them), `src/core/words/phonetics.ts` (unchanged API)
- Test: `tests/core/words/fill.test.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes: `generatePhonetics` (Task 1), `wordsMissingPhonetics`.
- Produces:
  ```ts
  // src/core/words/fill.ts
  export interface FillPlan { phonetics: number[]; dict: number[] }   // dict stays [] until Task 6
  export function planFill(words: Word[], skip: ReadonlySet<number>): FillPlan;
  export type FillResult = { ok: true; emptied: number[] } | { ok: false; busy: true } | { ok: false; busy: false; message: string; emptied: number[] };
  export function runFill(deps: Deps, plan: FillPlan, onProgress: (done: number, total: number) => void): Promise<FillResult>;
  ```
  `emptied` = phonetics ids whose transcription is still empty after the run (the provider adds them to its skip set).
  - Provider context gains `fill: { done: number; total: number } | null`, `fillError: string | null`, `startFill(): void` (replaces `startPhonetics`), `retryFill(): void` (clears `fillError`, then `startFill`).
  - `running`/`progress` are untouched by the fill.
- i18n: `words.fill.progress` "Добавляю транскрипции: {done} из {total}" / "Adding transcriptions: {done} of {total}"; `words.fill.error` "Не удалось добавить транскрипции: {message}" / "Could not add transcriptions: {message}"; `words.fill.retry` "Повторить" / "Retry".

- [ ] **Step 1: Failing tests (`fill.test.ts`)**
  - `planFill` picks ready words with empty transcription minus `skip`, and never pending or failed words.
  - `runFill` reports progress `0/n … n/n`. It returns `emptied` for a word the reply left empty. A failed LLM call returns `{ok:false,busy:false,message}`. When the job lock is held (insert the lock row the way existing generate tests do), it returns `{ok:false,busy:true}` and writes nothing.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `fill.ts`, then the provider.**
  - Remove `phoneticsStarted` and the `phonetics` queue from `loop`. Add a separate async `fillLoop` guarded by a `filling` ref (StrictMode double mount = one run).
  - `startFill` returns at once when `filling.current` or `looping.current` is true. Otherwise it awaits `fixNames()`, lists words, runs `planFill` with the skip ref, and returns if the plan is empty.
  - After `loop` finishes a generation, it calls `startFill()` so new words get their dictionary step later (Task 6).
  - Busy → `fill = null`, no error.
  - Words page: `useEffect(() => startFill(), [startFill])`. Under the progress line, render `fill` as `aria-live="polite"` text. Render `fillError` as `<Notice>` with a `Button size="sm" variant="outline"` Retry.
- [ ] **Step 4: E2E (`words.spec.ts`)**
  - `?state=words-fill&delay=300`: "Добавляю транскрипции: 0 из 3" appears, then goes away. Open the first word's training card (or its word page): the transcription is shown.
  - `?state=words-fill&fail=cli_error`: notice with "Preview failure", and Retry is visible. Trainings and Regenerate stay enabled.
  - `cursor.spec`: Retry `pointer`.
- [ ] **Step 5: Run unit + `words.spec` + `cursor.spec`, typecheck, lint; commit** `feat(words): visible transcription fill on each Words page visit`

### Task 3: Search icon + Cmd+F; "Saved" confirmation

**Files:**
- Modify: `src/ui/pages/Words.tsx` (search field), `src/ui/words/WordForm.tsx`, `src/ui/words/WordDetails.tsx` (ExerciseEditor), `src/core/i18n/{ru,en}.ts` (`words.saved` "Сохранено" / "Saved")
- Create: `src/ui/words/useSavedFlag.ts`
- Test: `tests/e2e/words.spec.ts`

**Interfaces:**
- Produces: `useSavedFlag(): { saved: boolean; markSaved(): void; clear(): void }`. `markSaved` sets true and clears it after 3000 ms; `clear` cancels. The timer is cleared on unmount.

- [ ] **Step 1: E2E first**
  - On `/words`, the search field has an `svg` inside its wrapper. `page.keyboard.press('Meta+f')` on the Words page focuses `#words-search` and selects its text (`selectionStart 0`, `selectionEnd = value.length`). `Control+f` does the same.
  - On `/words/<id>`, change the translation and press Save: `role=status` "Сохранено" is visible. Typing in a field hides it. After saving an exercise, its own status shows.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**
  - Lucide `Search` (`aria-hidden`, `pointer-events-none`, absolute, left) with `pl-8` on the input.
  - A window `keydown` listener in `Words` while mounted: `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f'` and no `[role=dialog]` open → `preventDefault`, then focus and select.
  - `WordForm` (edit mode only): `markSaved()` after a successful update, `clear()` in every field's onChange. Next to Save: `<span role="status" className="inline-flex items-center gap-1 text-sm text-success"><Check aria-hidden className="size-4" />{t(lang,'words.saved')}</span>` while `saved`. The same in `ExerciseEditor`.
- [ ] **Step 4: Run `words.spec`, typecheck, lint.**
- [ ] **Step 5: Commit** `feat(words): search icon with Cmd+F, saved confirmation`

### Task 4: Edit the word from a training (modal panel)

**Files:**
- Create: `src/ui/words/WordEditPanel.tsx`
- Modify: `src/ui/words/WordDetails.tsx` (`backTo` optional: no Back link when absent), `src/ui/words/CardView.tsx` (props `paused`, `onEdit`; button in `IntroView` and `FeedbackView`; both window key handlers return early when `paused`), `src/ui/pages/WordsPractice.tsx`, `src/core/i18n/{ru,en}.ts` (`words.edit` "Изменить слово" / "Edit word", `words.edit.close` "Закрыть" / "Close")
- Test: `tests/core/words/practice.test.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Produces:
  - `WordEditPanel({ wordId: number | null; onClose(): void; onDeleted(id: number): void })`: a modal `Sheet` (`modal` default true), open when `wordId !== null`. It loads the view with `loadWordViews` and shows `SheetTitle` = the word, then `<WordDetails view onChanged onDeleted />` without `backTo`.
  - `withWord(cards: PracticeCard[], word: Word): PracticeCard[]` in `src/core/words/practice.ts` replaces `.word` on that word's cards and leaves everything else as it is.

- [ ] **Step 1: Failing tests**
  - `practice.test.ts` `withWord replaces the word on its cards only`.
  - E2E:
    - On the intro card (`?state=words&...` new training), "Изменить слово" opens a dialog titled with the word.
    - Change the translation to `проверка`, Save, close with Esc: the card band shows `проверка`. Focus is back on the Edit button.
    - On the feedback after an answer, the button opens the panel too.
    - On a `build` card after a wrong answer's feedback, open the panel, type letters into its translation field, close: the next card's attempts dots are unaffected. Also, with the panel open from the feedback, `Enter` typed in the field does not advance the card.
    - Delete in the panel (confirm): the panel closes and the word's remaining tests are gone (header total shrinks).
    - `cursor.spec`: Edit word, the panel close button, panel Save/Delete `pointer`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**
  - `WordsPractice`: `const [editing, setEditing] = useState<number | null>(null)`. Pass `paused={editing !== null}` and `onEdit={() => setEditing(pc.wordId)}` to `CardView`.
  - On close: reload the word by id (`listWords`) and `setCards(withWord(cards, fresh))`, then `setEditing(null)`.
  - On delete: `setEditing(null)`, then `leaveWord(id, async () => {})`. The word is already deleted by `WordDetails`. `leaveWord` drops its later cards and advances.
  - The Edit button is `Button variant="ghost"` with lucide `Pencil`, placed after the WordCard in both views.
- [ ] **Step 4: Run unit + `words.spec` + `cursor.spec`, typecheck, lint.**
- [ ] **Step 5: Commit** `feat(words): edit the word in a panel from a training`

### Task 5: Dictionary data layer (migration, repo, Net port, kaikki parser, HTTP plugin)

**Files:**
- Create: `src/db/migrations/0008_word_dictionary.sql`, `src/core/words/dictionary.ts`, `src/adapters/tauri/net.ts`, `src/adapters/preview/previewNet.ts`
- Modify: `src/core/words/types.ts` (`Word.dict`), `src/core/db/repos/words.ts` (row mapping, `setDict`, rename reset in `updateWord`), `src/core/ports.ts` (`Net`, `Deps.net?`), `src/ui/app/boot.ts` (tauri + preview `net`), `src-tauri/Cargo.toml` (`tauri-plugin-http = "2"`), `src-tauri/src/lib.rs` (`.plugin(tauri_plugin_http::init())`), `src-tauri/capabilities/default.json` (`http:default` allow `https://kaikki.org/*`, `https://huggingface.co/*`, `https://*.hf.co/*`), `package.json` (`@tauri-apps/plugin-http` exact `2.9.0`), `tests/core/db/migrate.test.ts` (7 → 8), every place that builds a `Word` object literal (`tests/core/words/helpers.ts`, other tests, preview seed) gains `dict: { translations: [], checked: '' }`
- Test: `tests/core/words/dictionary.test.ts`, `tests/core/db/words.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type DictChecked = '' | 'found' | 'none';
  export interface Word extends WordFields { id: number; generation: Generation; dict: { translations: string[]; checked: DictChecked } }
  // ports.ts
  export interface Net { getText(url: string): Promise<{ status: number; text: string }> }   // throws on network failure
  // Deps: net?: Net
  // repos/words.ts
  export async function setDict(db: Db, id: number, translations: string[], checked: Exclude<DictChecked, ''>): Promise<void>;
  // dictionary.ts
  export function kaikkiUrl(word: string): string;
  export function parseKaikki(jsonl: string): string[];        // Russian translations, cleaned, sense order, deduped, max 8
  export function cleanRu(raw: string): string | null;          // strips U+0301, keeps leading Cyrillic tokens, null when none
  export function normRu(s: string): string;                    // trim, lowercase, ё→е, drop (...) and trailing punctuation
  export function dictMatches(translation: string, dict: string[]): boolean;  // whole comma item equality after normRu
  export type LookupResult = { checked: 'found' | 'none'; translations: string[] };
  export function lookupDict(net: Net, word: string): Promise<LookupResult>;  // 404 → none; other non-200 → throws
  ```
  - `parseKaikki` reads every JSONL line's `translations[]` with `code === 'ru'`, plus `senses[].translations[]` with `code === 'ru'`.
  - `cleanRu` cuts at the first token containing a Latin letter or ending with `.` (`сдать pf trans.` → `сдать`, `бро́сить pf the habit` → `бросить`).
  - `previewNet` serves the four fixture files for their kaikki URLs (`import.meta.glob('./kaikki/*.jsonl', { query: '?raw', import: 'default', eager: true })`) and 404 otherwise.
  - `TauriNet` uses `fetch` from `@tauri-apps/plugin-http` with header `User-Agent: en-learn`.

- [ ] **Step 1: Failing tests**
  - `dictionary.test.ts`, reading the fixtures with `readFileSync`:
    - `kaikkiUrl('Assertion')` → `.../a/as/assertion.jsonl`; `kaikkiUrl('give up')` → `.../g/gi/give%20up.jsonl`; `kaikkiUrl('a')` → `.../a/a/a.jsonl`.
    - `parseKaikki(assertion)` → `['утверждение']`.
    - `parseKaikki(compel)` contains `принуждать` and `заставлять`, has at most 8 items and no duplicates.
    - `parseKaikki(give up)` includes `сдаваться`, `сдать`, and no item contains Latin letters or U+0301.
    - `dictMatches('голословное утверждение', ['утверждение'])` false; `dictMatches('утверждение, заявление', ['утверждение'])` true; `dictMatches('Лёгкий толчок (локтем)', ['лёгкий толчок'])` true; `dictMatches('', [...])` false.
    - `lookupDict` with a fake Net: 404 → `{checked:'none',translations:[]}`, 200 → found, 500 → throws.
  - `words.test.ts`:
    - A new word reads `dict {translations:[],checked:''}`.
    - `setDict` writes both fields.
    - `updateWord` with the same `word` keeps dict; with a changed `word` it resets it to `[]`/`''`.
    - `generatePhonetics`' write keeps dict.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**
  - Migration: `ALTER TABLE word ADD COLUMN dict_translations TEXT NOT NULL DEFAULT '[]'; ALTER TABLE word ADD COLUMN dict_checked TEXT NOT NULL DEFAULT '';`, with a comment line like 0007.
  - `updateWord` reads the stored word first and adds `dict_translations = '[]', dict_checked = ''` to the UPDATE only when `lower(trim(old)) !== lower(trim(new))`.
  - Run `yarn add @tauri-apps/plugin-http@2.9.0` (exact). Do not run `cargo` (not buildable here).
- [ ] **Step 4: Run, expect PASS; typecheck, lint, `tests/core/db`.**
- [ ] **Step 5: Commit** `feat(words): dictionary fields, kaikki parser and HTTP plugin`

### Task 6: Dictionary step in the fill run; prompt; dictionary line on the card and word page

**Files:**
- Modify: `src/core/words/fill.ts` (`planFill(words, skip, lang)`: `dict` = ready words with `dict.checked === ''` when `lang === 'ru'` and `deps.net` present; `runFill` does the dict step after phonetics without the job lock), `src/ui/words/WordsJobProvider.tsx` (passes `lang`), `prompts/words.md` (translation line per spec R3), `src/ui/words/WordCard.tsx`, `src/ui/words/WordDetails.tsx` (the same line under the form), `src/core/i18n/{ru,en}.ts`, `src/adapters/preview/fixtures.ts` + `wordsSeed.ts` (state `words-dict`: `assertion` with translation `голословное утверждение`, `compel` with `принуждать`, both ready, transcription set, `dict_checked ''`)
- Test: `tests/core/words/fill.test.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes: `lookupDict`, `setDict`, `dictMatches`, `kaikkiUrl` (Task 5).
- Produces: `DictLine({ word, lang })` inside `WordCard.tsx`, also used by `WordDetails`. It renders only when `lang === 'ru'` and `word.dict.checked === 'found'`.
  - A muted line: `Словарь: a, b, c` and a link "Wiktionary" (`ExternalLink` to `https://en.wiktionary.org/wiki/<encodeURIComponent(word.word.replaceAll(' ', '_'))>`).
  - When the translation is non-empty and `!dictMatches`, a line with lucide `AlertTriangle` and "Перевода нет в словаре, проверьте".
- i18n (ru only needed by the spec; add en keys with English text for parity): `words.dict` "Словарь: {list}" / "Dictionary: {list}"; `words.dict.warn` "Перевода нет в словаре, проверьте" / "Translation not in the dictionary, please check"; `words.fill.progress` stays (now counts both steps).

- [ ] **Step 1: Failing tests**
  - `fill.test.ts` with a fake Net:
    - `ru`: dict ids are looked up after phonetics, and progress total = both counts.
    - A 404 sets `none`.
    - A thrown Net error leaves `''` and returns `{ok:false,busy:false,message}` while the other words are still written.
    - The dict step runs even when the job lock is held by another job.
    - `en` → `dict: []`.
    - `net` absent → `dict: []`.
  - E2E `?state=words-dict`:
    - After the Words page visit, open the `assertion` word page: "Словарь: утверждение" and the warning are shown.
    - `compel` shows its line without the warning.
    - The intro card of `assertion` (new training) shows both.
    - After switching the app language to English in Settings, neither shows (the preview has no language URL parameter).
    - `cursor.spec`: the Wiktionary link `pointer`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In the prompt, replace the translation line with the spec R3 text verbatim.
- [ ] **Step 4: Run unit + `words.spec` + `cursor.spec`, typecheck, lint.**
- [ ] **Step 5: Commit** `feat(words): Wiktionary check of translations`

### Task 7: Kokoro voice

**Files:**
- Create:
  - `src/ui/voice/files.ts` (pinned file list and URLs)
  - `src/ui/voice/download.ts` (`ensureVoiceFiles`)
  - `src/ui/voice/io.ts` (`VoiceIo` port + Tauri impl via plugin-fs + plugin-http)
  - `src/ui/voice/kokoro.worker.ts`
  - `src/ui/voice/engine.ts` (`KokoroEngine`)
  - `src/ui/voice/VoiceProvider.tsx` (context)
  - `src/ui/voice/previewEngine.ts`
- Modify:
  - `src/ui/words/speech.ts` (keeps `canSpeak`/system `speak` as the fallback)
  - `src/ui/words/WordCard.tsx` (speaker uses the context; progress ring)
  - `src/ui/app/boot.ts` / `CoreProvider.tsx` (provide the engine: Tauri → Kokoro, preview → preview engine)
  - `src-tauri/tauri.conf.json` (`csp` and `devCsp`: add `'wasm-unsafe-eval'` to `script-src`, add `worker-src 'self' blob:`)
  - `src-tauri/capabilities/default.json` (fs scope `$APPDATA/voice/**` for read, write, mkdir, rename, remove, exists, stat)
  - `package.json` (`kokoro-js` exact `1.2.1`)
  - `src/core/i18n/{ru,en}.ts` (`words.voice.loading` "Загрузка голоса: {n}%" / "Loading voice: {n}%")
- Test: `tests/ui/voiceDownload.test.ts`, `tests/ui/voiceEngine.test.ts`, `tests/ui/speech.test.ts`, `tests/e2e/words.spec.ts`, `tests/e2e/csp.spec.ts` (still passes)

**Interfaces:**
- Produces:
  ```ts
  // files.ts
  export const VOICE_REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
  export const VOICE_FILES: { path: string; size: number }[];   // the six files of Global Constraints
  export const voiceUrl = (path: string) => `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${VOICE_REVISION}/${path}`;
  export const VOICE_BY_VARIANT = { 'en-GB': 'bf_emma', 'en-US': 'af_heart' } as const;
  // io.ts
  export interface VoiceIo {
    size(path: string): Promise<number | null>;                         // null when missing
    download(url: string, dest: string, onBytes: (n: number) => void): Promise<void>;  // streams to dest, throws on failure
    rename(from: string, to: string): Promise<void>;
    remove(path: string): Promise<void>;
    read(path: string): Promise<ArrayBuffer>;
  }
  // download.ts
  export function ensureVoiceFiles(io: VoiceIo, dir: string, onProgress: (fraction: number) => void): Promise<void>;
  // engine.ts
  export type VoiceStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'failed';
  export interface VoiceEngine {
    status(): VoiceStatus; progress(): number;              // 0..1
    subscribe(fn: () => void): () => void;
    speak(text: string, variant: SpellingVariant): void;   // never throws
    stop(): void;
  }
  export function createKokoroEngine(deps: { io: VoiceIo; dir: string; makeWorker: () => Worker; system: { canSpeak(): boolean; speak(t: string, v: SpellingVariant): void; cancel(): void }; play: (pcm: Float32Array, rate: number) => { stop(): void } }): VoiceEngine;
  // VoiceProvider.tsx
  export function useVoice(): VoiceEngine | null;   // null → system voice only (as today)
  ```
- Behaviour pinned by tests:
  - `ensureVoiceFiles` skips files whose size equals the expected size. It downloads the others to `<file>.part`, checks the `.part` size, then renames. A wrong size or a thrown download removes the `.part` and rethrows. Progress = bytes done / total bytes of the files still to fetch.
  - The engine starts in `idle`.
    - `speak` in `idle` or `failed` starts `ensure` → `loading` (reads the files, posts them to the worker) → `ready`. Meanwhile the press plays with the system voice.
    - `speak` in `downloading` or `loading` plays with the system voice and starts nothing new.
    - `speak` in `ready` cancels any system speech and any playing audio. It posts `{ id, text, voice }`, and when the reply's `id` is the latest, it plays it. Replies for older ids are dropped.
    - `stop()` stops audio, cancels system speech and invalidates the pending id.
    - Results are cached in a Map keyed by `voice|text` (at most 200 entries, oldest dropped). A cached result plays at once without posting.
    - A worker `error` message or an `ensure` failure → `failed`, and that press keeps the system voice.
  - Worker messages:
    - In: `{type:'init', files: Record<string, ArrayBuffer>}` → out `{type:'ready'} | {type:'error', message}`.
    - In: `{type:'speak', id, text, voice}` → out `{type:'audio', id, pcm: Float32Array, rate} | {type:'error', id, message}`.
  - Worker internals:
    - It replaces `self.fetch` for URLs starting with `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/`. It serves the path after the revision segment from `files`; any other URL is a 404 `Response`.
    - Settings: `env.useBrowserCache = false` (transformers), `KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm' })`, and ORT `numThreads = 1`.
    - The ORT `.wasm`/`.mjs` come from local Vite `?url` imports set through kokoro's exported `env.wasmPaths`.
    - The worker is created with `new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })`.
  - Playback uses one shared `AudioContext` and an `AudioBufferSourceNode`.
  - WordCard: speaker buttons call `engine.speak` (or the system `speak` when the engine is null). On unmount, the card calls `engine.stop()`. While `status() === 'downloading'`, each speaker shows a small ring with `aria-label` "Загрузка голоса: N%" and stays enabled. Buttons are hidden only when the engine is null and `canSpeak()` is false.
  - Preview engine: records texts in `window.__spoken`. `?voice=downloading` holds status `downloading` at 40%.

- [ ] **Step 1: Failing tests**
  - `voiceDownload.test.ts` (fake io): skips complete files; a short file and a throwing download both leave no `.part` and rethrow; the progress sequence ends at 1.
  - `voiceEngine.test.ts` (fake worker = object with `postMessage` + test-driven `onmessage`, fake system, fake play):
    - The first speak falls back to system and moves to `ready` after the init reply.
    - A second speak posts and plays.
    - Two quick speaks play only the second reply.
    - `stop()` before the reply → nothing plays.
    - A cache hit plays without posting.
    - An init error → `failed`, and the next speak retries `ensure`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** (`yarn add kokoro-js@1.2.1` exact; check `yarn build` still bundles and the worker chunk is emitted).
- [ ] **Step 4: E2E**
  - `words.spec`: pressing the band speaker on a word card pushes the word to `window.__spoken`. `?voice=downloading` shows "Загрузка голоса: 40%" on the speaker.
  - `csp.spec` still passes.
  - `cursor.spec`: the speaker is `pointer` while downloading.
- [ ] **Step 5: Run unit + e2e, typecheck, lint, `yarn build`; commit** `feat(words): Kokoro voice with download on first use`

### Task 8 (controller, not a subagent): real-model check, docs

- [ ] In the sandbox (needs `huggingface.co` and `*.hf.co`):
  - Download the six files to the scratchpad.
  - Serve a test page in Playwright Chromium under the production CSP (as `csp.spec` does), which loads the real worker with those bytes and synthesises "assertion" with `bf_emma`. Record the time to the first audio.
  - This is not committed if it needs network.
- [ ] `docs/macos-checklist.md`:
  - `cargo check` with `tauri-plugin-http`.
  - The first speaker press downloads about 92 MB with progress, then plays. Measure the time to the first sound (go/no-go).
  - Offline after a restart.
  - `bf_emma`/`af_heart` by ear.
  - No CSP errors in the console.
  - kaikki: "assertion" shows the warning, a phrase works.
  - The transcription fill completes on one Words page visit.
- [ ] `docs/superpowers/handoff.md`: round 6 line, licences (Kokoro model and kokoro-js Apache-2.0; phonemizer npm Apache-2.0 wrapping espeak-ng GPL-3.0), the HTTP plugin deviation.
- [ ] Spec: note the HTTP-plugin deviation under R9.
- [ ] Final checks: `yarn typecheck`, `yarn lint`, `yarn vitest run`, `yarn playwright test tests/e2e/words.spec.ts tests/e2e/cursor.spec.ts tests/e2e/csp.spec.ts tests/e2e/settings-day.spec.ts tests/e2e/settings-icon.spec.ts --trace off`.
