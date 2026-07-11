import { useCallback, useEffect, useState } from 'react'
import { TIER_FEATURES } from '../../../shared/tiers'

// Renderer-side mirror of the tier the user has unlocked. Main owns the truth
// (license.js); this loads it once and re-syncs whenever a code is redeemed or
// cleared (main broadcasts `sush:license-changed`). Use `can('cloudTts')` /
// `limit('gridCap')` to gate UI the same way main gates the features it owns.
// Pre-load fallback only — the SAME shared tier table main enforces
// (src/shared/tiers.js), so the first paint gates like the real license.
// This used to be a hand-mirrored copy and once drifted; never again.
const DEFAULT = {
  tier: 'free',
  expiry: null,
  features: TIER_FEATURES.free,
  tiers: TIER_FEATURES
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
      features: r.features || prev.features,
      tiers: r.tiers || prev.tiers
    }))
    return r
  }, [])

  const clear = useCallback(async () => {
    const r = await window.sush?.licenseClear?.()
    if (r) setLic(prev => ({ ...prev, tier: 'free', expiry: null, features: r.features || prev.features, tiers: r.tiers || prev.tiers }))
    return r
  }, [])

  return { ...lic, loading, can, limit, redeem, clear }
}
