import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { GAMES, type GameKind, type GameSummary } from '../../../shared/games'
import type { GameNews, MessengerContact, MessengerLine } from '../../../shared/messenger'
import { MSN_EMOTICONS, MSN_PATTERN, isMsnEmoticon } from '../../../shared/msnEmoticons'
import { ShareCard } from '../share/ShareCard'
import { GlitterImg } from '../glitters/GlitterImg'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api, errorMessage } from '../../lib/api'
import { RichText } from '../../lib/richText'
import { withSmileys } from '../../lib/smileys'
import { gameHref, useAnswerInvite, useChallenge } from '../games/gameQueries'
import { ComposeArea, SmileyOverlay } from './Compose'
import { useCompose } from './useCompose'
import { useMessengerState } from './messengerStore'
import { loadOlder, markRead, useConversation, useSendLine } from './messengerQueries'
import { DisplayPicture, NudgeIcon } from './MessengerParts'
import { startCall, useCall } from './calls'
import { clock, dayOf, toneOf } from './messengerFormat'

/** A message: formatting and Hyves smileys (RichText), and the MSN emoticons (`:msn-smile:`). */
export function MsnText({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MSN_PATTERN)) {
    if (!isMsnEmoticon(m[1])) continue
    if (m.index > last) out.push(<RichText key={out.length} text={text.slice(last, m.index)} />)
    const e = MSN_EMOTICONS.find((x) => x.file === m[1])!
    out.push(<img key={out.length} className="msn-emoticon" src={`/msn/${e.file}.png`} width={19} height={19} alt={e.shortcut} title={`${e.name} ${e.shortcut}`} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<RichText key={out.length} text={text.slice(last)} />)
  return <>{out}</>
}

/** Games you can challenge someone to from a conversation (the variants are picked in the game's own window). */
const CHALLENGES = (Object.keys(GAMES) as GameKind[]).filter((k) => !('variantOf' in GAMES[k]))

const gameName = (game: GameSummary | null) => (game ? GAMES[game.kind].name : 'een spel')

/** An invite in the conversation: accept or decline it right here. */
function InviteLine({ line, mine, contact }: { line: MessengerLine; mine: boolean; contact: MessengerContact }) {
  const answer = useAnswerInvite()
  const game = line.game
  if (!game) return <p className="wlm-event">{mine ? 'Je hebt een uitdaging gestuurd' : `${contact.nickname} daagde je uit`} voor een spel dat er niet meer is.</p>
  const info = GAMES[game.kind]
  const myStatus = game.players.find((p) => p.seat === game.seat)?.status
  const open = game.status === 'uitgenodigd'
  return (
    <div className="wlm-invite">
      <FarmIcon name={info.icon as FarmIconName} size={32} />
      <div>
        <b>{mine ? `Je daagt ${contact.nickname} uit voor ${info.name}!` : `${contact.nickname} daagt je uit voor ${info.name}!`}</b>
        <span className="wlm-invite-sub">{info.tagline}</span>
        <div className="wlm-invite-actions">
          {open && !mine && myStatus === 'uitgenodigd' ? (
            <>
              <button type="button" className="wlm-link-btn strong" disabled={answer.isPending} onClick={() => answer.mutate({ game, accept: true })}>
                Aannemen
              </button>
              <span aria-hidden="true">|</span>
              <button type="button" className="wlm-link-btn" disabled={answer.isPending} onClick={() => answer.mutate({ game, accept: false })}>
                Afslaan
              </button>
            </>
          ) : open ? (
            <>
              <span className="muted">{mine ? 'Wachten op antwoord…' : 'Je doet mee.'}</span>
              <Link to={gameHref(game)}>Naar het spel</Link>
            </>
          ) : game.status === 'bezig' && myStatus === 'meedoen' ? (
            <Link to={gameHref(game)} className="strong">
              Naar het spel
            </Link>
          ) : (
            <span className="muted">{game.status === 'klaar' || game.status === 'bezig' ? 'Gespeeld' : 'Niet doorgegaan'}</span>
          )}
        </div>
        {answer.isError && <span className="form-error">{errorMessage(answer.error)}</span>}
      </div>
    </div>
  )
}

