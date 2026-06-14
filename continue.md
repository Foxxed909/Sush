# Sush — Continue / Roadmap (battery-safe handoff)

Last worked 2026-06-14, battery 12%→6% window, no grid power (Nigeria). Working
cloud-side brainstorm only: NO builds, NO spawns — designs poured here, pushed at
intervals. Code execution happens next session (cloud or when charged).

## Battery protocol (standing)
- Every local tool call (build/spawn/file I/O) drains the user's battery; token
  thinking does not (runs in cloud). Prefer thinking + one file write + one push.
- Check `(Get-CimInstance Win32_Battery).EstimatedChargeRemaining` sparingly.
- At ~6%: stop, ensure this file + git are current, push, end.
- Push straight to **main** (no branch, no merge) — user's explicit standing rule.

## Status
- [x] 1 Codex usage — refresh shows Codex sign-in health (auth.json, no spawn). Pushed `001ee48`.
- [x] 2 Power-saver toggle — Settings → Appearance (`settings.powerSaver` → `sush-saver`). Pushed `001ee48`.
- [ ] 3 FIFX — see §3 (bug checklist + 10 features).
- [ ] 4 Tier/unlock-code system — see §4 (full design, ready to build).
- [ ] 5 Open-ended — see §5.
- [ ] 2b Deeper optimization levers — see §2b.

---

## §4 — Tier gating + unlock codes (NO paywall)  ← biggest, build first next session

