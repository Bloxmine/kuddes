/**
 * "Mijn designs": your own looks for your profile and your Kuddes (saved
 * on your account as saved_designs of kind "design"), like Mijn thema's for
 * the site (savedThemes.ts): a library, a share code, and a backup of what
 * you're working on in this browser.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SavedDesign } from '../../../shared/api'
import { NAME_FONTS, NAME_SHADOWS, isProfilePattern, type HeaderDesign, type ProfileColors } from '../../../shared/customization'
import { api } from '../../lib/api'
import { DESIGNS_KEY } from './savedThemes'
import { readBodyFont, readLookExtras, readOverlay } from './lookCodes'

export type SavedLook = Extract<SavedDesign, { kind: 'design' }>

export function useSavedDesigns() {
  return useQuery({ queryKey: DESIGNS_KEY, queryFn: () => api<SavedDesign[]>('/me/designs'), select: (all) => all.filter((d): d is SavedLook => d.kind === 'design') })
}

export function useDesignLibrary() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: DESIGNS_KEY })
  const create = useMutation({ mutationFn: (d: { name: string; data: ProfileColors }) => api<SavedLook>('/me/designs', { method: 'POST', body: { kind: 'design', ...d } }), onSuccess: refresh })
  const update = useMutation({ mutationFn: ({ id, ...changes }: { id: number; name?: string; data?: ProfileColors }) => api<SavedLook>(`/me/designs/${id}`, { method: 'PATCH', body: changes }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: number) => api<void>(`/me/designs/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  return { create, update, remove }
}

/** The same look (key order and empty keys don't matter). */
export function sameLook(a: object | null | undefined, b: object | null | undefined) {
  if (!a || !b) return false
  const norm = (o: object): string =>
    JSON.stringify(
      Object.entries(o)
        .filter(([, v]) => v !== undefined && v !== null)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, v]) => [k, v && typeof v === 'object' ? norm(v) : v]),
    )
  return norm(a) === norm(b)
}

/** A new design starts blank: plain colours, no pattern, no photo, the standard title bar. */
export const BLANK_DESIGN: ProfileColors = { background: '#e9f3fb', background2: '#cfe5f6', pattern: 'effen', box: '#4ba3e0', title: '#13324f', link: '#1d74bd' }

// ------------------------------------------------------------ share codes

const CODE_PREFIX = 'KUDDES-DESIGN:'
const HEX = /^#[0-9a-f]{6}$/i

export function designCode(d: ProfileColors) {
  const { image, ...rest } = d
  void image
  return CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(rest))))
}

/** A code back to a design, or null. Only known fields with sensible values pass. */
export function readDesignCode(code: string): ProfileColors | null {
  try {
    const raw = code.trim()
    if (!raw.startsWith(CODE_PREFIX)) return null
    const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(CODE_PREFIX.length))))) as Record<string, unknown>
    const color = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' && HEX.test(o[k] as string) ? (o[k] as string) : undefined)
    const background = color(data, 'background')
    const background2 = color(data, 'background2')
    const box = color(data, 'box')
    const title = color(data, 'title')
    const link = color(data, 'link')
    const pattern = isProfilePattern(data.pattern) ? data.pattern : 'effen'
    if (!background || !background2 || !box || !title || !link) return null
    const num = (k: string, min: number, max: number) => (typeof data[k] === 'number' ? Math.min(max, Math.max(min, data[k] as number)) : undefined)
    let header: HeaderDesign | null = null
    const h = data.header as Record<string, unknown> | null | undefined
    if (h && typeof h === 'object') {
      const hc = color(h, 'color')
      const hc2 = color(h, 'color2')
      const name = color(h, 'nameColor')
      const hp = typeof h.pattern === 'string' && (h.pattern === 'standaard' || isProfilePattern(h.pattern)) ? (h.pattern as HeaderDesign['pattern']) : null
      const font = typeof h.font === 'string' && h.font in NAME_FONTS ? (h.font as HeaderDesign['font']) : null
      const shadow = typeof h.shadow === 'string' && h.shadow in NAME_SHADOWS ? (h.shadow as HeaderDesign['shadow']) : null
      if (hc && hc2 && name && hp && font && shadow) header = { pattern: hp, color: hc, color2: hc2, nameColor: name, font, shadow, backdrop: h.backdrop === true, overlay: readOverlay(h.overlay) }
    }
    return {
      background,
      background2,
      pattern,
      box,
      title,
      link,
      surface: color(data, 'surface'),
      text: color(data, 'text'),
      boxOpacity: num('boxOpacity', 0.2, 1),
      boxBlur: num('boxBlur', 0, 20),
      header,
      overlay: readOverlay(data.overlay),
      font: readBodyFont(data.font),
      titleFont: readBodyFont(data.titleFont),
      ...readLookExtras(data),
    }
  } catch {
    return null
  }
}

// ------------------------------------------------------------ the editor's backup (per profile or Kudde)

export type DesignDraft = { id: number | null; name: string; data: ProfileColors; at: number }
const draftKey = (target: string) => `kuddes.designConcept.${target}`

export function readDesignDraft(target: string): DesignDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(target)) ?? 'null') as DesignDraft | null
    return d && d.data && typeof d.name === 'string' ? d : null
  } catch {
    return null
  }
}

export function writeDesignDraft(target: string, d: DesignDraft | null) {
  try {
    if (d) localStorage.setItem(draftKey(target), JSON.stringify(d))
    else localStorage.removeItem(draftKey(target))
  } catch {
    // no backup in this browser then
  }
}
