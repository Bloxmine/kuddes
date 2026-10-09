import { useState } from 'react'
import type { Gadget } from '../../../shared/api'
import {
  GADGET_TYPES,
  LIMITS,
  NOTE_COLORS,
  youtubeId,
  youtubeThumb,
  MUSIC_ORDERS,
  type MusicOrder,
  type GadgetConfig,
  type GadgetType,
  type NoteColor,
  type Track,
} from '../../../shared/gadgets'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { useChannelVideos } from '../../lib/queries'
import { GADGET_ICONS } from './gadgetIcons'
import { useGadgetActions } from './useGadgetActions'
import { IconPicker } from '../../components/ui/IconPicker'
import './Gadgets.css'
import { ACHIEVEMENTS } from '../../../shared/achievements'
import { useAchievements } from '../games/gameQueries'
import { Medal } from '../games/Medal'
import { AlbumCover, BookCover, DvdCase, GameBox } from './ShelfGadgets'
import { StarPicker } from './Stars'
import { CollectionSearch } from '../media/CollectionSearch'
import { BoxSet, Bottle } from './DrinkSeriesGadgets'
import { COVER_COLORS, COVER_STYLE_NAMES, COVER_STYLES, SHELF_LOOKS, SHELF_LOOKS_FOR, GAME_PLATFORMS, DRINK_KINDS, SERIES_PLATFORMS, SERIES_STATUS, type Drink, type DrinkKind, type Series, type SeriesPlatform, type SeriesStatus, type GamePlatform, type ShelfGame, type Album, type ShelfLook, type Book, type CoverColor, type CoverStyle, type Movie } from '../../../shared/gadgets'
import { DateTimeInput } from '../../components/ui/DateInput'
import { ChannelEditor, ClockEditor, CountriesEditor, LinksEditor, ListEditor, RadioEditor } from './MoreEditors'
import { CounterEditor, MarioKartEditor, PhotoPickEditor, QuoteEditor, TextEditor } from './ExtraEditors'
import { ForumEditor, PetEditor, ScoresEditor, ScrapbookEditor } from './FunEditors'
import { BlogGadgetEditor } from '../blogs/BlogGadget'
import { PhotographyGadgetEditor } from '../photography/PhotographyGadget'
import { KuddesMusicGadgetEditor } from '../music/MusicGadget'
import { KuddesRadioGadgetEditor } from '../radio/RadioGadget'
import { MindfulnessGadgetEditor } from './MindfulnessGadget'
import { useConsent } from '../../lib/cookieConsent'
import { CalculatorEditor, DocPickEditor, FilesEditor } from './ToolEditors'

type Editor<T extends GadgetType> = { value: GadgetConfig[T]; onChange: (next: GadgetConfig[T]) => void }

