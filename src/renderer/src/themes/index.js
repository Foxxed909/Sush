import { pink } from './pink'
import { dark } from './dark'
import { light } from './light'
import { dracula } from './dracula'
import { nord } from './nord'
import { catppuccin } from './catppuccin'
import { tokyonight } from './tokyonight'
import { solarized } from './solarized'
import { gruvbox } from './gruvbox'
import { glass } from './glass'
import { glassdark } from './glassdark'
import { glassdarkpro } from './glassdarkpro'
import { pinkther } from './pinkther'
import { royal } from './royal'
import { emerald } from './emerald'
import { amber } from './amber'
import { midnight } from './midnight'

// Premium glass family first (the toggleable, cohesive "same product, different
// colour" set), then the classic flat palettes for back-compat.
export const themes = {
  glassdark,
  glassdarkpro,
  pinkther,
  royal,
  emerald,
  amber,
  midnight,
  glass,
  pink,
  dark,
  light,
  dracula,
  nord,
  catppuccin,
  tokyonight,
  solarized,
  gruvbox
}

// IDs of the curated premium glass presets, in display order — used by the
// in-shell theme switcher so it offers the family without the legacy palettes.
export const presetThemeIds = ['glassdark', 'glassdarkpro', 'pinkther', 'royal', 'emerald', 'amber', 'midnight']

export const defaultTheme = glassdark
