import { useQuery } from '@tanstack/react-query'
import type { PhotographyPage } from '../../../shared/photography'
import { api } from '../../lib/api'

export const photographyKeys = {
  all: ['photography'] as const,
  mine: ['photography', 'mine'] as const,
  page: (username: string) => ['photography', 'page', username] as const,
  photos: (username: string, sort: string) => ['photography', 'photos', username, sort] as const,
  explore: (sort: string, q: string) => ['photography', 'explore', sort, q] as const,
}

/** Your own photography page, or null when you haven't made one. */
export const useMyPhotography = (enabled = true) =>
  useQuery({ queryKey: photographyKeys.mine, queryFn: () => api<PhotographyPage | null>('/photography/me'), enabled, staleTime: 60_000 })
