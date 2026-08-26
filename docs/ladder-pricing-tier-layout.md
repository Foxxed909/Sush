# Ladder / pricing tier layout

Plans UI is **soft-retired** for solo use (2026-08). Unlock codes and entitlements still work. This file is the map if you ever re-enable the marketing wall or change the ladder.

## Source of truth

| Concern | File |
|--------|------|
| Tier labels, prices, colors, blurbs | `src/renderer/src/components/PlansPage.jsx` → `TIER_META` |
| Feature matrix (slots, gridCap, guards…) | `useEntitlements` / main license core (`TIER_FEATURES` in `src/main/license-core.mjs`) |
| Quiet Credits minutes | `PlansPage.jsx` → `CREDIT_MINUTES` (must match `src/main/credits.js`) |
| Design vocabulary for tier colors | `DESIGN.md` (seven rungs, Nord family) |
| Settings summary card | `src/renderer/src/components/settings/PlanSection.jsx` |
| Full comparison deck UI | `PlansPage.jsx` (still mounted when `sush:open-plans` fires) |

## Ladder order (never reorder casually)

```
free → plus → dev → pro → ultra → max → enterprise
```

Offline HMAC unlock codes are minted against these names. Removing a rung breaks codes already in the wild.

## Fan / card layout (PlansPage)

- **Desktop (>980px):** fan of cards. Active tier is “dealt” (full feature list). Others peek with name + price + short stats. Click brings a card forward.
- **Narrow (≤980px):** vertical stack (`verticalCards`); no fan transforms.
- **Tier color:** from `TIER_META[t].color`, except Enterprise which can use `ENTERPRISE_ACCENTS` (stored in `localStorage` key `sush-enterprise-accent`).
- **Actions:** accent pink only for primary CTAs; tier color for identity.

### CSS hooks

- `.sush-fan`, `.sush-fan-card` — pose via `--fan-pose`, glow via `--tier-glow`
- Card width ~300px, height ~430px; fan step ~88–103px depending on deck length

## Soft-retire behavior

- Settings **Plan** section still shows current tier + preferences backup + changelog.
- Primary CTA is **Redeem unlock code** (inline / license), not “View plans”.
- Palette / deep links may still open `PlansPage` via `window.dispatchEvent(new CustomEvent('sush:open-plans'))`.
- To fully hide the page later: stop mounting `PlansPage` in `App.jsx` and remove palette entries that fire `sush:open-plans`.

## Re-enabling the marketing wall

1. Restore a clear “View plans →” button in `PlanSection.jsx`.
2. Ensure `App.jsx` still listens for `sush:open-plans` and renders `<PlansPage />`.
3. Keep `TIER_META` / `TIER_FEATURES` / `DESIGN.md` tier list in lockstep.
4. Run a visual check at ≤980px and ≥1200px widths.

## Changing a tier

1. Update `TIER_META` + `CREDIT_MINUTES`.
2. Update `TIER_FEATURES` / license mint path.
3. Update `DESIGN.md` tier color list.
4. Update any copy in PUBLIC.md / PRODUCT.md.
5. Do **not** rename an existing tier id if codes exist for it.
