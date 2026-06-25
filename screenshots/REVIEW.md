# Sush — App Improvement Review

_Reviewed at v4.6.0 "ember". App was built, launched under a virtual display, and
exercised end-to-end (real bash PTY confirmed working). 21 screenshots in this folder._

## What Sush is
A frameless Electron terminal (React + xterm.js + node-pty) purpose-built as "the
terminal your agents live in" — multi-session shells, agent swarms (Claude Code /
Codex / Gemini / OpenCode), an AI orchestrator ("Seducia"), per-user isolated
profiles, a developer right-panel toolbox, voice/TTS, an in-app browser, GitHub
integration, and a license/entitlement tier system (Free / Plus / Pro).

## Test results
- ✅ `electron-vite build` — clean (main 204 kB, renderer 1.60 MB).
- ✅ App boots: splash → identity gate → home dashboard.
- ✅ **Real PTY works** — launched a `/root` bash session, ran
  `echo SUSH_PTY_OK && uname -a`, got `Linux vm 6.18.5 … GNU/Linux` back.
- ✅ All major surfaces render: lock/onboarding, home, command palette (Ctrl+P),
  Seducia (Ctrl+K), launcher (Ctrl+Shift+N), settings, right panel (Ctrl+B),
  Mission Control (Ctrl+Shift+M).
- ⚠️ No automated tests, no linter, no type-checking, CI only builds.

## 1. Areas to improve (engineering)
1. **No test/lint/type safety net.** 13k+ LOC, zero tests, no ESLint, no
   TypeScript/JSDoc checking. Add Vitest for pure logic (`lib/seducia.js`,
   `agents.js`, `commandFrequency.js`, `shell/parser.js`), Playwright-Electron
   smoke tests (the harness used here works), and an ESLint+Prettier gate in CI.
2. **God components.** `RightPanel.jsx` 2,513 lines, `App.jsx` 2,049,
   `Settings.jsx` 1,467. Split RightPanel's ~12 tools into lazy modules; lift
   App's session/identity/keyboard logic into reducers/hooks.
3. **Renderer bundle is one 1.6 MB chunk.** No code-splitting — Settings, Browser,
   RightPanel tools, Seducia all load up front. `React.lazy` the heavy panels.
4. **Secret-driven licensing in the client.** `license-secret.mjs` /
   `mint-code.mjs` mean unlock codes are verifiable (or mintable) locally — trivial
   to bypass. If monetized, validate server-side.
5. **`localStorage` as the system of record** for settings/layout/recents/custom
   agents. It's per-renderer, unbounded (wallpapers are 2.5 MB data URLs), and
   silently try/catch-swallowed. Consider `electron-store` (already a dep) for
   anything that must survive or sync.
6. **Resilience.** node-pty is a top-level `import` in `ipc.js`; if the native
   build is missing the whole main process dies before the window shows. Wrap it
   and degrade to a friendly "rebuild needed" screen.

## 2. What the code reaches for but hasn't fully landed
- **Seducia depends entirely on a logged-in agent CLI** (`lib/ai.js`). With no
  Claude/Codex/Gemini installed, the orb falls back to a regex intent parser — the
  "AI orchestrator" is mostly non-AI on a fresh machine. First-run has no guided
  "install a CLI" path; the launcher just shows everything `LOCKED / Not installed`.
- **Cross-agent relay** (read one session's output, prompt another) is specified in
  the system prompt but leans on the model emitting `read-output` then `ACTION`
  lines correctly — brittle, no structured tool calls, no retry.
- **Voice / Hush dictation & cloud TTS** are wired and gated behind Plus, but need
  keys/permissions that aren't obviously discoverable from the UI.
- **Resume-after-restart** only works for CLIs with a known resume flag (Gemini has
  none); restored tabs silently start fresh.
- **GitHub/Google OAuth** flows exist (`oauth/`) but assume reachable callback
  infrastructure; failure modes degrade quietly.

## 3. Possible new features
- **First-run "Doctor"/setup wizard**: detect installed agent CLIs, offer install
  commands, sign in, pick a theme — turn the empty launcher into onboarding.
- **Split panes within a session** (not just the grid of separate sessions).
- **Session/workspace persistence & restore** across machines (export/import).
- **Command blocks** (Warp-style): structured prompt→output blocks with copy,
  re-run, share, and "explain this output" via Seducia.
- **Inline diff/PR review** in the right panel using the GitHub integration already
  present.
- **Agent run history & cost/usage dashboard** (the `tools/claude-usage.mjs`
  already computes this — surface it in-app, not just CLI).
- **Notifications that deep-link** to the session that needs input.
- **Plugin/extension API** for custom right-panel tools and agents.

## 4. UI/UX redesign notes
The visual design is already strong (Linear-style neutral ladder + pink accent,
consistent radii/spacing tokens, glass surfaces). Highest-leverage refinements:
- **Empty states do too little.** Home shows "No directories yet / No sessions
  yet". Replace with an actionable first-run checklist (pick a folder, install an
  agent, launch).
- **Discoverability of power features.** Mission Control, broadcast, grid, Hush,
  Seducia targeting are all keyboard-driven; add a subtle command-hint row or a
  one-time interactive tour.
- **Launcher clarity.** `LOCKED` is overloaded (means "not installed" here, but
  reads like a paywall). Separate "not installed → install" from "upgrade to
  unlock".
- **Accessibility.** Heavy use of inline styles and color-only state (status dots);
  add ARIA labels, focus rings, and a high-contrast/reduced-transparency mode
  (there's already "reduce effects" — extend it to contrast).
- **Density toggle.** Generous padding is nice but power users running 16 sessions
  want a compact mode for the rail and panels.