const NEWS: Record<GameNews, [(name: string, game: string) => string, (game: string) => string]> = {
  meedoen: [(n, g) => `${n} doet mee met ${g}!`, (g) => `Je doet mee met ${g}.`],
  geweigerd: [(n, g) => `${n} heeft je uitdaging voor ${g} afgeslagen.`, (g) => `Je hebt de uitdaging voor ${g} afgeslagen.`],
  ingetrokken: [(n, g) => `${n} heeft de uitdaging voor ${g} ingetrokken.`, (g) => `Je hebt je uitdaging voor ${g} ingetrokken.`],
}

function EventLine({ line, mine, contact }: { line: MessengerLine; mine: boolean; contact: MessengerContact }) {
  if (line.kind === 'nudge')
    return (
      <p className="wlm-event wlm-nudge-line">
        <NudgeIcon /> {mine ? 'Je hebt een nudge gestuurd.' : `${contact.nickname} heeft je een nudge gestuurd.`}
      </p>
    )
  const news = NEWS[line.text as GameNews]
  if (!news) return null
  const game = line.game
  return (
    <p className="wlm-event">
      <FarmIcon name={game ? (GAMES[game.kind].icon as FarmIconName) : 'controller'} /> {mine ? news[1](gameName(game)) : news[0](contact.nickname, gameName(game))}
      {line.text === 'meedoen' && game?.status === 'bezig' && (
        <>
          {' '}
          <Link to={gameHref(game)}>Naar het spel</Link>
        </>
      )}
    </p>
  )
}

/** The lines, WLM style: "Naam zegt (14:02):" above each run of messages, and a line for the day. */
function Log({ lines, me, contact }: { lines: MessengerLine[]; me: Me; contact: MessengerContact }) {
  const out: ReactNode[] = []
  let day = ''
  let run: { from: number; at: number } | null = null
  for (const line of lines) {
    const d = dayOf(line.createdAt)
    if (d !== day) {
      out.push(
        <p key={`d${line.id}`} className="wlm-day">
          <span>{d}</span>
        </p>,
      )
      day = d
      run = null
    }
    const mine = line.from === me.id
    const at = new Date(line.createdAt).getTime()
    if (line.kind === 'msg') {
      if (!run || run.from !== line.from || at - run.at > 5 * 60_000) {
        out.push(
          <p key={`h${line.id}`} className="wlm-says">
            {mine ? me.nickname : contact.nickname} zegt ({clock(line.createdAt)}):
          </p>,
        )
      }
      run = { from: line.from, at }
      out.push(
        <div key={line.id} className={mine ? 'wlm-msg mine' : 'wlm-msg'}>
          {line.text && <MsnText text={line.text} />}
          {line.share && <ShareCard path={line.share} />}
          {line.glitter && (
            <span className="wlm-glitter">
              <GlitterImg glitter={line.glitter} />
            </span>
          )}
        </div>,
      )
    } else {
      run = null
      out.push(line.kind === 'invite' ? <InviteLine key={line.id} line={line} mine={mine} contact={contact} /> : <EventLine key={line.id} line={line} mine={mine} contact={contact} />)
    }
  }
  return <>{out}</>
}

/** Challenge them to a game: the list of games. */
function ChallengeMenu({ contact, onClose }: { contact: MessengerContact; onClose: () => void }) {
  const challenge = useChallenge()
  return (
    <div className="wlm-menu wlm-games" role="menu">
      <p className="wlm-menu-title">Daag {contact.nickname} uit voor:</p>
      <ul>
        {CHALLENGES.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              role="menuitem"
              disabled={challenge.isPending}
              onClick={() => challenge.mutate({ kind, usernames: [contact.username] }, { onSuccess: onClose })}
            >
              <FarmIcon name={GAMES[kind].icon as FarmIconName} /> {GAMES[kind].name}
            </button>
          </li>
        ))}
      </ul>
      {challenge.isError && <p className="form-error">{errorMessage(challenge.error)}</p>}
    </div>
  )
}

