# CONTINUE — Sush / Quiet Nights handoff for Claude

> Last updated: 2026-09-28
>
> Primary repository: `Foxxed909/Sush`
>
> Nightly work: PR #15 — **Nightly: Quiet Nights workspace v1**
>
> Active implementation branch: `nightly/quiet-nights-shell-v1`
>
> This file is intentionally on `main` so a new agent can understand the project before touching the Nightly branch.

---

## 0. Read this first

You are taking over active development of **Sush**, with the current focus on **Sush Nightly / Quiet Nights**.

Do **not** treat this as a greenfield terminal rewrite.

The Nightly work is deliberately evolving the renderer/workspace experience **on top of the existing Sush engine**:

- existing PTY lifecycle
- xterm sessions
- account rotation
- provider CLIs
- Usage Guard
- Seducia orchestration
- identities
- Hunt
- workspace digest
- settings
- licensing/entitlements
- Sush command toolkit

The core rule is:

> **Improve the workspace around the live terminals. Do not casually replace the PTY/core architecture.**

Live terminals should stay mounted wherever possible so changing layouts, panes, inspector state, project focus, etc. does not kill agents, clear terminal buffers, or restart conversations.

Before making changes, inspect:

- this file
- `README.md`
- `PRODUCT.md`
- `DESIGN.md`
- `docs/SUSH_GUIDE.md`
- `learning.md`
- `GRAVEYARD.md`
- PR #15 and its latest diff
- recent commits on `nightly/quiet-nights-shell-v1`

Do not assume this file is more current than the branch itself. If the branch has moved, reconcile rather than blindly overwrite.

---

## 0.1 Latest session (2026-09-28, branch `claude/roadmap-development-continue-i32p2l`)

This branch = `main` (this file) merged with `nightly/quiet-nights-shell-v1` at
`a68775f`, plus the work below. Fold it into PR #15 or open a follow-up PR.

Findings / fixes:

- **The visual harness had never run on the current branch.** The page stub in
  `tools/shot.mjs` did not parse (nested template literal, unescaped `\n`), so
  every walk died before its first assertion. Fixed. It also now denies WebGL
  so xterm uses its DOM renderer — headless screenshots were blank before —
  and asserts real PTY output is visible.
- **Terminals remounted after every new session start** (pre-existing on
  `main`): `useTerminal`'s create-effect depended on `profile.shell`, which
  changes when the PTY reports its real shell. Now held in a ref. The harness
  fails any shot where a tab id was pty-started twice.
- **Split/Grid unmounted every off-layout terminal** (other projects, tiles
  past the cap) and rebuilt it on return to Focus. They now stay mounted,
  hidden, out of the grid flow; tiles are placed with CSS `order`.
- **Account/model restart lost focus to another project**: `closeTab`'s
  `setTabs` updater picked a fallback tab at render time, after the
  replacement had been focused. Now only moves focus if it still points at the
  closed tab.
- **Topbar chips overlapped crumbs/actions with the inspector docked.** Centre
  column may shrink; chips drop out whole in priority order (one-row wrap) and
  container queries use the topbar's own width. Account chip font fixed.
- **Provider capability discovery (§C) — first slice landed.**
  `src/main/provider-capabilities.js` probes `--version`/`--help` once per
  binary stamp (path+size+mtime), exposed as `sush:provider-capabilities`.
  `nightlyModels.js` narrows its fallback with discovered facts
  (`setProviderCapabilities`, `supportsResume`). Verified live against Claude
  Code **2.1.284**: `--effort` accepts `low, medium, high, xhigh, max` —
  `ultracode` is not a flag value, matching the fallback. Codex/Gemini/OpenCode
  were not installed in that environment, so their tables remain unverified.
- **CI**: the GitHub-hosted jobs on PR #15 fail in 2–5 s with zero steps and no
  downloadable logs (HTTP 404). That pattern points at account-level Actions
  limits/billing, not the code; tests, build, Air and the visual walk all pass
  locally.

Local visual walk: `npm run build && PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome> node tools/shot.mjs <outDir>`.

Next suggested steps: capability-driven *model* catalogs where a CLI can list
them; show `installed: false` / version in the launcher; then Phase 2 (Thread
bridge research — Claude's `--output-format stream-json` is print-mode only and
does not bind to the interactive session).

