# Sush — Public Changelog

Sush — the terminal your agents live in. Electron + React + node-pty with AI
orchestration (Seducia), workspaces, split panes, broadcast, themes, and a
built-in command layer.

---

## 4.1.0 — "Helm" continued

The live-testing round: smarter handoffs, a grid cockpit, and a face.

### Added
- **Smart handoff.** Hand off now targets a real agent (Claude/Codex/Gemini
  chips), and an **AI summary** button has your claude CLI read the session's
  output and write the brief — the new agent boots, gets briefed, and starts
  working. No more notes left at empty shell prompts.
- **Grid layout** (Ctrl+Shift+G or the grid button): every session in the
  workspace tiled at once with name chips and live status dots; click to
  focus, maximize button per tile. Sleeping sessions show as click-to-wake
  placeholders and at most 9 tiles render — your CPU stays safe.
- **App icon.** Sush has a face now — glossy pink orb, taskbar/tray/installer.
- **Custom wallpaper** (Settings > Appearance) with a readability dim slider,
  stored per user. Plus: set your profile photo right on the create form.
- **Claude limit previewer** — Settings > AI shows your current Claude window
  status and reset time (captured free from panel runs; Check now probes on
  demand). The Claude panel header shows it too.
- **Add account opens the sign-in for you** — new slot activates and a session
  running that CLI opens immediately; complete the login and you're done.
- **Settings is a full standalone page** with a section nav — room to grow.
- **Sidebar minimize** to a thin strip; **PIN auto-submits** on the last digit
  (re-set your PIN once to enable); profile viewer gains **unlink** per
  provider and a guarded **Delete account**.
- **Hush sends automatically** now (review-first available in Settings) and
  shows visible feedback when the mic fails instead of silently giving up.
- **`doctor` shows identity isolation** — who's signed in, where claude's
  config points, whether the login is isolated or shared with the host.

### Fixed
- **Open-to-home + lazy boot:** the app no longer ignites every restored
  session on launch (the crash-on-open CPU spike); sessions boot when first
  viewed.
- **Profile settings no longer reset** after a crashed sign-out (scope
  mismatch at boot now reloads instead of overwriting saved state).
- Seducia verifies a launch directory exists before spinning up a swarm, can
  target sessions **by name** ("tell Claude Code 2 ..."), knows which session
  you're looking at, and relays errors between sessions via read-output.
- CLI timeout 90s → 180s and Seducia's claude calls skip MCP servers
  (`--strict-mcp-config`) — the main cause of "claude timed out" on slower
  machines.
- Boot banner and splash said "Lexicon" — now Helm.

---

## 4.0.0 — "Helm"

Seducia takes the helm, sessions move into Workspaces, and Claude Code gets
its own panel.

### Added — Seducia runs the place
- **Full control.** New actions: close sessions, close/rename workspaces,
  switch themes, and **read-output** — she tails a session's terminal output
  and reviews what the agents actually did before reporting back (no
  guessing). Destructive actions stay behind clear user intent; launches
  keep the confirm card.
- **Seducia Main vs Seducia Project.** One orb, two scopes: on the home
  screen she's Main (whole-app control); inside a workspace she becomes that
  workspace's Project Seducia — her own chat history per workspace, actions
  fenced to its sessions, launches grow the workspace instead of opening a
  new one. A scope chip in the header shows who you're talking to.

### Added — Workspaces
- **Sessions live inside Workspaces** now. Every launch creates a workspace
  (a solo session is a workspace of one); the rail groups, counts and
  collapses them, and the New Workspace modal names them up front.
- **Rename a workspace** by double-clicking its name in the rail (or ask
  Seducia). The status bar shows `N ws · M sessions`.

### Added — Claude Code panel
- A **mini-ADE in the right panel**: prompt Claude Code on the active
  directory and watch the work happen live — streamed markdown, every tool
  call (file edits, commands, searches) as an expandable step with its
  result, stop button, and **per-directory resumable conversations**.

### Added — Accounts
- **Multiple CLI accounts per profile.** Add extra Claude Code / Codex
  accounts (Settings > AI > CLI accounts) and switch between them without
  switching Sush profiles. Adding a slot makes it active — log in from the
  next session you open.
- **Session-limit policy: Never / Ask / Auto.** When a CLI hits its limit
  and you have another account for it, Sush either tells you a switch is
  available or hops accounts and retries on its own.
- **Sign-in works out of the box.** The Accounts panel no longer asks for
  client IDs — GitHub ships ready; Google shows "coming soon" until its
  built-in registration lands.

