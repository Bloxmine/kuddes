import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ForumPost, ForumThreadPage as ThreadPage } from '../../../shared/api'
import { FORUM_LIMITS, FORUM_REACTIONS, parseForumTags, threadHref, type ForumReaction } from '../../../shared/forum'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { ForumBody } from '../../features/forum/ForumBody'
import { PollBox } from '../../components/social/PollBox'
import type { PollView } from '../../../shared/polls'
import { ForumEditor } from '../../features/forum/ForumEditor'
import { ForumLayout, Pagination, RoleBadge } from '../../features/forum/ForumLayout'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys, useForumThread, useModeratedSections } from '../../lib/queries'
import { Smiley } from '../../lib/smileys'
import { formatDate, formatTime } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'
import { ShareWithFriends } from '../../features/share/ShareWithFriends'
import { ReportButton } from '../../components/social/ReportButton'

/** The poll at the top of the thread. */
function ThreadPoll({ data }: { data: ThreadPage }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const id = data.thread.id
  const update = (poll: PollView) => queryClient.setQueriesData<ThreadPage>({ queryKey: [...keys.allForum, 'thread'] }, (page) => (page && page.thread.id === id ? { ...page, poll, canClosePoll: page.canClosePoll && !poll.closed } : page))
  const vote = useMutation({ mutationFn: (option: number) => api<PollView>(`/forum/threads/${id}/vote`, { method: 'POST', body: { option } }), onSuccess: update })
  const close = useMutation({ mutationFn: () => api<PollView>(`/forum/threads/${id}/poll/close`, { method: 'POST' }), onSuccess: update })
  if (!data.poll) return null
  return (
    <Box title="Poll" icon="chart_bar" className="fm-thread-poll">
      <PollBox
        poll={data.poll}
        canVote={data.canVote}
        canClose={data.canClosePoll}
        pending={vote.isPending || close.isPending}
        onVote={(o) => vote.mutate(o)}
        onClose={() => confirm('De poll sluiten? Daarna kan niemand meer stemmen.') && close.mutate()}
        cantVoteNote={
          !user ? (
            <>
              <Link to={`/inloggen?next=${encodeURIComponent(location.pathname)}`}>Log in</Link> om te stemmen.
            </>
          ) : data.thread.locked ? (
            'Dit onderwerp is gesloten.'
          ) : undefined
        }
      />
      {(vote.isError || close.isError) && <p className="form-error">{errorMessage(vote.error ?? close.error)}</p>}
    </Box>
  )
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.allForum })
}

