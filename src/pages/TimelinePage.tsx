import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { TimelineItem } from '../../shared/api'
import { CatalogHero, CategoryBar } from '../components/catalog/Catalog'
import { StatusComposer } from '../components/social/StatusComposer'
import { OnlineFriends } from '../components/social/OnlineFriends'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { TimelineCard, type TimelineView } from '../features/timeline/TimelineCard'
import { useAuth } from '../lib/auth'
import { useTimeline } from '../lib/queries'
import { useMasonry } from '../lib/masonry'
import { usePageTitle } from '../lib/usePageTitle'
import '../features/timeline/Timeline.css'
import { useServerInfo } from '../features/federation/serverInfo'

/** What to show; the keys are the server's tabs (server/routes/timeline.ts). */
const TABS: { key: string; label: string; hint: string; icon: FarmIconName }[] = [
  { key: 'alles', label: 'Alles', hint: 'wat er gebeurt', icon: 'newspaper' },
  { key: 'wiewatwaars', label: 'WieWatWaars', hint: 'wie, wat, waar', icon: 'comment' },
  { key: 'fotos', label: "Foto's", hint: 'nieuwe foto’s', icon: 'images' },
  { key: 'knuffels', label: 'Knuffels', hint: 'op profielen', icon: 'teddy_bear' },
  { key: 'vrienden', label: 'Vrienden', hint: 'net bevriend', icon: 'group_add' },
  { key: 'kuddes', label: 'Kuddes', hint: 'wie waar lid werd', icon: 'tag_blue' },
  { key: 'videos', label: "Video's", hint: 'net geüpload', icon: 'film' },
  { key: 'recepten', label: 'Recepten', hint: 'wat de pot schaft', icon: 'cutlery' },
  { key: 'recensies', label: 'Recensies', hint: 'sterren & meningen', icon: 'star' },
  { key: 'blogs', label: 'Blogs', hint: 'nieuwe verhalen', icon: 'book_open' },
  { key: 'muziek', label: 'Muziek', hint: 'net uitgebracht', icon: 'music' },
  { key: 'radio', label: 'Radio', hint: 'live gegaan', icon: 'transmit' },
  { key: 'fotografie', label: 'Fotografie', hint: 'mooie plaatjes', icon: 'camera' },
]

/** Posts of accounts outside Kuddes you follow (Mastodon and the like): when the server allows it and you didn't hide it. */
const FEDIVERSE_TAB = { key: 'fediverse', label: 'Fediverse', hint: 'Mastodon & meer', icon: 'world_link' as FarmIconName }

type Scope = 'iedereen' | 'vrienden'

const VIEWS: { key: TimelineView; label: string; icon: FarmIconName }[] = [
  { key: 'normaal', label: 'Normaal', icon: 'layout_content' },
  { key: 'compact', label: 'Compact', icon: 'layout' },
  { key: 'raster', label: 'Raster', icon: 'application_view_tile' },
  { key: 'lijst', label: 'Lijst', icon: 'text_list_bullets' },
]

/** The chosen view is remembered in this browser only. */
const VIEW_KEY = 'kuddes.overzichtWeergave'

function readView(): TimelineView {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    return VIEWS.find((v) => v.key === saved)?.key ?? 'normaal'
  } catch {
    return 'normaal'
  }
}

