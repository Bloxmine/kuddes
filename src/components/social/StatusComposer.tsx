import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { LinkPicker } from './LinkPicker'
import { STATUS_MAX_LENGTH, STATUS_MAX_PHOTOS, type Status, type Visibility } from '../../../shared/api'
import { MOODS } from '../../../shared/moods'
import { IconPicker } from '../ui/IconPicker'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys, useOwnedKuddes } from '../../lib/queries'
import { seededGradient } from '../../lib/placeholder'
import type { OwnedKudde } from '../../../shared/kuddeGadgets'
import { Smiley } from '../../lib/smileys'
import { hasMarkup, useTextEditing } from '../../lib/textEditing'
import { SmileyPicker, TextPreview } from './SmileyPicker'
import { PollEditor } from './PollBox'
import { PostPhotoPicker, type PickedPhoto } from './PostPhotoPicker'
import { POLL_LIMITS } from '../../../shared/polls'
import type { Glitter } from '../../../shared/glitters'
import { GlitterImg } from '../../features/glitters/GlitterImg'
import { GlitterPicker } from '../../features/glitters/GlitterPicker'
import { GlitterUpload } from '../../features/glitters/GlitterUpload'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Dropdown } from '../ui/Dropdown'
import { Icon } from '../ui/Icon'
import { FarmIcon } from '../ui/FarmIcon'
import type { FarmIconName } from '../ui/farmIcons'
import './StatusComposer.css'

const MAX = STATUS_MAX_LENGTH

/** Something to start from in the empty field, a different one each time the composer opens. */
const PROMPTS = [
  (name: string) => `Wat is er, ${name}?`,
  () => 'Hoe was je dag?',
  () => 'Waar ben je nu?',
  () => 'Wat maakte je vandaag aan het lachen?',
  () => 'Waar luister je nu naar?',
  () => 'Wat eet je vanavond?',
  () => 'Waar kijk je naar uit?',
  () => 'Welke serie of film kijk je op dit moment?',
  () => 'Wat zijn je plannen voor het weekend?',
  () => 'Wat heb je vandaag geleerd of ontdekt?',
  () => 'Waar ben je blij mee?',
]

/**
 * A link to a picture on a glitter site: it would only show as a link, so the
 * composer suggests placing it as a glitterplaatje (and swaps the link for it).
 * Also the [tekst](…) form the link button makes.
 */
const GLITTER_SITE_LINK = /(?:\[[^\]\n]{1,100}\]\()?https?:\/\/(?:[\w-]+\.)*(?:picmix|gigaglitters)\.com\/[^\s)\]]*\)?/i

const VISIBILITY: Record<Visibility, { icon: FarmIconName; label: string; hint: string }> = {
  iedereen: { icon: 'world', label: 'Iedereen', hint: 'Iedereen op Kuddes kan dit zien' },
  vrienden: { icon: 'group', label: 'Vrienden', hint: 'Alleen je vrienden kunnen dit zien' },
}

/** The Kudde's picture where your profile photo would be. */
function KuddePic({ kudde }: { kudde: OwnedKudde }) {
  return kudde.imageUrl ? (
    <img className="composer-kudde-pic" src={kudde.imageUrl} alt="" />
  ) : (
    <span className="composer-kudde-pic" style={{ background: seededGradient(kudde.name) }} aria-hidden="true" />
  )
}

