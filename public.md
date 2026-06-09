# Sush — Public Changelog

A custom Electron terminal (React + node-pty) with AI orchestration (Seducia),
swarms/workspaces, split panes, broadcast, themes, and a built-in command layer.

---

## 3.5.1 — "Lexicon" (performance pass)

The app is now **markedly lighter** — less idle CPU, far fewer background
processes, and GPU-accelerated terminals — with every feature intact.

### Faster / lighter
- **GPU terminal rendering.** Terminals now paint via a WebGL canvas + glyph
  atlas instead of mutating the DOM per line — typically **2–4× less CPU** on
  heavy output and much better scaling across a swarm. Falls back to the DOM
  renderer automatically if a GPU context isn't available.
- **No more constant system-probing.** The status bar used to call a heavy
  system-stats routine every 4s that spawned OS processes (GPU/Wi-Fi/process
  enumeration) just to show CPU% and memory. It now uses a lightweight CPU+memory
  read with **zero process spawns**.
- **Background polling sleeps.** Every live dashboard (status bar, system stats,
  ports, docker) now **pauses entirely when the window is unfocused or
  minimized**, and resumes instantly when you come back. Cadences were also eased.
- Dev builds no longer auto-open detached DevTools (a whole second renderer);
  press **F12** / **Ctrl+Shift+I** when you want it.

---

## 3.5.0 — "Lexicon"

### Added
- **Auto-alias miner.** Sush now quietly tallies the commands you run through the
  omnibar. Run one often enough (~15×) and a small card offers to save it as a
  short alias in your `.sushrc` — `git status` → `gs`, `npm run dev` → `nrd`. The
  alias name is editable, nothing is written until you hit **Add**, and you can
  **Never suggest this one** to silence a command for good. Your shorthand library
  grows out of your own habits instead of manual config. Toggle from **Settings ▸
  Sush Profile**.

### Changed — performance / lighter on the GPU
- **Frosted-glass blur roughly halved** (`26px → 14px`, omnibar `14px → 9px`).
  `backdrop-filter` cost scales with blur radius, so this is a big GPU win while
  the look barely changes.
- **New "Reduce effects" toggle** (Settings ▸ Appearance) drops backdrop-filter
  entirely and freezes the ambient glow animations — a large saver on laptops or
  when a busy agent swarm keeps the terminal repainting behind the glass.
- The app now honors the OS **"reduce motion"** preference automatically.

---

## 3.4.0 — "Aurora"

### Added
- **Mission Control (`Ctrl+Shift+M`).** A live board of every session, grouped by
  workspace (swarm), each showing its real-time state inferred from the terminal
  output — **Working · Needs you · Idle · Error · Done**. Agents blocked on a
  prompt surface a **Needs you** pill with one-click **`y ↵`** / **`↵`** replies,
  and every row has **Focus** and **Close**. A pulsing **"N need you / N working"**
  badge sits in the status bar (click to open) so you always know if a swarm wants
  attention without tabbing through it.
- **Six premium glass themes.** A cohesive, frosted-glass theme family you can
  toggle from the new **palette switcher in the title bar** (or Settings ▸
  Appearance): **Glass Dark**, **Pinkther** (luminous rose over deep plum),
  **Sophisticated Purple**, **Emerald Glass**, **Amber Glass**, and **Midnight
  Glass**. They share one glass recipe so they read as the same product in
  different colors.

### Changed — full app-shell redesign
- The whole chrome — title bar, session rail, command bar, status bar, and right
  panel — was rebuilt to be **genuinely translucent** so the frosted glass shows
  through, with accent-aware borders, a faint lit top-edge on every panel, and
  tighter, more consistent spacing and controls.
- Default theme is now **Glass Dark**.

---

## 3.3.0 — "Sakura"

### Added
- **Glass Dark theme.** A deep, near-black frosted variant of the Glass theme
  with a soft periwinkle accent — darker and less saturated than the original
  cyan Glass. Pick it in **Settings ▸ Appearance ▸ Theme**.
- **Seducia can run on the Claude CLI (no API key).** A new **Settings ▸ AI ▸
  Provider** toggle lets Seducia drive your already-logged-in `claude` CLI
  instead of an Anthropic/OpenAI API key — no key to paste, no separate billing.
  Just run `claude` once to sign in. (Responses arrive as a single message
  rather than streaming token-by-token, since the CLI returns a complete reply.)

---

## 3.2.1 — "Sakura"

### Fixed
- **Agent sessions resume after an app restart.** Closing and reopening Sush used
  to restore the tab but drop you at a bare shell — the agent never re-launched.
  Restored Claude tabs now re-run `claude --continue` so the previous conversation
  in that directory picks up where it left off; other agent CLIs re-launch instead
  of leaving an empty shell. Toggle in **Settings ▸ Appearance ▸ Resume agent
  sessions on launch** (on by default; turn off to restore bare shells).

---

## 3.2.0 — "Sakura"

### Added — design & navigation polish
- **Bottom status bar.** A persistent strip shows the active directory, git branch
  + dirty-file count, shell, live session count, and CPU / memory usage (color-
  coded as load climbs). Updates every few seconds and follows the active session.
