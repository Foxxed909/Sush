# T3 Code vs Sush: what they have that we don't (Nov 5, 2026)

**How this was studied**
- `pingdotgg/t3code` `main` @ `67eebac`. It is a monorepo: server, web, desktop, mobile and marketing apps, plus about
  30 packages (providers, source control, SSH, Tailscale, secrets).
- All **2,766 branches** were classified by name.
  - About 980 are `fix/`; most of those, plus the `issue-watch`, `takeover`, `grok-bot` and `agent/` prefixes, are
    bot-driven issue fixes.
  - Feature themes across the rest: mobile (71), threads (68), performance (64), providers/ACP (53), sidebar (31),
    composer (24), terminal (23), usage (21), preview (21), MCP (19), subagents (16), diff (17), background (13).
- The user docs (`docs/user/*`) and the web app's feature modules (`apps/web/src`) were read.
- **Installed and run**: `npx t3@latest` (CLI 0.x). `t3 serve` started on :7799. We paired via a one-time token
  (`t3 pair` mints a new one), then ran the welcome wizard (Connect → Agents → Projects; it detected the installed
  Claude CLI as "Ready" and offered ChatGPT sign-in for Codex) and opened Settings. Screenshots are in the session
  scratchpad (`t3/run/t3-*.png`).

## Gaps, ranked by value to Sush users

| # | T3 has | Sush today | Effort | Notes |
|---|---|---|---|---|
| 1 | **Worktrees per thread** ("New worktree": a separate branch and working dir per task, with cleanup) | Sessions share one checkout | M | The biggest practical gap for running crews in parallel without stepping on each other. |
| 2 | **Portable hand-offs** (context carried across providers, restarts and forks; favours recent requests when long) | `sush handoff` brief (CLI) + limit hand-off (app) | S–M | We have the pieces. Unify them and make the brief smarter (recent-first, token budget). |
| 3 | **Remote access + mobile app** (T3 Connect, Tailscale serve, pairing QR, push notifications, iOS Live Activities) | Desktop only; terminal notifications | L | The `sush board` bridge is a seed: a read-only web view of the crew could come first. |
| 4 | **Permission modes in the composer** (per thread, set from the model picker) | Seducia's "ask first" only | S | Map onto each CLI's flags (Claude `--permission-mode`, Codex approval policy). |
| 5 | **Rich composer** (TipTap: @file mentions, quoting a reply, skills, code blocks, 120k drafts, draft stash) | Plain textarea; drafts kept in memory only | M | @file mentions plus persisted drafts would cover most of it. |
| 6 | **Activity log**: consecutive tool calls folded into an expandable summary with live output and exit codes | Thread view work log (Claude) | S | Ours exists; add exit codes and live output streaming. |
| 7 | **Source control beyond GitHub** (GitLab, Forgejo/Gitea, Bitbucket, Azure DevOps), PR creation, per-turn diffs | GitHub panel + diff panel | M | Per-turn diffs ("only this turn's work") are the most valuable part. |
| 8 | **HTML renders**: agents answer with a chart, table or mockup page rendered in the thread | No | M | Pairs well with our Thread view. |
| 9 | **Outside agents via MCP**: an MCP server so other agents can read and start threads | No | M | Natural next step after the crew bridge. |
| 10 | **Guest links**: a teammate follows one thread in their browser and can ask questions | No | L | Needs a server/relay. |
| 11 | **Scheduled tasks** | No | S–M | Cron-like prompts per project. |
| 12 | **Preview browser + browser profile import + default-browser mode** | In-app Browser panel | M | Cookie import and the mini-player are nice-to-haves. |
| 13 | **Device panel** (live iOS Simulator / Android Emulator for agents) | No | L | Niche, but a showcase feature. |
| 14 | **SnapShots**: capture a window, with accessibility data, into the draft | No | M | |
| 15 | **Prompt links** (`t3code://` opens a prompt draft) | No | S | A `sush://` deep link is easy to add. |
| 16 | **Keybindings editor + VS Code / OpenVSX theme import** | Fixed shortcuts; built-in themes | S–M | |
| 17 | **Managed policy** (admin locks: allowed providers, broadest permission mode) | Licence tiers only | M | Enterprise-relevant. |
| 18 | **Triage** (`t3 triage`: your agent investigates T3 problems and drafts an issue) | Doctor | S | |
| 19 | **More providers**: Cursor, Antigravity, fx, Kiro, Pi, Muse, plus generic ACP | Claude, Codex, Gemini, OpenCode, Grok, custom | M | An ACP adapter would unlock many of these at once. |
| 20 | **Background service + self-update CLI** (`t3 service install`, `t3 update`) | Desktop app updates | S | `sush service` could keep crews alive headless. |

## What Sush has that T3 doesn't
- **Multi-account rotation and the Usage Guard**: automatic hand-off before a limit, a usage forecast ("80% in ~38 min"), and the account pool.
- **Office**: a 3D view of the crew at desks with live monitors, plus meetings and hiring.
- **Seducia**: a voice-driven crew assistant with the orb, hands-free mode and intent actions.
- **Local identities**: profiles with PINs and per-user isolation of CLI logins.
- **Sush Terminal**: a TUI with `crew` (tmux / Windows Terminal panes), a live board, notifications and `handoff`, sharing one crew with the desktop app.
- **Power tiers** (Eco, Saver, Feather): battery-aware rendering.

## Recommendation (next three)
1. **Worktrees per session**: biggest real-world win for crews.
2. **Permission modes in the picker**: small, and every user feels it.
3. **Unified portable hand-off**: we already have most of it; make it first-class in the app and the CLI.
