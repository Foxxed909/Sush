// Usage snapshots are deliberately cheap: they contain the last known state,
// while an explicit provider check is allowed to do real work. Keep the
// snapshot shape handling here so the settings UI never renders an IPC wrapper
// (the old Claude card displayed "undefined" for exactly that reason).
export function activeProviderUsage(snapshot, provider) {
  return snapshot?.[provider]?.account?.usage || null
}

export function claudeLimitStatus(snapshot, liveLimit = null) {
  return liveLimit
    || activeProviderUsage(snapshot, 'claude')
    || snapshot?.claude?.limits?.limits
    || null
}

export function providerNeedsNetwork(provider) {
  return provider === 'claude' || provider === 'codex'
}
