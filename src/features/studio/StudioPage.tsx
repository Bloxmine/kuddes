import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DRUM_SOUNDS,
  STEPS_PER_BAR,
  STUDIO_LIMITS,
  SYNTH_SOUNDS,
  type DrumSound,
  type PatternPart,
  type StudioChannel,
  type StudioPattern,
  type StudioProject,
  type SynthSound,
} from '../../../shared/studio'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { OfficeLoader, OpenDialog } from '../office/Office'
import { useOfficeFile, type OfficeFile } from '../office/officeFile'
import { ChannelRack } from './ChannelRack'
import { Player, renderWav, type PlayMode } from './engine'
import { Knob } from './Knob'
import { PianoRoll } from './PianoRoll'
import { Playlist } from './Playlist'
import { ShareDialog } from './ShareDialog'
import { emptyPart, lcdPosition, lcdTime, newChannel, newId, newPattern, newProject, noteName } from './studio'
import './Studio.css'

/** GarageBand's Musical Typing: the middle row is the white keys, the row above the black ones. */
const TYPING: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 }

/** What's coming later: shown, so you know, but not working yet. */
const SOON: [FarmIconName, string, string][] = [
  ['microphone', 'Opnemen', 'Je stem of een instrument opnemen'],
  ['sound', 'Mixer en effecten', 'Galm, echo, EQ en compressie per kanaal'],
  ['chart_line', 'Automatisering', 'Volume en filters die meebewegen in je nummer'],
  ['folder', 'Eigen samples', 'Je eigen geluiden uploaden'],
  ['cd', 'Loops', 'Kant-en-klare loops om in je nummer te slepen'],
  ['keyboard', 'MIDI-keyboard', 'Spelen op een echt keyboard aan je computer'],
]

type Views = { browser: boolean; playlist: boolean; rack: boolean; roll: boolean }

/** Kuddes Studio (/tools/studio): make beats and songs, like FL Studio with a GarageBand top. */
export function StudioPage() {
  return <OfficeLoader<StudioProject> kind="studio">{(file) => <Studio file={file} />}</OfficeLoader>
}

