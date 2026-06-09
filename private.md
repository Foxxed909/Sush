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

## 3.5.0 — implementation notes

### Auto-alias miner
- **Signal source is the omnibar only.** `recordCommand()` is called from
  `runSmartInput` in `App.jsx` after a non-error result — so failed typos and
  passthrough errors don't inflate counts. Commands typed *directly into xterm*
  are NOT tallied (that would mean parsing the PTY echo stream, fragile); the
  omnibar is the intended "smart input" path.
- **Storage is renderer-local.** `lib/commandFrequency.js` keeps the tally in
  `localStorage` (`sush.cmdfreq.v1`) plus a dismissed set (`…dismissed.v1`). The
  table churns on every command, so routing it through IPC + electron-store would
  be wasteful. Self-prunes: drops entries unseen >45 days and caps at 200 rows.
- **Threshold + filtering.** `THRESHOLD = 15`. `isAliasable()` skips lines <4
  chars and bare single short tokens (`ls`, `cd`). `suggestAliasName()` builds
  initials from non-flag tokens (`git status` → `gs`), de-duping against existing
  alias keys.
- **`.sushrc` writing** is in `hooks/useAutoAlias.js`: it re-reads the raw file,
  splices `name = command` into the `[alias]` section (creating it if absent),
  and writes back via `sushrcWrite`. It re-parses existing aliases so it never
  re-suggests a command already aliased. Gated by `settings.autoAlias !== false`.
- **UI:** `components/AliasNudge.jsx` — bottom-left glass toast, clear of the
  Seducia orb. `App` hides it via `nudgeHidden` (the ✕) until the next qualifying
  command; "Never" persists to the dismissed set.

### Performance — glass is the GPU cost
- `backdrop-filter` re-rasterizes its frosted region every frame the content
  behind it changes; with a live terminal under 4 always-on glass surfaces that's
  the dominant GPU load. Mitigations in `index.css`: blur radii ~halved, a
  `.sush-lite` class (driven by `settings.lite`, applied on the root in `App.jsx`)
  that sets `backdrop-filter: none` + freezes ambient animations, and a
  `prefers-reduced-motion` block that kills the infinite glow keyframes.

## 3.4.0 — implementation notes

### Mission Control (live agent board)
- **Data layer is render-cheap on purpose.** `hooks/useAgentActivity.js` mounts a
  *single* global `window.sush.onPtyData` / `onPtyExit` subscription and appends each
  session's output into a per-tab tail buffer held in a **ref** (`TAIL_CHARS = 700`) —
  so byte traffic never triggers a React render. A `setInterval` (`TICK_MS = 700`)
  reclassifies every live tab and only `setState`s when a state actually changed. A
  16-agent swarm therefore costs one cheap pass per tick, not a render per byte.
- **Classifier** (`lib/agentActivity.js`, `classify(rec, now)`): priority order is
  exited→(error|done) → working (output <1.5s old OR spinner/"esc to interrupt"
  phrase) → waiting (settled AND a y/n or framed-prompt tail, but NOT a bare shell
  prompt) → error (error/traceback tail, not a shell prompt) → idle. Deliberately
  conservative so a busy agent never reads as "waiting." ANSI/control bytes stripped
  before matching. **Heuristic** — real-CLI tuning expected.
- **Wiring** (`App.jsx`): `Ctrl+Shift+M` (NOT `Ctrl+M` — that's CR in a terminal),
  `Esc` to close, command-palette entry (`action: 'mission'`), and the `StatusBar`
  badge (`agentSummary` + `onOpenMission` props). Actions reuse existing `closeTab` /
  `closeGroup` / focus; `promptSession(tabId, data)` sends raw input to one session
  (queues via `pendingPtyRef` if its PTY hasn't booted). The board groups tabs by
  `groupId`/`groupLabel`, sorts "needs-you first."
- **CSS:** appended a small block to `index.css` (`.sush-mc-row`, `.sush-mc-btn`,
  `@keyframes sush-pulse-dot` driven by a `--pulse` custom prop) — no existing rules
  touched.

### Full app-shell redesign + glass theme family
- **Root cause of the old "flat" look:** every chrome surface painted an *opaque* hex
  background, so the `data-glass` wrappers in `App.jsx` had nothing to frost. Fix: made
  TitleBar / SessionRail / SmartCommandBar / StatusBar / RightPanel backgrounds
  translucent (`rgba(...)`) and rerouted borders/inactive states through `rgba(accent,…)`.
- **New presets** (`themes/`): `pinkther.js`, `royal.js` (Sophisticated Purple),
  `emerald.js`, `amber.js`, `midnight.js`, plus refined `glassdark.js`. All share the
  glass recipe (`glassTint ~0.55`, `glassOmni ~0.66`, `border rgba(accent,0.14–0.16)`).
  Registered in `themes/index.js`; `defaultTheme` is now `glassdark`.
- **In-shell theme switcher** lives in `TitleBar.jsx` (palette icon → swatch popover),
  writing straight to `settings.themeId` via the same `saveSettings` path as Settings /
  command palette — no parallel state. `.sush-swatch` styles in `index.css`.
- **Caveat:** non-glass legacy themes (dark/nord/dracula/…) now render transparent chrome
  too, so they fall back to `xterm.background` showing through — fine but flatter than the
  glass set. A tinted-chrome fallback for them is a possible follow-up.

## 3.3.0 — implementation notes

### Glass Dark theme (`themes/glassdark.js`)
- Second `glass: true` theme. The glass CSS (`index.css` `.sush-glass-ui`) used to
  hardcode the frosted-panel tint; it now reads `var(--glass-surface, <old default>)`
  and `var(--glass-omni, <old default>)`. A theme can set `ui.glassTint` / `ui.glassOmni`
  and `App` emits them as those vars via `glassVars(theme.ui)` (lib/ui.js), merged into
  the root div style only when `theme.ui.glass`. The original `glass` theme sets neither,
  so it falls back to the old values unchanged. `glassdark` sets darker tints.

### Seducia via the `claude` CLI (no API key)
- **Why:** users logged into the `claude` CLI shouldn't need to paste an API key (or pay
  twice) to use Seducia. New `settings.seduciaProvider` = `'cli'` | `'key'` (default key).
- **Main:** `runClaudeCli({prompt, cwd})` (ipc.js) resolves `claude` via `resolveExecutable`
  (`where`/`which`), then `spawn`s it in `-p` (print) mode and writes the **entire** prompt
  to **stdin** — so no untrusted text ever hits the command line (no shell, no injection).
  Windows `.cmd`/`.bat` shims are routed through `cmd.exe /c` with constant flags only.
  60s timeout, returns `{ok, text}` / `{ok:false, error}`. IPC: `sush:seducia-cli`.
- **Renderer:** `streamClaudeCli` (lib/ai.js) flattens system prompt + full conversation
  into one stdin prompt (stateless per call, like the HTTP streamers) and yields the reply
  **once** (single-shot, not token streaming). `getStreamer` returns it when provider==='cli'.
  ACTION-line parsing is unchanged, so launch/prompt/focus actions still work.
- **UI:** Settings ▸ AI gained a Provider segmented toggle; the API-key fields are hidden
  and replaced with a note when CLI is selected. Seducia's `hasAIKey` gate now also passes
  when provider==='cli'.
- **Note:** the CLI may invoke tools / read files in `cwd` (it's the full agent, not a chat
  endpoint), so replies can be slower than the API path. Acceptable for orchestration.

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
