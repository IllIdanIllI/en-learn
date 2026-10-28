# Handoff (state after S1 feedback round 2, 2026-10-28)

- Branch `claude/vibrant-keller-e6as6x`, PR https://github.com/IllIdanIllI/en-learn/pull/1 (open). S1, feedback round 1 (F1–F7) and round 2 (G1–G6: tips, styled selects, Opus, effort per call, ✓ toggle in the input, lesson stats) are on the branch. tsc/eslint clean, Vitest 439, Playwright 71, cargo check OK.
- Docs: round 2 spec `specs/2026-10-28-s1-feedback-round-2.md`, prompt-cache findings `notes/2026-10-28-prompt-cache.md` (caching postponed); S1 spec `specs/2026-10-22-s1-core-loop-design.md`; feedback round spec `specs/2026-10-27-s1-feedback-round.md` and plan `plans/2026-10-27-s1-feedback-round.md`; decisions and open items `s1-decisions.md`; Mac checks `../macos-checklist.md` (G–J are new: data folder); evals `../../evals/README.md`.
- Waiting on the learner: run the app on macOS (checklist incl. G–J), feedback on the new features, review eval labels and seed rules, visual design pass, whether to watch the PR.
- Next stages: S2 (writing + rewrite, errors-per-100-words metric, vocabulary/preposition decks, exports into the data folder, ⌘K), S3 (speaking, recording, Whisper).
- Working preferences: subagent-driven development; Haiku 5.5 for simple tasks, Sonnet 5.5 at most for harder tasks and reviews; stop at checkpoints the learner names; concise, structured answers; ask before guessing.
