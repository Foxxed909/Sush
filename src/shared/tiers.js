// One source of truth for what each tier unlocks — imported by BOTH processes:
// main enforces it (license.js) and the renderer pre-loads it as the first-
// paint fallback (useEntitlements.js) before `license-get` answers. The two
// used to be hand-mirrored copies and drifted once (old Pro numbers, missing
// Ultra/Max) — gating briefly went wrong. Sharing the module makes that
// impossible; keep it dependency-free so both bundles can take it.
//
// `themes` is reserved for a future gate (no base/premium flag on themes yet),
// so it's intentionally NOT advertised in the Plan table or enforced — all
// themes are free for now. The enforced gates are slots/gridCap/customAgents/
// cloudTts/providerConnect.
// Five tiers. Pro was trimmed when Ultra/Max landed above it (slots 8→6,
// grid 16→12) — the top of the old Pro moved into Ultra. usageGuard gates the
// Claude quota guard (Pro+); autoHandoff gates its hands-free mode (Ultra+).
// providerConnect gates the OAuth account-connect flow (Plus+ — graduated
// from Settings ▸ Experiments 2026-07).
export const TIER_FEATURES = {
  free:  { slots: 1,  gridCap: 4,  customAgents: false, cloudTts: false, usageGuard: false, autoHandoff: false, providerConnect: false, themes: 'base' },
  plus:  { slots: 4,  gridCap: 9,  customAgents: true,  cloudTts: true,  usageGuard: false, autoHandoff: false, providerConnect: true,  themes: 'all'  },
  pro:   { slots: 6,  gridCap: 12, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: false, providerConnect: true,  themes: 'all'  },
  ultra: { slots: 10, gridCap: 20, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: true,  providerConnect: true,  themes: 'all'  },
  max:   { slots: 16, gridCap: 25, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: true,  providerConnect: true,  themes: 'all'  }
}