---

# 1. Product direction

The goal for Quiet Nights is a **project-first AI development workspace** that feels calmer and more coherent than a wall of terminal tabs.

The mental model should be:

```
Sush
└── Project
    ├── Agent/session 1
    ├── Agent/session 2
    ├── Agent/session 3
    ├── Context
    ├── Changes
    ├── Files
    ├── Browser
    ├── Tasks
    ├── Notes
    └── Seducia
```

A user should be able to open a project, launch multiple agents using their existing CLI subscriptions/logins, watch those agents work, switch model/account/reasoning settings, inspect code/context, hand work between models, and keep the workspace alive without juggling separate terminals.

Quiet Nights should feel closer to a focused IDE/agent workspace than a terminal multiplexer, while remaining **terminal-native underneath**.

---

# 2. What is already implemented in Nightly

PR #15 has grown substantially beyond the original shell experiment. Treat these as implemented unless the current branch proves otherwise.

## Project-first workspace shell

Implemented:

- Project rail on the left.
- Sessions/threads nested under projects.
- Project counts and state.
- Collapsible project groups.
- Clearer project hierarchy styling.
- Global Home state separated from active-session state.
- Active session breadcrumbs.
- Stable project root independent from live PTY `cwd`.
- Worktree sessions stay attached to the original project.
- A `cd` inside an agent must not suddenly create a new Nightly project.
- Topbar project metadata and Git branch stay bound to the stable checkout/project root.

Important distinction:

- `workspaceCwd` = stable project/workspace root.
- `cwd` = live session directory, which may change.

Preserve that distinction everywhere.

## Overview

Implemented:

- Nightly Overview canvas.
- Replaces the old modal-like Mission Control experience for Nightly.
- Groups sessions by stable project root.
- Shows session state.
- Shows provider/model/reasoning where known.
- Shows resource information where available.
- Supports focusing a session.
- Supports handoff actions where relevant.

## Workspace layouts

Implemented:

- Focus
- Split
- Grid
- Overview

Rules already established:

- Split/Grid are **project-scoped**.
- Never mix unrelated projects into one layout.
- Switching projects should not drag an old split partner into the new project.
- Layout state persists per project.
- Restored split state uses stable session identity rather than transient runtime IDs.
- Terminals should remain mounted across layout changes.

## Secondary workspace panes

Focused Nightly panes include:

- Agent
- Context
- Changes
- Files
- Browser
- Tasks
- Notes

The old inspector toolbox still exists and should remain reachable.

Implemented pane behavior:

- per-project active pane
- per-project pane open/closed state
- Right dock
- Bottom dock
- persisted dock position
- resizable host
- pane state survives workspace switching
- project A can keep Notes while project B keeps Files
- Right/Bottom docking should restore independently per project

## Context pane

Implemented philosophy:

The Context pane must be **factual**, not theatrical.

It can show what Sush can actually observe:

- provider
- selected model
- reasoning/effort
- active account
- subscription usage
- provider-exposed context telemetry, only if genuinely available
- stable project root
- current live cwd
- Git branch/status
- changed files
- detected project instruction/docs
- terminal tail

Detected project docs currently include examples such as:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `README.md`
- `.github/copilot-instructions.md`

Critical rule:

> Do not claim that every detected project file is loaded into the provider's model context.

Also:

> Do not invent context-window percentages.

If the active CLI does not expose trustworthy same-session context telemetry, show that it is unavailable.

Context/quota are separate concepts.

## Provider model selection

Implemented:

- model selection at launch
- live session model selector
- restart + resume flow when changing a live model
- model selection persists through relevant lifecycle operations
- model command construction is centralized in the Nightly provider adapter
- shell metacharacters in model IDs are rejected

Do not scatter provider-specific flags across random UI components.

## Reasoning / effort selection

Implemented:

- Claude/Codex reasoning controls where supported
- model-aware validation for known Codex models
- launcher filtering based on selected model
- live-session validation before restart/resume

Important:

Provider capabilities are **version-sensitive**.

The branch has had multiple concurrent changes around Claude effort/workflow values, including `ultracode`.

Do not trust an old hard-coded list just because it is in a previous commit or comment.

