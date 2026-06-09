// Glass Dark — the speciality "dark glass / glassy dark" preset.
// Frosted near-black panels with a soft periwinkle accent. The frosted surface
// sits darker and a touch more transparent than the default glass so the
// terminal reads as the hero and the chrome dissolves into it.
// glassTint / glassOmni drive --glass-surface / --glass-omni.
export const glassdark = {
  id: 'glassdark',
  label: 'Glass Dark',
  xterm: {
    background: '#04060a',
    foreground: '#dbe2f0',
    cursor: '#9aabd4',
    cursorAccent: '#04060a',
    selectionBackground: '#9aabd42e',
    black: '#0a0d13',
    red: '#e8737f',
    green: '#9fd0a6',
    yellow: '#e6c98a',
    blue: '#9aabd4',
    magenta: '#b79ce0',
    cyan: '#86c2cf',
    white: '#dbe2f0',
    brightBlack: '#37445a',
    brightRed: '#ef8490',
    brightGreen: '#a8d6af',
    brightYellow: '#edd29a',
    brightBlue: '#b1c0e3',
    brightMagenta: '#c7b0ec',
    brightCyan: '#9bd0db',
    brightWhite: '#f3f6fc'
  },
  ui: {
    accent: '#9aabd4',
    tabBg: 'rgba(7,9,15,0.5)',
    tabActiveBg: 'rgba(16,20,32,0.72)',
    titleBar: 'rgba(4,5,9,0.6)',
    border: 'rgba(154,171,212,0.14)',
    glass: true,
    glassTint: 'rgba(7,9,16,0.55)',
    glassOmni: 'rgba(3,4,8,0.66)'
  }
}
