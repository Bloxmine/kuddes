import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { ForumLayout, Pagination, SectionIcon, ThreadTable } from '../../features/forum/ForumLayout'
import { ApiRequestError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useForumSection } from '../../lib/queries'
import { usePageTitle } from '../../lib/usePageTitle'
import { SectionRow } from './ForumIndexPage'

/** /forum/:section */
export function ForumSectionPage() {
  const { section: slug = '' } = useParams()
  const [params] = useSearchParams()
  const page = Number(params.get('pagina')) || 1
  const { user } = useAuth()
  const { data, error, isLoading } = useForumSection(slug, page)
  usePageTitle(`${data?.section.name ?? 'Forum'} - Kuddes Forum`)

  if (isLoading) return <ForumLayout>{<p className="muted">Laden…</p>}</ForumLayout>
  if (!data) {
    return (
      <ForumLayout crumbs={[{ label: 'Niet gevonden' }]}>
        <Box title="Forumdeel niet gevonden">
          <p>{error instanceof ApiRequestError ? error.message : 'Dit forumdeel kon niet geladen worden.'}</p>
        </Box>
      </ForumLayout>
    )
  }
  const { section } = data
  const newButton = data.canPost ? (
    <Link to={`/forum/nieuw?sectie=${section.slug}`} className="btn btn-cta">
      <FarmIcon name="add" /> Nieuw onderwerp
    </Link>
  ) : !user ? (
    <Link to={`/inloggen?next=/forum/${section.slug}`} className="btn">
      Log in om een onderwerp te starten
    </Link>
  ) : section.staffOnly ? (
    <span className="muted">
      <FarmIcon name="lock" /> Alleen het team start hier onderwerpen
    </span>
  ) : null

  return (
    <ForumLayout crumbs={[{ label: section.category }, ...(section.parent ? [{ label: section.parent.name, to: `/forum/${section.parent.slug}` }] : []), { label: section.name }]}>
      <div className="fm-section-head">
        <SectionIcon icon={section.icon} />
        <div>
          <h1>{section.name}</h1>
          <p className="muted">{section.description}</p>
          {section.moderators.length > 0 && (
            <p className="fm-section-mods muted">
              Moderators:{' '}
              {section.moderators.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ', '}
                  <Link to={`/forum/lid/${m.username}`}>{m.nickname}</Link>
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="fm-section-actions">{newButton}</div>
      </div>
      {data.subforums.length > 0 && data.page === 1 && (
        <table className="fm-table fm-sections fm-subforum-table">
          <thead>
            <tr>
              <th colSpan={2}>Subfora</th>
              <th className="fm-num">Onderwerpen</th>
              <th className="fm-num">Berichten</th>
              <th className="fm-last">Laatste bericht</th>
            </tr>
          </thead>
          <tbody>
            {data.subforums.map((s) => (
              <SectionRow key={s.id} section={s} />
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={data.page} pages={data.pages} href={(p) => `/forum/${section.slug}${p > 1 ? `?pagina=${p}` : ''}`} />
      <ThreadTable threads={data.threads} empty="Nog geen onderwerpen. Start de eerste!" />
      <div className="fm-bottom-bar">
        <Pagination page={data.page} pages={data.pages} href={(p) => `/forum/${section.slug}${p > 1 ? `?pagina=${p}` : ''}`} />
        {newButton}
      </div>
      <p className="fm-legend muted">
        <FarmIcon name="comment" /> onderwerp · <FarmIcon name="lightbulb" /> populair · <FarmIcon name="star" /> vastgezet · <FarmIcon name="lock" /> gesloten
      </p>
    </ForumLayout>
  )
}
