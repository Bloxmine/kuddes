/** The boards of the card games the server referees: Memory, Stapelgek and Kleurwissel. */
import { useEffect, useState, type CSSProperties } from 'react'
import { canPlay, COLOURS, type Card, type Colour, type KleurView } from '../../../shared/games/kleurwissel'
import { MEMORY_FACES, type MemoryView } from '../../../shared/games/memory'
import { JOKER, type From, type StapelView } from '../../../shared/games/stapelgek'
import { FarmIcon } from '../../components/ui/FarmIcon'
import './NewGames.css'
import type { FarmIconName } from '../../components/ui/farmIcons'

type Player = number
/** `names`: everyone's name by seat ("Jij" for you); `opponent`: the (first) other player. */
export type CardBoardProps<V> = { view: V; my: Player; myTurn: boolean; act: (action: unknown) => Promise<void>; opponent: string; names: string[]; finished: boolean }

// ------------------------------------------------------------ Memory

/** How long two cards that don't match stay face up. */
const MISS_MS = 1600

export function MemoryBoard({ view, my, myTurn, act }: CardBoardProps<MemoryView>) {
  // Cards that didn't match turn back after a moment (the server shows them until the next card)
  const missKey = view.cards.map((c, i) => (c.miss ? i : -1)).filter((i) => i >= 0).join(',')
  const [hidden, setHidden] = useState('')
  useEffect(() => {
    if (!missKey) return
    const t = window.setTimeout(() => setHidden(missKey), MISS_MS)
    return () => window.clearTimeout(t)
  }, [missKey, view.turned])
  return (
    <div className="mm-board" role="grid" aria-label="Memorykaarten">
      {view.cards.map((c, i) => {
        const shown = c.face !== null && !(c.miss && hidden === missKey)
        const mine = c.owner === my
        const classes = ['mm-card', shown && 'up', c.owner !== null && (mine ? 'mine' : 'theirs'), c.open && 'open', c.miss && 'miss']
        return (
          <button
            key={i}
            type="button"
            className={classes.filter(Boolean).join(' ')}
            disabled={!myTurn || c.owner !== null || c.open}
            onClick={() => void act({ flip: i })}
            aria-label={shown && c.face !== null ? MEMORY_FACES[c.face] : `Kaart ${i + 1}`}
          >
            <span className="mm-inner">
              <span className="mm-back" aria-hidden="true" />
              <span className="mm-front" aria-hidden="true">
                {c.face !== null && <FarmIcon name={MEMORY_FACES[c.face] as FarmIconName} size={32} />}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------ Stapelgek

/** Numbers 1–4 blue, 5–8 green, 9–12 red, jokers gold. */
const stapelClass = (v: number) => (v === JOKER ? 'joker' : v <= 4 ? 'b' : v <= 8 ? 'g' : 'r')

function StapelCard({ value, small, style }: { value: number | null; small?: boolean; style?: CSSProperties }) {
  if (value === null) return <span className={small ? 'sg-card empty small' : 'sg-card empty'} style={style} />
  return (
    <span className={['sg-card', stapelClass(value), small && 'small'].filter(Boolean).join(' ')} style={style}>
      <b>{value === JOKER ? '★' : value}</b>
      {value === JOKER && <i>joker</i>}
    </span>
  )
}

type Pick = { from: From; i: number } | null

export function StapelgekBoard({ view, my, myTurn, act, names }: CardBoardProps<StapelView>) {
  // A pick belongs to the moment it was made: after any move it's gone
  const [pickState, setPicked] = useState<{ pick: Pick; count: number }>({ pick: null, count: view.count })
  const pick = pickState.count === view.count ? pickState.pick : null
  const setPick = (p: Pick) => setPicked({ pick: p, count: view.count })
  // The others, starting with who plays after you
  const seats = view.handCounts.length
  const opponents = Array.from({ length: seats - 1 }, (_, k) => (my + 1 + k) % seats)
  const cardOf = (p: Pick): number | null => {
    if (!p) return null
    if (p.from === 'hand') return view.hand[p.i] ?? null
    if (p.from === 'stapel') return view.stockTop[my]
    const pile = view.discards[my][p.i]
    return pile[pile.length - 1] ?? null
  }
  const picked = cardOf(pick)
  const fits = (pile: number) => picked !== null && (picked === JOKER || picked === view.build[pile].next)
  const select = (p: Pick) => myTurn && setPick(pick && p && pick.from === p.from && pick.i === p.i ? null : p)

  const discards = (p: Player) => (
    <div className="sg-discards">
      {view.discards[p].map((pile, i) => {
        const canDiscardHere = p === my && myTurn && pick?.from === 'hand'
        const isPicked = pick?.from === 'afleg' && pick.i === i && p === my
        return (
          <button
            key={i}
            type="button"
            className={['sg-pile', 'discard', canDiscardHere && 'target', isPicked && 'picked'].filter(Boolean).join(' ')}
            disabled={p !== my || !myTurn || (!canDiscardHere && !pile.length)}
            onClick={() => {
              if (canDiscardHere) void act({ t: 'afleg', i: pick!.i, pile: i })
              else select({ from: 'afleg', i })
            }}
            title={canDiscardHere ? 'Leg hier af en eindig je beurt' : 'Aflegstapel'}
          >
            {pile.length ? pile.slice(-4).map((v, k) => <StapelCard key={k} value={v} small style={{ '--k': k } as CSSProperties} />) : <StapelCard value={null} small />}
          </button>
        )
      })}
    </div>
  )

  const stock = (p: Player) => (
    <button
      type="button"
      className={['sg-pile', 'stock', pick?.from === 'stapel' && p === my && 'picked'].filter(Boolean).join(' ')}
      disabled={p !== my || !myTurn || view.stockTop[p] === null}
      onClick={() => select({ from: 'stapel', i: 0 })}
      title="Je eigen stapel: speel die leeg om te winnen"
    >
      <StapelCard value={view.stockTop[p]} />
      <span className="sg-count">{view.stockLeft[p]} over</span>
    </button>
  )

  return (
    <div className="sg-board">
      <div className={opponents.length > 1 ? 'sg-opponents many' : 'sg-opponents'}>
        {opponents.map((them) => (
          <div key={them} className={['sg-side', 'theirs', view.turn === them && 'turn', view.out[them] && 'out'].filter(Boolean).join(' ')}>
            <div className="sg-label">
              {names[them]}
              {view.out[them] && ' (gestopt)'}
            </div>
            {stock(them)}
            {discards(them)}
            <div className="sg-hand-backs" aria-label={`${view.handCounts[them]} kaarten in de hand`}>
              {Array.from({ length: view.handCounts[them] }, (_, i) => (
                <span key={i} className="sg-card back small" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sg-middle">
        <div className="sg-draw" title="Trekstapel">
          <span className="sg-card back" />
          <span className="sg-count">{view.drawLeft}</span>
        </div>
        {view.build.map((b, i) => (
          <button
            key={i}
            type="button"
            className={['sg-pile', 'build', fits(i) && 'target'].filter(Boolean).join(' ')}
            disabled={!myTurn || !fits(i)}
            onClick={() => pick && void act({ t: 'bouw', from: pick.from, i: pick.i, pile: i })}
            title={`Bouwstapel: hier moet een ${b.next}`}
          >
            {b.top !== null ? <StapelCard value={b.top === JOKER ? b.size : b.top} /> : <StapelCard value={null} />}
            <span className="sg-count">nu: {b.next}</span>
          </button>
        ))}
      </div>

      <div className="sg-side mine">
        <div className="sg-label">Jij</div>
        {stock(my)}
        {discards(my)}
        <div className="sg-hand">
          {view.hand.map((v, i) => (
            <button key={i} type="button" className={['sg-hand-card', pick?.from === 'hand' && pick.i === i && 'picked'].filter(Boolean).join(' ')} disabled={!myTurn} onClick={() => select({ from: 'hand', i })}>
              <StapelCard value={v} />
            </button>
          ))}
          {myTurn && !view.hand.length && (
            <button type="button" className="btn" onClick={() => void act({ t: 'pas' })}>
              Beurt voorbij
            </button>
          )}
        </div>
      </div>
      {myTurn && <p className="sg-hint">{pick ? (pick.from === 'hand' ? 'Leg hem op een bouwstapel in het midden, of op een van je aflegstapels (dan is je beurt voorbij).' : 'Leg hem op een bouwstapel in het midden.') : 'Kies een kaart: uit je hand, van je stapel of van een aflegstapel.'}</p>}
    </div>
  )
}

// ------------------------------------------------------------ Kleurwissel

const SYMBOL: Record<Card['kind'], string> = { getal: '', overslaan: '⊘', draai: '⇄', plus2: '+2', kleur: '', plus4: '+4' }

export function KleurCard({ card, colour, style }: { card: Card | null; colour?: Colour; style?: CSSProperties }) {
  if (!card) return <span className="kw-card back" style={style} />
  const label = card.kind === 'getal' ? String(card.n) : SYMBOL[card.kind]
  const wild = card.kind === 'kleur' || card.kind === 'plus4'
  return (
    <span className={['kw-card', card.colour ?? 'wild', wild && colour && `chosen-${colour}`].filter(Boolean).join(' ')} style={style}>
      <span className="kw-corner">{label}</span>
      <span className="kw-oval">{wild ? <span className="kw-wheel" aria-hidden="true" /> : null}<b>{label}</b></span>
      <span className="kw-corner end">{label}</span>
    </span>
  )
}

const COLOUR_NAME: Record<Colour, string> = { rood: 'Rood', geel: 'Geel', groen: 'Groen', blauw: 'Blauw' }

export function KleurwisselBoard({ view, my, myTurn, act, names }: CardBoardProps<KleurView>) {
  // The colour picker and "Laatste kaart!" only count for the moment they were set
  const [choice, setChoice] = useState<{ card: Card | null; count: number }>({ card: null, count: view.count })
  const choose = choice.count === view.count ? choice.card : null
  const setChoose = (card: Card | null) => setChoice({ card, count: view.count })
  const [called, setCalled] = useState<{ on: boolean; count: number }>({ on: false, count: view.count })
  const last = called.on && called.count === view.count && view.hand.length === 2
  const setLast = (on: boolean) => setCalled({ on, count: view.count })
  // The others, in playing order from you
  const seats = view.handCounts.length
  const opponents = Array.from({ length: seats - 1 }, (_, k) => (my + (view.dir === 1 ? 1 + k : seats - 1 - k)) % seats)
  const playable = (c: Card) => myTurn && (view.drawn === null || c.id === view.drawn) && canPlay(c, view.top, view.colour)
  const play = (c: Card, kleur?: Colour) => void act({ t: 'speel', id: c.id, kleur, laatste: last })

  return (
    <div className="kw-board">
      <div className={opponents.length > 1 ? 'kw-opponents many' : 'kw-opponents'}>
        {opponents.map((them) => {
          const cards: (Card | null)[] = view.hands?.[them] ?? Array.from({ length: view.handCounts[them] }, () => null)
          return (
            <div key={them} className={['kw-opponent', view.turn === them && 'turn', view.out[them] && 'out'].filter(Boolean).join(' ')}>
              <div className="kw-hand theirs" aria-label={`${names[them]} heeft ${view.handCounts[them]} kaarten`}>
                {cards.map((c, i) => (
                  <KleurCard key={i} card={c} style={{ '--i': i, '--n': cards.length } as CSSProperties} />
                ))}
              </div>
              <span className="kw-who">
                {names[them]}
                {view.out[them] ? ' (gestopt)' : view.handCounts[them] === 1 ? ' · laatste kaart!' : ` · ${view.handCounts[them]}`}
              </span>
            </div>
          )
        })}
      </div>

      <div className="kw-middle">
        <button type="button" className="kw-deck" disabled={!myTurn || view.drawn !== null} onClick={() => void act({ t: 'pak' })} title="Pak een kaart">
          <KleurCard card={null} />
          <span className="kw-count">{view.drawLeft}</span>
        </button>
        <div className="kw-pile">
          <KleurCard key={view.top.id} card={view.top} colour={view.colour} />
        </div>
        <div className={`kw-colour ${view.colour}`} aria-live="polite">
          {COLOUR_NAME[view.colour]}
        </div>
        {seats > 2 && (
          <span className="kw-dir" title={view.dir === 1 ? 'Met de klok mee' : 'Tegen de klok in'} aria-label={view.dir === 1 ? 'Met de klok mee' : 'Tegen de klok in'}>
            {view.dir === 1 ? '↻' : '↺'}
          </span>
        )}
      </div>

      {choose && (
        <div className="kw-choose" role="dialog" aria-label="Kies een kleur">
          <p>Welke kleur wordt het?</p>
          <div>
            {COLOURS.map((c) => (
              <button key={c} type="button" className={`kw-swatch ${c}`} onClick={() => play(choose, c)}>
                {COLOUR_NAME[c]}
              </button>
            ))}
          </div>
          <button type="button" className="link-button" onClick={() => setChoose(null)}>
            Toch niet
          </button>
        </div>
      )}

      <div className="kw-actions">
        {myTurn && view.hand.length === 2 && (
          <button type="button" className={last ? 'btn btn-cta kw-last on' : 'btn kw-last'} aria-pressed={last} onClick={() => setLast(!last)}>
            Laatste kaart!
          </button>
        )}
        {myTurn && view.drawn !== null && (
          <button type="button" className="btn" onClick={() => void act({ t: 'pas' })}>
            Pas
          </button>
        )}
      </div>

      <div className="kw-hand mine">
        {view.hand.map((c, i) => {
          const ok = playable(c)
          return (
            <button
              key={c.id}
              type="button"
              className={['kw-hand-card', ok && 'playable', c.id === view.drawn && 'drawn'].filter(Boolean).join(' ')}
              style={{ '--i': i, '--n': view.hand.length } as CSSProperties}
              disabled={!ok}
              onClick={() => (c.kind === 'kleur' || c.kind === 'plus4' ? setChoose(c) : play(c))}
            >
              <KleurCard card={c} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
