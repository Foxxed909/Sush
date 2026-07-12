# Sush Air

Sush Air is the lightweight Tauri companion to Sush for low-end Windows and macOS computers. It keeps the terminal, workspace, Git, agent, security, recovery, and licensing core without bundling Electron.

## Product rules

- Local-first and useful offline.
- Separate storage and identity from full Sush.
- Optional selective, end-to-end encrypted **Sync with Sush**.
- Free includes every core feature and 10 Sush Drop opens per UTC day.
- Air Monthly, Air Lifetime, Sush Pro, and Sush Max include unlimited Drop.
- Vault values, keys, raw history, scrollback, environment values, OAuth tokens, and account tokens never sync.

## Development

```bash
npm ci
npm test
npm run build
npm run tauri:dev
```

The browser fallback exercises UI and domain logic. Packaged builds use bounded Rust commands and a real PTY.

Implementation is tracked in [Sush issue #9](https://github.com/Foxxed909/Sush/issues/9).

## Performance budgets

- Installer under 35 MB
- Idle memory under 120 MB on the reference low-end device
- Cold launch under one second on the reference device
- No background network connection except explicit sync and update checks
