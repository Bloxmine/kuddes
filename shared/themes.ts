/**
 * Site colour themes. The colours themselves live in src/styles/themes.css;
 * this list is what members can pick and what the server accepts.
 */
export const THEMES = {
  lucht: { name: 'Blauwe lucht', swatch: ['#8ccbf5', '#4ba3e0'] },
  donker: { name: 'Donker', swatch: ['#58707a', '#1e2428'] },
  rood: { name: 'Kersenrood', swatch: ['#f08a7c', '#dd4b39'] },
  roze: { name: 'Zuurstokroze', swatch: ['#f5a3cb', '#e3438f'] },
  zon: { name: 'Oranjegeel', swatch: ['#ffcf6e', '#f2a33a'] },
} as const

export type ThemeKey = keyof typeof THEMES

export const DEFAULT_THEME: ThemeKey = 'lucht'

export const isTheme = (value: unknown): value is ThemeKey => typeof value === 'string' && value in THEMES

/** A built-in theme, or "eigen" for the member's own colours. */
export const isThemeChoice = (value: unknown): value is ThemeKey | 'eigen' => value === 'eigen' || isTheme(value)
