# Sush — Continue (battery-safe handoff)

Last worked: 2026-06-14. Battery was **17% and discharging** — working in push-as-I-go
chunks so nothing's lost. This file is the resume point if the PC died mid-task.

## The 7 asks (this session)

1. **Codex usage** — make the per-account usage refresh work for Codex, not just Claude.
   - FINDING: Codex CLI has **no usage/rate-limit command** (`codex --help` → no `usage`/`status`;
     only `doctor` = auth/runtime health). Claude works only because `claude -p --output-format
     stream-json` emits a `rate_limit_event`. Codex emits nothing comparable.
   - PLAN: make Codex's refresh run a cheap `codex doctor`-style health probe and show
     "signed in · healthy" / "not authenticated" instead of fake bars. `probeCodexHealth` in
     main, wired through `readAccountUsage` (currently Claude-only at ipc.js).
2. **Power-saver / optimize toggle** — user-toggleable mode to cut CPU/GPU/RAM/battery.
   - Build on existing `settings.lite` (`sush-lite` class kills glass blur + some animations).
   - Add a stronger `settings.powerSaver` → `sush-saver` class that kills ALL `infinite`
     ambient animations (index.css has ~15: orb pulse, breathe, ring, pulse-dot, lock-drift,
     shimmer, progress-slide, blink, sleep-breathe). Lengthen/disable non-essential polling
     (usePolling already pauses on blur). Consider slowing useAgentActivity TICK_MS (700ms)
     and the Settings/usage polls. Settings → Appearance toggle.
3. **FIFX** — find+fix bugs + add 10 features. (Not started — biggest, do last.)
4. **Tier/plan gating with unlock codes (NO paywall)** — features gated to tiers; a special
   code I generate unlocks each tier.
   - DESIGN (proposed): tiers Free / Plus / Pro. Offline-verifiable codes: `SUSH-<TIER>-<RANDOM>-<CHECK>`
     where CHECK = short HMAC of (tier+random) using a secret baked into main. Main verifies +
     stores the unlocked tier in userData. Renderer gates features via a `useEntitlements` hook.
     Code generator: a tools/ script (node) that mints valid codes. Pick the gated features
     (e.g. grid layout cap, custom agents, cloud TTS, multi-account slots beyond 1, themes).
5. **Open-ended** — "what we were trying to do but didn't achieve." Candidate: the per-account
   usage bars never confirmed to show real % (Claude probe may not carry utilization). Also the
   CPU/battery weight (covered by #2).
6. **Self-conscious resource checks** — check battery/CPU periodically; if PC is dying, finish
   the current sub-task, update THIS file, push to main. (Check cmd: PowerShell
   `(Get-CimInstance Win32_Battery).EstimatedChargeRemaining`.)
7. **Push to main** (no branch, no merge — commit straight to main).

## Status
- [x] 1 Codex usage — refresh now shows Codex sign-in health (auth.json check, no spawn);
      honest "Codex doesn't report usage" note. Claude bars unchanged.
- [x] 2 Power-saver toggle — Settings → Appearance. `sush-saver` class (implies lite),
      kills ambient infinite animations + glows/shadows, slows agent-activity tick to 2.2s.
- [ ] 3 FIFX
- [ ] 4 Tier/unlock-code system
- [ ] 5 Open-ended
- (6 ongoing; 7 after each chunk)

### Pushed chunks
- (pending) chunk 1: codex health + power-saver.

## Key files
- Usage probe: `src/main/claudePanel.js` (probeClaudeUsage), `src/main/ipc.js` (readAccountUsage),
  `src/main/accounts.js` (slotEnv, setAccountUsage), `src/renderer/.../Settings.jsx` (SlotUsage/MiniBar).
- Animations: `src/renderer/src/index.css` (search `infinite`). Lite mode: `sush-lite` class,
  applied in `App.jsx:1427`, toggled in Settings → Appearance.
- Polling: `src/renderer/src/hooks/usePolling.js`, `useAgentActivity.js` (TICK_MS).
- Build: `npm run build` (clean = exit 0). On main, remote Foxxed909/Sush.
