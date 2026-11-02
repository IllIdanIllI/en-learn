# Design: lesson picker and lasting generation (2026-11-02)

The learner chooses which blocks and task formats a lesson (and an added round) gets, and lesson generation survives leaving the Today page. Binding where it says something; otherwise the S1 spec and its rounds hold. Agreed with the learner in chat on 2026-11-01/02. Writing (S2) is out of scope: it gets its own spec next.

## LP1. The picker before a lesson
- **Where:** on Today, above "Начать сессию" (`today.start`) / "Начать лёгкий день" (`today.startLight`), in the "no lesson yet" state and on rest days. Gone once the lesson exists.
- **Rows** (checkboxes, lesson order):
  - "Повторение" / "Review": only when there is review input or a due re-check.
  - "Задание: вставить пропуск" / "Task: fill the gap"
  - "Задание: исправить предложение" / "Task: fix the sentence"
  - "Задание: найти ошибки" / "Task: find the errors"
  - "Правописание" / "Spelling"
  - "Говорение" / "Speaking"
- **Defaults:**
  - Normal day: review (if shown), the programme's task format for today (`plan.task.format`: gap or fix by weekday on a learn day, spot otherwise), spelling, speaking.
  - Rest day: review (if shown) and spelling.
  - A day outside the programme (`review_only`): review (if shown), spelling, speaking.
  - Nothing is remembered between days.
- **Unavailable rows:** shown disabled with a short reason after the label.
  - gap/fix: there is no week topic ("нет темы недели" / "no topic this week"), or its rule is missing ("нет правила" / "no rule").
  - spot: there are no error-spotting topics with rules ("нет тем" / "no topics").
- The existing "Лёгкий день" toggle on normal days stays as it is, next to the button.
- **Button:** disabled when nothing is ticked. A rest day keeps "Начать лёгкий день" and a light lesson (light review cap, light spelling).
- **Not affected:** rebuild of an ungraded lesson (it reuses the original choice, see LP3), earlier days' lessons, the skipped-questions flow.

## LP2. Topics per format (unchanged rule)
- gap and fix: the current week's topic (`weekTopic`, whatever its kind).
- spot: the error-spotting topics (`spottingTopics(...).included`) plus inattention errors, as now. On a notice-topic spot day, the notice topic stays the spot task's topic, as now.
- Review, spelling and speaking: as now.

## LP3. Generation with a choice
- `LessonChoice = { review: boolean; formats: ('gap' | 'fix' | 'spot')[]; spelling: boolean; speaking: boolean }`. `formats` is in the fixed order gap, fix, spot, with no duplicates.
- One generate call, as now. `buildGenerationContext` builds `blocks` from the choice. Each task block's spec carries its format and topic. The rendered "Blocks to produce" keeps today's line shape `N. task (format <f>, topic <key>)` for gap/fix and for a spot task with a notice topic, and `N. task (format spot)` for a spot task over the error-spotting topics.
- `violations` compares the generated block sequence (kind and, for task blocks, format) with the context's blocks, in order.
- Spelling is built by the app only when ticked. A choice with no review, task or speaking block makes no LLM call.
- `prompts/generate_session.md`:
  - Blocks are produced exactly as listed under "Blocks to produce", in that order. There may be several task blocks.
  - Each task block follows its listed format and topic: gap/fix on the listed topic's rule, spot over the error-spotting topics.
  - The "Task topic" section is the gap/fix topic.
- The session title keeps using the task topic when there is one.
- **Rebuild:** the session stores its choice (new `session.choice` JSON column, nullable, migration 0004). `rebuildSession` reuses it; older sessions without one use today's defaults.

## LP4. The picker for an added round ("Добавить вопросы")
- Pressing `today.addMore` shows the three format rows (gap, fix, spot) and a "Добавить" / "Add" button. Review, spelling and speaking are not offered.
- **Defaults:** today's rule, a single format: the first round's task format if gap or fix, else fix.
- **Topics:**
  - gap/fix: as now (`taskTopic ?? wrongTopic ?? allowed[0]`).
  - spot: the error-spotting topics. The spot row is disabled when there are none.
  - gap/fix rows are disabled when there is no topic at all.
- One generate call for the ticked task blocks. Each gap/fix block has 6 to 8 items; a spot block follows its usual 2 to 3 paragraphs. The prompt's "Extra set" rule changes accordingly. Earlier prompts are still not repeated.
- The button is disabled when nothing is ticked.

## LP5. Generation outlives the page
- **Job state:** the running job (start, rebuild, add round) and its stage, attempt and error move from `Today.tsx` into a `GenerationProvider` mounted in `routes.tsx` around the routes.
- **Returning to Today:** while a job runs, Today shows the same loader and progress and disables every start/add/rebuild button. When the job finishes, Today reloads and shows the result.
- **Errors:** an error from a job that finished while away shows on Today as now.
- **Core guard:** `generateSession`, `rebuildSession` and `extendSession` refuse to start while another of them is running for the same database. The result is `{ ok: false, code: 'busy' }`, shown as the usual error text.

## LP6. Testing
- **Unit:**
  - default choice per day kind;
  - disabled rows and their reasons;
  - context blocks and the rendered "Blocks to produce" for several formats;
  - `violations` with two task blocks (right order, wrong format);
  - spelling skipped when unticked;
  - choice stored and reused by rebuild;
  - extend with several formats (spot paragraphs, 6–8 items for gap/fix);
  - the busy guard.
- **E2E (preview):**
  - the picker shows the defaults;
  - unticking speaking gives a lesson without speaking;
  - ticking gap and spot gives two task blocks;
  - nothing ticked disables the button;
  - the add-round picker adds the ticked formats;
  - leaving Today during generation and coming back shows the loader and no start button.
  - The preview LLM must handle several task blocks.

## Out of scope
Writing (next spec), choosing topics, remembering choices across days, picker for earlier days' lessons.
