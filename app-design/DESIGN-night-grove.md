---
name: English Exam Coach, Night grove
description: The default design: a warm evergreen palette, Murecho and Alegreya type, and a small pixel bamboo grove at the foot of the sidebar.
colors:
  grove-background: "oklch(0.955 0.016 115)"
  grove-background-dark: "oklch(0.2 0.022 165)"
  grove-foreground: "oklch(0.26 0.03 160)"
  grove-foreground-dark: "oklch(0.91 0.03 105)"
  grove-card: "oklch(0.975 0.01 115)"
  grove-card-dark: "oklch(0.25 0.025 165)"
  grove-muted: "oklch(0.925 0.022 125)"
  grove-muted-dark: "oklch(0.225 0.024 165)"
  grove-muted-ink: "oklch(0.44 0.03 155)"
  grove-muted-ink-dark: "oklch(0.76 0.03 120)"
  grove-faint: "oklch(0.52 0.025 150)"
  grove-faint-dark: "oklch(0.65 0.03 135)"
  grove-primary: "oklch(0.36 0.05 165)"
  grove-primary-dark: "oklch(0.88 0.11 98)"
  grove-border: "oklch(0.86 0.022 130)"
  grove-border-dark: "oklch(0.33 0.025 165)"
  grove-success: "oklch(0.48 0.1 150)"
  grove-success-dark: "oklch(0.78 0.11 148)"
  grove-destructive: "oklch(0.52 0.12 42)"
  grove-destructive-dark: "oklch(0.74 0.1 45)"
  grove-note: "oklch(0.47 0.08 245)"
  grove-note-dark: "oklch(0.76 0.07 240)"
  grove-firefly-dark: "oklch(0.92 0.15 110)"
typography:
  headline:
    fontFamily: "Murecho, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Murecho, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.35
  reading:
    fontFamily: "Alegreya, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: "Murecho, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
components:
  sidebar-garden:
    width: "202px"
    height: "196px"
  pixel-sprite:
    pixelSize: "2px"
---

# Design System: English Exam Coach, Night grove

Night grove is the default design (Settings, "Оформление" / "Design", switches to Lamp). It keeps the layout, components, states and copy rules of `app-design/DESIGN.md` (Lamp) and changes four things: the colour tokens, the fonts, a pixel garden in the sidebar, and a few pixel details on lesson pages. Everything here hangs off `[data-design='grove']` on `<html>`. Where this file and `DESIGN.md` differ, this file wins for Night grove; the rules that are not mentioned here still hold.

Built from: `src/ui/styles/grove.css` (tokens, fonts), `src/ui/grove/*` (sprites, garden, meter, score bar), `src/core/moon.ts` (moon phase), `src/core/progress/garden.ts` (fireflies, geta).

## 1. Overview

**Creative North Star: "The Bamboo Grove at Night"**

A study desk beside a small garden. The page is a quiet evergreen-and-cream sheet by day and a dark evergreen sheet by night, with moon-yellow as the one warm accent. The garden is the only decoration, and it is drawn in pixels, so it reads as a picture, not as UI.

Night and day follow the effective theme, not the clock: dark is night, light is day. Lamp keeps the warm brown palette and the Literata serif.

**Key characteristics:**
- Evergreen primary by day, moon yellow by night (the focus and primary-action colour swaps with the theme).
- Murecho for headings and interface, Alegreya for reading text, the monospace stack for typed answers.
- Pixel sprites drawn from tokens, so every sprite follows the theme.
- Motion is limited to a slow firefly glow. Nothing else animates.

## 2. Colours

Tokens are OKLCH and override the shadcn variables (`:root` block for light, `.dark` block for dark), so the rest of the app needs no change. Light values are under `[data-design='grove']`, dark values under `.dark[data-design='grove']`. Contrast targets from the spec (against the background): body text 13.5:1 or more, muted 6.7:1 or more, faint 4.8:1 or more, primary button 9.2:1 or more, semantic colours 5.1:1 or more.

| Token | Light | Dark |
|---|---|---|
| `--background` | oklch(0.955 0.016 115) | oklch(0.2 0.022 165) |
| `--foreground` | oklch(0.26 0.03 160) | oklch(0.91 0.03 105) |
| `--card`, `--popover`, `--secondary`, `--accent`, `--input` | oklch(0.975 0.01 115) | oklch(0.25 0.025 165) |
| `--muted`, `--sidebar` | oklch(0.925 0.022 125) | oklch(0.225 0.024 165) |
| `--muted-foreground`, `--sidebar-foreground` | oklch(0.44 0.03 155) | oklch(0.76 0.03 120) |
| `--faint` | oklch(0.52 0.025 150) | oklch(0.65 0.03 135) |
| `--primary`, `--ring` | oklch(0.36 0.05 165) evergreen | oklch(0.88 0.11 98) moon yellow |
| `--primary-foreground` | oklch(0.95 0.04 100) | oklch(0.22 0.03 165) |
| `--border` | oklch(0.86 0.022 130) | oklch(0.33 0.025 165) |
| `--success` | oklch(0.48 0.1 150) | oklch(0.78 0.11 148) |
| `--destructive` | oklch(0.52 0.12 42) persimmon | oklch(0.74 0.1 45) |
| `--note` | oklch(0.47 0.08 245) indigo | oklch(0.76 0.07 240) |

**Sprite tokens** (`--px-*` and `--firefly`) are defined in the same two blocks: 22 `--px-*` tokens plus `--firefly`. Their values are the prototype's `yoru3.css` values, unchanged. The sprite palette in `src/ui/grove/sprites.ts` maps characters to these tokens; no sprite uses a literal colour.

