import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SOLO_GAMES, isSoloKind, type SoloKind, type SoloOverview, type SoloResult } from '../../../shared/soloGames'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { SoundToggle } from '../../features/games/GameParts'
import { gameKeys } from '../../features/games/gameQueries'
import { BubbleShooter } from '../../features/solo/BubbleShooter'
import { BejeweledPage } from '../../features/solo/Bejeweled'
import { Mahjong } from '../../features/solo/Mahjong'
import { Minesweeper } from '../../features/solo/Minesweeper'
import { Patience } from '../../features/solo/Patience'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../features/games/Games.css'
// The bar and the end-of-game overlay are shared by all solo games
import '../../features/solo/BubbleShooter.css'
import '../../features/solo/Patience.css'

const soloKey = (kind: SoloKind) => ['solo', kind] as const

/** /spellen/alleen/:kind: a game on your own, with your best score and the high-score list. */
export function SoloGamePage() {
  const { kind = '' } = useParams()
  usePageTitle(`${isSoloKind(kind) ? SOLO_GAMES[kind].name : 'Spel'} - Spellen - Kuddes`)
  if (!isSoloKind(kind))
    return (
      <main className="page page-con">
        <p className="empty">Dit spel bestaat niet.</p>
        <Link to="/spellen">« Terug naar Spellen</Link>
      </main>
    )
  // Bejeweled 3 is a whole game of its own: across the page, with its modes
  if (kind === 'bejeweled') return <BejeweledPage />
  return <Solo key={kind} kind={kind} />
}

function Solo({ kind }: { kind: SoloKind }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const info = SOLO_GAMES[kind]
  const { data } = useQuery({ queryKey: soloKey(kind), queryFn: () => api<SoloOverview>(`/solo/${kind}`) })
  const save = useMutation({
    mutationFn: (result: SoloResult) => api<SoloOverview>(`/solo/${kind}/scores`, { method: 'POST', body: result }),
    onSuccess: (overview) => {
      queryClient.setQueryData(soloKey(kind), overview)
      // New achievements show up with the next check
      void queryClient.invalidateQueries({ queryKey: gameKeys.live })
    },
  })
  const onFinish = useCallback((result: SoloResult) => user && save.mutate(result), [user, save])

  return (
    <main className="page page-con gh-layout solo-layout">
      <div className="gm-page">
        <Box title={info.name} icon={info.icon as FarmIconName} actions={<SoundToggle />}>
          {kind === 'patience' ? (
            <Patience onFinish={onFinish} />
          ) : kind === 'mahjong' ? (
            <Mahjong onFinish={onFinish} />
          ) : kind === 'mijnenveger' ? (
            <Minesweeper onFinish={onFinish} />
          ) : (
            <BubbleShooter onFinish={onFinish} />
          )}
          {!user && (
            <p className="muted solo-login">
              <Link to={`/inloggen?next=/spellen/alleen/${kind}`}>Log in</Link> om je scores te bewaren en prestaties te verdienen.
            </p>
          )}
          {save.isError && <p className="form-error">{errorMessage(save.error)}</p>}
        </Box>
      </div>
      <aside className="gh-side">
        <Box title="Jouw scores" icon="chart_bar">
          {user ? (
            <ul className="solo-mine">
              <li>
                <span>Beste score</span> <b>{data?.best?.toLocaleString('nl-NL') ?? '–'}</b>
              </li>
              <li>
                <span>Gespeeld</span> <b>{data?.played ?? 0}</b>
              </li>
              {(kind === 'patience' || kind === 'mahjong' || kind === 'mijnenveger') && (
                <li>
                  <span>Uitgespeeld</span> <b>{data?.won ?? 0}</b>
                </li>
              )}
            </ul>
          ) : (
            <p className="muted">Log in om je scores bij te houden.</p>
          )}
        </Box>
        <Box title="Hoogste scores" icon="award_star_gold_1">
          {!data?.top.length ? (
            <p className="empty">Nog niemand. Zet jij de eerste score neer?</p>
          ) : (
            <ol className="solo-top">
              {data.top.map((t, i) => (
                <li key={t.user.id} className={t.user.id === user?.id ? 'me' : undefined}>
                  <span className="solo-rank">{i + 1}</span>
                  <Avatar user={t.user} size="tiny" />
                  <Link to={`/profiel/${t.user.username}`}>{t.user.nickname}</Link>
                  <b>{t.score.toLocaleString('nl-NL')}</b>
                </li>
              ))}
            </ol>
          )}
        </Box>
        <p>
          <Link to="/spellen">
            <FarmIcon name="controller" /> Alle spellen
          </Link>
        </p>
      </aside>
    </main>
  )
}
