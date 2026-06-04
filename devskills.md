# Sush — Tech Stack & Skills

## Stack
- **Runtime:** Electron 31 (main + preload + renderer), `electron-vite` build.
- **Frontend:** React 18, inline-style design system, Tailwind 3 (base/utilities
  + a hand-rolled CSS layer in `index.css`), custom Feather-style SVG icon set
  (`Icons.jsx`, no icon dependency).
- **Terminal:** `@xterm/xterm` + addons (fit, search, web-links), `node-pty`
  pseudo-terminals, system ConPTY on Windows with winpty/cmd.exe fallbacks.
- **System info:** `systeminformation` (CPU/mem/GPU/net/ports/processes).
- **Process exec:** `execa` / `child_process` (`execFile`, never shelling out
  with user input to avoid injection).
- **Persistence:** `localStorage` (renderer UI state/layout), `electron-store`,
  and plain JSON/text files under `app.getPath('userData')`
  (`sush-profile.ps1`, `sush-scrollback.json`) plus `~/.sushrc`.
- **AI:** Anthropic + OpenAI REST (command autocomplete, Seducia), Web Speech /
  ElevenLabs TTS.

## Patterns used
- **Custom shell layer:** a command registry intercepts ~40 built-ins before
  falling through to a real PTY; commands return `{ output, type, action?, cwd? }`
  where `action` drives renderer behavior (`open-workspace`, `passthrough`,
  `open-sushrc`, `handoff`, `corners`, …).
- **PowerShell bootstrap:** generated `sush-profile.ps1` injects a custom prompt,
  OSC-7 cwd reporting, and `&&` compatibility for Windows PowerShell 5.1.
- **CSS-variable theming:** accent + corner-radius tokens set on root/body and
  consumed by inline styles via `var(--…)`.
- **Design-token toggles:** appearance settings (corners, theme, fonts, opacity)
  flow through a single `settings` object persisted to localStorage.
- **IPC contract:** every capability = main `ipcMain.handle` + `preload`
  `window.sush.*` method + renderer call. Keep the three in sync.

## Conventions
- Imperative commit messages; concise.
- ASCII only in renderer strings (curly quotes were stripped project-wide).
- New built-in commands go in `src/main/commands/*` as
  `{ name, description, usage, aliases?, run(args, ctx) }` and are auto-registered.
- New UI state lives in `App.jsx`; modals are conditionally rendered there.
