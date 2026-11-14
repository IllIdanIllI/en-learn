# Design: new essay topic (2026-11-14)

Agreed with the learner in chat on 2026-11-14. Binding where it says something; otherwise the session and writing specs hold.

## Why
The learner keeps getting the same essay prompt and cannot change it. Cause found: when a lesson is built, `generate_session` is never told which essay prompts the learner already had, so the AI picks its favourite again.

## Choices (picked in chat)
- Both: new lessons avoid past prompts automatically, and the essay card gets a button for a new topic.
- The button is on the essay card in Today only.
- Text already typed: ask first (keep it or clear it).

## T1. No repeats when a lesson is built
- When the lesson has an essay block, the `generate_session` context gets a section "Recent essay prompts (do not reuse or paraphrase)" with the learner's last 30 essay prompts (blocks of kind `writing`, format `essay`, any session, newest first).
- `prompts/generate_session.md`, essay format line, gains: "The prompt must differ in subject from every prompt listed under Recent essay prompts."
- Rewrite blocks are not affected.

## T2. "New topic" button on the essay card
- Shown on an essay block (format `essay`, not `rewrite`) while its text is not checked yet and the session is open; placed on the line under the prompt, after it: a ghost button with the lucide `RefreshCw` icon, "Новая тема" / "New topic".
- Disabled while a lesson generation runs (the existing generation job) and while its own request runs; then it reads "Подбираю тему" / "Finding a topic" with a spinner.
- Pressing it with an empty text area starts the request at once. With text, a dialog first: title "Сменить тему?" / "Change the topic?", buttons "Оставить текст" / "Keep the text", "Очистить текст" / "Clear the text", "Отмена" / "Cancel". Keep or Clear start the request; Clear empties the text area and its saved draft only when the new prompt arrives (a failure keeps the text).
- **The request**: a new AI call kind **`essay_prompt`** (`prompts/essay_prompt.md` + `essay_prompt.schema.json`, bundled like the others, overridable in the prompts folder, listed in Settings with model `claude-sonnet-5-5`, effort `low`). Input: the current prompt, the recent prompts of T1 (the current one included), and the week's grammar topic title when the session has one ("where it fits naturally, invite its use without naming it", as in `generate_session`). Output `{ "prompt": string }`: an IELTS Task 2 prompt (opinion or discussion), about 250 words expected, in English, a different subject from every listed prompt.
- The reply is accepted when the prompt is 40 to 600 characters after trimming and, compared lowercased with spaces collapsed, equals none of the listed prompts; otherwise the call counts as failed.
- On success the block's `instruction` is replaced in the database and the card shows the new prompt; nothing else in the session changes.
- On failure the old prompt and the text stay, and a notice under the prompt reads "Не удалось сменить тему: <message>" / "Could not change the topic: <message>"; the button works again.
- The debug log records kind `writing`: `new topic ok` or `new topic error <message>`.

## Tests
- Vitest: the context section (only with an essay block, 30 newest, newest first); `essay_prompt` input text; reply check (length bounds, duplicate after normalisation, schema); the repo update of `instruction` for that block only.
- E2E (preview, with a canned `essay_prompt` reply): the button on an open essay card, not on a rewrite or a checked essay; empty text → new prompt shown; with text → dialog; Keep keeps the text, Clear clears it; Cancel changes nothing; a failure (preview `?fail=cli_error`, which fails every AI call, on a state whose lesson is already built) shows the notice and keeps the prompt; cursor cases for the button and the dialog buttons.
