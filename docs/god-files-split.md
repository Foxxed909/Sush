# God files — split plan

Two modules own too much surface area. Do **not** rewrite them blind; split behind tests.

| File | ~Lines | Risk |
|------|--------|------|
| `src/renderer/src/App.jsx` | ~2500+ | Layout, palette actions, modals, grid, keymap |
| `src/main/ipc.js` | ~2200+ | PTY, commands, tray, file IO, accounts, oauth |

REVIEW.md §1 and §2.1 already proved size causes real bugs (abort controller collision).

## App.jsx extraction order

1. **Keymap / global shortcuts** → `hooks/useGlobalShortcuts.js` or `lib/keymapHandlers.js`
2. **Palette action map** → `lib/paletteActions.js` (pure map + handlers injected)
3. **Modal mount tree** → `components/modals/ModalHost.jsx`
4. **Grid math / multi-session layout** → `hooks/useSessionGrid.js`
5. Leave App as shell: identity gate → chrome → active view → ModalHost

## ipc.js extraction order

Prefer domain modules already started under `src/main/`:

1. **PTY lifecycle** → `main/pty/` (start, input, resize, exit, abort tracking)
2. **Accounts handlers** → thin wrappers around `accounts.js` (include `sush:accounts-pool-stats`)
3. **OAuth / connect** → already partly under `main/oauth/`
4. **FS / git / docker** → `main/fs-handlers.js` style slices
5. Keep `ipc.js` as register-only: `registerX(ipcMain, ctx)`

## Required before large moves

- [ ] `npm test` green
- [ ] Headless smoke (xvfb) main window mounts
- [ ] One commit per extracted domain — easy revert

## Phase 1 leftover (wire when splitting ipc)

```js
import { ..., getPoolStats } from './accounts'

ipcMain.handle('sush:accounts-pool-stats', requireUser((user, { provider }) =>
  getPoolStats(user.id, provider)
))
```

Preload already exposes `accountsPoolStats`. UsageBar falls back to `accountsList` until this is registered.
