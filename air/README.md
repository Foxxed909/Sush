# Sush Air 💨

The light Sush. A separate desktop app built on **Tauri 2** — a native Rust
shell hosting a small React webview — instead of Electron. Same soul, a
fraction of the footprint.

## What's in (the essentials)

- **Terminal sessions** — real PTYs (portable-pty in Rust), xterm.js frontend,
  up to 12 tabs
- **Agent launching** — palette entries for Claude / Gemini / Codex / Aider,
  or `:agent claude` in any session
- **Command palette** — `Ctrl+K`: sessions, agents, themes, actions
- **Themes** — Ink, Ember, Moss, Paper
- **Air commands** — start a line with `:` on a fresh prompt:
  `:help` `:clear` `:note …` `:theme <id>` `:agent <name>` `:air`

## What's deliberately out

Seducia, crews/swarms, workspaces, dictation, credits/plans, users/PINs, the
right panel, SSH manager — that's big Sush. Air stays light.

## Keys

| Key | Action |
|-----|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+Shift+N` | New session |
| `Ctrl+W` | Close session |

## Dev

```sh
cd air
npm install
npm run dev      # tauri dev (needs Rust)
npm run build    # production bundle + installer
```

The `:` sigil is handled entirely in the renderer — Air never has to un-type a
line from PSReadLine/readline, and every real shell keystroke passes through
untouched.
