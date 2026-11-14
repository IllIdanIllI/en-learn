# New essay topic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lessons stop repeating essay prompts, and the essay card in Today gets a "Новая тема" button.

**Architecture:** Core: a repo query for recent essay prompts, a context section in `generate_session`, a new small AI kind `essay_prompt` and `newEssayPrompt(deps, blockId)` that calls it, checks the reply and stores the block's new `instruction`. UI: a `NewTopicButton` under the essay prompt with a confirm dialog, wired in `SessionPage`.

**Tech Stack:** React 19/TS, sql.js/SQLite, Vitest (node env), Playwright on the Vite preview.

**Spec:** `docs/superpowers/specs/2026-11-14-writing-topic.md` (T1, T2). The learner chose: both fixes, Today card only, ask before touching typed text.

## Global Constraints
- UI strings only in `src/core/i18n/{ru,en}.ts` (same keys); texts verbatim from the spec; no em dash; no "again"/"снова"/"опять"; no emoji (lucide icons only).
- Every interactive element `cursor: pointer`, disabled `not-allowed`; new buttons get `tests/e2e/cursor.spec.ts` cases.
- Before yarn: `export NODE_USE_ENV_PROXY=1 COREPACK_NPM_REGISTRY=https://registry.npmjs.org`.
- Commits end with exactly these two trailers, and **do not substitute your own model name**:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HffEzTxKLpWZQtcwTs99SY
  ```
- Push after each commit: `git push -u origin claude/admiring-edison-vmhgdm`. Stage only your files. No subagents, no `send_message`.
- Checks per task: `yarn typecheck`, `yarn lint`, full `yarn vitest run` once before committing, touched e2e specs with `yarn playwright test <spec> --trace off`.
- Pinned values: recent prompts **30**, newest first; reply prompt **40 to 600** characters after trim; duplicate check lowercased with whitespace collapsed; kind `essay_prompt` default model `claude-sonnet-5-5` (the existing `DEFAULT_MODEL`), effort `low`.

## Review Focus
1. **A second session the same day, or an added round.** The context lists prompts from all sessions, the current lesson's earlier essay included (an added round must not repeat it). Test in Task 1.
2. **The AI returns the same prompt (or only different case/spaces).** Counts as failed; old prompt kept. Test in Task 1.
3. **Clear chosen, then the request fails.** The typed text stays (draft too). Test in Task 2 (e2e).
4. **The essay is checked while the request runs (or the page is left).** No stale update of a graded block: `newEssayPrompt` refuses when the block already has a writing text; the UI ignores a reply for a block that is no longer open. Test in Task 1 (core refusal).
5. **Button pressed twice quickly.** One request only (button disabled at once). Test in Task 2.

---

### Task 1: Core (context, AI kind, newEssayPrompt)

**Files:**
- Create: `prompts/essay_prompt.md`, `prompts/essay_prompt.schema.json`, `src/core/writing/topic.ts`, `tests/core/essayTopic.test.ts`, `tests/fixtures/llm/essay_prompt.{valid,invalid}.json` (follow the existing fixture pattern for `phonetics`)
- Modify: `src/core/db/repos/writing.ts` (`recentEssayPrompts`, `setBlockInstruction`), `src/core/session/context.ts` (+ its render) and `prompts/generate_session.md` (T1 line verbatim), `src/core/domain.ts` (`LlmKind` + `essay_prompt`), `src/core/llm/bundledPrompts.ts`, `src/core/db/repos/settings.ts` (defaults), `src/ui/pages/Settings.tsx` (`KINDS`), `src/core/i18n/{ru,en}.ts` (`llm.essay_prompt`: `Письмо: новая тема` / `Writing: new topic`), `scripts/lib/nodeHarness.ts`, `src/adapters/preview/previewLlm.ts` (canned reply: a fixed prompt that is not in the preview seed, e.g. "Some people think that cities should ban cars from their centres. To what extent do you agree or disagree?")
- Test: `tests/core/essayTopic.test.ts`, the existing context/generate tests

**Interfaces:**
- `recentEssayPrompts(db: Db, limit: number): Promise<string[]>` — `instruction` of blocks `kind = 'writing' AND format = 'essay'`, newest first (session date desc, then block id desc), any session.
- `setBlockInstruction(db: Db, blockId: number, instruction: string): Promise<void>`.
- Context: when the requested blocks include an essay, the rendered user prompt has a section headed exactly `Recent essay prompts (do not reuse or paraphrase)` with one `- <prompt>` line each; absent otherwise or when the list is empty.
- `essayPromptInput(current: string, recent: string[], weekTopic: string | null): string` (the user prompt text) and `checkEssayPrompt(reply: { prompt: string }, listed: string[]): string | null` (null = ok, else the reason).
- `newEssayPrompt(deps: Deps, blockId: number): Promise<{ ok: true; prompt: string } | { ok: false; message: string }>` — refuses (`ok: false`) when the block is not an open essay (missing, not `writing`/`essay`, or has a `writing_text` row); listed = `recentEssayPrompts(db, 30)` plus the current prompt if missing; week topic title from the block's session when it has one (find how `context.ts` derives the week topic and reuse it; `null` if none); calls `callStructured(deps, 'essay_prompt', …, { sessionId, check })`; on success trims and stores the prompt with `setBlockInstruction`.

- [ ] **Step 1: Failing tests** (`tests/core/essayTopic.test.ts` with the repo's in-memory sql.js test db pattern): `recentEssayPrompts` order and limit (35 essays → 30 newest; rewrites excluded); the context section present with an essay block (newest first) and absent without one; `checkEssayPrompt` length 39 → reason, 40 → ok, 601 → reason, `"  Some  PEOPLE think…"` equal to a listed prompt after normalisation → reason; `newEssayPrompt` with a fake `llm` returning a new prompt → stored on that block only (another essay block unchanged); refuses for a rewrite block and for a block with a writing text (llm not called); a failing llm → `ok: false`, instruction unchanged.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; the prompt file asks for one IELTS Task 2 prompt (opinion or discussion, about 250 words expected, English), a different subject from every listed prompt, inviting the week's grammar topic where it fits naturally without naming it; schema `{ type: object, required: [prompt], properties: { prompt: { type: string } }, additionalProperties: false }`.
- [ ] **Step 4: Run** checks + `yarn playwright test tests/e2e/settings-day.spec.ts --trace off` (Settings lists the new kind) — PASS.
- [ ] **Step 5: Commit** `feat(writing): no repeated essay prompts, essay_prompt AI call`.

### Task 2: "Новая тема" button

**Files:**
- Create: `src/ui/today/NewTopicButton.tsx`, `tests/e2e/writing-topic.spec.ts`
- Modify: `src/ui/today/Block.tsx` or `WritingBlock.tsx` (render under the prompt for an open essay; choose the one that keeps the prompt line and button together), `src/ui/today/SessionPage.tsx` (texts state, draft key `writingDraftKey(block.id)`, reload of the view after success), `src/core/i18n/{ru,en}.ts`, `tests/e2e/cursor.spec.ts`

**Interfaces:**
- Consumes `newEssayPrompt` (Task 1), `useGeneration().running` (disable while a lesson job runs), `logDebug('writing', 'new topic ok' | 'new topic error <message>')`.
- i18n keys (texts verbatim from spec T2): `writing.newTopic`, `writing.newTopic.busy`, `writing.newTopic.confirm`, `writing.newTopic.keep`, `writing.newTopic.clear`, `writing.newTopic.cancel`, `writing.newTopic.error` (`{message}`).
- Dialog: the app's existing dialog component if there is one (search `src/ui/components/ui`), else an `AlertDialog`-style Radix `Dialog`; focus returns to the button on close.

- [ ] **Step 1: E2E first** (`tests/e2e/writing-topic.spec.ts`, preview state with an open essay, find it in `src/adapters/preview/fixtures.ts`, likely `writing`): button visible on the open essay, absent on a rewrite and on a checked essay (`writing-graded`); empty text → click → the canned prompt text replaces the old one; type text → click → dialog; Cancel → prompt and text unchanged, no request; Keep → new prompt, text kept; Clear → new prompt, text area empty (and empty after reload, since the draft is cleared); `?fail=cli_error` with text and Clear → notice `Не удалось сменить тему: …`, old prompt and text kept; double click → one prompt change (assert the busy label appears and the button is disabled). Cursor cases: the button and the three dialog buttons are `pointer`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Busy state set synchronously on press; the success reloads the session view (the page's existing reload path) so `block.instruction` comes from the database.
- [ ] **Step 4: Run** checks + `yarn playwright test tests/e2e/writing-topic.spec.ts tests/e2e/writing.spec.ts tests/e2e/cursor.spec.ts --trace off` — PASS.
- [ ] **Step 5: Commit** `feat(writing): new topic button on the essay card`.

### After the tasks (lead)
- Final review (Sonnet), one fix wave, re-review; lead runs typecheck, lint, full vitest, e2e `writing writing-topic words cursor settings-day settings-debug settings-voice csp screenshots`; handoff line.
