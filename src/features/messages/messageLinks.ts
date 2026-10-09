import { useQueryClient } from '@tanstack/react-query'
import type { MessageBox, MessageSummary } from '../../../shared/api'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { keys } from '../../lib/queries'

export const BOXES: { key: MessageBox; label: string; icon: FarmIconName }[] = [
  { key: 'inbox', label: 'Postvak IN', icon: 'inbox_download' },
  { key: 'verzonden', label: 'Verzonden', icon: 'inbox_upload' },
  { key: 'concepten', label: 'Concepten', icon: 'email_edit' },
]

export const boxHref = (box: MessageBox) => (box === 'inbox' ? '/berichten' : `/berichten?map=${box}`)

/** Where a message opens: concepts in the form, the rest in the read view. */
export const messageHref = (m: MessageSummary) => (m.box === 'concepten' ? `/berichten/nieuw?concept=${m.id}` : `/berichten/${m.id}`)

export function useRefreshMessages() {
  const queryClient = useQueryClient()
  // Not the open message itself: fetching it marks it read again
  return () =>
    queryClient.invalidateQueries({ queryKey: keys.allMessages, predicate: (q) => q.queryKey[1] !== 'detail' })
}
