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
  If that draws complaints, mint them dated ULTRA trial codes.
- The screenshot harness (`shot.mjs`) stubs `window.sush` via Proxy — update
  the stub when preload gains new surface or captures will silently 404.

## Release checklist deltas

1. `node tools/mint-code.mjs ultra` / `max` now valid — verify before ship.
2. Smoke-test: `credits`, `hunt`, `Ctrl+\`, guard trip (set threshold 50 and
   run a claude session), MC "Hand off →" with codex installed.
