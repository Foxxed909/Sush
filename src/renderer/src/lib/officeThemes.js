// Office looks. Each is a palette plus a backdrop kind the 3D view knows how to
// draw; the scene logic never changes with the theme. Chosen per office.

export const OFFICE_THEMES = [
  {
    id: 'loft', label: 'Night Loft',
    sky: ['#0c0a12', '#171126'], fog: '#0c0a12', floorA: '#1a1724', floorB: '#201c2c',
    wall: '#221d30', trim: 'accent', desk: '#2c2638', rug: '#151220', light: '#e9dcff', backdrop: 'stars'
  },
  {
    id: 'neon', label: 'Neon City',
    sky: ['#07060f', '#1b0c2e'], fog: '#0b0716', floorA: '#141026', floorB: '#1b1532',
    wall: '#1a1430', trim: '#5ef3ff', desk: '#241d3d', rug: '#100c1f', light: '#b9f7ff', backdrop: 'skyline'
  },
  {
    id: 'forest', label: 'Forest Cabin',
    sky: ['#0b1410', '#16261c'], fog: '#0d1712', floorA: '#3a2a1e', floorB: '#443224',
    wall: '#4a3526', trim: '#9ad48a', desk: '#5b4130', rug: '#2b3d2a', light: '#fff1d6', backdrop: 'pines'
  },
  {
    id: 'space', label: 'Space Station',
    sky: ['#03040a', '#0a0f22'], fog: '#04060e', floorA: '#1b2030', floorB: '#222a3d',
    wall: '#2a3348', trim: '#7ab8ff', desk: '#2f3850', rug: '#141a2a', light: '#dfe9ff', backdrop: 'planet'
  },
  {
    id: 'sunset', label: 'Rooftop Sunset',
    sky: ['#2a1330', '#ff8a5c'], fog: '#3a1a2e', floorA: '#3a2a33', floorB: '#45323d',
    wall: '#4b3342', trim: '#ffb86b', desk: '#563a48', rug: '#2e1f28', light: '#ffe2c8', backdrop: 'sun'
  }
]

export function officeTheme(id) {
  return OFFICE_THEMES.find(t => t.id === id) || OFFICE_THEMES[0]
}

const THEME_KEY = 'sush-office-themes'

export function loadOfficeThemes() {
  try {
    const value = JSON.parse(localStorage.getItem(THEME_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function saveOfficeTheme(map, key, themeId) {
  const next = { ...map, [key]: themeId }
  try { localStorage.setItem(THEME_KEY, JSON.stringify(next)) } catch {}
  return next
}
