# Sush — Graveyard 🪦

> Nothing gets deleted. Only buried.

## Buried

### Right-panel dev-utility tabs — 2026-07-05
**Cause of death:** ~685 lines of panel UI (System Stats, Regex Tester, API
Tester, Scratchpad, Convert, Color, Hash, Generate, Cheats) duplicated what
the shell toolkit commands now do better (`jwt`, `color`, `base`, `regex`,
`case`, `slug`, etc.). A terminal app should answer in the terminal.
**Could it rise again?** The System Stats visualizations might, as an
opt-in dashboard tile. The rest shouldn't — commands won.

### Pro at 8 slots / 16 grid / 300 credit-minutes — 2026-07-04 (tier restructure)
**Cause of death:** Pro was crowding out Ultra; trimmed to 6 slots / 12 grid /
150m so the ladder has real steps.
**Could it rise again?** As dated ULTRA trial codes for grandfathered Pro
users, if the trim draws complaints (see PRIVATE.md watchlist).

### Original per-tier rainbow palette — 2026-07-05
**Cause of death:** Five unrelated hues read as noise and failed contrast at
small sizes. Replaced with the Nord frost/aurora family.
**Could it rise again?** No. THEME.md is locked.

### Sush Air — 2026-07-19
**Cause of death:** A separate Tauri 2/Rust app created a second, deliberately
smaller product to maintain while Sush itself became the primary terminal.
Its independent build, dependency tree, and feature boundary no longer earn
their weight in this repository.
**Concept retained:** A light, native Sush can still be valuable: Rust-backed
PTY sessions with xterm.js, a twelve-tab ceiling, Ctrl+K command palette,
four calm terminal themes, and a renderer-owned `:` command layer (`:help`,
`:clear`, `:note`, `:theme`, `:agent`) that never interferes with shell input.
**Could it rise again?** Yes—as a clean, dedicated Tauri distribution or a
future "Sush Lite" experiment, revived from this brief rather than maintained
as a shadow app inside the main product repository.

## Risen

### Sush Air — buried 2026-07-19, risen 2026-07-24
Revived from the brief above, and deliberately *not* in the form that brief
imagined. The Tauri distribution was the wrong resurrection: it would have
rebuilt the exact three things that killed the first one — an independent
build, an independent dependency tree, and an independent feature boundary.

Air is now a second window of the main Electron app. One `spawnPty`, one
`npm run build`, one `node_modules`. What makes it light is the surface it
exposes rather than a second toolchain: its preload bridges 14 methods, all
namespaced `air:`, against the main bridge's 120, and `sush --air` never
registers the main app's IPC surface in the process at all. There is no
identity system, no license gate, no agent orchestration, no account rotation,
no system-metrics polling and no webview — not hidden behind a flag, absent.

The retained brief shipped whole: xterm.js PTY sessions, a twelve-tab ceiling
(enforced in main, not just in the tab strip), a Ctrl+K palette, four calm
themes, and a renderer-owned `:` layer with `:help`, `:clear`, `:note`,
`:theme` and `:agent`. Beyond it: `:split`, `:find`, `:go`, `:font`, `:zen`,
`:export`, `:cwd`, `:new`, `:close`, `:rename`, OSC 7 tab labels that follow
the shell, and a notes panel that never leaves the machine.

**What would bury it again:** a second dependency, a second build step, or a
feature that only makes sense with an identity behind it. Air's value is
entirely in what it refuses to carry; the moment it needs the main app's
bridge to do its job, it has stopped being Air.
