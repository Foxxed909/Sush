// One Thread poller per session, shared by every view that shows it (the
// centred ThreadView, the side pane, the diff panel's turn scopes, the
// composer's context meter). Polls only while someone is subscribed and the
// window is visible, sends the last stamp so main can answer "unchanged", and
// ignores a response that arrives for a tab no longer being polled.

const POLL_MS = 1200
const feeds = new Map()   // tabId -> { snapshot, stamp, listeners, timer, inflight, epoch }

function emit(feed) {
  for (const listener of feed.listeners) listener(feed.snapshot)
}

async function poll(tabId, feed) {
  if (feed.inflight || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
  feed.inflight = true
  const epoch = feed.epoch
  try {
    const result = await window.sush?.threadRead?.({ tabId, since: feed.stamp })
    if (feeds.get(tabId) !== feed || feed.epoch !== epoch) return   // stale: unsubscribed meanwhile
    if (!result?.ok) {
      feed.snapshot = { ...feed.snapshot, error: result?.error || 'Could not read structured Thread data.' }
    } else if (result.unchanged) {
      if (!feed.snapshot.error) return
      feed.snapshot = { ...feed.snapshot, error: '' }
    } else {
      feed.stamp = result.stamp || null
      feed.snapshot = { state: result, error: '' }
    }
    emit(feed)
  } catch (e) {
    if (feeds.get(tabId) === feed) {
      feed.snapshot = { ...feed.snapshot, error: e?.message || 'Could not read structured Thread data.' }
      emit(feed)
    }
  } finally {
    feed.inflight = false
  }
}

export function subscribeThreadFeed(tabId, listener) {
  let feed = feeds.get(tabId)
  if (!feed) {
    feed = { snapshot: { state: null, error: '' }, stamp: null, listeners: new Set(), timer: null, inflight: false, epoch: 0 }
    feeds.set(tabId, feed)
  }
  feed.listeners.add(listener)
  listener(feed.snapshot)
  if (!feed.timer) {
    poll(tabId, feed)
    feed.timer = setInterval(() => poll(tabId, feed), POLL_MS)
  }
  return () => {
    feed.listeners.delete(listener)
    if (!feed.listeners.size) {
      clearInterval(feed.timer)
      feed.epoch++
      feeds.delete(tabId)
    }
  }
}

export function refreshThreadFeed(tabId) {
  const feed = feeds.get(tabId)
  if (feed) { feed.stamp = null; poll(tabId, feed) }
}
