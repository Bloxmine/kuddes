import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ChatLine, ChatUser } from '../../../shared/api'
import { FORUM_LIMITS } from '../../../shared/forum'
import { RequireAuth } from '../../components/layout/RequireAuth'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { ForumLayout } from '../../features/forum/ForumLayout'
import { api, errorMessage } from '../../lib/api'
import { useChatChannels } from '../../lib/queries'
import { playChatSound, playMentionSound } from '../../lib/siteSounds'
import { withSmileys } from '../../lib/smileys'
import type { Me } from '../../../shared/api'
import { usePageTitle } from '../../lib/usePageTitle'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const HELP = [
  '/me <actie>         — iets doen, bijv. /me zwaait',
  '/join #kanaal       — naar een ander kanaal',
  '/topic <onderwerp>  — onderwerp veranderen (moderators)',
  '/kick <naam> [reden] — iemand uit het kanaal zetten (moderators)',
  '/clear              — je scherm leegmaken',
  'Tab vult een naam aan, ↑ haalt je vorige regel terug.',
]

/** Nick colours like mIRC: steady per name. */
const NICK_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053', '#c2185b', '#00838f']
const nickColor = (name: string) => NICK_COLORS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % NICK_COLORS.length]
const prefix = (u: ChatUser | null) => (u?.forumRole === 'admin' ? '@' : u?.moderator ? '%' : '')
const clock = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

type Status = 'verbinden' | 'verbonden' | 'weg'

function Line({ line }: { line: ChatLine }) {
  const nick = line.user?.nickname ?? '***'
  const color = line.user ? nickColor(line.user.username) : undefined
  const body = (() => {
    switch (line.kind) {
      case 'msg':
        return (
          <>
            <span className="irc-nick" style={{ color }}>
              &lt;{prefix(line.user)}
              {line.user ? <Link to={`/forum/lid/${line.user.username}`}>{nick}</Link> : nick}&gt;
            </span>{' '}
            <span className="irc-text">{withSmileys(line.text)}</span>
          </>
        )
      case 'me':
        return (
          <span className="irc-action">
            * {nick} {withSmileys(line.text)}
          </span>
        )
      case 'join':
        return <span className="irc-join">→ {nick} komt binnen</span>
      case 'part':
        return <span className="irc-part">← {nick} is weggegaan</span>
      case 'topic':
        return (
          <span className="irc-topic">
            *** {nick} verandert het onderwerp in: {withSmileys(line.text)}
          </span>
        )
      case 'kick':
        return (
          <span className="irc-kick">
            *** {line.text} is uit het kanaal gezet door {nick}
          </span>
        )
      default:
        return <span className="irc-system">*** {line.text}</span>
    }
  })()
  return (
    <li className={`irc-line irc-${line.kind}`}>
      <span className="irc-time">[{clock(line.createdAt)}]</span> {body}
    </li>
  )
}

/** Switching channels (or reconnecting) remounts the view, so it starts clean. */
function Chat({ me }: { me: Me }) {
  const [params, setParams] = useSearchParams()
  const channel = (params.get('kanaal') ?? 'algemeen').toLowerCase()
  const [attempt, setAttempt] = useState(0)
  return (
    <ChannelView
      key={`${channel}:${attempt}`}
      me={me}
      channel={channel}
      onSwitch={(name) => setParams({ kanaal: name }, { replace: true })}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  )
}

