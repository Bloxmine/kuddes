import { useParams, useSearchParams } from 'react-router-dom'
import type { MessageBox } from '../../shared/api'
import { RequireAuth } from '../components/layout/RequireAuth'
import { MessageComposer } from '../features/messages/MessageComposer'
import { MessageList } from '../features/messages/MessageList'
import { MessagesLayout } from '../features/messages/MessagesLayout'
import { MessageView } from '../features/messages/MessageView'
import { useMessage } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'

const isBox = (v: string | null): v is MessageBox => v === 'inbox' || v === 'verzonden' || v === 'concepten'

/** /berichten, /berichten?map=verzonden|concepten */
export function MessagesPage() {
  const [params] = useSearchParams()
  const map = params.get('map')
  const box: MessageBox = isBox(map) ? map : 'inbox'
  usePageTitle('Berichten - Kuddes')
  return (
    <RequireAuth>
      {() => (
        <MessagesLayout current={box}>
          <MessageList key={box} box={box} />
        </MessagesLayout>
      )}
    </RequireAuth>
  )
}

/** /berichten/nieuw */
export function NewMessagePage() {
  const [params] = useSearchParams()
  usePageTitle('Nieuw bericht - Kuddes')
  return (
    <RequireAuth>
      {() => (
        <MessagesLayout current={params.has('concept') ? 'concepten' : undefined}>
          <MessageComposer />
        </MessagesLayout>
      )}
    </RequireAuth>
  )
}

function ReadMessage({ id }: { id: number }) {
  const { data } = useMessage(id)
  usePageTitle(data ? `${data.subject} - Berichten - Kuddes` : 'Berichten - Kuddes')
  return (
    <MessagesLayout current={data?.box}>
      <MessageView key={id} id={id} />
    </MessagesLayout>
  )
}

/** /berichten/:id */
export function MessagePage() {
  const { id } = useParams()
  return <RequireAuth>{() => <ReadMessage id={Number(id) || 0} />}</RequireAuth>
}
