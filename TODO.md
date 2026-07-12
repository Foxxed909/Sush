# TODO — handoff for the next agent (Codex)

You are picking up Sush mid-flight. This file is your brief: read it top to
bottom, then start at "Next up". Fable (Claude) ran the last cycle and is off
for a day or so; everything below is current as of **4.11.0 "nocturne"**
(branch `claude/codebase-review-ui-revamp-nvkvyv`, PR
https://github.com/Foxxed909/Sush/pull/10 — CI green on ubuntu/windows/macos,
awaiting review/merge).

## Read these first, in order

1. `PRODUCT.md` — who this is for and the five design principles. Non-negotiable.
2. `DESIGN.md` — the visual system. **The theme is locked** (see `THEME.md`):
   refine within it, never replace it.
3. `learning.md` — hard-won lessons from every cycle, newest first. The
   nocturne section explains the traps in the code you're about to touch.
4. `PRIVATE.md` / `GRAVEYARD.md` — internal watchlist and ideas already
   rejected. Don't re-pitch the graveyard.

## House rules (things that will get your PR bounced)

- **Battery is a feature.** Every ornament needs an off-switch; anything
  animated must die under lite/saver/eco/reduce-motion. Canvas/JS animation
  can't be stopped by the CSS kill switches — gate the MOUNT (see how
  `App.jsx` gates `<Starfield/>` with `ambientOn`).
- **One source of truth across processes.** Anything main and renderer both
  need lives in `src/shared/` (see `tiers.js`). Never hand-mirror a table.
- **Gates are gentle.** Locked features show an unlock hint; they never fight
  the user. Enforcement lives in main; the renderer mirrors via
  `useEntitlements` (`can('feature')` / `limit('feature')`).
- Comments explain *why* (constraints), not *what*. Match the existing style.
- Ship the bookkeeping with the feature: version + codename (quiet motif:
  ember → murmur → lull → undertow → sotto → **nocturne** → …),
  `src/renderer/src/lib/changelog.js` entry, `PUBLIC.md` highlight,
  `learning.md` lesson if you learned one.

## Verify loop

```
npm test          # vitest — 84 tests, must stay green
npm run build     # electron-vite: main + preload + renderer
PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chromium> node tools/shot.mjs <outdir>
                  # headless screenshot walk of every major screen
npx impeccable detect src/renderer/src   # design anti-pattern lint (0 real hits today)
```

The impeccable skill (v3.9.1) is installed for Claude Code at
`.claude/skills/` and for Copilot at `.github/skills/` — use its `polish` /
`audit` / `animate` flows for any UI work.

## Next up (in priority order)

### 1. Premium starfield — DECIDED, build this
The ambient starfield (`src/renderer/src/components/Starfield.jsx`, shipped
in nocturne, default-on, free) gets a **premium customization layer**:

- Free: the stock starfield exactly as shipped (on/off toggle only).
- **Premium (gate: Plus+ — align with `themes: 'all'` in
  `src/shared/tiers.js`; add a `starfield` feature key there, enforce in
  main via `license-get` like every other gate):**
  - Density slider (0.5×–2×, maps to the `density` prop; keep the 220 cap).
  - Star tint picker (accent-follow, moonlight, or custom color).
  - **Shooting star on session completion** — one meteor across the sky when
    an agent session finishes. Motion conveying state, per DESIGN.md. Must
    respect every kill switch the starfield already honors.
- Settings ▸ Appearance, under the existing "Ambient starfield" row, with the
  inline lock icon pattern used by other tier-gated options.
- Update the Plan table (`PlansPage`/`PUBLIC.md`) honestly — no dark patterns.

### 2. Diff review lane (recommended headline for next minor)
When an agent session goes idle/done, show its git diff in the right panel
(`src/renderer/src/components/panel/ChangesTab.jsx` already exists — extend
it) with approve → commit / discard buttons. Main already has git plumbing in
`src/main/ipc.js` (`sush:git-stage`, `sush:git-unstage`, etc.).

### 3. Backlog (roughly ordered; pitch before building)
- **Baton mode** — focus auto-follows the next *needs-you* session; queue if
  several (`useAgentActivity` already classifies states).
- **Morning standup** — Seducia reads the workspace digest aloud (compose
  `lib/digest.js` + existing TTS; both already ship).
- **Session replay** — timeline scrub over saved scrollback
  (`src/main/shell/scrollback.js`).
- **Scheduled crews** — cron-launch a saved crew, digest on completion.
- **Needs-you push relay** — opt-in ntfy/Telegram webhook (offline-first
  default stays).
- **Crew sharing** — import/export `.sush/crew.json` via file/gist URL.
- **Burn-down meters** in Mission Control feeding the Usage Guard.
- **Session bundles** — export/import scrollback + brief + cwd across machines.

## Open questions for Taylor (don't block on these)

- Starfield default: shipped **on** — flip to off-by-default if battery
  purists complain.
- Impeccable is installed twice (`.github/skills/` + `.claude/skills/`);
  drop one if repo size becomes a concern.
- Exact premium tier for starfield knobs: spec above says Plus+; Taylor may
  want it higher.

## State you inherit from nocturne (so you don't re-do or undo it)

- `Starfield.jsx` — the one sanctioned ambient scene; spec in DESIGN.md.
- `src/main/provider-config.js` — shared secure config store behind
  `stt.js`/`tts.js`. New keyed provider configs should use it too.
- `src/shared/tiers.js` — THE tier table; main and renderer both import it.
- `SearchOverlay.jsx` — the one search-sheet shell (palette + Hunt). New
  overlay = new consumer, not a new sheet.
- `UserAvatar.jsx`, `InlineRenameLabel` (SessionRail), `useProviderConfig`
  (VoiceSection) — reuse, don't fork.
- Splash codename reads `CHANGELOG[0].codename` — never hardcode it again.