function Studio({ file }: { file: OfficeFile<StudioProject> | null }) {
  const navigate = useNavigate()
  const [project, setProject] = useState<StudioProject>(() => file?.content ?? newProject())
  const ref = useRef(project)
  const snapshot = useCallback(() => ({ content: ref.current, words: ref.current.patterns.length }), [])
  const doc = useOfficeFile<StudioProject>('studio', file, snapshot)
  const [patId, setPatId] = useState(project.patterns[0].id)
  const [chId, setChId] = useState<string | null>(() => project.channels.find((c) => c.type === 'synth')?.id ?? null)
  const [song, setSong] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState<number | null>(null)
  const [metronome, setMetronome] = useState(false)
  const [octave, setOctave] = useState(4)
  const [views, setViews] = useState<Views>({ browser: true, playlist: true, rack: true, roll: true })
  const [menu, setMenu] = useState(false)
  const [opening, setOpening] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [share, setShare] = useState<'muziek' | 'radio' | null>(null)

  const pattern = project.patterns.find((p) => p.id === patId) ?? project.patterns[0]
  const channel = project.channels.find((c) => c.id === chId) ?? null
  const rollChannel = channel?.type === 'synth' ? channel : (project.channels.find((c) => c.type === 'synth') ?? null)
  const mode: PlayMode = song ? { song: true } : { song: false, pattern: pattern.id }

  // ---------------------------------------------------------------- sound
  const playerRef = useRef<Player | null>(null)
  const [blocked, setBlocked] = useState(false)
  /** The player, made on the first click (browsers only allow sound after one); a closed one is replaced. */
  const player = () => {
    if (!playerRef.current || playerRef.current.ctx.state === 'closed') {
      const p = new Player(new AudioContext(), () => ref.current)
      const ctx = p.ctx as AudioContext
      ctx.onstatechange = () => setBlocked(ctx.state === 'suspended' && p.playing)
      playerRef.current = p
    }
    return playerRef.current
  }
  const currentPlayer = useCallback(() => playerRef.current, [])
  useEffect(
    () => () => {
      // Also after a hot reload while developing: the next click makes a new one
      playerRef.current?.close()
      playerRef.current = null
    },
    [],
  )
  useEffect(() => {
    const p = playerRef.current
    if (!p) return
    p.mode = song ? { song: true } : { song: false, pattern: pattern.id }
    p.metronome = metronome
  }, [song, pattern.id, metronome])
  // The play line follows what you hear
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      setPos(playerRef.current?.position() ?? null)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const togglePlay = () => {
    const p = player()
    if (p.playing) {
      p.stop()
      setPlaying(false)
      setPos(null)
    } else {
      p.mode = mode
      p.metronome = metronome
      p.start(0)
      setPlaying(true)
      // Some browsers keep the sound off until you allow it; say so instead of staying silent
      setTimeout(() => setBlocked(p.playing && p.ctx.state === 'suspended'), 500)
    }
  }
  const toStart = () => {
    const p = playerRef.current
    if (!p?.playing) return setPos(null)
    p.stop()
    p.start(0)
  }

  // ---------------------------------------------------------------- changes and undo
  const undoStack = useRef<StudioProject[]>([])
  const redoStack = useRef<StudioProject[]>([])
  const lastChange = useRef(0)
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const counted = () => setHistory({ undo: undoStack.current.length, redo: redoStack.current.length })
  const apply = (next: StudioProject) => {
    ref.current = next
    setProject(next)
    doc.changed()
    playerRef.current?.sync()
  }
  /** A change; quick ones after each other (turning a knob, dragging a note) undo as one. */
  const change = (f: (p: StudioProject) => StudioProject) => {
    const prev = ref.current
    const next = f(prev)
    if (next === prev) return
    const now = Date.now()
    if (now - lastChange.current > 600) {
      undoStack.current = [...undoStack.current.slice(-99), prev]
      redoStack.current = []
      counted()
    }
    lastChange.current = now
    apply(next)
  }
  const undo = () => {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(ref.current)
    lastChange.current = 0
    apply(prev)
    counted()
  }
  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(ref.current)
    lastChange.current = 0
    apply(next)
    counted()
  }

  const setChannel = (id: string, patch: Partial<StudioChannel>) => change((p) => ({ ...p, channels: p.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  const setPattern = (id: string, f: (pt: StudioPattern) => StudioPattern) => change((p) => ({ ...p, patterns: p.patterns.map((pt) => (pt.id === id ? f(pt) : pt)) }))
  const setPart = (channelId: string, f: (part: PatternPart) => PatternPart) =>
    setPattern(pattern.id, (pt) => ({ ...pt, parts: { ...pt.parts, [channelId]: f(pt.parts[channelId] ?? emptyPart()) } }))

  const addChannel = (type: 'drum' | 'synth', sound: DrumSound | SynthSound) => {
    if (ref.current.channels.length >= STUDIO_LIMITS.channels) return alert(`Je kunt maximaal ${STUDIO_LIMITS.channels} kanalen hebben.`)
    const ch = newChannel(type, sound, ref.current.channels.length)
    change((p) => ({ ...p, channels: [...p.channels, ch] }))
    setChId(ch.id)
    player().preview(ch)
  }
  const removeChannel = (ch: StudioChannel) => {
    const used = ref.current.patterns.some((pt) => pt.parts[ch.id]?.steps.some((v) => v > 0) || pt.parts[ch.id]?.notes.length)
    if (used && !confirm(`“${ch.name}” weghalen, met alles wat het speelt?`)) return
    change((p) => ({
      ...p,
      channels: p.channels.filter((c) => c.id !== ch.id),
      patterns: p.patterns.map((pt) => ({ ...pt, parts: Object.fromEntries(Object.entries(pt.parts).filter(([id]) => id !== ch.id)) })),
    }))
  }
  const addPattern = (copy: boolean) => {
    if (ref.current.patterns.length >= STUDIO_LIMITS.patterns) return alert(`Je kunt maximaal ${STUDIO_LIMITS.patterns} patronen hebben.`)
    const n = ref.current.patterns.length + 1
    const pt = copy ? { ...structuredClone(pattern), id: newId(), name: `${pattern.name} (kopie)`.slice(0, STUDIO_LIMITS.name) } : newPattern(n, pattern.length)
    change((p) => ({ ...p, patterns: [...p.patterns, pt] }))
    setPatId(pt.id)
  }
  const removePattern = () => {
    if (ref.current.patterns.length < 2 || !confirm(`“${pattern.name}” weghalen, ook uit de afspeellijst?`)) return
    const rest = ref.current.patterns.filter((p) => p.id !== pattern.id)
    change((p) => ({ ...p, patterns: rest, playlist: p.playlist.filter((c) => c.pattern !== pattern.id) }))
    setPatId(rest[0].id)
  }

  // ---------------------------------------------------------------- keys
  const held = useRef(new Map<string, number>())
  const latest = useRef({ togglePlay, undo, redo, save: doc.save, rollChannel, octave })
  useEffect(() => {
    latest.current = { togglePlay, undo, redo, save: doc.save, rollChannel, octave }
  })
  useEffect(() => {
    const typingIn = (e: KeyboardEvent) => (e.target as HTMLElement).closest('input, select, textarea')
    const down = (e: KeyboardEvent) => {
      if (typingIn(e)) return
      const k = e.key.toLowerCase()
      const l = latest.current
      if (e.ctrlKey || e.metaKey) {
        if (k === 's') l.save()
        else if (k === 'z' && !e.shiftKey) l.undo()
        else if (k === 'y' || (k === 'z' && e.shiftKey)) l.redo()
        else return
        e.preventDefault()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        if (!e.repeat) l.togglePlay()
      } else if (k === 'z' || k === 'x') setOctave((o) => Math.max(1, Math.min(6, o + (k === 'z' ? -1 : 1))))
      else if (k in TYPING && l.rollChannel && !e.altKey) {
        e.preventDefault()
        if (e.repeat || held.current.has(k)) return
        const key = Math.min(STUDIO_LIMITS.highKey, (l.octave + 1) * 12 + TYPING[k])
        held.current.set(k, key)
        player().noteOn(l.rollChannel, key)
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const key = held.current.get(k)
      if (key === undefined) return
      held.current.delete(k)
      const ch = latest.current.rollChannel
      if (ch) playerRef.current?.noteOff(ch, key)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // player() only makes the player the first time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------- file
  const exportWav = async (whole: boolean) => {
    setMenu(false)
    setExporting(true)
    try {
      const blob = await renderWav(ref.current, whole ? { song: true } : { song: false, pattern: pattern.id })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${doc.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Mijn beat'}${whole ? '' : ` - ${pattern.name}`}.wav`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } finally {
      setExporting(false)
    }
  }
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => !(e.target as HTMLElement).closest('.std-filemenu') && setMenu(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const stepSeconds = 60 / project.tempo / 4
  const localPos = pos === null ? null : song ? null : pos % pattern.length
  // In the song, the rack and roll follow the pattern under the play line on the chosen pattern's clip
  const songLocal = (() => {
    if (pos === null || !song) return null
    const bar = Math.floor(pos / STEPS_PER_BAR)
    const clip = project.playlist.find((c) => c.pattern === pattern.id && bar >= c.bar && bar < c.bar + pattern.length / STEPS_PER_BAR)
    return clip ? pos - clip.bar * STEPS_PER_BAR : null
  })()
  const patternPos = song ? songLocal : localPos
  const toggleView = (k: keyof Views) => setViews((v) => ({ ...v, [k]: !v[k] }))

  return (
    <main className="page std-page">
      <div className="std-app">
        <header className="std-top">
          <div className="std-menubar">
            <div className="std-filemenu">
              <button type="button" className="std-menu-btn" onClick={() => setMenu(!menu)} aria-expanded={menu}>
                Bestand ▾
              </button>
              {menu && (
                <ul className="std-menu" role="menu">
                  <li>
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), navigate('/tools/studio'))}>
                      <FarmIcon name="page_white_add" /> Nieuw project
                    </button>
                  </li>
                  <li>
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), setOpening(true))}>
                      <FarmIcon name="folder_page" /> Openen…
                    </button>
                  </li>
                  <li>
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), doc.save())}>
                      <FarmIcon name="diskette" /> Opslaan <kbd>Ctrl+S</kbd>
                    </button>
                  </li>
                  <li>
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), doc.saveAs())}>
                      <FarmIcon name="diskette" /> Opslaan als…
                    </button>
                  </li>
                  <li className="sep">
                    <button type="button" role="menuitem" onClick={() => void exportWav(false)}>
                      <FarmIcon name="sound" /> Exporteren: dit patroon (WAV)
                    </button>
                  </li>
                  <li>
                    <button type="button" role="menuitem" onClick={() => void exportWav(true)} disabled={!project.playlist.length}>
                      <FarmIcon name="cd" /> Exporteren: hele nummer (WAV)
                    </button>
                  </li>
                  <li className="sep">
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), setShare('muziek'))}>
                      <FarmIcon name="cd" /> Op Kuddes Muziek zetten…
                    </button>
                  </li>
                  <li>
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), setShare('radio'))}>
                      <FarmIcon name="transmit" /> Jingle voor Kuddes Radio…
                    </button>
                  </li>
                  {doc.remove && (
                    <li className="sep">
                      <button type="button" role="menuitem" onClick={() => (setMenu(false), doc.remove?.())}>
                        <FarmIcon name="cross" /> Verwijderen
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            <button type="button" className="std-menu-btn" onClick={undo} disabled={!history.undo} title="Ongedaan maken (Ctrl+Z)">
              ↶
            </button>
            <button type="button" className="std-menu-btn" onClick={redo} disabled={!history.redo} title="Opnieuw (Ctrl+Y)">
              ↷
            </button>
            <input className="std-title" value={doc.title} maxLength={80} onChange={(e) => doc.setTitle(e.target.value)} aria-label="Naam van het project" />
            <span className="std-status">{exporting ? 'Exporteren…' : doc.status}</span>
            <span className="std-brand">
              <FarmIcon name="drum" /> Kuddes Studio
            </span>
            <Link to="/tools" className="std-close" title="Sluiten (terug naar Tools)" aria-label="Sluiten">
              ×
            </Link>
          </div>

          <div className="std-transport">
            <div className="std-buttons">
              <button type="button" className="std-tbtn" onClick={toStart} title="Naar het begin" aria-label="Naar het begin">
                <span className="g-start" />
              </button>
              <button
                type="button"
                className={playing ? 'std-tbtn play on' : 'std-tbtn play'}
                onClick={togglePlay}
                title="Afspelen of stoppen (spatiebalk)"
                aria-label={playing ? 'Stoppen' : 'Afspelen'}
              >
                <span className={playing ? 'g-stop' : 'g-play'} />
              </button>
              <button type="button" className="std-tbtn rec" disabled title="Opnemen: komt binnenkort" aria-label="Opnemen (binnenkort)">
                <span className="g-rec" />
              </button>
            </div>
            <div className="std-mode" role="radiogroup" aria-label="Wat speelt er">
              <button
                type="button"
                role="radio"
                aria-checked={!song}
                className={!song ? 'on' : undefined}
                onClick={() => setSong(false)}
                title="Alleen het gekozen patroon, steeds opnieuw"
              >
                <i /> PAT
              </button>
              <button type="button" role="radio" aria-checked={song} className={song ? 'on' : undefined} onClick={() => setSong(true)} title="Het hele nummer uit de afspeellijst">
                <i /> SONG
              </button>
            </div>
            <div className="std-lcd" aria-live="off">
              <div className="std-lcd-cell">
                <small>MAAT · TEL · STAP</small>
                <b>{lcdPosition(pos ?? 0)}</b>
              </div>
              <div className="std-lcd-cell">
                <small>TIJD</small>
                <b>{lcdTime((pos ?? 0) * stepSeconds)}</b>
              </div>
              <label className="std-lcd-cell">
                <small>TEMPO</small>
                <span>
                  <input
                    type="number"
                    min={STUDIO_LIMITS.minTempo}
                    max={STUDIO_LIMITS.maxTempo}
                    value={project.tempo}
                    onChange={(e) => {
                      const t = Number(e.target.value)
                      if (t >= STUDIO_LIMITS.minTempo && t <= STUDIO_LIMITS.maxTempo) change((p) => ({ ...p, tempo: t }))
                    }}
                    aria-label="Tempo in slagen per minuut"
                  />
                  bpm
                </span>
              </label>
              <div className="std-lcd-cell small">
                <small>MAATSOORT</small>
                <b>4/4</b>
              </div>
            </div>
            <div className="std-knobs">
              <label className="std-knob-label">
                <Knob
                  value={project.swing}
                  min={0}
                  max={100}
                  reset={0}
                  size={30}
                  label="Swing"
                  shown={`${Math.round(project.swing)}%`}
                  onChange={(swing) => change((p) => ({ ...p, swing }))}
                />
                Swing
              </label>
              <button type="button" className={metronome ? 'std-metro on' : 'std-metro'} onClick={() => setMetronome(!metronome)} aria-pressed={metronome} title="Metronoom">
                <FarmIcon name="bell" /> Tik
              </button>
              <label className="std-master">
                <FarmIcon name="sound_low" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={project.master}
                  onChange={(e) => change((p) => ({ ...p, master: Number(e.target.value) }))}
                  aria-label="Hoofdvolume"
                />
              </label>
              <Meter player={currentPlayer} active={playing} />
            </div>
          </div>
        </header>

        {blocked && (
          <p className="std-blocked" role="alert">
            Je browser laat het geluid nog niet door.{' '}
            <button type="button" onClick={() => void (playerRef.current?.ctx as AudioContext | undefined)?.resume().then(() => setBlocked(false))}>
              Geluid aanzetten
            </button>
          </p>
        )}
        <nav className="std-views" aria-label="Vensters">
          {(
            [
              ['browser', 'folder', 'Bibliotheek'],
              ['playlist', 'text_list_numbers', 'Afspeellijst'],
              ['rack', 'drum', 'Kanalen'],
              ['roll', 'piano', 'Pianorol'],
            ] as const
          ).map(([k, icon, name]) => (
            <button key={k} type="button" className={views[k] ? 'on' : undefined} onClick={() => toggleView(k)} aria-pressed={views[k]}>
              <FarmIcon name={icon} /> {name}
            </button>
          ))}
          <button type="button" className="std-share-btn" onClick={() => setShare('muziek')} title="Je nummer op je artiestenpagina zetten">
            <FarmIcon name="cd" /> Naar Kuddes Muziek
          </button>
          <button type="button" className="std-share-btn" onClick={() => setShare('radio')} title="Een geluidsknop voor je radiozender maken">
            <FarmIcon name="transmit" /> Jingle voor Kuddes Radio
          </button>
          <span className="std-soon-label">Binnenkort:</span>
          {SOON.map(([icon, name, hint]) => (
            <button key={name} type="button" className="std-soon" disabled title={`${hint} (komt binnenkort)`}>
              <FarmIcon name={icon} /> {name}
            </button>
          ))}
        </nav>

        <div className="std-work">
          {views.browser && (
            <aside className="std-browser" aria-label="Bibliotheek">
              <h2>Drums</h2>
              <ul>
                {(Object.keys(DRUM_SOUNDS) as DrumSound[]).map((s) => (
                  <li key={s}>
                    <button type="button" className="std-try" onClick={() => player().preview({ ...newChannel('drum', s, 0), id: `try-${s}` })} title="Laten horen">
                      <FarmIcon name="drum" size={16} /> {DRUM_SOUNDS[s]}
                    </button>
                    <button type="button" className="std-add" onClick={() => addChannel('drum', s)} title="Als kanaal toevoegen" aria-label={`${DRUM_SOUNDS[s]} toevoegen`}>
                      +
                    </button>
                  </li>
                ))}
              </ul>
              <h2>Instrumenten</h2>
              <ul>
                {(Object.keys(SYNTH_SOUNDS) as SynthSound[]).map((s) => (
                  <li key={s}>
                    <button type="button" className="std-try" onClick={() => player().preview({ ...newChannel('synth', s, 0), id: `try-${s}` }, 60)} title="Laten horen">
                      <FarmIcon name="piano" size={16} /> {SYNTH_SOUNDS[s]}
                    </button>
                    <button type="button" className="std-add" onClick={() => addChannel('synth', s)} title="Als kanaal toevoegen" aria-label={`${SYNTH_SOUNDS[s]} toevoegen`}>
                      +
                    </button>
                  </li>
                ))}
              </ul>
              <h2>Samples en loops</h2>
              <p className="std-hint">Eigen geluiden en kant-en-klare loops komen binnenkort.</p>
            </aside>
          )}

          <div className="std-panels">
            {views.playlist && (
              <section className="std-win">
                <h2>
                  <FarmIcon name="text_list_numbers" size={16} /> Afspeellijst <small>Klik om “{pattern.name}” neer te zetten · slepen: verplaatsen · rechtsklik: weg</small>
                </h2>
                <Playlist
                  project={project}
                  current={pattern.id}
                  playing={song ? pos : null}
                  onAdd={(track, bar) => change((p) => ({ ...p, playlist: [...p.playlist, { id: newId(), pattern: pattern.id, track, bar }] }))}
                  onMove={(clip, track, bar) => change((p) => ({ ...p, playlist: p.playlist.map((c) => (c.id === clip.id ? { ...c, track, bar } : c)) }))}
                  onRemove={(clip) => change((p) => ({ ...p, playlist: p.playlist.filter((c) => c.id !== clip.id) }))}
                  onPick={setPatId}
                />
              </section>
            )}

            {views.rack && (
              <section className="std-win">
                <h2>
                  <FarmIcon name="drum" size={16} /> Kanalen
                  <span className="std-patbar">
                    <select value={pattern.id} onChange={(e) => setPatId(e.target.value)} aria-label="Patroon" style={{ borderColor: pattern.color }}>
                      {project.patterns.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => addPattern(false)} title="Nieuw patroon">
                      + Nieuw
                    </button>
                    <button type="button" onClick={() => addPattern(true)} title="Dit patroon kopiëren">
                      Kopie
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const name = prompt('Naam van het patroon:', pattern.name)?.trim()
                        if (name) setPattern(pattern.id, (pt) => ({ ...pt, name: name.slice(0, STUDIO_LIMITS.name) }))
                      }}
                    >
                      Naam
                    </button>
                    <button type="button" onClick={removePattern} disabled={project.patterns.length < 2} title="Patroon weghalen">
                      ×
                    </button>
                  </span>
                </h2>
                <ChannelRack
                  project={project}
                  pattern={pattern}
                  selected={chId}
                  playing={patternPos}
                  onSelect={(ch) => {
                    setChId(ch.id)
                    player().preview(ch)
                  }}
                  onChannel={setChannel}
                  onPart={setPart}
                  onHit={(ch) => !playerRef.current?.playing && player().preview(ch)}
                  onRemove={removeChannel}
                  onPattern={(patch) => setPattern(pattern.id, (pt) => ({ ...pt, ...patch }))}
                  onOpenRoll={(ch) => {
                    setChId(ch.id)
                    setViews((v) => ({ ...v, roll: true }))
                  }}
                />
              </section>
            )}

            {views.roll && (
              <section className="std-win">
                <h2>
                  <FarmIcon name="piano" size={16} /> Pianorol <small>{pattern.name}</small>
                  <span className="std-octave">
                    Typen: octaaf {octave} ({noteName((octave + 1) * 12)}) · Z/X
                  </span>
                </h2>
                {rollChannel ? (
                  <PianoRoll
                    key={`${rollChannel.id}-${pattern.id}`}
                    channel={rollChannel}
                    pattern={pattern}
                    part={pattern.parts[rollChannel.id] ?? emptyPart()}
                    playing={patternPos}
                    onPart={(f) => setPart(rollChannel.id, f)}
                    onPreview={(key) => player().preview(rollChannel, key)}
                  />
                ) : (
                  <p className="std-hint std-pad">Voeg een instrument toe (links bij Instrumenten) om noten te schrijven.</p>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
      {share && <ShareDialog target={share} project={project} title={doc.title} pattern={pattern} onClose={() => setShare(null)} />}
      {opening && <OpenDialog kind="studio" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
    </main>
  )
}

/** The green-to-red level meter, redrawn on its own so the rest doesn't have to. */
function Meter({ player, active }: { player: () => Player | null; active: boolean }) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf = 0
    let shown = 0
    const loop = () => {
      // Up at once, down slowly, as a real meter
      shown = Math.max(player()?.level() ?? 0, shown * 0.9)
      setLevel(Math.round(shown * 40) / 40)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      setLevel(0)
    }
  }, [active, player])
  return (
    <span className="std-meter" role="meter" aria-label="Niveau" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
      <span style={{ width: `${level * 100}%` }} />
    </span>
  )
}
