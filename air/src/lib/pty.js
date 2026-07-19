// Thin promise wrapper over the Rust PTY commands + output events.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const spawnPty = (opts) => invoke('pty_spawn', opts)
export const writePty = (id, data) => invoke('pty_write', { id, data })
export const resizePty = (id, cols, rows) => invoke('pty_resize', { id, cols, rows })
export const killPty = (id) => invoke('pty_kill', { id })
export const homeDir = () => invoke('home_dir')

export const onPtyOutput = (id, fn) => listen(`pty-output:${id}`, (e) => fn(e.payload))
export const onPtyExit = (id, fn) => listen(`pty-exit:${id}`, (e) => fn(e.payload))
