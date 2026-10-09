import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { VideoSummary } from '../../../shared/api'
import { VIDEO_LIMITS, formatDuration } from '../../../shared/videos'
import { Avatar } from '../../components/ui/Avatar'
import { BannerUploadDialog } from '../../components/ui/BannerUploadDialog'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { MoreText, VideoLayout, VideoModule } from '../../features/video/VideoLayout'
import { Stars, VideoTile } from '../../features/video/VideoParts'
import { VideoPlayer } from '../../features/video/VideoPlayer'
import { videoHref, viewsLabel } from '../../features/video/videoLinks'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys, useChannelOwner, useChannelVideos, useVideo } from '../../lib/queries'
import { RichText } from '../../lib/richText'
import { formatDate, formatTime } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'

/**
 * /video/kanaal/:username, like a YouTube channel from back then: the banner,
 * a big player with the featured video (or the newest), the channel's info
 * next to it with the uploads to pick from (they play right there), and all
 * videos and favourites below. No channel comments; a description instead.
 */
export function VideoChannelPage() {
  const { username = '' } = useParams()
  const name = username.toLowerCase()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'favorieten' ? 'favorieten' : 'uploads'
  const { user } = useAuth()
  const { data: owner, error } = useChannelOwner(name)
  const profile = owner?.user
  const { data: uploads = [] } = useChannelVideos(name)
  const { data: favorites = [], isLoading } = useChannelVideos(name, tab === 'favorieten' ? 'favorieten' : 'uploads')
  const list = tab === 'favorieten' ? favorites : uploads
  const isSelf = user?.username === name
  const [dialog, setDialog] = useState<'banner' | 'kanaal' | null>(null)
  const queryClient = useQueryClient()
  const ready = uploads.filter((v) => v.status === 'klaar')
  const totalViews = ready.reduce((sum, v) => sum + v.views, 0)
  // What plays in the big player: picked from the list, else the featured one, else the newest
  const [picked, setPicked] = useState<string | null>(null)
  const playing = picked ?? owner?.featured ?? ready[0]?.id ?? null
  usePageTitle(`${profile?.nickname ?? username} - Kuddes Video`)
  const refresh = () => queryClient.invalidateQueries({ queryKey: [...keys.allVideos, 'kanaal', name] })

  if (error instanceof ApiRequestError && error.status === 404) {
    return (
      <VideoLayout>
        <Box title="Kanaal niet gevonden">
          <p>Er is geen lid met de naam {username}.</p>
        </Box>
      </VideoLayout>
    )
  }

  return (
    <VideoLayout>
      {(owner?.bannerUrl || isSelf) && (
        <div
          className={owner?.bannerUrl ? 'vt-channel-banner' : 'vt-channel-banner empty'}
          style={owner?.bannerUrl ? { backgroundImage: `url(${owner.bannerUrl})`, backgroundPositionY: `${owner.bannerY}%` } : undefined}
        >
          {isSelf && (
            <button type="button" className="vt-banner-edit" onClick={() => setDialog('banner')}>
              <FarmIcon name="picture_sunset" /> {owner?.bannerUrl ? 'Banner wijzigen' : 'Kies een bannerafbeelding'}
            </button>
          )}
        </div>
      )}
      <div className={owner?.bannerUrl || isSelf ? 'vt-channel-head with-banner' : 'vt-channel-head'}>
        {profile && <Avatar user={profile} size="medium" static />}
        <div>
          <h1>{profile?.nickname ?? username}</h1>
          <p className="muted">
            {ready.length} {ready.length === 1 ? 'video' : "video's"} · {totalViews.toLocaleString('nl-NL')} keer bekeken
          </p>
        </div>
        <div className="vt-channel-actions">
          <Link to={`/profiel/${name}`} className="btn">
            <FarmIcon name="user" /> Kuddes-profiel
          </Link>
          {isSelf && (
            <>
              <Button onClick={() => setDialog('kanaal')}>
                <FarmIcon name="pencil" /> Kanaal bewerken
              </Button>
              <Link to="/video/uploaden" className="btn btn-cta">
                <FarmIcon name="film_add" /> Uploaden
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="vt-channel-top">
        <Featured id={playing} isFeatured={!picked && !!owner?.featured} isSelf={isSelf} onEdit={() => setDialog('kanaal')} />

        <aside className="vt-channel-side">
          <VideoModule title="Over dit kanaal" className="vt-channel-info">
            {owner?.description ? (
              <MoreText text={owner.description} lines={5}>
                <RichText text={owner.description} />
              </MoreText>
            ) : (
              <p className="empty">
                {isSelf ? (
                  <>
                    Vertel kijkers waar je kanaal over gaat.{' '}
                    <button type="button" className="link-button" onClick={() => setDialog('kanaal')}>
                      Beschrijving toevoegen
                    </button>
                  </>
                ) : (
                  'Nog geen beschrijving.'
                )}
              </p>
            )}
            <dl className="vt-channel-stats">
              <div>
                <dt>Video's</dt>
                <dd>{ready.length}</dd>
              </div>
              <div>
                <dt>Keer bekeken</dt>
                <dd>{totalViews.toLocaleString('nl-NL')}</dd>
              </div>
              {owner && (
                <div>
                  <dt>Lid sinds</dt>
                  <dd>{formatDate(owner.createdAt)}</dd>
                </div>
              )}
            </dl>
          </VideoModule>

          {ready.length > 1 && (
            <VideoModule title={`Uploads (${ready.length})`} className="vt-channel-uploads">
              <ol className="vt-channel-list">
                {ready.map((v) => (
                  <li key={v.id} className={v.id === playing ? 'current' : undefined}>
                    <button type="button" onClick={() => setPicked(v.id)} title={`${v.title} hier afspelen`}>
                      <span className="vt-thumb vt-thumb-small">
                        {v.thumbUrl ? <img src={v.thumbUrl} alt="" loading="lazy" /> : <span className="vt-thumb-empty" />}
                        <span className="vt-duration">{formatDuration(v.duration)}</span>
                      </span>
                      <span className="vt-channel-list-text">
                        <b>{v.title}</b>
                        <small className="muted">{viewsLabel(v.views)}</small>
                        <small className="muted">{formatTime(v.createdAt)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </VideoModule>
          )}
        </aside>
      </div>

      <VideoModule
        title={tab === 'favorieten' ? 'Favorieten' : isSelf ? "Mijn video's" : "Alle video's"}
        actions={
          <span className="vt-sorts">
            {tab === 'uploads' ? <b>Video's</b> : <button type="button" className="link-button" onClick={() => setParams({}, { replace: true })}>Video's</button>}
            {' | '}
            {tab === 'favorieten' ? (
              <b>Favorieten</b>
            ) : (
              <button type="button" className="link-button" onClick={() => setParams({ tab: 'favorieten' }, { replace: true })}>
                Favorieten
              </button>
            )}
          </span>
        }
      >
        {isLoading ? (
          <p className="muted">Laden…</p>
        ) : list.length === 0 ? (
          <p className="empty">
            {tab === 'favorieten' ? (
              'Nog geen favorieten.'
            ) : isSelf ? (
              <>
                Je hebt nog geen video's. <Link to="/video/uploaden">Upload je eerste!</Link>
              </>
            ) : (
              "Nog geen video's."
            )}
          </p>
        ) : (
          <ul className="vt-grid vt-grid-wide">
            {list.map((v) => (
              <VideoTile key={v.id} video={v} showUser={tab === 'favorieten'} />
            ))}
          </ul>
        )}
        {isSelf && tab === 'uploads' && (
          <p className="muted vt-channel-note">
            <FarmIcon name="information" /> Alleen jij ziet hier je verborgen video's en video's die nog verwerkt worden.
          </p>
        )}
      </VideoModule>

      {dialog === 'banner' && owner && (
        <BannerUploadDialog endpoint="/me/channel-banner" currentUrl={owner.bannerUrl} currentY={owner.bannerY} onDone={() => void refresh()} onClose={() => setDialog(null)} />
      )}
      {dialog === 'kanaal' && owner && (
        <ChannelDialog
          description={owner.description}
          featured={owner.featured}
          videos={ready.filter((v) => v.visibility === 'openbaar')}
          onDone={() => {
            setPicked(null)
            void refresh()
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </VideoLayout>
  )
}

/** The big player at the top, with the video's title, numbers and the start of its description. */
function Featured({ id, isFeatured, isSelf, onEdit }: { id: string | null; isFeatured: boolean; isSelf: boolean; onEdit: () => void }) {
  const { data: video } = useVideo(id ?? '')
  if (!id)
    return (
      <section className="vt-channel-featured empty">
        <FarmIcon name="television" size={48} />
        <p className="muted">{isSelf ? 'Upload een video, dan staat hij hier groot.' : 'Dit kanaal heeft nog geen video’s.'}</p>
        {isSelf && (
          <Link to="/video/uploaden" className="btn btn-cta">
            <FarmIcon name="film_add" /> Uploaden
          </Link>
        )}
      </section>
    )
  return (
    <section className="vt-channel-featured">
      {video?.fileUrl ? (
        <VideoPlayer
          key={video.id}
          src={video.fileUrl}
          poster={video.thumbUrl}
          title={video.title}
          codec={video.codec}
          onFirstPlay={() => void api(`/videos/${video.id}/view`, { method: 'POST' }).catch(() => undefined)}
        />
      ) : (
        <div className="vt-channel-featured-wait">
          <span className="bv-spinner" />
        </div>
      )}
      {video && (
        <div className="vt-channel-featured-info">
          <div className="vt-channel-featured-head">
            <h2>
              <Link to={videoHref(video.id)}>{video.title}</Link>
            </h2>
            {isFeatured && <span className="vt-featured-badge">Uitgelicht</span>}
          </div>
          <p className="muted">
            {viewsLabel(video.views)} · {formatDate(video.createdAt)} · <Stars value={video.rating} size="small" /> {video.ratingCount > 0 && `(${video.ratingCount})`}
          </p>
          {video.snippet && <p className="vt-channel-featured-text">{video.snippet}</p>}
          <p className="vt-channel-featured-links">
            <Link to={videoHref(video.id)}>
              <FarmIcon name="comments" /> Bekijk met reacties »
            </Link>
            {isSelf && (
              <button type="button" className="link-button" onClick={onEdit}>
                <FarmIcon name="star" /> Andere video uitlichten
              </button>
            )}
          </p>
        </div>
      )}
    </section>
  )
}

/** The channel's description, and which video stands at the top. */
function ChannelDialog({ description, featured, videos, onDone, onClose }: { description: string; featured: string | null; videos: VideoSummary[]; onDone: () => void; onClose: () => void }) {
  const [text, setText] = useState(description)
  const [pick, setPick] = useState(featured ?? '')
  const save = useMutation({
    mutationFn: () => api<void>('/me/channel', { method: 'PUT', body: { description: text, featured: pick || null } }),
    onSuccess: () => {
      onDone()
      onClose()
    },
  })
  return (
    <Modal title="Kanaal bewerken" icon="television" onClose={onClose}>
      <form
        className="vt-channel-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Over dit kanaal" hint="(wat je maakt, hoe vaak, wie je bent)">
          <textarea className="text-box" rows={6} value={text} maxLength={VIDEO_LIMITS.channelDescription} onChange={(e) => setText(e.target.value)} placeholder="Welkom op mijn kanaal! Hier vind je…" />
        </Field>
        <Field label="Uitgelichte video" hint="(staat groot bovenaan)">
          <select className="text-box" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Steeds de nieuwste</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={save.isPending}>
            <FarmIcon name="diskette" /> Opslaan
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
          {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}
