# Handoff (state after the S1 feedback round, 2026-10-27)

- Branch `claude/vibrant-keller-e6as6x`, PR https://github.com/IllIdanIllI/en-learn/pull/1 (open). S1 plus the feedback round F1–F7 are on the branch: data folder, code pre-grading, highlighting, pointer cursor, batch disputes, finish/close/add more questions, loader. tsc/eslint clean, Vitest 422, Playwright 67, cargo check OK.
- Docs: S1 spec `specs/2026-10-22-s1-core-loop-design.md`; feedback round spec `specs/2026-10-27-s1-feedback-round.md` and plan `plans/2026-10-27-s1-feedback-round.md`; decisions and open items `s1-decisions.md`; Mac checks `../macos-checklist.md` (G–J are new: data folder); evals `../../evals/README.md`.
- Waiting on the learner: run the app on macOS (checklist incl. G–J), feedback on the new features, review eval labels and seed rules, visual design pass, whether to watch the PR.
- Next stages: S2 (writing + rewrite, errors-per-100-words metric, vocabulary/preposition decks, exports into the data folder, ⌘K), S3 (speaking, recording, Whisper).
- Working preferences: subagent-driven development; Haiku 5.5 for simple tasks, Sonnet 5.5 at most for harder tasks and reviews; stop at checkpoints the learner names; concise, structured answers; ask before guessing.
