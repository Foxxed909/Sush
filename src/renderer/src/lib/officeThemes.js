// Office looks. Each is a palette plus a backdrop kind the 3D view knows how to
// draw; the scene logic never changes with the theme. Chosen per office.

export const OFFICE_THEMES = [
  {
    id: 'loft', floor: 'plank', label: 'Night Loft',
    sky: ['#0c0a12', '#171126'], fog: '#0c0a12', floorA: '#1a1724', floorB: '#201c2c',
    roof: '#1a1625', wall: '#221d30', trim: 'accent', desk: '#2c2638', rug: '#151220', light: '#e9dcff', backdrop: 'stars', fx: 'dust', fxIn: 'dust'
  },
  {
    id: 'neon', floor: 'tile', label: 'Neon City',
    sky: ['#07060f', '#1b0c2e'], fog: '#0b0716', floorA: '#141026', floorB: '#1b1532',
    roof: '#120e22', wall: '#1a1430', trim: '#5ef3ff', desk: '#241d3d', rug: '#100c1f', light: '#b9f7ff', backdrop: 'skyline', fx: 'rain', fxIn: 'dust'
  },
  {
    id: 'forest', floor: 'plank', label: 'Forest Cabin',
    sky: ['#0b1410', '#16261c'], fog: '#0d1712', floorA: '#3a2a1e', floorB: '#443224',
    roof: '#2f4a2c', wall: '#4a3526', trim: '#9ad48a', desk: '#5b4130', rug: '#2b3d2a', light: '#fff1d6', backdrop: 'pines', fx: 'fireflies', fxIn: 'fireflies'
  },
  {
    id: 'space', floor: 'tile', label: 'Space Station',
    sky: ['#03040a', '#0a0f22'], fog: '#04060e', floorA: '#1b2030', floorB: '#222a3d',
    roof: '#1d2434', wall: '#2a3348', trim: '#7ab8ff', desk: '#2f3850', rug: '#141a2a', light: '#dfe9ff', backdrop: 'planet', fx: 'stars', fxIn: 'dust'
  },
  {
    id: 'sunset', floor: 'plank', label: 'Rooftop Sunset',
    sky: ['#2a1330', '#ff8a5c'], fog: '#3a1a2e', floorA: '#3a2a33', floorB: '#45323d',
    roof: '#33222d', wall: '#4b3342', trim: '#ffb86b', desk: '#563a48', rug: '#2e1f28', light: '#ffe2c8', backdrop: 'sun', fx: 'embers', fxIn: 'dust'
  },
  {
    id: 'ocean', floor: 'tile', label: 'Deep Ocean',
    sky: ['#031526', '#0b4a6b'], fog: '#04243a', floorA: '#12303f', floorB: '#173a4c',
    roof: '#0f2a3a', wall: '#16394d', trim: '#4fe0d0', desk: '#1f4a5e', rug: '#0d2533', light: '#bff4ff', backdrop: 'ocean', fx: 'bubbles', fxIn: 'bubbles'
  },
  {
    id: 'desert', floor: 'plank', label: 'Desert Dusk',
    sky: ['#3b1d4a', '#f2a25c'], fog: '#5a2d3f', floorA: '#6b4a38', floorB: '#775340',
    roof: '#5a3d30', wall: '#8a5a44', trim: '#ffcf7a', desk: '#8e6248', rug: '#4b3027', light: '#ffe6bf', backdrop: 'dunes', fx: 'dust', fxIn: 'dust'
  },
  {
    id: 'snow', floor: 'plank', label: 'Snow Lodge',
    sky: ['#26334d', '#8fa6c9'], fog: '#3a4a68', floorA: '#4a3b30', floorB: '#544438',
    roof: '#e8eef8', wall: '#5b4a3c', trim: '#bfe3ff', desk: '#6a5444', rug: '#3a2f2a', light: '#fff0dc', backdrop: 'snow', fx: 'snow', fxIn: 'dust'
  },
  {
    id: 'sakura', floor: 'plank', label: 'Cherry Blossom',
    sky: ['#2b1a33', '#f6b3c8'], fog: '#4a2a44', floorA: '#4a3340', floorB: '#553b49',
    roof: '#3e2937', wall: '#5e3f50', trim: '#ff9ec0', desk: '#6b4a5a', rug: '#3a2330', light: '#ffe3ee', backdrop: 'sakura', fx: 'petals', fxIn: 'petals'
  },
  {
    id: 'aurora', floor: 'tile', label: 'Aurora Peak',
    sky: ['#050a1c', '#0c2a3a'], fog: '#07121f', floorA: '#16202e', floorB: '#1c2838',
    roof: '#142030', wall: '#1d2a3c', trim: '#6dffb8', desk: '#25354a', rug: '#101a28', light: '#c9ffe9', backdrop: 'aurora', fx: 'stars', fxIn: 'dust'
  },
  {
    id: 'day', floor: 'plank', label: 'Sunny Studio',
    sky: ['#6fb7ff', '#d8efff'], fog: '#bcd9f2', floorA: '#8a6c52', floorB: '#957559',
    roof: '#b7c4d6', wall: '#c8bfae', trim: '#ff8fb1', desk: '#a98763', rug: '#6c5a49', light: '#fffbe8', backdrop: 'daytime', fx: 'dust', fxIn: 'dust'
  }
]

export const CAMPUS_THEME_KEY = '__campus'

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
