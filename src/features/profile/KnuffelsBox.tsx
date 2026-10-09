import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Knuffel, Profile } from '../../../shared/api'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys, useKnuffels } from '../../lib/queries'
import { SmileyPicker, TextPreview } from '../../components/social/SmileyPicker'
import { RichText } from '../../lib/richText'
import { hasMarkup, useTextEditing } from '../../lib/textEditing'
import { formatTime } from '../../lib/time'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Icon } from '../../components/ui/Icon'
import { Smiley } from '../../lib/smileys'
import '../../components/social/StatusComposer.css'
import type { Glitter } from '../../../shared/glitters'
import { GlitterPicker } from '../glitters/GlitterPicker'
import { GlitterImg } from '../glitters/GlitterImg'
import { BotBadge } from '../../components/ui/BotBadge'
import { ReportButton } from '../../components/social/ReportButton'

const MAX_LENGTH = 1000

type KnuffelsBoxProps = { profile: Profile }

/** The guestbook ("knuffels"). */
export function KnuffelsBox({ profile }: KnuffelsBoxProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useKnuffels(profile.username)
  const [text, setText] = useState('')
  const [previewClosed, setPreviewClosed] = useState(false)
  const [glitter, setGlitter] = useState<Glitter | null>(null)
  const [picking, setPicking] = useState(false)
  const [smileys, setSmileys] = useState(false)
  const { ref: textRef, wrap, addLink, insert, listKeys } = useTextEditing(text, setText, MAX_LENGTH)
  const showPreview = hasMarkup(text) && !previewClosed

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.knuffels(profile.username) }),
      queryClient.invalidateQueries({ queryKey: keys.stats }),
      queryClient.invalidateQueries({ queryKey: keys.home }),
    ])

  const post = useMutation({
    mutationFn: () => api<Knuffel>(`/users/${profile.username}/knuffels`, { method: 'POST', body: { text, glitterId: glitter?.id ?? null } }),
    onSuccess: async () => {
      setText('')
      setGlitter(null)
      setSmileys(false)
      await refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/knuffels/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })

  const knuffels = data?.pages.flatMap((p) => p.items) ?? []
  const isSelf = profile.relation?.isSelf

  return (
    <Box title="Knuffels" icon="pencil" className="knuffels">
      {user && !profile.canKnuffel ? (
        <p className="form-notice knuffel-login">
          <FarmIcon name="lock" /> Alleen vrienden van {profile.nickname} kunnen hier knuffelen.
        </p>
      ) : user ? (
        <form
          className="knuffel-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() || glitter) post.mutate()
          }}
        >
          <label htmlFor="knuffel-text" className="knuffel-label">
            {isSelf ? 'Laat een knuffel achter op je eigen profiel' : `Laat een knuffel achter bij ${profile.nickname}`}
          </label>
          {/* The same box as WieWatWaar and the Prikbord */}
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
              id="knuffel-text"
              ref={textRef}
              className="composer-text"
              rows={3}
              maxLength={MAX_LENGTH}
              value={text}
              onKeyDown={listKeys}
              placeholder={isSelf ? 'Schrijf iets op je eigen profiel…' : `Schrijf iets liefs voor ${profile.nickname}…`}
              onChange={(e) => {
                setText(e.target.value)
                setPreviewClosed(false)
              }}
            />
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
            <button type="button" className={glitter ? 'composer-icon current' : 'composer-icon'} title={glitter ? 'Ander glitterplaatje' : 'Glitterplaatje toevoegen'} onClick={() => setPicking(true)}>
              <FarmIcon name="rainbow" />
            </button>
            <span className="composer-send">
              <span className="composer-count" title={user.preferences.sendShortcut ? 'Ctrl+Enter verstuurt' : undefined}>
                {text.length}/{MAX_LENGTH}
              </span>
              <Button variant="cta" type="submit" disabled={(!text.trim() && !glitter) || post.isPending}>
                <FarmIcon name="pencil" /> Plaatsen
              </Button>
            </span>
          </div>
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
          {picking && (
            <GlitterPicker
              onClose={() => setPicking(false)}
              onPick={(g) => {
                setGlitter(g)
                setPicking(false)
              }}
            />
          )}
          {post.isError && <p className="form-error">{errorMessage(post.error)}</p>}
        </form>
      ) : (
        <p className="knuffel-login">
          <Link to={`/inloggen?next=/profiel/${profile.username}`}>Log in</Link> om te knuffelen. Nog geen lid?{' '}
          <Link to="/aanmelden">Meld je gratis aan!</Link>
        </p>
      )}

      {isLoading ? (
        <p className="muted">Knuffels laden…</p>
      ) : knuffels.length === 0 ? (
        <p className="empty">Nog geen knuffels. Wees de eerste!</p>
      ) : (
        <ul className="knuffel-list">
          {knuffels.map((knuffel) => {
            const canReply = !!user && knuffel.author.id !== user.id
            return (
              <li key={knuffel.id} className="knuffel">
                <Avatar user={knuffel.author} size="small" />
                <div className="knuffel-body">
                  <div className="knuffel-meta">
                    <Link to={`/profiel/${knuffel.author.username}`} className="buzz-name">
                      {knuffel.author.nickname}
                      <BotBadge user={knuffel.author} />
                    </Link>
                    <time className="date" dateTime={knuffel.createdAt}>
                      {formatTime(knuffel.createdAt)}
                    </time>
                  </div>
                  {knuffel.glitter && <GlitterImg glitter={knuffel.glitter} />}
                  {knuffel.text && (
                    <p>
                      <RichText text={knuffel.text} />
                    </p>
                  )}
                  <div className="knuffel-tls">
                    {canReply && <Link to={`/profiel/${knuffel.author.username}?tab=knuffels`}>Knuffel terug</Link>}
                    {canReply && knuffel.canDelete && ' · '}
                    <ReportButton kind="knuffel" targetId={knuffel.id} authorId={knuffel.author.id} look="link" />
                    {knuffel.canDelete && ' · '}
                    {knuffel.canDelete && (
                      <button
                        type="button"
                        className="link-button"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm('Deze knuffel verwijderen?')) remove.mutate(knuffel.id)
                        }}
                      >
                        Verwijderen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {hasNextPage && (
        <p className="profile-status-more">
          <Button disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? 'Laden…' : 'Meer knuffels bekijken'}
          </Button>
        </p>
      )}
    </Box>
  )
}
