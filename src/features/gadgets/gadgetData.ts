import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Gadget, ItemRespect, RadioStation } from '../../../shared/api'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'

/** SomaFM's list, with what's playing now (the server caches it a minute). */
export function useSomaStations(refetch = false) {
  return useQuery({ queryKey: ['radio', 'somafm'], queryFn: () => api<RadioStation[]>('/radio/somafm'), staleTime: 30_000, refetchInterval: refetch ? 30_000 : false })
}

/** A country's name in Dutch, from the browser ("NL" → "Nederland"). */
export const countryName = (() => {
  let names: Intl.DisplayNames | null = null
  return (code: string) => {
    try {
      names ??= new Intl.DisplayNames(['nl'], { type: 'region' })
      return names.of(code) ?? code
    } catch {
      return code
    }
  }
})()

/** Respect for items in a gadget: the counts, and giving or taking it back. */
const NONE: ItemRespect = { count: 0, mine: false }

export function useItemRespect(gadget: Gadget, username: string) {
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: ({ item, on }: { item: string; on: boolean }) => api<Gadget>(`/gadgets/${gadget.id}/items/${encodeURIComponent(item)}/respect`, { method: 'POST', body: { on } }),
    onSuccess: (updated) => queryClient.setQueryData<Gadget[]>(keys.gadgets(username), (list = []) => list.map((g) => (g.id === updated.id ? updated : g))),
  })
  const of = (item: string): ItemRespect => (gadget.respect as Record<string, ItemRespect> | null)?.[item] ?? NONE
  return { toggle, of }
}


/** A rating in halves as text: 4.5 → "4½", 0.5 → "½". */
export const starLabel = (rating: number) => `${Math.floor(rating) || ''}${rating % 1 ? '½' : ''}` || '0'

/** The stars on a shelf sticker: 4.5 → "★★★★½". */
export const starTag = (rating: number) => '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '')
