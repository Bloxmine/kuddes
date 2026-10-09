import { useEffect, useState, type CSSProperties } from 'react'
import { MASTERMIND_MODES, PEG_COLOURS, type Guess, type MastermindView } from '../../../shared/games/mastermind'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { CardBoardProps } from './CardGames'
import './Mastermind.css'

const pegStyle = (c: number | null) => (c === null ? undefined : ({ '--peg': PEG_COLOURS[c].hex } as CSSProperties))

function Peg({ colour, small, onClick, selected, label }: { colour: number | null; small?: boolean; onClick?: () => void; selected?: boolean; label?: string }) {
  const cls = ['mmd-peg', colour === null && 'empty', small && 'small', selected && 'selected'].filter(Boolean).join(' ')
  const title = label ?? (colour === null ? 'Leeg' : PEG_COLOURS[colour].name)
  return onClick ? (
    <button type="button" className={cls} style={pegStyle(colour)} onClick={onClick} title={title} aria-label={title} />
  ) : (
    <span className={cls} style={pegStyle(colour)} title={title} aria-label={title} role="img" />
  )
}

/** The little pins next to a row: black for right colour and place, white for right colour only. */
function KeyPins({ guess, pegs }: { guess: Guess | null; pegs: number }) {
  const pins = guess ? [...Array(guess.black).fill('black'), ...Array(guess.white).fill('white')] : []
  return (
    <span className={`mmd-keys n${pegs}`} aria-label={guess ? `${guess.black} goed op de goede plek, ${guess.white} goede kleur op de verkeerde plek` : 'Nog niet geraden'}>
      {Array.from({ length: pegs }, (_, i) => (
        <span key={i} className={`mmd-pin ${pins[i] ?? ''}`} />
      ))}
    </span>
  )
}

