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
Revived from the brief above. It came back twice on the same day, and the first
version was wrong, so both are recorded — a graveyard that only lists other
people's mistakes is not doing its job.

**First attempt (morning): a second window of the main Electron app.** One
`spawnPty`, one `npm run build`, one `node_modules`, `sush --air` to boot it
alone. The reasoning was that an independent build and dependency tree are what
killed the Tauri version, so sharing them was the safe resurrection.

It was not. Sharing a process meant Air's lightness was a promise about
restraint rather than a fact about the binary: every capability Air refused to
carry was still one import away, "no licence gate" meant *this window does not
call it*, and the only thing keeping the boundary honest was that nobody had
crossed it yet. A user could not verify any of it. Worse, it made "install just
the small one" impossible — the small one was 890 kB of main-app renderer with
a different entry point.

**Second attempt (afternoon): a separate application, in `air/`.** Own
`package.json`, own dependencies, own `electron.vite.config.mjs`, own settings
directory (`Sush Air`, not `Sush`), own installer, own CI job. Sush's source no
longer contains the string `air` anywhere meaningful, and Air imports nothing
from Sush.

That is the third form Air has taken, and it is the one the original burial
actually asked for — "a clean, dedicated distribution". What was wrong with the
Tauri version was never that it was separate; it was that it was separate *and*
in a second language with a second runtime, so keeping the two in sync meant
writing everything twice. Air is separate and boring: the same Electron, the
same React, the same xterm, ninety duplicated lines of PTY spawn ladder. A
duplicated file that never has to agree with anything is cheaper than a
dependency between two products.

The retained brief shipped whole: xterm.js PTY sessions, a twelve-tab ceiling
(enforced in main, not just in the tab strip), a Ctrl+K palette, four calm
themes, and a renderer-owned `:` layer with `:help`, `:clear`, `:note`,
`:theme` and `:agent`. Beyond it: `:split`, `:find`, `:go`, `:font`, `:zen`,
`:export`, `:cwd`, `:new`, `:close`, `:rename`, `:import`, `:forget`, OSC 7 tab
labels that follow the shell, and a notes panel that never leaves the machine.

**What would bury it again:** a dependency it does not need, a feature that only
makes sense with an identity behind it, or an import that becomes a live link
back to Sush's file formats. Air's value is entirely in what it refuses to
carry.

### "Open Sush Air" in the Sush command palette — 2026-07-24
**Cause of death:** It was the last thread tying the two applications together.
A palette entry that launches another product implies the two ship together,
install together and version together — none of which is true any more. Sush no
longer knows Air exists, which is the point.
**Could it rise again?** Only as an OS-level "open with", never as an IPC
channel. `sush:open-air` existing at all meant Sush had a handle on Air's
window, and a handle is a coupling waiting to grow arguments.
