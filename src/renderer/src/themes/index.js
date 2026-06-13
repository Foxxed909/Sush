import { glassdark } from './glassdark'
import { glassdarkpro } from './glassdarkpro'
import { pinkther } from './pinkther'
import { royal } from './royal'

// The curated set — four cohesive glass presets that read as the same
// product in different colours. The old 17-theme grab bag (legacy flat
// palettes + near-duplicate glass tints) is gone; saved ids from any
// removed theme are mapped to their closest survivor below, so nobody's
// settings break on upgrade.
export const themes = {
  glassdark,
  glassdarkpro,
  royal,
  pinkther
}

// Removed theme id -> closest kept theme. Read once wherever a persisted
// themeId is resolved (settings, profiles, palette actions).
const LEGACY_THEME_MAP = {
  glass: 'glassdark',
  dark: 'glassdark',
  midnight: 'glassdark',
  nord: 'glassdark',
  tokyonight: 'glassdark',
  emerald: 'glassdark',
  gruvbox: 'glassdark',
  light: 'glassdarkpro',
  solarized: 'glassdarkpro',
  amber: 'glassdarkpro',
  dracula: 'royal',
  catppuccin: 'pinkther',
  pink: 'pinkther',
  pinkther: 'pinkther'
}

export function resolveThemeId(id) {
  if (id && themes[id]) return id
  return LEGACY_THEME_MAP[id] ?? 'glassdark'
}

export function getTheme(id) {
  return themes[resolveThemeId(id)]
}

// All four presets are first-class in the in-shell switcher now.
export const presetThemeIds = ['glassdark', 'glassdarkpro', 'royal', 'pinkther']

export const defaultTheme = glassdark
