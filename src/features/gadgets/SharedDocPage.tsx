import { Link, useParams } from 'react-router-dom'
import { DOC_KINDS } from '../../../shared/documents'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { errorMessage } from '../../lib/api'
import { formatLongDate } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'
import { DocView } from './DocView'
import { useSharedDoc } from './sharedDoc'

/** A file someone shares in a profile gadget, large and read-only (/profiel/:username/bestanden/:gadgetId/:docId). */
export function SharedDocPage() {
  const { username = '', gadgetId = '', docId = '' } = useParams()
  const doc = useSharedDoc(Number(gadgetId), { id: Number(docId), updatedAt: '' })
  usePageTitle(doc.data ? `${doc.data.title} - ${doc.data.owner.nickname}` : 'Bestand')
  const back = (
    <Link to={`/profiel/${username}`}>
      <FarmIcon name="arrow_left" /> Terug naar het profiel
    </Link>
  )
  if (doc.isLoading)
    return (
      <main className="page page-con tg-page-wrap">
        <p className="empty">Laden…</p>
      </main>
    )
  if (doc.error || !doc.data)
    return (
      <main className="page page-con tg-page-wrap">
        <Box title="Bestand" icon="folder_page">
          <p>{errorMessage(doc.error)}</p>
          <p>{back}</p>
        </Box>
      </main>
    )
  const d = doc.data
  const kind = DOC_KINDS[d.kind]
  return (
    <main className="page page-con tg-page-wrap">
      <p className="tg-back">{back}</p>
      <div className="tg-head">
        <FarmIcon name={kind.icon} size={32} />
        <div>
          <h1>{d.title}</h1>
          <p className="muted">
            {kind.name} van <Link to={`/profiel/${d.owner.username}`}>{d.owner.nickname}</Link> · bijgewerkt op {formatLongDate(d.updatedAt)} · alleen bekijken
          </p>
        </div>
      </div>
      <DocView doc={d} />
    </main>
  )
}
