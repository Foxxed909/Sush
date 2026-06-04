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
