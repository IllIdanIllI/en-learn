# Product

## Register

product

## Users

One learner preparing for IELTS / TOEFL, studying alone on a laptop at home in the evening (roughly 20:00 to 23:00, dim warm light, often tired after work). A session is 10 to 30 minutes. They read tasks, type short answers, read feedback and grammar rules, sometimes record a spoken answer or write a 150 to 250 word text. Secondary users: other learners who clone the open-source repo and use it the same way.

## Product Purpose

A desktop study coach that builds each day's session from the learner's own mistakes, checks answers strictly against written grammar rules, and schedules re-checks of weak topics. Success: the learner opens it most evenings, finishes a session without friction, and errors per 100 words in their writing go down (target below 3).

## Brand Personality

Warm, quiet, precise. It feels like a good paper notebook under a desk lamp: calm, unhurried, honest about mistakes without judging them. Feedback states the rule and the fix, nothing more. References: Notion and Obsidian (text first, document-like pages, minimal chrome).

## Anti-references

- Typical AI SaaS: gradients, dark neon, glowing accents, big hero metrics, identical card grids.
- Duolingo-style pressure: mascots, confetti, guilt about missed days, "you lost your streak" messages.
- School LMS (Moodle-like grey forms and tables).

Consistency tracking is wanted, framed as "days practised in the last 100", never as a streak that breaks.

## Design Principles

1. **Text first.** Tasks, rules and feedback are reading material; typography and spacing do the work, chrome stays out of the way.
2. **The whole session in view.** A day is one page the learner scrolls through, never a wizard that hands out tasks one by one.
3. **Neutral about mistakes.** Errors are shown as facts with a fix and a rule reference. No blame wording, no repeat counts, no alarming colours.
4. **Progress without guilt.** Show consistency and the trend of the metric; missed days are simply empty, never highlighted.
5. **Calm by default.** Low contrast between surfaces, one warm accent, motion only for state changes.

## Accessibility & Inclusion

- WCAG 2.2 AA: text contrast at least 4.5:1, UI components at least 3:1, visible focus on every interactive element.
- Correct / wrong is never shown by colour alone: always an icon or word as well (colour-blind safe).
- Full keyboard use: submit, reveal key, move between items, start/stop recording.
- Respect `prefers-reduced-motion` (no transitions beyond opacity).
