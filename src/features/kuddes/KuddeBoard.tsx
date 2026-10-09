import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { KuddeDetail, KuddePhoto } from '../../../shared/api'
import { KUDDE_POST_LIMITS, type KuddePost, type KuddePostPage } from '../../../shared/kuddePosts'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import '../../components/social/SocialBar.css'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { IconPicker } from '../../components/ui/IconPicker'
import { Icon } from '../../components/ui/Icon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { seededGradient } from '../../lib/placeholder'
import { RichText } from '../../lib/richText'
import { Smiley } from '../../lib/smileys'
import { formatTime } from '../../lib/time'
import { SmileyPicker, TextPreview } from '../../components/social/SmileyPicker'
import { PollBox, PollEditor } from '../../components/social/PollBox'
import { hasMarkup, useTextEditing } from '../../lib/textEditing'
import type { Glitter } from '../../../shared/glitters'
import { GlitterPicker } from '../glitters/GlitterPicker'
import { GlitterImg } from '../glitters/GlitterImg'
import { KuddePhotoPicker } from './KuddePhotos'
import { ImageLightbox } from '../../components/ui/ImageLightbox'
import '../gadgets/Gadgets.css'
import '../../components/social/StatusComposer.css'
import './KuddeBoard.css'
import { can } from './kuddeRights'
import { ReportButton } from '../../components/social/ReportButton'

const boardKey = (slug: string) => ['kuddes', 'posts', slug] as const
type Pages = InfiniteData<KuddePostPage, number | null>

/** Replace one post in the cached pages (after a vote, a reply…). */
function usePatchPost(slug: string) {
  const queryClient = useQueryClient()
  return (post: KuddePost | null, id: number) =>
    queryClient.setQueryData<Pages>(boardKey(slug), (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              items: post ? p.items.map((x) => (x.id === id ? post : x)) : p.items.filter((x) => x.id !== id),
              pinned: p.pinned?.id === id ? post : p.pinned,
            })),
          }
        : data,
    )
}

/** The Kudde's own picture, for posts as the Kudde. */
function KuddeAvatar({ kudde }: { kudde: KuddeDetail }) {
  return <span className="kb-kudde-avatar" style={kudde.imageUrl ? { backgroundImage: `url(${kudde.imageUrl})` } : { background: seededGradient(kudde.name) }} aria-hidden="true" />
}

/** The Prikbord: members post messages, photos and polls; its beheerders can post as the Kudde. */
export function KuddeBoard({ kudde }: { kudde: KuddeDetail }) {
  const member = kudde.membership === 'owner' || kudde.membership === 'member'
  const hidden = kudde.visibility === 'besloten' && !member
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: boardKey(kudde.slug),
    queryFn: ({ pageParam }) => api<KuddePostPage>(`/kuddes/${kudde.slug}/posts${pageParam ? `?voor=${pageParam}` : ''}`),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !hidden,
  })
  const posts = data?.pages.flatMap((p) => p.items) ?? []
  const pinned = data?.pages[0]?.pinned ?? null

  return (
    <Box title="Prikbord" icon="note" className="kudde-board">
      {hidden ? (
        <p className="empty">
          <FarmIcon name="lock" /> Het prikbord van deze besloten Kudde is alleen voor leden.
        </p>
      ) : (
        <>
          {kudde.remote ? (
            // A community on another server: read along here, post there
            <p className="muted kb-join">
              <FarmIcon name="world_link" /> Dit prikbord komt van <b>{kudde.remote.handle}</b>.{' '}
              {member ? 'Nieuwe berichten en reacties komen vanzelf binnen.' : 'Word lid om de nieuwe berichten en reacties binnen te krijgen.'} Zelf plaatsen of reageren doe
              je{' '}
              {kudde.remote.url ? (
                <a href={kudde.remote.url} target="_blank" rel="noopener noreferrer nofollow">
                  op {kudde.remote.domain}
                </a>
              ) : (
                `op ${kudde.remote.domain}`
              )}
              .
            </p>
          ) : member ? (
            <Composer kudde={kudde} />
          ) : (
            <p className="muted kb-join">{kudde.membership === null ? <><Link to={`/inloggen?next=/kuddes/${kudde.slug}`}>Log in</Link> en word lid om mee te praten.</> : 'Word lid om op het prikbord te posten en mee te stemmen.'}</p>
          )}
          {isLoading ? (
            <p className="muted">Laden…</p>
          ) : error ? (
            <p className="form-error">{errorMessage(error)}</p>
          ) : posts.length === 0 && !pinned ? (
            <p className="empty">Nog niets op het prikbord.{member && ' Schrijf jij het eerste bericht?'}</p>
          ) : (
            <ul className="kb-posts">
              {pinned && <PostCard key={pinned.id} post={pinned} kudde={kudde} member={member} />}
              {posts.map((p) => (
                <PostCard key={p.id} post={p} kudde={kudde} member={member} />
              ))}
            </ul>
          )}
          {hasNextPage && (
            <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? 'Laden…' : 'Oudere berichten'}
            </Button>
          )}
        </>
      )}
    </Box>
  )
}

