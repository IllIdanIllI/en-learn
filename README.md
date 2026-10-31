# English Exam Coach

A desktop app for daily IELTS and TOEFL English practice. Each day it builds a short session from your rulebook and your past mistakes, grades your answers against the rules, and tracks your error bank and progress. The Claude Code CLI on your machine writes and grades the sessions.

## Status

Stage S1 (core loop) is complete: programme setup, rules (with a chat to ask about a rule or propose a new version), daily session, grading, disputes, solving skipped questions, error bank, progress, settings. Writing, speaking and vocabulary practice are not built yet.

## Prerequisites

- macOS.
- Node 22 with corepack.
- Rust (stable) and the Xcode command line tools (`xcode-select --install`).
- Claude Code, installed with `curl -fsSL https://claude.ai/install.sh | bash` and signed in. Run `claude` once and sign in when asked.

## Setup

```sh
corepack enable
yarn install
yarn tauri dev     # run the app
yarn tauri build   # build an app bundle
```

On first start the app asks you to set up a programme. The sample programme is 3 weeks of IELTS grammar with starter rules. Its start date is the day you set it up, so week 1 begins today.

## Your answers

Answers are saved while you type, so closing the app or opening another page does not lose them. A session you did not finish stays on Today (with its own date) until you grade it or start today's session.

## Where data lives

All data stays on your machine, in the app data directory:

```
~/Library/Application Support/io.github.illidanilli.enlearn/enlearn.db
```

Delete the file to start from scratch.

## Data folder

Settings → Data folder shows where the app keeps `enlearn.db` and `prompts/` (overrides). "Change…" moves them to a folder you pick; the choice is stored in `<app data>/location.json`.

## Prompt overrides

The prompts the app sends are bundled. To change one, put a file in `<app data>/prompts/`:

- `<kind>.md` replaces the system prompt.
- `<kind>.schema.json` replaces the response schema.

`<kind>` is one of `generate_session`, `validate_session`, `grade`, `dispute`, `rule_draft`, `rule_chat`. A missing file falls back to the bundled copy. Restart the app after a change. The bundled files are in `prompts/`.

## What is sent to Anthropic

Only what goes into the prompts: your rules, recent errors (for review tasks), the tasks, your answers and your rule-chat messages. Rule drafts and the rule chat never get your errors. No audio is recorded or sent. This app has no telemetry and makes no network calls of its own. The Claude CLI talks to Anthropic under your own account and its own privacy settings. Rule-chat conversations are kept by Claude Code itself (under `~/.claude/projects/`), because each message continues the previous one; all other calls are not kept. The app's calls do not use your own CLAUDE.md, hooks, skills, plugins or slash commands, and the CLI runs in an empty folder (`cli` inside the app data folder).

## Models and cost

Settings has a model for each kind of call. The default is `claude-sonnet-5-5` for all of them. Pick a cheaper model for the calls you want to keep low. The rule chat reuses its earlier messages from Claude's prompt cache (1 hour), so follow-up messages are cheaper. Rule-chat calls belong to no lesson, so the Progress log does not show them; their tokens are in the `llm_call` table (`response` holds the CLI envelope with `usage`). You can also set a budget per call in USD. Leave it empty for no limit. The CLI checks the budget after a turn, so a call can cost slightly more than the cap.

## Development

```sh
yarn dev            # browser preview with in-memory data
yarn typecheck
yarn lint
yarn test           # unit tests (vitest)
yarn e2e            # browser tests (playwright)
yarn smoke          # real-CLI smoke test, uses claude-haiku-5-5, costs a few cents
(cd src-tauri && cargo check)
```

The browser preview takes a `?state=` query, for example `http://localhost:5173/?state=progress`. The states are listed in `src/adapters/preview/fixtures.ts`.

Manual checks for a real Mac are in [docs/macos-checklist.md](docs/macos-checklist.md).

## Licence

MIT. See [LICENSE](LICENSE).
