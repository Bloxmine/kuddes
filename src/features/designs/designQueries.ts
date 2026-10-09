import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SavedDesign, SharedDesign, SharedDesignList } from '../../../shared/api'
import { CUSTOM_SKIN_KEY } from '../../../shared/customization'
import { api } from '../../lib/api'
import { useTheme } from '../../lib/theme'
import { DESIGNS_KEY } from '../account/savedThemes'
import { useUpdateMe } from '../account/useUpdateMe'

export type DesignKind = SharedDesign['kind']
export type DesignSort = 'nieuwste' | 'populair' | 'gebruikt'
export type DesignQuery = { kind: DesignKind | null; mine: boolean; q: string; sort: DesignSort; page: number }

const galleryKeys = { all: ['designgalerij'] as const, list: (q: DesignQuery) => ['designgalerij', q] as const }

/** The Designgalerij (/designs), one page of it. */
export function useSharedDesigns(query: DesignQuery) {
  const params = new URLSearchParams()
  if (query.kind) params.set('soort', query.kind)
  if (query.mine) params.set('filter', 'mijn')
  if (query.q) params.set('q', query.q)
  if (query.sort !== 'nieuwste') params.set('sort', query.sort)
  if (query.page > 1) params.set('pagina', String(query.page))
  return useQuery({ queryKey: galleryKeys.list(query), queryFn: () => api<SharedDesignList>(`/designs?${params}`), placeholderData: keepPreviousData })
}

export function useGalleryActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: galleryKeys.all })
  const share = useMutation({
    mutationFn: (input: { savedId: number; name: string; description: string }) => api<SharedDesign>('/designs', { method: 'POST', body: input }),
    onSuccess: refresh,
  })
  const edit = useMutation({
    mutationFn: ({ id, ...input }: { id: number; name: string; description: string }) => api<SharedDesign>(`/designs/${id}`, { method: 'PATCH', body: input }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (id: number) => api<void>(`/designs/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const respect = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => api<SharedDesign>(`/designs/${id}/respect`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: refresh,
  })
  return { share, edit, remove, respect }
}

/**
 * Taking one: `use` puts it on your profile (a design) or the site (a theme)
 * right away; `keep` puts a copy in Mijn designs / Mijn thema's. Both count.
 */
export function useTakeDesign() {
  const queryClient = useQueryClient()
  const update = useUpdateMe()
  const { saveCustom } = useTheme()
  const take = (d: SharedDesign, keep: boolean) => api<{ saved: SavedDesign | null }>(`/designs/${d.id}/use`, { method: 'POST', body: { keep } })
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: galleryKeys.all })
    void queryClient.invalidateQueries({ queryKey: DESIGNS_KEY })
  }
  const use = useMutation({
    mutationFn: async (d: SharedDesign) => {
      if (d.kind === 'design') await update.mutateAsync({ profileColors: d.data, skin: CUSTOM_SKIN_KEY })
      else await saveCustom(d.data)
      await take(d, false)
    },
    onSuccess: done,
  })
  const keep = useMutation({ mutationFn: (d: SharedDesign) => take(d, true), onSuccess: done })
  return { use, keep }
}
