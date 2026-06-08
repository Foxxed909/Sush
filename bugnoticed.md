# Bug noticed — agent sessions don't resume after app restart

**Status:** ✅ FIXED — 2026-06-08 (Sush v3.2.1 "Sakura")
**Reported:** 2026-06-08 (Sush v3.2.0 "Sakura")
**Severity:** High (core workflow — agent sessions are the whole point of Sush)

## Resolution (what shipped)

Both layers were implemented:

- **Layer A** — `bootCommand` is now persisted in the session layout
  (`App.jsx` save effect) and restored in `loadSessionLayout` via
  `makeTab(profile, { command, … })`.
- **Layer B** — `agents.js` gained an optional `resumeCommand`; `claude` uses
  `claude --continue`. On restore, `restoreBootCommand(item)` resolves an agent
  tab to `resumeCommand ?? command`, so Claude tabs resume their prior
  conversation in that cwd and other agents re-launch fresh (instead of opening a
  bare shell). Codex/others get a fresh re-launch until a verified resume flag is
  added next to `claude`.
- **Opt-out** — Settings ▸ Appearance ▸ *Resume agent sessions on launch*
  (`settings.resumeAgents`, default on). Off = restored tabs open a bare shell
  (the old behavior), avoiding a swarm of agents auto-spawning on startup.

The original analysis is kept below for reference.

---

**Handoff:** This doc was written so another agent could pick it up cold. Read the
"Root cause" and "Proposed fix" sections.

---

## Symptom (user's words)

> "The app doesn't resume the Claude session when the app is exited — it just keeps
> the terminal **tab**, not the **session**."

When you close Sush and reopen it, the session **layout** is restored (the tab is
back, with the right cwd, label, and agent icon), but the tab opens a **bare shell**.
The `claude` (or codex / gemini / etc.) process that was running in it is **not**
re-launched, and the prior conversation is **not** resumed. You're dropped at a
plain prompt in the right directory.

## Repro

1. Launch an agent session — e.g. New Session → Claude Code in some project dir.
   `claude` boots and you have a conversation.
2. Close the app entirely (quit, not just the tab).
3. Reopen Sush.
4. **Expected:** the Claude tab comes back AND the Claude session resumes.
   **Actual:** the tab comes back but it's just a shell — `claude` never re-runs.

---

## Root cause

There are **two** layers to this bug. Layer A is the mechanical reason nothing
re-launches; Layer B is what "resume" actually requires.

### Layer A — `bootCommand` is not persisted across restarts

The boot-command plumbing works fine for a *fresh* launch:

- `agents.js` defines each agent's launch command, e.g.
  `{ id: 'claude', label: 'Claude Code', command: 'claude' }`
  (`src/renderer/src/lib/agents.js:9`).
- `makeTab` stores it on the tab as `bootCommand: options.command ?? null`
  (`src/renderer/src/App.jsx:101`).
- `useTerminal` forwards it via `bootCommandRef` into `startPty({ ..., bootCommand })`
  (`src/renderer/src/hooks/useTerminal.js:46,69,228`).
- Main runs it ~900ms after the shell is ready:
  `normalizeBootCommand` → `writeShellCommands(proc, queuedBootCommands)`
  (`src/main/ipc.js:486-493`).

**But the session-layout persistence drops `bootCommand`.** The save effect at
`src/main/../renderer/src/App.jsx:461-477` serializes only:

```
label, profileId, profileLabel, shell, shellLabel, cwd,
agentId, tag, groupId, groupLabel, startedAt, lastActiveAt
```

— note **no `bootCommand`**. And `loadSessionLayout` (`App.jsx:144-160`) rebuilds
each tab with `makeTab(profile, { ...no command... })`, so every restored tab gets
`bootCommand: null`. The PTY therefore spawns a bare shell and never re-issues
`claude`. (`agentId` survives, so the *icon* is right — which is why it looks like
the tab "came back" but does nothing.)

