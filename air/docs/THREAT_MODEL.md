# Threat model

Air treats terminal output, files, diffs, deep links, capsules, sync bundles, license tokens, and project metadata as untrusted. The native layer validates independently of the renderer.

Mitigations include strict shell/agent allowlists, canonical path checks, output and import limits, no arbitrary native command API, one-time approval for risky commands, secret-paste interception, sensitive-history exclusion, authenticated encryption, CSP, prototype freezing, least-privilege Tauri capabilities, atomic quota storage, signed licenses and updates, and process-tree shutdown.

Out of scope: a compromised operating system, malicious approved shell programs, and secrets explicitly disclosed after a user approves a paste.
