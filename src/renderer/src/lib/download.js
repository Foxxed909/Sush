// One place that turns text into a file the user gets.
//
// Why this exists: both callers used to do createObjectURL → a.click() →
// revokeObjectURL(url) back to back, synchronously. Chromium starts the
// download asynchronously after the click, so revoking in the same tick is a
// race — sometimes the blob URL is already dead when the download machinery
// reaches for it and the save silently does nothing. Exporting a session was
// intermittently a no-op with no error anywhere.
//
// The fix is to revoke on the next macrotask instead, which is long past the
// point where Chromium has taken its own reference. The anchor is also
// appended to the document: a detached anchor's click is ignored in some
// Chromium configurations, and appending costs nothing.

const REVOKE_DELAY_MS = 60_000

// Turn an arbitrary label into something safe for a filename on every platform
// we ship to (Windows is the strict one: no <>:"/\|?* and no trailing dots).
export function safeFileName(label, fallback = 'sush') {
  const cleaned = String(label ?? '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 60)
  return cleaned || fallback
}

// Download `text` as `filename`. Returns true if the download was initiated.
export function downloadText(text, filename, mime = 'text/plain') {
  if (typeof document === 'undefined') return false
  const blob = new Blob([String(text ?? '')], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    setTimeout(() => { try { URL.revokeObjectURL(url) } catch {} }, REVOKE_DELAY_MS)
  }
  return true
}

// `sush-<label>-<timestamp>.<ext>` — the naming every export in the app uses.
export function stampedFileName(label, ext, prefix = 'sush') {
  return `${prefix}-${safeFileName(label, 'session')}-${Date.now()}.${ext}`
}
