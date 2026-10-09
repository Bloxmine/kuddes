import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MemberCard } from '../../shared/api'
import { CatalogEmpty, CatalogHero, CatalogMain, SortTabs } from '../components/catalog/Catalog'
import { Button } from '../components/ui/Button'
import { Tile } from '../components/ui/TileGrid'
import { api } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'
import './MembersPage.css'

type Sort = 'nieuw' | 'online' | 'naam'

/** "Nieuwe mensen" (Ontmoeten): every member on Kuddes, newest first, who's online now, or A to Z. */
export function MembersPage() {
  usePageTitle('Nieuwe mensen - Kuddes')
  const [params, setParams] = useSearchParams()
  const sort: Sort = params.get('sort') === 'online' ? 'online' : params.get('sort') === 'naam' ? 'naam' : 'nieuw'
  const [q, setQ] = useState(params.get('q') ?? '')
  const members = useInfiniteQuery({
    queryKey: ['members', sort, q],
    queryFn: ({ pageParam }) => api<{ items: MemberCard[]; total: number; hasMore: boolean }>(`/members?${new URLSearchParams({ sort, q, page: String(pageParam) })}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  })
  const items = members.data?.pages.flatMap((p) => p.items) ?? []
  const total = members.data?.pages[0]?.total ?? 0

  const set = (changes: { sort?: Sort; q?: string }) => {
    const next = { sort, q, ...changes }
    const query: Record<string, string> = {}
    if (next.sort !== 'nieuw') query.sort = next.sort
    if (next.q) query.q = next.q
    setParams(query, { replace: true })
  }

  return (
    <main className="page page-con ct-page members-page">
      <CatalogHero
        title="Nieuwe mensen"
        intro="Iedereen op Kuddes, de nieuwste leden eerst. Zeg eens gedag, stuur een knuffel of word vrienden!"
        q={q}
        placeholder="Zoek op naam"
        label="Zoek leden"
        live
        onSearch={(v) => {
          setQ(v)
          set({ q: v })
        }}
      />
      <CatalogMain
        icon={sort === 'online' ? 'status_online' : 'user_add'}
        title={sort === 'online' ? 'Nu online' : sort === 'naam' ? 'Alle leden' : 'Nieuwste leden'}
        sub={members.isLoading ? 'Laden…' : `${total} ${total === 1 ? 'lid' : 'leden'}`}
        sort={
          <SortTabs
            value={sort}
            onChange={(s) => set({ sort: s })}
            options={[
              ['nieuw', 'Nieuwste', 'user_add'],
              ['online', 'Nu online', 'status_online'],
              ['naam', 'A tot Z', 'text_list_bullets'],
            ]}
          />
        }
      >
        {members.isError ? (
          <p className="form-error">De leden konden niet geladen worden.</p>
        ) : !members.isLoading && !items.length ? (
          <CatalogEmpty icon="group">
            <p>{q ? `Niemand gevonden voor "${q}".` : sort === 'online' ? 'Er is nu niemand online.' : 'Nog geen leden.'}</p>
          </CatalogEmpty>
        ) : (
          <ul className="members-grid">
            {items.map((m) => (
              <li key={m.id}>
                <Tile
                  to={`/profiel/${m.username}`}
                  imageUrl={m.avatarUrl}
                  fallback={m.name}
                  title={m.nickname}
                  subtitle={m.age !== null ? `${m.age} jaar` : `@${m.username}`}
                  badge={m.online ? <span className="members-online" title="Online" /> : undefined}
                />
              </li>
            ))}
          </ul>
        )}
        {members.hasNextPage && (
          <div className="members-more">
            <Button disabled={members.isFetchingNextPage} onClick={() => members.fetchNextPage()}>
              {members.isFetchingNextPage ? 'Laden…' : 'Meer leden'}
            </Button>
          </div>
        )}
      </CatalogMain>
    </main>
  )
}
