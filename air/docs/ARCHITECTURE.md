# Architecture

Sush Air is a separate local-first Tauri 2 application. React and xterm render through the operating-system webview. Rust owns PTYs, fixed Git operations, task processes, project inspection, ports, worktrees, Drop quota, signed license verification, and resource sampling. Stronghold owns vault values; the frontend stores only a bounded key index.

## Trust boundaries

| Boundary | Enforcement |
| --- | --- |
| PTY | Canonical directory, strict session ID, approved shell and exact agent allowlist |
| Task lane | Native size bounds and refusal of downloaded-code and machine-wide operations |
| Git | Fixed arguments, hooks/fsmonitor/external diff disabled, bounded output |
| Worktree | Strict names, canonical confinement under `.sush-worktrees`, no symlink root |
| License | Ed25519 public-key verification, strict product/plan/expiry claims |
| Vault | Stronghold with Argon2 and bounded keys/values |
| Sync | PBKDF2-SHA256 (310,000), AES-256-GCM, selection, redaction, size bounds, pinned HTTPS origin |

Scratch and Privacy sessions do not persist checkpoints or history. Privacy disables sync, vault interaction, and agent launch from the UI. Release builds use LTO, size optimization, stripping, and no frontend source maps.