Preferred future architecture:

1. detect capabilities from the installed provider CLI where possible
2. keep verified fallback values
3. allow unknown/new model IDs safely
4. never forward invalid reasoning values just because the UI offered them

The UI, validator, tests, and command builder must all agree.

## Account switching

Implemented:

- multiple CLI account slots
- account picker in Nightly chrome
- usage shown per slot where available
- explicit account rotation
- switch + restart + resume
- preserve project
- preserve model
- preserve reasoning
- preserve session count
- internal restart must not pollute Ctrl+Shift+T closed-tab history
- titlebar account/usage metadata should refresh immediately after a replacement session opens
- failures should be visible to the user rather than silently ignored

A failed account switch must leave the current session intact.

## Session lifecycle

Implemented / expected:

- duplicate
- close
- reopen
- agent identity survives
- provider survives
- model survives
- reasoning survives
- project/workspace identity survives
- stable checkout root survives
- restored agent sessions use resume commands where supported

Do not let Ctrl+Shift+T resurrect stale pre-model-change or pre-account-change internal restart copies.

## Seducia

Seducia already exists as the orchestration layer.

Nightly should keep evolving her into two scopes:

### Main Seducia

App-wide view.

She can reason about multiple projects and help orchestrate across the whole app.

### Project Seducia

Scoped to the currently focused project/workspace.

She should:

- know the project sessions
- know which session is focused
- prompt agents in that project
- launch additional agents into that project
- inspect session outputs
- help coordinate the crew

Do not break existing Seducia controls while improving Nightly.

## Existing Sush systems to preserve

Do not regress:

- Hunt
- workspace digest
- Usage Guard
- cross-model handoff
- multi-account provider slots
- identities
- PIN/lock flows
- command palette
- settings
- Hush / voice
- power saver
- quiet hours
- battery-aware behavior
- local scrollback
- offline-first behavior
- licensing/entitlements
- built-in shell commands

---

# 3. Highest-priority features to add next

These are the main requests for the next development phase.

## A. Real structured Thread view

This is the biggest missing Quiet Nights feature.

Desired experience:

A project session should be viewable as both:

1. the raw live terminal/TUI
2. a clean structured Thread showing user/assistant/tool/reasoning-status turns where the provider genuinely exposes them

### Hard constraint

Do **not** fake this by regex-parsing random ANSI terminal output and pretending it is structured conversation data.

That will be brittle and misleading.

### Preferred implementation

Build a provider/session event bridge.

Possible sources, depending on provider:

- provider CLI structured/JSON output modes
- session transcript/log files
- MCP/event streams
- provider-native hooks
- a PTY side-channel
- explicit command invocation metadata
- structured local session files

Thread data must be tied to the **exact same interactive live session**, not a separate API call that happens to use the same model.

### Thread requirements

When the bridge is trustworthy:

- chronological turns
- user prompts
- assistant output
- tool calls
- tool results
- running/waiting/error state
- timestamps
- model
- reasoning mode
- token/context data if genuinely available
- searchable
- copyable
- jump from thread item to corresponding terminal location where possible
- retain raw terminal as the source of truth
- no invented reasoning text
- no fabricated token counts

Thread currently remains intentionally gated until this is real.

---

## B. General multi-pane workspace compositor

Current Right/Bottom secondary docking is the first step.

Next, build a more flexible pane system.

Desired capabilities:

- split horizontally
- split vertically
- stack tabs
- drag pane to split
- drag pane into an existing tab group
- close a secondary pane without killing the terminal
- multiple simultaneous secondary panes
- terminal + Files + Browser
- terminal + Changes + Context
- two terminals + Browser
- terminal + Thread + Files
- save named layouts
- restore layout per project

### Pane types

At minimum:

- Terminal/session
- Thread
- Agent/Seducia
- Context
- Changes
- Files
- Browser
- Tasks
- Notes

### Persistence

Persist layout by project.

Do not persist fragile runtime DOM IDs.

Use stable pane/session identifiers.

### Performance rule

Inactive panes should not burn CPU.

But do not destroy stateful panes unnecessarily:

- terminal buffers survive
- Browser login/scroll survives
- running agent panels survive

---

## C. Provider capability discovery