/** A row being put together: click a colour to fill the next hole, click a peg to change it; or use the number keys. */
function RowEditor({ pegs, colours, onDone, label, busy }: { pegs: number; colours: number; onDone: (row: number[]) => void; label: string; busy: boolean }) {
  const [row, setRow] = useState<(number | null)[]>(() => Array(pegs).fill(null))
  const [at, setAt] = useState(0)
  const full = row.every((c) => c !== null)
  /** Fills the chosen hole, then moves on to the next empty one. */
  const put = (c: number) => {
    const next = row.map((x, i) => (i === at ? c : x))
    setRow(next)
    const after = next.findIndex((x, i) => x === null && i > at)
    const any = next.findIndex((x) => x === null)
    setAt(after >= 0 ? after : any >= 0 ? any : at)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return
      const n = Number(e.key)
      if (n >= 1 && n <= colours) put(n - 1)
      else if (e.key === 'Backspace') {
        setRow((r) => r.map((x, i) => (i === at ? null : x)))
      } else if (e.key === 'Enter' && full && !busy) onDone(row as number[])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="mmd-editor">
      <div className="mmd-editor-row" role="group" aria-label="Je rij">
        {row.map((c, i) => (
          <Peg key={i} colour={c} selected={i === at} onClick={() => (i === at && c !== null ? setRow((r) => r.map((x, j) => (j === i ? null : x))) : setAt(i))} label={`Plek ${i + 1}: ${c === null ? 'leeg' : PEG_COLOURS[c].name}`} />
        ))}
      </div>
      <div className="mmd-palette" role="group" aria-label="Kleuren">
        {PEG_COLOURS.slice(0, colours).map((p, i) => (
          <button key={p.name} type="button" className="mmd-peg big" style={pegStyle(i)} onClick={() => put(i)} title={`${p.name} (toets ${i + 1})`} aria-label={p.name}>
            <span className="mmd-key-hint">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="account-actions mmd-editor-actions">
        <Button
          onClick={() => {
            setRow(Array(pegs).fill(null))
            setAt(0)
          }}
          disabled={row.every((c) => c === null)}
        >
          Wissen
        </Button>
        <Button variant="cta" disabled={!full || busy} onClick={() => onDone(row as number[])}>
          <FarmIcon name="accept" /> {label}
        </Button>
      </div>
    </div>
  )
}

/**
 * The board: the hidden code at the top (only the maker sees it), the rows
 * of guesses with their pins, and for whoever's turn it is the row to fill.
 */
export function MastermindBoard({ view: v, my, myTurn, act, names, finished }: CardBoardProps<MastermindView>) {
  const { pegs, colours, rows } = MASTERMIND_MODES[v.mode]
  const [busy, setBusy] = useState(false)
  const iMake = v.maker === my
  const send = async (action: unknown) => {
    setBusy(true)
    try {
      await act(action)
    } finally {
      setBusy(false)
    }
  }
  const showCode = v.code !== null && (iMake || v.over || finished)

  return (
    <div className="mmd">
      <p className="mmd-roles">
        {iMake ? (
          <>
            <FarmIcon name="lock" /> Jij maakt de code, <b>{names[v.guesser]}</b> raadt. Volgende keer ruilen jullie.
          </>
        ) : (
          <>
            <FarmIcon name="magnifier" /> Jij raadt de code van <b>{names[v.maker]}</b>. Volgende keer ruilen jullie.
          </>
        )}{' '}
        <span className="muted">
          {MASTERMIND_MODES[v.mode].name}: {colours} kleuren, {pegs} pinnen, {rows} pogingen.
        </span>
      </p>

      <div className="mmd-board">
        <div className={showCode ? 'mmd-shield open' : 'mmd-shield'} aria-label={showCode ? 'De code' : 'De geheime code'}>
          {Array.from({ length: pegs }, (_, i) => (showCode ? <Peg key={i} colour={v.code![i]} /> : <span key={i} className="mmd-hidden">?</span>))}
        </div>

        <ol className="mmd-rows">
          {Array.from({ length: rows }, (_, i) => {
            const g = v.guesses[i] ?? null
            const current = !v.over && v.codeSet && i === v.guesses.length
            return (
              <li key={i} className={['mmd-row', current && 'current', g && g.black === pegs && 'cracked'].filter(Boolean).join(' ')}>
                <span className="mmd-n">{i + 1}</span>
                <span className="mmd-holes">
                  {Array.from({ length: pegs }, (_, k) => (
                    <Peg key={k} colour={g ? g.pegs[k] : null} />
                  ))}
                </span>
                <KeyPins guess={g} pegs={pegs} />
              </li>
            )
          })}
        </ol>
      </div>

      {!v.over && !finished && (
        <div className="mmd-action">
          {!v.codeSet ? (
            iMake ? (
              <>
                <h3>Verstop je geheime code</h3>
                <p className="muted">Kies {pegs} kleuren; dezelfde kleur mag vaker. {names[v.guesser]} ziet de code pas als het spel voorbij is.</p>
                <RowEditor key="code" pegs={pegs} colours={colours} label="Code verstoppen" busy={busy} onDone={(row) => void send({ code: row })} />
              </>
            ) : (
              <p className="mmd-wait">
                <FarmIcon name="hourglass" /> {names[v.maker]} verstopt de code…
              </p>
            )
          ) : myTurn ? (
            <>
              <h3>
                Poging {v.guesses.length + 1} van {rows}
              </h3>
              <RowEditor key={`g${v.guesses.length}`} pegs={pegs} colours={colours} label="Raden" busy={busy} onDone={(row) => void send({ guess: row })} />
            </>
          ) : (
            <p className="mmd-wait">
              <FarmIcon name="hourglass" /> {names[v.guesser]} denkt na… ({v.guesses.length} van {rows} pogingen)
            </p>
          )}
        </div>
      )}

      {(v.over || finished) && (
        <p className="mmd-end">
          {v.solved
            ? `${v.guesser === my ? 'Je hebt' : `${names[v.guesser]} heeft`} de code gekraakt in ${v.guesses.length} ${v.guesses.length === 1 ? 'poging' : 'pogingen'}!`
            : v.guesses.length >= rows
              ? `De code bleef geheim: ${v.maker === my ? 'jij wint' : `${names[v.maker]} wint`}.`
              : 'Het spel is gestopt.'}
        </p>
      )}

      <p className="mmd-legend muted">
        <span className="mmd-pin black" /> goede kleur op de goede plek · <span className="mmd-pin white" /> goede kleur, verkeerde plek
      </p>
    </div>
  )
}
