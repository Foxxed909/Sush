function numericSuffix(value, prefix) {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null
  const suffix = value.slice(prefix.length)
  if (!/^\d+$/.test(suffix)) return null
  const parsed = Number(suffix)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function nextValue(tabs, field, prefix) {
  let max = 0
  for (const tab of tabs) {
    const value = numericSuffix(tab?.[field], prefix)
    if (value !== null) max = Math.max(max, value)
  }
  return max + 1
}

// Session layouts persist tags and workspace IDs. Reseeding the module-level
// counters after restore prevents a fresh launch from reusing one of those IDs.
export function countersAfterTabs(tabs = []) {
  return {
    tab: nextValue(tabs, 'id', 'tab-'),
    sessionTag: nextValue(tabs, 'tag', 'sess-'),
    group: nextValue(tabs, 'groupId', 'grp-')
  }
}
