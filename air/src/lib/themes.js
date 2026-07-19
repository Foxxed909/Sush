// A trimmed take on the Sush theme set. Each theme carries the app chrome
// colors and an xterm palette.
export const THEMES = {
  ink: {
    id: 'ink', label: 'Ink',
    accent: '#7dd3fc', bg: '#0b0d10', surface: '#12151a', border: '#1f242c', text: '#d7dde5', dim: '#78828e',
    term: { background: '#0b0d10', foreground: '#d7dde5', cursor: '#7dd3fc', selectionBackground: '#264055' }
  },
  ember: {
    id: 'ember', label: 'Ember',
    accent: '#fca17d', bg: '#100c0b', surface: '#1a1412', border: '#2c211f', text: '#e5dcd7', dim: '#8e7f78',
    term: { background: '#100c0b', foreground: '#e5dcd7', cursor: '#fca17d', selectionBackground: '#553226' }
  },
  moss: {
    id: 'moss', label: 'Moss',
    accent: '#9dd3a8', bg: '#0b100c', surface: '#121a14', border: '#1f2c22', text: '#d7e5da', dim: '#788e7d',
    term: { background: '#0b100c', foreground: '#d7e5da', cursor: '#9dd3a8', selectionBackground: '#265532' }
  },
  paper: {
    id: 'paper', label: 'Paper',
    accent: '#4a6fa5', bg: '#f4f1ea', surface: '#ffffff', border: '#ddd8cc', text: '#2b2a26', dim: '#8a867a',
    term: { background: '#f4f1ea', foreground: '#2b2a26', cursor: '#4a6fa5', selectionBackground: '#c9d7ea' }
  }
}

const KEY = 'air-theme'
export const loadThemeId = () => {
  const id = localStorage.getItem(KEY)
  return THEMES[id] ? id : 'ink'
}
export const saveThemeId = (id) => { try { localStorage.setItem(KEY, id) } catch {} }
