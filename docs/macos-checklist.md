# macOS checklist

Manual checks on a real Mac with `yarn tauri dev` (or a built bundle). They cover what the Linux container could not: the Tauri shell scope, the SQL plugin and Finder launch. Work in order. Each step has an action, the expected result and what to record if it fails.

Setup: Claude Code installed at `~/.local/bin/claude` and signed in. Start with a fresh database: quit the app and delete `~/Library/Application Support/io.github.illidanilli.enlearn/enlearn.db`.

## Spike checks

1. **`claude` is found.**
   - Action: start the app, open Settings.
   - Expected: the Claude CLI line shows `~/.local/bin/claude` with a version number.
   - If it fails: record the text on the line, the output of `ls -l ~/.local/bin/claude` and `claude --version`.

2. **`$HOME` expands in the shell scope.**
   - Action: same as step 1. The version check runs `$HOME/.local/bin/claude --version` through the scope `claude-local-version`.
   - Expected: found, not "Not found". The Prerequisites page does not appear.
   - If it fails: record the exact error from the devtools console (Cmd+Opt+I). Fix to try: `sudo ln -s ~/.local/bin/claude /usr/local/bin/claude`, restart the app, and check the line shows `/usr/local/bin/claude`. Record that the symlink was needed.

3. **A long multi-line prompt passes the argument validators.**
   - Action: run Setup (step A below), then on Today press "Start session".
   - Expected: the session is generated. The system prompt is multi-line and the user prompt is long, both go after `--` as the last argument.
   - If it fails: record the error shown and the last row of `sqlite3 enlearn.db "select kind, ok, error from llm_call order by id desc limit 3"`. Note whether the error names an argument validator or the scope.

4. **plugin-sql runs the migrations.**
   - Action: start the app with no `enlearn.db`.
   - Expected: the app starts, the database file exists, and `sqlite3 enlearn.db "select schema_version from meta"` prints the latest version. No error toast.
   - If it fails: record the console error and the output of `sqlite3 enlearn.db ".tables"`. A "multiple statements" error means `src/core/db/migrate.ts` needs a different split.

5. **Not signed in.**
   - Action: run `claude auth logout` in a terminal, then reload the app (Cmd+R) or restart it.
   - Expected: the Prerequisites page shows `~/.local/bin/claude` as "Installed, not signed in", with the fix steps.
   - Then, with a session already generated, trigger a call (grade a session) while logged out.
   - Expected: an error message, no data is lost, and Retry works after `claude` is signed in again.
   - If it fails: record the full envelope. Run `claude -p --output-format json --tools "" -- hi` in a terminal and copy stdout, stderr and the exit code. `parseEnvelope` matches `not logged in`, `login`, `authenticat` or `/login`, so the wording matters.
   - Sign in again by running `claude` before going on.

6. **PATH and HOME when launched from Finder.**
   - Action: build with `yarn tauri build`, quit the dev app, open the bundle from `src-tauri/target/release/bundle/macos/` by double click in Finder, and generate a session.
   - Expected: the same result as in `yarn tauri dev`. The app passes its own PATH, so `claude` finds its tools without a login shell.
   - If it fails: record the error text and whether `claude` started at all (Settings line, `llm_call` rows).

## Acceptance walk-through

A. **Fresh database and setup (criterion 1).**
   - Action: delete `enlearn.db`, start the app, accept the sample programme (3 weeks), start date next Monday.
   - Expected: the programme is saved, the starter rules appear on the Rules page, Today opens.
   - If it fails: record the step and the message.

B. **Today's full session (criterion 2).**
   - Action: on Today, generate the session. Use a day that is not rest (change the programme start so today is in week 1, or wait for a weekday slot that is not `rest`).
   - Expected: blocks appear in order (spelling, review or task, and so on). The answer key is hidden. Each item has an input. Spelling words are shown with their hint.
   - If it fails: record the message and the `llm_call` rows (`kind`, `ok`, `error`).

C. **Submit and feedback (criterion 3).**
   - Action: answer all items (some right, some wrong), submit.
   - Expected: feedback with verdict icon and word per item, rule citations (rule name and section), a pattern note for the session, and "tomorrow" checks. If an answer looks like a stray symbol, a clarification question appears first.
   - If it fails: record the message and the `grade` row in `llm_call` (`error`, `response`).

D. **Error bank, progress and next checks (criterion 3).**
   - Action: open the Error bank and Progress pages.
   - Expected: each wrong answer is in the Error bank under its topic, Progress shows today as practised with the correct and wrong counts, and next checks are scheduled.
   - If it fails: record what is missing and the item that should have produced it.

E. **Dispute and drop (criterion 4).**
   - Action: on a wrong item, write a dispute and send it. Choose an item that the model should drop (for example a correct alternative answer).
   - Expected: a reply with a decision (keep, correct or drop). On drop, the item no longer counts and the session score is recalculated, with the Error bank and Progress counts adjusted.
   - If it fails: record the decision, the score before and after, and the `dispute` row in `llm_call`.

F. **Light day (criterion 5).**
   - Action: on the next day (or another fresh database with the date moved), press "Start light day", answer, submit.
   - Expected: a shorter session. Progress marks the day as a light day (`light day`), not as a full day.
   - If it fails: record the number of items generated and how Progress shows the day.
