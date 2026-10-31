# Design: Night grove (2026-10-31)

A second visual design, "Night grove", chosen over six lookbook rounds, plus a Settings switch back to the current design ("Lamp", `app-design/DESIGN.md`). Binding where it says something; otherwise the S1 spec, its feedback rounds and `app-design/DESIGN.md` hold.

- Final lookbook: https://claude.ai/artifact/UwEKuQU2Cb6WVDJqWaGMWa (round 6). Earlier rounds 1 to 5 led here.
- Prototype code (CSS overrides, pixel sprites, DOM decoration used for the lookbook): `notes/2026-10-31-night-grove-prototype/`. The pixel maps and colours there are the reference; the DOM-injection code is not to be reused.

## N1. Design switch
- New setting `design: 'grove' | 'lamp'`, stored like the other settings (key/value, no migration). Default `grove`, so the learner sees Night grove after the update.
- Settings page: a `Segmented` row "Оформление" / "Design" with "Ночная роща" / "Night grove" and "Лампа" / "Lamp", next to the theme row. It saves immediately, like the other rows.
- The theme setting (dark / light / system) stays separate and applies to both designs.
- `<html data-design="grove|lamp">` is set the same way the `dark` class is set now (`CoreProvider`). All Night grove styling hangs off `[data-design='grove']`, so Lamp renders exactly as it does today, apart from N7.
- Night grove decorations (N4, N5) render only when the design is `grove`.

## N2. Night grove colours
OKLCH tokens, overriding the shadcn variables under `[data-design='grove']` (light) and `.dark[data-design='grove']` (dark). Contrast checked against the background in both themes: body text 13.5:1 or more, muted 6.7:1 or more, faint 4.8:1 or more, primary button 9.2:1 or more, semantic colours 5.1:1 or more.

| Token | Light | Dark |
|---|---|---|
| `--background` | oklch(0.955 0.016 115) | oklch(0.2 0.022 165) |
| `--foreground` | oklch(0.26 0.03 160) | oklch(0.91 0.03 105) |
| `--card`, `--popover`, `--secondary`, `--accent`, `--input` | oklch(0.975 0.01 115) | oklch(0.25 0.025 165) |
| `--muted`, `--sidebar` | oklch(0.925 0.022 125) | oklch(0.225 0.024 165) |
| `--muted-foreground`, `--sidebar-foreground` | oklch(0.44 0.03 155) | oklch(0.76 0.03 120) |
| `--faint` | oklch(0.52 0.025 150) | oklch(0.65 0.03 135) |
| `--primary`, `--ring` | oklch(0.36 0.05 165) (evergreen) | oklch(0.88 0.11 98) (moon yellow) |
| `--primary-foreground` | oklch(0.95 0.04 100) | oklch(0.22 0.03 165) |
| `--border` | oklch(0.86 0.022 130) | oklch(0.33 0.025 165) |
| `--success` | oklch(0.48 0.1 150) | oklch(0.78 0.11 148) |
| `--destructive` | oklch(0.52 0.12 42) (persimmon) | oklch(0.74 0.1 45) |
| `--note` | oklch(0.47 0.08 245) (indigo) | oklch(0.76 0.07 240) |

Sprite colours (`--px-*`, `--firefly`) are taken as they are from `yoru3.css` in the prototype folder.

## N3. Night grove fonts
- Headings (`.headline`, `.title`): Murecho 700.
- Reading text (`.reading`): Alegreya 400 and 400 italic, 1.125rem, line-height 1.55.
- Interface: Murecho 400 / 500.
- Answers and format examples stay in the monospace stack.
- Bundled locally with `@fontsource/murecho` and `@fontsource/alegreya`, Latin and Cyrillic subsets only (no Japanese glyphs are used), so the app works offline and the build stays small.
- Why these: most Japanese-style fonts render Cyrillic letters as wide, spaced-out glyphs. These two were checked with Russian text.

## N4. Sidebar garden (Night grove only)
A small pixel-art scene at the foot of the sidebar: a short bamboo grove behind a low fence of dried bamboo (yotsume-gaki), a stone lantern in front at the left, two bamboo shoots at the right (lookbook option A).

