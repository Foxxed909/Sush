// Bridge from the async OAuth flows to the renderer's 'sush:oauth-event'
// channel. ipc.js installs the sender (it owns the BrowserWindow ref); the
// flow modules just emit.

let sender = null

export function setOauthEventSender(fn) {
  sender = fn
}

export function emitOauthEvent(payload) {
  try { sender?.(payload) } catch {}
}
