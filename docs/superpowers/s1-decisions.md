# S1 implementation: decisions and open items

Record of the decisions made on the learner's behalf while building S1 (from the subagent-driven build ledger), and what is still open. Each decision states what it costs if it turns out wrong.

## Decisions (in the order they were made)

- Db.execute returns {lastInsertId,rowsAffected} (plan) over spec's void — inserts need ids; plugin-sql returns both — cost if wrong: none.
- T6 adds pure parseSeed(files:{programme:string; rules:Record<string,string>}, today) and loadSeed(today) wrapper (Vite glob on /seed); startDate = first Monday on/after today, endDate = start+20 days; tests use parseSeed on fixture files — plan's loadSeed() had no date input and couldn't read fixtures — cost if wrong: small rename in T18/T21.
- T8 consistency fixture's "10 days ago" means first session on today−9 (10 days inclusive → n=10) — matches spec D17 inclusive count — cost if wrong: off-by-one in caption.
- T9 callStructured replaces {{nativeLanguage}} in the system prompt with "Russian"/"English" from settings — T10 requires it, T9 is the only owner — cost if wrong: none.
- subagent commits keep the Co-Authored-By trailer of the model that actually ran (e.g. Haiku 5.5); the plan's 'no model identifiers' rule covers message bodies, not the required attribution trailer — cost if wrong: cosmetic trailer edits.
- Task 4 initial keys limited to title.week, title.review and the 5 sidebar labels; other UI keys come with their UI tasks — plan's "every UI string" can't be known before the UI exists — cost if wrong: none.
- Russian plural forms (дня/дней, лёгкий/лёгких) are handled in Task 20 where counts are shown (small plural helper), not in Task 4 — note for Task 20 dispatch; the plan's fixed caption only fits some numbers — cost if wrong: awkward grammar in captions.
- all core SQL uses `?` positional params (works in SQLite via plugin-sql/sqlx, better-sqlite3, sql.js); Db adapters convert booleans to 0/1 and undefined to null — cost if wrong: param rewrite in Tauri adapter.
- migrations runner owns the `meta` table (CREATE TABLE IF NOT EXISTS meta(schema_version INTEGER NOT NULL)); 0001_init.sql does not create it — cost if wrong: none.
- seed file formats — seed/programme.json = {title, weeks:[{title,key,kind}], background:[...], slots:{"1".."7": Slot}} (no dates); rule .md front matter between '---' lines: `topic: <key>` and `sources:` followed by `- <title> | <url>` lines; parsed by a tiny parser, no YAML dependency — cost if wrong: reformat seed files in Task 21.
- error bank rows for `spot` items use was = item.prompt (the wrong fragment) and shouldBe = item.expected (a missed error is a noticing mistake); other formats use was = answer.text, shouldBe = answer.fix or item.expected when fix empty — spec §4.1 only defines was/should for typed answers — cost if wrong: error bank display tweak.
- ClaudeCli constructor takes homeDir explicitly: new ClaudeCli(runner, location, cwd, homeDir) — PATH needs the real home path, core cannot read env — cost if wrong: none.
- ClaudeLocation, CLAUDE_LOCATIONS, scopeName and buildClaudeArgs live in core (src/core/llm/claude.ts) instead of the Tauri adapter — prereq check (core, Task 16) needs them and core can't import adapters — cost if wrong: file move.
- user prompt is passed as the last CLI argument after '--' (args: flags [+ budget] + '--' + prompt), not via stdin — verified 2026-10-22: claude -p blocks until stdin EOF and Tauri's Child has no stdin close; with a positional prompt and open stdin the CLI waits 3s then proceeds; '--' lets a prompt start with '-'. Requires capability arg arrays +2 entries and spec §10.1 / plan Global Constraints wording update — cost if wrong: one-line arg change.
- all schema fields required, so llm/types.ts fields are non-optional (items/paragraphs/question always present, possibly empty); refs echoed by grade; prompts in English, learner-facing prose in {{nativeLanguage}}; Task 10 may spend ~5 Haiku calls to confirm the CLI accepts each schema — cost if wrong: minor type edits in Tasks 11–14.
- grade input carries the full current rule body per topic (Task 13 must send it) — needed for full-body rule-gap proposals (D2) — cost if wrong: bigger grade prompts.
- every gap/fix block incl. review has ≥3 items (pad with fresh same-topic sentences); due-topic check items override the light-day ≤5 review cap — spec §6.2 caps vs §6.3 floor/check rule conflict; checks are the scheduling contract — cost if wrong: slightly longer light days.
- ruleSection = heading text without '##'; Task 11 checks normalise headings — cost if wrong: none.
- dispute on rule_gap: keep = stays excluded pending rule edit, correct = count now, drop = remove — spec §8.5 allowed the dispute but left meanings undefined — cost if wrong: one prompt sentence.
- fix-task items show the whole sentence with the tested fragment in [square brackets] (also on ✓ items, so it marks where to look, not whether it is wrong) — makes 'fix in place, 1–2 words' (TD-7) unambiguous — cost if wrong: prompt edit if the learner prefers unmarked sentences.
- DB block order = spelling (code-built, if words) then generated blocks in order; spot hidden errors become items (prompt = wrong fragment, expected = correction, paragraph index); block.passage = JSON array of paragraph texts; items get rule_id/rule_version = topic rule current version; validate refs use generated-block indices (before spelling insertion); weekTopicHadWrongThisWeek from graded counted wrong answers on the week topic since the week's Monday; review input = effective-wrong, non-inattention answers of the last graded session; generateSession refuses if a non-draft session exists for today — spec §6.2 leaves these mechanics open — cost if wrong: mapper edits.
- callStructured gains opts.maxAttempts (default 2); generateSession passes 1 so its own 2-attempt loop is the only retry — spec §6.2 step 5 cost bound — cost if wrong: none.
- partial grading results awaiting clarification are kept in a module-level Map keyed by sessionId (single-window desktop app; lost on reload = learner re-submits) — plan said "in memory" without an owner — cost if wrong: re-grade after reload.
- grade refs are built from DB order: b<block.ord>.i<item.ord> and b<block.ord>.p<paragraph>.e<k> (k = order of that paragraph's hidden-error items); the grade user message includes each topic's full current rule body (Task 10 ruling) and the item's stored rule_version section; spelling-block items graded by code also write spelling_attempt rows (correct/wrong) — cost if wrong: mapper edits.
- execute Task 15 (rulebook) before Task 14 (actions) — Task 14's decideRuleGap consumes saveRuleVersion from Task 15 — cost if wrong: none.
- decideRuleGap(db, gapId, approve, now) gains `now` (saveRuleVersion needs a timestamp) — cost if wrong: none.
- Playwright launches with executablePath '/opt/pw-browsers/chromium' when that file exists (container), else bundled browser; never run 'playwright install' — cost if wrong: config edit on Mac.
- preview fixtures are built by running the real core (saveProgramme/insertSeedRules on an inline mini-seed in src/adapters/preview/fixtures.ts, generateSession/gradeSession with a previewLlm returning canned valid outputs) on sql.js with FixedClock 2026-10-20 (Tue, week 1); all 8 states implemented in Task 17 so later UI tasks only render them; Playwright uses the Vite dev server — cost if wrong: fixture rework.
- Tauri mode boot = appDataDir/homeDir from @tauri-apps/api/path → TauriDb(Database.load('sqlite:enlearn.db')) → startApp → checkPrerequisites(TauriProcessRunner) → ok: ClaudeCli(runner, location, appDataDir, homeDir) + TauriPromptStore(appDataDir); not ok: route /prerequisites — cost if wrong: wiring edits.
- selected-sidebar dot is 4px instead of DESIGN's 2px — 2px is nearly invisible in the screenshot — cost if wrong: one class.
- Setup prefill comes from a provider-level seed loader — preview: inline mini-seed; Tauri: loadSeed(today) with catch → empty form until Task 21 adds seed files; replacing an existing programme asks inline (no modal); provider gains recheckPrerequisites() that reruns the check and swaps deps.llm on success — cost if wrong: provider edits.
- Prerequisites button says "Check now" not spec's "Check again" — DESIGN.md and the i18n test forbid "again" in UI — cost if wrong: label edit.
- installer command `curl -fsSL https://claude.ai/install.sh | bash` confirmed against official Claude Code setup docs — cost if wrong: string edit.
- plan Task 19 split into 19a (view/answer/grade/feedback) and 19b (rule panel, actions, rule draft, light/rebuild/rest) — one task was too large for a single reviewable diff — cost if wrong: none.
- SessionPage remounts keyed by sessionId + build counter (session ids can be reused after Rebuild deletes a session) — cost if wrong: none.
- rule-panel sources render as plain text (title + URL), not links — external links don't open from the Tauri webview without the opener plugin — cost if wrong: add opener plugin later.
- Russian captions avoid number-noun agreement instead of a plural engine — ru 'Дней с занятиями: {x} из {n}. Лёгких: {y}.', en 'Practised {x} of the last {n} days, {y} light' (supersedes plan's fixed ru caption) — cost if wrong: caption wording.
- the rule body owns the Sources section (FR-14); the structured sources list renders only when the body lacks a Sources heading (rule view and Today panel) — cost if wrong: one condition.
- seed source URLs were found and checked via web search by the controller (direct HTTP to the sites is blocked in this container) and handed over in seed-sources.md; implementer must use only those — cost if wrong: a dead link in a seed rule.
- Cambridge "Conditionals: if" added as a seed source for polite will/would in if-clauses (summary from web search covers it) — cost if wrong: one citation.
- evals share a Node harness extracted from scripts/smoke-cli.ts (scripts/lib/nodeHarness.ts) and smoke uses it too; grading cases may be batched per topic into one grade call; evals/results/ gitignored; only Haiku is run automatically — cost if wrong: small refactor.
- product bug found by evals (generate prompt "Formula" example vs Russian seed headings) is fixed inside Task 23 fix round: prompt says copy the heading verbatim, context lists allowed section headings per topic — cost if wrong: prompt edit.
- one extra Haiku eval re-run (~$0.2) to verify the fix — cost if wrong: ~$0.2.
- final whole-branch review runs on Sonnet (user limited subagents to Sonnet at most; skill would prefer the most capable model) — cost if wrong: a subtler issue could slip past.
- drafts persisted in a draft_answer table (0001 edited in place, unreleased); earlier ungraded generated session shown on Today when today has none; seed start = today; session.id AUTOINCREMENT — cost if wrong: schema edits before release.

## Feedback round decisions (2026-10-27)

Spec `specs/2026-10-27-s1-feedback-round.md`, plan `plans/2026-10-27-s1-feedback-round.md`.

- `closedSessions: number[]` (last 30) is kept in settings; adding questions reopens the session — cost if wrong: trivial move to its own table.
- The data folder relies on the dialog plugin's runtime scope plus persisted-scope; fs commands are also scoped to `$APPDATA/**` and `$APPCONFIG/**` — only verifiable on macOS — cost if wrong: widen the scope.
- After "Finish lesson" raised questions, "Check answers" and ⌘Enter keep finishing (blanks skipped) — the learner already chose to finish — cost if wrong: one blank skipped instead of asked.
- An extra set's topic: today's task topic, else the most frequent topic of today's counted mistakes, else the first allowed topic — cost if wrong: a different topic mix.
- Opening a rule is not recorded as support in extra rounds (their items are never re-checks) — cost if wrong: topic replay slightly off.
- Already-answered items are skipped only in an open round of a graded session; an ungraded session is always graded in full, so a crash during grading is still repaired — cost if wrong: none.
- The loader shows an elapsed m:ss clock when there is no estimate yet — cost if wrong: cosmetic.
- A spot paragraph left empty has its hidden errors stored as skipped (not counted), with or without Finish — every paragraph hides 5–7 errors, so empty means not attempted — cost if wrong: untouched paragraphs no longer feed the error bank.
- Unsent dispute text is lost if the page remounts after "Add more questions" — rare — cost if wrong: retype.

## Feedback round 2 decisions (2026-10-28)

Spec `specs/2026-10-28-s1-feedback-round-2.md`, plan `plans/2026-10-28-s1-feedback-round-2.md`, cache findings `notes/2026-10-28-prompt-cache.md`.

- Tips drop error-bank entries with ✓ or + on either side; spelling-mnemonic tips stay — cost if wrong: fewer tips.
- `--effort` is always passed (default medium, grade high); verified on the real CLI with Haiku, Sonnet and Opus — cost if wrong: one setting change.
- Pressed ✓ toggle is a solid success button (contrast checked in both themes); a hand-typed lone ✓ also presses it — cost if wrong: cosmetic.
- Lesson stats are derived from the stored CLI envelopes (no migration); Russian plurals via `Intl.PluralRules` — cost if wrong: none.
- Prompt caching postponed by the learner; findings kept in the notes file.

## Feedback round 3 decisions (2026-10-28)

Spec `specs/2026-10-28-s1-feedback-round-3.md`, plan `plans/2026-10-28-s1-feedback-round-3.md`.

- The fix-block format example always shows an error sentence and its fix, not "→ верно": task content must stay English (a code check rejects Cyrillic) — cost if wrong: no example of the ✓ case.
- "Not counted: TD-2…" items were sentences removed by the quality check; they are now never shown (scores were already right) — cost if wrong: none.
- Every graded lesson gets the close button in the sticky bar; the added-round layout also applies while the round is still open — cost if wrong: layout only.
- An item answered ✓ never shows the ✓ after the chip, right or wrong; a wrong one shows only "→ fix" — cost if wrong: the pressed ✓ is not echoed.
- The error-bank context is cut by code (4 words each side) from stored data, so old errors get it too; the rule-draft prompt now receives these snippets instead of bare answers — cost if wrong: rule drafts see slightly different input.

## Feedback round 4 decisions (2026-10-28)

Spec `specs/2026-10-28-s1-feedback-round-4.md`, plan `plans/2026-10-28-s1-feedback-round-4.md`.

- Words shared by both fragments move into the muted context and count toward its 4-word window — cost if wrong: a little less outer context.
- "Solve skipped" is not offered while the lesson has an unanswered added round; that round is answered first on the normal page — cost if wrong: skipped items wait a little.
- Items left unanswered after "Solve skipped" (leaving mid-way) are still counted and offered, so yesterday's are never stranded — cost if wrong: none.
- Only skipped items of the lesson itself (round 1) are solvable; skipped items of "Add more questions" rounds stay skipped — cost if wrong: those cannot be solved later.
- A half-solved block shows only its unanswered items until it is finished, also on the normal page — cost if wrong: its graded items are out of sight for a while.
- The rule-draft prompt gets the sentences without the "__" marker — cost if wrong: none.
- Skipped spelling items are solvable (K4) but, as before, only skipped gap and fix items return as review input in the next lesson — cost if wrong: a skipped spelling word is not reviewed unless solved.

## Feedback round 5 decisions (2026-10-28)

Spec `specs/2026-10-28-s1-feedback-round-5.md`, plan `plans/2026-10-28-s1-feedback-round-5.md`.

- Session log: only the part of a block title before ": " is bold; titles without ": " stay plain — cost if wrong: none.
- Skipped items of every round are solvable (supersedes round 4's "round 1 only"); yesterday's never-answered added round counts too — cost if wrong: none.
- While today's lesson has an added round with no answers yet, "Solve skipped" is not offered for today; that round is answered first (supersedes the spec's first L2 wording) — cost if wrong: one extra step in a rare case.
- Reopening an all-skipped added round of today and leaving mid-way makes it look new, so the button hides; the items stay answerable on today's page as the open round (pinned by a test) — cost if wrong: the learner answers via the page instead of the button.
- Rule chat: the chat stays (hidden) while an older version or the manual editor is open, and is cleared on any version change; Save is labelled "Сохранить версию" — cost if wrong: small UI change.
- Rule chat cache: `--resume <id> --fork-session`; a clean-environment check showed a new id per turn, full history and growing cache reads (`notes/2026-10-28-prompt-cache.md`) — cost if wrong: none (measured).
- The rule draft no longer gets the learner's errors; the prompt sentences about them (incl. inattention errors) are gone — cost if wrong: drafts may miss a trap the learner hit.

## Still open

- **Mac-only checks** (`docs/macos-checklist.md`): `$HOME` in the shell permission, long multi-line arguments, plugin-sql migrations, the not-signed-in output, PATH/HOME when launched from Finder. Not verifiable in the Linux build container.
- **Rule gaps to add later** (no source at hand, so not added): present perfect with for/since ("I have lived here for five years"); modal verbs take no -s.
- **Model quality** (`evals/`): Haiku 5.5 stored 7–8 of 10 generated sessions (some on the second attempt) and graded 29–31 of 32–33 labelled answers as labelled; results vary between runs. Grading labels need the learner's review before the numbers are trusted. Sonnet 5.5 has not been evaluated.
- **Small known limitations**: a few rare error messages are still English (rebuild failure, missing session, boot "claude is not available"); rule-draft and dispute errors show the raw message with Retry; rule sources in the side panel are plain text, not links (Tauri webview).
- **Feedback round, Mac-only checks**: moving the data folder (checklist G–J: move, restart, refusals, failure keeps the old folder), the folder picker and the confirm dialog.
- **Feedback round, small known limitations** (from reviews, not fixed): moving prompts deletes the old `prompts/` folder recursively; once moved there is no "back to default" button; empty folders created by a failed move stay; Check/Finish are not disabled while a session is rebuilt; one e2e test is timing-sensitive under load.
- **Round 2 small known limitations**: the Progress page loads full CLI responses for stats (fine now; `json_extract` later); the stats toggle is small (24px) with no `aria-controls`; evals now run with the default efforts (grade high).
- **Round 3 small known limitations** (from reviews, not fixed): the "previous questions" toggle has no `aria-controls`; a spelling error answered with nothing or ✓ shows the hint as "Было" and again under it; no e2e for a third added round or for disputing an earlier item after unfolding (logic checked by review).
- **Round 5 Mac-only checks**: the rule chat through the Tauri shell scope (checklist K–N: first message, follow-up with `--resume`, proposal and save, with a budget).
- **Round 5 small known limitations** (from reviews, not fixed): a first rule-chat message rejected by the checks leaves an unused CLI session file; a failed chat message stays in the list without a reply if a different message is sent instead of Retry; the chat tabs are the app's two-option toggle (radio role), not tabs; the CLI session id is not checked as a UUID before it is kept (the shell scope rejects a bad one); no e2e for today's new round next to a skip (unit tests cover it); the bold block-title prefix in the session log has no e2e (unit test only).
- **Design pass**: the learner noted the UI looks generic ("Claudified"); revisit after trying the app.
