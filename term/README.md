# Sush Terminal

**Sush, quietly in your terminal.**

A TUI for running AI coding agents without the desktop app: no Electron, no
window, no dependencies. Pink, always.

```
▄█▀▀▀▀▀  █▌   ▐█  ▄█▀▀▀▀▀  █▌   ▐█
▀█▄▄▄▄▖  █▌   ▐█  ▀█▄▄▄▄▖  █▙▄▄▄▟█
     ▐█  █▌   ▐█       ▐█  █▌   ▐█
▀▀▀▀▀▀▘  ▝▀▀▀▀▀▘  ▀▀▀▀▀▀▘  ▀▘   ▝▀
       quietly in your terminal
```

## Run it

```bash
node term/bin/sush.mjs            # home screen
npm run term                      # same, from the repo root
cd term && npm link               # puts `sush` on your PATH
```

## What it does now (v0.1)

- **Home screen**: the pink block wordmark (true colour, with a 256-colour fallback),
  a prompt box, the current agent and model, and your folder.
- **Agents**: Claude Code, Codex, Gemini and OpenCode, detected on PATH. `tab` cycles them, and one that isn't
  installed shows its install command.
- **Models**: `ctrl+t` opens the same catalog the desktop app uses
  (`src/renderer/src/lib/modelCatalog.mjs`), including OpenCode's free models.
  Your choice is remembered per agent.
- **Launch**: type a prompt and press `enter`. The agent starts right there, with
  your prompt, and returns you home when it exits ("Claude Code finished · 4m 12s").
- **Resume**: `ctrl+r` continues the last conversation in this folder.
- **History**: `↑` / `↓` recall earlier prompts.
- **Scriptable**: `sush run <agent> [--model id] [--resume] [prompt]`,
  `sush agents`, `sush models [agent]`, `sush logo`, `sush --version`.
- Respects `NO_COLOR`, never colours pipes, survives `| head`, and redraws on resize.
  State lives in `~/.config/sush-terminal/state.json`
  (`%APPDATA%\sush-terminal` on Windows) and never leaves the machine.

## Roadmap

1. **Crews**: launch several agents in tmux/Windows Terminal panes from one prompt (`sush crew`).
2. **Live board**: `sush board` shows every running agent in the folder, with a
   pilot-light status per agent (working / needs you / done), like the app's Agents view.
3. **Usage and limits**: read the desktop app's account usage and show the runway ("80% in ~38 min").
   Offer a hand-off to another account or agent before the limit hits.
4. **Hand-off**: `sush handoff <to-agent>` writes a brief from the last
   conversation and starts the next agent with it.
5. **Desktop bridge**: when Sush desktop is running, `sush` lists its sessions and
   can attach to one, so the terminal and the app share one crew.
6. **Themes**: the wordmark and borders follow the app's accent (pink stays the default).
7. **Notifications**: a terminal bell and OSC 9 notification when a backgrounded agent needs you.
