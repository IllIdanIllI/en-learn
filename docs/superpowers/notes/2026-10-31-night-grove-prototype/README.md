# Night grove prototype (lookbook round 6)

Reference for `specs/2026-10-31-design-night-grove.md`. These files were injected into the preview app with Playwright to make the lookbook screenshots; they are not app code.

- `yoru3.css`: Night grove tokens (light on `html:root`, dark on `html.dark`), including the `--px-*` sprite colours.
- `common2.css`: font roles and the prototype's decoration styles.
- `sprites4.js`: pixel sprite builders (grove, fence, shoot, lantern, moon phase, geta, leaf, divider, bamboo meter). Port the pixel maps; keep the colours as tokens.
- `decorate6.js`: how the lookbook placed each detail (sidebar option A). Do not reuse the DOM-injection approach.
