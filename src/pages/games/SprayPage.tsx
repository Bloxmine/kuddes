import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import type { GameSummary } from '../../../shared/games'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Faces, TransportBadge } from '../../features/games/GameParts'
import { FriendPicker } from '../../features/games/FriendPicker'
import { namesList, othersIn } from '../../features/games/players'
import { gameKeys, useAnswerInvite, useStartGame } from '../../features/games/gameQueries'
import { openChat } from '../../features/messenger/messengerStore'
import { SprayWall, type SprayStatus } from '../../features/spray/SprayWall'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../features/games/Games.css'

/** Invite up to three friends to spray on the same wall. */
function InviteFriend({ me }: { me: Me }) {
  const [picking, setPicking] = useState(false)
  return (
    <span className="sp-invite">
      <Button variant="cta" onClick={() => setPicking(true)}>
        <FarmIcon name="group_add" /> Samen spuiten
      </Button>
      {picking && <FriendPicker kind="spray" me={me} onClose={() => setPicking(false)} />}
    </span>
  )
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="sp-bar">
      <h1>
        <FarmIcon name="paintcan" size={32} /> Graffitimuur
      </h1>
      <div className="sp-bar-tools">{children}</div>
    </div>
  )
}

/** /graffiti: the wall on your own; invite a friend from here. */
export function SprayPage() {
  usePageTitle('Graffitimuur - Kuddes')
  const { user } = useAuth()
  return (
    <main className="page page-con sp-page">
      <Header>
        {user ? (
          <InviteFriend me={user} />
        ) : (
          <span className="muted">
            <Link to="/inloggen?next=/graffiti">Log in</Link> om samen met je vrienden te spuiten en prestaties te verdienen.
          </span>
        )}
      </Header>
      <SprayWall me={user ?? null} />
      <p className="muted sp-help">
        Klik op een spuitbus om hem op te pakken, houd de muisknop ingedrukt om te spuiten en scroll om dichterbij of verder weg te gaan. Met ⟳ naast de bussen wissel je naar de speciale
        bussen; heb je ze allemaal geprobeerd, dan gaan de geheime bussen open. Het menu linksboven heeft de muren, het druipen en je foto.
      </p>
    </main>
  )
}

/** /spellen/spray/:id: spraying together with up to three friends on the same wall. */
export function SprayGame({ initial, me }: { initial: GameSummary; me: Me }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const answer = useAnswerInvite()
  const start = useStartGame()
  const [status, setStatus] = useState<SprayStatus | null>(null)
  const onStatus = useCallback((s: SprayStatus) => setStatus(s), [])
  const game = status?.game ?? initial
  const friends = othersIn(game)
  const mine = game.players.find((p) => p.seat === game.seat)
  const host = game.players.find((p) => p.seat === 0)!
  const along = friends.filter((p) => p.status === 'meedoen')
  const yes = game.players.filter((p) => p.status === 'meedoen').length
  // Stopping keeps you on this wall: only the connection ends, the painting stays
  const [stopped, setStopped] = useState(false)
  const stop = useMutation({
    mutationFn: () => api<GameSummary>(`/games/${game.id}/resign`, { method: 'POST' }),
    onSuccess: () => {
      setStopped(true)
      queryClient.invalidateQueries({ queryKey: gameKeys.all })
    },
  })
  const withdraw = () => answer.mutate({ game, accept: false }, { onSuccess: () => navigate('/graffiti') })
  const here = (id: number) => status?.online.includes(id)

  return (
    <div className="sp-page">
      <Header>
        <span className="sp-friend">
          <Faces users={(game.status === 'bezig' ? along : friends).map((p) => p.user)} />
          {game.status === 'uitgenodigd' ? (
            mine?.status === 'uitgenodigd' ? (
              <>
                <span>
                  <b>{host.user.nickname}</b> wil samen met je spuiten
                  {friends.length > 1 && <>, met {namesList(friends.filter((p) => p.seat !== 0).map((p) => p.user.nickname))}</>}!
                </span>
                <Button variant="cta" disabled={answer.isPending} onClick={() => answer.mutate({ game, accept: true })}>
                  <FarmIcon name="accept" /> Meedoen
                </Button>
                <Button disabled={answer.isPending} onClick={() => answer.mutate({ game, accept: false }, { onSuccess: () => navigate('/graffiti') })}>
                  Nee, bedankt
                </Button>
              </>
            ) : (
              <>
                <span>
                  Wachten op <b>{namesList(friends.filter((p) => p.status === 'uitgenodigd').map((p) => p.user.nickname))}</b>… Je kunt alvast beginnen: je muur gaat mee.
                </span>
                {game.seat === 0 && yes >= 2 && friends.length > 1 && (
                  <Button variant="cta" disabled={start.isPending} onClick={() => start.mutate(game)}>
                    <FarmIcon name="control_play_blue" /> Nu beginnen met {yes}
                  </Button>
                )}
                {game.seat === 0 && (
                  <Button disabled={answer.isPending} onClick={withdraw}>
                    Uitnodiging intrekken
                  </Button>
                )}
              </>
            )
          ) : game.status === 'bezig' && !stopped ? (
            <>
              <span>
                Samen met{' '}
                {along.map((p, i) => (
                  <span key={p.seat}>
                    {i > 0 && (i === along.length - 1 ? ' en ' : ', ')}
                    <Link to={`/profiel/${p.user.username}`}>{p.user.nickname}</Link>
                    {status && !here(p.user.id) && <span className="muted"> (even weg)</span>}
                  </span>
                ))}
              </span>
              {status && status.peerOnline && <TransportBadge transport={status.transport} />}
              {along.map((p) => (
                <Button key={p.seat} onClick={() => openChat(p.user.username)} title={`Chat met ${p.user.nickname} in Kuddes Messenger; wat je zegt verschijnt ook als tekstballon bij je spuitbus`}>
                  <FarmIcon name="user_comment" /> {along.length > 1 ? p.user.nickname : 'Chat'}
                </Button>
              ))}
              <Button disabled={stop.isPending} onClick={() => confirm(along.length > 1 ? 'Stoppen? De anderen spuiten verder, en jij houdt je muur.' : 'Stoppen met samen spuiten? Je muur blijft staan.') && stop.mutate()}>
                <FarmIcon name="door_out" /> Stoppen
              </Button>
            </>
          ) : (
            <>
              <span>{stopped ? 'Je spuit nu alleen verder.' : 'Jullie spuiten niet meer samen.'} Je muur blijft gewoon staan.</span>
              <InviteFriend me={me} />
            </>
          )}
        </span>
      </Header>
      <SprayWall me={me} game={initial} onStatus={onStatus} />
      {(stop.isError || answer.isError) && <p className="form-error">{errorMessage(stop.error ?? answer.error)}</p>}
    </div>
  )
}