- Fixed height: the grove is at most about 160px tall, the fence about 40px; they do not grow with the window. The space between the menu and the grove stays empty sky.
- Hidden when the sidebar is collapsed to icons (below 1100px).
- Decorative: `aria-hidden`, no pointer events, not in the tab order.
- Day and night follow the effective theme, not the clock: dark = night, light = day.
- The details and what drives them:

| Detail | Shown | Driven by |
|---|---|---|
| Moon | Night only, top-left of the free sky under the menu | Today's moon phase (local date), from a pure function in core |
| Fireflies | Night only, over the grove; a slow glow; still under `prefers-reduced-motion` | One per correct answer in yesterday's session (local date minus one day), at most 12; none when there was no session yesterday |
| Lantern | Always | Lit at night, unlit by day |
| Geta (pair of sandals) | Always, by the fence, outlined in the background colour so they read against it | Today's session is in `closedSessions` |
| Bamboo shoots | Always | Decoration only |

## N5. Lesson pages (Night grove only)
- A small pixel bamboo leaf before each block heading.
- A thin pale bamboo divider between blocks.
- Answer meter under the lesson header while answering: a horizontal bamboo stalk with one segment per answer field (each item input and each "Find the errors" paragraph); a segment turns green once its field is filled; a small leaf sprouts at the last green node; label "Ответов: N из M".
- Score bar in the feedback summary after checking: a large "N / M" in the heading font, the line "Верно N из M", and a bamboo stalk with one segment per counted item in item order: green for correct, dry yellow for "to fix". Never red.
- Error bank: a small dry leaf before each row's "was" text.
- The loader's "Пока вы ждёте" card with saved errors stays as it is.
- Verdict chips stay as they are (no leaves).

## N6. Pixel sprites
- Drawn as inline SVG made of `<rect>` runs, `shape-rendering="crispEdges"`, one sprite pixel = 2 CSS pixels (the lantern is 3).
- Colours come only from the `--px-*` tokens, so each sprite follows the theme.
- One small module of pure sprite builders (pixel map in, SVG markup or React element out), ported from `sprites4.js` in the prototype: grove (deterministic layout), fence, shoot, lantern lit/unlit, moon phase, geta (side view), leaf, dry leaf, bamboo divider, bamboo meter.
- Motion: only the firefly glow (opacity). Nothing else animates.

## N7. Fixes in both designs
`app-design/DESIGN.md` already forbids these; they apply to Lamp too:
- A wrong graded item has no coloured left stripe: it gets a tinted background with a full 1px border in `--destructive` at 40%.
- The learner's wrong text is no longer struck through; it stays in muted ink.

## N8. Documentation
- `app-design/DESIGN.md` gets a short note at the top: two designs exist; this file describes Lamp; Night grove is in `app-design/DESIGN-night-grove.md`.
- New `app-design/DESIGN-night-grove.md`: tokens, fonts, the garden and its drivers, sprites, do's and don'ts. Same shape as `DESIGN.md`.
- `s1-decisions.md`: the "design pass" open item is closed by this spec. The spot-block item stays open.

## N9. Verification
- Unit tests: the design setting (default `grove`, persistence), the moon phase function (known new and full moon dates), the yesterday-correct count (no session yesterday gives 0; cap at 12), and the sidebar garden rendering only in Night grove (and the geta only for a closed lesson).
- Existing tests keep passing.
- Playwright: screenshots of Today (answering and checked), Lesson closed, Progress, Error bank, Settings and the loader, in both designs and both themes; the Settings switch changes the design immediately.
- tsc, eslint, Vitest, Playwright and cargo check clean before reporting.

## Out of scope
- The "Find the errors" block redesign (select a fragment, fix it in a field, grade against the key without the LLM): discussed later, in its own spec.
- Sidebar options B and C, the katana, seal, ensō, kanji labels, bamboo regularity and moon phase on the title or log cards (all tried in the lookbook and dropped).
- Changing the Progress page layout beyond tokens and fonts.
- Tooltips explaining the garden.