Hard-coded provider tables will age badly.

Build a capability layer.

Desired shape:

```js
{
  provider: 'claude',
  installed: true,
  version: '...',
  auth: {...},
  models: [...],
  reasoning: {...},
  resume: true,
  structuredOutput: true/false,
  usageTelemetry: true/false,
  contextTelemetry: true/false
}
```

Use provider CLI probing where practical.

Cache results.

Do not spawn expensive probes continuously.

Refresh:

- app start
- provider login change
- explicit refresh
- provider version change

This should eventually drive both launch and live model menus.

---

## D. Subscription-first provider connections

A major Sush promise is that users should be able to use the subscriptions/logins they already pay for, rather than requiring only raw API keys.

Keep improving provider connection support for:

- Anthropic / Claude Code
- OpenAI / Codex
- Google / Gemini
- xAI / Grok where a supported CLI/auth flow exists
- OpenCode
- other compatible agent CLIs

Requirements:

- prefer provider-native CLI login/session auth
- support multiple accounts where technically possible
- clear active account
- show availability/limits only when trustworthy
- easy sign-in flow
- easy account switching
- account-specific provider config isolation
- never expose secrets in renderer logs
- do not silently copy tokens between identities

API-key support can exist, but it must not be the only story.

---

## E. Better project rail

Continue polishing the project rail.

Wanted:

- project collapse/expand
- clear selected project
- status summary per project
- waiting/error indicators
- session count
- unread/needs-you state
- pinned projects
- recent projects
- drag reorder
- rename display label without renaming folder
- project context menu
- close all sessions in project
- reopen project
- add agent
- open Files
- open terminal
- open Overview
- optional compact rail

Keep it calm.

Do not make every status pulse/animate.

---

## F. Session attention model

The user should immediately know which agent needs them.

Create a consistent attention state across:

- project rail
- Overview
- window/taskbar notification
- optional sound
- Seducia

States should remain grounded in real observable behavior.

Useful states:

- booting
- working
- waiting for user
- idle
- done
- warning
- error
- limit reached

Avoid false certainty.

---

## G. Cross-model continuation

Strengthen handoff between providers.

Current Sush already has cross-model handoff.

Quiet Nights should make this feel native.

Desired flow:

1. agent hits limit / user selects Hand off
2. collect factual session/project context
3. produce a portable handoff brief
4. user selects target provider/model/account
5. launch into same project
6. target receives the brief
7. original session stays available
8. relationship between source/target appears in the workspace

Add a visible handoff lineage:

```
Claude Code
   ↓ handoff
Codex
```

Optional later:

- handoff back
- compare answers
- ask Seducia to choose target based on availability

Do not secretly move work between models without clear user intent.

---

## H. Workspace memory / Notes

Notes should become useful project memory without pretending to be model memory.

Desired:

- Markdown-backed
- local-first
- project-scoped
- searchable
- easy links to files/sessions
- pin important notes
- create from terminal selection
- create from Thread item
- create from handoff
- explicit “send to agent” action

If an agent receives a note, make that action visible.

---

## I. Files pane upgrades

Desired:

- fast project tree
- Git decorations
- modified/untracked badges
- file search
- fuzzy open
- recent files
- tabs/previews
- Markdown preview
- code preview
- reveal in OS
- copy path
- open in external editor
- send file/path to active agent
- multi-select context set

Do not turn Sush into a full VS Code clone.

The Files pane should support agent workflows, not attempt to replace every editor feature.

---

## J. Changes pane upgrades

Desired:

- clean Git diff
- staged vs unstaged
- per-file diff
- stage/unstage
- discard with confirmation
- commit
- commit message helper using logged-in CLI if requested
- branch display
- open changed file
- send selected diff to agent
- create handoff from diff
- optional PR helper

Never run destructive Git operations without explicit user action.

---

## K. Browser pane upgrades

Desired:

- persistent tab/session
- project-scoped URL history
- open localhost detected ports
- quick open app preview
- reload
- devtools/console summary if safely available
- screenshot capture
- send screenshot/context to agent
- preserve login/session state across pane switches

Eventually support a workflow like:

> “Open the app, inspect the broken page, screenshot it, and give the current agent the visual context.”

---

## L. Better local app preview / visual verification