### Added — Hush (voice-to-text)
- **Hush**, Sush's dictation tool: tap the mic (bottom-left) or press
  **Ctrl+Shift+S** anywhere — even inside a terminal — speak, and the words
  are typed into the focused terminal *without* Enter, so you review before
  submitting. Pure dictation, separate from Seducia. Toggle in Settings >
  Window.

### Added — Quality of life
- **Idle sleep.** No input for N minutes (Settings > Window, default 10) and
  Sush dims, freezes every animation, and stops all polling — terminals and
  agents keep running untouched. Any key wakes it. Saves battery and GPU.
- **Locked tiles for missing CLIs.** The launcher checks which agent CLIs
  are actually installed; missing ones show a lock and "Not installed"
  instead of failing after launch. Re-scan button included.
- **Workspace-scoped repo search** in the GitHub panel (plain queries search
  *your* repos, not all of GitHub).

### Fixed
- Seducia's CLI replies now run under *your* identity's logins (the spawn
  missed the per-user env redirect).
- A stopped/aborted AI reply can no longer execute half-parsed actions.
- AI launches are capped at the session limit and survive incomplete agent
  specs (missing command/label) instead of opening dead shells.
- The launch-card countdown no longer stalls while you type.
- The Seducia orb re-clamps to the screen on restore (no more stranding it
  off-screen after a monitor change).
- ENGINE marker lines no longer flash in the transcript mid-stream.

---

## 3.8.0 — "Companion"

Seducia grows hands, a voice presence, and backup brains — and Sush gets a
real profile.

### Added — Seducia, upgraded
- **Real orchestration.** Tell her "launch 3 codexes in Workrooms and have
  them review the project" and she does it: spawns the sessions, waits for
  the agents to boot, and types the brief into each one. AI-proposed
  launches show a **launch card** first — what she understood, one-click
  Launch/Cancel, auto-proceeds in 5s.
- **Multiple actions per reply** — she can launch, focus and run in one
  breath.
- **Backup brains (CLI cascade).** In CLI mode, "Auto" tries your `claude`
  login first and rolls over to `codex`, then `gemini` when one hits a
  session limit or isn't installed. A small "via codex CLI" chip shows who
  answered. Pin a specific engine in Settings.
- **Voice presence.** The orb is now a glossy sphere that pulses while
  speaking, with a live status pill — Speaking / Listening / Thinking — and
  an AGENT WORKING chip when your swarm is busy.
- **Drag her anywhere.** Grab the chat header to move the orb + card stack
  (position remembered; double-click the header to snap back). Plus a
  minimize button that collapses to the orb.

### Added — Profile & polish
- **Profile viewer.** Click your name (or the chip menu) for a profile card:
  big avatar, linked accounts, member-since, Lock and Sign out.
- **Custom profile pictures.** Click the avatar to upload a photo — resized
  locally, shown on the lock screen, title bar and user list.
- **Visible logout button** in the title bar — no more dropdown digging.
- **Minimize to tray** (Settings > Window): the minimize dot tucks Sush into
  the system tray; click the tray icon to bring it back.
- **Glass Dark Pro** theme — blacker base, ice-blue accent, crisper panels.
- **Name sessions at launch** — type a name right in the New Session header;
  single sessions take it as their label, swarms as the workspace name.
- **GitHub sign-in now works out of the box** — Sush ships a built-in OAuth
  app id, so "Continue with GitHub" needs zero setup (you can still use your
  own app in Settings > Accounts).

### Fixed
- Clicking split-pane with no sessions no longer strands you on a black
  screen: split needs two live sessions, and closing the last session always
  returns Home.

---

## 3.7.0 — "Handshake"

Identities can now be backed by **real accounts**. Sign in with Google or
GitHub from the lock screen, and GitHub powers a full repo surface inside
Sush: browse, clone, PRs, issues and a live notifications inbox.

### Added — Sign in with Google & GitHub
- **Continue with Google / GitHub on the lock screen.** A matching linked
  identity signs straight in (account possession beats the PIN); a new face
  lands on the create form prefilled with their name and avatar, and the new
  identity is born linked.
- **Link/unlink accounts per user** in Manage Users. Provider avatars show up
  on the lock screen, the title-bar chip and the user list.
- **GitHub hybrid auth.** Sush prefers your `gh` CLI login (already isolated
  per identity) and falls back to an in-app Device Flow sign-in — you see a
  short code, approve it on github.com, done. Tokens are stored encrypted
  with the OS keystore (DPAPI), per identity, and never leave the main
  process.
