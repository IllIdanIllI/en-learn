---
name: English Exam Coach
description: A warm, quiet desktop notebook for daily IELTS / TOEFL practice.
colors:
  lamp-night-bg: "#1b1611"
  lamp-night-surface: "#221d18"
  lamp-night-raised: "#2a241e"
  lamp-night-border: "#3d3730"
  cream-ink: "#e6ddce"
  cream-ink-muted: "#b2a99d"
  cream-ink-faint: "#8d847b"
  lamp-amber: "#e1ad63"
  sage-correct: "#8dc18e"
  sage-correct-bg: "#1d2a1d"
  rust-wrong: "#e58870"
  rust-wrong-bg: "#36201b"
  dusk-note: "#8cb4d1"
  paper-bg: "#f7f3eb"
  paper-surface: "#efebe1"
  paper-raised: "#fdfaf4"
  paper-border: "#d9d3ca"
  brown-ink: "#2e241d"
  brown-ink-muted: "#5d534a"
  brown-ink-faint: "#726860"
  ochre: "#955600"
  sage-correct-day: "#3b723e"
  sage-correct-day-bg: "#dceedc"
  rust-wrong-day: "#aa442b"
  rust-wrong-day-bg: "#fbe1db"
  dusk-note-day: "#3b6987"
typography:
  headline:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.35
  reading:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.lamp-amber}"
    textColor: "{colors.lamp-night-bg}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "34px"
  button-secondary:
    backgroundColor: "{colors.lamp-night-raised}"
    textColor: "{colors.cream-ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "34px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.cream-ink-muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
    height: "34px"
  answer-input:
    backgroundColor: "{colors.lamp-night-raised}"
    textColor: "{colors.cream-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
    height: "34px"
  verdict-correct:
    backgroundColor: "{colors.sage-correct-bg}"
    textColor: "{colors.sage-correct}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  verdict-wrong:
    backgroundColor: "{colors.rust-wrong-bg}"
    textColor: "{colors.rust-wrong}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  rule-ref:
    backgroundColor: "{colors.lamp-night-raised}"
    textColor: "{colors.cream-ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  sidebar:
    backgroundColor: "{colors.lamp-night-surface}"
    textColor: "{colors.cream-ink-muted}"
    typography: "{typography.ui}"
    width: "220px"
---

# Design System: English Exam Coach

Stack: React + shadcn/ui + Tailwind inside Tauri. This file is normative: when generating or changing UI, follow the tokens in the frontmatter and the rules below. Product context and principles live in `PRODUCT.md`.

## 1. Overview

**Creative North Star: "The Notebook Under the Lamp"**

The app is a paper notebook on a desk in the evening. The default theme is a warm dark, like a page lit by a desk lamp: brown-black paper, cream ink, one amber accent the colour of the lamp. A light "paper" theme exists for daytime and follows the system setting when the user picks "System". Reading surfaces (tasks, rules, feedback) are set in a book serif; controls and labels use the native system sans so the app feels like a Mac tool, not a web page.

Density is calm, not sparse. A day session is one long document page, read top to bottom, with generous space between blocks and tight space inside them. Chrome is minimal: a quiet left sidebar, a page title, the content column. The system rejects typical AI SaaS styling (gradients, neon, hero metrics, card grids), Duolingo-style pressure (mascots, confetti, guilt about missed days) and grey LMS forms.

Layout rules:
- App shell: left sidebar (220px, `lamp-night-surface`) + content area (`lamp-night-bg`). Sidebar items: Today, Progress, Rules, Error bank, Words, Writing, Speaking, Settings.
- Content column max width 720px (about 70ch of reading text), centred in the content area, 48px top padding.
- Inside a page: 48px between major blocks, 24px between a block heading and its content, 12px between items.
- Window minimum 960 × 640. Below 1100px wide the sidebar collapses to icons (56px).

