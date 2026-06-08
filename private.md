# Sush — Internal Notes

Architecture decisions, gotchas, and known issues. Not for public consumption.

## Architecture overview
- **Main** (`src/main`): Electron main process. `ipc.js` owns PTY lifecycle
  (`node-pty`), the registered-command runner, git/docker/port/system helpers,
  and per-tab `ShellContext`. `shell/` holds the command registry, parser,
  context, and (new) `sushrc` + `scrollback` modules. `commands/` are the
  built-in commands (each `{ name, description, usage, aliases?, run() }`).
- **Preload** (`src/preload/index.js`): the `window.sush` bridge. Every new main
  IPC handler needs a matching method here.
- **Renderer** (`src/renderer/src`): React. `App.jsx` is the brain — owns tabs,
  active session, layout persistence (localStorage), keyboard shortcuts, and all
  modal state. `useTerminal.js` wraps xterm; `components/` are the UI.

## 3.2.1 — implementation notes

### Agent-session resume after restart (was `bugnoticed.md`)
- **Root cause:** the session-layout persistence saved every tab field *except*
  `bootCommand`, so restored agent tabs spawned a bare shell — the `claude` command
  never re-ran. (The `bootCommand` pipeline itself — `makeTab` → `useTerminal`
  `bootCommandRef` → `startPty` → `writeShellCommands` ~900ms after spawn — was fine.)
- **Fix, Layer A:** persist `bootCommand` in the `SESSION_LAYOUT_KEY` save effect
  and pass it back through `makeTab(profile, { command })` in `loadSessionLayout`.
- **Fix, Layer B:** `agents.js` agents may declare a `resumeCommand`; `claude` uses
  `claude --continue`. `restoreBootCommand(item)` (App.jsx) maps a restored tab by
  `agentId` to `resumeCommand ?? command ?? bootCommand`, so Claude resumes its prior
  conversation (keyed by cwd) and other agents re-launch fresh. Resolution is by
  `agentId`, so the persisted `bootCommand` value drifting to the resume form across
  saves is harmless (idempotent).
- **Opt-out:** `settings.resumeAgents` (default on) gates the whole thing — read in
  `loadSessionLayout` via `loadSettings()`. Off → restored tabs are bare shells (old
  behavior), so users who don't want N agent CLIs auto-spawning on launch can disable
  it. UI toggle in `Settings.jsx` (Appearance section).
- **Note:** PTYs die with the app — there's no process to reattach to, so "resume" is
  always a re-launch in resume mode, not a reconnect. Only `claude` has a verified
  `resumeCommand`; add others as their resume syntax is confirmed.

## 3.2.0 — implementation notes

### Status bar (`components/StatusBar.jsx`)
- Self-contained: polls `getSystemStats` + `gitStatus` on a 4s interval and re-reads
  git whenever the active cwd changes. Rendered in `App` after the main flex row,
  hidden in zen mode. `activeTab` is passed as `null` on the Home view so it shows
  "Home" instead of a stale session path. CPU/mem turn amber ≥60%, red ≥85%.

### Command markers (`hooks/useTerminal.js`)
- On every committed command (the `\r` branch of `term.onData`) we
  `term.registerMarker(0)` + `registerDecoration({ marker, overviewRulerOptions })`
  so a colored tick lands on xterm's overview ruler at the prompt line. Accent is
  read from `accentRef` (kept in sync via a theme effect) because the create-effect
  doesn't depend on `theme`. Wrapped in try/catch — marker registration can return
  null if the buffer isn't ready.

### Split-pane upgrades (`App.jsx` + `Terminal.jsx`)
- New state: `splitRatio` (left fraction 0.2–0.8) and `focusedPane` ('left'|'right').
- Panes use `flex: <ratio> 1 0%`; the divider is a 6px `col-resize` handle whose
  `startSplitDrag` maps mouse X within the container (`splitContainerRef`) to a ratio.
- The non-focused pane gets `grayscale + brightness` dimming + reduced opacity; the
  focused pane gets an inset accent border. Clicking a pane sets focus; **Alt+←/→**
  switches it (effect only active while `splitMode`).
- `Terminal` gained a `splitVisible` prop so both split panes render visible even
  though only the focused one is keyboard-`active` (drives xterm focus + the Ctrl+F
  handler). Non-split tabs are unaffected.

### Unified command palette (`App.jsx` `paletteActions` / `handlePaletteAction`)
- `paletteActions()` now also emits: split/broadcast toggles, a `theme:<id>` entry
  per registered theme, and a `recent:<cwd>` entry per recent session (on top of the
  existing per-session `session:<id>` jumps). `handlePaletteAction` grew matching
  `theme:` / `recent:` / `split` / `broadcast` branches. Theme switch writes
  `settings.themeId` via `saveSettings`.

## 3.1.0 — implementation notes

### New commands module (`commands/more.js`)
- Added `uuid`, `genpass`, `head`, `tail`, `tree`, `now`, `url`, `ip`, `gitlog`,
  `json`. Registered by appending `more` to `allModules` in `shell/registry.js`.
