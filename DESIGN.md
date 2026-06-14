# Design

Visual system for Sush. Direction: **refined dark + glass ("glassy pro")** —
evolve the existing DNA, don't replace it. The job is discipline: less accent
noise, one grey ramp, one type scale, a real spacing grid, deliberate density.
Pink stays the signature but is spent sparingly.

## Theme

Dark, glassy, premium. Near-black layered surfaces with translucent "glass"
chrome (backdrop blur) over an optional wallpaper. Pink (#ff6b9d) is the single
brand accent and signals state, not structure. Calm by default; energy only where
something is live or needs the user.

## Color

Defined as CSS custom properties in `src/renderer/src/index.css` `:root`. The
accent is theme-swappable (`--accent` + the `--accent-aNN` alpha ramp); everything
below is the neutral system that must stay consistent across themes.

### Surfaces & borders (near-black ramp)
- `--surface-0` #090b0e — app background (under glass / wallpaper)
- `--surface-1` #0d1116 — panels, headers, popovers
- `--surface-2` #0f1419 — inputs, raised/hover rows
- `--border-1` #181d24 — hairline dividers (the default separator)
- `--border-2` #222a31 — control borders (inputs, buttons at rest)

### Text ramp (one cool-grey scale — replaces the old ~8 ad-hoc greys)
- `--text-1` #eef2f5 — primary (titles, active labels)
- `--text-2` #c6ced6 — secondary (body, values)
- `--text-3` #8b949e — muted (labels, inactive)
- `--text-4` #5b656e — hint (captions, placeholders that still must hit 4.5:1 on dark)
- `--text-5` #39424b — faint (disabled, decorative dividers)

### Accent (signature pink, spent sparingly)
- `--accent` #ff6b9d, with `--accent-a06 … a55` alpha steps for tints, borders,
  glows. Rule: accent borders only on **active/selected/hover**; rest is `--border-*`.

### State (never colour-only — pair with dot + label)
- working/online — green #42d392
- waiting / needs-you — amber #ffcb6b
- error / limit — red #ff5370
- charging / saver — green #5fd3a8

## Typography

- UI: `--font-ui` (system: SF / Segoe UI Variable / system-ui).
- Mono: `--font-mono` (Cascadia Code / Fira Code / Consolas) — terminals, paths,
  commands, codes.
- Type scale (five sizes, not fifteen): `--fs-xs` 10.5 · `--fs-sm` 11.5 ·
  `--fs-md` 12.5 · `--fs-lg` 13.5 · `--fs-xl` 16. Snap every chrome string to one.
- Weights: 700 for labels/controls, 800 for titles/emphasis, 900 reserved for
  brand/lockups and numeric badges. Body 600–700.
- Uppercase micro-labels: `--fs-xs`, weight 800, letter-spacing ~1.1, `--text-3`.

## Spacing & layout

- 4px grid: `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 22.
  Pick from the scale; stop inventing 7/9/11/13px gaps.
- Density target: comfortable, not cramped. Control height ~30–32px; row padding
  `--sp-2`/`--sp-3`. Section gaps `--sp-5`.
- Flexbox for 1D, Grid for 2D. Cards are the lazy answer — use a hairline divider
  or a tint before reaching for a bordered card; never nest cards.
- Alignment: everything lines up to the grid; icons optically centered to text.

## Corner radius

`--r-xs` 4 · `--r-sm` 6 · `--r-md` 9 · `--r-lg` 12 · `--r-xl` 15 · `--r-pill` 999.
Inputs/buttons `--r-md`, chips `--r-pill`, panels/popovers `--r-lg`.

## Glass & elevation

- Glass chrome: translucent surface + `backdrop-filter: blur` (modest radius — blur
  is the biggest GPU cost). One recipe via `data-glass` + `--glass-surface`.
- **Power budget is law:** `.sush-lite` / `.sush-saver` drop blur and freeze
  ambient animation. Any new glass/glow must degrade through these classes.
- Shadows: `--shadow-card` for raised rows, `--shadow-float` for popovers/modals.
  No glow as default decoration — glows are for live/active accents only.

## Motion

- One curve family: `--ease-out` / `--ease-spring`; durations `--dur-fast` .14s,
  `--dur-med` .26s. Ease-out, no bounce/elastic.
- Reduced motion + power-saver: every animation has a still fallback (already
  wired). Don't gate content visibility on a transition.
- Motion marks change (state flips, entrances), it isn't ambient wallpaper.

## Components (conventions)

- **Button:** `--surface-2` bg, `--border-2` border at rest; on hover/active →
  accent border + `--accent-a06/10` tint + accent text. Height ~30–32, `--r-md`.
- **Input:** `--surface-2`, `--border-2`, `--text-2` text, `--text-4` placeholder;
  focus → accent border + `--accent-a10` ring.
- **Row (list/session/account):** neutral by default (`--border-1`, faint bg);
  active → accent left-bar + `--accent-a10` tint. Hover → `--accent-a06`.
- **Chip/badge:** `--r-pill`, `--fs-xs`, used for counts and state.
- **Section header:** icon tile + `--fs-lg`/800 title + hairline `--border-1`.
- **Divider:** `--border-1` hairline; accent-tinted dividers only for emphasis.

## North star

If a screen feels busy, the fix is almost always: swap an accent border for
`--border-1`, collapse three greys into one ramp step, snap spacing to the grid,
and delete a glow. Calm first, then accent the one thing that matters.