Motion: restrained. 150 to 200 ms, `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart), opacity and transform only. Used for: key reveal (fade in), verdict appearing after grading (fade), hover/focus colour changes. No page transitions, no entrance choreography. Under `prefers-reduced-motion`, opacity changes only.

**Key Characteristics:**
- Warm dark by default, warm paper light theme.
- Serif for reading, system sans for UI, monospace only for typed answers.
- One accent (amber), used for the primary action, focus and current selection.
- Correct and wrong are muted sage and rust, always paired with an icon or word.
- Flat surfaces separated by tone, not shadows.

## 2. Colors: The Lamp-Night Palette

Warm, low-chroma neutrals tinted toward amber (OKLCH hue about 65), with one lamp-amber accent and two quiet semantic colours. All text pairs below meet WCAG AA; values were checked against both background and surface.

### Primary
- **Lamp Amber** (#e1ad63, oklch(0.78 0.11 75)): primary button, focus ring, selected sidebar item indicator, active tab underline, links. Dark text on it (#1b1611, 8.8:1).
- **Ochre** (#955600, oklch(0.515 0.12 65)): the same role in the light theme (5.3:1 on paper).

### Semantic
- **Sage Correct** (#8dc18e on #1d2a1d; light #3b723e on #dceedc): correct answers, "closed" topics.
- **Rust Wrong** (#e58870 on #36201b; light #aa442b on #fbe1db): wrong answers and the corrected fragment. Muted on purpose: a mistake is information, not an alarm.
- **Dusk Note** (#8cb4d1; light #3b6987): neutral notices: task defect, rule gap, dispute, "item dropped from score".

### Neutral (dark / light)
- **Lamp-Night Bg** (#1b1611) / **Paper Bg** (#f7f3eb): page background.
- **Lamp-Night Surface** (#221d18) / **Paper Surface** (#efebe1): sidebar, toolbar, the second neutral layer.
- **Lamp-Night Raised** (#2a241e) / **Paper Raised** (#fdfaf4): inputs, popovers, secondary buttons, rule-ref chips.
- **Lamp-Night Border** (#3d3730) / **Paper Border** (#d9d3ca): dividers and input borders (1px).
- **Cream Ink** (#e6ddce, 13.3:1) / **Brown Ink** (#2e241d, 13.7:1): body text.
- **Cream Ink Muted** (#b2a99d, 7.8:1) / **Brown Ink Muted** (#5d534a, 6.8:1): secondary text, instructions, labels.
- **Cream Ink Faint** (#8d847b, 4.9:1) / **Brown Ink Faint** (#726860, 4.9:1): placeholders, timestamps, time estimates. Never for anything the user must read to complete a task.

### shadcn/ui mapping
Set these CSS variables in `globals.css` (`.dark` = lamp-night, `:root` = paper). Keep the values in OKLCH in CSS; the hex values above are their sRGB equivalents.

| shadcn variable | Dark (default) | Light |
|---|---|---|
| `--background` | oklch(0.205 0.012 65) | oklch(0.965 0.012 85) |
| `--foreground` | oklch(0.90 0.022 80) | oklch(0.27 0.02 60) |
| `--card`, `--popover` | oklch(0.265 0.014 65) | oklch(0.985 0.008 85) |
| `--muted`, `--sidebar` | oklch(0.235 0.013 65) | oklch(0.94 0.014 85) |
| `--muted-foreground` | oklch(0.74 0.02 75) | oklch(0.45 0.02 65) |
| `--primary`, `--ring` | oklch(0.78 0.11 75) | oklch(0.515 0.12 65) |
| `--primary-foreground` | oklch(0.205 0.012 65) | oklch(0.985 0.008 85) |
| `--secondary`, `--accent`, `--input` | oklch(0.265 0.014 65) | oklch(0.985 0.008 85) |
| `--border` | oklch(0.34 0.014 65) | oklch(0.87 0.014 80) |
| `--destructive` | oklch(0.72 0.12 35) | oklch(0.52 0.14 35) |
| `--success` (add) | oklch(0.76 0.09 145) | oklch(0.50 0.10 145) |
| `--note` (add) | oklch(0.75 0.06 240) | oklch(0.50 0.07 240) |
| `--radius` | 6px | 6px |

### Named Rules
**The One Lamp Rule.** Amber appears on at most 10% of a screen: the primary action, focus, current selection. Never on decoration, headings or icons at rest.

**The No Pure Colours Rule.** No #000, no #fff, no default Tailwind grays or blues. Every neutral is tinted toward amber.

**The Calm Mistake Rule.** Wrong answers use muted rust on a tinted background with a ✗ icon and the fix next to it. Never a full red fill, never shaking, never a red badge count.

## 3. Typography

**Reading Font:** Literata (fallback Georgia, serif). Bundle locally via `@fontsource/literata` (weights 400, 600, italic 400); the app must work offline.
**UI Font:** system-ui stack (SF Pro on macOS).
**Answer Font:** ui-monospace stack, only inside answer inputs and inline format examples.

**Character:** a book serif for everything the learner reads, the native sans for everything they click. Monospace in answers makes each typed letter visible, which matters for spelling.

### Hierarchy
- **Headline** (Literata 600, 1.5rem, 1.3): page title, e.g. "Week 3, Tue 20 Oct · Conditionals". One per page.
- **Title** (Literata 600, 1.25rem, 1.35): block headings ("1. Spelling", "3a. Open the brackets").
- **Reading** (Literata 400, 1.0625rem / 17px, 1.6, max 70ch): task items, rule text, feedback, error-spotting paragraphs, writing editor.
- **UI** (system 400, 0.875rem / 14px, 1.45): buttons, sidebar, tables, settings, instructions under block titles.
- **Label** (system 500, 0.75rem / 12px, 0.01em): time estimates ("3 min"), verdict chips, rule refs ("§2"), table headers. Sentence case, never all caps.
- **Mono** (0.9375rem / 15px, 1.5): typed answers and format examples.

### Named Rules
**The Two Voices Rule.** Serif = content, sans = interface. A button is never serif; a task sentence is never sans.

**The Numbers Rule.** Item numbers, scores and counts use `font-variant-numeric: tabular-nums` so columns line up.

## 4. Elevation

Flat. Depth comes from tonal layers (bg → surface → raised), 1px borders and spacing, not shadows. Surfaces are flat at rest.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 8px 24px oklch(0.1 0.01 65 / 0.45)`): dropdowns, command menu, tooltips. The only shadow in the system.

