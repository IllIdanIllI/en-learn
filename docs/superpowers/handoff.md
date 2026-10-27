# Handoff (state after S1 build, 2026-10-27)

- Branch `claude/vibrant-keller-e6as6x`, PR https://github.com/IllIdanIllI/en-learn/pull/1 (open). All S1 tasks 1–23 + rework + final-review fixes are merged into the branch; tsc/eslint clean, Vitest 355, Playwright 56, cargo check OK.
- Docs: spec `specs/2026-10-22-s1-core-loop-design.md`, plan `plans/2026-10-22-s1-core-loop.md`, decisions and open items `s1-decisions.md`, Mac checks `../macos-checklist.md`, evals `../../evals/README.md`.
- Waiting on the learner: run the app on macOS (checklist), review eval labels (`evals/cases/grade.json`) and seed rules (`seed/rules/`), visual feedback ("looks Claudified"), and answer whether to watch the PR for CI/review comments.
- Next stages: S2 (writing + rewrite, errors-per-100-words metric, vocabulary/preposition decks, exports, ⌘K), S3 (speaking, recording, Whisper).
- Working preferences: subagent-driven development; Haiku 5.5 for simple tasks, Sonnet 5.5 at most for harder tasks and reviews; stop at checkpoints the learner names; concise, structured answers; ask before guessing.
