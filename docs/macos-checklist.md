# macOS checklist

Manual checks on a real Mac with `yarn tauri dev` (or a built bundle). They cover what the Linux container could not: the Tauri shell scope, the SQL plugin, Finder launch and the rule chat's CLI conversation. Work in order. Each step has an action, the expected result and what to record if it fails.

Setup: Claude Code installed at `~/.local/bin/claude` and signed in. Start with a fresh database: quit the app and delete `~/Library/Application Support/io.github.illidanilli.enlearn/enlearn.db`.

## Spike checks

1. **`claude` is found.**
   - Action: start the app, open Settings.
   - Expected: the Claude CLI line shows `~/.local/bin/claude` with a version number.
   - If it fails: record the text on the line, the output of `ls -l ~/.local/bin/claude` and `claude --version`.

2. **`$HOME` expands in the shell scope.**
   - Action: same as step 1. The version check runs `$HOME/.local/bin/claude --version` through the scope `claude-local-version`.
   - Expected: found, not "Not found". Today does not show the "Claude is not available" notice.
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
   - Expected: Today shows "Claude is not available" with a link to the Claude check; that page shows `~/.local/bin/claude` as "Installed, not signed in", with the fix steps. Rules, Error bank, Progress and Settings still open.
   - Then, with a session already generated, trigger a call (grade a session) while logged out.
   - Expected: the message "Run `claude` in Terminal and sign in" with an "I have signed in" button, no data is lost, and the button retries once `claude` is signed in again.
   - If it fails: record the full envelope. Run `claude -p --output-format json --tools "" -- hi` in a terminal and copy stdout, stderr and the exit code. `parseEnvelope` matches `not logged in`, `login`, `authenticat` or `/login`, so the wording matters.
   - Sign in again by running `claude` before going on.

6. **PATH and HOME when launched from Finder.**
   - Action: build with `yarn tauri build`, quit the dev app, open the bundle from `src-tauri/target/release/bundle/macos/` by double click in Finder, and generate a session.
   - Expected: the same result as in `yarn tauri dev`. The app passes its own PATH, so `claude` finds its tools without a login shell.
   - If it fails: record the error text and whether `claude` started at all (Settings line, `llm_call` rows).

## Acceptance walk-through

A. **Fresh database and setup (criterion 1).**
   - Action: delete `enlearn.db`, start the app, accept the sample programme (3 weeks), start date = today.
   - Expected: the programme is saved, the starter rules appear on the Rules page, Today opens.
   - If it fails: record the step and the message.

