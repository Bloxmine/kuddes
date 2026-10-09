import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import { PollBox } from './PollBox'
import type { Device, Status, StatusCore } from '../../../shared/api'
import { MOODS } from '../../../shared/moods'
import type { FarmIconName } from '../ui/farmIcons'
import './BuzzItem.css'
import { RichText } from '../../lib/richText'
import { Smiley } from '../../lib/smileys'
import { FarmIcon } from '../ui/FarmIcon'
import { PhotoViewer } from '../ui/PhotoViewer'
import { GlitterImg } from '../../features/glitters/GlitterImg'

const DEVICE_LABEL: Record<Device, string> = {
  iphone: 'geplaatst via een iPhone',
  android: 'geplaatst via Android',
  blackberry: 'Gepost met BlackBerry',
  mobiel: 'geplaatst via mobiel',
}

/** The content of a WieWatWaar: text, place, device, mood, photos and glitterplaatje. */
export function StatusBody({ status }: { status: StatusCore }) {
  const mood = status.mood ? MOODS[status.mood] : null
  // The photo shown big over the page (index into status.photos)
  const [viewing, setViewing] = useState<number | null>(null)
  const shown = viewing !== null ? status.photos[viewing] : null
  return (
    <>
      <p className="buzz-content">
        {status.icon && <FarmIcon name={status.icon as FarmIconName} size={24} className="buzz-icon" label={status.icon.replace(/_/g, ' ')} />}
        <RichText text={status.text} />
        {status.where && <span className="buzz-where"> @ {status.where}</span>}
        {status.device && (
          <span className="buzz-device" title={DEVICE_LABEL[status.device]} aria-label={DEVICE_LABEL[status.device]}>
            <FarmIcon name={status.device === 'blackberry' ? 'keyboard' : 'iphone'} />
          </span>
        )}
      </p>
      {mood && (
        <span className="mood-badge">
          Gevoel: {mood.label} <Smiley name={mood.smiley} />
        </span>
      )}
      {status.photos.length > 0 && (
        // One is shown whole, more in a grid; a click shows them big right here, over the page
        <div className={status.photos.length > 1 ? `buzz-photos n${status.photos.length}` : undefined}>
          {status.photos.map((p, i) => (
            <button key={`${p.kudde ? 'k' : 'e'}${p.id}`} type="button" className="buzz-photo" title="Groter bekijken" onClick={() => setViewing(i)}>
              <img src={p.url} width={p.width} height={p.height} alt={p.alt || `Foto ${i + 1} bij WieWatWaar`} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {shown && (
        <PhotoViewer
          photos={status.photos.map((p, i) => ({ id: `${p.kudde ? 'k' : 'e'}${p.id}`, url: p.url, width: p.width, height: p.height, caption: p.alt || `Foto ${i + 1} bij de WieWatWaar van ${status.kudde?.name ?? status.user.nickname}` }))}
          index={viewing!}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          info={
            <span className="lbx-caption">
              {status.user.nickname} ·{' '}
              {shown.external ? (
                shown.href && (
                  <a href={shown.href} target="_blank" rel="noopener noreferrer nofollow">
                    Bekijk het bericht op {new URL(shown.href).host}
                  </a>
                )
              ) : (
                <Link to={shown.href}>{shown.kudde ? `In de Kudde ${shown.kudde.name}` : 'In de Foto’s van ' + status.user.nickname}</Link>
              )}
            </span>
          }
        />
      )}
      {status.glitter && <GlitterImg glitter={status.glitter} />}
      {status.poll && <StatusPoll status={status} />}
    </>
  )
}

/** The poll under a WieWatWaar: vote right here; the lists refresh afterwards. */
function StatusPoll({ status }: { status: StatusCore }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [poll, setPoll] = useState(status.poll!)
  const act = useMutation({
    mutationFn: (req: { path: string; body?: unknown }) => api<Status>(req.path, { method: 'POST', body: req.body }),
    onSuccess: (updated) => {
      if (updated.poll) setPoll(updated.poll)
      queryClient.invalidateQueries({ queryKey: keys.allTimeline })
      queryClient.invalidateQueries({ queryKey: keys.allStatuses })
    },
  })
  return (
    <>
      <PollBox
        className="buzz-poll"
        poll={poll}
        canVote={!!user}
        canClose={status.canDelete}
        pending={act.isPending}
        onVote={(option) => act.mutate({ path: `/statuses/${status.id}/vote`, body: { option } })}
        onClose={() => act.mutate({ path: `/statuses/${status.id}/close` })}
        cantVoteNote={<Link to="/inloggen">log in om te stemmen</Link>}
      />
      {act.isError && <p className="form-error">{errorMessage(act.error)}</p>}
    </>
  )
}