When a project has a dev server:

- detect localhost ports
- offer Open Preview
- remember project preview URL
- Browser pane opens it
- capture screenshots
- compare before/after manually or through a simple visual review flow
- surface console errors

This should help Sush become the place where an agent can build **and** visually verify.

---

## M. Task pane / project execution plan

Tasks should be more than static checkboxes.

Desired:

- project task list
- task status
- task owner/agent
- related session
- related file/PR
- waiting/blocked state
- “assign to agent”
- “ask Seducia to split this task”
- completed work history

Keep the task model local and transparent.

---

# 4. UX requests

Quiet Nights should feel intentional.

## Topbar

Keep:

- project
- session
- Git branch
- provider/model
- reasoning
- context telemetry
- account
- usage
- state

But do not let the topbar become a badge soup.

Rules:

- Home gets global information.
- Session view gets session information.
- Hide unavailable telemetry instead of filling the bar with fake values.
- Popovers must render at viewport level so Electron/header overflow cannot clip them.
- Escape closes popovers.
- focus should return sensibly.
- add correct accessibility attributes.

## Home

Home should not pretend there is an active Shell when no session is focused.

Desired Home:

- recent projects
- pinned projects
- active workspaces
- waiting agents
- recent sessions
- New Project / New Session
- resume work
- maybe usage/account summary at app level

Keep it useful and sparse.

## Overview

Make Overview the “what is happening?” screen.

It should answer quickly:

- what projects are active?
- which agents are working?
- who needs me?
- who errored?
- who hit a limit?
- what model/account are they using?
- how much resource usage is there?
- what should I open?

Avoid turning Overview into another settings page.

## Visual character

Keep Quiet Nights:

- dark
- restrained
- dense but readable
- minimal gradients
- subtle motion
- useful accent color
- terminal/IDE feel
- not a glassmorphism demo
- not giant rounded cards everywhere

Follow existing `DESIGN.md` unless Nightly deliberately evolves it.

---

# 5. Keyboard UX

Keyboard-first matters.

Preserve and extend:

- command palette
- new session
- close session
- reopen
- duplicate
- split
- grid
- Overview
- Hunt
- inspector toggle
- pane selection
- pane docking
- session switching
- rename
- handoff

Every important mouse action should eventually have:

- shortcut, or
- command-palette route

Do not steal common terminal shortcuts without checking whether they should pass through to the PTY.

---

# 6. Reliability requirements

## Never lose a live session because the user moved UI around

Changing:

- pane
- layout
- dock
- project
- inspector
- Overview

should not kill an unrelated PTY.

## Stable identity

A session has multiple concepts:

- runtime tab ID
- stable project/workspace root
- current live cwd
- provider
- model
- reasoning
- account
- group/workspace
- resume identity

Do not collapse these into one string.

## Restart/resume

Model/account changes may require restart.

When they do:

- clearly tell the user
- close old PTY intentionally
- do not add internal restart to recently-closed user history
- resume provider conversation where supported
- preserve project root
- preserve labels/group
- preserve model/reasoning/account as appropriate
- show failure if resume/switch fails

## Provider failure

A provider CLI may be:

- not installed
- signed out
- outdated
- rate limited
- missing a resume feature
- incompatible with a selected model/reasoning pair

Fail gracefully.

Do not open a dead blank session and pretend launch succeeded.

---

# 7. Security / privacy requirements

Sush is offline-first.

Preserve that.

Do not add cloud telemetry by default.

Never log:

- access tokens
- refresh tokens
- API keys
- OAuth secrets
- provider cookies
- full sensitive environment variables

Keep per-user identity/provider isolation.

Provider account changes should use existing main/preload boundaries rather than moving credentials into renderer code.

Validate command construction.

Model IDs and other user/provider strings must not become shell injection vectors.

For destructive actions:

- delete
- reset
- discard
- force checkout
- close entire project
- Fresh Start

require appropriate confirmation.

---

# 8. Performance requirements

Sush can have many live agents.

Assume:

- 1 project × 1 session
- 1 project × 10+ agents
- several projects open simultaneously

Rules:

