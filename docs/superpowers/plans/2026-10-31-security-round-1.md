# Security Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** P1–P5 of the spec.

**Spec:** `docs/superpowers/specs/2026-10-31-security-round-1.md`; audit: `docs/superpowers/notes/2026-10-30-security-audit.md`.

## Global Constraints
- After every task: `yarn typecheck`, `yarn lint`, `yarn test` clean; UI tasks also `yarn e2e`; Tauri/Rust changes also `cargo check` (and `cargo test` for Rust tests) in `src-tauri`.
- No SQL in `src/ui`; UI strings via `t()` with keys in ru and en; no em dashes in UI strings.
- Match surrounding style; sparse comments. Remove only what your change orphans.
- Never widen the static fs scope (no `$HOME/**`).

## Review Focus
1. The CLI argument lists of `buildClaudeArgs` and every capability entry stay identical, for every shape and location (Task 2).
2. No path is deleted recursively; cleanup touches only copied files (Task 3).
3. The Rust grant accepts only a folder that passes the refusal rules and comes from `location.json`; the command takes no arguments (Task 4).
4. A stale or malformed rule-gap proposal can never become the current rule (Task 5).

---

### Task 1: CSP (Haiku)
**Files:** `src-tauri/tauri.conf.json`
- [ ] Implement P1 (`csp` and `devCsp`). `cargo check`; checks; commit `fix: content security policy`.

### Task 2: Clean CLI calls (Sonnet)
**Files:** `src/core/llm/claude.ts`, `src-tauri/capabilities/default.json` (all call/chat shapes, 4 locations), capability/args tests, boot code that sets the CLI cwd (`src/adapters/tauri/boot.ts` or where `cwd` is chosen) and creates `<app data>/cli`, README.
- [ ] Failing tests: every call/chat shape has `--safe-mode --disable-slash-commands` at the same position in args and capability; cwd is the `cli` folder.
- [ ] Implement P2. Checks incl. `cargo check`; commit `fix: run the CLI without user customizations in an empty folder`.

### Task 3: Safer data-folder move (Sonnet)
**Files:** `src/core/dataFolder.ts`, `src/adapters/tauri/dataFolder.ts`, `src/ui/pages/Settings.tsx` (messages), i18n, tests.
- [ ] Failing tests: refusals (home, `/`, `~/Library/...`, `/System/...`, `/Volumes/X`), target becomes `<picked>/EnglishExamCoach`, non-empty subfolder refused, cleanup list = copied files then emptied folders, no recursive remove.
- [ ] Implement P3. Checks; commit `fix: safer data folder move`.

### Task 4: Rust data-folder grant (Sonnet)
**Files:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` (+ a small module), `src-tauri/capabilities/default.json` (drop persisted-scope permissions if any, allow the new command), `package.json` if a persisted-scope JS package exists, the TS move code (call the command after a move), Mac checklist.
- [ ] Rust unit tests for reading `location.json` and the refusal rules (same as Task 3). Implement P4. `cargo test`, `cargo check`, checks; commit `fix: grant file access only to the current data folder`.

### Task 5: Rule-gap proposals (Sonnet)
**Files:** migration (`src/core/db/migrations.ts`: `rule_gap.base_version`), `src/core/grading/{grade,apply,actions}.ts`, `src/ui/today/ItemActions.tsx` (reuse the chat's proposal tabs; extract a shared component from `src/ui/rules/RuleChat.tsx` if needed), i18n, tests, e2e.
- [ ] Failing tests: grade check rejects bad headings in a rule-gap proposal; base version stored; approve refused when the rule moved; approve ok otherwise.
- [ ] Implement P5; e2e shows both tabs on a rule-gap approve. Checks; commit `fix: checked rule-gap proposals with diff and version guard`.

### Task 6: Docs and final review
- [ ] Mac checklist (CSP dev/prod, prompt override in a custom folder, move into `EnglishExamCoach`, refusals), `s1-decisions.md`, `handoff.md`, README; final review (Sonnet); one fix wave; verify checks; push.
