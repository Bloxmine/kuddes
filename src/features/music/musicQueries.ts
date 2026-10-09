import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MUSIC_GENRES, type ChartEntry, type MusicArtist, type MusicGenre, type MusicTrack, type MusicUploadAccess } from '../../../shared/music'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api } from '../../lib/api'
import { player } from './player'

export const musicKeys = {
  all: ['music'] as const,
  me: ['music', 'me'] as const,
  explore: (genre: string, q: string, sort: string) => ['music', 'explore', genre, q, sort] as const,
  charts: ['music', 'charts'] as const,
  artist: (username: string) => ['music', 'artist', username] as const,
}

export const genreIcon = (g: MusicGenre) => MUSIC_GENRES[g].icon as FarmIconName

/** "2024", or "5 oktober 2024". */
export const releaseLabel = (r: MusicTrack['released']) =>
  !r ? '' : r.yearOnly ? r.date.slice(0, 4) : new Date(`${r.date}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

export type MusicExplore = { tracks: MusicTrack[]; newest: MusicTrack[]; artists: MusicArtist[]; genres: Partial<Record<MusicGenre, number>> }

/** Your rights and your artist or band pages (none yet: an empty list). */
export const useMyMusic = (enabled = true) =>
  useQuery({ queryKey: musicKeys.me, queryFn: () => api<{ access: MusicUploadAccess; artists: MusicArtist[] }>('/music/me'), enabled, staleTime: 30_000 })

export const useCharts = (limit?: number) =>
  useQuery({ queryKey: [...musicKeys.charts, limit ?? 40], queryFn: () => api<ChartEntry[]>(`/music/charts${limit ? `?limit=${limit}` : ''}`) })

/** Like or unlike: the lists and the player follow straight away. */
export function useLike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (t: MusicTrack) => api<void>(`/tracks/${t.id}/like`, { method: t.liked ? 'DELETE' : 'POST' }),
    onMutate: (t) => player.update({ ...t, liked: !t.liked, likes: t.likes + (t.liked ? -1 : 1) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: musicKeys.all }),
  })
}