### Named Rules
**The Flat Page Rule.** Content sits directly on the page. No cards around blocks of a session; a block is a heading plus its content, separated by space.

## 5. Components

Use shadcn/ui primitives (Button, Input, Textarea, Tabs, Table, Tooltip, DropdownMenu, Popover, Toggle, Progress, Sonner) restyled by the tokens above. Every interactive component has default, hover, focus-visible, active, disabled and loading states. Focus: 2px amber ring with 2px offset in the page background colour.

### Buttons
- **Shape:** gently curved (6px).
- **Primary** (amber, dark text, 34px high): one per view: "Check answers", "Start session", "Save text".
- **Secondary** (raised neutral): "Show key", "Export".
- **Ghost** (muted text, no fill): toolbar actions, "Skip", "Light day".
- **Hover:** primary lightens slightly (oklch L +0.04); secondary and ghost get the raised/border tone. **Loading:** label stays, a small spinner replaces the leading icon, button disabled.

### Session page (Today)
- Header: headline, then one line in muted UI text: total time estimate and the rule to read ("Read §2 before block 3"), the rule ref is a link that opens the rule in a side panel.
- Blocks in order (Spelling, Review, Task of the day, Speaking, Words). Block title (Title style) with the time estimate as a Label on the same line, right-aligned.
- Instructions under a title: UI text, muted. The answer format example sits on its own line in mono inside a raised chip.
- **Item row:** number (tabular, faint) · sentence in Reading style · answer input below or inline. For "fix if needed", the input is pre-empty with placeholder `✓ or the corrected fragment`.
- One "Check answers" primary button at the end of the page (and `⌘↵`). No per-item submit.
- Light day: a ghost toggle in the header; the page simply shows fewer blocks, no badge or warning.

### Answer input
- Raised background, 1px border, 4px radius, mono text, 34px single-line (Textarea for writing and speaking notes).
- Focus: amber ring. Placeholder in faint ink. Autocorrect, autocapitalise and spellcheck **off** (`spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`): spelling is being tested.