- focus-gate polling
- stop polling while hidden/asleep
- avoid provider CLI process spawns on every render
- cache capability/usage probes
- lazy boot restored sessions where appropriate
- preserve terminal buffers
- do not continuously inspect every project file
- debounce filesystem-heavy work
- respect existing power saver / quiet hours
- Browser and terminal views should not remount gratuitously

Do not trade basic correctness for fancy animation.

---

# 9. Testing requirements

Any important Nightly behavior should get either:

- a unit test, or
- a renderer/visual regression assertion, or
- both

## Provider adapter tests

Cover:

- safe model IDs
- rejected shell metacharacters
- provider model flag construction
- resume command construction
- reasoning validation
- model-specific reasoning validation
- unsupported provider behavior
- blank/default behavior
- version-sensitive capability fallback

## Session lifecycle tests

Cover:

- duplicate
- close
- reopen
- model survives
- reasoning survives
- provider survives
- project root survives
- live cwd can differ
- restart does not pollute closed history

## Account rotation tests

Cover:

- current account list
- switching account
- session count unchanged
- model/reasoning preserved
- workspace preserved
- metadata refreshes immediately
- new account visibly active
- failure shown to user

## Workspace layout tests

Use at least two projects.

Assert:

- Split only active project
- Grid only active project
- switching project exits/changes layout correctly
- restore per project
- no unrelated session appears
- stable project identity survives `cd`

## Pane tests

Assert:

- Notes in project A
- Files in project B
- switch back restores A
- Right/Bottom dock restore
- Context opens
- Context project root != live cwd when appropriate

## Visual harness

Keep screenshots for:

- Home
- terminal
- lifecycle
- account popover
- model menu
- layout menu
- split
- grid
- Context
- Overview
- pane picker
- Notes
- Files
- inspector
- Settings
- Plans
- launcher
- Hunt
- identities
- destructive confirmation

A DOM node being mounted is not enough.

For popovers verify bounding boxes are visibly on-screen and not clipped.

---

# 10. GitHub Actions note

Recent GitHub-hosted matrix runs have sometimes failed before executing **any steps**.

Symptoms observed:

- job marked failure
- zero steps
- no usable log artifact
- multiple OS jobs fail immediately
- other jobs remain queued

Do not immediately treat a zero-step run as a code regression.

When CI is functional, the real gate should be:

1. tests execute
2. build executes
3. Ubuntu Nightly visual walk executes
4. screenshot artifact uploads
5. screenshots are manually inspected after significant UI changes

If a real test/build step fails, fix it before continuing feature work.

---

# 11. Sush Air must remain separate

`air/` is a separate application.

Do not accidentally pull Nightly/Sush orchestration systems into Sush Air.

Sush Air intentionally stays:

- terminal-focused
- separate package/dependencies
- separate settings
- separate installer
- no Sush account orchestration
- no Quiet Nights workspace dependency

CI should continue proving that changes to Sush do not silently break Air.

---

# 12. Nightly distribution repo

There is a separate `Sush-Nightly` repository.

Current Quiet Nights implementation primarily lives in the main Sush repo/branch.

Still needed:

- decide the exact sync/release model
- package/sync Nightly implementation into the Nightly distribution repo
- avoid two diverging sources of truth
- document which repo owns code vs release metadata
- automate Nightly builds/releases if practical

Do not manually copy files around forever.

Create a repeatable sync/release process.

---

# 13. Release path

Before calling Quiet Nights v1 ready:

- all executable tests green
- renderer build green
- package smoke where possible
- visual smoke green
- screenshots reviewed
- account switch tested
- live model switch tested
- multi-project layout tested
- Right/Bottom dock tested
- project-root/live-cwd distinction tested
- no fake context metrics
- no terminal remount regression
- no credential leaks
- Sush Air still independent
- docs updated
- Nightly distribution strategy in place

Then:

1. finish PR #15
2. stop adding unrelated features to the same PR
3. merge a reviewable v1
4. continue larger pane/Thread work in follow-up PRs

PR #15 is already very large. Avoid making it infinitely larger unless the new work is required to make the existing Nightly v1 coherent.

---

# 14. Suggested implementation order from here

### Phase 1 — stabilize the existing Nightly PR

- inspect current branch head
- reconcile concurrent commits
- fix real CI failures when runners execute
- run tests/build
- run visual harness
- inspect screenshots
- resolve visual regressions
- verify provider effort/model tables against current installed CLIs
- merge v1 when coherent

