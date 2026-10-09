import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GlitterCategory, GlitterList } from '../../../shared/glitters'
import { api } from '../../lib/api'

export type GlitterFilter = 'alles' | 'mijn' | 'verzameling'
export type GlitterQuery = { category: GlitterCategory | null; filter: GlitterFilter; q: string; sort: 'nieuwste' | 'populair'; page: number; limit?: number }

export const glitterKeys = { all: ['glitters'] as const, list: (q: GlitterQuery) => ['glitters', q] as const }

export function useGlitters(query: GlitterQuery, enabled = true) {
  const params = new URLSearchParams()
  if (query.category) params.set('categorie', query.category)
  if (query.filter !== 'alles') params.set('filter', query.filter)
  if (query.q) params.set('q', query.q)
  if (query.sort === 'populair') params.set('sort', 'populair')
  if (query.page > 1) params.set('pagina', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  return useQuery({
    queryKey: glitterKeys.list(query),
    queryFn: () => api<GlitterList>(`/glitters?${params}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Verzamel / uit je verzameling. */
export function useCollect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, collect }: { id: number; collect: boolean }) => api<void>(`/glitters/${id}/collect`, { method: collect ? 'POST' : 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: glitterKeys.all }),
  })
}

export function useDeleteGlitter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/glitters/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: glitterKeys.all }),
  })
}
