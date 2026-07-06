# Internal changes (not for release notes)

## Architecture decisions this cycle

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
