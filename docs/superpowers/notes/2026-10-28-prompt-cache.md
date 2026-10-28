# Prompt cache and cost with `claude -p` (measured 2026-10-28, Claude Code 2.1.312)

Postponed by the learner; kept here for when caching is picked up again.

## Measurements (real CLI, flags as the app uses them)

| Call | Cache read | Cache write | Cost |
|---|---|---|---|
| Haiku, dispute prompt, first call | 0 | 6 152 | $0.0017 |
| Haiku, same prompt file, different user message | 1 884 | ~4 260 (repo cwd) / ~2 750 (empty cwd) | $0.0008–0.0012 |
| Haiku, byte-identical request again | 6 148 | 0 | $0.0003 |
| Sonnet, tiny call (a few words in and out) | — | ~4.6k | $0.011–0.013 |

- The CLI caches automatically with a **1-hour TTL** (`ephemeral_1h`). Cache writes cost about 2× the input price; reads about 0.1×.
- Only ~1.9k tokens (CLI preamble) are reused between different calls. The app's own system prompt is not reused: the per-call part comes before it in the cached prefix. A CLAUDE.md in the CLI's cwd adds ~1.5k tokens per call (the app runs in the app data dir, so normally none; a user-level `~/.claude/CLAUDE.md` would be added).
- On Sonnet the fixed overhead per call (~4–6k tokens written to the cache) dominates small calls: ≈ $0.01–0.03 per call before any real work. A lesson is 3–5 calls plus retries/disputes, which fits the observed $0.16–0.22 per lesson.
- `--bare` would drop most of that preamble but needs `ANTHROPIC_API_KEY` (OAuth sign-in is not read), so it does not fit the app's "signed-in Claude Code" setup.
- `--effort low|medium|high` works with Haiku and Sonnet in `-p` mode and cuts thinking tokens (Sonnet tiny call: 0 thinking at low, 165 at high).

## How caching could be used (not built)

- A hit needs an identical prefix: tools (the `--json-schema` structured-output tool) → system prompt → messages. Different call kinds have different schemas and prompts, so they can never share a cache. One conversation for all kinds of a day would re-send the growing history uncached and cost more.
- Workable design: one CLI conversation **per day per call kind** (`--resume <id> --fork-session`, store the new `session_id` only after a successful, validated reply so failed attempts never enter the history; drop `--no-session-persistence`; +2 capability args per call shape). Gains appear only when a kind repeats in a day: a second grading round, "Add more questions", several dispute batches, retries.
- Measure first: the lesson stats in the Progress log show input / cache read / cache write / output tokens per lesson.
