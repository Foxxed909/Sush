import { useCallback, useEffect, useState } from 'react'

// Renderer-side mirror of the tier the user has unlocked. Main owns the truth
// (license.js); this loads it once and re-syncs whenever a code is redeemed or
// cleared (main broadcasts `sush:license-changed`). Use `can('cloudTts')` /
// `limit('gridCap')` to gate UI the same way main gates the features it owns.
// Pre-load fallback only — mirrors main's TIER_FEATURES (license.js) so the
// first paint gates like the real license. Keep the two in sync; this copy
// once drifted (old Pro numbers, missing Ultra/Max) and briefly gated wrong.
const DEFAULT = {
  tier: 'free',
  expiry: null,
  fallbackTier: null,
  features: { slots: 1, gridCap: 4, customAgents: false, cloudTts: false, usageGuard: false, autoHandoff: false, providerConnect: false, developerWorkflows: false, themes: 'base' },
  tiers: {
    free:  { slots: 1,  gridCap: 4,  customAgents: false, cloudTts: false, usageGuard: false, autoHandoff: false, providerConnect: false, developerWorkflows: false, themes: 'base' },
    plus:  { slots: 4,  gridCap: 9,  customAgents: true,  cloudTts: true,  usageGuard: false, autoHandoff: false, providerConnect: true,  developerWorkflows: false, themes: 'all' },
    dev:   { slots: 5,  gridCap: 10, customAgents: true,  cloudTts: true,  usageGuard: false, autoHandoff: false, providerConnect: true,  developerWorkflows: true, themes: 'all' },
    pro:   { slots: 6,  gridCap: 12, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: false, providerConnect: true,  developerWorkflows: false, themes: 'all' },
    ultra: { slots: 10, gridCap: 20, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: true,  providerConnect: true,  developerWorkflows: false, themes: 'all' },
    max:   { slots: 16, gridCap: 25, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: true,  providerConnect: true,  developerWorkflows: true, themes: 'all' },
    enterprise: { slots: 50, gridCap: 32, customAgents: true, cloudTts: true, usageGuard: true, autoHandoff: true, providerConnect: true, developerWorkflows: true, themes: 'all', fleetSeats: 20, privateFleet: true }
  }
}

export function useEntitlements() {
  const [lic, setLic] = useState(DEFAULT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    window.sush?.licenseGet?.()
      .then(r => { if (alive && r) setLic(r) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    const off = window.sush?.onLicenseChanged?.((payload) => { if (payload) setLic(payload) })
    return () => { alive = false; off?.() }
  }, [])

  const can = useCallback((f) => !!lic.features?.[f], [lic])
  const limit = useCallback((f) => lic.features?.[f], [lic])

  const redeem = useCallback(async (code) => {
    const r = await window.sush?.licenseRedeem?.({ code })
    if (r?.ok) setLic(prev => ({
      ...prev,
      tier: r.tier,
      expiry: r.expiry ?? null,
      fallbackTier: r.fallbackTier ?? null,
      features: r.features || prev.features,
      tiers: r.tiers || prev.tiers
    }))
    return r
  }, [])

  const clear = useCallback(async () => {
    const r = await window.sush?.licenseClear?.()
    if (r?.ok) setLic(prev => ({ ...prev, tier: 'free', expiry: null, fallbackTier: null, features: r.features || prev.features, tiers: r.tiers || prev.tiers }))
    return r
  }, [])

  return { ...lic, loading, can, limit, redeem, clear }
}