### Graded item
- After checking, each item shows a verdict chip at the start of its answer line: `✓ Correct` (sage) or `✗` (rust), plus, for wrong items, the expected fragment in Cream Ink and a rule-ref chip (`§2 Traps`).
- The learner's wrong text stays visible in muted ink, not struck through.
- Defect / dropped / disputed items: Dusk Note chip ("Not counted: two answers possible"). Each graded item has a ghost "Dispute" action that opens an inline text field below it, never a modal.

### Feedback summary
- Appears at the top of the page after checking, as plain text, no box: score per block in tabular label style, then three short sections in Reading style: "Correct", "To fix", "Tomorrow's review".
- The pattern sentence ("drops -s when removing *will*") is set in Reading italic on a raised background with full 1px border and 6px radius. Never a coloured side stripe.

### Rule panel
- Opens from any rule ref as a right side panel (420px) over the content area, not a modal. Rule text in Reading style; formula tables use the shadcn Table with label-style headers and 1px borders.

### Speaking question
- Question in Reading style; scheme below as a numbered list ("1. Event", "2. Context"...), one word per step, same format for every question.
- Record control: a secondary button with a mic icon, becomes "Stop · 0:42" while recording (tabular). After transcription, transcript in muted Reading text with timestamps in Label style. No grammar markup on transcripts.

### Writing editor
- Full content-column Textarea in Reading style, no border, page-like. A quiet footer bar: word count, timer (counts down, turns muted rust only at 0:00, no flashing), "Save".
- Rewrite view: two columns (original | rewrite) with errors-per-100-words for each in Label style above them.

### Progress page
- **Consistency grid:** last 100 days as 10 × 10 small squares (12px, 3px gap, 2px radius). Practised = sage at 70% opacity, light day = sage at 35%, not practised = border colour outline only. Caption: "Practised 63 of the last 100 days". No streak counter, no flame, no "missed" colour.
- **Metric:** errors per 100 words as a simple line chart (1.5px amber line, faint gridlines, target line dashed in muted ink). No big hero number.
- **Open topics:** shadcn Table: topic, last result, next check date, status (`Open` muted / `Closed` sage chip).

### Navigation
- Sidebar items: 32px rows, UI text in muted ink, icon 16px (lucide, 1.5px stroke). Selected: Cream Ink text, raised background, 2px amber dot before the label (not a side border).
- Command menu (`⌘K`) via shadcn Command for jumping to rules, topics, past sessions.

### Empty, loading and error states
- Empty: one sentence that teaches the next step ("No session yet today. Start session builds it from yesterday's mistakes.") plus the primary button.
- Loading while `claude -p` runs: skeleton lines in the raised tone where the session will appear, plus a muted line "Building today's session…". No full-screen spinner.
- Errors (CLI missing, not signed in, invalid response): inline notice in Dusk Note with the exact next step ("Run `claude` in a terminal and sign in"), and a "Retry" secondary button.

## 6. Do's and Don'ts

### Do
- Do keep the whole session on one scrolling page, with one "Check answers" action.
- Do use Literata for everything the learner reads and the system sans for controls.
- Do pair every colour state with an icon or word (✓, ✗, "Not counted").
- Do keep amber rare: primary action, focus, selection.
- Do show consistency as "days practised in the last 100".
- Do turn off spellcheck and autocorrect in every answer field.
- Do write UI copy in short sentences; no em dashes in UI strings.
- Do verify every UI change with a screenshot (Playwright against the Vite dev server) before calling it done.

### Don't
- Don't use typical AI SaaS styling: gradients, gradient text, neon glows, glassmorphism, big hero metrics with small labels, identical card grids.
- Don't use mascots, confetti, flames, streak counters that reset, or any guilt about missed days.
- Don't use Moodle-style grey forms or dense admin tables for the session itself.
- Don't wrap session blocks in cards, and never nest cards.
- Don't use coloured side-stripe borders on callouts, list items or alerts.
- Don't open modals for disputes, rules or settings; use inline fields or side panels.
- Don't show repeat counts of mistakes or wording like "again" anywhere in the UI.
- Don't use #000, #fff, or default Tailwind grays and blues.
- Don't animate layout properties or add page transitions.
