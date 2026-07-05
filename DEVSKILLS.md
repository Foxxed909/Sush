# Sush — Stack & Skills

## Stack
- Languages: JavaScript (ESM), JSX, CSS
- Runtime: Electron 31 (main + preload + renderer), Node.js
- Frontend: React 18, hand-rolled CSS design system (no Tailwind in the renderer UI), xterm.js (+ fit/search/web-links/webgl addons)
- Build: electron-vite 2 / Vite 5, electron-builder (NSIS / dmg / AppImage)
- Storage: electron-store (main), localStorage (renderer settings), safeStorage-encrypted API keys
- Terminals: node-pty
- Testing: Vitest

## Skills exercised
- Electron process separation: keys and PTYs live in main, renderer talks over a guarded IPC surface (`guardedFsTarget` path guards, no raw fs from renderer)
- Terminal engineering: PTY lifecycle, scrollback restore, split view, cross-session search (`hunt`), session export
- Voice pipeline: Whisper STT / TTS mirrored providers, local "Quiet Credits" metering denominated in real seconds
- Rate-limit awareness: passive Claude limit snapshots → Usage Guard (warn / auto-handoff / block) with hysteresis
- Cross-model handoff: summarize a limited session and relaunch on a fallback CLI (Codex/Gemini)
- Offline licensing: HMAC unlock codes, tier gating (RANK), no payment rails
- Design-system discipline: tokenized dark theme, Nord tier palette, WCAG contrast checks, reduce-motion/saver kill switches
- CSS choreography: fan-of-cards with composable `--fan-pose` transforms, spring easing

## New things learned
- Composing hover transforms with a base pose via CSS custom properties instead of overwriting `transform`
- Brightening Nord aurora hues one step to clear 4.5:1 on near-black surfaces
- Recovering ~800 lines of uncommitted WIP through a fast-forward pull with stash-conflict resolution