- **Command markers.** Each command you run drops a marker on the terminal's
  overview ruler (the right gutter), so you can see and scroll to where every
  command started — like Warp's command blocks.
- **Split-pane upgrades.** The split divider is now drag-to-resize, the inactive
  pane dims (grayscale + dimmed) while the focused pane gets an accent border, and
  **Alt+← / Alt+→** moves keyboard focus between panes. Both panes now stay live
  on screen instead of only the active one.
- **Unified command palette (Ctrl+P).** The palette is now the keyboard spine:
  search and run built-in commands, jump to any open session, reopen a recent
  workspace, switch color theme, toggle split / broadcast, and open settings — all
  from one fuzzy search.

### Keyboard shortcuts (added earlier this line)
- `Ctrl+1`–`8` jump to session N · `Ctrl+9` last session.
- `Ctrl+PgDn` / `Ctrl+PgUp` next / previous session.
- `Ctrl+Shift+T` reopen last closed session · `Ctrl+Shift+N` new-session launcher.
- `Ctrl+,` open Settings · `Ctrl+Shift+Home` go to Home.
- `Alt+←` / `Alt+→` focus the left / right split pane.

### Fixed
- `Ctrl+Shift+B` (broadcast) no longer also fires the `Ctrl+B` panel toggle —
  the plain `Ctrl+B/K/T/W` handlers now ignore the Shift variants.

---

## 3.1.0 — "Minimata"

### Added — 10 new built-in commands
- **`uuid [count]`** (alias `guid`) — generate one or more random v4 UUIDs.
- **`genpass [length]`** (aliases `pw`, `pass`) — cryptographically strong random
  password from a confusable-free character set (default 20 chars).
- **`head <file> [n]`** / **`tail <file> [n]`** — show the first/last N lines of a
  file (default 10).
- **`tree [dir] [depth]`** — print a directory tree (auto-skips `node_modules`,
  `.git`, `dist`, etc.), depth-limited and capped at 1000 entries.
- **`now [epoch]`** (alias `date`) — current local/UTC/ISO time + Unix epoch, or
  convert a given seconds/milliseconds timestamp to a readable date.
- **`url <encode|decode> <text>`** — URL-encode/decode text (companion to `b64`).
- **`ip`** — list local IPv4 interfaces and resolve your public IP.
- **`gitlog [count]`** (alias `glog`) — compact, colorized recent git log.
- **`json <file>`** (alias `jsonf`) — validate and pretty-print a JSON file, with a
  precise parse error when it's invalid.

### Fixed
- **`notify` no longer freezes the app.** The Windows path popped a *synchronous*
  Win32 MessageBox that blocked the entire main process until dismissed; it now
  uses Electron's non-blocking native notification.
- **Command lookup is case-insensitive** while preserving the original casing for
  passthrough — `help LS` works, and case-sensitive binaries (e.g. `Python`,
  `Get-ChildItem`) are no longer lower-cased before being run.
- **`top5` is crash-proof** against missing CPU/memory/name fields returned by
  `systeminformation` on some platforms.
- The boot banner now reads the version from `package.json` instead of a
  hard-coded string, so it can never drift.

---

## 3.0.0 — "Minimata"

### Added
- **Corner styles (Sharp / Rounded / Pill).** New `Settings ▸ Appearance ▸ Corners`
  control restyles the whole UI from one design token. Also cycle it with the
  `corners` command or the command palette.
- **Session handoff.** Right-click a session ▸ *Hand off…* (or the `handoff`
  command) captures its cwd, git branch, recent commands, and a tail of its
  output into a context card, pastes a one-line summary at a chosen target
  session's prompt, and copies the full card to your clipboard.
- **`.sushrc` profile.** A shell-agnostic declarative profile (`~/.sushrc`) for
  aliases, environment variables, startup commands, and a default working
  directory — applied to every shell Sush launches. Edit it via
  `Settings ▸ Sush Profile`, the `sushrc` command, or the command palette.
- **Quick switcher (Ctrl+Tab).** Hold Ctrl and tap Tab to cycle sessions in
  most-recently-used order; release Ctrl to commit (Shift+Tab to go backwards).
- **Session filter.** A filter box appears in the session rail once you have more
  than three sessions; matches by name, path, or workspace.
- **Scrollback persistence.** Recent terminal output is remembered per workspace
  and replayed when you reopen it. Toggle in `Settings ▸ Appearance`.
- **Command palette expansion.** Jump to any open session and run Hand off,
  Rename, Cycle corners, and Edit .sushrc directly from the palette.
- **Copy path** added to the session context menu.

### Changed
- **Session rename is now discoverable** — added a *Rename* entry to the session
  context menu and an **F2** shortcut (double-click still works).
- Keyboard shortcuts help updated for the new actions.

### Fixed
- `Ctrl+Tab` / `Ctrl+Shift+Tab` were documented but not implemented — they now
  drive the quick switcher.

---

## 2.0.0
- Horizontal tab strip, dev-tool tabs, usage tool, port fixes.
- Batches 2–5: notifications, JSON viewer, regex, markdown preview, command
  explainer, split panes, broadcast, git helper, docker, API tester, env
  manager, SSH, AI autocomplete, session recording, ElevenLabs TTS.
