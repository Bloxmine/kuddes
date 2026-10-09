import { Link } from 'react-router-dom'
import type { ForumSection } from '../../../shared/api'
import { threadHref } from '../../../shared/forum'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { ForumLayout, SectionIcon, ThreadTable } from '../../features/forum/ForumLayout'
import { useForumIndex, useForumRecent } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'

export function SectionRow({ section }: { section: ForumSection }) {
  return (
    <tr>
      <td className="fm-section-icon">
        <SectionIcon icon={section.icon} />
      </td>
      <td>
        <Link to={`/forum/${section.slug}`} className="fm-section-name">
          {section.name}
        </Link>
        {section.staffOnly && (
          <span className="fm-flag" title="Alleen beheerders starten hier onderwerpen">
            <FarmIcon name="lock" /> team
          </span>
        )}
        <span className="fm-section-desc">{section.description}</span>
        {section.subforums.length > 0 && (
          <span className="fm-subforums">
            <b>Subfora:</b>{' '}
            {section.subforums.map((sub, i) => (
              <span key={sub.id}>
                {i > 0 && ', '}
                <Link to={`/forum/${sub.slug}`}>
                  <SectionIcon icon={sub.icon} size={16} /> {sub.name}
                </Link>
              </span>
            ))}
          </span>
        )}
        {section.moderators.length > 0 && (
          <span className="fm-section-mods muted">
            Moderators:{' '}
            {section.moderators.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ', '}
                <Link to={`/forum/lid/${m.username}`}>{m.nickname}</Link>
              </span>
            ))}
          </span>
        )}
      </td>
      <td className="fm-num">{section.threadCount.toLocaleString('nl-NL')}</td>
      <td className="fm-num">{section.postCount.toLocaleString('nl-NL')}</td>
      <td className="fm-last">
        {section.lastPost ? (
          <>
            <Link to={threadHref(section.lastPost.sectionSlug, section.lastPost.threadId, section.lastPost.threadTitle)} className="fm-last-title">
              {section.lastPost.threadTitle}
            </Link>
            <span>
              {formatTime(section.lastPost.at)}
              {section.lastPost.user && (
                <>
                  {' '}
                  door <Link to={`/forum/lid/${section.lastPost.user.username}`}>{section.lastPost.user.nickname}</Link>
                </>
              )}
            </span>
          </>
        ) : (
          <span className="muted">Nog geen berichten</span>
        )}
      </td>
    </tr>
  )
}

export function ForumIndexPage() {
  const { data, isLoading } = useForumIndex()
  const { data: recent = [] } = useForumRecent(6)
  usePageTitle('Kuddes Forum')
  // Subforums are shown inside their section, not on the front page
  const top = (data?.sections ?? []).filter((s) => !s.parent)
  const categories = [...new Set(top.map((s) => s.category))]

  return (
    <ForumLayout>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : (
        <>
          {categories.map((cat) => (
            <table key={cat} className="fm-table fm-sections">
              <thead>
                <tr>
                  <th colSpan={2}>{cat}</th>
                  <th className="fm-num">Onderwerpen</th>
                  <th className="fm-num">Berichten</th>
                  <th className="fm-last">Laatste bericht</th>
                </tr>
              </thead>
              <tbody>
                {top
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <SectionRow key={s.id} section={s} />
                  ))}
              </tbody>
            </table>
          ))}

          <section className="fm-block">
            <h2>
              <FarmIcon name="time" /> Nieuwste onderwerpen
            </h2>
            <ThreadTable threads={recent} showSection empty="Nog geen onderwerpen. Start de eerste!" />
          </section>

          <div className="fm-info">
            <section className="fm-block">
              <h2>
                <FarmIcon name="status_online" /> Wie is er online?
              </h2>
              <div className="fm-block-body">
                {data!.online.length === 0 ? (
                  <p className="muted">Niemand op dit moment.</p>
                ) : (
                  <p className="fm-online">
                    {data!.online.map((u, i) => (
                      <span key={u.id}>
                        {i > 0 && ', '}
                        <Link to={`/forum/lid/${u.username}`}>{u.nickname}</Link>
                      </span>
                    ))}
                  </p>
                )}
                <p className="muted">
                  <FarmIcon name="transmit" /> {data!.chatting} {data!.chatting === 1 ? 'lid' : 'leden'} in de <Link to="/forum/chat">chat</Link>
                </p>
              </div>
            </section>
            <section className="fm-block">
              <h2>
                <FarmIcon name="chart_bar" /> Statistieken
              </h2>
              <div className="fm-block-body">
                <p>
                  <b>{data!.stats.threads.toLocaleString('nl-NL')}</b> onderwerpen · <b>{data!.stats.posts.toLocaleString('nl-NL')}</b> berichten ·{' '}
                  <b>{data!.stats.members.toLocaleString('nl-NL')}</b> leden hebben gepost
                </p>
                {data!.stats.newest && (
                  <div className="fm-newest">
                    Nieuwste Kuddes-lid: <Avatar user={data!.stats.newest} size="tiny" />{' '}
                    <Link to={`/forum/lid/${data!.stats.newest.username}`}>{data!.stats.newest.nickname}</Link>
                  </div>
                )}
              </div>
            </section>
            <section className="fm-block">
              <h2>
                <FarmIcon name="tag_blue" /> Populaire tags
              </h2>
              <div className="fm-block-body fm-tags">
                {data!.tags.length === 0 ? (
                  <span className="muted">Nog geen tags.</span>
                ) : (
                  data!.tags.map((t) => (
                    <Link key={t.tag} to={`/forum/tag/${encodeURIComponent(t.tag)}`} className="fm-tag" style={{ fontSize: `${Math.min(15, 10 + t.count)}px` }}>
                      {t.tag}
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </ForumLayout>
  )
}
