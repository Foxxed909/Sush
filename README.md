# Sush

**The terminal your agents live in.** One place to launch, brief, monitor, and
hand off Claude Code / Codex / Gemini / OpenCode sessions — with multi-account
limit rotation, usage guarding, voice dictation, and full offline operation.

Sush is offline-first: no account, no telemetry, no server. Your license,
settings, scrollback, and credits meter all live on your disk.

## What it does

- **Session orchestration** — launch a crew (agents × counts) into a
  workspace, brief them on boot, watch every session's live state (working /
  needs-you / error / done) on one board (Mission Control, `Ctrl+Shift+M`).
- **Seducia** — an AI orchestrator that drives your *already logged-in* agent
  CLIs over stdin (no API key to paste). Ask her to build a team, prompt one
  session, review another's output, or rename a workspace.
- **Multi-account rotation** — hold several logins per CLI and hop to the
  next one when a session hits its limit; Usage Guard (Pro+) can warn, hand
  off, or block before the limit stops you.
- **Cross-model handoff** — when an agent hits its cap mid-task, Sush
  summarizes the session and relaunches it on your next available model.
- **Multi-user identities** — per-user config-dir isolation so two people's
  CLI logins never bleed into each other on a shared machine.
- **Hunt** — search the output of every open session (and the saved
  scrollback of ones you've closed) at once, live as you type
  (`Ctrl+Shift+F`) or via the `hunt` command.
- **Workspace digest** — one action summarizes a whole crew's session output
  into a Markdown report via your logged-in CLI.
- **Voice** — Whisper dictation (cloud, your own key, or fully offline via
  local whisper.cpp) metered by a transparent local "Quiet Credits" bucket.
- **A real shell toolkit** — `hunt`, `credits`, `doctor`, `snippet`, `jwt`,
  `regex`, `dns`, `headers`, `case`, `color`, `base`, and more, all built in.
- **Battery-honest** — focus-gated polling, idle sleep, auto power-saver, and
  a reduce-motion mode; every ornament has an off-switch.

See [`docs/SUSH_GUIDE.md`](docs/SUSH_GUIDE.md) for the full walkthrough,
tips, and an honest pros/cons list.

## Sush Air

Some days you want the orchestrator. Some days you want a terminal.

**Air** is the small one — a second window of the same app that is a terminal
and nothing else. No identity gate, no license check, no agents, no account
rotation, no metrics polling, no browser panel. Not hidden behind a flag:
absent. Its preload bridges 14 methods, all namespaced `air:`, against the main
bridge's 120, so a bug in Air's renderer cannot read a license, enumerate users
or reach the token store — those channels are not on its bridge at all. Run
`sush --air` and the main app's IPC surface is never registered in the process
to begin with.

What it does have: PTY sessions (twelve, capped in the main process), tabs that
rename themselves from the shell's working directory, a `Ctrl+K` palette, split
view, find-in-output, four calm themes, and a `:` command layer.

The rule for that layer is the whole design: **a line starting with `:` is
Air's, everything else is your shell's.** No guessing, no "did you mean", no
intercepting a command that merely looks like one of ours. Type `theme` and you
get your shell's; type `:theme` and you get Air's.

```
:help          :new [path]     :split        :font 15 | + | -
:clear         :close          :find text    :zen
:note text     :rename name    :go 2         :export
:notes         :theme harbor   :cwd          :agent claude
```

`:note` is the one thing Air has that the main app doesn't — you notice
something mid-run and the alternative is a scratch file you never open again.
Notes stay in localStorage; Air has no network code to send them anywhere.

Open it with `npm run air`, `sush --air`, or **Open Sush Air** in the main
app's command palette. It is a sibling window, not a mode: opening it changes
nothing in the main app, and closing it takes nothing with it.

## Stack

Electron 43 (main + preload + renderer) · React 18 · a hand-rolled CSS design
system (no UI framework) · xterm.js · node-pty · Vitest.

## Getting started

```bash
npm install
npm run dev       # electron-vite dev — hot-reloading renderer
npm run air       # same, but boots Sush Air alone (no main window)
```

Other scripts:

```bash
npm test          # vitest — unit tests over the pure renderer/main libs
npm run build      # electron-vite build → out/
npm run package    # electron-builder → dist/ (NSIS / dmg / AppImage)
npm run usage       # tools/claude-usage.mjs — CLI usage probe
npm run mint         # tools/mint-code.mjs — mint an offline unlock code
```

Requires Node 22.12+. Packaging targets NSIS (Windows), dmg (macOS), and
AppImage (Linux) via `electron-builder`.

## Plans

Sush is fully usable for free; paid tiers raise the ceilings (account slots
per CLI, grid session cap, dictation minutes) and unlock custom agents, cloud
voices, connected provider accounts, and the Usage Guard. Unlock codes are
offline HMAC codes — no payment rails, no account required. Redeem one in
Settings ▸ Plan, or run `unlock SUSH-...` in any session.

## Documentation

| File | What it covers |
|---|---|
| [`docs/SUSH_GUIDE.md`](docs/SUSH_GUIDE.md) | The master use case, tips & tricks, honest pros/cons |
| [`PRODUCT.md`](PRODUCT.md) | Users, purpose, brand personality, design principles |
| [`DESIGN.md`](DESIGN.md) | The visual system — color, type, spacing, motion, components |
| [`THEME.md`](THEME.md) | Theme palette rules |
| [`PUBLIC.md`](PUBLIC.md) | User-facing "What's New" — the latest release highlights |
| [`learning.md`](learning.md) | Engineering lessons carried across cycles |
| [`GRAVEYARD.md`](GRAVEYARD.md) | Retired features and why — and what has risen |
| [`REVIEW.md`](REVIEW.md) | 2026-07-24 codebase review: bugs found, what was left alone |

## License

Proprietary — all rights reserved.
