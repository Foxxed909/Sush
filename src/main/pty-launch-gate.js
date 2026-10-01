// Reserve capacity before asynchronous CLI discovery and invalidate pending
// launches when their tab closes or identity runtime is replaced.
export function createPtyLaunchGate({ sessions, limit, identity, start }) {
  const pending = new Map()
  function launch(payload = {}) {
    const id = payload.tabId
    const owner = identity()
    if (!owner) return Promise.reject(new Error('Sign in to an identity before starting a terminal.'))
    if (!id) return Promise.reject(new Error('Missing terminal tab id'))
    if (pending.has(id)) return pending.get(id).job
    const occupied = new Set([...sessions.keys(), ...pending.keys()])
    if (!occupied.has(id) && occupied.size >= limit) {
      return Promise.reject(new Error(`Too many terminals open (${limit}). Close a session and try again.`))
    }
    const token = {}
    const assertCurrent = () => {
      if (pending.get(id) !== token || identity() !== owner) {
        throw new Error('Terminal launch cancelled because the session or identity changed.')
      }
    }
    pending.set(id, token)
    token.job = Promise.resolve().then(() => {
      assertCurrent()
      return start(payload, assertCurrent)
    }).finally(() => {
      if (pending.get(id) === token) pending.delete(id)
    })
    return token.job
  }
  return { launch, cancel: id => pending.delete(id), cancelAll: () => pending.clear() }
}
