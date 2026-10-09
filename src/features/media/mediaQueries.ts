import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaInput, MediaItem, MediaKind, MediaList, MediaReview, MediaSort, RecentReview } from '../../../shared/media'
import { api } from '../../lib/api'
import { compressImage } from '../../lib/compressImage'
import { keys } from '../../lib/queries'

export type MediaQuery = { kind: MediaKind | null; q: string; sort: MediaSort; page: number; by?: string; limit?: number }

export const mediaKeys = {
  all: ['media'] as const,
  list: (q: MediaQuery) => ['media', 'list', q] as const,
  recent: (kind: MediaKind | null) => ['media', 'recent', kind] as const,
  one: (id: number) => ['media', 'one', id] as const,
  reviews: (id: number, sort: string, page: number) => ['media', 'reviews', id, sort, page] as const,
}

export function useMediaList(query: MediaQuery, enabled = true) {
  const params = new URLSearchParams()
  if (query.kind) params.set('soort', query.kind)
  if (query.q) params.set('q', query.q)
  if (query.by) params.set('van', query.by)
  if (query.sort !== 'nieuwste') params.set('sort', query.sort)
  if (query.page > 1) params.set('pagina', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  return useQuery({ queryKey: mediaKeys.list(query), queryFn: () => api<MediaList>(`/media?${params}`), placeholderData: keepPreviousData, enabled })
}

export const useRecentReviews = (kind: MediaKind | null, limit = 6) =>
  useQuery({ queryKey: mediaKeys.recent(kind), queryFn: () => api<RecentReview[]>(`/media/recent?limit=${limit}${kind ? `&soort=${kind}` : ''}`) })

export const useMediaItem = (id: number) =>
  useQuery({ queryKey: mediaKeys.one(id), queryFn: () => api<MediaItem>(`/media/${id}`), enabled: Number.isInteger(id) && id > 0, retry: false })

export type ReviewPage = { reviews: MediaReview[]; featured: MediaReview | null; total: number; page: number; pages: number }
export const useReviews = (id: number, sort: 'beste' | 'nieuwste', page: number, featured: number | null = null) =>
  useQuery({
    queryKey: [...mediaKeys.reviews(id, sort, page), featured],
    queryFn: () => api<ReviewPage>(`/media/${id}/reviews?sort=${sort}&pagina=${page}${featured ? `&uitgelicht=${featured}` : ''}`),
    placeholderData: keepPreviousData,
  })

/** After a change to the item: the page, the lists and the reviews show it. */
function useRefresh() {
  const queryClient = useQueryClient()
  return (item: MediaItem) => {
    queryClient.setQueryData(mediaKeys.one(item.id), item)
    void queryClient.invalidateQueries({ queryKey: ['media', 'list'] })
    void queryClient.invalidateQueries({ queryKey: ['media', 'recent'] })
    void queryClient.invalidateQueries({ queryKey: ['media', 'reviews', item.id] })
  }
}

export function useSaveItem(id: number | null) {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: MediaInput) => api<MediaItem>(id ? `/media/${id}` : '/media', { method: id ? 'PATCH' : 'POST', body: input }),
    onSuccess: refresh,
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/media/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
  })
}

export function useSaveReview(id: number) {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (review: { rating: number; text: string } | null) => api<MediaItem>(`/media/${id}/review`, review ? { method: 'PUT', body: review } : { method: 'DELETE' }),
    onSuccess: refresh,
  })
}

/** Put it in your kast (or take it out); your profile's gadgets change with it. */
export function useShelf(id: number, username: string) {
  const refresh = useRefresh()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (put: { rating: number; note: string } | null) =>
      put
        ? api<{ item: MediaItem; created: boolean; updated: boolean; shelf: string }>(`/media/${id}/shelf`, { method: 'PUT', body: put })
        : api<MediaItem>(`/media/${id}/shelf`, { method: 'DELETE' }).then((item) => ({ item, created: false, updated: false, shelf: '' })),
    onSuccess: (r) => {
      refresh(r.item)
      void queryClient.invalidateQueries({ queryKey: keys.gadgets(username) })
    },
  })
}

export function useRespectReview(itemId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ review, give }: { review: number; give: boolean }) => api<{ respect: number; respected: boolean }>(`/media/reviews/${review}/respect`, { method: give ? 'POST' : 'DELETE' }),
    onSuccess: (r, { review }) =>
      queryClient.setQueriesData<ReviewPage>({ queryKey: ['media', 'reviews', itemId] }, (p) =>
        p ? { ...p, reviews: p.reviews.map((x) => (x.id === review ? { ...x, ...r } : x)), featured: p.featured?.id === review ? { ...p.featured, ...r } : p.featured } : p,
      ),
  })
}

/** Uploads a photo for an item; it's kept once the item is saved with it. */
export async function uploadMediaPhoto(file: File) {
  const form = new FormData()
  form.set('file', await compressImage(file, 1200))
  return api<{ path: string; url: string }>('/media/photos', { method: 'POST', form })
}
