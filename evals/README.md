# Model evals

Answers one question: is the chosen model (for example `claude-haiku-5-5` or `claude-sonnet-5-5`) good enough for the app's two demanding jobs, building a session and grading answers against the rulebook.

The evals call the real `claude` CLI through the same code the app uses: `buildClaudeArgs`, `parseEnvelope`, `callStructured`, `generateSession` and `gradeSession`, with the prompts from `prompts/` and the programme and rules from `seed/`. Everything runs against a temporary in-memory database (`scripts/lib/nodeHarness.ts`); nothing touches your real data. No app check is loosened for the eval.

## Run

```
yarn eval                                   # claude-haiku-5-5, both suites
yarn eval --model claude-sonnet-5-5         # another model
yarn eval --suite generate                  # or: grade, all (default)
```

The summary is printed as Markdown and written to `evals/results/<date>-<model>.md` (git-ignored). Progress goes to stderr.

Cost: every call is billed. A measured full Haiku run (`claude-haiku-5-5`, both suites) cost about $0.17 and took about 27 minutes, nearly all of it generation, which runs one context at a time. Sonnet costs several times more per token. The total is printed at the top of the result file. Run it when you change a prompt, a rule format or the model, not on every commit.

## Generation suite (`evals/cases/generate/*.json`)

Ten fixed contexts: different weekdays and slots (spotting, topic, second set, speaking, writing, review and rewrite), a light day on a rest day, days with one and two due re-checks, a day with review input and an inattention error, and a notice week. A context is `date`, optional `light`, optional `noticeWeek` (turns that programme week into a notice topic) and optional `history` (graded sessions written before the run, so the app's own replay produces due re-checks and review input).

Each context goes through the real `generateSession`, so the code checks and validate_session run exactly as in the app. Per context it records:

- stored: did the session pass everything within the app's two attempts;
- attempts used;
- check violations in the first generate call (the app's block-plan check plus `checkGenerated`: placeholders, Cyrillic, topic keys, rule sections, counts, TD-1, TD-7, TD-8); only a `check:` failure counts as a violation, any other failure of that call (schema, timeout, CLI) is shown as a first-call error. A retry with 0 violations and no error means validate_session defects pushed the session below the checks; the final failure message says which;
- defects found by validate_session in the stored session;
- cost and time.

It measures whether the model follows the task-design rules without help, and how often the retry or the reviewer has to save it. It does not judge whether the sentences are good teaching material; read a few stored sessions yourself for that.

## Grading suite (`evals/cases/grade.json`)

32 model-graded cases over the four seed topics, in the formats gap and fix, plus three spelling cases that only check the code path (spelling is graded by code, never by the model; they are reported separately and are not part of accuracy, per-verdict figures or tone). Each case has the item, the learner's answer, the expected verdict (`correct`, `wrong`, `rule_gap`, `needs_clarification`, `defect`), an optional list of acceptable fixes, the deciding rule section and a short `why`. Categories: exact correct, wrong, a different but correct fix (TD-7), `✓` on a correct sentence, `✓` on a wrong sentence, an answer outside the rulebook (rule_gap), a misspelled correct fix (correct plus spellingErrors), an over-correction trap, an unclear answer (needs_clarification), a faulty item with two valid answers (defect).

Cases are batched per topic into one `gradeSession` call with the message format of the app. Scoring (`evals/score.ts`, unit-tested in `tests/evals/score.test.ts`):

- verdict accuracy overall and per expected verdict, with what the model said instead;
- fix accuracy: for items graded wrong that have a labelled fix, does the model's fix equal one of them or end with it ("I have written" matches "have written");
- tone: violations of the app's tone check in the model's first response, before the app's retry (the app rejects and retries such answers, so a violation costs a call rather than reaching you);
- whether misspelled correct fixes reach `spellingErrors`;
- errors: a failed call or a missing item.

## Review the labels before trusting the scores

The labels were written from `seed/rules/*.md` by the assistant, not by you. Some are judgement calls (the `rule_gap` cases, `art-05`, a defective item, `tps-06` where `ok` is read as unclear). Open `evals/cases/grade.json`, read each `why`, and change any label you disagree with; a wrong label makes a good model look bad or the reverse. The mismatch table in the result lists the label reason next to what the model said, so disagreements are quick to settle. Rule sections are written in Russian because the seed rules are.
