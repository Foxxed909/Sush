# Design

Visual system captured from the live code (`src/renderer/src/index.css` is the
source of truth; this file describes it).

## Theme

Dark, always. The scene: a developer at night, terminal maximized, agents
streaming — ambient light low, the canvas must not glow. Near-black layered
surfaces with content emerging through luminance, not color ("wireframes in
moonlight"). Glass (backdrop blur) exists but is budgeted: chrome panels only,
and every glass surface has a lite/saver/reduce-motion off-switch.

## Color

- **Canvas ramp**: `--surface-0 #08090a` → `--surface-3 #1f2024` (app bg →
  elevated cards). Borders are semi-transparent white hairlines
  (`--border-1..3`, 6–14% white).
- **Ink ramp**: `--text-1 #f7f8f8` (primary) → `--text-5` (disabled). Body
  copy uses `--text-2`; hints use `--text-3`/`--text-4` at ≥4.5:1 on the
  canvas. Never below `--text-4` for words that matter.
- **Accent**: Sush pink `#ff6b9d`, themeable per-theme (`--accent` +
  `--accent-a06..a55` alpha ramp). Strategy: **Restrained** — accent marks
  primary actions, selection, and live state; never decoration.
- **State vocabulary** (fixed): working `#5fd3a8`, needs-you `#ffcb6b`,
  error `#ff6b81`, limit `#ff9f43`, info `#82aaff`, idle grays.
- **Tier colors** (Nord family, so the plan ladder reads as one palette):
  Free `#a4b0c4` (Nord-cast gray), Plus `#88c0d0` (nord8), Pro `#b48ead`
  (nord15), Ultra `#ebcb8b` (nord13), Max `#d06f79` (nord11 brightened one
  step for ≥4.5:1 at small sizes on the dark surfaces).

## Typography

One UI family: platform stack (`-apple-system … Segoe UI Variable`). Monospace
(`Cascadia Code` stack) is reserved for code, commands, and terminals — never
labels. Fixed rem-ish scale, five sizes (`--fs-xs 10.5px` → `--fs-xl 16px`),
tight ratio; weights carry hierarchy (700–900 for headings/labels).

## Spacing & Shape

4px grid (`--sp-1..5`). Radius scale `--r-xs 4px` → `--r-xl 15px`, pills 999.
Cards are used sparingly; rows and hairline dividers are the default grouping.

## Motion

One spring for the whole app: `--ease-spring cubic-bezier(0.32,0.72,0,1)`
(Apple sheet curve) + `--ease-out`. Durations 140–340ms. Motion conveys state
(enter/exit, focus, progress) — no orchestrated page loads. Three kill
switches: OS reduced-motion, `.sush-reduce-motion` (user toggle),
`.sush-saver` (battery). Ambient loops (orb breathing) pause in all three.

### Ambient starfield

The one sanctioned ambient scene (`Starfield.jsx`): sparse drifting/twinkling
stars on a canvas at z −1 — above the app background, below all content, so
terminals (opaque) hide it and glass chrome shows a faint wash. Moonlight
grays with ~16% accent-tinted stars. It is canvas JS, so the CSS kill
switches can't reach it: the App gates the MOUNT instead (off under
lite/saver/eco/reduce-motion or its Appearance toggle), OS reduced-motion
renders one static frame, and the loop pauses on blur/hidden/idle-sleep.
30fps cap, DPR cap 1.5, star count cap 220.

## Components

- **Buttons**: pill or `--r-sm` rects; active = accent fill with near-black
  text; inactive = `--surface-2` + `--border-2`. Lock icon marks tier-gated
  options inline.
- **Toggles**: full-width labeled buttons with state text ("Guard armed at
  80%"), not bare switches — state is always written out.
- **Overlays**: one backdrop recipe (`.sush-backdrop` fade + `.sush-pop`
  sheet). Z-scale: rail/chrome < pills (340) < palette (450) < mission
  control (480) < modals (500+).
- **Status pills**: dot + label, colors from the state vocabulary; pulse only
  while live.
- **Empty states**: teach the next action ("Launch a swarm to see it light up
  here"), never bare "nothing here".
