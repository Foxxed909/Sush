# Plans and release

- `free`: all core features, 10 Drop opens per UTC day
- `air-monthly`: unlimited Drop; signed claim must expire
- `air-lifetime`: unlimited Drop; signed claim must not expire
- `pro` / `max`: Air included; account entitlement must expire

Production injects `SUSH_AIR_LICENSE_PUBLIC_KEY`, updater public key/endpoints, checkout URL, and the pinned sync endpoint. Private signing keys never enter the client or repository.

Release gates: tests, TypeScript build, npm audit, rustfmt, clippy, Rust tests, Windows NSIS build, macOS DMG build, and installer size below 35 MB.
