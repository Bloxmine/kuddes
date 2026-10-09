import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { VideoComment, VideoCommentPage, VideoDetail } from '../../../shared/api'
import { COMMENT_VOTES, parseTags, VIDEO_CATEGORIES, VIDEO_LIMITS, VIDEO_VISIBILITY, type VideoCategory, type VideoVisibility } from '../../../shared/videos'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { VideoLayout, VideoModule, MoreText } from '../../features/video/VideoLayout'
import { CategoryLink, Stars, VideoRow } from '../../features/video/VideoParts'
import { VideoPlayer } from '../../features/video/VideoPlayer'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys, useChannelVideos, useRelatedVideos, useVideo, useVideoComments } from '../../lib/queries'
import { RichText } from '../../lib/richText'
import { formatDate, formatTime } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'
import { ShareWithFriends } from '../../features/share/ShareWithFriends'
import { ReportButton } from '../../components/social/ReportButton'

function EditVideo({ video, onDone }: { video: VideoDetail; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: video.title,
    description: video.description,
    tags: video.tags.join(', '),
    category: video.category,
    visibility: video.visibility,
  })
  const save = useMutation({
    mutationFn: () => api(`/videos/${video.id}`, { method: 'PATCH', body: { ...form, tags: parseTags(form.tags) } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.allVideos })
      onDone()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <VideoModule title="Video bewerken">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <VideoDetailsFields form={form} onChange={setForm} fields={fields} />
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={save.isPending}>
            Opslaan
          </Button>
          <Button onClick={onDone}>Annuleren</Button>
          {save.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
      </form>
    </VideoModule>
  )
}

export type VideoDetailsForm = { title: string; description: string; tags: string; category: VideoCategory; visibility: VideoVisibility }

/** Title, description, tags, category and who can see it: for uploading and editing. */
export function VideoDetailsFields({
  form,
  onChange,
  fields,
}: {
  form: VideoDetailsForm
  onChange: (next: VideoDetailsForm) => void
  fields: Record<string, string>
}) {
  const set = (key: keyof VideoDetailsForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...form, [key]: e.target.value })
  const tags = parseTags(form.tags)
  return (
    <>
      <Field label="Titel" error={fields.title}>
        <input className="text-box" value={form.title} onChange={set('title')} maxLength={VIDEO_LIMITS.title} required />
      </Field>
      <Field label="Beschrijving" error={fields.description}>
        <textarea className="text-box" rows={5} value={form.description} onChange={set('description')} maxLength={VIDEO_LIMITS.description} />
      </Field>
      <Field label="Tags" hint="(scheiden met komma's of spaties)" error={fields.tags}>
        <input className="text-box" value={form.tags} onChange={set('tags')} placeholder="kat, grappig, zomer" />
      </Field>
      {tags.length > 0 && (
        <p className="vt-tag-preview">
          {tags.map((t) => (
            <span key={t} className="layout-chip">
              {t}
            </span>
          ))}
        </p>
      )}
      <div className="settings-grid">
        <Field label="Categorie" error={fields.category}>
          <select className="text-box" value={form.category} onChange={set('category')}>
            {(Object.keys(VIDEO_CATEGORIES) as VideoCategory[]).map((k) => (
              <option key={k} value={k}>
                {VIDEO_CATEGORIES[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Wie mag hem zien?" error={fields.visibility}>
          <select className="text-box" value={form.visibility} onChange={set('visibility')}>
            {(Object.keys(VIDEO_VISIBILITY) as VideoVisibility[]).map((k) => (
              <option key={k} value={k}>
                {VIDEO_VISIBILITY[k].label} — {VIDEO_VISIBILITY[k].hint}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  )
}

type Vote = -1 | 0 | 1

/** One comment: who, when, what, and the thumbs (folded away when it got too many thumbs down). */
function CommentItem({ c, onVote, onDelete, busy }: { c: VideoComment; onVote: (vote: Vote) => void; onDelete: () => void; busy: boolean }) {
  const [opened, setOpened] = useState(false)
  if (c.hidden && !opened)
    return (
      <li className="vt-comment-hidden">
        <span className="muted">Deze reactie heeft te veel negatieve beoordelingen gekregen.</span>{' '}
        <button type="button" className="link-button" onClick={() => setOpened(true)}>
          Tonen
        </button>
      </li>
    )
  const score = c.likes - c.dislikes
  return (
    <li className={c.hidden ? 'vt-comment-opened' : undefined}>
      <Avatar user={c.user} size="small" />
      <div>
        <p className="vt-comment-meta">
          <Link to={`/video/kanaal/${c.user.username}`}>{c.user.nickname}</Link> <span className="muted">({formatTime(c.createdAt)})</span>
          <ReportButton kind="video" targetId={c.id} authorId={c.user.id} />
          {c.canDelete && (
            <button type="button" className="icon-button" title="Verwijderen" aria-label="Reactie verwijderen" disabled={busy} onClick={() => confirm('Deze reactie verwijderen?') && onDelete()}>
              <FarmIcon name="bin" />
            </button>
          )}
        </p>
        <p className="vt-comment-text">
          <RichText text={c.text} />
        </p>
        <div className="vt-thumbs" role="group" aria-label="Beoordeel deze reactie">
          <span className={score > 0 ? 'vt-score up' : score < 0 ? 'vt-score down' : 'vt-score'} title={`${c.likes} duimpjes omhoog, ${c.dislikes} omlaag`}>
            {score > 0 ? `+${score}` : score}
          </span>
          <button
            type="button"
            className={c.myVote === 1 ? 'vt-thumb up current' : 'vt-thumb up'}
            disabled={!c.canVote || busy}
            aria-pressed={c.myVote === 1}
            title={c.canVote ? 'Goede reactie' : 'Log in om te stemmen (niet op je eigen reactie)'}
            onClick={() => onVote(c.myVote === 1 ? 0 : 1)}
          >
            <FarmIcon name="thumb_up" /> {c.likes}
          </button>
          <button
            type="button"
            className={c.myVote === -1 ? 'vt-thumb down current' : 'vt-thumb down'}
            disabled={!c.canVote || busy}
            aria-pressed={c.myVote === -1}
            title={c.canVote ? 'Slechte reactie' : 'Log in om te stemmen (niet op je eigen reactie)'}
            onClick={() => onVote(c.myVote === -1 ? 0 : -1)}
          >
            <FarmIcon name="thumb_down" /> {c.dislikes}
          </button>
          {c.hidden && (
            <button type="button" className="link-button" onClick={() => setOpened(false)}>
              Verbergen
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function Comments({ video }: { video: VideoDetail }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const comments = useVideoComments(video.id)
  const items = comments.data?.pages.flatMap((p) => p.items) ?? []
  const top = comments.data?.pages[0]?.top ?? []
  const refresh = () => Promise.all([comments.refetch(), queryClient.invalidateQueries({ queryKey: keys.video(video.id), exact: true })])
  const post = useMutation({
    mutationFn: () => api<VideoComment>(`/videos/${video.id}/comments`, { method: 'POST', body: { text } }),
    onSuccess: async () => {
      setText('')
      await refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/video-comments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })
  // A thumb: shown right away in both lists, and the best two are worked out again afterwards
  const vote = useMutation({
    mutationFn: ({ id, vote: v }: { id: number; vote: Vote }) => api<Pick<VideoComment, 'likes' | 'dislikes' | 'myVote' | 'hidden'>>(`/video-comments/${id}/vote`, { method: 'POST', body: { vote: v } }),
    onSuccess: (counts, { id }) => {
      queryClient.setQueryData<InfiniteData<VideoCommentPage>>([...keys.video(video.id), 'comments'], (d) =>
        d
          ? {
              ...d,
              pages: d.pages.map((p) => ({
                ...p,
                items: p.items.map((x) => (x.id === id ? { ...x, ...counts } : x)),
                top: p.top.map((x) => (x.id === id ? { ...x, ...counts } : x)),
              })),
            }
          : d,
      )
    },
  })
  const item = (c: VideoComment) => <CommentItem key={c.id} c={c} busy={vote.isPending || remove.isPending} onVote={(v) => vote.mutate({ id: c.id, vote: v })} onDelete={() => remove.mutate(c.id)} />

  return (
    <VideoModule title={`Reacties (${video.commentCount})`} className="vt-comments">
      {user ? (
        <form
          className="vt-comment-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) post.mutate()
          }}
        >
          <textarea
            className="text-box"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={VIDEO_LIMITS.comment}
            placeholder="Wat vind jij van deze video?"
            aria-label="Reactie"
          />
          <div className="vt-comment-bar">
            <span className="muted">{VIDEO_LIMITS.comment - text.length} tekens over</span>
            <Button type="submit" disabled={!text.trim() || post.isPending}>
              <FarmIcon name="comment" /> Reactie plaatsen
            </Button>
          </div>
          {post.isError && <p className="form-error">{errorMessage(post.error)}</p>}
        </form>
      ) : (
        <p className="vt-comment-login">
          <Link to={`/inloggen?next=${encodeURIComponent(`/video/kijk?v=${video.id}`)}`}>Log in</Link> of{' '}
          <Link to="/aanmelden">meld je aan</Link> om een reactie te plaatsen en duimpjes te geven.
        </p>
      )}
      {vote.isError && <p className="form-error">{errorMessage(vote.error)}</p>}
      {top.length > 0 && items.length > COMMENT_VOTES.top && (
        <section className="vt-top-comments">
          <h3>
            <FarmIcon name="award_star_gold_1" /> Beste reacties
          </h3>
          <ul className="vt-comment-list">{top.map(item)}</ul>
        </section>
      )}
      {items.length === 0 ? (
        !comments.isLoading && <p className="empty">Nog geen reacties. Wees de eerste!</p>
      ) : (
        <>
          {top.length > 0 && items.length > COMMENT_VOTES.top && <h3 className="vt-all-comments">Alle reacties</h3>}
          <ul className="vt-comment-list">{items.map(item)}</ul>
        </>
      )}
      {comments.hasNextPage && (
        <Button disabled={comments.isFetchingNextPage} onClick={() => comments.fetchNextPage()}>
          Meer reacties
        </Button>
      )}
    </VideoModule>
  )
}

function ShareBox({ video }: { video: VideoDetail }) {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}/video/kijk?v=${video.id}`
  return (
    <div className="vt-share">
      <label>
        <span>URL</span>
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link naar deze video" />
      </label>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
          } catch {
            prompt('Kopieer de link:', url)
          }
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        <FarmIcon name={copied ? 'accept' : 'link'} /> {copied ? 'Gekopieerd!' : 'Kopieer'}
      </Button>
      <div className="vt-share-friends">
        <span>Messenger</span>
        <ShareWithFriends path={`/video/kijk?v=${video.id}`} label="Deel met vrienden" />
      </div>
    </div>
  )
}

function Watch({ id }: { id: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: video, error, isLoading } = useVideo(id)
  const { data: related = [] } = useRelatedVideos(video?.status === 'klaar' ? id : '')
  const { data: fromUploader = [] } = useChannelVideos(video?.user.username ?? '')
  const [editing, setEditing] = useState(false)
  usePageTitle(video ? `${video.title} - Kuddes Video` : 'Kuddes Video')

  const patch = (changes: Partial<VideoDetail>) => queryClient.setQueryData<VideoDetail>(keys.video(id), (v) => v && { ...v, ...changes })
  const rate = useMutation({
    mutationFn: (stars: number) => api<{ rating: number; ratingCount: number; myRating: number }>(`/videos/${id}/rating`, { method: 'POST', body: { stars } }),
    onSuccess: patch,
  })
  const favorite = useMutation({
    mutationFn: (on: boolean) => api<{ favorited: boolean }>(`/videos/${id}/favorite`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: ({ favorited }) => patch({ favorited, favoriteCount: (video?.favoriteCount ?? 0) + (favorited ? 1 : -1) }),
  })
  const remove = useMutation({
    mutationFn: () => api<void>(`/videos/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.allVideos })
      navigate(`/video/kanaal/${user?.username ?? ''}`)
    },
  })

  if (isLoading) return <p className="muted">Laden…</p>
  if (!video) {
    return (
      <VideoModule title="Video niet gevonden">
        <p>{error instanceof ApiRequestError ? error.message : 'Deze video kon niet geladen worden.'}</p>
        <br />
        <Link to="/video">« Terug naar Kuddes Video</Link>
      </VideoModule>
    )
  }

  const others = fromUploader.filter((v) => v.id !== video.id && v.status === 'klaar').slice(0, 4)

  return (
    <>
      <h1 className="vt-watch-title">{video.title}</h1>
      <div className="vt-watch">
        <div className="vt-watch-main">
          {video.status === 'klaar' && video.fileUrl ? (
            <VideoPlayer
              key={video.id}
              src={video.fileUrl}
              poster={video.thumbUrl}
              title={video.title}
              codec={video.codec}
              onFirstPlay={() => void api(`/videos/${id}/view`, { method: 'POST' }).catch(() => undefined)}
            />
          ) : (
            <div className={`vt-placeholder ${video.status}`}>
              {video.status === 'mislukt' ? (
                <>
                  <FarmIcon name="warning" size={32} />
                  <b>Deze video kon niet verwerkt worden.</b>
                  <span>{video.error ?? 'Probeer het met een ander bestand.'}</span>
                </>
              ) : (
                <>
                  <span className="bv-spinner" />
                  <b>{video.status === 'uploaden' ? 'Wachten op het bestand…' : 'Je video wordt verwerkt…'}</b>
                  <span>Dit duurt meestal niet langer dan een paar minuten. Deze pagina ververst vanzelf.</span>
                </>
              )}
            </div>
          )}

          <div className="vt-watch-bar">
            <div className="vt-watch-rating">
              {user && !video.canEdit && video.status === 'klaar' ? (
                <>
                  <Stars value={video.myRating ?? video.rating} onRate={(s) => rate.mutate(s)} disabled={rate.isPending} />
                  <span className="muted">
                    {video.myRating ? `Jij gaf ${video.myRating} ${video.myRating === 1 ? 'ster' : 'sterren'} · ` : ''}
                    {video.ratingCount} {video.ratingCount === 1 ? 'beoordeling' : 'beoordelingen'}
                  </span>
                </>
              ) : (
                <>
                  <Stars value={video.rating} />
                  <span className="muted">
                    {video.ratingCount} {video.ratingCount === 1 ? 'beoordeling' : 'beoordelingen'}
                    {!user && (
                      <>
                        {' · '}
                        <Link to={`/inloggen?next=${encodeURIComponent(`/video/kijk?v=${video.id}`)}`}>Log in</Link> om te beoordelen
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
            <div className="vt-watch-views">
              <b>{video.views.toLocaleString('nl-NL')}</b> keer bekeken
            </div>
          </div>
          {rate.isError && <p className="form-error">{errorMessage(rate.error)}</p>}

          <div className="vt-actions">
            {user && (
              <Button onClick={() => favorite.mutate(!video.favorited)} disabled={favorite.isPending} aria-pressed={video.favorited}>
                <FarmIcon name={video.favorited ? 'heart_delete' : 'heart_add'} /> {video.favorited ? 'Uit favorieten' : 'Favoriet'}
              </Button>
            )}
            {video.canEdit && (
              <>
                <Link to="/gadgetmarkt?categorie=media" className="btn">
                  <FarmIcon name="plugin" /> Op je profiel
                </Link>
                <Button onClick={() => setEditing((e) => !e)}>
                  <FarmIcon name="film_edit" /> Bewerken
                </Button>
                <Button
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`"${video.title}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) remove.mutate()
                  }}
                >
                  <FarmIcon name="bin" /> Verwijderen
                </Button>
              </>
            )}
            {!video.canEdit && (
              <Link to={`/suggesties?soort=probleem`} className="btn">
                <FarmIcon name="flag_red" /> Melden
              </Link>
            )}
            <span className="vt-fav-count muted">
              <FarmIcon name="heart" /> {video.favoriteCount} keer als favoriet
            </span>
          </div>

          {editing && <EditVideo video={video} onDone={() => setEditing(false)} />}
          <Comments video={video} />
        </div>

        <aside className="vt-watch-side">
          <div className="vt-uploader">
            <div className="vt-uploader-head">
              <Avatar user={video.user} size="small" />
              <div>
                <Link to={`/video/kanaal/${video.user.username}`} className="vt-uploader-name">
                  {video.user.nickname}
                </Link>
                <span className="muted">{formatDate(video.createdAt)}</span>
              </div>
              <Link to={`/video/kanaal/${video.user.username}`} className="btn">
                Kanaal
              </Link>
            </div>
            {video.description ? (
              <MoreText text={video.description}>
                <RichText text={video.description} />
              </MoreText>
            ) : (
              <p className="muted">Geen beschrijving.</p>
            )}
            <dl className="vt-facts">
              <dt>Categorie:</dt>
              <dd>
                <CategoryLink category={video.category} />
              </dd>
              {video.tags.length > 0 && (
                <>
                  <dt>Tags:</dt>
                  <dd className="vt-tags">
                    {video.tags.map((t) => (
                      <Link key={t} to={`/video/zoeken?tag=${encodeURIComponent(t)}`}>
                        {t}
                      </Link>
                    ))}
                  </dd>
                </>
              )}
              {video.visibility !== 'openbaar' && (
                <>
                  <dt>Zichtbaar:</dt>
                  <dd>
                    <FarmIcon name={video.visibility === 'vrienden' ? 'group' : 'lock'} /> {VIDEO_VISIBILITY[video.visibility].label}
                  </dd>
                </>
              )}
            </dl>
            <ShareBox video={video} />
          </div>

          {others.length > 0 && (
            <VideoModule title={`Meer van ${video.user.nickname}`}>
              <ul className="vt-list">
                {others.map((v) => (
                  <VideoRow key={v.id} video={v} compact />
                ))}
              </ul>
            </VideoModule>
          )}
          <VideoModule title="Gerelateerde video's">
            {related.length === 0 ? (
              <p className="empty">Nog geen gerelateerde video's.</p>
            ) : (
              <ul className="vt-list">
                {related.map((v) => (
                  <VideoRow key={v.id} video={v} compact />
                ))}
              </ul>
            )}
          </VideoModule>
        </aside>
      </div>
    </>
  )
}

/** /video/kijk?v=… */
export function VideoWatchPage() {
  const [params] = useSearchParams()
  const id = params.get('v') ?? ''
  return (
    <VideoLayout>
      <Watch key={id} id={id} />
    </VideoLayout>
  )
}
