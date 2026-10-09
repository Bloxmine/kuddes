/**
 * Yacht Dice on the game page: the five dice (click one to keep it), the roll
 * button, and the score sheet with a column per player. On your turn, after
 * rolling, your empty boxes show what the dice would score there: click one
 * to write it down. The rules are in shared/games/yacht.ts.
 */
import { useState, type CSSProperties } from 'react'
import { LOWER_KEYS, UPPER_BONUS, UPPER_BONUS_AT, UPPER_KEYS, YACHT_BONUS, YACHT_BOXES, boxScore, isYacht, totalScore, upperTotal, type YachtBox, type YachtView } from '../../../shared/games/yacht'
import type { CardBoardProps } from './CardGames'
import './Yacht.css'

/** Where the pips go on a face (3×3 grid, 0 = top left). */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

export function Die({ value, held, rolling, onClick, disabled, i = 0 }: { value: number; held?: boolean; rolling?: boolean; onClick?: () => void; disabled?: boolean; i?: number }) {
  const face = (
    <span className="yd-face" aria-hidden="true">
      {Array.from({ length: 9 }, (_, k) => (
        <i key={k} className={PIPS[value]?.includes(k) ? 'on' : undefined} />
      ))}
    </span>
  )
  const className = ['yd-die', held && 'held', rolling && 'rolling', !value && 'blank'].filter(Boolean).join(' ')
  if (!onClick)
    return (
      <span className={className} style={{ '--i': i } as CSSProperties}>
        {face}
      </span>
    )
  return (
    <button type="button" className={className} style={{ '--i': i } as CSSProperties} onClick={onClick} disabled={disabled} aria-pressed={held} aria-label={value ? `Dobbelsteen ${value}${held ? ', vastgehouden' : ''}` : 'Dobbelsteen'}>
      {face}
      {held && <small>vast</small>}
    </button>
  )
}

export function YachtBoard({ view, my, myTurn, act, names }: CardBoardProps<YachtView>) {
  // Which dice you keep: chosen here, sent with the next roll (fresh every roll)
  const [hold, setHold] = useState<{ held: boolean[]; at: number }>({ held: view.held, at: view.rollCount })
  const held = hold.at === view.rollCount ? hold.held : view.held
  const toggle = (i: number) => setHold({ held: held.map((h, k) => (k === i ? !h : h)), at: view.rollCount })
  const [busy, setBusy] = useState(false)
  const run = async (action: unknown) => {
    setBusy(true)
    try {
      await act(action)
    } finally {
      setBusy(false)
    }
  }
  const rolled = view.rolls > 0
  const canRoll = myTurn && view.rolls < 3 && !busy && !(rolled && held.every(Boolean))
  const seats = view.sheets.map((_, p) => p)
  const turnName = view.turn === my ? 'Jij' : names[view.turn]

  return (
    <div className="yd-board">
      <div className="yd-table">
        <div className="yd-dice" key={view.rollCount}>
          {view.dice.map((d, i) => (
            <Die key={i} i={i} value={d} held={rolled && held[i]} rolling={rolled && !held[i]} onClick={myTurn && rolled ? () => toggle(i) : undefined} disabled={busy || view.rolls >= 3} />
          ))}
        </div>
        <div className="yd-controls">
          {view.over ? (
            <span className="yd-status">Het spel is uit.</span>
          ) : myTurn ? (
            <>
              <button type="button" className="btn btn-cta yd-roll" disabled={!canRoll} onClick={() => void run({ t: 'gooi', hold: held })}>
                {view.rolls === 0 ? 'Gooi!' : view.rolls < 3 ? `Nog eens gooien (${3 - view.rolls})` : 'Kies een vakje'}
              </button>
              <span className="yd-status">
                {!rolled ? 'Jij bent aan de beurt.' : view.rolls < 3 ? 'Klik op dobbelstenen om ze vast te houden, of kies een vakje.' : 'Kies een vakje op je scoreblad.'}
                {rolled && isYacht(view.dice) && <b className="yd-yacht-call"> Yacht!</b>}
              </span>
            </>
          ) : (
            <span className="yd-status">
              {turnName} {view.rolls === 0 ? 'is aan de beurt…' : `gooide ${view.rolls}×`}
              {rolled && isYacht(view.dice) && <b className="yd-yacht-call"> Yacht!</b>}
            </span>
          )}
        </div>
      </div>

      <div className="yd-sheet-wrap">
        <table className="yd-sheet">
          <thead>
            <tr>
              <th />
              {seats.map((p) => (
                <th key={p} className={[p === view.turn && !view.over && 'turn', p === my && 'mine', view.out[p] && 'out'].filter(Boolean).join(' ')}>
                  {p === my ? 'Jij' : names[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {UPPER_KEYS.map((k) => (
              <SheetRow key={k} box={k} view={view} my={my} myTurn={myTurn && rolled && !busy} onPick={(box) => void run({ t: 'noteer', box })} />
            ))}
            <tr className="yd-sum">
              <th>
                Bonus <small>(bij {UPPER_BONUS_AT}+)</small>
              </th>
              {seats.map((p) => {
                const up = upperTotal(view.sheets[p])
                return (
                  <td key={p} className={p === view.turn && !view.over ? 'turn' : undefined} title={`${up} van de ${UPPER_BONUS_AT}`}>
                    {up >= UPPER_BONUS_AT ? `+${UPPER_BONUS}` : <span className="yd-muted">{up}/{UPPER_BONUS_AT}</span>}
                  </td>
                )
              })}
            </tr>
            {LOWER_KEYS.map((k) => (
              <SheetRow key={k} box={k} view={view} my={my} myTurn={myTurn && rolled && !busy} onPick={(box) => void run({ t: 'noteer', box })} />
            ))}
            {view.bonusYachts.some((n) => n > 0) && (
              <tr className="yd-sum">
                <th>Extra Yachts</th>
                {seats.map((p) => (
                  <td key={p}>{view.bonusYachts[p] ? `+${view.bonusYachts[p] * YACHT_BONUS}` : ''}</td>
                ))}
              </tr>
            )}
            <tr className="yd-total">
              <th>Totaal</th>
              {seats.map((p) => (
                <td key={p} className={p === view.turn && !view.over ? 'turn' : undefined}>
                  {totalScore(view.sheets[p], view.bonusYachts[p])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SheetRow({ box, view, my, myTurn, onPick }: { box: YachtBox; view: YachtView; my: number; myTurn: boolean; onPick: (b: YachtBox) => void }) {
  const info = YACHT_BOXES[box]
  return (
    <tr>
      <th title={info.hint}>{info.name}</th>
      {view.sheets.map((sheet, p) => {
        const filled = sheet[box]
        const justNow = view.last?.seat === p && view.last.box === box
        const cls = [p === view.turn && !view.over && 'turn', justNow && 'new'].filter(Boolean).join(' ') || undefined
        if (filled !== undefined)
          return (
            <td key={p} className={cls}>
              {filled === 0 ? <span className="yd-muted">–</span> : filled}
            </td>
          )
        // Your empty box on your turn: what it would score, to pick
        if (p === my && myTurn) {
          const points = boxScore(box, view.dice, sheet)
          return (
            <td key={p} className={cls}>
              <button type="button" className={points ? 'yd-pick' : 'yd-pick zero'} onClick={() => (points || confirm(`${info.name} invullen met 0 punten?`)) && onPick(box)} title={`${info.name}: ${points} punten`}>
                {points}
              </button>
            </td>
          )
        }
        return <td key={p} className={cls} />
      })}
    </tr>
  )
}
