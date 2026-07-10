# Internal changes (not for release notes)

## Architecture decisions this cycle

- **4.10.0 "sotto" review cycle**: Hunt overlay reuses ScrollbackStore.search
  via one new IPC (`sush:hunt-search`) that resolves labels main-side — the
  renderer never re-implements the search. Digest is renderer-orchestrated
  (getScrollback tails → one `cliComplete` summary → lib/digest.js pure
  markdown assembly) so the report still ships without any CLI installed.
  Repo crews parse through the same `normalizeCrew` bounds as saved crews
  (`parseRepoCrew`), read over the existing guarded `read-file` IPC — no new
  fs surface. Broadcast scope is renderer state only; the fence is computed
  where broadcastTabIds always was.
- **Scrollback eviction is now LRU**: persist() delete-then-sets its key so
  the Map's insertion order tracks recency; the slice(-40) writers were
  silently evicting the most-used workspace for heavy users.
- **Hush credits gate is provider-aware**: the renderer refreshes
  sttConfigGet in begin() and skips the empty-bucket refusal for the local
  provider (main never charged local anyway — the gate was renderer-only).
- **`tools/shot.mjs` restored** (the watchlist said it existed; it didn't).
  Serves out/renderer over localhost, stubs `window.sush` with a Proxy +
  explicit answers, drives the main screens headless. Update the stub when
  preload grows or screens render empty.

- **STT mirrors TTS exactly** (`main/stt.js` ↔ `main/tts.js`): key held in
  main, safeStorage-encrypted, renderer sends bytes and receives text. A local
  offline Whisper engine can drop in behind the same provider switch without
  touching IPC or the renderer.
- **Quiet Credits are seconds, not "credits"**: Whisper bills per audio
  minute, so the meter is denominated honestly. Rollover on the calendar
  month; `credits reset` exists because it's the user's own local bucket.
- **Usage Guard reads the passive snapshot only** (`getClaudeLimits`) —
  `captureLimits` now retains utilization pcts (it used to throw them away),
  which is what made a zero-cost guard possible. The 45s poll is focus-gated
  through `usePolling`; hysteresis is 5 points to stop flapping.
- **Block mode is renderer-side** (`inputLocked` → `useTerminal.onData`
  drop), NOT a PTY freeze: streams finish, Ctrl+C still passes, other agents
  unaffected. Deliberately not enforced in main — the renderer owns intent.
- **Cross-model handoff reuses the existing handoff plumbing**
  (`buildHandoffCard` + `performHandoff{openNew, agentId}`); the only new
  parts are fallback-CLI probing and the `cliComplete` summary via the
  fallback engine (the limited CLI can't summarize itself).
- **Mac-feel-on-Windows cycle (4.8.0 "lull")**: Win11 Mica/Acrylic via
  `win.setBackgroundMaterial` (IPC `set-window-material`), opt-in setting,
  default Solid — the renderer thins its base canvas with the `.sush-material`
  root class + a translucent `.sush-app-bg` (so the OS material shows without
  touching the solid-theme default). Traffic lights can move left (macOS) via
  `settings.trafficLightSide`; TrafficLights extracted in TitleBar.
  `window.sush.platform` now exposed from preload (renderer has no `process`).
  Global: grayscale font smoothing, `.sush-press` micro-spring, overscroll
  containment. NOTE: Mica/Acrylic can't be verified in the CI/headless
  sandbox — needs a real Win11 smoke test (material shows, text stays legible
  at 0.72 canvas alpha).
- **In-app changelog** (lib/changelog.js + ChangelogPage): auto-opens once
  after a version change (`sush-last-seen-version`), also in the palette and
  Settings ▸ Plan. Maintained by hand each cycle; bump package.json version +
  codename alongside a new top entry.
- **Sidebar redesign**: RightPanel's 16 flat tabs are now four grouped
  clusters (AI/Project/Web/Ops + a hidden-by-default More) drawn from
  lib/panelTabs.js — the ONE catalog Settings reads too, so a settings
  section lists tabs without importing Browser/Seducia/every tab body.
  Per-user tab visibility (`settings.hiddenPanelTabs`, defaults hide
  History/Snippets); the tab strip still shows an active-but-hidden tab so
  the palette can open one. History + Snippets are palette entries now
  (App.paletteActions, run via the new `run` field on CommandPalette items).
- **Snippets unified**: ~/.sush/snippets.json is THE store, exposed over
  snippets-list/set/delete IPC. The panel tab reads it and migrates its old
  localStorage silo (`sush-snippets`) once, then deletes it. The `snippet`
  shell command and the palette read the same file — the two silos that
  never saw each other are now one.
- **Local whisper.cpp landed behind the STT provider switch** exactly as the
  original design promised: only stt.js gained a branch ('local' provider —
  webm → ffmpeg → 16 kHz WAV → whisper-cli stdout, throwaway temp dir).
  Deliberately does NOT spend Quiet Credits: they denominate OpenAI's
  per-minute billing, and the user's own CPU is free. Needs ffmpeg on PATH;
  binary auto-detected (whisper-cli/whisper-cpp/whisper) or set explicitly.
- **Debloat cycle**: RightPanel's 13 tab bodies moved to components/panel/
  (shell keeps strip + routing); one probeStreamJson helper replaced the two
  40-line Claude probe clones; lib/keymap.js is now THE chord registry for
  App handlers + useTerminal's PTY filter (two hand-copied tables had
  drifted twice: dead Ctrl+Shift+H block, Ctrl+Shift+E leaking ^E into
  terminals); renderer standardizes on agentActivity's full stripAnsi.
- **Provider Connect graduated (2026-07)**: out of Settings ▸ Experiments,
  into Settings ▸ Accounts as a Plus+ gate (`providerConnect`). Enforced at
  the `connect-start` IPC handler (the only flow entry point); the renderer
  card mirrors the lock. Manual paste path now REQUIRES the full `code#state`
  string — a bare code previously skipped the CSRF state check.
- **Dated codes keep the permanent code**: redeeming a trial (dated) code now
  stashes the prior permanent code as `previousCode`; when the trial lapses,
  getLicense falls back to it instead of dumping the user to free. This is
  what makes the Pro-trim ULTRA trial compensation safe to hand out.
- **Session ceiling honest again**: `MAX_SESSIONS` 16→25 (Max sells a 25
  grid); swarm launches now cap at the active tier's gridCap, and layout
  restore slices at MAX_SESSIONS instead of a stale literal.
- **Tier restructure**: Pro trimmed 8→6 slots, 16→12 grid, 300→150m credits.
  ULTRA/MAX added to the HMAC code alphabet (`license-secret.mjs TIERS`,
  `verifyCode` regex). RANK extended; nothing else in the gate paths cares.
  Pricing page shows 3 + "See all"; ultra/max force-show when active so your
  own plan card can't be invisible.

## Known debts / watchlist

- Dictation E2E untested in CI sandbox (no mic, no OpenAI egress) — needs a
  manual smoke test per release.
- `sush-settings` guard keys (`usageGuardEnabled/Pct/Mode`) are renderer
  localStorage; if the guard ever needs to act while the renderer is closed,
  it must move to main.
- Split view renders exactly two tiles; other booted terminals unmount while
  split is active (scrollback restore covers reopening — same trade as the
  grid cap).
- Existing Pro users silently lost 2 slots / 4 grid tiles in the restructure.
  Remedy is ready (see "Pro-trim compensation" below) — issue on complaint,
  or proactively with the next release notes.
- The screenshot harness (`shot.mjs`) stubs `window.sush` via Proxy — update
  the stub when preload gains new surface or captures will silently 404.

## Pro-trim compensation (grandfathered Pro users)

The tier restructure trimmed Pro 8→6 slots and 16→12 grid. Any Pro user who
redeemed before the trim gets a **90-day dated ULTRA trial code** on request
(Ultra's 10 slots / 20 grid strictly covers everything old Pro had):

    npm run mint -- ultra 1 <today+90d as YYYY-MM-DD>

Dated codes fold the expiry into the HMAC (can't be edited) and silently
revert to the user's stored Pro code when they lapse — nothing to revoke.
Mint one code per user (codes are stateless; don't post one publicly).

## Release checklist deltas

1. `node tools/mint-code.mjs ultra` / `max` now valid — verify before ship.
2. Smoke-test: `credits`, `hunt`, `Ctrl+\`, guard trip (set threshold 50 and
   run a claude session), MC "Hand off →" with codex installed.
3. Provider Connect is now a Plus+ gate (`providerConnect`) — verify a free
   profile sees the lock and a Plus code opens the flow.
