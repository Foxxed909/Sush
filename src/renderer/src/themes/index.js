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

// ── Custom theme ─────────────────────────────────────────────────────────────
// One user-defined theme, stored in localStorage (per-user via the storage
// shim) under 'sush-custom-theme' as { name, baseId, accent, bg }. It's built
// by cloning a base preset and overriding the accent + terminal background, so
// a user gets a cohesive theme without hand-authoring 20 xterm colours. Read
// inside functions only — a module-scope localStorage read would beat the
// per-user scope installed in main.jsx.
export const CUSTOM_THEME_KEY = 'sush-custom-theme'
const HEX = /^#([0-9a-fA-F]{6})$/

export function loadCustomThemeConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_THEME_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    if (!HEX.test(raw.accent || '')) return null
    return {
      name: String(raw.name || 'Custom').slice(0, 24) || 'Custom',
      baseId: themes[raw.baseId] ? raw.baseId : 'glassdark',
      accent: raw.accent,
      bg: HEX.test(raw.bg || '') ? raw.bg : null
    }
  } catch {
    return null
  }
}

export function saveCustomThemeConfig(cfg) {
  try {
    if (!cfg) { localStorage.removeItem(CUSTOM_THEME_KEY); return }
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(cfg))
  } catch {}
}

export function buildCustomTheme(cfg) {
  const c = cfg || loadCustomThemeConfig()
  if (!c) return null
  const base = themes[c.baseId] || glassdark
  const accent = HEX.test(c.accent || '') ? c.accent : base.ui.accent
  const bg = HEX.test(c.bg || '') ? c.bg : base.xterm.background
  return {
    ...base,
    id: 'custom',
    label: c.name || 'Custom',
    custom: true,
    xterm: { ...base.xterm, background: bg, cursor: accent, selectionBackground: `${accent}2e` },
    ui: { ...base.ui, accent }
  }
}

// The presets plus the custom theme when one is defined. Consumers that render
// a theme picker should iterate this, not the static `themes` object.
export function allThemes() {
  const custom = buildCustomTheme()
  return custom ? { ...themes, custom } : { ...themes }
}

export function resolveThemeId(id) {
  if (id === 'custom' && loadCustomThemeConfig()) return 'custom'
  if (id && themes[id]) return id
  return LEGACY_THEME_MAP[id] ?? 'glassdark'
}

export function getTheme(id) {
  if (id === 'custom') {
    const custom = buildCustomTheme()
    if (custom) return custom
  }
  return themes[resolveThemeId(id)]
}

// All four presets are first-class in the in-shell switcher now.
export const presetThemeIds = ['glassdark', 'glassdarkpro', 'royal', 'pinkther']

export const defaultTheme = glassdark
