import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { KUDDE_CATEGORIES, kuddePhotoHref } from '../../../shared/kuddes'
import { formatDuration } from '../../../shared/videos'
import type { Photo, SharedKuddePhoto } from '../../../shared/api'
import type { Glitter } from '../../../shared/glitters'
import { GlitterImg } from '../glitters/GlitterImg'
import { parseSignatureImage, threadHref } from '../../../shared/forum'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { ApiRequestError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { MembersOnlyEmbed } from '../../components/MembersOnly'
import { useKudde, useKuddeEvent, useForumProfile, useForumThreadSummary, useProfile, useVideo } from '../../lib/queries'
import { RichText } from '../../lib/richText'
import { EventDate } from '../events/EventParts'
import { formatEventWhen } from '../events/eventTime'
import { VideoPlayer } from '../video/VideoPlayer'
import { videoHref } from '../video/videoLinks'
import { parseKuddesLink, type KuddesLink } from './embeds'
import { youtubeId } from '../../../shared/gadgets'
import { ExternalBlocked } from '../../components/ui/ExternalBlocked'
import { useConsent } from '../../lib/cookieConsent'

function EmbedFrame({ icon, label, to, children }: { icon: Parameters<typeof FarmIcon>[0]['name']; label: string; to: string; children: ReactNode }) {
  return (
    <div className="fe-embed">
      <Link to={to} className="fe-embed-kind">
        <FarmIcon name={icon} /> {label}
      </Link>
      {children}
    </div>
  )
}

const Missing = ({ what }: { what: string }) => <p className="fe-embed-missing muted">{what} bestaat niet (meer) of je mag hem niet zien.</p>

function VideoEmbed({ id }: { id: string }) {
  const { data: v, isError } = useVideo(id)
  if (isError) return <Missing what="Deze video" />
  if (!v) return <p className="muted">Video laden…</p>
  return (
    <EmbedFrame icon="television" label="Kuddes Video" to={videoHref(v.id)}>
      {v.fileUrl ? (
        <VideoPlayer src={v.fileUrl} poster={v.thumbUrl} title={v.title} codec={v.codec} compact onFirstPlay={() => void api(`/videos/${v.id}/view`, { method: 'POST' }).catch(() => undefined)} />
      ) : (
        <p className="muted">Deze video wordt nog verwerkt.</p>
      )}
      <p className="fe-embed-title">
        <Link to={videoHref(v.id)}>{v.title}</Link> <span className="muted">({formatDuration(v.duration)}) · {v.user.nickname} · {v.views.toLocaleString('nl-NL')} keer bekeken</span>
      </p>
    </EmbedFrame>
  )
}

function ProfileEmbed({ username }: { username: string }) {
  const { data: p, isError } = useProfile(username)
  if (isError) return <Missing what="Dit profiel" />
  if (!p) return null
  return (
    <EmbedFrame icon="user" label="Kuddes-profiel" to={`/profiel/${p.username}`}>
      <div className="fe-embed-row">
        <Avatar user={p} size="small" />
        <div>
          <Link to={`/profiel/${p.username}`} className="fe-embed-name">
            {p.nickname}
          </Link>
          <span className="muted">
            {[p.age !== null && `${p.age} jaar`, p.city].filter(Boolean).join(', ') || `@${p.username}`} · {p.friendCount} vrienden · {p.respect} respect
          </span>
        </div>
      </div>
    </EmbedFrame>
  )
}

function KuddeEmbed({ slug }: { slug: string }) {
  const { data: b, isError } = useKudde(slug)
  if (isError) return <Missing what="Deze Kudde" />
  if (!b) return null
  const category = KUDDE_CATEGORIES[b.category]
  return (
    <EmbedFrame icon={category.icon} label={category.name} to={`/kuddes/${b.slug}`}>
      <div className="fe-embed-row">
        {b.imageUrl && <img src={b.imageUrl} alt="" className="fe-embed-img" />}
        <div>
          <Link to={`/kuddes/${b.slug}`} className="fe-embed-name">
            {b.name}
          </Link>
          <span className="muted">
            {b.memberCount} {b.memberCount === 1 ? 'lid' : 'leden'}
            {b.city && ` · ${b.city}`}
          </span>
          {b.description && <span className="fe-embed-desc">{b.description.slice(0, 140)}</span>}
        </div>
      </div>
    </EmbedFrame>
  )
}

function EventEmbed({ slug, id }: { slug: string; id: number }) {
  const { data: e, isError } = useKuddeEvent(id)
  if (isError) return <Missing what="Dit evenement" />
  if (!e) return null
  return (
    <EmbedFrame icon="calendar" label="Evenement" to={`/kuddes/${slug}/evenementen/${id}`}>
      <div className="fe-embed-row">
        <EventDate iso={e.startsAt} />
        <div>
          <Link to={`/kuddes/${slug}/evenementen/${id}`} className="fe-embed-name">
            {e.title}
          </Link>
          <span className="muted">
            {formatEventWhen(e.startsAt, e.endsAt)}
            {e.location && ` · ${e.location}`} · {e.kudde.name}
          </span>
          <span className="muted">{e.going} gaan</span>
        </div>
      </div>
    </EmbedFrame>
  )
}

function ThreadEmbed({ id }: { id: number }) {
  const { data: t, isError } = useForumThreadSummary(id)
  if (isError) return <Missing what="Dit onderwerp" />
  if (!t) return null
  return (
    <EmbedFrame icon="comment" label={`Forum · ${t.section.name}`} to={threadHref(t.section.slug, t.id, t.title)}>
      <Link to={threadHref(t.section.slug, t.id, t.title)} className="fe-embed-name">
        {t.title}
      </Link>
      <span className="muted">
        {' '}
        door {t.starter?.nickname ?? 'onbekend'} · {t.replies} {t.replies === 1 ? 'reactie' : 'reacties'} · {t.views} keer bekeken
      </span>
    </EmbedFrame>
  )
}

function ForumProfileEmbed({ username }: { username: string }) {
  const { data: p, isError } = useForumProfile(username)
  if (isError) return <Missing what="Dit forumprofiel" />
  if (!p) return null
  return (
    <EmbedFrame icon="vcard" label="Forumprofiel" to={`/forum/lid/${p.user.username}`}>
      <div className="fe-embed-row">
        <Avatar user={p.user} size="small" />
        <div>
          <Link to={`/forum/lid/${p.user.username}`} className="fe-embed-name">
            {p.user.nickname}
          </Link>
          <span className="muted">
            {p.title || 'Forumlid'} · {p.postCount} berichten · {p.reactionsReceived} reacties ontvangen
          </span>
        </div>
      </div>
    </EmbedFrame>
  )
}

function PhotoEmbed({ id }: { id: number }) {
  const { data: p, isError } = useQuery({ queryKey: ['photos', 'one', id], queryFn: () => api<Photo>(`/photos/${id}`), staleTime: 5 * 60_000 })
  if (isError) return <Missing what="Deze foto" />
  if (!p) return <p className="muted">Foto laden…</p>
  const href = `/profiel/${p.user.username}?tab=fotos&foto=${p.id}`
  return (
    <figure className="fe-photo">
      <Link to={href}>
        <img src={p.url} width={p.width} height={p.height} alt={p.caption || `Foto van ${p.user.nickname}`} loading="lazy" />
      </Link>
      <figcaption className="muted">
        {p.caption && <>{p.caption} · </>}
        <FarmIcon name="camera" /> <Link to={href}>{p.user.nickname}</Link>
      </figcaption>
    </figure>
  )
}

/** A photo from a Kudde's Foto's box; a besloten Kudde's only shows to its members. */
function KuddePhotoEmbed({ id }: { id: number }) {
  const { data: p, error } = useQuery({ queryKey: ['kudde-photos', 'one', id], queryFn: () => api<SharedKuddePhoto>(`/kudde-photos/${id}`), staleTime: 5 * 60_000, retry: false })
  if (error)
    return error instanceof ApiRequestError && error.status === 403 ? (
      <p className="members-only-embed">
        <FarmIcon name="lock" /> Deze foto is alleen te zien voor de leden van de Kudde.
      </p>
    ) : (
      <Missing what="Deze foto" />
    )
  if (!p) return <p className="muted">Foto laden…</p>
  const href = kuddePhotoHref(p.kudde.slug, p.id)
  return (
    <figure className="fe-photo">
      <Link to={href}>
        <img src={p.url} width={p.width} height={p.height} alt={p.caption || `Foto uit ${p.kudde.name}`} loading="lazy" />
      </Link>
      <figcaption className="muted">
        {p.caption && <>{p.caption} · </>}
        <FarmIcon name="group" /> <Link to={`/kuddes/${p.kudde.slug}`}>{p.kudde.name}</Link> · {p.user.nickname}
      </figcaption>
    </figure>
  )
}

function GlitterEmbed({ id }: { id: number }) {
  const { data: g, isError } = useQuery({ queryKey: ['glitters', 'one', id], queryFn: () => api<Glitter>(`/glitters/${id}`), staleTime: 5 * 60_000 })
  if (isError) return <Missing what="Dit glitterplaatje" />
  if (!g) return null
  return (
    <div className="fe-glitter">
      <GlitterImg glitter={g} />
    </div>
  )
}

/** What each members-only embed is called, for visitors without an account. */
const MEMBERS_ONLY_EMBEDS: Partial<Record<KuddesLink['type'], string>> = {
  profiel: 'Dit profiel',
  kudde: 'Deze Kudde',
  evenement: 'Dit evenement',
  forumprofiel: 'Dit forumprofiel',
  foto: 'Deze foto',
  kuddefoto: 'Deze foto',
}

export function KuddesEmbed({ link }: { link: KuddesLink }) {
  const { user } = useAuth()
  const membersOnly = MEMBERS_ONLY_EMBEDS[link.type]
  if (!user && membersOnly) return <MembersOnlyEmbed what={membersOnly} />
  switch (link.type) {
    case 'video':
      return <VideoEmbed id={link.id} />
    case 'profiel':
      return <ProfileEmbed username={link.username} />
    case 'kudde':
      return <KuddeEmbed slug={link.slug} />
    case 'evenement':
      return <EventEmbed slug={link.slug} id={link.id} />
    case 'onderwerp':
      return <ThreadEmbed id={link.id} />
    case 'forumprofiel':
      return <ForumProfileEmbed username={link.username} />
    case 'foto':
      return <PhotoEmbed id={link.id} />
    case 'kuddefoto':
      return <KuddePhotoEmbed id={link.id} />
    case 'glitter':
      return <GlitterEmbed id={link.id} />
  }
}

/**
 * A YouTube video that only loads (from youtube-nocookie.com) when you press
 * play, like the video gadget: until then it's just the thumbnail.
 */
function YoutubeEmbed({ id }: { id: string }) {
  const [playing, setPlaying] = useState(false)
  // Even the thumbnail comes from Google: only with the cookie choice
  if (!useConsent('youtube')) return <ExternalBlocked kind="youtube" />
  return (
    <div className="news-youtube">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title="YouTube-video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label="Video afspelen">
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
          <span className="news-youtube-play" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/**
 * The blocks of a post. Lines that belong together (a paragraph, a list, a
 * quote) follow each other; a blank line ends them.
 *   # Kop 1 · ## Kop 2 · ### Kop 3
 *   - of * een opsomming · 1. een genummerde lijst
 *   > een citaat · ``` code ``` · --- een lijn · -> midden <-
 *   a Kuddes link on a line of its own is shown as an embed
 */
type Block =
  | { kind: 'text'; lines: string[] }
  | { kind: 'center'; lines: string[] }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'quote'; author: string | null; lines: string[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'rule' }
  | { kind: 'embed'; link: KuddesLink }
  // News only (NewsBody): pictures, YouTube videos and buttons
  | { kind: 'image'; src: string; caption: string }
  | { kind: 'youtube'; id: string }
  | { kind: 'button'; label: string; href: string }
  // Signatures only: a userbar or banner, maybe over the whole width, maybe a link
  | { kind: 'sigimage'; src: string; wide: boolean; href: string | null }

/** ![bijschrift](/uploads/news/…webp): a picture uploaded for the news (or for a blog, which uses the same markup). */
const NEWS_IMAGE = /^!\[([^\]\n]{0,200})\]\((\/uploads\/(?:news\/[0-9a-f]{32}|blogs\/\d+-[0-9a-f]{32})\.webp)\)$/
/** [[Probeer het nu]](/gadgetmarkt): a big button. */
const NEWS_BUTTON = /^\[\[([^\]\n]{1,60})\]\]\((\/(?!\/)[^\s)]*|https?:\/\/[^\s)]+)\)$/
const newsYoutube = (line: string) => (/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//.test(line) ? youtubeId(line) : null)

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d{1,4})[.)]\s+(.*)$/
const HEADING = /^(#{1,3})\s+(.+)$/
const CENTER = /^->\s?(.*?)\s?<-$/

function toBlocks(body: string, news = false, signature = false): Block[] {
  const blocks: Block[] = []
  let fresh = true
  let code: Extract<Block, { kind: 'code' }> | null = null
  for (const line of body.replace(/\r/g, '').split('\n')) {
    const trimmed = line.trim()
    // Inside ``` … ``` everything stays exactly as typed
    if (code) {
      if (trimmed === '```') {
        code = null
        fresh = true
      } else code.lines.push(line)
      continue
    }
    if (trimmed.startsWith('```')) {
      code = { kind: 'code', lines: [] }
      blocks.push(code)
      continue
    }
    if (!trimmed) {
      fresh = true
      continue
    }
    const last = fresh ? undefined : blocks[blocks.length - 1]
    fresh = false
    if (signature) {
      const picture = parseSignatureImage(trimmed)
      if (picture) {
        blocks.push({ kind: 'sigimage', ...picture })
        fresh = true
        continue
      }
    }
    if (news) {
      const image = NEWS_IMAGE.exec(trimmed)
      const button = NEWS_BUTTON.exec(trimmed)
      const yt = newsYoutube(trimmed)
      if (image || button || yt) {
        blocks.push(image ? { kind: 'image', caption: image[1], src: image[2] } : button ? { kind: 'button', label: button[1], href: button[2] } : { kind: 'youtube', id: yt! })
        fresh = true
        continue
      }
    }
    const link = parseKuddesLink(trimmed)
    const heading = HEADING.exec(trimmed)
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    const center = CENTER.exec(trimmed)
    if (link) {
      blocks.push({ kind: 'embed', link })
      fresh = true
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ kind: 'rule' })
      fresh = true
    } else if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] })
      fresh = true
    } else if (bullet || numbered) {
      const ordered = !bullet
      const item = bullet ? bullet[1] : numbered![2]
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item)
      else blocks.push({ kind: 'list', ordered, start: numbered ? Number(numbered[1]) : 1, items: [item] })
    } else if (/^>\s?/.test(line)) {
      const text = line.replace(/^>\s?/, '')
      // "> **Sanne schreef:**" opens a quote with a name
      const author = text.match(/^\*\*(.+) schreef:\*\*$/)?.[1] ?? null
      if (last?.kind === 'quote' && !author) last.lines.push(text)
      else blocks.push({ kind: 'quote', author, lines: author ? [] : [text] })
    } else if (center) {
      if (last?.kind === 'center') last.lines.push(center[1])
      else blocks.push({ kind: 'center', lines: [center[1]] })
    } else if (last?.kind === 'text') {
      last.lines.push(line)
    } else if (last?.kind === 'list') {
      // A line right under a list item belongs to that item
      last.items[last.items.length - 1] += `\n${trimmed}`
    } else {
      blocks.push({ kind: 'text', lines: [line] })
    }
  }
  return blocks
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l, j) => (
        <span key={j}>
          {j > 0 && <br />}
          <RichText text={l} forum />
        </span>
      ))}
    </>
  )
}

