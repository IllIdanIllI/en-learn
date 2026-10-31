# S1 feedback round 2 (2026-10-28)

Binding where it says something; otherwise the S1 spec and `2026-10-27-s1-feedback-round.md` hold.

## G1. Tips while waiting
- A tip stays 8 s (was 6 s).
- Drop error-bank tips whose `was` or `should` is ✓ (or `+`): without the hidden sentence they say nothing.

## G2. Styled selects
- Replace every native `<select>` (Settings models, Setup weekday slots, Error bank kind/topic filters) with one styled select built on Radix Select (`radix-ui` is already a dependency): trigger looks like the app's inputs (height, border, radius, focus ring, chevron), popover uses the popover tokens and shadow, the selected option shows a check, keyboard and screen-reader behaviour from Radix. Works in light and dark themes. The `NativeSelect` component is removed when unused.

## G3. Opus
- `claude-opus-5-5` joins the model list for every call kind. Defaults unchanged.

## G4. Effort per call kind
- Settings gets an "Effort" select per call kind next to its model: low / medium / high. Defaults: `grade` high, all others medium. Stored as `efforts: Record<LlmKind, 'low' | 'medium' | 'high'>`.
- Every call passes `--effort <level>` (after `--model <m>`). The shell capability call shapes gain `"--effort", { "validator": "^(low|medium|high)$" }` in every call entry (4 locations × 2 shapes).

## G5. ✓ inside the fix input
- The "mark as correct" button sits inside the fix input at its start: same size and shape as now, with a tinted background (pressed: stronger tint). The input's text starts after it (left padding), never under it.
- Click: the answer becomes `✓`, the input is disabled and shows the placeholder "Верно как есть" / "Correct as it is" (the field stays visually empty; the stored answer is `✓`). Click again: the input is enabled and cleared. `aria-pressed` reflects the state.
- Typing `✓` or `+` by hand keeps working. The code check (F2) treats the stored `✓` exactly like a typed ✓: expected ✓ → correct without the LLM.

## G6. Lesson stats
- In the Progress log every lesson row with LLM calls can expand a details row: the model(s) used, number of calls (failed ones counted separately), and tokens: input, cache read, cache write, output (thinking is part of output).
- Tokens come from the stored CLI envelope (`llm_call.response`: `usage.input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`), so earlier lessons get stats too. A response that is not a JSON envelope counts as 0 tokens.
