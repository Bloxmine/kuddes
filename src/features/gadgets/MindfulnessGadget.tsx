/**
 * The Mindfulness gadget: breathe along with a circle (everyone can), a
 * mantra of the day, how the owner feels (set right here, with the last two
 * weeks as a row of smileys), and what they're grateful for.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import type { Gadget } from '../../../shared/api'
import {
  BREATH_PATTERNS,
  MANTRAS,
  MINDFULNESS_COLORS,
  MINDFULNESS_LIMITS,
  MINDFULNESS_PARTS,
  type BreathPattern,
  type GadgetConfig,
  type MindfulnessColor,
  type MindfulnessPart,
} from '../../../shared/gadgets'
import { MOODS } from '../../../shared/moods'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Smiley } from '../../lib/smileys'
import { formatTime } from '../../lib/time'
import { useGadgetActions } from './useGadgetActions'
import './MindfulnessGadget.css'

type Data = Extract<Gadget, { type: 'mindfulness' }>
type Config = GadgetConfig['mindfulness']

const PART_ICONS: Record<MindfulnessPart, Parameters<typeof FarmIcon>[0]['name']> = { adem: 'weather_sun_fog', mantra: 'flower', gevoel: 'heart', dankbaar: 'emotion_hand_flower' }

/** Today's mantra: the same all day, and for everyone looking. */
const dayIndex = (n: number) => Math.floor(Date.now() / 86_400_000) % Math.max(1, n)

export function MindfulnessGadget({ gadget, username, isOwner }: { gadget: Data; username: string; isOwner: boolean }) {
  const cfg = gadget.config
  const parts = (Object.keys(MINDFULNESS_PARTS) as MindfulnessPart[]).filter((p) => cfg.parts.includes(p))
  const [part, setPart] = useState<MindfulnessPart>(parts[0] ?? 'adem')
  const colors = MINDFULNESS_COLORS[cfg.color] ?? MINDFULNESS_COLORS.zee
  if (!parts.length) return <p className="empty">{isOwner ? 'Kies bij de instellingen wat deze gadget laat zien.' : 'Even niets hier.'}</p>
  const current = parts.includes(part) ? part : parts[0]
  return (
    <div className="mf" style={{ '--mf-a': colors.a, '--mf-b': colors.b } as CSSProperties}>
      {parts.length > 1 && (
        <nav className="mf-tabs" aria-label="Mindfulness">
          {parts.map((p) => (
            <button key={p} type="button" className={p === current ? 'current' : undefined} aria-pressed={p === current} onClick={() => setPart(p)} title={MINDFULNESS_PARTS[p]}>
              <FarmIcon name={PART_ICONS[p]} />
              <span>{MINDFULNESS_PARTS[p]}</span>
            </button>
          ))}
        </nav>
      )}
      {current === 'adem' && <Breathing id={gadget.id} pattern={cfg.breath} />}
      {current === 'mantra' && <Mantra own={cfg.mantras} />}
      {current === 'gevoel' && <Feeling gadget={gadget} username={username} isOwner={isOwner} />}
      {current === 'dankbaar' && <Grateful items={cfg.grateful} isOwner={isOwner} />}
    </div>
  )
}

const STEP_WORDS = { in: 'Adem in', vast: 'Houd vast', uit: 'Adem uit' } as const

/**
 * Breathing that runs until you stop it: where you are follows from when you
 * started (kept per gadget outside the component), so it carries on when the
 * profile redraws, and doesn't drift when the browser slows a background tab.
 */
const breathingSince = new Map<number, number>()
const now = () => Date.now()

function breathAt(steps: readonly (readonly ['in' | 'vast' | 'uit', number])[], elapsedMs: number) {
  const cycle = steps.reduce((n, [, sec]) => n + sec, 0)
  const t = (elapsedMs / 1000) % cycle
  let acc = 0
  for (let i = 0; i < steps.length; i++) {
    const [, sec] = steps[i]
    if (t < acc + sec) return { step: i, left: Math.ceil(acc + sec - t), rounds: Math.floor(elapsedMs / 1000 / cycle) }
    acc += sec
  }
  return { step: 0, left: steps[0][1], rounds: 0 }
}

