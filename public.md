# Sush — Public Changelog

A custom Electron terminal (React + node-pty) with AI orchestration (Seducia),
swarms/workspaces, split panes, broadcast, themes, and a built-in command layer.

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
