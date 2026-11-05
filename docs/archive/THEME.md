# Sush — Theme (LOCKED 🔒)

**Theme name:** Wireframes in Moonlight
**Vibe words:** nocturnal, restrained, luminous, calm, professional

> Full spec lives in `DESIGN.md`; `src/renderer/src/index.css` is the source
> of truth. This file is the lock, not the manual.

## Palette
| Role | Name | Hex |
|------|------|-----|
| Background (canvas) | surface-0 | #08090a |
| Elevated card | surface-3 | #1f2024 |
| Primary text | text-1 | #f7f8f8 |
| Accent | Sush pink | #ff6b9d |
| Danger / error | — | #ff6b81 |
| Working | — | #5fd3a8 |
| Needs-you | — | #ffcb6b |
| Info | — | #82aaff |

### Tier ladder (Nord family)
| Tier | Hex |
|------|-----|
| Free | #a4b0c4 |
| Plus | #88c0d0 (nord8) |
| Pro | #b48ead (nord15) |
| Ultra | #ebcb8b (nord13) |
| Max | #d06f79 (nord11, brightened one step) |

## Typography
- Display: platform sans stack (`-apple-system … Segoe UI Variable`), weight carries hierarchy (700–900)
- Body: same family, `--fs-xs 10.5px` → `--fs-xl 16px`
- Mono: Cascadia Code stack — terminals, code, commands only; never labels

## Motion
One spring: `cubic-bezier(0.32, 0.72, 0, 1)`, 140–340ms. Motion conveys
state only. Three kill switches: OS reduced-motion, `.sush-reduce-motion`,
`.sush-saver`.

> Once locked, never drifts.
