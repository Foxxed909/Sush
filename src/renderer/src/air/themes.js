// Four calm themes. Calm is a constraint, not a mood: every one of these keeps
// the background near-black, the foreground under full white, and the accent
// used for exactly one thing at a time. Nothing here glows.
//
// The main app's theme system carries glass, wallpapers, per-profile overrides
// and a locked house style. Air has four objects. When you only ever need to
// pick a palette, a palette is all the system should be.

export const THEMES = [
  {
    id: 'moonlight',
    label: 'Moonlight',
    note: 'The house theme, quieted down',
    ui: { bg: '#08090a', panel: '#0e0f12', line: '#1c1e23', text: '#f7f8f8', dim: '#8a8f98', accent: '#ff6b9d' },
    xterm: {
      background: '#08090a', foreground: '#e6e8ea', cursor: '#ff6b9d', cursorAccent: '#08090a',
      selectionBackground: '#2a2d34',
      black: '#1c1e23', red: '#ff6b81', green: '#5fd3a8', yellow: '#ffcb6b',
      blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#d5d8dc',
      brightBlack: '#5a6068', brightRed: '#ff8b9d', brightGreen: '#7fe0bd', brightYellow: '#ffd98a',
      brightBlue: '#9fbcff', brightMagenta: '#d7aef2', brightCyan: '#a4e6ff', brightWhite: '#f7f8f8'
    }
  },
  {
    id: 'harbor',
    label: 'Harbor',
    note: 'Cool blues, low contrast',
    ui: { bg: '#0a0e14', panel: '#0f141c', line: '#1b2430', text: '#e8eef5', dim: '#7d8b9c', accent: '#7fb3d5' },
    xterm: {
      background: '#0a0e14', foreground: '#d9e2ec', cursor: '#7fb3d5', cursorAccent: '#0a0e14',
      selectionBackground: '#22303f',
      black: '#1b2430', red: '#e88b8b', green: '#8fc9a4', yellow: '#e3c88a',
      blue: '#7fb3d5', magenta: '#b19cd9', cyan: '#88c8d8', white: '#c6d0da',
      brightBlack: '#55636f', brightRed: '#f0a5a5', brightGreen: '#a9d9ba', brightYellow: '#efdaa8',
      brightBlue: '#9fc9e4', brightMagenta: '#c7b5e4', brightCyan: '#a6dbe8', brightWhite: '#e8eef5'
    }
  },
  {
    id: 'ember',
    label: 'Ember',
    note: 'Warm greys, amber accent',
    ui: { bg: '#0d0b0a', panel: '#141110', line: '#241f1c', text: '#f2ece7', dim: '#948b83', accent: '#e0a458' },
    xterm: {
      background: '#0d0b0a', foreground: '#e6ded7', cursor: '#e0a458', cursorAccent: '#0d0b0a',
      selectionBackground: '#332b25',
      black: '#241f1c', red: '#d98a7a', green: '#a3bd8a', yellow: '#e0a458',
      blue: '#8fa8c0', magenta: '#c095a8', cyan: '#8fbdb5', white: '#cfc6bd',
      brightBlack: '#665d55', brightRed: '#e8a597', brightGreen: '#bcd1a6', brightYellow: '#eec07e',
      brightBlue: '#a9bed2', brightMagenta: '#d5aec0', brightCyan: '#a9d0c9', brightWhite: '#f2ece7'
    }
  },
  {
    id: 'paper',
    label: 'Paper',
    note: 'The light one, for daylight',
    ui: { bg: '#f4f2ee', panel: '#eae7e1', line: '#d8d4cc', text: '#22201d', dim: '#6f6a63', accent: '#8a5a44' },
    xterm: {
      background: '#f4f2ee', foreground: '#2c2926', cursor: '#8a5a44', cursorAccent: '#f4f2ee',
      selectionBackground: '#ddd6c9',
      black: '#3a3733', red: '#a04a3c', green: '#4f7a4a', yellow: '#8a6a1f',
      blue: '#3f6690', magenta: '#7a4a80', cyan: '#2f6f72', white: '#a9a49b',
      brightBlack: '#6f6a63', brightRed: '#b85e4e', brightGreen: '#5f8f59', brightYellow: '#9c7c2d',
      brightBlue: '#4f79a5', brightMagenta: '#8d5c94', brightCyan: '#3d8285', brightWhite: '#22201d'
    }
  }
]

const BY_ID = new Map(THEMES.map(t => [t.id, t]))

export const DEFAULT_THEME_ID = 'moonlight'

export function getAirTheme(id) {
  return BY_ID.get(String(id ?? '').toLowerCase()) ?? BY_ID.get(DEFAULT_THEME_ID)
}

// Resolve what `:theme` should switch to. No argument cycles — which is the
// point of a four-theme system, you can just press it until you like what you
// see. A partial name works ("harb"), because typing the whole word to change
// a colour is a chore.
export function resolveTheme(requested, currentId) {
  if (!requested) {
    const index = THEMES.findIndex(t => t.id === currentId)
    return { ok: true, theme: THEMES[(index + 1) % THEMES.length] }
  }
  const needle = String(requested).toLowerCase()
  const exact = BY_ID.get(needle)
  if (exact) return { ok: true, theme: exact }
  const partial = THEMES.filter(t => t.id.startsWith(needle) || t.label.toLowerCase().startsWith(needle))
  if (partial.length === 1) return { ok: true, theme: partial[0] }
  if (partial.length > 1) {
    return { ok: false, error: `"${requested}" matches ${partial.map(t => t.label).join(', ')}.` }
  }
  return { ok: false, error: `No theme "${requested}". Try: ${THEMES.map(t => t.id).join(', ')}.` }
}