const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** "Vandaag", "Gisteren", "zaterdag 27 september" (with the year if it's another year). */
function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86_400_000)
  if (days <= 0) return 'Vandaag'
  if (days === 1) return 'Gisteren'
  const label = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`
}

/** The feed split into days, newest first. */
function byDay(items: TimelineItem[]) {
  const groups: { label: string; items: TimelineItem[] }[] = []
  for (const item of items) {
    const label = dayLabel(item.createdAt)
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/** One day of the feed; in Raster the cards fit together without gaps. */
function Feed({ items, view }: { items: TimelineItem[]; view: TimelineView }) {
  const grid = useMasonry(view === 'raster')
  return (
    <div ref={grid} className={`timeline-feed view-${view}`}>
      {items.map((item) => (
        <TimelineCard key={item.id} item={item} view={view} />
      ))}
    </div>
  )
}

/**
 * "Overzicht": what your friends and other members are doing, newest first
 * and per day. On top from whom (your friends or everyone) and the bar of
 * what to show; on the right who's online.
 */
export function TimelinePage() {
  const { user } = useAuth()
  const server = useServerInfo()
  const tabs = user && server?.fediverse && user.preferences.showFediverse !== false ? [...TABS, FEDIVERSE_TAB] : TABS
  const [params, setParams] = useSearchParams()
  const tab = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'alles'
  const scope: Scope = user && params.get('van') === 'vrienden' ? 'vrienden' : 'iedereen'
  const timeline = useTimeline(tab, scope)
  const items = timeline.data?.pages.flatMap((p) => p.items) ?? []
  const [view, setView] = useState(readView)
  const pickView = (next: TimelineView) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Only for this visit then
    }
  }
  usePageTitle('Overzicht - Kuddes')

  const set = (changes: { tab?: string; van?: Scope }) => {
    const next = { tab, van: scope, ...changes }
    const query: Record<string, string> = {}
    if (next.tab !== 'alles') query.tab = next.tab
    if (next.van === 'vrienden') query.van = 'vrienden'
    setParams(query, { replace: true })
  }
  const current = tabs.find((t) => t.key === tab)!

  return (
    <main className="page page-con timeline-page">
      <CatalogHero
        title="Overzicht"
        intro={scope === 'vrienden' ? "Alles van jou en je vrienden op een rij, het nieuwste bovenaan." : "Alles wat leden plaatsen, delen en uitdelen, het nieuwste bovenaan."}
        side={
          user && (
            <div className="timeline-scope" role="group" aria-label="Van wie">
              {(
                [
                  ['vrienden', 'Mijn vrienden', 'group'],
                  ['iedereen', 'Iedereen', 'world'],
                ] as [Scope, string, FarmIconName][]
              ).map(([key, label, icon]) => (
                <button key={key} type="button" aria-pressed={scope === key} className={scope === key ? 'current' : undefined} onClick={() => set({ van: key })}>
                  <FarmIcon name={icon} /> {label}
                </button>
              ))}
            </div>
          )
        }
      />

      <CategoryBar label="Wat wil je zien?" current={tab === 'alles' ? null : tab} onPick={(t) => set({ tab: t ?? 'alles' })} items={tabs.map((t) => ({ key: t.key === 'alles' ? null : t.key, name: t.label, hint: t.hint, icon: t.icon }))} />

      <div className="timeline-layout">
        <section className="timeline-main" aria-label={current.label}>
          {user ? (
            <div className="box composer-card">
              <StatusComposer />
            </div>
          ) : (
            <p className="form-notice timeline-login">
              <Link to="/inloggen?next=/tijdlijn">Log in</Link> om je eigen WieWatWaar te delen en te zien wat je vrienden alleen met vrienden delen.
            </p>
          )}

          <div className="timeline-views" role="group" aria-label="Weergave">
            <span className="muted">Weergave</span>
            {VIEWS.map((v) => (
              <button key={v.key} type="button" aria-pressed={view === v.key} className={view === v.key ? 'current' : undefined} title={v.label} onClick={() => pickView(v.key)}>
                <FarmIcon name={v.icon} /> <span>{v.label}</span>
              </button>
            ))}
          </div>

          {timeline.isLoading ? (
            <p className="muted">Laden…</p>
          ) : timeline.isError ? (
            <p className="form-error">Het overzicht kon niet geladen worden.</p>
          ) : items.length === 0 && tab === 'fediverse' ? (
            <div className="box timeline-empty">
              <FarmIcon name="world_link" size={48} />
              <p>
                Je volgt nog niemand buiten Kuddes. Zoek iemand op Mastodon of een andere server op met <b>@naam@server</b> in de zoekbalk en klik op <b>Volgen</b>: hun
                openbare berichten komen dan hier.
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="box timeline-empty">
              <FarmIcon name={current.icon} size={48} />
              <p>
                {scope === 'vrienden' ? 'Je vrienden hebben hier nog niets gedeeld.' : 'Hier is nog niets te zien.'}{' '}
                {scope === 'vrienden' ? (
                  <button type="button" className="link-button" onClick={() => set({ van: 'iedereen' })}>
                    Kijk wat iedereen doet
                  </button>
                ) : (
                  'Plaats een WieWatWaar of voeg vrienden toe!'
                )}
              </p>
            </div>
          ) : (
            byDay(items).map((group) => (
              <section key={group.label} className="timeline-day" aria-label={group.label}>
                <h2 className="timeline-day-label">
                  <span>{group.label}</span>
                </h2>
                <Feed items={group.items} view={view} />
              </section>
            ))
          )}

          {timeline.hasNextPage && (
            <div className="timeline-more">
              <Button disabled={timeline.isFetchingNextPage} onClick={() => timeline.fetchNextPage()}>
                {timeline.isFetchingNextPage ? 'Laden…' : 'Eerder'}
              </Button>
            </div>
          )}
        </section>

        <aside className="timeline-aside sticky-side">
          <OnlineFriends />
        </aside>
      </div>
    </main>
  )
}