### Named rules
**The Moon Swap Rule.** Primary and focus colours change with the theme: evergreen by day, moon yellow by night. Do not hard-code either.

**The No Pure Colours Rule** from Lamp still holds: no #000, #fff or default Tailwind neutrals.

## 3. Typography

- **Headline and title** (`.headline`, `.title`): Murecho 700. Sizes as in Lamp (1.5rem and 1.25rem).
- **Reading** (`.reading`): Alegreya 400, 400 italic for emphasis, 1.125rem, line-height 1.55. Alegreya 700 is bundled for bold text in reading copy.
- **Interface**: Murecho 400 and 500 (labels and buttons), sizes as in Lamp.
- **Answers and format examples**: the monospace stack, unchanged.

Fonts are bundled locally from `@fontsource/murecho` and `@fontsource/alegreya`, Latin and Cyrillic subsets only, so the app works offline. Chosen because the Japanese-style faces tried earlier set Cyrillic in wide, spaced-out glyphs.

Rules from Lamp still apply: serif for content, sans for interface, tabular numerals for counts.

## 4. Elevation

Flat, as in Lamp: tonal layers, 1px borders, spacing. The garden adds two light effects that are not shadows: an outline in the background colour around the geta (so they read against the fence), and a soft glow around each firefly.

## 5. Sidebar garden

A pixel scene at the foot of the sidebar: a short bamboo grove behind a low fence of dried bamboo (yotsume-gaki), a stone lantern in front at the left, and two bamboo shoots at the right.

**Placement and size.** The grove is 101 sprite columns by 78 rows (202 × 156 CSS px); the fence is 40 px tall. Both are fixed in size and anchored to the bottom of the sidebar, so the space between the menu and the grove stays empty. A short window clips the grove from the top rather than covering the links.

**Behaviour.**
- Shown only at 1100px and wider (below that the sidebar is icons only, and the garden is hidden).
- Decorative: `aria-hidden="true"`, `pointer-events: none`, nothing in the tab order.
- Night (dark theme): moon, lit lantern, fireflies. Day (light theme): unlit lantern, no moon, no fireflies.

**What drives each detail** (`src/ui/grove/useGarden.ts`, `src/core/progress/garden.ts`, `src/core/moon.ts`):

| Detail | Shown | Driven by |
|---|---|---|
| Moon | Night only, top-left under the menu | Today's moon phase (local date) from `moonPhase()`, a pure function; `moon(phase)` draws the lit part of the disc |
| Fireflies | Night only, over the grove, a slow glow | Correct answers in yesterday's progress-log row (local date minus one day), capped at 12; zero when there was no session yesterday |
| Lantern | Always | Lit at night, unlit by day |
| Geta (pair of sandals) | Always drawn; shown only when today's lesson is closed | Today's session is `graded` and its id is in `closedSessions` |
| Bamboo shoots | Always | Decoration only |

Fireflies are still drawn under `prefers-reduced-motion`, but without the blink: the glow stays, the animation stops.

## 6. Lesson pages

Night grove only. Each detail is decorative unless noted.

- **Block heading leaf:** a small pixel bamboo leaf before each block heading.
- **Block divider:** a thin pale bamboo line between blocks (none above the first block of the session).
- **Answer meter:** under the lesson header while answering. A horizontal bamboo stalk with one segment per answer field (each item input and each "Find the errors" paragraph). A segment turns green once its field is filled; a small leaf sprouts at the last green node. Label "Ответов: N из M" / "Answered: N of M". Hidden while solving skipped questions (the separate solving mode).
- **Score bar:** in the feedback summary after checking. A large "N / M" in the heading font, the line "Верно N из M", and a bamboo stalk with one segment per counted item in item order: green for correct, dry yellow for "to fix". Never red.
- **Error bank:** a small dry leaf before each row's "was" text.
- **Unchanged from Lamp:** the loader card "Пока вы ждёте", verdict chips (no leaves), the wrong-item treatment (N7, applies to both designs).

## 7. Pixel sprites

- Drawn as inline SVG made of `<rect>` runs with `shape-rendering="crispEdges"`. One sprite pixel is 2 CSS px; the lantern is 3 CSS px per pixel.
- Colours come only from `--px-*` tokens, so sprites follow the theme.
- `src/ui/grove/sprites.ts` holds pure builders (pixel rows in, rows out): grove (seeded, deterministic), fence, shoot, lantern (lit and unlit), moon phase, geta, leaf, dry leaf, divider, and the stalk meter. `src/ui/grove/Pixel.tsx` renders rows to SVG.
- Motion: only the firefly glow (opacity, 3.2 s ease-in-out). No other sprite animates.

## 8. Do's and Don'ts

### Do
- Do keep the garden decorative and small; it should never compete with the session.
- Do colour sprites only through `--px-*` tokens, so both themes work from one map.
- Do check the garden in both themes with a screenshot after any change to sprites or tokens.
- Do keep the fireflies honest: they count real correct answers, nothing else.
- Do keep the meter and score bar paired with words ("Ответов: 3 из 7", "Верно 3 из 6").

### Don't
- Don't animate anything but the firefly glow. No parallax, no sway, no falling leaves.
- Don't add tooltips or labels that explain the garden (out of scope in the spec).
- Don't show the garden below 1100px or make its height grow with the window.
- Don't use red for the score bar. Wrong items are dry yellow.
- Don't add seals, katana, ensō, kanji or a moon on the title or log cards (tried in the lookbook, dropped).
- Don't use #000, #fff or default Tailwind neutrals; Night grove is tinted toward evergreen and moon yellow.
