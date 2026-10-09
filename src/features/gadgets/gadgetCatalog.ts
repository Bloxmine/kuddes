import { useQuery } from '@tanstack/react-query'
import { GADGET_CATEGORIES, GADGET_TYPES, type GadgetCategory, type GadgetType } from '../../../shared/gadgets'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api } from '../../lib/api'

/** Every gadget type, in the order of shared/gadgets.ts. */
export const GADGET_KINDS = Object.keys(GADGET_TYPES) as GadgetType[]
export const CATEGORY_KEYS = Object.keys(GADGET_CATEGORIES) as GadgetCategory[]

export const CATEGORY_ICONS: Record<GadgetCategory, FarmIconName> = {
  kasten: 'book',
  media: 'music',
  jezelf: 'user',
  handig: 'lightbulb',
  tools: 'computer',
}

/** Each kind in the bar on the Gadgetmarkt: a short name, and a line under it. */
export const CATEGORY_BAR: Record<GadgetCategory, { name: string; hint: string }> = {
  kasten: { name: 'Kasten', hint: 'boeken, films & meer' },
  media: { name: 'Muziek & video', hint: 'radio & YouTube' },
  jezelf: { name: 'Over jezelf', hint: 'blog & lijstjes' },
  handig: { name: 'Leuk & handig', hint: 'poll, klok & aftellen' },
  tools: { name: 'Tools', hint: 'bestanden & meer' },
}

/** Lower case, without accents: "geüploade" is found with "geupload". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The gadgets that match a search (every word, in the name, description or category) and a category. */
export function findGadgets(query: string, category: GadgetCategory | null = null): GadgetType[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return GADGET_KINDS.filter((type) => {
    const g = GADGET_TYPES[type]
    if (category && g.category !== category) return false
    const hay = fold(`${g.name} ${g.description} ${GADGET_CATEGORIES[g.category]} ${type}`)
    return words.every((w) => hay.includes(w))
  })
}

/** How many members show each kind of gadget. */
export const usePopularGadgets = () =>
  useQuery({
    queryKey: ['gadgets', 'populair'] as const,
    queryFn: () => api<Partial<Record<GadgetType, number>>>('/gadgets/populair'),
    staleTime: 5 * 60 * 1000,
  })