### Phase 2 — structured provider/session bridge

- research provider structured session sources
- define one internal turn/event schema
- implement one provider end-to-end first
- prove same-session identity
- add Thread behind a provider capability flag

### Phase 3 — pane compositor

- general pane tree
- tab groups
- split directions
- drag/drop
- persistent layouts
- multi-pane restoration
- performance/state retention tests

### Phase 4 — deeper project tooling

- Files
- Changes
- Browser preview
- Tasks
- Notes
- handoff lineage
- context-send actions

### Phase 5 — provider abstraction

- capability discovery
- model catalogs
- reasoning catalogs
- auth/account capability
- context/usage telemetry
- refresh/version handling

### Phase 6 — release polish

- Nightly repo sync
- packaging
- updater/release channel if desired
- onboarding
- keyboard help
- docs
- screenshot/release assets

---

# 15. Things not to do

Do not:

- rewrite node-pty just because the renderer is evolving
- fake Thread from arbitrary ANSI output
- invent context percentages
- call quota percentage “context”
- restart terminals for cosmetic UI changes
- mix sessions from separate projects in Split/Grid
- use current `cwd` as project identity
- lose Browser state on tab changes
- lose terminal buffers on layout changes
- silently fail account/model changes
- hardcode provider capability assumptions without tests
- send credentials to renderer logs
- make Sush Air depend on the main Sush app
- add cloud telemetry by default
- turn the project rail into nonstop animated noise
- let PR #15 absorb every future idea forever

---

# 16. Product requests / nice-to-have backlog

After the core architecture is stable, consider:

- named workspace layouts
- project templates
- saved agent crews
- drag session between projects where safe
- compare two agents side by side
- “ask another model” from a Thread turn
- diff two model answers
- project-wide semantic search
- local embeddings as an opt-in feature
- terminal output bookmarks
- named checkpoints
- session lineage graph
- agent cost/usage summary when provider exposes trustworthy data
- account cooldown timer
- provider health status
- one-click “continue on cheapest available model”
- one-click “continue on strongest available model”
- optional auto-handoff rules, always user-configurable
- project launch recipes
- dev-server detection
- localhost preview
- screenshot-to-agent workflow
- console-error-to-agent workflow
- PR/issue context pane
- GitHub notification integration
- terminal-to-note
- diff-to-note
- Thread-to-note
- note-to-agent
- project activity timeline
- export entire project workspace state as Markdown/JSON
- import/export Sush workspace configuration
- deterministic crash recovery
- session restore diagnostics
- provider version diagnostics
- Nightly feature flags
- experimental settings page
- accessibility pass
- screen-reader labels
- keyboard focus audit
- reduced-motion audit
- high-DPI/Windows scaling audit
- compact laptop layout
- ultra-wide layout
- low-resource mode

---

# 17. What success looks like

A successful Quiet Nights experience should feel like this:

> I open Sush and see my projects.
>
> I open one project and see Claude, Codex, Gemini or other agents working inside it.
>
> I can focus one, split two, or grid the crew without losing their terminals.
>
> I can inspect files, diffs, project context, notes and a preview beside them.
>
> I can change model/reasoning or switch account and continue the same work.
>
> If an account hits a limit, I can continue on another account or provider without losing the project.
>
> If an agent needs me, Sush makes that obvious.
>
> Seducia can coordinate the project without needing me to copy/paste between terminals.
>
> Eventually, Thread gives me a clean structured view of the exact same live agent session, while the raw terminal remains available.
>
> Nothing pretends to know context/usage/state that the provider did not actually expose.

That is the bar.

---

# 18. Immediate starting command for Claude

When taking over:

1. inspect `main`
2. read this file
3. inspect PR #15
4. inspect the latest `nightly/quiet-nights-shell-v1` head
5. inspect the last 30 commits because multiple agents have been working concurrently
6. run/inspect tests before changing provider capability tables
7. continue from the branch state rather than recreating already-landed features
8. prefer small coherent commits
9. keep PR #15 reviewable
10. update this file if architecture or priorities materially change

The next agent should leave the repository **more truthful, more stable, and easier to continue** than they found it.
