/**
 * "Mijn thema's": your own site themes, saved on your account (saved_designs,
 * kind "thema"). One of them can be in use (it's then also your account's
 * customTheme). The editor keeps a copy of what you're working on in this
 * browser, so a crash or a closed tab doesn't lose it, and themes can be
 * shared as a code.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SavedDesign } from '../../../shared/api'
import { DEFAULT_CUSTOM_THEME, isProfilePattern, luminance, mix, type CustomTheme } from '../../../shared/customization'
import { api } from '../../lib/api'
import { readLookExtras, readOverlay } from './lookCodes'

export type SavedTheme = Extract<SavedDesign, { kind: 'thema' }>
export const DESIGNS_KEY = ['me', 'designs'] as const

export function useSavedThemes() {
  return useQuery({ queryKey: DESIGNS_KEY, queryFn: () => api<SavedDesign[]>('/me/designs'), select: (all) => all.filter((d): d is SavedTheme => d.kind === 'thema') })
}

export function useThemeLibrary() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: DESIGNS_KEY })
  const create = useMutation({ mutationFn: (t: { name: string; data: CustomTheme }) => api<SavedTheme>('/me/designs', { method: 'POST', body: { kind: 'thema', ...t } }), onSuccess: refresh })
  const update = useMutation({ mutationFn: ({ id, ...changes }: { id: number; name?: string; data?: CustomTheme }) => api<SavedTheme>(`/me/designs/${id}`, { method: 'PATCH', body: changes }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: number) => api<void>(`/me/designs/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  return { create, update, remove }
}

/** The same colours (key order and missing keys don't matter). */
export function sameTheme(a: CustomTheme | null | undefined, b: CustomTheme | null | undefined) {
  if (!a || !b) return false
  const norm = (t: CustomTheme) => JSON.stringify(Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== null).sort(([x], [y]) => x.localeCompare(y))))
  return norm(a) === norm(b)
}

/** A new theme starts blank: the standard Kuddes colours, no patterns or photo. */
export const BLANK_THEME: CustomTheme = { brand: '#4ba3e0', link: '#1d74bd', button: '#1f6fb0', background: '#ffffff', dark: false }

export const THEME_STARTERS: { name: string; theme: CustomTheme }[] = [
  { name: 'Snoeproze', theme: DEFAULT_CUSTOM_THEME },
  { name: 'Bosgroen', theme: { brand: '#3f7d4a', link: '#2d6a37', button: '#3f8f4c', background: '#f4f8f1', dark: false } },
  { name: 'Zee', theme: { brand: '#2c7fb8', link: '#1a5f8f', button: '#2b8ccc', background: '#f2f8fc', dark: false } },
  { name: 'Zonsondergang', theme: { brand: '#e2703a', link: '#b04a1c', button: '#e85d2a', background: '#fff6ee', dark: false, pattern: 'verloop', patternColor: '#ffd7b8' } },
  { name: 'Lavendel', theme: { brand: '#8a6fd1', link: '#5f45b0', button: '#9a7be0', background: '#f7f4ff', dark: false, barPattern: 'sterretjes', barPatternColor: '#d9ccff' } },
  { name: 'Nacht', theme: { brand: '#5a4a8a', link: '#b9a6ff', button: '#7a5fd1', background: '#16131f', dark: true } },
  { name: 'Retro', theme: { brand: '#c0582b', link: '#9a3f17', button: '#d9702f', background: '#fbf3e6', dark: false } },
]

// ------------------------------------------------------------ share codes

const CODE_PREFIX = 'KUDDES-THEMA:'

/** A theme as a code to copy (without a background photo: that stays yours). */
export function themeCode(t: CustomTheme) {
  const { image, ...rest } = t
  void image
  return CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(rest))))
}

const HEX = /^#[0-9a-f]{6}$/i

/** A code back to a theme, or null when it isn't one. Only the known fields, and only colours that are colours. */
export function readThemeCode(code: string): CustomTheme | null {
  try {
    const raw = code.trim()
    if (!raw.startsWith(CODE_PREFIX)) return null
    const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(CODE_PREFIX.length))))) as Record<string, unknown>
    const color = (k: string) => (typeof data[k] === 'string' && HEX.test(data[k] as string) ? (data[k] as string) : undefined)
    const brand = color('brand')
    const link = color('link')
    const button = color('button')
    const background = color('background')
    if (!brand || !link || !button || !background) return null
    const word = (k: string) => (isProfilePattern(data[k]) ? data[k] : undefined)
    const num = (k: string, min: number, max: number) => (typeof data[k] === 'number' ? Math.min(max, Math.max(min, data[k] as number)) : undefined)
    return {
      brand,
      link,
      button,
      background,
      dark: data.dark === true,
      pattern: word('pattern'),
      patternColor: color('patternColor'),
      barPattern: word('barPattern'),
      barPatternColor: color('barPatternColor'),
      boxOpacity: num('boxOpacity', 0.2, 1),
      boxBlur: num('boxBlur', 0, 20),
      overlay: readOverlay(data.overlay),
      barOverlay: readOverlay(data.barOverlay),
      ...readLookExtras(data),
    }
  } catch {
    return null
  }
}

// ------------------------------------------------------------ the editor's backup

const DRAFT_KEY = 'kuddes.themaConcept'
export type ThemeDraft = { id: number | null; name: string; data: CustomTheme; at: number }

export function readDraft(): ThemeDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as ThemeDraft | null
    return d && d.data && typeof d.name === 'string' ? d : null
  } catch {
    return null
  }
}

export function writeDraft(d: ThemeDraft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // no backup in this browser then
  }
}

// ------------------------------------------------------------ readability

/** Contrast ratio (WCAG), 1 to 21. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** The colours a theme ends up with (also what the small previews draw). */
export function themeColors(t: CustomTheme) {
  const surface = t.dark ? mix('#ffffff', t.background, 0.06) : '#ffffff'
  return {
    surface,
    text: t.dark ? '#d8e0dd' : mix(t.brand, '#1e1e1e', 0.12),
    title: t.dark ? '#eef3f1' : mix(t.brand, '#000000', 0.35),
    boxHeader: mix(t.brand, surface, t.dark ? 0.14 : 0.24),
    border: mix(t.brand, surface, t.dark ? 0.25 : 0.3),
    ctaTop: mix(t.button, '#ffffff', 0.85),
  }
}

/** What to check: links on the boxes, text on the boxes, and the white text on the top bar and buttons. */
export function readability(t: CustomTheme) {
  const c = themeColors(t)
  return [
    { label: 'Links op de boxen', ratio: contrast(t.link, c.surface), min: 3 },
    { label: 'Tekst op de boxen', ratio: contrast(c.text, c.surface), min: 4.5 },
    { label: 'Witte tekst op de bovenbalk', ratio: contrast('#ffffff', t.brand), min: 3 },
    { label: 'Witte tekst op knoppen', ratio: contrast('#ffffff', t.button), min: 3 },
  ]
}