> PTYs die with the app; there is no live process to re-attach to. Re-launching the
> command is the only option. Tab `status` is also reset to `'new'` on restore.

### Layer B — plain re-launch starts a NEW conversation, not a resume

Even after Layer A (persist + replay `bootCommand`), running `claude` again starts a
**fresh** Claude Code conversation. To resume the previous one you must launch:

- **`claude --continue`** (alias `claude -c`) — resumes the most recent conversation
  in the current directory. This is the pragmatic choice: Claude Code keys history by
  project dir, and restored tabs already have the correct `cwd`.
- `claude --resume <session-id>` — resumes a *specific* session, but we don't capture
  the session id today (would require parsing it from output or `~/.claude/projects`).

So Layer B = on restore, rewrite an agent tab's boot command to its **resume** form.

---

## Proposed fix

### Layer A (required, mechanical)
1. In the layout-save effect (`App.jsx:463-476`), add `bootCommand: tab.bootCommand`
   to the serialized object.
2. In `loadSessionLayout` (`App.jsx:144-160`), pass it back through:
   `makeTab(profile, { command: item.bootCommand, ... })`
   (⚠ `makeTab` reads `options.command`, not `options.bootCommand` — see `App.jsx:101`).

### Layer B (the actual ask — resume, not restart)
Give each resumable agent a resume command and use it on restore.

- In `agents.js`, add a `resumeCommand` to agents that support it, e.g.
  `claude` → `claude --continue`, `codex` → `codex --continue` (verify the codex/
  gemini/etc. flags; not all CLIs support resume — leave `resumeCommand` undefined
  for those and they'll just re-launch fresh or stay a bare shell).
- On restore only (not fresh launch), resolve the boot command to
  `agent.resumeCommand ?? agent.command`. The cleanest spot: in `loadSessionLayout`,
  look up the agent by `item.agentId` and set `command` to its resume form.
  Keep fresh launches (`launchSessions` / `openTab`) using the normal `command`.

### Open design questions (decide before/while implementing)
- **Auto-resume vs. opt-in.** Auto-spawning a whole swarm of agent CLIs on every
  startup (e.g. 6 Claude sessions all running `--continue`) is expensive and may
  surprise users. Options: (a) gate behind a setting "Resume agent sessions on
  launch" (default on?); (b) only auto-resume the *active* tab and show a one-click
  "Resume" affordance on the other restored agent tabs; (c) auto-resume all. Pick one.
- **Scrollback interaction.** Restored tabs already replay a dim scrollback banner
  (`scrollback.restoreFor`, `ipc.js:437-438`). A `--continue` relaunch prints fresh
  output below it — acceptable, but confirm it reads cleanly.
- **Non-resumable agents / plain shells.** Must no-op gracefully (no `resumeCommand`
  → either fresh launch or bare shell; don't error).

---

## Key file references
- `src/renderer/src/App.jsx:101` — `makeTab` stores `bootCommand` (reads `options.command`)
- `src/renderer/src/App.jsx:144-160` — `loadSessionLayout` (restore path — **needs `command`**)
- `src/renderer/src/App.jsx:461-477` — layout save effect (**needs `bootCommand`**)
- `src/renderer/src/lib/agents.js:8-23` — agent command table (**add `resumeCommand`**)
- `src/renderer/src/hooks/useTerminal.js:46,69,228` — `bootCommand` → `startPty`
- `src/main/ipc.js:402-411` — `normalizeBootCommand` / `writeShellCommands`
- `src/main/ipc.js:486-493` — boot commands issued ~900ms after PTY spawn
- `src/main/ipc.js:413,437-438` — `startPtySession`, scrollback restore

## Acceptance criteria
- Close app with a running `claude` agent tab → reopen → the tab re-launches and the
  **previous Claude conversation resumes** (via `claude --continue`) in the same cwd.
- Plain shell tabs still restore as bare shells (no spurious commands).
- Whatever auto-resume policy is chosen is documented in `private.md` and toggleable
  if it auto-spawns multiple agents.
