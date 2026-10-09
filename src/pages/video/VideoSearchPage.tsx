import { Link, useSearchParams } from 'react-router-dom'
import { isVideoCategory, VIDEO_CATEGORIES, type VideoCategory } from '../../../shared/videos'
import { Button } from '../../components/ui/Button'
import { VideoLayout, VideoModule } from '../../features/video/VideoLayout'
import { VideoRow } from '../../features/video/VideoParts'
import { useVideoCategories, useVideoList } from '../../lib/queries'
import { usePageTitle } from '../../lib/usePageTitle'

const SORTS = {
  nieuwste: 'Nieuwste',
  'meest-bekeken': 'Meest bekeken',
  'best-beoordeeld': 'Best beoordeeld',
  nu: 'Nu bekeken',
} as const

type Sort = keyof typeof SORTS

/** Search results and browsing: /video/zoeken?q=…&categorie=…&tag=…&sort=… */
export function VideoSearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tag = params.get('tag') ?? ''
  const rawCategory = params.get('categorie')
  const category = isVideoCategory(rawCategory) ? rawCategory : undefined
  const rawSort = params.get('sort') ?? 'nieuwste'
  const sort: Sort = rawSort in SORTS ? (rawSort as Sort) : 'nieuwste'
  const list = useVideoList({ q, tag, category, sort, limit: 20 })
  const { data: counts } = useVideoCategories()
  const videos = list.data?.pages.flatMap((p) => p.items) ?? []
  usePageTitle(`${q ? `${q} - Zoeken` : 'Zoeken'} - Kuddes Video`)

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const heading = q ? `Zoekresultaten voor "${q}"` : tag ? `Video's met tag "${tag}"` : category ? VIDEO_CATEGORIES[category] : "Alle video's"

  return (
    <VideoLayout>
      <div className="vt-cols vt-cols-left">
        <aside className="sticky-side">
          <VideoModule title="Categorieën">
            <ul className="vt-categories">
              <li className={!category ? 'current' : undefined}>
                <button type="button" className="link-button" onClick={() => set({ categorie: null })}>
                  Alle categorieën
                </button>
              </li>
              {(Object.keys(VIDEO_CATEGORIES) as VideoCategory[]).map((k) => (
                <li key={k} className={k === category ? 'current' : undefined}>
                  <button type="button" className="link-button" onClick={() => set({ categorie: k })}>
                    {VIDEO_CATEGORIES[k]}
                  </button>
                  {counts && <span className="muted"> ({counts[k] ?? 0})</span>}
                </li>
              ))}
            </ul>
          </VideoModule>
        </aside>
        <div>
          <VideoModule
            title={heading}
            actions={
              <span className="vt-sorts">
                {(Object.keys(SORTS) as Sort[]).map((s, i) => (
                  <span key={s}>
                    {i > 0 && ' | '}
                    {s === sort ? (
                      <b>{SORTS[s]}</b>
                    ) : (
                      <button type="button" className="link-button" onClick={() => set({ sort: s === 'nieuwste' ? null : s })}>
                        {SORTS[s]}
                      </button>
                    )}
                  </span>
                ))}
              </span>
            }
          >
            {(tag || q) && (
              <p className="vt-filters">
                {tag && (
                  <span className="layout-chip current">
                    tag: {tag}{' '}
                    <button type="button" className="link-button" onClick={() => set({ tag: null })} aria-label="Tag weghalen">
                      ×
                    </button>
                  </span>
                )}
                {q && (
                  <Link to="/video/zoeken" className="muted">
                    Wis zoekopdracht
                  </Link>
                )}
              </p>
            )}
            {list.isLoading ? (
              <p className="muted">Laden…</p>
            ) : videos.length === 0 ? (
              <p className="empty">
                Geen video's gevonden. <Link to="/video/uploaden">Upload er zelf een!</Link>
              </p>
            ) : (
              <ul className="vt-list">
                {videos.map((v) => (
                  <VideoRow key={v.id} video={v} />
                ))}
              </ul>
            )}
            {list.hasNextPage && (
              <div className="vt-more-results">
                <Button disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                  {list.isFetchingNextPage ? 'Laden…' : 'Meer resultaten'}
                </Button>
              </div>
            )}
          </VideoModule>
        </div>
      </div>
    </VideoLayout>
  )
}
