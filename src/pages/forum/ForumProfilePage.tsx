import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { FORUM_LIMITS, threadHref } from '../../../shared/forum'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { ForumBody } from '../../features/forum/ForumBody'
import { ForumEditor } from '../../features/forum/ForumEditor'
import { ForumLayout, RoleBadge, ThreadTable } from '../../features/forum/ForumLayout'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys, useForumProfile, useForumProfileComments } from '../../lib/queries'
import { RichText } from '../../lib/richText'
import { withSmileys } from '../../lib/smileys'
import { formatDate, formatTime } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'

/** A picture for the signature; the server keeps GIFs moving and fits it in 900×300. */
async function uploadSignatureImage(file: File) {
  const form = new FormData()
  form.set('file', file)
  return (await api<{ url: string }>('/forum/me/signature-images', { method: 'POST', form })).url
}

function EditForumProfile({ title: initialTitle, signature: initialSignature, onDone }: { title: string; signature: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(initialTitle)
  const [signature, setSignature] = useState(initialSignature)
  const save = useMutation({
    mutationFn: () => api<void>('/forum/me', { method: 'PATCH', body: { title, signature } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.allForum })
      onDone()
    },
  })
  return (
    <form
      className="fm-profile-edit"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Field label="Titel onder je naam" hint={`(max. ${FORUM_LIMITS.forumTitle} tekens, bijv. "Forumkoning")`}>
        <input className="text-box" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={FORUM_LIMITS.forumTitle} />
      </Field>
      {/* Not a <label>: a click in the editor's empty space would press its first button */}
      <div className="field">
        <span>
          Handtekening <span className="hint">(staat onder al je berichten: opmaak, smileys, en plaatjes zoals een userbar of banner)</span>
        </span>
        <ForumEditor value={signature} onChange={setSignature} rows={4} maxLength={FORUM_LIMITS.signature} placeholder="Wat moet er onder je berichten staan?" signature={{ upload: uploadSignatureImage }} />
      </div>
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={save.isPending}>
          Opslaan
        </Button>
        <Button onClick={onDone}>Annuleren</Button>
        {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
      </div>
    </form>
  )
}

function Discussion({ username, nickname }: { username: string; nickname: string }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const comments = useForumProfileComments(username)
  const items = comments.data?.pages.flatMap((p) => p.items) ?? []
  const post = useMutation({
    mutationFn: () => api(`/forum/users/${username}/comments`, { method: 'POST', body: { text } }),
    onSuccess: async () => {
      setText('')
      await comments.refetch()
    },
  })
  const remove = useMutation({ mutationFn: (id: number) => api<void>(`/forum/profile-comments/${id}`, { method: 'DELETE' }), onSuccess: () => comments.refetch() })

  return (
    <Box title="Discussie" icon="comment" className="fm-discussion">
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
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={FORUM_LIMITS.comment}
            placeholder={user.username === username ? 'Zeg iets tegen je bezoekers…' : `Zeg iets tegen ${nickname}…`}
            aria-label="Bericht"
          />
          <div className="vt-comment-bar">
            <span className="muted">{FORUM_LIMITS.comment - text.length} tekens over</span>
            <Button type="submit" disabled={!text.trim() || post.isPending}>
              <FarmIcon name="comment" /> Reactie plaatsen
            </Button>
          </div>
          {post.isError && <p className="form-error">{errorMessage(post.error)}</p>}
        </form>
      ) : (
        <p className="muted">
          <Link to={`/inloggen?next=/forum/lid/${username}`}>Log in</Link> om mee te praten.
        </p>
      )}
      {items.length === 0 ? (
        !comments.isLoading && <p className="empty">Nog niets gezegd.</p>
      ) : (
        <ul className="vt-comment-list">
          {items.map((c) => (
            <li key={c.id}>
              <Avatar user={c.author} size="small" />
              <div>
                <p className="vt-comment-meta">
                  <Link to={`/forum/lid/${c.author.username}`}>{c.author.nickname}</Link> <span className="muted">({formatTime(c.createdAt)})</span>
                  {c.canDelete && (
                    <button type="button" className="icon-button" title="Verwijderen" aria-label="Bericht verwijderen" onClick={() => confirm('Dit bericht verwijderen?') && remove.mutate(c.id)}>
                      <FarmIcon name="bin" />
                    </button>
                  )}
                </p>
                <p className="vt-comment-text">
                  <RichText text={c.text} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {comments.hasNextPage && <Button onClick={() => comments.fetchNextPage()}>Oudere berichten</Button>}
    </Box>
  )
}

/** /forum/lid/:username: the forum side of a Kuddes account. */
export function ForumProfilePage() {
  const { username = '' } = useParams()
  const { user, isLoading } = useAuth()
  // "/forum/lid/@me" (from the menu) is your own forum profile
  if (username === '@me') {
    if (isLoading) return null
    return <Navigate to={user ? `/forum/lid/${user.username}` : '/inloggen?next=%2Fforum%2Flid%2F%40me'} replace />
  }
  return <ForumProfileView key={username} username={username} />
}

function ForumProfileView({ username }: { username: string }) {
  const name = username.toLowerCase()
  const { data: p, error, isLoading } = useForumProfile(name)
  const [editing, setEditing] = useState(false)
  usePageTitle(`${p?.user.nickname ?? username} - Kuddes Forum`)

  if (isLoading) return <ForumLayout>{<p className="muted">Laden…</p>}</ForumLayout>
  if (!p) {
    return (
      <ForumLayout crumbs={[{ label: 'Leden' }]}>
        <Box title="Lid niet gevonden">
          <p>{error instanceof ApiRequestError ? error.message : 'Dit profiel kon niet geladen worden.'}</p>
        </Box>
      </ForumLayout>
    )
  }

  return (
    <ForumLayout crumbs={[{ label: 'Leden' }, { label: p.user.nickname }]}>
      <div className="fm-profile">
        <aside className="fm-profile-card">
          <Avatar user={p.user} size="large" static />
          <h1>{p.user.nickname}</h1>
          {p.forumRole && <RoleBadge role={p.forumRole} />}
          {p.title && <p className="fm-postbit-title">{p.title}</p>}
          {p.banned && (
            <p className="form-error">
              <FarmIcon name="lock" /> Verbannen
            </p>
          )}
          <dl className="fm-profile-stats">
            <dt>Berichten</dt>
            <dd>{p.postCount.toLocaleString('nl-NL')}</dd>
            <dt>Onderwerpen</dt>
            <dd>{p.threadCount.toLocaleString('nl-NL')}</dd>
            <dt>Reacties ontvangen</dt>
            <dd>{p.reactionsReceived.toLocaleString('nl-NL')}</dd>
            <dt>Eerste bericht</dt>
            <dd>{p.firstPostAt ? formatDate(p.firstPostAt) : '—'}</dd>
            <dt>Laatst actief</dt>
            <dd>{p.lastPostAt ? formatTime(p.lastPostAt) : '—'}</dd>
          </dl>
          {p.moderates.length > 0 && (
            <p className="fm-profile-mods">
              Moderator van:{' '}
              {p.moderates.map((s, i) => (
                <span key={s.slug}>
                  {i > 0 && ', '}
                  <Link to={`/forum/${s.slug}`}>{s.name}</Link>
                </span>
              ))}
            </p>
          )}
          <div className="fm-profile-links">
            <Link to={`/profiel/${p.user.username}`} className="btn" title={`Het Kuddes-profiel van ${p.user.nickname}`}>
              <FarmIcon name="user" /> Profiel
            </Link>
            <Link to={`/video/kanaal/${p.user.username}`} className="btn">
              <FarmIcon name="television" /> Video's
            </Link>
            {!p.isSelf && (
              <Link to={`/berichten/nieuw?aan=${p.user.username}`} className="btn">
                <FarmIcon name="email" /> Bericht
              </Link>
            )}
            {p.isSelf && (
              <Button className="fm-profile-edit" onClick={() => setEditing(true)} disabled={editing}>
                <FarmIcon name="pencil" /> Forumprofiel bewerken
              </Button>
            )}
          </div>
        </aside>
        <div>
          {editing && (
            <Box title="Forumprofiel bewerken" icon="pencil">
              <EditForumProfile title={p.title} signature={p.signature} onDone={() => setEditing(false)} />
            </Box>
          )}
          {p.signature && !editing && (
            <Box title="Handtekening" icon="pencil">
              <div className="fm-signature">
                <ForumBody body={p.signature} signature />
              </div>
            </Box>
          )}
          <section className="fm-block">
            <h2>
              <FarmIcon name="comment" /> Nieuwste berichten
            </h2>
            {p.recentPosts.length === 0 ? (
              <p className="empty fm-empty">Nog niets gepost.</p>
            ) : (
              <ul className="fm-recent-posts">
                {p.recentPosts.map((r) => (
                  <li key={r.id}>
                    <Link to={`${threadHref(r.section, r.threadId, r.threadTitle)}?bericht=${r.id}`}>{r.threadTitle}</Link>
                    <span className="muted"> · {formatTime(r.createdAt)}</span>
                    {r.excerpt && <p>{withSmileys(r.excerpt)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="fm-block">
            <h2>
              <FarmIcon name="newspaper" /> Gestarte onderwerpen
            </h2>
            <ThreadTable threads={p.recentThreads} showSection empty="Nog geen onderwerpen gestart." />
            {p.threadCount > p.recentThreads.length && (
              <p className="fm-more">
                <Link to={`/forum/zoeken?lid=${p.user.username}`}>Alle onderwerpen van {p.user.nickname} »</Link>
              </p>
            )}
          </section>
          <Discussion username={p.user.username} nickname={p.user.nickname} />
        </div>
      </div>
    </ForumLayout>
  )
}