/** The circle grows while you breathe in, stays while you hold, and shrinks while you breathe out. */
function Breathing({ id, pattern }: { id: number; pattern: BreathPattern }) {
  const steps = (BREATH_PATTERNS[pattern] ?? BREATH_PATTERNS.vierkant).steps
  const [since, setSince] = useState<number | null>(() => breathingSince.get(id) ?? null)
  const [clockNow, setClockNow] = useState(0)
  const running = since !== null

  useEffect(() => {
    if (since === null) return
    const tick = () => setClockNow(now())
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [since])

  const { step, left, rounds } = running && clockNow ? breathAt(steps, Math.max(0, clockNow - since)) : { step: 0, left: steps[0][1], rounds: 0 }
  const [kind, seconds] = steps[step]
  // Big after breathing in and while holding after it; small after breathing out
  const before = steps[(step - 1 + steps.length) % steps.length][0]
  const big = running && (kind === 'in' || (kind === 'vast' && before === 'in'))
  const start = () => {
    const t = now()
    breathingSince.set(id, t)
    setSince(t)
  }
  const stop = () => {
    breathingSince.delete(id)
    setSince(null)
  }
  return (
    <div className="mf-breath">
      <div className="mf-circle-wrap">
        <span className={big ? 'mf-circle big' : 'mf-circle'} style={{ transitionDuration: `${kind === 'vast' ? 0.3 : seconds}s` }} />
        <span className="mf-circle-text" aria-live="polite">
          {running ? (
            <>
              <b>{STEP_WORDS[kind]}</b>
              <span>{left}</span>
            </>
          ) : (
            <b>Klaar?</b>
          )}
        </span>
      </div>
      <p className="mf-hint muted">
        {BREATH_PATTERNS[pattern]?.name}: {BREATH_PATTERNS[pattern]?.hint}
        {rounds > 0 && ` · ${rounds} ${rounds === 1 ? 'ronde' : 'rondes'}`}
      </p>
      <Button variant={running ? 'default' : 'cta'} onClick={running ? stop : start}>
        <FarmIcon name={running ? 'control_pause' : 'control_play'} /> {running ? 'Stoppen' : 'Begin met ademen'}
      </Button>
    </div>
  )
}

function Mantra({ own }: { own: string[] }) {
  const list = own.length ? own : MANTRAS
  const [i, setI] = useState(() => dayIndex(list.length))
  const mantra = list[i % list.length]
  return (
    <div className="mf-mantra">
      <blockquote key={mantra}>{mantra}</blockquote>
      {list.length > 1 && (
        <button type="button" className="mf-link" onClick={() => setI((n) => (n + 1) % list.length)}>
          <FarmIcon name="arrow_refresh" /> Nog een
        </button>
      )}
    </div>
  )
}

function Feeling({ gadget, username, isOwner }: { gadget: Data; username: string; isOwner: boolean }) {
  const cfg = gadget.config
  const { update } = useGadgetActions(username)
  const [picking, setPicking] = useState(false)
  const [mood, setMood] = useState(cfg.feeling?.mood ?? '')
  const [note, setNote] = useState('')
  const save = () => {
    const at = new Date().toISOString()
    // One feeling per day in the row of the last two weeks: today's last one counts
    const today = at.slice(0, 10)
    const log = [...cfg.log.filter((l) => l.at.slice(0, 10) !== today), { mood, at }].slice(-MINDFULNESS_LIMITS.log)
    update.mutate({ id: gadget.id, config: { ...cfg, feeling: { mood, note: note.trim(), at }, log } satisfies Config })
    setPicking(false)
    setNote('')
  }
  const feeling = cfg.feeling && MOODS[cfg.feeling.mood] ? cfg.feeling : null
  return (
    <div className="mf-feeling">
      {feeling ? (
        <div className="mf-now">
          <span className="mf-now-smiley">
            <Smiley name={MOODS[feeling.mood].smiley} />
          </span>
          <span>
            <b>{MOODS[feeling.mood].label}</b>
            {feeling.note && <span className="mf-note">“{feeling.note}”</span>}
            <small className="muted">{formatTime(feeling.at)}</small>
          </span>
        </div>
      ) : (
        <p className="empty">{isOwner ? 'Hoe voel je je vandaag?' : 'Nog niets gedeeld.'}</p>
      )}
      {cfg.log.length > 1 && (
        <ol className="mf-log" aria-label="De laatste twee weken">
          {cfg.log.map((l) =>
            MOODS[l.mood] ? (
              <li key={l.at} title={`${MOODS[l.mood].label}, ${formatTime(l.at)}`}>
                <Smiley name={MOODS[l.mood].smiley} />
              </li>
            ) : null,
          )}
        </ol>
      )}
      {isOwner &&
        (picking ? (
          <div className="mf-pick">
            <div className="mf-moods" role="radiogroup" aria-label="Hoe voel je je?">
              {Object.entries(MOODS).map(([key, m]) => (
                <button key={key} type="button" role="radio" aria-checked={mood === key} className={mood === key ? 'current' : undefined} onClick={() => setMood(key)} title={m.label}>
                  <Smiley name={m.smiley} />
                  <small>{m.label}</small>
                </button>
              ))}
            </div>
            <input className="text-box" value={note} maxLength={MINDFULNESS_LIMITS.note} onChange={(e) => setNote(e.target.value)} placeholder="Waarom? (mag, hoeft niet)" aria-label="Toelichting" />
            <span className="mf-pick-actions">
              <Button variant="cta" onClick={save} disabled={!mood || update.isPending}>
                Delen
              </Button>
              <Button onClick={() => setPicking(false)}>Annuleren</Button>
            </span>
          </div>
        ) : (
          <button type="button" className="mf-link" onClick={() => setPicking(true)}>
            <FarmIcon name="heart" /> {feeling ? 'Hoe voel je je nu?' : 'Deel hoe je je voelt'}
          </button>
        ))}
    </div>
  )
}

function Grateful({ items, isOwner }: { items: string[]; isOwner: boolean }) {
  const list = items.filter(Boolean)
  if (!list.length) return <p className="empty">{isOwner ? 'Schrijf bij de instellingen van deze gadget drie dingen op waar je dankbaar voor bent.' : 'Nog niets opgeschreven.'}</p>
  return (
    <div className="mf-grateful">
      <p className="muted">Waar ik dankbaar voor ben:</p>
      <ol>
        {list.map((t, i) => (
          <li key={i}>
            <FarmIcon name="emotion_hand_flower" /> {t}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function MindfulnessGadgetEditor({ value, onChange }: { value: Config; onChange: (next: Config) => void }) {
  const togglePart = (p: MindfulnessPart) => onChange({ ...value, parts: value.parts.includes(p) ? value.parts.filter((x) => x !== p) : [...value.parts, p] })
  const grateful = [0, 1, 2].map((i) => value.grateful[i] ?? '')
  return (
    <div className="gadget-rows">
      <fieldset className="mf-edit-parts">
        <legend>Laat zien</legend>
        {(Object.keys(MINDFULNESS_PARTS) as MindfulnessPart[]).map((p) => (
          <label key={p} className="gadget-toggle">
            <input type="checkbox" checked={value.parts.includes(p)} onChange={() => togglePart(p)} /> <FarmIcon name={PART_ICONS[p]} /> {MINDFULNESS_PARTS[p]}
          </label>
        ))}
      </fieldset>
      <label className="gadget-toggle">
        Ademhaling{' '}
        <select className="text-box" value={value.breath} onChange={(e) => onChange({ ...value, breath: e.target.value as BreathPattern })}>
          {(Object.keys(BREATH_PATTERNS) as BreathPattern[]).map((b) => (
            <option key={b} value={b}>
              {BREATH_PATTERNS[b].name}
            </option>
          ))}
        </select>
      </label>
      <div className="mf-edit-colors" role="radiogroup" aria-label="Kleur">
        {(Object.keys(MINDFULNESS_COLORS) as MindfulnessColor[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.color === c}
            className={value.color === c ? 'current' : undefined}
            style={{ background: `linear-gradient(135deg, ${MINDFULNESS_COLORS[c].a}, ${MINDFULNESS_COLORS[c].b})` }}
            onClick={() => onChange({ ...value, color: c })}
          >
            {MINDFULNESS_COLORS[c].name}
          </button>
        ))}
      </div>
      <label className="mf-edit-block">
        <span>Eigen mantra’s, één per regel (leeg: die van Kuddes)</span>
        <textarea
          className="text-box"
          rows={4}
          value={value.mantras.join('\n')}
          onChange={(e) =>
            onChange({
              ...value,
              mantras: e.target.value
                .split('\n')
                .map((m) => m.slice(0, MINDFULNESS_LIMITS.mantra))
                .slice(0, MINDFULNESS_LIMITS.mantras),
            })
          }
          onBlur={() => onChange({ ...value, mantras: value.mantras.map((m) => m.trim()).filter(Boolean) })}
          placeholder={MANTRAS[0]}
        />
      </label>
      <div className="mf-edit-block">
        <span>Drie dingen waar je dankbaar voor bent</span>
        {grateful.map((g, i) => (
          <input
            key={i}
            className="text-box"
            value={g}
            maxLength={MINDFULNESS_LIMITS.gratefulItem}
            onChange={(e) => onChange({ ...value, grateful: grateful.map((x, j) => (j === i ? e.target.value : x)) })}
            placeholder={['Mijn vrienden', 'Een warme kop thee', 'Het weekend'][i]}
            aria-label={`Dankbaar ${i + 1}`}
          />
        ))}
      </div>
      <p className="muted">Hoe je je voelt deel je op je profiel zelf. Iedereen die je profiel ziet, ziet het ook.</p>
    </div>
  )
}
