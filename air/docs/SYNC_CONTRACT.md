# Selective sync contract

Eligible only when selected: UI preferences/themes, non-sensitive recipes, validated capsule metadata, and non-credential agent preferences.

Never synced: vault values or keys, account/OAuth tokens, raw history, scrollback, environment variables, local identity databases, PTY output, or encryption passphrases.

Payloads are redacted, bounded to 1 MB, encrypted locally with AES-256-GCM using a PBKDF2-SHA256 key (310,000 iterations), and uploaded only to the pinned `https://sync.sush.dev` origin. Import envelopes are bounded to 2 MB and fully authenticated before application.
