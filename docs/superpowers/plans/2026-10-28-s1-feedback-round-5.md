# S1 Feedback Round 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** L1–L4 of the spec.

**Spec:** `docs/superpowers/specs/2026-10-28-s1-feedback-round-5.md`

## Global Constraints
- After every task: `yarn typecheck`, `yarn lint`, `yarn test` clean; UI tasks also `yarn e2e`; Tauri changes also `cargo check` in `src-tauri`.
- No SQL in `src/ui`; UI strings via `t()` with keys in ru and en; no em dashes in UI strings.
- Match surrounding style; sparse comments. Remove only what your change orphans.

## Review Focus
1. Today's fresh added round is never counted or cleared; yesterday's unanswered items are; nothing reopened can be left unreachable (Task 2).
2. The chat never stores a rule version without the learner's reason and Save; a failed reply never changes the stored CLI session id (Task 3, 4).
3. Chat turns after the first use `--resume <id> --fork-session` with a byte-identical system prompt and schema; the Tauri capability allows exactly these new argument shapes (Task 3).
4. Neither the chat nor the rule draft receives error-bank rows or learner answers (Tasks 1, 3).

---

### Task 1: Session log emphasis (Haiku)
**Files:** `src/ui/progress/ProgressLog.tsx`, i18n if the score/total keys need splitting, e2e
- [ ] Implement L1. e2e on `?state=progress`: block line has the prefix and both numbers in separate `<strong>`, "of" outside; total line likewise. Checks; commit `feat: bolder session log numbers`.

### Task 1b: Rule draft without errors (Haiku)
**Files:** `src/core/rules/rules.ts` (`draftRule`), `prompts/rule_draft.md`, `src/adapters/preview/previewLlm.ts` if it reads the rows, tests `tests/core/rules/*.test.ts`
- [ ] Failing test: the rule-draft user message has no error-bank section even when the topic has errors. Implement L4 (drop the rows, the `errorBank`/`plainText` use if orphaned, the prompt's Input sentence about rows and the "check every error-bank row" sentence; keep every other rule). Checks; commit `feat: rule drafts no longer use the learner's errors`.

### Task 2: Skipped questions of added rounds (Sonnet)
**Files:** `src/core/db/repos/answers.ts` (`SOLVABLE`, `countSkippedBySession`, `deleteSkippedAnswers`), `src/core/session/skipped.ts` (pass today's date for the exception), `src/core/session/view.ts` / `src/ui/today/SessionPage.tsx` only if solving mode needs it for round > 1, preview fixture state, tests `tests/core/session/skipped.test.ts`, e2e
- [ ] Failing tests: skipped round-2 item counted and cleared; today's round with no answers not counted and not cleared, the session still offered for its round-1 skips; yesterday's unanswered round-2 items counted; mid-solve leave on round 2 stays counted; spot/question still excluded.
- [ ] Implement L2. e2e on a new preview state (skipped added-round items): button with count, click shows only them with original numbers, grade, button gone. Checks; commit `feat: solve skipped added questions`.

### Task 3: Rule chat core and CLI (Sonnet)
**Files:** `src/core/domain.ts` (`LlmKind` + `rule_chat`), `src/core/db/repos/settings.ts` (defaults), `src/core/ports.ts` (`LlmRequest.resume?: string | null`, `persist?: boolean`; result carries `sessionId`), `src/core/llm/{claude,envelope,call,bundledPrompts}.ts`, `src/adapters/tauri/claudeCli.ts`, `src-tauri/capabilities/default.json` (new shapes per location: `chat` = call without `--no-session-persistence`; `chat-next` = `chat` + `--resume <uuid> --fork-session`; each with a budget variant), `prompts/rule_chat.md`, `prompts/rule_chat.schema.json`, create `src/core/rules/chat.ts`, `src/core/rules/lineDiff.ts`, preview/test LLM adapters, i18n (`llm.rule_chat`), tests.
**Interfaces:**
- Reply: `RuleChatReply = { message: string; proposal: { body: string; sources: Source[] } | null }`; check: proposal headings are skeleton headings in skeleton order, body not empty.
- `ruleChatTurn(deps, ruleId, text, resume: string | null): Promise<LlmResult<RuleChatReply> & { sessionId?: string }>`: first turn's user message holds topic key/title, native language, skeleton headings, current body and sources, then the learner's text; later turns hold only the learner's text.
- `lineDiff(a, b): { kind: 'same' | 'add' | 'del'; text: string }[]` (LCS on lines).
- [ ] Failing tests: args for first/next turn; envelope session id; failed attempt keeps the old id; first-turn message has the rule and no error rows; reply check; `lineDiff`.
- [ ] Implement. Prompt: the rule-draft content rules plus chat behaviour (answer questions; propose only when asked for a change; language rule of L3).
- [ ] Measure with the real CLI if available: two turns, second shows cache read > first turn's; record numbers in `notes/2026-10-28-prompt-cache.md`. Checks incl. `cargo check`; commit `feat: rule chat core with cached CLI conversation`.

### Task 4: Rule chat UI (Sonnet)
**Files:** `src/ui/pages/RuleView.tsx` (or a new `src/ui/rules/RuleChat.tsx`), Settings model row comes from the new kind, i18n, e2e
- [ ] Implement L3 UI: message list, input + Send, loading state, error with Retry; proposal tabs "Новая версия" / "Изменения"; Save → required reason → `saveRuleVersion`, then the chat clears and the page shows the new version.
- [ ] e2e (preview canned reply): ask, see reply; ask for a change, see both tabs, save without reason blocked, save with reason creates a version; Settings shows the Rule chat row. Screenshots light/dark. Checks; commit `feat: rule chat on the rule page`.

### Task 5: Docs and final review
- [ ] `s1-decisions.md`, `handoff.md`; final review (Sonnet); one fix wave; verify checks; push.