/** The WieWatWaar composer: post a status with formatting, photos or a glitterplaatje, a mood and who can see it. */
export function StatusComposer({ compact }: { compact?: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)])
  const [where, setWhere] = useState('')
  const [mood, setMood] = useState<string | null>(null)
  const [icon, setIcon] = useState<string | null>(null)
  const [chosenVisibility, setVisibility] = useState<Visibility>(user?.preferences.defaultVisibility ?? 'iedereen')
  // An owner can post as one of their Kuddes; that's always for everyone
  const ownedKuddes = (useOwnedKuddes(!!user).data ?? []).filter((k) => k.rights.includes('namens'))
  const [asKudde, setAsKudde] = useState<OwnedKudde | null>(null)
  const visibility: Visibility = asKudde ? 'iedereen' : chosenVisibility
  // Up to STATUS_MAX_PHOTOS photos from the member's own Foto's box (or uploaded into it) or an open Kudde's
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const photoKey = (p: PickedPhoto) => `${p.kind}:${p.photo.id}`
  const togglePhoto = (p: PickedPhoto) =>
    setPhotos((list) => (list.some((q) => photoKey(q) === photoKey(p)) ? list.filter((q) => photoKey(q) !== photoKey(p)) : list.length < STATUS_MAX_PHOTOS ? [...list, p] : list))
  const [photosOpen, setPhotosOpen] = useState(false)
  const [smileysOpen, setSmileysOpen] = useState(false)
  const [previewClosed, setPreviewClosed] = useState(false)
  const [poll, setPoll] = useState<{ question: string; options: string[] } | null>(null)
  const [glitter, setGlitter] = useState<Glitter | null>(null)
  const [pickingGlitter, setPickingGlitter] = useState(false)
  const [placingGlitter, setPlacingGlitter] = useState(false)
  // The glitter-site link the hint is about; "Nee, bedankt" hides it for that link
  const glitterLink = GLITTER_SITE_LINK.exec(text)?.[0] ?? null
  const [glitterHintOff, setGlitterHintOff] = useState<string | null>(null)
  const showGlitterHint = !!glitterLink && glitterHintOff !== glitterLink && !glitter
  const { ref: textRef, wrap, linkTo, insert, listKeys } = useTextEditing(text, setText, MAX)
  const [linking, setLinking] = useState(false)
  const showPreview = hasMarkup(text) && !previewClosed

  const post = useMutation({
    mutationFn: () =>
      api<Status>('/statuses', {
        method: 'POST',
        body: {
          text,
          where,
          mood,
          icon,
          visibility,
          photos: photos.map((p) => ({ kind: p.kind, id: p.photo.id })),
          poll,
          glitterId: glitter?.id ?? null,
          kudde: asKudde?.slug ?? null,
        },
      }),
    onSuccess: async () => {
      setText('')
      setSmileysOpen(false)
      setWhere('')
      setMood(null)
      setIcon(null)
      setPhotos([])
      setPhotosOpen(false)
      setPoll(null)
      setGlitter(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.allTimeline }),
        queryClient.invalidateQueries({ queryKey: keys.allStatuses }),
        queryClient.invalidateQueries({ queryKey: ['profile', user!.username] }),
        queryClient.invalidateQueries({ queryKey: keys.recentPhotos }),
        queryClient.invalidateQueries({ queryKey: keys.stats }),
      ])
    },
  })

  if (!user) return null

  const moodInfo = mood ? MOODS[mood] : null

  return (
    <form
      className={compact ? 'composer compact' : 'composer speak'}
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) post.mutate()
      }}
    >
      {/* You, saying it: your photo, with the text field as a speech bubble coming from it */}
      {!compact && <span className="composer-face">{asKudde ? <KuddePic kudde={asKudde} /> : <Avatar user={user} size="small" static />}</span>}

      <div className="composer-editor">
        <textarea
          ref={textRef}
          className="composer-text"
          rows={compact ? 2 : 3}
          value={text}
          maxLength={MAX}
          onKeyDown={listKeys}
          onChange={(e) => {
            setText(e.target.value)
            setPreviewClosed(false)
          }}
          placeholder={asKudde ? `Wat is er nieuw bij ${asKudde.name}?` : prompt(user.nickname)}
          aria-label="Je WieWatWaar"
        />
        {photos.length > 0 && (
          <div className="composer-previews">
            {photos.map((p) => (
              <div key={photoKey(p)} className="composer-preview">
                <img src={p.photo.url} alt={p.photo.caption || 'Gekozen foto'} />
                {p.kind === 'kudde' && (
                  <span className="composer-preview-from">
                    <FarmIcon name="group" /> {p.kudde.name}
                  </span>
                )}
                <button type="button" title="Foto weghalen" onClick={() => togglePhoto(p)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
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
        {moodInfo && (
          <span className="composer-mood-chip">
            Gevoel: <Smiley name={moodInfo.smiley} /> {moodInfo.label}
            <button type="button" onClick={() => setMood(null)} title="Gevoel weghalen">
              ×
            </button>
          </span>
        )}
        {where.trim() && (
          <span className="composer-mood-chip">
            <FarmIcon name="location_pin" /> {where.trim()}
            <button type="button" onClick={() => setWhere('')} title="Plaats weghalen">
              ×
            </button>
          </span>
        )}
        {/* What you do to the text itself: formatting and smileys, with the count */}
        <div className="composer-format" role="toolbar" aria-label="Opmaak">
          <button type="button" title="Vet" aria-label="Vet" onClick={() => wrap('**')}>
            <FarmIcon name="text_bold" />
          </button>
          <button type="button" title="Schuin" aria-label="Schuin" onClick={() => wrap('*')}>
            <FarmIcon name="text_italic" />
          </button>
          <button type="button" title="Doorgestreept" aria-label="Doorgestreept" onClick={() => wrap('~~')}>
            <FarmIcon name="text_strikethrough" />
          </button>
          <button type="button" title="Link toevoegen" aria-label="Link toevoegen" onClick={() => setLinking(true)}>
            <FarmIcon name="link" />
          </button>
          <span className="composer-format-sep" aria-hidden="true" />
          <button type="button" className={smileysOpen ? 'current' : undefined} title="Smileys" aria-label="Smileys" aria-expanded={smileysOpen} onClick={() => setSmileysOpen((o) => !o)}>
            <Smiley name="lach" />
          </button>
          <span className={text.length > MAX - 50 ? 'composer-count near' : 'composer-count'}>
            {text.length}/{MAX}
          </span>
        </div>
      </div>

      <div className="composer-bar">
        {/* What goes with it; on a phone these swipe sideways in one row */}
        <span className="composer-tools">
          <button
            type="button"
            className={photosOpen || photos.length ? 'composer-icon current' : 'composer-icon'}
            title={`Foto's toevoegen (maximaal ${STATUS_MAX_PHOTOS})`}
            aria-expanded={photosOpen}
            onClick={() => setPhotosOpen((o) => !o)}
          >
            <FarmIcon name="picture_add" />
          </button>
          <button
            type="button"
            className={glitter ? 'composer-icon current' : 'composer-icon'}
            title={glitter ? 'Ander glitterplaatje' : 'Glitterplaatje toevoegen'}
            onClick={() => setPickingGlitter(true)}
          >
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
          <IconPicker value={icon} onChange={setIcon} allowNone compact label="Pictogram bij je WieWatWaar" />
          {/* How you feel and where you are, behind a divider */}
          <span className="composer-tools-sep" aria-hidden="true" />
          <Dropdown
            bubble
            buttonClassName={moodInfo ? 'composer-icon current' : 'composer-icon'}
            title={moodInfo ? `Gevoel: ${moodInfo.label}` : 'Gevoel'}
            label={<FarmIcon name="heart" />}
          >
            {(close) => (
              <div className="composer-moods">
                {Object.entries(MOODS).map(([key, m]) => (
                  <button
                    key={key}
                    type="button"
                    className="dropdown-item"
                    aria-current={key === mood}
                    onClick={() => {
                      setMood(key)
                      close()
                    }}
                  >
                    <span className="mood-smiley">
                      <Smiley name={m.smiley} />
                    </span>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>
          <Dropdown bubble buttonClassName={where.trim() ? 'composer-icon current' : 'composer-icon'} title={where.trim() ? `Waar: ${where.trim()}` : 'Waar ben je?'} label={<FarmIcon name="location_pin" />}>
            {(close) => (
              <label className="composer-where">
                <FarmIcon name="location_pin" />
                <input
                  value={where}
                  maxLength={60}
                  autoFocus
                  onChange={(e) => setWhere(e.target.value)}
                  // Enter closes it, instead of posting the WieWatWaar
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      close()
                    }
                  }}
                  placeholder="Waar ben je?"
                  aria-label="Waar ben je?"
                />
              </label>
            )}
          </Dropdown>
        </span>
      </div>

      <div className="composer-foot">
        {compact && ownedKuddes.length > 0 && (
          <label className="composer-visibility">
            <FarmIcon name={asKudde ? 'tag_blue' : 'user'} />
            <select value={asKudde?.slug ?? ''} onChange={(e) => setAsKudde(ownedKuddes.find((k) => k.slug === e.target.value) ?? null)} aria-label="Plaatsen als">
              <option value="">Als jezelf</option>
              {ownedKuddes.map((k) => (
                <option key={k.slug} value={k.slug}>
                  Als {k.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {compact && !asKudde && (
          <label className="composer-visibility">
            <FarmIcon name={VISIBILITY[visibility].icon} />
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} aria-label="Wie mag dit zien?" title={VISIBILITY[visibility].hint}>
              <option value="iedereen">Iedereen</option>
              <option value="vrienden">Alleen vrienden</option>
            </select>
          </label>
        )}
        {/* Who it's from and who sees it, next to the button that sends it */}
        {!compact && (
          <>
          {ownedKuddes.length > 0 && (
            <Dropdown
              bubble
              buttonClassName="composer-pill"
              title="Plaatsen als jezelf of als een Kudde die je beheert"
              label={
                <>
                  <FarmIcon name={asKudde ? 'tag_blue' : 'user'} /> {asKudde ? 'Als Kudde' : 'Als jezelf'} <Icon name="chevronDown" size={14} />
                </>
              }
            >
              {(close) =>
                [null, ...ownedKuddes].map((k) => (
                  <button
                    key={k?.slug ?? 'ik'}
                    type="button"
                    className="dropdown-item"
                    aria-current={(asKudde?.slug ?? null) === (k?.slug ?? null)}
                    onClick={() => {
                      setAsKudde(k)
                      close()
                    }}
                  >
                    <FarmIcon name={k ? 'tag_blue' : 'user'} /> {k ? k.name : `${user.nickname} (jezelf)`}
                  </button>
                ))
              }
            </Dropdown>
          )}
          {asKudde ? (
            <span className="composer-pill" title="Een WieWatWaar van een Kudde is altijd voor iedereen">
              <FarmIcon name={VISIBILITY.iedereen.icon} /> {VISIBILITY.iedereen.label}
            </span>
          ) : (
            <Dropdown
              bubble
              buttonClassName="composer-pill"
              title={VISIBILITY[visibility].hint}
              label={
                <>
                  <FarmIcon name={VISIBILITY[visibility].icon} /> {VISIBILITY[visibility].label} <Icon name="chevronDown" size={14} />
                </>
              }
            >
              {(close) =>
                (Object.keys(VISIBILITY) as Visibility[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="dropdown-item"
                    aria-current={v === visibility}
                    onClick={() => {
                      setVisibility(v)
                      close()
                    }}
                  >
                    <FarmIcon name={VISIBILITY[v].icon} />{' '}
                    <span>
                      <b>{VISIBILITY[v].label}</b>
                      <br />
                      <span className="muted">{VISIBILITY[v].hint}</span>
                    </span>
                  </button>
                ))
              }
            </Dropdown>
          )}
          </>
        )}
        <span className="composer-send">
          <Button
            variant="cta"
            type="submit"
            disabled={post.isPending || !text.trim()}
            title={user?.preferences.sendShortcut ? 'Of druk op Ctrl+Enter' : undefined}
          >
            <FarmIcon name="pencil" /> Plaatsen
          </Button>
        </span>
      </div>
      {poll && (
        <div className="composer-poll-panel">
          <PollEditor value={poll} onChange={setPoll} limits={POLL_LIMITS} />
        </div>
      )}
      {photosOpen && (
        <PostPhotoPicker
          username={user.username}
          selected={photos.map(photoKey)}
          full={photos.length >= STATUS_MAX_PHOTOS}
          room={STATUS_MAX_PHOTOS - photos.length}
          // stays open to pick more; clicking a chosen one takes it off again
          onPick={togglePhoto}
        />
      )}
      {smileysOpen && (
        <div className="composer-smiley-panel">
          <SmileyPicker onPick={insert} />
        </div>
      )}
      {showPreview && (
        <div className="composer-preview-panel">
          <TextPreview text={text} onClose={() => setPreviewClosed(true)} />
        </div>
      )}
      {asKudde && !compact && <p className="composer-note">Je plaatst dit namens {asKudde.name}, voor iedereen. Het komt niet op je eigen profiel.</p>}
      {post.isError && <p className="form-error">{errorMessage(post.error)}</p>}
      {showGlitterHint && (
        <div className="composer-glitter-hint" role="status">
          <FarmIcon name="rainbow" />
          <span>
            Een plaatje van {glitterLink!.includes('gigaglitters') ? 'GigaGlitters' : 'PicMix'}? Hier wordt dat alleen een link. Sla het plaatje op en zet het bij de <b>Glitterplaatjes</b>: dan staat het
            meteen in je WieWatWaar, en kun je het ook in knuffels sturen.
          </span>
          <span className="composer-glitter-hint-actions">
            <Button variant="cta" onClick={() => setPlacingGlitter(true)}>
              <FarmIcon name="picture_add" /> Glitterplaatje plaatsen
            </Button>
            <button type="button" className="link-button" onClick={() => setGlitterHintOff(glitterLink)}>
              Nee, bedankt
            </button>
          </span>
        </div>
      )}
      {placingGlitter && (
        <GlitterUpload
          initialCategory={null}
          onClose={() => setPlacingGlitter(false)}
          onPlaced={(g) => {
            setGlitter(g)
            // The plaatje replaces the link to it
            if (glitterLink) setText((t) => t.replace(glitterLink, '').replace(/[ \t]{2,}/g, ' ').trim())
          }}
        />
      )}
      {pickingGlitter && (
        <GlitterPicker
          onClose={() => setPickingGlitter(false)}
          onPick={(g) => {
            setGlitter(g)
            setPickingGlitter(false)
          }}
        />
      )}
      {linking && <LinkPicker onPick={linkTo} onClose={() => setLinking(false)} />}
    </form>
  )
}
