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

## Crew features (v0.2)

- **`sush crew claude codex opencode "fix the flaky test"`** opens one pane per agent, side by side, all started on the
  same prompt. It uses tmux (splitting the current window, or a new tiled session with pink borders) or Windows
  Terminal split panes. `--model codex=gpt-6.1-sol` sets a model per agent, and `--board` adds a live board pane.
- **`sush board [--all]`** shows every agent in this folder (or every folder), live, from the terminal and the desktop app:
  - needs-you first, with pink pilot lights and each agent's last words;
  - a usage meter with the guard tick and a runway ("80% in ~8 min");
  - "hand off before it does: `sush handoff codex`" when the limit is close.
- **Notifications**: the bell plus OSC 9/777 (desktop notifications in iTerm2, Windows Terminal, Ghostty, WezTerm,
  kitty and foot, wrapped for tmux) when an agent starts needing you, finishes, stops or hits a limit.
- **`sush handoff codex [--from claude]`** writes a brief from the latest conversation here (what was asked, where it
  got to, files touched), saves it to `~/.sush/handoffs/`, and starts the next agent with it.
- **Desktop bridge**: both sides read and write `~/.sush/crew/`. The terminal's agents appear on the desktop's Agents
  board ("In your terminal"), and the desktop's sessions and usage samples appear on `sush board`.

Status comes from the agents' own conversation logs (Claude Code's `projects/` JSONL, Codex's session rollouts). Sush
never reads credentials, and nothing leaves the machine.

## Roadmap

1. Attach from `sush board` to a pane (tmux `select-pane`) or a desktop session.
2. Status for Gemini and OpenCode from their own logs (they show "Running" today).
3. Themes: the wordmark and borders follow the app's accent (pink stays the default).