function Reactions({ post, canReact }: { post: ForumPost; canReact: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const toggle = useMutation({
    mutationFn: (reaction: ForumReaction) => api<ForumPost['reactions']>(`/forum/posts/${post.id}/reactions`, { method: 'POST', body: { reaction } }),
    onSuccess: (reactions) => {
      // Update just this post in every cached page of the thread
      queryClient.setQueriesData<ThreadPage>({ queryKey: [...keys.allForum, 'thread'] }, (page) =>
        page && { ...page, posts: page.posts.map((p) => (p.id === post.id ? { ...p, reactions } : p)) },
      )
      setOpen(false)
    },
  })
  if (!post.reactions.length && !canReact) return null
  return (
    <div className="fm-reactions">
      {post.reactions.map((r) => (
        <button
          key={r.reaction}
          type="button"
          className={r.mine ? 'fm-reaction mine' : 'fm-reaction'}
          disabled={!canReact || toggle.isPending}
          title={`${FORUM_REACTIONS[r.reaction]}${r.mine ? ' (klik om weg te halen)' : ''}`}
          onClick={() => toggle.mutate(r.reaction)}
        >
          <Smiley name={r.reaction} /> {r.count}
        </button>
      ))}
      {canReact && (
        <span className="fm-reaction-add">
          <button type="button" className="fm-reaction" aria-expanded={open} title="Reageer met een smiley" onClick={() => setOpen((o) => !o)}>
            <FarmIcon name="add" />
          </button>
          {open && (
            <span className="fm-reaction-picker" role="menu">
              {(Object.keys(FORUM_REACTIONS) as ForumReaction[]).map((r) => (
                <button key={r} type="button" role="menuitem" title={FORUM_REACTIONS[r]} onClick={() => toggle.mutate(r)}>
                  <Smiley name={r} />
                  <span>{FORUM_REACTIONS[r]}</span>
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

function Post({ post, thread, canReact, onQuote }: { post: ForumPost; thread: ThreadPage['thread']; canReact: boolean; onQuote: (p: ForumPost) => void }) {
  const refresh = useRefresh()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [copied, setCopied] = useState(false)
  const save = useMutation({
    mutationFn: () => api<void>(`/forum/posts/${post.id}`, { method: 'PATCH', body: { body: draft } }),
    onSuccess: async () => {
      await refresh()
      setEditing(false)
    },
  })
  const remove = useMutation({ mutationFn: () => api<void>(`/forum/posts/${post.id}`, { method: 'DELETE' }), onSuccess: refresh })
  const a = post.author
  const permalink = `${threadHref(thread.section.slug, thread.id, thread.title)}?bericht=${post.id}`

  return (
    <article className={post.deleted ? 'fm-post deleted' : 'fm-post'} id={`bericht-${post.id}`}>
      <aside className="fm-postbit">
        {a ? (
          <>
            <Link to={`/forum/lid/${a.username}`} className="fm-postbit-name">
              {a.nickname}
            </Link>
            {(a.forumRole === 'admin' || a.moderatorHere) && <RoleBadge role={a.forumRole === 'admin' ? 'admin' : 'moderator'} />}
            {a.title && <span className="fm-postbit-title">{a.title}</span>}
            <Avatar user={a} size="medium" />
            <dl>
              <dt>Berichten:</dt>
              <dd>{a.postCount.toLocaleString('nl-NL')}</dd>
              <dt>Lid sinds:</dt>
              <dd>{formatDate(a.joinedAt)}</dd>
            </dl>
            <span className="fm-postbit-links">
              <Link to={`/profiel/${a.username}`} title="Kuddes-profiel">
                <FarmIcon name="user" />
              </Link>
              <Link to={`/berichten/nieuw?aan=${a.username}`} title="Stuur een bericht">
                <FarmIcon name="email" />
              </Link>
            </span>
          </>
        ) : (
          <span className="muted">Verwijderd lid</span>
        )}
      </aside>
      <div className="fm-post-main">
        <header className="fm-post-head">
          <span>
            <FarmIcon name="comment" /> {formatTime(post.createdAt)}
          </span>
          <button
            type="button"
            className="link-button"
            title="Link naar dit bericht kopiëren"
            onClick={async () => {
              await navigator.clipboard.writeText(location.origin + permalink).catch(() => prompt('Link naar dit bericht:', location.origin + permalink))
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Gekopieerd!' : `#${post.number}`}
          </button>
        </header>
        {post.deleted ? (
          <p className="fm-deleted muted">
            <FarmIcon name="bin" /> Dit bericht is verwijderd.
          </p>
        ) : editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate()
            }}
          >
            <ForumEditor value={draft} onChange={setDraft} rows={8} />
            <div className="account-actions">
              <Button variant="cta" type="submit" disabled={save.isPending || !draft.trim()}>
                Opslaan
              </Button>
              <Button
                onClick={() => {
                  setEditing(false)
                  setDraft(post.body)
                }}
              >
                Annuleren
              </Button>
              {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
            </div>
          </form>
        ) : (
          <>
            <ForumBody body={post.body} />
            {post.editedAt && (
              <p className="fm-edited muted">
                Laatst bewerkt{post.editedBy && post.editedBy !== a?.nickname ? ` door ${post.editedBy}` : ''} op {formatTime(post.editedAt)}
              </p>
            )}
          </>
        )}
        {!post.deleted && a?.signature && (
          <footer className="fm-signature">
            <ForumBody body={a.signature} signature />
          </footer>
        )}
        {!post.deleted && !editing && (
          <div className="fm-post-bar">
            <Reactions post={post} canReact={canReact} />
            <span className="fm-post-actions">
              {canReact && (
                <button type="button" className="btn" onClick={() => onQuote(post)}>
                  <FarmIcon name="comment" /> Citeren
                </button>
              )}
              {post.canEdit && (
                <button type="button" className="btn" onClick={() => setEditing(true)}>
                  <FarmIcon name="pencil" /> Bewerken
                </button>
              )}
              {!post.deleted && <ReportButton kind="forum" targetId={post.id} authorId={post.author?.id} look="button" />}
              {post.canDelete && post.number > 1 && (
                <button
                  type="button"
                  className="btn"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm('Dit bericht verwijderen?')) remove.mutate()
                  }}
                >
                  <FarmIcon name="bin" /> Verwijderen
                </button>
              )}
            </span>
          </div>
        )}
        {remove.isError && <p className="form-error">{errorMessage(remove.error)}</p>}
      </div>
    </article>
  )
}

/** Pin, lock, move and delete (moderators); title and tags (the starter too). */
function ThreadTools({ data, isStarter }: { data: ThreadPage; isStarter: boolean }) {
  const navigate = useNavigate()
  const refresh = useRefresh()
  const { thread } = data
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(thread.title)
  const [tags, setTags] = useState(thread.tags.join(', '))
  const { data: sections = [] } = useModeratedSections(data.canModerate)
  const change = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<void>(`/forum/threads/${thread.id}`, { method: 'PATCH', body }),
    onSuccess: async (_, body) => {
      await refresh()
      setEditing(false)
      if (typeof body.section === 'string') navigate(threadHref(body.section, thread.id, thread.title), { replace: true })
    },
  })
  const remove = useMutation({
    mutationFn: () => api<void>(`/forum/threads/${thread.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh()
      navigate(`/forum/${thread.section.slug}`)
    },
  })
  const canEditTitle = data.canModerate || (isStarter && !thread.locked)
  const canDelete = data.canModerate || (isStarter && thread.replies === 0)
  if (!canEditTitle && !canDelete) return null

  return (
    <div className="fm-tools">
      {editing ? (
        <form
          className="fm-tools-edit"
          onSubmit={(e) => {
            e.preventDefault()
            change.mutate({ title, tags: parseForumTags(tags) })
          }}
        >
          <input className="text-box" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={FORUM_LIMITS.title} aria-label="Titel" />
          <input className="text-box" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags" aria-label="Tags" />
          <Button type="submit" variant="cta" disabled={change.isPending}>
            Opslaan
          </Button>
          <Button onClick={() => setEditing(false)}>Annuleren</Button>
        </form>
      ) : (
        <>
          {data.canModerate && <span className="fm-tools-label">Moderator:</span>}
          {canEditTitle && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              <FarmIcon name="pencil" /> Titel & tags
            </button>
          )}
          {data.canModerate && (
            <>
              <button type="button" className="btn" disabled={change.isPending} onClick={() => change.mutate({ pinned: !thread.pinned })}>
                <FarmIcon name="star" /> {thread.pinned ? 'Losmaken' : 'Vastzetten'}
              </button>
              <button type="button" className="btn" disabled={change.isPending} onClick={() => change.mutate({ locked: !thread.locked })}>
                <FarmIcon name={thread.locked ? 'lock_open' : 'lock'} /> {thread.locked ? 'Heropenen' : 'Sluiten'}
              </button>
              {sections.length > 1 && (
                <select
                  className="text-box"
                  value=""
                  aria-label="Verplaatsen naar"
                  onChange={(e) => e.target.value && confirm('Onderwerp verplaatsen?') && change.mutate({ section: e.target.value })}
                >
                  <option value="">Verplaatsen naar…</option>
                  {sections
                    .filter((s) => s.slug !== thread.section.slug)
                    .map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                </select>
              )}
            </>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`"${thread.title}" met alle berichten verwijderen?`)) remove.mutate()
              }}
            >
              <FarmIcon name="bin" /> Onderwerp verwijderen
            </button>
          )}
        </>
      )}
      {(change.isError || remove.isError) && <span className="form-error">{errorMessage(change.error ?? remove.error)}</span>}
    </div>
  )
}

function Reply({ data, quote }: { data: ThreadPage; quote: { text: string; at: number } | null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const refresh = useRefresh()
  const [body, setBody] = useState('')
  const { thread } = data
  const post = useMutation({
    mutationFn: () => api<{ id: number; page: number }>(`/forum/threads/${thread.id}/posts`, { method: 'POST', body: { body } }),
    onSuccess: async ({ id }) => {
      setBody('')
      await refresh()
      navigate(`${threadHref(thread.section.slug, thread.id, thread.title)}?bericht=${id}`)
    },
  })
  if (!user) {
    return (
      <p className="fm-reply-login">
        <Link to={`/inloggen?next=${encodeURIComponent(location.pathname + location.search)}`}>Log in</Link> om mee te praten.
      </p>
    )
  }
  if (!data.canReply) {
    return (
      <p className="fm-reply-login muted">
        <FarmIcon name="lock" /> {thread.locked ? 'Dit onderwerp is gesloten.' : 'Je kunt hier niet reageren.'}
      </p>
    )
  }
  return (
    <Box title="Reageren" icon="comment" className="fm-reply">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim()) post.mutate()
        }}
      >
        <ForumEditor id="reactie" value={body} onChange={setBody} rows={6} append={quote} placeholder="Wat vind jij ervan?" />
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={post.isPending || !body.trim()}>
            <FarmIcon name="comment" /> Reactie plaatsen
          </Button>
          {post.isError && <span className="form-error">{errorMessage(post.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

/** /forum/:section/:id-slug */
export function ForumThreadPage() {
  const { thread: param = '' } = useParams()
  const id = parseInt(param) || 0
  const [params] = useSearchParams()
  const page = Number(params.get('pagina')) || 1
  const postId = Number(params.get('bericht')) || null
  const { user } = useAuth()
  const { data, error, isLoading } = useForumThread(id, page, postId)
  const [quote, setQuote] = useState<{ text: string; at: number } | null>(null)
  usePageTitle(data ? `${data.thread.title} - Kuddes Forum` : 'Kuddes Forum')

  // Jump to the post from ?bericht=…
  useEffect(() => {
    if (!postId || !data) return
    requestAnimationFrame(() => document.getElementById(`bericht-${postId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [postId, data])

  if (isLoading) return <ForumLayout>{<p className="muted">Laden…</p>}</ForumLayout>
  if (!data) {
    return (
      <ForumLayout crumbs={[{ label: 'Niet gevonden' }]}>
        <Box title="Onderwerp niet gevonden">
          <p>{error instanceof ApiRequestError ? error.message : 'Dit onderwerp kon niet geladen worden.'}</p>
        </Box>
      </ForumLayout>
    )
  }
  const { thread } = data
  const base = threadHref(thread.section.slug, thread.id, thread.title)
  const onQuote = (p: ForumPost) =>
    setQuote({
      text: `> **${p.author?.nickname ?? 'Iemand'} schreef:**\n${p.body
        .split('\n')
        .filter((l) => !l.startsWith('>'))
        .map((l) => `> ${l}`)
        .join('\n')}`,
      at: Date.now(),
    })

  return (
    <ForumLayout crumbs={[{ label: thread.section.name, to: `/forum/${thread.section.slug}` }, { label: thread.title }]}>
      <div className="fm-thread-head">
        <div className="fm-thread-share">
          <ShareWithFriends path={base} />
        </div>
        <h1>
          {thread.icon && <FarmIcon name={thread.icon as FarmIconName} size={24} />} {thread.pinned && <FarmIcon name="star" label="Vastgezet" />} {thread.locked && <FarmIcon name="lock" label="Gesloten" />} {thread.title}
        </h1>
        <p className="muted">
          {thread.replies} {thread.replies === 1 ? 'reactie' : 'reacties'} · {thread.views.toLocaleString('nl-NL')} keer bekeken · gestart{' '}
          {formatTime(thread.createdAt)}
          {thread.tags.length > 0 && (
            <span className="fm-tags">
              {thread.tags.map((t) => (
                <Link key={t} to={`/forum/tag/${encodeURIComponent(t)}`} className="fm-tag">
                  {t}
                </Link>
              ))}
            </span>
          )}
        </p>
        <ThreadTools data={data} isStarter={!!user && user.id === thread.starter?.id} />
      </div>
      <ThreadPoll data={data} />
      <Pagination page={data.page} pages={data.pages} href={(p) => (p > 1 ? `${base}?pagina=${p}` : base)} />
      <div className="fm-posts">
        {data.posts.map((p) => (
          <Post key={p.id} post={p} thread={thread} canReact={data.canReply} onQuote={onQuote} />
        ))}
      </div>
      <Pagination page={data.page} pages={data.pages} href={(p) => (p > 1 ? `${base}?pagina=${p}` : base)} />
      <Reply data={data} quote={quote} />
    </ForumLayout>
  )
}
