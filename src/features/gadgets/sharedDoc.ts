import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { SharedDoc, SharedDocItem } from '../../../shared/api'
import { api } from '../../lib/api'

/** A file from someone's gadget, with its contents (refetched when the owner saved it again). */
export const useSharedDoc = (gadgetId: number, doc: Pick<SharedDocItem, 'id' | 'updatedAt'> | undefined) =>
  useQuery({
    queryKey: ['gadgets', gadgetId, 'documents', doc?.id, doc?.updatedAt],
    queryFn: () => api<SharedDoc>(`/gadgets/${gadgetId}/documents/${doc!.id}`),
    enabled: !!doc,
    staleTime: 60_000,
  })

/** Where a shared file opens large, read-only. */
export const sharedDocPath = (username: string, gadgetId: number, docId: number) => `/profiel/${username}/bestanden/${gadgetId}/${docId}`

/** The width of an element, kept up to date (for drawing slides and graphs at the right size). */
export function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)))
    ro.observe(el)
    setWidth(Math.floor(el.clientWidth))
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
