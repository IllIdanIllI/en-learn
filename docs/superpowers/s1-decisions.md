# S1 implementation: decisions and open items

Record of the decisions made on the learner's behalf while building S1 (from the subagent-driven build ledger), and what is still open. Each decision states what it costs if it turns out wrong.

## Decisions (in the order they were made)

| T3 self | Db.execute returns {lastInsertId,rowsAffected}; spec §3 says Promise<void> | Ruling below |
| T6 self | loadSeed() reads seed/ but tests use tests/fixtures/seed; T21 calls loadSeed(today) | Ruling below |
| T8 self | consistency test "first session 10 days ago → n:10" vs n=daysBetween+1 | Ruling below |
| T9→T10 | callStructured must substitute {{nativeLanguage}} (stated only in T10) | Ruling below |
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

## Still open

- **Mac-only checks** (`docs/macos-checklist.md`): `$HOME` in the shell permission, long multi-line arguments, plugin-sql migrations, the not-signed-in output, PATH/HOME when launched from Finder. Not verifiable in the Linux build container.
- **Rule gaps to add later** (no source at hand, so not added): present perfect with for/since ("I have lived here for five years"); modal verbs take no -s.
- **Model quality** (`evals/`): Haiku 5.5 stored 7–8 of 10 generated sessions (some on the second attempt) and graded 29–31 of 32–33 labelled answers as labelled; results vary between runs. Grading labels need the learner's review before the numbers are trusted. Sonnet 5.5 has not been evaluated.
- **Small known limitations**: a few rare error messages are still English (rebuild failure, missing session, boot "claude is not available"); rule-draft and dispute errors show the raw message with Retry; rule sources in the side panel are plain text, not links (Tauri webview).
- **Design pass**: the learner noted the UI looks generic ("Claudified"); revisit after trying the app.