function Composer({ kudde }: { kudde: KuddeDetail }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // Owners, and beheerders who may speak for the Kudde
  const owner = can(kudde, 'namens')
  const [text, setText] = useState('')
  const [asKudde, setAsKudde] = useState(false)
  // A photo from the Kudde's Foto's box (new ones are uploaded there)
  const [photo, setPhoto] = useState<KuddePhoto | null>(null)
  const [photosOpen, setPhotosOpen] = useState(false)
  const [poll, setPoll] = useState<{ question: string; options: string[] } | null>(null)
  const [glitter, setGlitter] = useState<Glitter | null>(null)
  const [icon, setIcon] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [smileys, setSmileys] = useState(false)
  const [previewClosed, setPreviewClosed] = useState(false)
  const { ref: textRef, wrap, addLink, insert, listKeys } = useTextEditing(text, setText, KUDDE_POST_LIMITS.text)
  const showPreview = hasMarkup(text) && !previewClosed

  const post = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.set('text', text)
      form.set('asKudde', String(asKudde && owner))
      if (poll) form.set('poll', JSON.stringify(poll))
      if (glitter) form.set('glitterId', String(glitter.id))
      if (photo) form.set('kuddePhotoId', String(photo.id))
      if (icon) form.set('icon', icon)
      return api<KuddePost>(`/kuddes/${kudde.slug}/posts`, { method: 'POST', form })
    },
    onSuccess: (p) => {
      queryClient.setQueryData<Pages>(boardKey(kudde.slug), (data) => (data ? { ...data, pages: data.pages.map((pg, i) => (i === 0 ? { ...pg, items: [p, ...pg.items] } : pg)) } : data))
      setText('')
      setPoll(null)
      setGlitter(null)
      setIcon(null)
      setSmileys(false)
      setPhoto(null)
      setPhotosOpen(false)
    },
  })

  if (!user) return null
  const empty = !text.trim() && !photo && !poll && !glitter
  const posting = asKudde && owner
  // The same box as "Deel jouw WieWatWaar" (StatusComposer), with a Prikbord's extras
  return (
    <form
      className="composer kb-composer"
      onSubmit={(e) => {
        e.preventDefault()
        if (!empty) post.mutate()
      }}
    >
      <div className="composer-hdr">
        {posting ? <KuddeAvatar kudde={kudde} /> : <Avatar user={user} size="small" static />}
        <div>
          <h2>{posting ? `Mededeling van ${kudde.name}` : 'Op het prikbord'}</h2>
          <p>{posting ? 'Je plaatst dit als de Kudde; leden zien de naam en foto van de Kudde.' : `Deel iets met de leden van ${kudde.name}: tekst, een foto, een glitterplaatje of een poll.`}</p>
        </div>
        {owner && (
          <div className="kb-as" role="radiogroup" aria-label="Plaatsen als">
            <button type="button" role="radio" aria-checked={!asKudde} className={!asKudde ? 'current' : undefined} onClick={() => setAsKudde(false)} title={`Plaatsen als ${user.nickname}`}>
              <Avatar user={user} size="tiny" static /> <span>{user.nickname}</span>
            </button>
            <button type="button" role="radio" aria-checked={asKudde} className={asKudde ? 'current' : undefined} onClick={() => setAsKudde(true)} title={`Plaatsen als ${kudde.name}`}>
              <KuddeAvatar kudde={kudde} /> <span>{kudde.name}</span>
            </button>
          </div>
        )}
      </div>

      <div className="composer-editor">
        <div className="composer-toolbar" role="toolbar" aria-label="Opmaak">
          <button type="button" title="Vet" aria-label="Vet" onClick={() => wrap('**')}>
            <FarmIcon name="text_bold" />
          </button>
          <button type="button" title="Schuin" aria-label="Schuin" onClick={() => wrap('*')}>
            <FarmIcon name="text_italic" />
          </button>
          <button type="button" title="Link" aria-label="Link" onClick={addLink}>
            <FarmIcon name="link" />
          </button>
          <button type="button" title="Doorgestreept" aria-label="Doorgestreept" onClick={() => wrap('~~')}>
            <FarmIcon name="text_strikethrough" />
          </button>
        </div>
        <textarea
          ref={textRef}
          className="composer-text"
          rows={3}
          value={text}
          maxLength={KUDDE_POST_LIMITS.text}
          onKeyDown={listKeys}
          onChange={(e) => {
            setText(e.target.value)
            setPreviewClosed(false)
          }}
          placeholder={posting ? `Een mededeling van ${kudde.name}…` : `Schrijf iets op het prikbord van ${kudde.name}…`}
          aria-label="Bericht"
        />
        {photo && (
          <div className="composer-preview">
            <img src={photo.url} alt="Gekozen foto" />
            <button type="button" title="Foto weghalen" onClick={() => setPhoto(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        {glitter && (
          <div className="composer-preview">
            <GlitterImg glitter={glitter} />
            <button type="button" title="Glitterplaatje weghalen" onClick={() => setGlitter(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="composer-bar">
        <button type="button" className={smileys ? 'composer-icon current' : 'composer-icon'} title="Smileys" aria-expanded={smileys} onClick={() => setSmileys((o) => !o)}>
          <Smiley name="lach" />
        </button>
        <button
          type="button"
          className={photo || photosOpen ? 'composer-icon current' : 'composer-icon'}
          title="Foto toevoegen uit de foto's van de Kudde"
          aria-expanded={photosOpen}
          onClick={() => setPhotosOpen((o) => !o)}
        >
          <FarmIcon name="picture_add" />
        </button>
        <button type="button" className={glitter ? 'composer-icon current' : 'composer-icon'} title={glitter ? 'Ander glitterplaatje' : 'Glitterplaatje toevoegen'} onClick={() => setPicking(true)}>
          <FarmIcon name="rainbow" />
        </button>
        <button
          type="button"
          className={poll ? 'composer-icon current' : 'composer-icon'}
          title="Poll toevoegen"
          aria-pressed={!!poll}
          onClick={() => setPoll((p) => (p ? null : { question: '', options: ['', ''] }))}
        >
          <FarmIcon name="chart_bar" />
        </button>
        <IconPicker value={icon} onChange={setIcon} allowNone compact label="Pictogram bij je bericht" />
        <span className="composer-send">
          <span className="composer-count">
            {text.length}/{KUDDE_POST_LIMITS.text}
          </span>
          <Button variant="cta" type="submit" disabled={empty || post.isPending}>
            <FarmIcon name="pencil" /> {post.isPending ? 'Plaatsen…' : 'Plaatsen'}
          </Button>
        </span>
      </div>
      {photosOpen && (
        <KuddePhotoPicker
          slug={kudde.slug}
          selectedId={photo?.id ?? null}
          onPick={(p) => {
            setPhoto(p)
            setPhotosOpen(false)
          }}
        />
      )}
      {poll && (
        <div className="composer-poll-panel">
          <PollEditor value={poll} onChange={setPoll} limits={KUDDE_POST_LIMITS} />
        </div>
      )}
      {picking && (
        <GlitterPicker
          onClose={() => setPicking(false)}
          onPick={(g) => {
            setGlitter(g)
            setPicking(false)
          }}
        />
      )}
      {smileys && (
        <div className="composer-smiley-panel">
          <SmileyPicker onPick={insert} />
        </div>
      )}
      {showPreview && (
        <div className="composer-preview-panel">
          <TextPreview text={text} onClose={() => setPreviewClosed(true)} />
        </div>
      )}
      {post.isError && <p className="form-error">{errorMessage(post.error)}</p>}
    </form>
  )
}

function PostCard({ post: p, kudde, member }: { post: KuddePost; kudde: KuddeDetail; member: boolean }) {
  const patch = usePatchPost(kudde.slug)
  const [reply, setReply] = useState('')
  const [big, setBig] = useState(false)
  const [replySmileys, setReplySmileys] = useState(false)
  const act = useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: 'POST' | 'DELETE'; body?: unknown }) => api<KuddePost | null>(path, { method, body }),
    onSuccess: (updated) => patch(updated, p.id),
  })
  const remove = useMutation({ mutationFn: () => api<void>(`/kudde-posts/${p.id}`, { method: 'DELETE' }), onSuccess: () => patch(null, p.id) })
  const queryClient = useQueryClient()
  // Pinning moves posts around: fetch the board again
  const pin = useMutation({
    mutationFn: () => api<KuddePost>(`/kudde-posts/${p.id}/pin`, { method: 'POST', body: { pinned: !p.pinned } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKey(kudde.slug) }),
  })

  return (
    <li className={['kb-post', p.asKudde && 'as-kudde', p.pinned && 'pinned'].filter(Boolean).join(' ')}>
      {p.pinned && (
        <span className="kb-pinned">
          <FarmIcon name="attach" /> Vastgepind
        </span>
      )}
      <header className="kb-post-hdr">
        {p.asKudde ? <KuddeAvatar kudde={kudde} /> : p.author ? <Avatar user={p.author} size="tiny" /> : <span className="kb-kudde-avatar" />}
        <div className="kb-post-who">
          {p.asKudde ? (
            <b>
              {kudde.name} <span className="kb-badge">Kudde</span>
            </b>
          ) : p.author ? (
            <Link to={`/profiel/${p.author.username}`} className="kb-name">
              {p.author.nickname}
            </Link>
          ) : (
            <b className="muted">Oud-lid</b>
          )}
          <span className="muted kb-when">
            {formatTime(p.createdAt)}
            {p.asKudde && p.author && ` · door ${p.author.nickname}`}
          </span>
        </div>
        {p.icon && <FarmIcon name={p.icon as FarmIconName} size={24} className="kb-post-icon" label={p.icon.replace(/_/g, ' ')} />}
        {p.canPin && (
          <button type="button" className="icon-button kb-pin" title={p.pinned ? 'Losmaken' : 'Vastpinnen bovenaan het prikbord'} aria-pressed={p.pinned} disabled={pin.isPending} onClick={() => pin.mutate()}>
            <FarmIcon name="attach" />
          </button>
        )}
        <ReportButton kind="kudde" targetId={p.id} authorId={p.asKudde ? null : p.author?.id} />
        {p.canDelete && (
          <button type="button" className="icon-button kb-delete" title="Bericht verwijderen" disabled={remove.isPending} onClick={() => confirm('Dit bericht verwijderen?') && remove.mutate()}>
            <FarmIcon name="bin" />
          </button>
        )}
      </header>
      {p.text && (
        <p className="kb-text">
          <RichText text={p.text} />
        </p>
      )}
      {p.glitter && (
        <div className="kb-glitter">
          <GlitterImg glitter={p.glitter} />
        </div>
      )}
      {p.photoUrl && (
        <button type="button" className="kb-photo" onClick={() => setBig(true)} title="Groter bekijken">
          <img src={p.photoUrl} alt="Foto" loading="lazy" />
        </button>
      )}
      {big && p.photoUrl && <ImageLightbox src={p.photoUrl} alt="Foto op het prikbord" caption={p.asKudde ? kudde.name : p.author?.nickname} onClose={() => setBig(false)} />}
      {p.poll && (
        <PollBox
          className="kb-poll"
          poll={p.poll}
          canVote={member}
          canClose={p.canClose}
          pending={act.isPending}
          onVote={(option) => act.mutate({ path: `/kudde-posts/${p.id}/vote`, body: { option } })}
          onClose={() => act.mutate({ path: `/kudde-posts/${p.id}/close` })}
          cantVoteNote="word lid om te stemmen"
        />
      )}

      <div className="social-bar kb-respect">
        <button
          type="button"
          className={p.respected ? 'social-respect respected' : 'social-respect'}
          disabled={!p.canRespect || act.isPending}
          title={!p.canRespect ? (p.author || p.asKudde ? 'Je eigen bericht' : 'Log in om respect te geven') : p.respected ? 'Respect intrekken' : 'Geef respect'}
          onClick={() => act.mutate({ path: `/kudde-posts/${p.id}/respect`, method: p.respected ? 'DELETE' : 'POST' })}
        >
          <FarmIcon name="star" /> Respect
        </button>
      </div>
      {p.respect > 0 && (
        <div className="social-respecters">
          <span className="social-respecters-avatars">
            {p.respecters.map((u) => (
              <Avatar key={u.id} user={u} size="tiny" />
            ))}
          </span>
          <span>
            {p.respect} {p.respect === 1 ? 'lid respecteert' : 'leden respecteren'} dit
            {p.respecters.length > 0 && p.respecters.length < p.respect && ` (laatste ${p.respecters.length} getoond)`}
          </span>
        </div>
      )}

      {(p.replies.length > 0 || member) && (
        <div className="kb-replies">
          {p.replies.map((r) => (
            <div key={r.id} className="kb-reply">
              <Avatar user={r.user} size="tiny" />
              <div className="kb-reply-text">
                <Link to={`/profiel/${r.user.username}`} className="kb-name">
                  {r.user.nickname}
                </Link>{' '}
                <RichText text={r.text} />
                <span className="muted kb-when"> · {formatTime(r.createdAt)}</span>
              </div>
              {r.canDelete && (
                <button
                  type="button"
                  className="icon-button kb-delete"
                  title="Reactie verwijderen"
                  disabled={act.isPending}
                  onClick={() => confirm('Deze reactie verwijderen?') && act.mutate({ path: `/kudde-replies/${r.id}`, method: 'DELETE' })}
                >
                  <FarmIcon name="bin" />
                </button>
              )}
            </div>
          ))}
          {member && !kudde.remote && (
            <form
              className="kb-reply-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (reply.trim()) act.mutate({ path: `/kudde-posts/${p.id}/replies`, body: { text: reply } }, { onSuccess: () => setReply('') })
              }}
            >
              <input className="text-box" value={reply} maxLength={KUDDE_POST_LIMITS.reply} onChange={(e) => setReply(e.target.value)} placeholder="Schrijf een reactie…" aria-label="Reactie" />
              <button type="button" className="icon-button" title="Smileys" aria-pressed={replySmileys} onClick={() => setReplySmileys((s) => !s)}>
                <Smiley name="lach" />
              </button>
              <Button type="submit" disabled={!reply.trim() || act.isPending}>
                Reageer
              </Button>
            </form>
          )}
          {member && replySmileys && <SmileyPicker onPick={(code) => setReply((r) => `${r}${r && !r.endsWith(' ') ? ' ' : ''}${code} `.slice(0, KUDDE_POST_LIMITS.reply))} />}
        </div>
      )}
      {(act.isError || remove.isError) && <p className="form-error">{errorMessage(act.error ?? remove.error)}</p>}
    </li>
  )
}