B. **Today's full session (criterion 2).**
   - Action: on Today, generate the session. Use a day that is not rest (the sample programme starts today, so today is in week 1; if today's weekday slot is `rest`, wait for a day that is not).
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
   - Action: on the next day (or another fresh database with the date moved), on a rest day press "Start light day", or use the light-day toggle before starting; answer, submit.
   - Expected: a shorter session. Progress marks the day as a light day (`light day`), not as a full day.
   - If it fails: record the number of items generated and how Progress shows the day.

## Data folder

G. **Move the data (spec F1).**
   - Action: Settings → Data folder → "Change…", pick a new empty folder (for example `~/Documents/enlearn-data`), confirm.
   - Expected: "Moving data…" shows, the app reloads, the Data folder row shows the new path, and Today still shows your lessons. The new folder has `enlearn.db` and, if you had overrides, `prompts/`. The old `enlearn.db*` and `prompts/` are gone; `location.json` stays in the app data folder.
   - Also: check the move succeeds on a DB that was in use (open Today, grade or edit something first, then move).
   - If it fails: record the error line and the console output.

H. **Restart after a move.**
   - Action: quit the app and start it again. Put a changed `grade.md` into `<new folder>/prompts/` first and generate or grade something.
   - Expected: data and history load from the new folder, the changed prompt is used, and the Data folder row still shows the new path (the picked folder stays readable after restart).
   - If it fails: record whether the DB or the prompts failed and the console error.

I. **Refusals.**
   - Action: try to pick (1) the current folder, (2) a folder inside the current one, (3) a folder that already has an `enlearn.db`.
   - Expected: no copy is made and the row shows "This is the current folder.", "The new folder can't be inside the current one." and "This folder already has a database." (Russian when the language is Russian). The app keeps working.

J. **A failed move keeps the old folder.**
   - Action: pick a folder you cannot write to (for example make one with `chmod 555`), confirm.
   - Expected: the row shows "Could not move the data: …", no files are left in the target, the old folder still has everything, and the app keeps working without a reload (add an answer or change a setting to check the database).

J2. **Access to the custom folder after a move and a restart (security round 1).**
   - Action: after a move (G), put a changed `grade.md` into `<new folder>/prompts/` and grade or generate something without restarting. Then quit, start the app again and repeat.
   - Expected: both times the changed prompt is used and the data loads. A folder you picked earlier that is not the current data folder is not accessible to the app after the restart. After a second move, the previous folder stays reachable until the restart.
   - Also: a custom folder chosen before this round (not named `EnglishExamCoach`) keeps working, prompt overrides included, as long as it still holds `enlearn.db`; it can be moved again.
   - If it fails: record whether it failed right after the move or only after the restart, and the console error.

J3. **Move into `EnglishExamCoach` and refusals (security round 1).**
   - Action: Settings → Data folder → "Change…", pick `~/Documents`.
   - Expected: the confirm names `~/Documents/EnglishExamCoach`; after the move the data is in that subfolder and nothing else in `~/Documents` changed. Moving again removes only the app's own files from the old subfolder.
   - Also: picking your home folder, `/`, a folder in `~/Library` (other than the app data folder), `/System…` or a disk under `/Volumes` is refused with a message; a non-empty `EnglishExamCoach` is refused.
   - If it fails: record the picked folder and the message.

## Security policy (security round 1)

O. **Production build works under the content security policy.**
   - Action: `yarn tauri build`, open the bundle, generate and grade a session, open a rule and send a chat message. Open the devtools console (Cmd+Opt+I) if the build allows it.
   - Expected: everything works; no "Refused to …" content-security-policy errors in the console.
   - If it fails: copy the console error (it names the blocked directive).

P. **Dev mode works under `devCsp`.**
   - Action: `yarn tauri dev`, same steps as O.
   - Expected: the page renders (not blank) and works; no content-security-policy errors.
   - If it fails with a refused inline script: the React refresh preamble changed (usually after upgrading `@vitejs/plugin-react`). Copy the `sha256-…` hash from the console error into `devCsp` `script-src` in `src-tauri/tauri.conf.json`.

## Rule chat (round 5)

K. **First message (shell scope `claude-local-chat`).**
   - Action: Rules → open a rule → "Ask about this rule": ask a question (for example "When is the zero article used?") and press Send.
   - Expected: "Thinking…", then a reply in the Settings language. No error line.
   - If it fails: record the "No reply: …" text and the last row of `sqlite3 enlearn.db "select kind, ok, error from llm_call order by id desc limit 3"`. An error naming a validator or the scope means `src-tauri/capabilities/default.json` and `buildClaudeArgs` disagree.

L. **Next message continues the conversation (`--resume … --fork-session`, scope `claude-local-chat-next`).**
   - Action: in the same chat ask a follow-up that needs the first answer (for example "Give one more example of that").
   - Expected: the reply follows on from the first one, and the second call reads the first one from the cache: `sqlite3 enlearn.db "select id, json_extract(response, '$.session_id'), json_extract(response, '$.usage.cache_read_input_tokens') from llm_call where kind = 'rule_chat' order by id desc limit 2"` shows two different session ids and a cache read on the newer row close to the older row's cache write.
   - If it fails: record the error and the `llm_call` rows as in K.

M. **Proposal and save.**
   - Action: ask for a change (for example "Add a trap about 'the' with plural nouns"). Open both tabs, "New version" and "Changes". Press "Save version" without a reason, then with one.
   - Expected: the diff shows added lines green and removed lines red; without a reason nothing is saved; with a reason a new version appears in the rule history and the chat is cleared.
   - If it fails: record the step and the message.

N. **Budget set.**
   - Action: Settings → set a budget per call (for example 0.50), then repeat K and L in a new chat.
   - Expected: same as K and L (scopes `claude-local-chat-budget` and `claude-local-chat-next-budget`).
   - If it fails: record the error and the `llm_call` rows.
