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
  a single-yield streamer behind the same `getStreamer` interface. Resolution
  must be extension-aware on win32: `where` lists npm's extensionless sh shim
  *before* `claude.cmd` — prefer `.exe/.cmd/.bat/.com` hits or spawn ENOENTs.
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
- **Multi-user via env redirection (no OS users):** per-identity home dirs under
  `userData/identities/<id>/home`, injected into every PTY spawn as
  `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `GH_CONFIG_DIR` / XDG vars (optionally
  `HOME`/`USERPROFILE`/`APPDATA` for full isolation). Identity env spreads *last*
  so it beats profile env. The gate: no terminal mounts until main has resolved
  the active user — else the PTY inherits the host's real credentials.
- **`Storage.prototype` shim for per-user namespacing:** installed before first
  render, rewrites app-prefixed localStorage keys to `u:<id>::<key>`; user
  switches go through `location.reload()` so all state rebuilds in the new
  scope. One-time legacy-key migration for the first identity.
- **scrypt PIN gate:** `scryptSync(pin, salt, 32)` + `timingSafeEqual`, framed
  honestly as a casual lock (not encryption) since data on disk stays readable.
- **xterm chord ownership:** `attachCustomKeyEventHandler` returns `false` for
  app-owned chords — window listeners still fire (bubbling) but xterm stops
  forwarding the bytes to the PTY. Also the hook point for Ctrl+Shift+C/V
  (use `term.paste()` so bracketed-paste mode is honored).
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

- **OAuth in Electron, two shapes:** GitHub **Device Flow** (no secret, no
  redirect — show a code, poll the token endpoint honoring `interval` /
  `slow_down`) and Google **loopback PKCE** (one-shot `http` server on
  `127.0.0.1:0` + system browser via `shell.openExternal`; never an embedded
  webview — Google blocks them). Both flows live entirely in main and report
  progress to the renderer over a one-way event channel.
- **Tokens stay in main:** provider tokens are `safeStorage`-encrypted
  (DPAPI) per identity and never cross the IPC boundary — the renderer
  receives mapped rows/counts, not credentials. Refuse to store plaintext
  when OS encryption is unavailable; degrade features instead.
- **Sign-in as unlock factor:** matching a verified provider subject
  (google `sub` / github `id`, never login/email — those can change)
  activates the identity *without* the PIN: a live account session is the
  stronger factor. Corollary: don't store a Google refresh token, or the
  "live check" degrades into a replayable credential.
- **Pending-ticket pattern for sign-up-via-OAuth:** when a flow finishes but
  matches no account, park the profile (+token) in a one-shot TTL map and
  hand the renderer a ticket id; the create call validates and consumes it
  server-side so create + link + token-save stays atomic.
- **GitHub REST hygiene:** ETag cache keyed per user (304s don't count
  against the rate limit), honor `X-Poll-Interval` for notifications,
  single-flight per endpoint, negative-cache CLI token misses (a poll must
  not spawn a process), and 401 → drop the token cache so the alternate
  source gets retried.

- **LLM tool protocol over plain text:** the assistant emits `ACTION:<json>`
  lines after its prose; the renderer parses them out, executes through the
  same callbacks the UI buttons use, and never shows the raw lines. Risky
  actions (spawning agent swarms) get a confirm card with a countdown
  auto-proceed; cheap ones run instantly. Multi-action = one line each, in
  order.
- **CLI fallback cascade:** when one assistant CLI hits its session limit,
  roll to the next logged-in one (claude -> codex -> gemini), all driven over
  stdin from main. Surface which engine answered (trust requires knowing who
  spoke). Per-engine output cleanup stays in main next to the spawn.
- **Prompt-into-TUI timing:** you can type into a freshly spawned agent CLI
  session, but only after its TUI initializes — boot command first, brief a
  few seconds later, staggered across a swarm. Flatten newlines: Enter is
  submit.
- **Draggable floating widgets:** pointer capture on a drag handle (skip
  clicks that start on buttons), position persisted to localStorage, default
  = an edge anchor, double-click to reset, clamp to viewport.
- **Avatar uploads without a backend:** file input -> canvas center-crop
  downscale -> small JPEG data URL stored inline in the JSON user store.
  Avoids file:// (webSecurity) and keeps the store self-contained.

## Conventions
- Imperative commit messages; concise.
- ASCII only in renderer strings (curly quotes were stripped project-wide).
- New built-in commands go in `src/main/commands/*` as
  `{ name, description, usage, aliases?, run(args, ctx) }` and are auto-registered.
- New UI state lives in `App.jsx`; modals are conditionally rendered there.
