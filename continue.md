# Sush — Continue / Roadmap (battery-safe handoff)

Last worked 2026-06-14. Standing context: weak laptop in Nigeria, **no grid
power** (battery can't always recharge). Push straight to **main** (no branch, no
merge). Every local tool call (build/spawn/file I/O) drains the battery; token
thinking is cloud-side and free — prefer think + write + push over re-running.

## Battery protocol (standing)
- Check `(Get-CimInstance Win32_Battery).EstimatedChargeRemaining` sparingly.
- Build ONCE per batch, not per edit. Commit verified work as you go so a power
  cut never loses it.
- At ~6%: stop, make sure this file + git are current, push, end.

---

## Shipped this session (v4.6.0 "Ember", on main)

- **#4 Tier gating + offline unlock codes — DONE.** `src/main/license-secret.mjs`
  (shared HMAC), `src/main/license.js` (`TIER_FEATURES`, verify/redeem, dated
  trials, `setLicenseChangeSender`), `tools/mint-code.mjs` (minter),
  `useEntitlements` hook. Gates: slots (`accounts-add` IPC), cloud TTS
  (`tts-config-set`/`tts-synthesize`), grid cap (App.jsx), custom agents + cloud
  voice (Settings lock hints). Settings → Plan UI. `unlock`/`plan` shell commands.
  - Mint: `node tools/mint-code.mjs plus|pro [count] [YYYY-MM-DD]`.
  - Live codes already given to the user: Plus `SUSH-PLUS-9THGMW39-CHGHPSS2M5`,
    Pro `SUSH-PRO-ASAXYCK9-Y8YYEPTZP7`.
- **FIFX #1 Battery-aware auto power-saver — DONE.** `sush:battery-status` +
  `powerMonitor` push, `useBattery` hook, `effectiveSaver` in App, Settings
  toggle (on by default, <20% on battery).
- **FIFX #2 Hotkey + status chips — DONE.** Ctrl+Shift+E toggles power saver;
  StatusBar shows battery % + SAVER chips.
- **FIFX #7 Preferences backup — DONE.** Export/Import settings + custom agents
  (no secrets) under Settings → Sush Profile.
- **FIFX #8 Redeem from command line — DONE.** `unlock <code>` / `plan`.

Docs updated (public/private/devskills), version bumped 4.6.0 "Ember".

---

## Still open — FIFX features (6 of the 10 remain)

3. **Focus mode** — hide all chrome, one terminal, minimal repaint. NOTE: Zen
   mode (Ctrl+Shift+Z) already exists — check overlap before building; this may
   just be "Zen + force power-saver paint budget" rather than a new mode.
4. **Offline awareness** — pause network polls (GitHub badge/tab, update checks)
   when `navigator.onLine` is false; show an offline chip in StatusBar. A
   `useOnline` hook + gating the GitHub polls. (Chip alone is half the feature —
   do the poll-pausing too, or it's just cosmetic.)
5. **Per-session resource meter** — CPU/RAM per agent PID via systeminformation,
   opt-in, OFF in power-saver (it spawns/enumerates — costs CPU). Surface in
   Mission Control or the session rail.
6. **Usage history sparkline** — keep last N usage probes per account (already
   cached in accounts.json `slot.usage`); store a small ring and draw a trend
   line in the account row.
9. **Codex health upgrade** — optionally parse `codex doctor` for richer status
   when online (currently just auth.json sign-in check). Spawn-gated; respect
   battery (don't auto-run, button only).
10. **Quiet hours / scheduled sleep** — auto-enter idle-sleep + power-saver during
    set hours. Builds on the existing `body[data-sleeping]` idle-sleep mechanism.

## Still open — bug / verify checklist (§3)
1. **Usage % bars may never render** — `parseUsageInfo` (claudePanel.js) guesses
   Claude field names; unconfirmed any are sent. Log the raw `rate_limit_info`
   once on a live run to find the true field, then map it. If none exists, the
   status+reset fallback is the honest ceiling.
2. `claudeLimitsGet` preload method is now unused in the renderer — harmless dead
   code, can remove.
3. **Per-CLI policy migration** — old global `settings.cliLimitPolicy` is dropped
   on upgrade. One-time seed into each provider's `limitPolicy` on first run.
4. **Power-saver doesn't gate WebGL** — see §2b.
5. VoiceSection ElevenLabs voice/model double-write (`setTts` + `onBlur saveCfg`)
   — confirm no flicker/race on a live run.

## Still open — §2b deeper power levers
- **WebGL → DOM renderer in saver.** `useTerminal` already skips WebGL when
  `transparentBg`; thread `powerSaver`/`effectiveSaver` App→Terminal→useTerminal
  and reuse that path (lower idle GPU). Highest-value remaining power lever.
- **powerMonitor suspend/resume** → also auto-toggle saver (we already listen for
  on-battery/on-ac; add suspend/resume handling).
- **Throttle StatusBar git poll + Settings usage poll** when saver active.
- Audit large `box-shadow` blur radii for default-on reduction.

## Still open — §5 open-ended
- Close the **usage-bars** gap (§3.1) — the headline feature only half-lands until
  the real Claude % field is confirmed.
- One coherent **system-health surface** (battery + per-CLI usage + agent
  activity) in the Usage dashboard, tying FIFX 1/5/6 together.

---

## Key files (quick map)
- License: `src/main/license-secret.mjs`, `src/main/license.js`,
  `tools/mint-code.mjs`, `src/main/commands/license.js`,
  `src/renderer/src/hooks/useEntitlements.js`. Gates in `ipc.js` (accounts-add,
  tts-*), `App.jsx` (GRID_CAP ~1523), Settings `PlanSection`/`AgentsSection`/`VoiceSection`.
- Battery: `ipc.js` (sush:battery-status + powerMonitor), `hooks/useBattery.js`,
  `App.jsx` (effectiveSaver), `StatusBar.jsx` (chips), Settings Appearance.
- Power-saver CSS: `index.css` (`.sush-saver`), tick in `useAgentActivity.js`.
- Build `npm run build` (clean = exit 0; ignore the registry/parser dynamic-import
  warnings — pre-existing). Remote Foxxed909/Sush. Collaborator T-REXED (write, pending).