/**
 * One conversation, like a WLM 2009 conversation window: their name and
 * personal message at the top with the buttons, the display pictures on the
 * left (theirs above, yours below), the lines, a toolbar with smileys and
 * the nudge, the box to type in, and the status bar.
 */
export function Conversation({ username, me, visible, full }: { username: string; me: Me; visible: boolean; full?: boolean }) {
  const callPhase = useCall().phase
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useConversation(username)
  const send = useSendLine(username)
  const [gamesOpen, setGamesOpen] = useState(false)
  const [olderBusy, setOlderBusy] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const compose = useCompose({
    onSend: (body, sent) => {
      stick.current = true
      send.mutate(body, { onSuccess: sent })
    },
    onTyping: () => void api(`/messenger/with/${encodeURIComponent(username)}/typing`, { method: 'POST' }).catch(() => undefined),
  })
  const { focus } = compose
  const contact = data?.contact
  const typingUntil = useMessengerState((s) => (contact ? (s.typing[String(contact.id)] ?? 0) : 0))
  const shakeAt = useMessengerState((s) => s.shakes[username] ?? 0)
  const [now, setNow] = useState(() => Date.now())

  // The typing note goes away by itself
  useEffect(() => {
    if (typingUntil <= Date.now()) return
    const t = window.setTimeout(() => setNow(Date.now()), typingUntil - Date.now() + 50)
    return () => window.clearTimeout(t)
  }, [typingUntil])
  const typing = typingUntil > now

  // A nudge shakes the window (restarted each time, also for a second nudge)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el || !shakeAt || Date.now() - shakeAt > 2000) return
    el.classList.remove('wlm-shaking')
    void el.offsetWidth
    el.classList.add('wlm-shaking')
    const t = window.setTimeout(() => el.classList.remove('wlm-shaking'), 650)
    return () => window.clearTimeout(t)
  }, [shakeAt])

  // Stays at the bottom when something new comes in, unless you scrolled up to read
  useLayoutEffect(() => {
    const el = log.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [data?.lines, visible])

  // What you see counts as read
  const lastUnread = data?.lines.filter((l) => l.from !== me.id && !l.readAt).at(-1)?.id
  useEffect(() => {
    if (!visible || !lastUnread || !contact) return
    const read = () => document.visibilityState === 'visible' && void markRead(queryClient, username, contact.id, lastUnread)
    read()
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [visible, lastUnread, contact, queryClient, username])

  // Opened from somewhere else (a profile, the list): type right away
  useEffect(() => {
    const onFocus = (e: Event) => (e as CustomEvent<string>).detail === username && focus()
    window.addEventListener('kuddes:messenger-focus', onFocus)
    return () => window.removeEventListener('kuddes:messenger-focus', onFocus)
  }, [username, focus])

  if (isLoading || !contact) {
    return <div className="wlm-conv wlm-conv-loading">{error ? <p className="form-error">{errorMessage(error)}</p> : <p className="wlm-empty">Gesprek openen…</p>}</div>
  }

  const nudge = () => send.mutate({ nudge: true })
  const calling = callPhase !== 'idle'
  const lastIn = data.lines.filter((l) => l.from === contact.id).at(-1)
  const tone = toneOf(contact.status)

  return (
    <div ref={root} className={full ? 'wlm-conv full' : 'wlm-conv'}>
      <header className="wlm-conv-head wlm-scene">
        <div className="wlm-conv-who">
          <Link to={`/profiel/${contact.username}`} className="wlm-conv-name">
            {contact.nickname}
          </Link>{' '}
          <span className="wlm-conv-status">({contact.status})</span>
          {contact.note && <span className="wlm-conv-note">{withSmileys(contact.note)}</span>}
        </div>
        <nav className="wlm-conv-tools" aria-label="Acties">
          <span className="wlm-drop">
            <button type="button" className="wlm-tool" aria-expanded={gamesOpen} onClick={() => setGamesOpen((o) => !o)} title={`${contact.nickname} uitdagen voor een spel`}>
              <FarmIcon name="controller" /> <span className="wlm-tool-label">Uitdagen</span> <span aria-hidden="true">▾</span>
            </button>
            {gamesOpen && <ChallengeMenu contact={contact} onClose={() => setGamesOpen(false)} />}
          </span>
          {/* Bellen: you and they both allowed it, and they're online */}
          {!me.preferences.allowCalls ? (
            <Link to="/instellingen#privacy" className="wlm-tool" title="Zet bellen aan bij Instellingen › Privacy om je vrienden te kunnen bellen">
              <FarmIcon name="telephone" />
            </Link>
          ) : (
            <button
              type="button"
              className="wlm-tool"
              disabled={!contact.calls || !contact.online || calling}
              onClick={() => void startCall(contact)}
              title={!contact.calls ? `${contact.nickname} kan niet gebeld worden` : !contact.online ? `${contact.nickname} is offline` : `${contact.nickname} bellen`}
            >
              <FarmIcon name="telephone" /> <span className="wlm-tool-label">Bellen</span>
            </button>
          )}
          <Link to={`/berichten/nieuw?aan=${contact.username}`} className="wlm-tool" title={`Stuur ${contact.nickname} een bericht`}>
            <FarmIcon name="email_add" />
          </Link>
          <Link to={`/profiel/${contact.username}`} className="wlm-tool" title={`Profiel van ${contact.nickname}`}>
            <FarmIcon name="vcard" />
          </Link>
        </nav>
      </header>

      <div className={compose.panel === 'smileys' ? 'wlm-conv-main picking' : 'wlm-conv-main'}>
        <aside className="wlm-dps">
          <DisplayPicture user={contact} tone={tone} size={full ? 96 : 64} />
          <DisplayPicture user={me} tone={toneOf(me.onlineStatus)} size={full ? 96 : 64} />
        </aside>
        <div className="wlm-conv-right">
          <div className="wlm-log-wrap">
          <SmileyOverlay c={compose} />
          <div
            className="wlm-log"
            ref={log}
            aria-live="polite"
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
          >
            {data.hasMore && (
              <button
                type="button"
                className="wlm-link-btn wlm-older"
                disabled={olderBusy}
                onClick={() => {
                  setOlderBusy(true)
                  stick.current = false
                  void loadOlder(queryClient, username).finally(() => setOlderBusy(false))
                }}
              >
                Eerdere berichten tonen
              </button>
            )}
            {data.lines.length ? (
              <Log lines={data.lines} me={me} contact={contact} />
            ) : (
              <p className="wlm-empty">Zeg iets tegen {contact.nickname}! Gebruik smileys, stuur een nudge of daag {contact.nickname} uit voor een spelletje.</p>
            )}
          </div>
          </div>

          <ComposeArea c={compose} full={full} label={`Bericht aan ${contact.nickname}`} busy={send.isPending} onNudge={nudge} onEscape={() => setGamesOpen(false)} />
        </div>
      </div>

      <footer className="wlm-statusbar" aria-live="polite">
        {send.isError ? (
          <span className="wlm-status-error">{errorMessage(send.error)}</span>
        ) : typing ? (
          <>
            <FarmIcon name="pencil" /> {contact.nickname} is aan het typen...
          </>
        ) : !contact.online ? (
          <>{contact.nickname} is offline. Je berichten komen aan zodra {contact.nickname} weer online komt.</>
        ) : lastIn ? (
          <>
            Laatste bericht ontvangen op {new Date(lastIn.createdAt).toLocaleDateString('nl-NL')} om {clock(lastIn.createdAt)}.
          </>
        ) : null}
      </footer>
    </div>
  )
}
