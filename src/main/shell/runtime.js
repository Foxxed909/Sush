// Live runtime references shared between ipc.js (which owns the PTY sessions
// and the scrollback store) and shell commands (which are imported by the
// registry before those objects exist). Commands read these at RUN time, so
// the late binding is safe — and it avoids a circular import of ipc.js.
export const runtime = {
  scrollback: null,   // ScrollbackStore, set in registerIpcHandlers
  sessions: null      // Map<tabId, session>, set in registerIpcHandlers
}