function ChannelView({ me, channel, onSwitch, onRetry }: { me: Me; channel: string; onSwitch: (name: string) => void; onRetry: () => void }) {
  const { data: channels = [] } = useChatChannels()
  const [lines, setLines] = useState<ChatLine[]>([])
  const [users, setUsers] = useState<ChatUser[]>([])
  const [topic, setTopic] = useState('')
  const [status, setStatus] = useState<Status>('verbinden')
  const [problem, setProblem] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const log = useRef<HTMLOListElement>(null)
  const stuckToBottom = useRef(true)
  usePageTitle(`#${channel} - Chat - Kuddes Forum`)

  const local = (text: string) => setLines((l) => [...l, { id: -Math.random(), kind: 'system', user: null, text, createdAt: new Date().toISOString() }])

  // One EventSource per channel; it reconnects by itself after hiccups
  useEffect(() => {
    const url = `/api/chat/${encodeURIComponent(channel)}/stream`
    const source = new EventSource(url)
    source.addEventListener('hello', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { topic: string; history: ChatLine[]; users: ChatUser[] }
      setTopic(data.topic)
      setLines(data.history)
      setUsers(data.users)
      setStatus('verbonden')
      setProblem(null)
    })
    source.addEventListener('line', (e) => {
      const line = JSON.parse((e as MessageEvent).data) as ChatLine
      setLines((l) => [...l.slice(-400), line])
      // Someone else talking: a blip, or a brighter one when they mention you
      if ((line.kind === 'msg' || line.kind === 'me') && line.user && line.user.username !== me.username) {
        const mention = new RegExp(`(^|[^\\p{L}\\d_])@?(${escapeRegExp(me.username)}|${escapeRegExp(me.nickname)})(?![\\p{L}\\d_])`, 'iu')
        if (mention.test(line.text)) playMentionSound()
        else playChatSound()
      }
    })
    source.addEventListener('users', (e) => setUsers(JSON.parse((e as MessageEvent).data) as ChatUser[]))
    source.addEventListener('topic', (e) => setTopic((JSON.parse((e as MessageEvent).data) as { topic: string }).topic))
    source.addEventListener('kicked', (e) => {
      const { by, reason } = JSON.parse((e as MessageEvent).data) as { by: string; reason: string }
      source.close()
      setStatus('weg')
      setProblem(`Je bent uit #${channel} gezet door ${by}${reason ? ` (${reason})` : ''}.`)
    })
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setStatus('weg')
        // The stream refused us: ask why (banned, kicked, unknown channel)
        fetch(url)
          .then(async (r) => {
            // It worked this time: close this extra stream, the retry button reconnects properly
            if (r.ok) return void r.body?.cancel()
            setProblem((await r.json().catch(() => null))?.error ?? 'De verbinding is verbroken.')
          })
          .catch(() => setProblem('De verbinding is verbroken.'))
      } else {
        setStatus('verbinden')
      }
    }
    return () => source.close()
  }, [channel, me.username, me.nickname])

  // Keep the log scrolled down, unless you scrolled up to read back
  useEffect(() => {
    if (stuckToBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [lines])

  const send = async () => {
    const value = text.trim()
    if (!value) return
    setHistory((h) => [value, ...h].slice(0, 50))
    setHistoryIndex(-1)
    setText('')
    if (value === '/help') return HELP.forEach(local)
    if (value === '/clear') return setLines([])
    const join = value.match(/^\/join\s+#?([a-z0-9-]+)$/i)
    if (join) return onSwitch(join[1].toLowerCase())
    try {
      await api<void>(`/chat/${encodeURIComponent(channel)}/messages`, { method: 'POST', body: { text: value } })
    } catch (e) {
      local(errorMessage(e))
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void send()
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const i = Math.min(historyIndex + 1, history.length - 1)
      setHistoryIndex(i)
      setText(history[i])
    } else if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault()
      const i = historyIndex - 1
      setHistoryIndex(i)
      setText(i >= 0 ? history[i] : '')
    } else if (e.key === 'Tab') {
      // Complete the name being typed
      const word = text.match(/(\S+)$/)?.[1]
      if (!word) return
      const match = users.find((u) => u.nickname.toLowerCase().startsWith(word.toLowerCase()) && u.id !== me.id)
      if (!match) return
      e.preventDefault()
      const atStart = text.trim() === word
      setText(text.slice(0, text.length - word.length) + match.nickname + (atStart ? ': ' : ' '))
    }
  }

  const admins = users.filter((u) => u.forumRole === 'admin')
  const mods = users.filter((u) => u.forumRole !== 'admin' && u.moderator)
  const rest = users.filter((u) => !u.moderator && u.forumRole !== 'admin')

  return (
    <div className="irc">
      <nav className="irc-channels" aria-label="Kanalen">
        <h2>Kanalen</h2>
        <ul>
          {channels.map((c) => (
            <li key={c.name}>
              <button type="button" className={c.name === channel ? 'current' : undefined} onClick={() => onSwitch(c.name)}>
                #{c.name}
                {c.online > 0 && <span className="irc-count">{c.online}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="irc-main" aria-label={`#${channel}`}>
        <header className="irc-topic-bar">
          <b>#{channel}</b>
          <span>{topic ? withSmileys(topic) : <i className="muted">geen onderwerp</i>}</span>
          <span className={`irc-status ${status}`}>
            <FarmIcon name={status === 'verbonden' ? 'status_online' : status === 'verbinden' ? 'status_away' : 'status_offline'} />
            {status === 'verbonden' ? 'verbonden' : status === 'verbinden' ? 'verbinden…' : 'niet verbonden'}
          </span>
        </header>
        <ol
          ref={log}
          className="irc-log"
          aria-live="polite"
          onScroll={(e) => {
            const el = e.currentTarget
            stuckToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {status === 'verbinden' && lines.length === 0 && <li className="irc-line irc-system">*** Verbinden met #{channel}…</li>}
          {lines.map((l, i) => (
            <Line key={`${l.id}-${i}`} line={l} />
          ))}
        </ol>
        {problem && (
          <p className="irc-problem">
            <FarmIcon name="warning" /> {problem}{' '}
            <button type="button" className="link-button" onClick={onRetry}>
              Opnieuw verbinden
            </button>
          </p>
        )}
        <form
          className="irc-input"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label htmlFor="irc-text" style={{ color: nickColor(me.username) }}>
            [{me.nickname}]
          </label>
          <input
            id="irc-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            maxLength={FORUM_LIMITS.chat}
            placeholder={status === 'verbonden' ? `Bericht aan #${channel} — typ /help voor commando's` : 'Niet verbonden'}
            disabled={status === 'weg'}
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </section>

      <aside className="irc-users" aria-label="Wie is er">
        <h2>{users.length} in #{channel}</h2>
        <ul>
          {[...admins, ...mods, ...rest].map((u) => (
            <li key={u.id} title={u.forumRole === 'admin' ? 'Beheerder' : u.moderator ? 'Moderator' : undefined}>
              <span className="irc-prefix">{prefix(u)}</span>
              <Link to={`/forum/lid/${u.username}`} style={{ color: nickColor(u.username) }}>
                {u.nickname}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

/** /forum/chat?kanaal=… */
export function ForumChatPage() {
  return (
    <ForumLayout crumbs={[{ label: 'Chat' }]}>
      <RequireAuth>{(me) => <Chat me={me} />}</RequireAuth>
    </ForumLayout>
  )
}
