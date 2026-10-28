# S1 feedback round 5 (2026-10-28)

Binding where it says something; otherwise the S1 spec and rounds 1–4 hold.

## L1. Session log emphasis
- A block line reads "**Повторение**: артикли — **2** из **4**": the part of the block title before the first ": " is bold (a title without ": " is not bold), each number is bold on its own, "из" / "of" stays plain.
- The total line reads "**9** из **12** · **75%**" in the same way.

## L2. Skipped questions of added rounds
- Solvable = an active gap, fix or spelling item of a graded session of today or yesterday, in any round (main lesson or added), whose answer is `skipped` (not dropped by a dispute) or missing.
- Exception: in today's session, an added round none of whose items has an answer yet is a new round still to be answered on the page; its items are not counted, and the session is offered only for its other solvable items. On yesterday's session every solvable item counts (that day's page is no longer shown, so nothing can be stranded).
- Solving mode stays as in K4: only the solvable items, original numbers, under the session title; "Проверить ответы" grades only them; late answers count normally.

## L3. Rule chat
- The rule page (Правила → rule) gets a chat panel for the current version. A new chat starts each time the page opens; it ends (cleared) after a save and when the page is left.
- Claude answers questions about the rule and, when asked for a change, proposes a new version (body and sources). It follows the rule-draft content rules: the skeleton headings in order, general mechanism, only British Council, Cambridge Dictionary and Swan as sources, no invented URLs. It never gets the learner's error-bank rows or answers.
- Replies are in the native language from Settings; if the learner writes in another language, Claude answers in that one. Examples stay English.
- A proposal shows under its message with two tabs: "Новая версия" (the rendered body and sources) and "Изменения" (a line diff against the current body: removed lines red, added lines green). "Сохранить" opens the reason field (required, typed by the learner, as in a manual edit) and stores a new rule version through the existing save path. Nothing is stored without that.
- A new LLM kind `rule_chat`, with its own model and effort row in Settings → Models (default Sonnet, effort medium).
- Prompt cache: the chat is one Claude Code conversation. The first message starts a persisted CLI session; each next message runs `--resume <session id> --fork-session` with the same system prompt and schema, so earlier turns are read from the cache (1-hour TTL). The new session id is kept only after a valid reply, so a failed or rejected reply never enters the history. CLI transcripts of these chats are stored by Claude Code under its own folder (`~/.claude/projects/…`).
- Each reply is logged like other calls (cost, tokens incl. cache read and write). A failed reply shows the error with Retry; the chat stays usable.

## L4. Rule draft without the learner's errors
- "Draft a rule" no longer sends the learner's error-bank rows; the prompt drops the input line and the rule that the draft must explain every row. Rules stay general.
