# Sush redesign plan (Nov 2026)

Inputs: owner brief, plus five review passes (UI critique, bug hunt, motion
audit, two feature reviews). The impeccable design skill is vendored at
`.claude/skills/impeccable`. Every phase ends with `npm test`,
`npx electron-vite build` and `node tools/shot.mjs` with zero `[pageerror]`.

Mode: Operate (a developer tool). Ambition shows as precision, calm surfaces
and macOS-grade motion, not decoration.

## Phase 0: shipped first
- [x] GitHub sign-up: device-code buttons submitted the create form (unlinked profile, straight into the app).
- [x] `selectTab` ReferenceError (`setShellModeState`) on every session click.
- [x] Sidebar: Directory → sessions tree with a chevron, hover-peek, branch, counts, a per-project "+" and persisted collapse state.

## Phase 1: models + opencode (shipped)
- One catalog in `lib/nightlyModels.js`: Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 (explicit ids plus the aliases), current Codex/Gemini ids.
- OpenCode: list its free models (`opencode/big-pickle`, `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`, `mimo-v2.6-flash-free`, `nemotron-*`, `beam-free`, `flint-40b-free`), tagged "Free". Launch stays interactive with `opencode -m <provider/model>`.
- Picker: `busy` never resets when apply throws (ShellModelPicker, NightlyModelMenu), so wrap it in try/finally.

## Phase 2: motion system + launch (shipped)
- Motion tokens: 80/120/180/240/320 ms, exit 150 ms; ease-out, ease-sheet (spring-like), ease-in, ease-pop.
- `sush-motion-reduced` root class driven by the OS preference, the user toggle, eco and saver.
- Splash: fix the invisible cursors (missing keyframes) and the timer restart on App re-render (inline `onDone`). Cut it from 2.5 s to 1.55 s, make it skippable, drop the SVG-filter animation and the fake progress bar.
- Windows perf: no animated box-shadow or filter loops, and no 80px blur on the lock aurora.

## Phase 3: first-run onboarding (shipped; `tools/shot-onboarding.mjs`)
Splash → Welcome → "What's your name?" → PIN (optional, with confirm) → "How do you want to sign in?"
(GitHub · Google · Discord · Email · Stay local) → done.
- Each step is its own screen, with a 3-segment progress hairline and step-in motion.
- Provider steps wait on the OAuth flow. Nothing advances until success, cancel or error.
- Discord and Email need a backend (an OAuth app / a magic-link service). Show them as "coming soon" rather than fake them.

## Phase 4: Settings (shipped: shell + primitives)
- Five groups instead of nine: Account · Agents & Voice · Appearance · Terminal · Performance & Alerts, plus Advanced.
- One page per group, a 216 px nav, a 640 px reading column, 52 px rows, real switches, search kept.
- Remove dev copy (doc paths, "soft-retired (solo)") and de-duplicate reduce-motion, window material and sleep controls.
- Settings no longer renders under the Stable top bar in the Nightly shell.

## Phase 5: Agents view (shipped)
A state board (Needs you · Working · Idle) with whole-card click, last activity, model, branch, and inline open/stop/hand-off actions.

## Phase 6: Office, iterated (two passes shipped)
- Lighting: brighter hemisphere and key light, blob shadows, warmer floor.
- Monitor canvases at 512×320 with readable text. Fix the zoom camera clipping into the agent's head.
- HUD: fewer pills, and the hint bar no longer collides with "Back to campus".
- Perf: no 12 fps idle loop while hidden, and dispose the WebGL context on unmount.

## Not possible here
- opencode's free models can't run in this cloud container: the network policy blocks `opencode.ai` / `models.opencode.ai`. The CLI is installed and lists them.

## Round 2 (shipped)
- macOS design layer: traffic lights, unified toolbar, source-list sidebar, segmented modes, vibrant menus.
- Settings as System Settings: icon tiles, grouped inset lists, switches, push buttons, checkbox grid, accent swatches.
- Motion: compositor-only ambient loops, overlay exit animations (`Presence`), no lock-screen blur.
- macOS lock screen (date over a 96px time, no card).
- Model/effort restarts resume the exact bound conversation (Claude, Codex).
- Office: desk lamps, themed roofs, Mac HUD.

## Still open
- Discord + Email sign-in need a registered Discord OAuth app and an email magic-link service.
- OpenCode thread bridge (Thread mode for OpenCode); one provider registry instead of eight lists.
- Exact-id resume for Gemini (once its `--resume <id>` form is verified) and for account switches (needs a
  shared session store across account slots).
- Stable (Quiet Nights) shell has not had the Mac pass; it only inherits the new palette.