/**
 * A forum post: formatting and smileys (RichText), headings, lists, quotes,
 * code, and Kuddes links on a line of their own shown as embeds (videos play
 * right there). Everything becomes React elements, never HTML.
 */
export function ForumBody({ body, news, signature }: { body: string; news?: boolean; signature?: boolean }) {
  return (
    <div className={news ? 'fe-body news-body' : signature ? 'fe-body fe-signature-body' : 'fe-body'}>
      {toBlocks(body, news, signature).map((b, i) => {
        switch (b.kind) {
          case 'sigimage': {
            const img = <img src={b.src} alt="" loading="lazy" className={b.wide ? 'fe-sig-img wide' : 'fe-sig-img'} />
            return (
              <p key={i} className="fe-sig-line">
                {!b.href ? img : b.href.startsWith('/') ? <Link to={b.href}>{img}</Link> : <a href={b.href} target="_blank" rel="nofollow noopener noreferrer ugc">{img}</a>}
              </p>
            )
          }
          case 'image':
            return (
              <figure key={i} className="news-figure">
                <img src={b.src} alt={b.caption} loading="lazy" />
                {b.caption && (
                  <figcaption>
                    <RichText text={b.caption} forum />
                  </figcaption>
                )}
              </figure>
            )
          case 'youtube':
            return <YoutubeEmbed key={i} id={b.id} />
          case 'button':
            return (
              <p key={i} className="news-button">
                {b.href.startsWith('/') ? (
                  <Link to={b.href} className="btn btn-cta">
                    {b.label} »
                  </Link>
                ) : (
                  <a href={b.href} className="btn btn-cta" target="_blank" rel="noopener noreferrer">
                    {b.label} »
                  </a>
                )}
              </p>
            )
          case 'embed':
            return <KuddesEmbed key={i} link={b.link} />
          case 'rule':
            return <hr key={i} className="fe-rule" />
          case 'heading': {
            const Tag = (['h2', 'h3', 'h4'] as const)[b.level - 1]
            return (
              <Tag key={i} className={`fe-h fe-h${b.level}`}>
                <RichText text={b.text} forum />
              </Tag>
            )
          }
          case 'list': {
            const items = b.items.map((item, j) => (
              <li key={j}>
                <Lines lines={item.split('\n')} />
              </li>
            ))
            return b.ordered ? (
              <ol key={i} className="fe-list" start={b.start}>
                {items}
              </ol>
            ) : (
              <ul key={i} className="fe-list">
                {items}
              </ul>
            )
          }
          case 'code':
            return (
              <pre key={i} className="fe-code">
                <code>{b.lines.join('\n')}</code>
              </pre>
            )
          case 'quote':
            return (
              <blockquote key={i} className="fe-quote">
                {b.author && (
                  <p className="fe-quote-author">
                    <FarmIcon name="comment" /> {b.author} schreef:
                  </p>
                )}
                {b.lines.map((l, j) => (
                  <p key={j}>
                    <RichText text={l} forum />
                  </p>
                ))}
              </blockquote>
            )
          case 'center':
            return (
              <p key={i} className="fe-text fe-center">
                <Lines lines={b.lines} />
              </p>
            )
          case 'text':
            return (
              <p key={i} className="fe-text">
                <Lines lines={b.lines} />
              </p>
            )
        }
      })}
    </div>
  )
}
