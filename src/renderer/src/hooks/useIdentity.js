import { useCallback, useEffect, useState } from 'react'
import { getActiveUserIdRaw, setActiveUserIdRaw, migrateLegacyInto, clearUserScope } from '../lib/userScope'

// Identity session state. The cardinal rule: NO terminal may mount until
// `ready` is true — a PTY spawned before the main process knows the active
// user would inherit the host environment and leak the real ~/.claude into
// the session. App gates the whole shell behind this hook.
//
// Switching users always goes through location.reload(): the renderer's
// state (settings, layout, recents…) was initialized from the previous
// user's storage scope, and a reload is the only honest way to rebuild it.
export function useIdentity() {
  const [state, setState] = useState({
    loading: true,
    users: [],
    lastUserId: null,
    currentUser: null,   // signed-in user object (public shape)
    locked: false        // true → LockScreen owns the screen
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.sush.usersList()
        if (cancelled) return
        const users = res?.users ?? []
        const active = res?.active ?? null
        const lastUserId = res?.lastUserId ?? null

        if (active) {
          // Renderer reload while main kept the session (user switch / Ctrl+R).
          if (getActiveUserIdRaw() !== active.id) {
            // Scope mismatch: App's state already initialized under the WRONG
            // localStorage scope (or none). Silently repointing the shim here
            // made every subsequent save write DEFAULTS over the user's real
            // scoped data — the "my settings reverted" bug. Reload instead so
            // the world rebuilds under their scope.
            setActiveUserIdRaw(active.id)
            window.location.reload()
            return
          }
          setState({ loading: false, users, lastUserId, currentUser: active, locked: false })
          return
        }

        // Solo convenience: exactly one user, no PIN → sign in silently.
        if (users.length === 1 && !users[0].hasPin) {
          const res2 = await window.sush.usersActivate({ id: users[0].id })
          if (cancelled) return
          if (res2?.ok) {
            if (getActiveUserIdRaw() !== users[0].id) {
              setActiveUserIdRaw(users[0].id)
              window.location.reload()
              return
            }
            setState({ loading: false, users, lastUserId, currentUser: res2.user, locked: false })
            return
          }
        }

        // 0 users → first-run create; otherwise the picker. Both are LockScreen.
        setState({ loading: false, users, lastUserId, currentUser: null, locked: true })
      } catch {
        // IPC failure: degrade to legacy single-user mode rather than a dead app.
        if (!cancelled) setState({ loading: false, users: [], lastUserId: null, currentUser: null, locked: false })
      }
    })()
    return () => { cancelled = true }
  }, [])

  const unlock = useCallback(async (user, pin) => {
    const res = await window.sush.usersActivate({ id: user.id, pin })
    if (!res?.ok) return res
    if (getActiveUserIdRaw() !== user.id) {
      // Different user than the one whose scope this renderer booted with —
      // rebuild the world under their namespace.
      setActiveUserIdRaw(user.id)
      window.location.reload()
      return { ok: true }
    }
    setState(prev => ({ ...prev, currentUser: res.user, locked: false }))
    return { ok: true }
  }, [])

  const create = useCallback(async (form) => {
    const firstEver = (await window.sush.usersList())?.users?.length === 0
    const res = await window.sush.usersCreate({
      name: form.name,
      color: form.color,
      pin: form.pin || undefined,
      isolation: form.isolation,
      avatarUrl: form.avatarUrl || undefined,
      // One-shot ticket from a provider sign-in: main links the account (and
      // stores the GitHub token) atomically with the create.
      providerTicket: form.providerTicket || undefined
    })
    if (!res?.ok) return res
    // Adopt this install's pre-identity state so the first user keeps their
    // settings, recents and session layout.
    if (firstEver) migrateLegacyInto(res.user.id)
    const act = await window.sush.usersActivate({ id: res.user.id, pin: form.pin || undefined })
    if (!act?.ok) return act
    setActiveUserIdRaw(res.user.id)
    window.location.reload()
    return { ok: true }
  }, [])

  // A provider flow already activated this user in main — do NOT call
  // usersActivate again (it would demand a PIN the user just bypassed by
  // proving account possession). Only align the renderer scope.
  const providerSignIn = useCallback((user) => {
    if (!user) return
    if (getActiveUserIdRaw() !== user.id) {
      setActiveUserIdRaw(user.id)
      window.location.reload()
      return
    }
    setState(prev => ({ ...prev, currentUser: user, locked: false }))
  }, [])

  const lock = useCallback(() => {
    setState(prev => prev.currentUser ? { ...prev, locked: true } : prev)
  }, [])

  // Ends the current identity session: closes every PTY (they belong to this
  // user), clears the active pointer, reboots into the picker.
  const signOut = useCallback(async () => {
    try { await window.sush.usersSignOut() } catch {}
    setActiveUserIdRaw(null)
    window.location.reload()
  }, [])

  const refresh = useCallback(async () => {
    const res = await window.sush.usersList()
    setState(prev => ({
      ...prev,
      users: res?.users ?? prev.users,
      currentUser: res?.active ?? prev.currentUser
    }))
  }, [])

  const removeUser = useCallback(async (id, wipeData) => {
    const res = await window.sush.usersDelete({ id, wipeData })
    if (res?.ok && wipeData) clearUserScope(id)
    await refresh()
    return res
  }, [refresh])

  return {
    ...state,
    ready: !state.loading && !state.locked,
    unlock,
    create,
    providerSignIn,
    lock,
    signOut,
    refresh,
    removeUser
  }
}