- All depend only on Node built-ins + `_helpers` (no Electron), so they're unit-
  testable in isolation (verified by a throwaway ESM harness during development).
- `gitlog` uses git's `%x1f` (unit-separator) field delimiter and splits on
  `\x1f` — commit subjects never contain it, so no fragile parsing. Avoid putting
  literal control bytes in source; always use the `%xNN` escape.
- `ip` resolves the public address via `api.ipify.org` with a 5s `AbortSignal`
  timeout and degrades to `(unavailable)` offline.

### Bug fixes this round
- **`notify` freeze:** the old Windows branch used `execFileSync` to pop a
  `System.Windows.Forms.MessageBox`, which is modal *and synchronous* — it blocked
  the Electron main process (and therefore every PTY + the whole UI) until the
  user clicked OK. Replaced with `new Notification(...).show()` (non-blocking),
  keeping `osascript`/`notify-send` only as fallbacks when `Notification.isSupported()`
  is false.
- **Case-insensitive dispatch:** `parser.js` used to `toLowerCase()` the command,
  which would mangle case-sensitive passthrough targets. Parser now preserves the
  original casing; `registry.get()` falls back to a lower-cased lookup so built-in
  names still match regardless of typed case.
- **`top5`:** coerces `cpu`/`mem`/`name`/`pid` with safe defaults before calling
  `.toFixed`/`.slice` so a single undefined field can't throw the command.
- **Boot banner version:** `buildBootLines` now reads `app.getVersion()`.

## This round — implementation notes

### Corner-style tokens
- Radii live as CSS vars in `index.css` (`:root` = rounded default,
  `body[data-corners="sharp"|"pill"]` override). Components reference them inline
  as `borderRadius: 'var(--r-md)'` — inline `var()` resolves from the body
  cascade, so no `!important` battles.
- `App` sets `document.body.dataset.corners` from `settings.cornerStyle`.
- Only the high-traffic chrome was converted (rail, command bar, palette, title
  bar, new modals). Remaining components keep numeric radii; converting them is a
  mechanical follow-up if we want 100% coverage. macOS traffic-light dots and
  status dots intentionally stay `50%`.

### Session handoff
- Card built in `App.buildHandoffCard`: `gitStatus` + `getScrollback` +
  `commandHistory` (note: `commandHistory` is **global across tabs**, not
  per-session — the scrollback tail is the per-session signal).
- **Injection is one line on purpose.** Writing multi-line text to a PTY runs
  each line as a command in a plain shell. So `performHandoff` collapses newlines
  to ` | ` and pastes WITHOUT a trailing CR (user reviews + presses Enter). The
  full multi-line card goes to the clipboard instead.
- "New session" handoff passes a unique `tag: handoff-<ts>` so `openTab`'s
  same-cwd dedupe doesn't collapse it into an existing session; injects after a
  1200ms delay to let the shell prompt appear.

### .sushrc
- `shell/sushrc.js` parses an INI-like file at `~/.sushrc`. Applied in
  `startPtySession`: env merged into spawn env (our TERM/COLORTERM/SUSH override
  user values), `[alias]` → `ShellContext.aliases` (so they expand in the
  smart-command bar — they do NOT become real shell aliases), `[startup]` lines
  written to the PTY ~700ms after spawn, `cwd` used as a fallback start dir.
- Re-read on every `startPty` (cheap) so edits apply to new sessions without a
  restart.

### Scrollback persistence
- `shell/scrollback.js` = `ScrollbackStore`. Per-tab ring buffer of
  **ANSI-stripped** text (60KB cap), keyed by a renderer-provided `restoreKey`
  (= `tabKey` = `profileId:shell:cwd`). Persisted to
  `userData/sush-scrollback.json` (last 40 workspaces). Replayed as a dim,
  plain-text block on reopen so it can never corrupt the new session's cursor.
- `restoreKey` is only sent when `tab.cwd` exists — blank/new tabs don't persist
  (avoids unrelated history bleeding into fresh tabs that share the `:new` key).

### Quick switcher (Ctrl+Tab)
- MRU order tracked in `mruRef` (effect on `activeId`). Gesture: Ctrl+Tab opens
  `QuickSwitcher` and snapshots the order; further Tabs advance the index;
  `keyup` on Control commits. Self-contained effect with `[]` deps using refs.

## Known issues / follow-ups
- Corner tokens not yet applied to every component (RightPanel, HomeDashboard,
  NewSessionModal, ProfileManager, etc. still use numeric radii).
- Handoff `recent commands` come from the global command history, not the source
  session specifically — could parse the scrollback for per-session accuracy.
- `.sushrc` aliases only affect the Sush smart-command layer, not the underlying
  real shell. Translating to per-shell rc files would be a larger feature.
- Quick switcher has no Escape-to-cancel (closes only on Ctrl release).
- Scrollback replay is plain text (colors stripped). Acceptable for a history
  banner; a true replay would need a serialize addon.
- Pre-existing build warning: `registry.js`/`parser.js` are both static- and
  dynamic-imported (via `extras.js`) — harmless chunking note.