- **Google sign-in keeps the lock honest.** Sush stores only your profile
  (name, email, picture) — no refresh token — so every Google unlock is a
  live browser check, not a replayable stored credential.
- **One-time setup in Settings > Accounts** (paste a GitHub OAuth App client
  id; Google Desktop-app client id + secret). Config is shared by the
  install, works before anyone signs in.

### Added — GitHub everywhere
- **GitHub panel tab**: connection status (gh CLI vs Sush sign-in), repo
  search with one-click **clone** into your workdir, your open PRs, review
  requests and assigned issues, and a notifications **inbox** with mark-read.
- **Unread badge** on the GitHub tab, polled focus-gated and nearly free
  (ETag-cached, instant zero when not connected).
- **Built-in commands**: `repos [query]`, `prs`, `issues`, `notifs` — the
  same data, keyboard-first from the smart bar.
- `clone` now falls back to plain `git clone` when the gh CLI is missing
  (public repos work everywhere).

### Fixed
- The `gh` and `clone` built-ins now run under the **active identity's**
  GitHub login. They used to silently use the host machine's gh account —
  exactly the kind of bleed Identities exist to prevent.

---

## 3.6.0 — "Identity"

Sush is now genuinely **multi-user**. Two people sharing one PC get fully
separate worlds: separate CLI logins, separate themes, sessions, history — and
when one signs out, the next signs in to *their* accounts, never the previous
user's.

### Added — Sush Identities
- **Per-user CLI login isolation.** Each identity gets its own home folder under
  Sush's data dir, and every terminal that user opens redirects `claude`,
  `codex`, `gh`, `gemini` and other XDG-aware CLIs there. User 1's Claude login
  never bleeds into User 2's terminal. Two levels per user:
  - **CLI isolation** (default) — redirects the well-known config dirs
    (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GH_CONFIG_DIR`, XDG family).
  - **Full home** — also redirects `HOME`/`USERPROFILE`/`APPDATA`, giving the
    user fresh dotfiles for *everything* (git, ssh, npm…).
- **Lock screen.** A full-screen sign-in with a live clock, aurora backdrop
  tinted by user accent colors, avatar picker, and per-user **PIN** (4–8 digits,
  scrypt-hashed). The PIN is a casual lock for a shared PC — honest framing: it
  is not disk encryption.
- **Lock / switch / sign out** from the new **user chip** in the title bar or
  the command palette. *Lock* keeps sessions running for the same user;
  *sign out / switch* **closes all running sessions first** so the next user
  never inherits a logged-in terminal.
- **Per-user workspace state.** Settings, theme, session layout, recents,
  command history, pinned projects and saved scrollback are all namespaced per
  user. The first identity you create adopts the install's existing state, so
  upgrading is seamless.
- **Manage Users** modal — rename, recolor, change PIN/isolation, and delete
  (optionally wiping that identity's data folder).

### Added — terminal quality of life
- **Ctrl+Shift+C / Ctrl+Shift+V** — terminal-standard copy/paste that never
  collides with `^C`/`^V` in the shell.
- **Drag & drop paths.** Drop files/folders from Explorer onto a terminal and
  their quoted paths land at the cursor.
- **Export session output** — save a session's recent output as `.txt` from the
  right-click menu or the palette.
- **Open in Explorer / VS Code** buttons next to the cwd in the status bar.
- **Live activity dots in the session rail.** Each session's dot now mirrors
  Mission Control: pulsing green (working), amber **needs you**, red (error) —
  visible at a glance without opening the board.
- **Pinned projects on Home.** Star a workdir to keep it one click away;
  the Home greeting now addresses the signed-in user by name.
- **Command history persists** across restarts (per user).

### Fixed
- Seducia's CLI mode works on Windows again: the `claude` binary lookup used to
  grab npm's extensionless shell shim and fail with `spawn … ENOENT`; it now
  prefers the runnable `.cmd`/`.exe` next to it.
- App shortcuts no longer leak into the terminal: `Ctrl+W` used to close the tab
  *and* send `^W` to the shell (same for `Ctrl+K/B/P/T`, digits, zoom…). The
  terminal now cleanly yields every app-owned chord.
- Closing a large swarm no longer freezes the UI (process cleanup is async now).
- Closing a split-pane session no longer strands a blank right pane.
- Restored session layouts respect the 16-session cap (was silently 12).
- Several small leaks fixed: pending-spawn map, per-tab metadata, file watchers
  on quit; smart-input no longer crashes on null input.

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