function NotesEditor({ value, onChange }: Editor<'notities'>) {
  const set = (i: number, changes: Partial<GadgetConfig['notities']['notes'][number]>) =>
    onChange({ notes: value.notes.map((n, j) => (j === i ? { ...n, ...changes } : n)) })
  return (
    <div className="gadget-rows">
      {value.notes.map((n, i) => (
        <div key={n.id} className="gadget-row note-row" style={{ '--note': NOTE_COLORS[n.color] } as React.CSSProperties}>
          <textarea
            className="text-box"
            rows={2}
            value={n.text}
            maxLength={LIMITS.noteText}
            onChange={(e) => set(i, { text: e.target.value })}
            aria-label={`Briefje ${i + 1}`}
          />
          <select className="text-box" value={n.color} onChange={(e) => set(i, { color: e.target.value as NoteColor })} aria-label="Kleur">
            {Object.keys(NOTE_COLORS).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="button" className="icon-button" title="Weghalen" onClick={() => onChange({ notes: value.notes.filter((_, j) => j !== i) })}>
            <FarmIcon name="note_delete" />
          </button>
        </div>
      ))}
      {value.notes.length < LIMITS.notes && (
        <Button onClick={() => onChange({ notes: [...value.notes, { id: Math.random().toString(36).slice(2, 10), text: '', color: 'geel' }] })}>
          <FarmIcon name="note_add" /> Briefje toevoegen
        </Button>
      )}
      <p className="muted">Tip: op je profiel kun je de briefjes ook meteen aanklikken en bewerken.</p>
    </div>
  )
}

/** A list of YouTube tracks: paste a link, the title is looked up. */
function TrackEditor({ tracks, max, onChange, noun }: { tracks: Track[]; max: number; onChange: (t: Track[]) => void; noun: string }) {
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const youtubeAllowed = useConsent('youtube')
  const move = (i: number, d: number) => {
    const next = [...tracks]
    const [t] = next.splice(i, 1)
    next.splice(i + d, 0, t)
    onChange(next)
  }

  const add = async () => {
    const id = youtubeId(link)
    if (!id) return setError('Plak een link naar een YouTube-video, bijv. https://youtu.be/…')
    setBusy(true)
    setError(null)
    try {
      const { title } = await api<{ title: string }>(`/youtube/${id}`)
      onChange([...tracks, { videoId: id, title }])
      setLink('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gadget-rows">
      {tracks.map((t, i) => (
        <div key={`${t.videoId}-${i}`} className="gadget-row">
          {/* The thumbnail comes from Google: only with the cookie choice */}
          {youtubeAllowed ? <img className="track-thumb" src={youtubeThumb(t.videoId)} alt="" referrerPolicy="no-referrer" /> : <FarmIcon name="youtube" size={32} className="track-thumb" />}
          <input
            className="text-box"
            value={t.title}
            maxLength={LIMITS.trackTitle}
            placeholder="Titel"
            onChange={(e) => onChange(tracks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
            aria-label={`Titel van ${noun} ${i + 1}`}
          />
          <button type="button" className="icon-button" title="Omhoog" disabled={i === 0} onClick={() => move(i, -1)}>
            <FarmIcon name="arrow_up" />
          </button>
          <button type="button" className="icon-button" title="Omlaag" disabled={i === tracks.length - 1} onClick={() => move(i, 1)}>
            <FarmIcon name="arrow_down" />
          </button>
          <button type="button" className="icon-button" title="Weghalen" onClick={() => onChange(tracks.filter((_, j) => j !== i))}>
            <FarmIcon name="bin" />
          </button>
        </div>
      ))}
      {tracks.length < max && (
        <div className="gadget-add-link">
          <FarmIcon name="youtube" />
          <input
            className="text-box"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder="Plak een YouTube-link"
            aria-label={`YouTube-link voor een ${noun}`}
          />
          <Button disabled={!link.trim() || busy} onClick={add}>
            <FarmIcon name="add" /> {busy ? 'Zoeken…' : 'Toevoegen'}
          </Button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

/** datetime-local works in local time; the server stores ISO with an offset. */
const toLocalInput = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CountdownEditor({ value, onChange }: Editor<'aftellen'>) {
  return (
    <div className="settings-grid">
      <Field label="Aftellen tot">
        <DateTimeInput value={toLocalInput(value.target)} defaultTime="00:00" onChange={(v) => onChange({ ...value, target: v ? new Date(v).toISOString() : '' })} />
      </Field>
      <Field label="Tekst als het zover is" hint="(smileys mogen)">
        <input className="text-box" value={value.doneText} maxLength={LIMITS.doneText} onChange={(e) => onChange({ ...value, doneText: e.target.value })} />
      </Field>
    </div>
  )
}

function PollEditor({ value, onChange, votes }: Editor<'poll'> & { votes: number }) {
  const setOption = (i: number, text: string) => onChange({ ...value, options: value.options.map((o, j) => (j === i ? text : o)) })
  return (
    <div className="gadget-rows">
      <Field label="Vraag">
        <input className="text-box" value={value.question} maxLength={LIMITS.question} onChange={(e) => onChange({ ...value, question: e.target.value })} placeholder="Wat is het beste feest van het jaar?" />
      </Field>
      {value.options.map((o, i) => (
        <div key={i} className="gadget-row">
          <span className="poll-radio" aria-hidden="true" />
          <input className="text-box" value={o} maxLength={LIMITS.option} onChange={(e) => setOption(i, e.target.value)} placeholder={`Antwoord ${i + 1}`} aria-label={`Antwoord ${i + 1}`} />
          <button
            type="button"
            className="icon-button"
            title="Weghalen"
            disabled={value.options.length <= 2}
            onClick={() => onChange({ ...value, options: value.options.filter((_, j) => j !== i) })}
          >
            <FarmIcon name="bin" />
          </button>
        </div>
      ))}
      {value.options.length < LIMITS.options && (
        <Button onClick={() => onChange({ ...value, options: [...value.options, ''] })}>
          <FarmIcon name="add" /> Antwoord toevoegen
        </Button>
      )}
      <label className="gadget-toggle">
        <input type="checkbox" checked={value.closed} onChange={(e) => onChange({ ...value, closed: e.target.checked })} /> Poll sluiten (niemand
        kan meer stemmen)
      </label>
      {votes > 0 && <p className="form-notice">Als je de antwoorden verandert, beginnen de stemmen ({votes}) opnieuw.</p>}
    </div>
  )
}

/** Your latest uploads, or the ones you pick (in the order you pick them). */
function KuddesVideoEditor({ value, onChange, username }: Editor<'kuddesvideo'> & { username: string }) {
  const { data: mine = [], isLoading } = useChannelVideos(username)
  const ready = mine.filter((v) => v.status === 'klaar')
  const toggle = (id: string) =>
    onChange({
      ...value,
      videoIds: value.videoIds.includes(id) ? value.videoIds.filter((x) => x !== id) : [...value.videoIds, id].slice(0, LIMITS.kuddesvideos),
    })
  return (
    <div className="gadget-rows">
      <label className="gadget-toggle">
        <input type="radio" checked={value.mode === 'nieuwste'} onChange={() => onChange({ ...value, mode: 'nieuwste' })} /> Mijn nieuwste video's (vanzelf
        bijgewerkt)
      </label>
      <label className="gadget-toggle">
        <input type="radio" checked={value.mode === 'gekozen'} onChange={() => onChange({ ...value, mode: 'gekozen' })} /> Zelf kiezen
      </label>
      {value.mode === 'gekozen' &&
        (isLoading ? (
          <p className="muted">Laden…</p>
        ) : ready.length === 0 ? (
          <p className="empty">
            Je hebt nog geen video's. <Link to="/video/uploaden">Upload er een</Link>
          </p>
        ) : (
          <ul className="kuddesvideo-picker">
            {ready.map((v) => {
              const pos = value.videoIds.indexOf(v.id)
              return (
                <li key={v.id}>
                  <label className={pos >= 0 ? 'picked' : undefined}>
                    <input type="checkbox" checked={pos >= 0} onChange={() => toggle(v.id)} />
                    {v.thumbUrl && <img src={v.thumbUrl} alt="" />}
                    <span>{v.title}</span>
                    {pos >= 0 && <b className="kuddesvideo-pos">{pos + 1}</b>}
                  </label>
                </li>
              )
            })}
          </ul>
        ))}
      <p className="muted">Alleen video's die de bezoeker mag zien, komen in de gadget.</p>
    </div>
  )
}

/** Which earned achievements to show, and whether to show the game stats. */
function AchievementsEditor({ value, onChange, username }: Editor<'prestaties'> & { username: string }) {
  const { data } = useAchievements(username)
  const earned = (data?.achievements ?? []).filter((a) => a.unlockedAt)
  const toggle = (key: string) =>
    onChange({ ...value, featured: value.featured.includes(key) ? value.featured.filter((k) => k !== key) : [...value.featured, key].slice(0, LIMITS.featured) })
  return (
    <div className="gadget-rows">
      <p className="muted">
        Kies maximaal {LIMITS.featured} prestaties om te laten zien. Kies je er geen, dan zie je je nieuwste.
      </p>
      {!data ? (
        <p className="muted">Laden…</p>
      ) : earned.length === 0 ? (
        <p className="empty">
          Je hebt nog geen prestaties. <Link to="/spellen">Speel een potje</Link>!
        </p>
      ) : (
        <ul className="ac-picker">
          {earned.map((a) => (
            <li key={a.key}>
              <label className={value.featured.includes(a.key) ? 'picked' : undefined}>
                <input type="checkbox" checked={value.featured.includes(a.key)} onChange={() => toggle(a.key)} />
                <Medal achievement={a.key} small /> {ACHIEVEMENTS[a.key].name}
              </label>
            </li>
          ))}
        </ul>
      )}
      <label className="gadget-toggle">
        <input type="checkbox" checked={value.showStats} onChange={(e) => onChange({ ...value, showStats: e.target.checked })} /> Toon mijn spelstatistieken
      </label>
    </div>
  )
}

const newId = () => Math.random().toString(36).slice(2, 10)
const randomOf = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

type ShelfItem = { id: string; title: string; color: CoverColor; style: CoverStyle; rating: number; note: string; icon?: string }

/** One book or film: a live cover, colour and layout, stars and what you thought of it. */
function ShelfRow<T extends ShelfItem>({
  item,
  onChange,
  onMove,
  onRemove,
  first,
  last,
  preview,
  extra,
}: {
  item: T
  onChange: (changes: Partial<T>) => void
  onMove: (d: number) => void
  onRemove: () => void
  first: boolean
  last: boolean
  preview: React.ReactNode
  extra: React.ReactNode
}) {
  return (
    <div className="shelf-edit-row">
      <div className="shelf-edit-preview">
        {preview}
        <div>
          <button type="button" className="icon-button" title="Naar voren" disabled={first} onClick={() => onMove(-1)}>
            <FarmIcon name="arrow_left" />
          </button>
          <button type="button" className="icon-button" title="Naar achteren" disabled={last} onClick={() => onMove(1)}>
            <FarmIcon name="arrow_right" />
          </button>
          <button type="button" className="icon-button" title="Weghalen" onClick={onRemove}>
            <FarmIcon name="bin" />
          </button>
        </div>
      </div>
      <div className="shelf-edit-fields">
        <Field label="Titel">
          <input className="text-box" value={item.title} maxLength={LIMITS.coverTitle} onChange={(e) => onChange({ title: e.target.value } as Partial<T>)} />
        </Field>
        {extra}
        <div className="field">
          <span>Kleur</span>
          <div className="shelf-swatches">
            {(Object.keys(COVER_COLORS) as CoverColor[]).map((c) => (
              <button key={c} type="button" title={c} aria-label={c} aria-pressed={item.color === c} style={{ background: `linear-gradient(135deg, ${COVER_COLORS[c][0]} 60%, ${COVER_COLORS[c][1]} 60%)` }} onClick={() => onChange({ color: c } as Partial<T>)} />
            ))}
          </div>
        </div>
        <Field label="Voorkant">
          <select className="text-box" value={item.style} onChange={(e) => onChange({ style: e.target.value as CoverStyle } as Partial<T>)}>
            {COVER_STYLES.map((s) => (
              <option key={s} value={s}>
                {COVER_STYLE_NAMES[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span>Pictogram op de voorkant</span>
          <IconPicker value={item.icon ?? null} onChange={(icon) => onChange({ icon: icon ?? undefined } as Partial<T>)} allowNone label="Pictogram" />
        </div>
        <div className="field">
          <span>Sterren</span>
          <StarPicker value={item.rating} onChange={(rating) => onChange({ rating } as Partial<T>)} />
        </div>
        <div className="wide">
          <Field label="Wat vond je ervan?" hint="(smileys mogen)">
            <input className="text-box" value={item.note} maxLength={LIMITS.coverNote} onChange={(e) => onChange({ note: e.target.value } as Partial<T>)} />
          </Field>
        </div>
      </div>
    </div>
  )
}

function useShelfList<T extends ShelfItem>(items: T[], onChange: (next: T[]) => void) {
  return {
    set: (i: number, changes: Partial<T>) => onChange(items.map((x, j) => (j === i ? { ...x, ...changes } : x))),
    move: (i: number, d: number) => {
      const next = [...items]
      const [x] = next.splice(i, 1)
      next.splice(i + d, 0, x)
      onChange(next)
    },
    remove: (i: number) => onChange(items.filter((_, j) => j !== i)),
  }
}

/** Which furniture the books, dvd's or albums stand in. */
function LookPicker({ type, value, onChange }: { type: keyof typeof SHELF_LOOKS_FOR; value: ShelfLook | undefined; onChange: (look: ShelfLook) => void }) {
  return (
    <Field label="Kast">
      <select className="text-box" value={value ?? SHELF_LOOKS_FOR[type][0]} onChange={(e) => onChange(e.target.value as ShelfLook)}>
        {SHELF_LOOKS_FOR[type].map((l) => (
          <option key={l} value={l}>
            {SHELF_LOOKS[l]}
          </option>
        ))}
      </select>
    </Field>
  )
}

const randomCover = () => ({ id: newId(), title: '', color: randomOf(Object.keys(COVER_COLORS) as CoverColor[]), style: randomOf(COVER_STYLES), rating: 0, note: '' })

function AlbumsEditor({ value, onChange }: Editor<'platen'>) {
  const list = useShelfList(value.albums, (albums) => onChange({ ...value, albums }))
  const add = () => onChange({ ...value, albums: [...value.albums, { ...randomCover(), artist: '', format: 'cd' } satisfies Album] })
  return (
    <div className="gadget-rows">
      <LookPicker type="platen" value={value.look} onChange={(look) => onChange({ ...value, look })} />
      {value.albums.map((a, i) => (
        <ShelfRow
          key={a.id}
          item={a}
          first={i === 0}
          last={i === value.albums.length - 1}
          onChange={(c) => list.set(i, c)}
          onMove={(d) => list.move(i, d)}
          onRemove={() => list.remove(i)}
          preview={<AlbumCover album={a} />}
          extra={
            <>
              <Field label="Artiest">
                <input className="text-box" value={a.artist} maxLength={LIMITS.author} onChange={(e) => list.set(i, { artist: e.target.value })} />
              </Field>
              <Field label="Soort">
                <select className="text-box" value={a.format} onChange={(e) => list.set(i, { format: e.target.value as Album['format'] })}>
                  <option value="cd">Cd</option>
                  <option value="lp">Langspeelplaat</option>
                </select>
              </Field>
            </>
          }
        />
      ))}
      <CollectionSearch shelf="platen" have={value.albums} full={value.albums.length >= LIMITS.albums} onAdd={(item) => onChange({ ...value, albums: [...value.albums, item as Album] })} />
      {value.albums.length < LIMITS.albums && (
        <Button onClick={add}>
          <FarmIcon name="add" /> Album toevoegen
        </Button>
      )}
      <p className="muted">Albums met 4 of 5 sterren krijgen een sticker. Bezoekers klikken op een album om te lezen wat je ervan vond.</p>
    </div>
  )
}

function RecipesEditor({ value, onChange }: Editor<'recepten'>) {
  return (
    <div className="gadget-rows">
      {(
        [
          ['beide', 'Mijn recepten en daarna de recepten die ik lekker vind'],
          ['eigen', 'Alleen mijn eigen recepten'],
          ['lekker', 'Alleen de recepten die ik lekker vind'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="gadget-toggle">
          <input type="radio" checked={value.show === key} onChange={() => onChange({ ...value, show: key })} /> {label}
        </label>
      ))}
      <Field label="Hoeveel recepten">
        <select className="text-box" value={value.count} onChange={(e) => onChange({ ...value, count: Number(e.target.value) })}>
          {[3, 4, 6, 8, 10, 12].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <p className="muted">
        Deel recepten op <Link to="/recepten">Recepten</Link>, en klik op "Lekker!" bij recepten van anderen.
      </p>
    </div>
  )
}

function GamesEditor({ value, onChange }: Editor<'spellen'>) {
  const list = useShelfList(value.games, (games) => onChange({ ...value, games }))
  const add = () => onChange({ ...value, games: [...value.games, { ...randomCover(), platform: 'pc' } satisfies ShelfGame] })
  return (
    <div className="gadget-rows">
      <LookPicker type="spellen" value={value.look} onChange={(look) => onChange({ ...value, look })} />
      {value.games.map((g, i) => (
        <ShelfRow
          key={g.id}
          item={g}
          first={i === 0}
          last={i === value.games.length - 1}
          onChange={(c) => list.set(i, c)}
          onMove={(d) => list.move(i, d)}
          onRemove={() => list.remove(i)}
          preview={<GameBox game={g} />}
          extra={
            <Field label="Speel je op">
              <select className="text-box" value={g.platform} onChange={(e) => list.set(i, { platform: e.target.value as GamePlatform })}>
                {(Object.keys(GAME_PLATFORMS) as GamePlatform[]).map((p) => (
                  <option key={p} value={p}>
                    {GAME_PLATFORMS[p]}
                  </option>
                ))}
              </select>
            </Field>
          }
        />
      ))}
      <CollectionSearch shelf="spellen" have={value.games} full={value.games.length >= LIMITS.games} onAdd={(item) => onChange({ ...value, games: [...value.games, item as ShelfGame] })} />
      {value.games.length < LIMITS.games && (
        <Button onClick={add}>
          <FarmIcon name="add" /> Spel toevoegen
        </Button>
      )}
      <p className="muted">Elk platform krijgt zijn eigen doosje. Spellen met 4 of 5 sterren krijgen een sticker.</p>
    </div>
  )
}

function BooksEditor({ value, onChange }: Editor<'boeken'>) {
  const list = useShelfList(value.books, (books) => onChange({ ...value, books }))
  const add = () => onChange({ ...value, books: [...value.books, { ...randomCover(), author: '' } satisfies Book] })
  return (
    <div className="gadget-rows">
      <LookPicker type="boeken" value={value.look} onChange={(look) => onChange({ ...value, look })} />
      {value.books.map((b, i) => (
        <ShelfRow
          key={b.id}
          item={b}
          first={i === 0}
          last={i === value.books.length - 1}
          onChange={(c) => list.set(i, c)}
          onMove={(d) => list.move(i, d)}
          onRemove={() => list.remove(i)}
          preview={<BookCover book={b} />}
          extra={
            <Field label="Schrijver">
              <input className="text-box" value={b.author} maxLength={LIMITS.author} onChange={(e) => list.set(i, { author: e.target.value })} />
            </Field>
          }
        />
      ))}
      <CollectionSearch shelf="boeken" have={value.books} full={value.books.length >= LIMITS.books} onAdd={(item) => onChange({ ...value, books: [...value.books, item as Book] })} />
      {value.books.length < LIMITS.books && (
        <Button onClick={add}>
          <FarmIcon name="add" /> Boek toevoegen
        </Button>
      )}
      <p className="muted">Boeken met 4 of 5 sterren krijgen een kaartje in de kast. Bezoekers klikken op een boek om te lezen wat je ervan vond.</p>
    </div>
  )
}

function MoviesEditor({ value, onChange }: Editor<'films'>) {
  const list = useShelfList(value.movies, (movies) => onChange({ ...value, movies }))
  const add = () => onChange({ ...value, movies: [...value.movies, { ...randomCover(), year: '' } satisfies Movie] })
  return (
    <div className="gadget-rows">
      <LookPicker type="films" value={value.look} onChange={(look) => onChange({ ...value, look })} />
      {value.movies.map((m, i) => (
        <ShelfRow
          key={m.id}
          item={m}
          first={i === 0}
          last={i === value.movies.length - 1}
          onChange={(c) => list.set(i, c)}
          onMove={(d) => list.move(i, d)}
          onRemove={() => list.remove(i)}
          preview={<DvdCase movie={m} />}
          extra={
            <Field label="Jaar">
              <input className="text-box" value={m.year} inputMode="numeric" maxLength={4} placeholder="2004" onChange={(e) => list.set(i, { year: e.target.value.replace(/\D/g, '') })} />
            </Field>
          }
        />
      ))}
      <CollectionSearch shelf="films" have={value.movies} full={value.movies.length >= LIMITS.movies} onAdd={(item) => onChange({ ...value, movies: [...value.movies, item as Movie] })} />
      {value.movies.length < LIMITS.movies && (
        <Button onClick={add}>
          <FarmIcon name="add" /> Film toevoegen
        </Button>
      )}
      <p className="muted">Films met 4 of 5 sterren krijgen een sticker. Bezoekers klikken op een dvd om te lezen wat je ervan vond.</p>
    </div>
  )
}

function DrinksEditor({ value, onChange }: Editor<'drank'>) {
  const list = useShelfList(value.drinks, (drinks) => onChange({ ...value, drinks }))
  const add = () => onChange({ ...value, drinks: [...value.drinks, { ...randomCover(), kind: 'speciaal', maker: '', year: '' } satisfies Drink] })
  return (
    <div className="gadget-rows">
      <LookPicker type="drank" value={value.look} onChange={(look) => onChange({ ...value, look })} />
      {value.drinks.map((d, i) => (
        <ShelfRow
          key={d.id}
          item={d}
          first={i === 0}
          last={i === value.drinks.length - 1}
          onChange={(c) => list.set(i, c)}
          onMove={(m) => list.move(i, m)}
          onRemove={() => list.remove(i)}
          preview={<Bottle drink={d} />}
          extra={
            <>
              <Field label="Soort">
                <select className="text-box" value={d.kind} onChange={(e) => list.set(i, { kind: e.target.value as DrinkKind })}>
                  {(Object.keys(DRINK_KINDS) as DrinkKind[]).map((k) => (
                    <option key={k} value={k}>
                      {DRINK_KINDS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brouwerij of wijnhuis">
                <input className="text-box" value={d.maker} maxLength={LIMITS.author} onChange={(e) => list.set(i, { maker: e.target.value })} />
              </Field>
              <Field label="Jaar" hint="(optioneel)">
                <input className="text-box" value={d.year} inputMode="numeric" maxLength={4} placeholder="2015" onChange={(e) => list.set(i, { year: e.target.value.replace(/\D/g, '') })} />
              </Field>
            </>
          }
        />
      ))}
      <CollectionSearch shelf="drank" have={value.drinks} full={value.drinks.length >= LIMITS.drinks} onAdd={(item) => onChange({ ...value, drinks: [...value.drinks, item as Drink] })} />
      {value.drinks.length < LIMITS.drinks && (
        <Button onClick={add}>
          <FarmIcon name="add" /> Drankje toevoegen
        </Button>
      )}
      <p className="muted">De bovenste is je nummer 1 en krijgt de kroon. Elke soort drank krijgt zijn eigen fles; de kleur is die van het etiket.</p>
    </div>
  )
}

function SeriesEditor({ value, onChange }: Editor<'series'>) {
  const list = useShelfList(value.series, (series) => onChange({ ...value, series }))
  const add = () => onChange({ ...value, series: [...value.series, { ...randomCover(), seasons: 1, season: 1, status: 'gezien', platform: 'netflix' } satisfies Series] })
  const seasons = (n: number) => Math.max(1, Math.min(LIMITS.seasons, Math.round(n) || 1))
  return (
    <div className="gadget-rows">
      <LookPicker type="series" value={value.look} onChange={(look) => onChange({ ...value, look })} />
      {value.series.map((s, i) => (
        <ShelfRow
          key={s.id}
          item={s}
          first={i === 0}
          last={i === value.series.length - 1}
          onChange={(c) => list.set(i, c)}
          onMove={(m) => list.move(i, m)}
          onRemove={() => list.remove(i)}
          preview={<BoxSet series={s} />}
          extra={
            <>
              <Field label="Status">
                <select className="text-box" value={s.status} onChange={(e) => list.set(i, { status: e.target.value as SeriesStatus })}>
                  {(Object.keys(SERIES_STATUS) as SeriesStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {SERIES_STATUS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Seizoenen">
                <input
                  className="text-box"
                  type="number"
                  min={1}
                  max={LIMITS.seasons}
                  value={s.seasons}
                  onChange={(e) => {
                    const n = seasons(Number(e.target.value))
                    list.set(i, { seasons: n, season: Math.min(s.season, n) })
                  }}
                />
              </Field>
              {s.status === 'kijken' && (
                <Field label="Bij seizoen">
                  <input className="text-box" type="number" min={1} max={s.seasons} value={s.season} onChange={(e) => list.set(i, { season: Math.min(s.seasons, seasons(Number(e.target.value))) })} />
                </Field>
              )}
              <Field label="Kijk je op">
                <select className="text-box" value={s.platform} onChange={(e) => list.set(i, { platform: e.target.value as SeriesPlatform })}>
                  {(Object.keys(SERIES_PLATFORMS) as SeriesPlatform[]).map((k) => (
                    <option key={k} value={k}>
                      {SERIES_PLATFORMS[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          }
        />
      ))}
      <CollectionSearch shelf="series" have={value.series} full={value.series.length >= LIMITS.series} onAdd={(item) => onChange({ ...value, series: [...value.series, item as Series] })} />
      {value.series.length < LIMITS.series && (
        <Button onClick={add}>
          <FarmIcon name="add" /> Serie toevoegen
        </Button>
      )}
      <p className="muted">Wat je nu kijkt staat bovenaan de kast. Series met 4 of meer sterren krijgen een sticker.</p>
    </div>
  )
}

/** Title and contents of one gadget, saved together. */
export function GadgetForm({ gadget, username, onDone }: { gadget: Gadget; username: string; onDone: () => void }) {
  const { update } = useGadgetActions(username)
  const [title, setTitle] = useState(gadget.title)
  const [config, setConfig] = useState<GadgetConfig[GadgetType]>(gadget.config)
  const dirty = title !== gadget.title || JSON.stringify(config) !== JSON.stringify(gadget.config)

  const body = (() => {
    switch (gadget.type) {
      case 'notities':
        return <NotesEditor value={config as GadgetConfig['notities']} onChange={setConfig} />
      case 'muziek': {
        const music = config as GadgetConfig['muziek']
        return (
          <>
            <TrackEditor noun="nummer" max={LIMITS.tracks} tracks={music.tracks} onChange={(tracks) => setConfig({ ...music, tracks })} />
            <label className="gadget-toggle">
              <FarmIcon name="dice" /> Volgorde{' '}
              <select className="text-box" value={music.order ?? 'volgorde'} onChange={(e) => setConfig({ ...music, order: e.target.value as MusicOrder })}>
                {(Object.keys(MUSIC_ORDERS) as MusicOrder[]).map((o) => (
                  <option key={o} value={o}>
                    {MUSIC_ORDERS[o]}
                  </option>
                ))}
              </select>
            </label>
            <label className="gadget-toggle">
              <input type="checkbox" checked={!!music.autoplay} onChange={(e) => setConfig({ ...music, autoplay: e.target.checked })} /> Automatisch afspelen als
              iemand je profiel opent
            </label>
            <p className="muted">Bezoekers kunnen automatisch afspelen zelf uitzetten, en sommige browsers vragen eerst om een klik.</p>
          </>
        )
      }
      case 'video':
        return <TrackEditor noun="video" max={LIMITS.videos} tracks={(config as GadgetConfig['video']).videos} onChange={(videos) => setConfig({ videos })} />
      case 'aftellen':
        return <CountdownEditor value={config as GadgetConfig['aftellen']} onChange={setConfig} />
      case 'poll':
        return <PollEditor value={config as GadgetConfig['poll']} onChange={setConfig} votes={gadget.poll.total} />
      case 'kuddesvideo':
        return <KuddesVideoEditor value={config as GadgetConfig['kuddesvideo']} onChange={setConfig} username={username} />
      case 'prestaties':
        return <AchievementsEditor value={config as GadgetConfig['prestaties']} onChange={setConfig} username={username} />
      case 'boeken':
        return <BooksEditor value={config as GadgetConfig['boeken']} onChange={setConfig} />
      case 'films':
        return <MoviesEditor value={config as GadgetConfig['films']} onChange={setConfig} />
      case 'platen':
        return <AlbumsEditor value={config as GadgetConfig['platen']} onChange={setConfig} />
      case 'spellen':
        return <GamesEditor value={config as GadgetConfig['spellen']} onChange={setConfig} />
      case 'recepten':
        return <RecipesEditor value={config as GadgetConfig['recepten']} onChange={setConfig} />
      case 'kanaal':
        return <ChannelEditor value={config as GadgetConfig['kanaal']} onChange={setConfig} username={username} />
      case 'radio':
        return <RadioEditor value={config as GadgetConfig['radio']} onChange={setConfig} />
      case 'klok':
        return <ClockEditor value={config as GadgetConfig['klok']} onChange={setConfig} />
      case 'lijstje':
        return <ListEditor value={config as GadgetConfig['lijstje']} onChange={setConfig} />
      case 'landen':
        return <CountriesEditor value={config as GadgetConfig['landen']} onChange={setConfig} />
      case 'links':
        return <LinksEditor value={config as GadgetConfig['links']} onChange={setConfig} />
      case 'mariokart':
        return <MarioKartEditor value={config as GadgetConfig['mariokart']} onChange={setConfig} />
      case 'tekst':
        return <TextEditor value={config as GadgetConfig['tekst']} onChange={setConfig} />
      case 'foto':
        return <PhotoPickEditor value={config as GadgetConfig['foto']} onChange={setConfig} username={username} />
      case 'teller':
        return <CounterEditor value={config as GadgetConfig['teller']} onChange={setConfig} />
      case 'citaat':
        return <QuoteEditor value={config as GadgetConfig['citaat']} onChange={setConfig} />
      case 'drank':
        return <DrinksEditor value={config as GadgetConfig['drank']} onChange={setConfig} />
      case 'series':
        return <SeriesEditor value={config as GadgetConfig['series']} onChange={setConfig} />
      case 'huisdier':
        return <PetEditor value={config as GadgetConfig['huisdier']} onChange={setConfig} />
      case 'forum':
        return <ForumEditor value={config as GadgetConfig['forum']} onChange={setConfig} />
      case 'plakboek':
        return <ScrapbookEditor value={config as GadgetConfig['plakboek']} onChange={setConfig} />
      case 'blog':
        return <BlogGadgetEditor value={config as GadgetConfig['blog']} onChange={setConfig} />
      case 'mindfulness':
        return <MindfulnessGadgetEditor value={config as GadgetConfig['mindfulness']} onChange={setConfig} />
      case 'kuddesradio':
        return <KuddesRadioGadgetEditor value={config as GadgetConfig['kuddesradio']} onChange={setConfig} />
      case 'kuddesmuziek':
        return <KuddesMusicGadgetEditor value={config as GadgetConfig['kuddesmuziek']} onChange={setConfig} />
      case 'fotografie':
        return <PhotographyGadgetEditor value={config as GadgetConfig['fotografie']} onChange={setConfig} username={username} />
      case 'spelscores':
        return <ScoresEditor value={config as GadgetConfig['spelscores']} onChange={setConfig} />
      case 'bestanden':
        return <FilesEditor value={config as GadgetConfig['bestanden']} onChange={setConfig} />
      case 'rekenmachine':
        return <CalculatorEditor value={config as GadgetConfig['rekenmachine']} onChange={setConfig} />
      case 'woord':
      case 'rekenblad':
      case 'presentatie':
      case 'paint':
      case 'mindmap':
      case 'planner':
      case 'formulier':
      case 'kladblok':
        return <DocPickEditor kind={gadget.type} value={config as GadgetConfig['woord']} onChange={setConfig} />
    }
  })()

  return (
    <form
      className="gadget-form"
      onSubmit={(e) => {
        e.preventDefault()
        update.mutate({ id: gadget.id, title, config }, { onSuccess: onDone })
      }}
    >
      <Field label="Titel van de box">
        <input className="text-box" value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {body}
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={!dirty || update.isPending}>
          Opslaan
        </Button>
        <Button onClick={onDone}>Sluiten</Button>
        {update.isError && <span className="form-error">{errorMessage(update.error)}</span>}
      </div>
    </form>
  )
}

/** One gadget's settings in a window, right on the profile (the pencil on a gadget, or just after adding one). */
export function GadgetDialog({ gadget, username, onClose }: { gadget: Gadget; username: string; onClose: () => void }) {
  return (
    <Modal title={`${GADGET_TYPES[gadget.type].name} bewerken`} icon={GADGET_ICONS[gadget.type]} onClose={onClose} wide>
      <GadgetForm gadget={gadget} username={username} onDone={onClose} />
    </Modal>
  )
}
