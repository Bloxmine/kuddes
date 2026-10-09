import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseTags, VIDEO_LIMITS, VIDEO_TYPES } from '../../../shared/videos'
import { RequireAuth } from '../../components/layout/RequireAuth'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { UploadAccessGate } from '../../features/video/UploadAccess'
import { VideoLayout, VideoModule } from '../../features/video/VideoLayout'
import { videoHref } from '../../features/video/videoLinks'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { usePageTitle } from '../../lib/usePageTitle'
import { VideoDetailsFields, type VideoDetailsForm } from './VideoWatchPage'

const MB = 1024 * 1024

/** The file goes up with XMLHttpRequest: fetch can't report upload progress. */
function putFile(url: string, file: File, onProgress: (ratio: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = 'Het uploaden is mislukt.'
      try {
        message = JSON.parse(xhr.responseText).error ?? message
      } catch {
        // not JSON
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('De verbinding viel weg tijdens het uploaden.'))
    xhr.onabort = () => reject(new DOMException('Geannuleerd', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
}

/** "mijn_vakantie-2009.MOV" -> "mijn vakantie 2009" */
const titleFromFile = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, VIDEO_LIMITS.title)

function Uploader() {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [form, setForm] = useState<VideoDetailsForm>({ title: '', description: '', tags: '', category: 'overig', visibility: 'openbaar' })
  const [phase, setPhase] = useState<'kiezen' | 'uploaden' | 'klaar'>('kiezen')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const fields = error instanceof ApiRequestError ? error.fields : {}

  const choose = (f: File | undefined) => {
    if (!f) return
    setFileError(null)
    if (f.type && !VIDEO_TYPES.includes(f.type)) return setFileError('Dit is geen videobestand dat we kunnen gebruiken. Kies een MP4, MOV, WebM of MKV.')
    if (f.size > VIDEO_LIMITS.bytes) return setFileError(`Deze video is te groot (${Math.round(f.size / MB)} MB). Het maximum is ${VIDEO_LIMITS.bytes / MB} MB.`)
    setFile(f)
    setForm((current) => (current.title ? current : { ...current, title: titleFromFile(f.name) }))
  }

  const upload = async () => {
    if (!file) return
    setError(null)
    setPhase('uploaden')
    setProgress(0)
    let id: string | null = null
    try {
      const created = await api<{ id: string }>('/videos', { method: 'POST', body: { ...form, tags: parseTags(form.tags) } })
      id = created.id
      setVideoId(id)
      abort.current = new AbortController()
      await putFile(`/api/videos/${id}/file`, file, setProgress, abort.current.signal)
      await queryClient.invalidateQueries({ queryKey: keys.allVideos })
      setPhase('klaar')
    } catch (e) {
      // Don't leave an empty video behind
      if (id) await api(`/videos/${id}`, { method: 'DELETE' }).catch(() => undefined)
      setVideoId(null)
      setPhase('kiezen')
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e as Error)
    }
  }

  if (phase === 'klaar' && videoId) {
    return (
      <VideoModule title="Uploaden gelukt!">
        <div className="vt-upload-done">
          <FarmIcon name="accept" size={32} />
          <div>
            <p>
              <b>{form.title}</b> is geüpload en wordt nu verwerkt. Dat duurt meestal een paar minuten; je hoeft niet te wachten.
            </p>
            <p className="vt-upload-links">
              <Link to={videoHref(videoId)} className="btn btn-cta">
                <FarmIcon name="control_play" /> Naar je video
              </Link>
              <Button
                onClick={() => {
                  setFile(null)
                  setForm({ title: '', description: '', tags: '', category: 'overig', visibility: 'openbaar' })
                  setPhase('kiezen')
                  setVideoId(null)
                }}
              >
                <FarmIcon name="film_add" /> Nog een video uploaden
              </Button>
            </p>
          </div>
        </div>
      </VideoModule>
    )
  }

  return (
    <div className="vt-cols">
      <VideoModule title="Video uploaden">
        {!file ? (
          <div
            className={dragging ? 'vt-drop dragging' : 'vt-drop'}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              choose(e.dataTransfer.files[0])
            }}
          >
            <FarmIcon name="film_add" size={32} />
            <b>Sleep je video hierheen</b>
            <span className="muted">of</span>
            <Button variant="cta" onClick={() => input.current?.click()}>
              Kies een video op je computer
            </Button>
            <input ref={input} type="file" hidden accept={VIDEO_TYPES.join(',')} onChange={(e) => choose(e.target.files?.[0])} />
            {fileError && <p className="form-error">{fileError}</p>}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void upload()
            }}
          >
            <div className="vt-file">
              <FarmIcon name="film" size={32} />
              <div>
                <b>{file.name}</b>
                <span className="muted">{(file.size / MB).toFixed(1)} MB</span>
              </div>
              {phase === 'kiezen' && (
                <button type="button" className="link-button" onClick={() => setFile(null)}>
                  Ander bestand
                </button>
              )}
            </div>
            {phase === 'uploaden' && (
              <div className="vt-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${progress * 100}%` }} />
                <b>{progress < 1 ? `Uploaden… ${Math.round(progress * 100)}%` : 'Afronden…'}</b>
              </div>
            )}
            <fieldset disabled={phase === 'uploaden'} className="vt-fieldset">
              <VideoDetailsFields form={form} onChange={setForm} fields={fields} />
            </fieldset>
            <div className="account-actions">
              {phase === 'uploaden' ? (
                <Button onClick={() => abort.current?.abort()}>Annuleren</Button>
              ) : (
                <Button variant="cta" type="submit" disabled={!form.title.trim()}>
                  <FarmIcon name="film_add" /> Uploaden
                </Button>
              )}
              {error && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(error)}</span>}
            </div>
          </form>
        )}
      </VideoModule>
      <aside>
        <VideoModule title="Goed om te weten">
          <ul className="vt-tips">
            <li>
              <FarmIcon name="film" /> MP4, MOV, WebM, MKV of AVI, tot {VIDEO_LIMITS.bytes / MB} MB
            </li>
            <li>
              <FarmIcon name="time" /> Maximaal 15 minuten; langere video's worden ingekort
            </li>
            <li>
              <FarmIcon name="diskette" /> We comprimeren je video (H.265, tot 720p), zodat hij snel laadt
            </li>
            <li>
              <FarmIcon name="lock" /> We halen locatie- en camera-informatie uit je video
            </li>
            <li>
              <FarmIcon name="group" /> Kies zelf wie hem mag zien: iedereen, alleen met de link, of alleen vrienden
            </li>
            <li>
              <FarmIcon name="warning" /> Upload alleen video's die van jou zijn of die je mag delen
            </li>
          </ul>
        </VideoModule>
      </aside>
    </div>
  )
}

export function VideoUploadPage() {
  usePageTitle('Video uploaden - Kuddes Video')
  return (
    <VideoLayout>
      <RequireAuth>
        {() => (
          <UploadAccessGate>
            <Uploader />
          </UploadAccessGate>
        )}
      </RequireAuth>
    </VideoLayout>
  )
}
