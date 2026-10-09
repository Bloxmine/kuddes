import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Box } from '../../components/ui/Box'
import { ForumLayout, ThreadTable } from '../../features/forum/ForumLayout'
import { useForumSearch } from '../../lib/queries'
import { usePageTitle } from '../../lib/usePageTitle'

/** /forum/zoeken?q=… and /forum/tag/:tag */
export function ForumSearchPage() {
  const { tag = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const member = params.get('lid') ?? ''
  const [text, setText] = useState(q)
  const { data: results = [], isFetching } = useForumSearch(q, tag, member)
  usePageTitle(`${tag ? `Tag ${tag}` : q ? `${q} - Zoeken` : 'Zoeken'} - Kuddes Forum`)
  const label = tag ? `Onderwerpen met tag "${tag}"` : member ? `Onderwerpen van ${member}` : q ? `Zoekresultaten voor "${q}"` : 'Zoeken'

  return (
    <ForumLayout crumbs={[{ label: tag ? `Tag: ${tag}` : 'Zoeken' }]}>
      {!tag && (
        <Box title="Zoeken in het forum" icon="magnifier">
          <form
            className="fm-search-form"
            onSubmit={(e) => {
              e.preventDefault()
              setParams(text.trim() ? { q: text.trim() } : {}, { replace: true })
            }}
          >
            <input className="text-box" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Woorden uit de titel of berichten" aria-label="Zoekwoorden" />
            <button type="submit" className="btn btn-cta">
              Zoeken
            </button>
          </form>
        </Box>
      )}
      {(q || tag || member) && (
        <section className="fm-block">
          <h2>{label}</h2>
          {isFetching && !results.length ? <p className="muted fm-empty">Zoeken…</p> : <ThreadTable threads={results} showSection empty="Niets gevonden." />}
        </section>
      )}
    </ForumLayout>
  )
}
