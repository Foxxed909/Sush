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
- **Tier colors** (Nord family, so the plan ladder reads as one palette).
  Seven rungs, in ladder order — this list is the whole ladder, and it must
  match `TIER_META` in `PlansPage.jsx` and `TIER_FEATURES` in
  `main/license-core.mjs` exactly. It previously named only five, which left
  Dev and Enterprise shipping in the product but absent from the design
  vocabulary; `learning.md` asks that each status word have exactly one
  meaning, and a ladder documented at the wrong length breaks that at the
  first rung it omits.

  Free `#a4b0c4` (Nord-cast gray — the palette has no mid-gray of its own),
  Plus `#88c0d0` (nord8), Dev `#7aa2ff` (nord9 pushed bluer, so it reads as a
  branch off Plus rather than a step past Pro), Pro `#b48ead` (nord15),
  Ultra `#ebcb8b` (nord13), Max `#d06f79` (nord11 brightened one step for
  ≥4.5:1 at small sizes on the dark surfaces), Enterprise `#8fddd1`
  (nord7 lightened; the only tier whose accent is user-selectable, because a
  fleet is someone else's brand before it is ours).

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

## Nightly chrome (Quiet Nights)

Studied against T3 Code (neutral-black canvas, 3% white surfaces, 6% white
hairlines, 11px metadata floor) and BridgeMind One / BridgeSpace (split, snap
and dock panes with a header per agent pane). Layout stays Sush's: rail,
topbar, terminals, composer, docked inspector.

- **Topbar**: crumbs as plain text, branch as muted mono. One *session strip*
  (provider · model · effort | account + usage meter | state) of text segments
  split by short hairlines — never a row of bordered chips. It sheds trailing
  segments whole when narrow (container queries + one-row wrap). Telemetry the
  CLI does not expose is omitted, not shown as `—`.
- **Type floor**: 10px absolute minimum, 11–11.5px metadata, 12.5px rows,
  weights 500–650. No 800–900 weights in chrome.
- **Accent**: only the primary action, the active-row marker (2px bar), the
  model effort tag and focus. No accent washes, glows or gradients behind pages.
- **Rail rows**: 30px, neutral selected fill (white 6%) plus the accent bar;
  provider as a lowercase mono tag; nothing appears selected on Home.
- **Split/Grid panes**: a 30px header per pane (mono, label, model · effort,
  state, focus button) above the terminal — never labels floating over output.
- **Composer**: elevated surface (radius 14, soft drop shadow), model control
  on the left, Hush mic docked on the right; no duplicate account/quota text.
- **Floating controls**: none over the rail or composer. The Seducia orb only
  appears while she is listening/speaking (the topbar has her button).