### Concept
Offline-verifiable unlock codes. No server, no payment. I mint a code; user pastes
it; the app unlocks that tier. Gating is *gentle* (locked features show an "Unlock
with Plus/Pro" hint), not DRM. **Honest limitation:** offline verification means the
signing secret ships inside the app, so a determined user could extract it and mint
codes. That's acceptable for "gating, not paywall" — state it in code comments.

### Tiers (functional names; branded names optional: Spark / Flow / Swarm)
| Tier | Account slots/CLI | Grid cap | Custom agents | Cloud TTS | Themes |
|------|------|------|------|------|------|
| Free | 1    | 4    | no   | no   | base 2 |
| Plus | 3    | 9    | yes  | yes  | all |
| Pro  | 6    | 16   | yes  | yes  | all + future Pro-only |

Feature→minTier map lives in ONE place (`src/main/license.js` `TIER_FEATURES`), mirrored
to the renderer via `license-get` so gating is consistent.

### Code format
`SUSH-<TIER>-<NONCE>-<SIG>`
- TIER: `PLUS` | `PRO` (Free needs no code).
- NONCE: 8 chars base32 (random) — makes each printed code unique/shareable.
- SIG: first 10 chars (base32, uppercased) of HMAC-SHA256(SECRET, `${TIER}:${NONCE}`).
- Optional expiry variant: `SUSH-<TIER>-<YYYYMMDD>-<NONCE>-<SIG>` where SIG signs
  `${TIER}:${YYYYMMDD}:${NONCE}`; main rejects if past date. Use for trials.

### New files
- `src/main/license.js`:
  - `const SECRET = '...'` (random 32+ bytes baked in; comment: client-side, extractable).
  - `TIER_FEATURES = { free:{slots:1,gridCap:4,customAgents:false,cloudTts:false,themes:'base'}, plus:{...}, pro:{...} }`
  - `getLicense()` → reads `userData/sush-license.json` `{tier, code, redeemedAt}`, default `{tier:'free'}`.
  - `verifyCode(code)` → parse, recompute HMAC, check (+expiry); returns `{ok, tier}` or `{ok:false,error}`.
  - `redeemCode(code)` → verify, persist tier, return `{ok, tier, features}`.
  - `tierOf()` / `featuresOf(tier)` / `can(feature)` helpers.
  - `clearLicense()` (revert to free, for testing).
- `tools/mint-code.mjs`:
  - `node tools/mint-code.mjs pro [count] [--expires YYYY-MM-DD]` → prints valid code(s).
  - Imports SECRET (duplicate the constant here, or read from a shared `src/main/license-secret.js`
    that BOTH import — keep the secret in one module so they never drift).
- `src/renderer/src/hooks/useEntitlements.js`:
  - Loads `window.sush.licenseGet()` on mount + on a `sush:license-changed` event.
  - Returns `{ tier, features, can(name), limit(name) }`.

### IPC + preload
- `sush:license-get` → `{tier, features}`; `sush:license-redeem` `{code}` → `{ok, tier, features, error}`;
  `sush:license-clear` (dev).
- preload: `licenseGet`, `licenseRedeem`, `licenseClear`.
- After redeem, main broadcasts `sush:license-changed` so all windows refresh.

### Gating application (each degrades gracefully)
- `accounts.addAccount` (main, `MAX_SLOTS=6`): cap at `featuresOf(tier).slots`; error
  `"Plus unlocks up to 3 accounts — redeem a code in Settings → Plan."`
- Grid cap (`App.jsx GRID_CAP=16`): use `entitlements.limit('gridCap')`.
- Custom agents (`agents.js addCustomAgent` + Settings AgentsSection): block add when `!can('customAgents')`,
  show lock + hint.
- Cloud TTS (`VoiceSection` / `tts.setTtsConfig`): if `!can('cloudTts')`, disable OpenAI/ElevenLabs
  options with an "Unlock with Plus" overlay (system voice stays free).
- Themes (`Settings` theme list / `themes`): if tier base, show non-base themes locked.

### Redemption UI — Settings → new "Plan" section (nav group: Account)
- Current tier badge, what each tier unlocks (the table above), a code input + Redeem,
  success/err states, and (dev only) a Clear button. Add `{label:'Plan', sec:'Plan',
  icon:'sparkles'/'zap', group:'Account', keywords:'tier unlock code upgrade'}` to SETTINGS_NAV.

### Verify
- `node tools/mint-code.mjs plus` → paste into Settings → tier flips to Plus → slot cap rises,
  custom agents unlock. Wrong/garbled code → clear error, stays Free. Restart → tier persists.

---

## §3 — FIFX

### Bug / verify checklist (mostly "confirm on a live run")
1. **Usage % bars may never render** — `parseUsageInfo` (claudePanel.js) guesses field names
   (`sessionUtilization`/`usagePercent`/`fiveHourUtilization`…). Unconfirmed Claude sends any.
   FIX: temporarily log the raw `rate_limit_info` once to discover the true field (if any),
   then map it. If none exists, the status+reset fallback is the honest ceiling — say so in UI.
2. **`claudeLimitsGet` preload method now unused in renderer** — harmless dead code; remove.
3. **Per-CLI policy migration** — old global `settings.cliLimitPolicy` is silently dropped.
   One-time seed: on first run after upgrade, copy it into each provider's `limitPolicy`.
4. **Power-saver doesn't gate WebGL** — GL contexts persist (idle GPU). See §2b.
5. **VoiceSection ElevenLabs voice/model** — `setTts(local)` + `onBlur saveCfg` can double-write;
   confirm no flicker/race. OpenAI uses a select (fine).
6. **Grid agent-state dots** (v4.4.0) — confirm they update live with `powerSaver` tick slowdown.
7. **Idle-sleep + new timers** — confirm Settings usage poll & StatusBar poll honor sleep.

### 10 features (the X)
1. **Battery-aware auto power-saver** — `systeminformation` is already a dep; read battery %,
   auto-enable power-saver under a threshold (e.g. 20%), restore on AC. Perfect for this user.
   Use Electron `powerMonitor` ('on-battery'/'on-ac') + a battery poll.
2. **Global hotkey to toggle power-saver** (Ctrl+Shift+B) + a status-bar battery/saver chip.
3. **Focus mode** — hide all chrome, one terminal, minimal repaint (battery + concentration).
4. **Offline awareness** — pause network polls (GitHub tab, update checks) when offline; offline chip.
5. **Per-session resource meter** — CPU/RAM per agent PID via systeminformation (opt-in, off in saver).
6. **Usage history sparkline** — keep last N usage probes per account; tiny trend line.
7. **Settings/accounts export & import** — JSON backup/restore (no secrets/keys).
8. **Redeem from command palette** — `unlock <code>` built-in command.
9. **Codex health upgrade** — optionally parse `codex doctor` for richer status when online.
10. **Quiet hours / scheduled sleep** — auto-enter idle-sleep + saver during set hours.

---

## §2b — Deeper CPU/GPU/RAM/battery levers (extend power-saver)
- **WebGL in saver → DOM renderer.** `useTerminal` already skips WebGL when `transparentBg`.
  Add `skipWebgl` (or reuse) so saver uses the DOM renderer (lower idle GPU; slightly higher
  CPU only while actively scrolling). Thread `powerSaver` App→Terminal→useTerminal.
- **Electron `powerMonitor`** in main: react to suspend/resume + battery/AC to auto-toggle saver.
- **Throttle polls in saver**: lengthen StatusBar git poll + Settings usage poll intervals.
- **Confirm `backgroundThrottling`** stays default-true (it is — not set). Hidden window throttles.
- **Default-on shadow reduction** for very large glows even outside saver (audit `box-shadow` blurs).
- **Cap splash/entrance animation work** on low battery (skip splash entirely under threshold).

---

## §5 — Open-ended (what we aimed at but didn't fully land)
- The headline **usage bars** only half-land until the real Claude % field is confirmed (§3.1).
  This is the #1 thing to close — the feature reads as "bars" but may only show status+reset.
- **Usage for all CLIs** — genuinely blocked: Codex/Gemini expose no usage. Codex now shows
  sign-in health (best available); document the limit rather than fake it.
- **One coherent "system health" surface** — battery + per-CLI usage + agent activity could live
  in one place (the Usage dashboard), tying together §3 features 1/5/6.

## Key files (quick map)
- License (new): `src/main/license.js`, `tools/mint-code.mjs`, `src/renderer/src/hooks/useEntitlements.js`.
- Gating points: `accounts.js` (MAX_SLOTS), `App.jsx` (GRID_CAP ~1523), `agents.js` (addCustomAgent),
  `tts.js`/`VoiceSection`, `themes/index.js`.
- Usage: `claudePanel.js` (probeClaudeUsage/parseUsageInfo), `ipc.js` (readAccountUsage),
  `Settings.jsx` (SlotUsage/MiniBar).
- Saver: `index.css` (`.sush-saver`), `App.jsx:1427`, `useAgentActivity.js` (TICK), `usePolling.js`.
- Build `npm run build` (clean=exit 0). Remote Foxxed909/Sush. Collaborator T-REXED (write, pending).

---

## Appendix — ready-to-paste license core (verify + mint)

`src/main/license.js` (core; wire IPC + gating around it):
```js
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { createHmac } from 'crypto'

// CLIENT-SIDE secret: ships in the app, so it's extractable. This is gentle
// gating, not DRM — anyone who digs it out can mint codes. That's fine here.
const SECRET = 'CHANGE_ME_32+_RANDOM_BYTES_BASE64'   // <- generate once, keep stable
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'       // Crockford-ish, no I/L/O/U

export const TIER_FEATURES = {
  free: { slots: 1, gridCap: 4,  customAgents: false, cloudTts: false, themes: 'base' },
  plus: { slots: 3, gridCap: 9,  customAgents: true,  cloudTts: true,  themes: 'all'  },
  pro:  { slots: 6, gridCap: 16, customAgents: true,  cloudTts: true,  themes: 'all'  }
}
const RANK = { free: 0, plus: 1, pro: 2 }
const file = () => join(app.getPath('userData'), 'sush-license.json')

function sig(tier, nonce) {
  const h = createHmac('sha256', SECRET).update(`${tier}:${nonce}`).digest()
  let out = ''
  for (let i = 0; i < 10; i++) out += B32[h[i] % 32]
  return out
}
export function verifyCode(raw) {
  const m = String(raw || '').trim().toUpperCase().match(/^SUSH-(PLUS|PRO)-([0-9A-Z]{8})-([0-9A-Z]{10})$/)
  if (!m) return { ok: false, error: 'That code doesn’t look right.' }
  const [, t, nonce, s] = m
  const tier = t.toLowerCase()
  if (s !== sig(tier, nonce)) return { ok: false, error: 'Invalid code.' }
  return { ok: true, tier }
}
export function getLicense() {
  try { if (existsSync(file())) { const d = JSON.parse(readFileSync(file(), 'utf8')); if (RANK[d.tier] != null) return d } } catch {}
  return { tier: 'free' }
}
export function redeemCode(raw) {
  const v = verifyCode(raw)
  if (!v.ok) return v
  const data = { tier: v.tier, code: String(raw).trim().toUpperCase(), redeemedAt: Date.now() }
  try { writeFileSync(file(), JSON.stringify(data, null, 2), 'utf8') } catch (e) { return { ok: false, error: e.message } }
  return { ok: true, tier: v.tier, features: TIER_FEATURES[v.tier] }
}
export function featuresOf(tier = getLicense().tier) { return TIER_FEATURES[tier] || TIER_FEATURES.free }
export function can(feature) { return !!featuresOf()[feature] }
```

`tools/mint-code.mjs` (keep SECRET/B32 identical — better: import from a shared module):
```js
import { createHmac, randomBytes } from 'crypto'
const SECRET = 'CHANGE_ME_32+_RANDOM_BYTES_BASE64'
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const tier = (process.argv[2] || '').toLowerCase()
const count = Number(process.argv[3]) || 1
if (!['plus', 'pro'].includes(tier)) { console.error('usage: node tools/mint-code.mjs plus|pro [count]'); process.exit(1) }
const r32 = (n) => { const b = randomBytes(n); let o = ''; for (let i = 0; i < n; i++) o += B32[b[i] % 32]; return o }
const sig = (t, nonce) => { const h = createHmac('sha256', SECRET).update(`${t}:${nonce}`).digest(); let o = ''; for (let i = 0; i < 10; i++) o += B32[h[i] % 32]; return o }
for (let i = 0; i < count; i++) { const nonce = r32(8); console.log(`SUSH-${tier.toUpperCase()}-${nonce}-${sig(tier, nonce)}`) }
```
Then: IPC `license-get`/`license-redeem`/`license-clear` + preload; `useEntitlements`;
gate the §4 points; Settings → Plan section. First step on next session.

