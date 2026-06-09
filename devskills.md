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
- **Custom shell layer:** a command registry intercepts ~50 built-ins before
  falling through to a real PTY; commands return `{ output, type, action?, cwd? }`
  where `action` drives renderer behavior (`open-workspace`, `passthrough`,
  `open-sushrc`, `handoff`, `corners`, …).
- **PowerShell bootstrap:** generated `sush-profile.ps1` injects a custom prompt,
  OSC-7 cwd reporting, and `&&` compatibility for Windows PowerShell 5.1.
- **CSS-variable theming:** accent + corner-radius tokens set on root/body and
  consumed by inline styles via `var(--…)`.
- **xterm decorations:** `registerMarker` + `registerDecoration` overview-ruler
  ticks mark where each command started (command markers).
- **Split panes:** ratio-driven flex layout with a drag-to-resize divider,
  focused/dimmed pane states, and `Alt+←/→` focus movement. Both panes stay
  mounted (`splitVisible`) while only the focused one is keyboard-active.
- **Command palette as keyboard spine:** one fuzzy surface (Ctrl+P) over built-in
  commands, session jumps, recent workspaces, theme switching, and toggles.
- **Persistent status bar:** cwd · git branch/dirty · shell · session count ·
  live CPU/mem, polled from `getSystemStats` + `gitStatus`.
- **Design-token toggles:** appearance settings (corners, theme, fonts, opacity)
  flow through a single `settings` object persisted to localStorage.
- **IPC contract:** every capability = main `ipcMain.handle` + `preload`
  `window.sush.*` method + renderer call. Keep the three in sync.
- **Theme-driven CSS vars:** glass themes tune frosted-panel tint via
  `--glass-surface`/`--glass-omni` (CSS falls back to defaults; `glassVars` emits
  them only for `glass` themes), so one CSS rule serves many glass variants.
- **CLI-backed AI (no key):** shell out to a logged-in CLI (`claude -p`) from
  main via `spawn`, piping the whole prompt over **stdin** (zero argv injection
  surface); Windows `.cmd` shims route through `cmd.exe /c`. Renderer treats it as
  a single-yield streamer behind the same `getStreamer` interface.
- **PTY-stream state inference (Mission Control):** one global `onPtyData`/`onPtyExit`
  subscription feeds per-tab tail buffers in a **ref** (never re-render on bytes); a
  low-frequency timer reclassifies output into `working/waiting/idle/error/done` and
  commits only on change. Heuristic classifier strips ANSI, then matches spinner/prompt/
  error signatures with a conservative priority order. Scales to a full swarm cheaply.
- **Glass theme family:** chrome surfaces are translucent (`rgba`) so `data-glass`
  wrappers can frost; presets share one glass recipe (`glassTint`/`glassOmni`/accent
  border) and differ only in accent, reading as one product in many colors. In-shell
  swatch switcher writes `settings.themeId` (same path as Settings) — no parallel state.
- **GPU budget = blur radius:** `backdrop-filter` re-rasterizes per frame the
  content behind it changes; over a live terminal it dominates GPU load. Keep blur
  radii modest, and ship a `.sush-lite` escape hatch (`backdrop-filter: none` +
  frozen ambient animations) plus a `prefers-reduced-motion` block.
- **Habit mining → config:** a `localStorage` frequency table (`lib/commandFrequency`)
  tallies omnibar commands; crossing a threshold surfaces a one-at-a-time suggestion
  that, on accept, edits the user's real `.sushrc` (`hooks/useAutoAlias`). High-churn
  counters stay renderer-local (no IPC); only the accepted write crosses to main.
- **Focus-gated polling:** `hooks/usePolling` ticks only while the window is
  focused + visible — every live dashboard sleeps in the background. The default
  for any recurring IPC poll; never `setInterval` a system probe unconditionally.
- **Cheap vs. heavy IPC split:** keep a lite path for always-on widgets. The
  status bar uses `get-system-stats-lite` (CPU+mem, no child processes); the heavy
  `get-system-stats` (GPU/Wi-Fi/process enumeration — spawns OS processes) is only
  for the on-demand Stats panel.
- **GPU terminal:** xterm runs the WebGL renderer (`@xterm/addon-webgl`, loaded
  after `term.open()`) with automatic DOM fallback on context loss — big CPU win
  on heavy output and swarms.

## Conventions
- Imperative commit messages; concise.
- ASCII only in renderer strings (curly quotes were stripped project-wide).
- New built-in commands go in `src/main/commands/*` as
  `{ name, description, usage, aliases?, run(args, ctx) }` and are auto-registered.
- New UI state lives in `App.jsx`; modals are conditionally rendered there.
