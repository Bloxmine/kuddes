import { useQuery } from '@tanstack/react-query'
import type { SharePreview } from '../../../shared/api'
import { api } from '../../lib/api'

/** A link to a page on this site ("https://kuddes.example/recepten/12-…" or "/recepten/12-…") as its path, or null. */
export function sitePath(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t) || !(t.startsWith('/') || /^https?:\/\//.test(t))) return null
  try {
    const url = new URL(t, location.origin)
    return url.origin === location.origin ? `${url.pathname}${url.search}` : null
  } catch {
    return null
  }
}

/** The preview of a shared page, as you may see it. */
export const useSharePreview = (path: string | null) =>
  useQuery({ queryKey: ['share', path], queryFn: () => api<SharePreview>(`/share?path=${encodeURIComponent(path!)}`), enabled: !!path, staleTime: 5 * 60_000, retry: false })
