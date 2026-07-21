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
