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

## Stack

Electron 31 (main + preload + renderer) · React 18 · a hand-rolled CSS design
system (no UI framework) · xterm.js · node-pty · Vitest.

## Getting started

```bash
npm install
npm run dev       # electron-vite dev — hot-reloading renderer
```

Other scripts:

```bash
npm test          # vitest — unit tests over the pure renderer/main libs
npm run build      # electron-vite build → out/
npm run package    # electron-builder → dist/ (NSIS / dmg / AppImage)
npm run usage       # tools/claude-usage.mjs — CLI usage probe
npm run mint         # tools/mint-code.mjs — mint an offline unlock code
```

Requires Node 20+. Packaging targets NSIS (Windows), dmg (macOS), and
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
| [`GRAVEYARD.md`](GRAVEYARD.md) | Retired features and why |

## License

Proprietary — all rights reserved.
