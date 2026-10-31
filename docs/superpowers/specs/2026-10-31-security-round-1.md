# Security round 1 (2026-10-31)

Fixes from `notes/2026-10-30-security-audit.md` (M2, L1, L2, L3, L4 and the likely bug I4). M1 and M3 (moving the CLI call and the database out of the webview into Rust) are a later round. Binding where it says something; otherwise the S1 spec and its feedback rounds hold.

## P1. Content security policy (M2)
- `tauri.conf.json` sets a CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`.
- `font-src` allows `data:` because the build inlines three font faces as data URIs (fonts cannot run script).
- `devCsp` is the same plus what `yarn tauri dev` needs for Vite (its http and ws origin in `connect-src`, and whatever else the dev server needs, nothing broader).

## P2. Clean CLI calls (L2, I1)
- Every `claude -p` call (all call and chat shapes) adds the fixed arguments `--safe-mode --disable-slash-commands`, so the learner's CLAUDE.md, hooks, skills, plugins, output styles and slash commands never apply. Verified with Claude Code 2.1.312: sign-in, `--resume … --fork-session` and the cache still work.
- The CLI runs in a dedicated empty folder `<app data>/cli` (created at start), not in the app data folder.
- README "What is sent to Anthropic" says so.

## P3. Safer data-folder move (L3)
- The data always moves into a subfolder `EnglishExamCoach` of the picked folder; it must not exist or must be empty.
- Refused targets (before the subfolder is added): the home folder, `/`, anything under `~/Library` other than the app data folder, `/System`, and volume roots (`/Volumes/<name>`). The refusal message names the reason, in both languages.
- Cleanup of the old folder deletes exactly the files that were copied, then removes the folders that became empty; no recursive delete. A failure leaves the rest in place.
- A folder chosen before this round keeps working where it is.

## P4. File access only for the current data folder (L1, I4)
- Folder grants are no longer remembered across restarts (the persisted-scope plugin is removed).
- At start, Rust reads `location.json` and, if it names a custom data folder that passes the P3 refusal rules, grants the app access to that folder and everything under it (so `prompts/<kind>.md` overrides there can be read and copied).
- After a move, the webview calls a Rust command without arguments that does the same from `location.json`, so the new folder works without a restart.

## P5. Rule-gap proposals (L4)
- The grade reply check rejects a rule-gap proposal whose headings are not skeleton headings in skeleton order (same rule as the rule chat).
- A rule gap stores the rule version it was proposed against. Approving it when the rule has a newer version since is refused with a message to use the rule chat instead.
- The approve view shows the proposal with the same two tabs as the rule chat: "Новая версия" and "Изменения" (diff against the current body).
