/**
 * Games the server referees because something must stay secret (the cards in
 * a hand, the cards face down): Memory, Stapelgek and Kleurwissel. Each game
 * is a set of pure functions over its state; the server keeps the state
 * (games.secret), runs the actions and sends each player only their own view
 * (server/lib/referee.ts).
 */

/** A seat at the table: 0 invited the others, then 1, 2, 3. */
export type Player = number

export type RefereeOutcome = {
  over: boolean
  /** null while playing or for a draw */
  winner: Player | null
  /** Per seat. */
  scores: number[]
  /** Numbers for achievements, per seat; the highest over all games counts. */
  highlights: Record<Player, Record<string, number>>
}

export type Referee<S, V> = {
  /** Most players it can deal for. */
  maxPlayers: number
  /** A new game for `count` players, shuffled with `random` (0 ≤ n < 1). */
  start(count: number, first: Player, random: () => number): S
  /** What one player may see (everything once the game is over). */
  view(s: S, you: Player, done: boolean): V
  /** Does what the player asked; throws an Error with a message when it's not allowed. */
  act(s: S, you: Player, action: unknown, random: () => number): S
  /** A player gave up or left: the others go on (or, with one left, that one wins). */
  drop(s: S, seat: Player): S
  outcome(s: S): RefereeOutcome
}

/** Fisher–Yates with the given random numbers. */
export function shuffle<T>(list: T[], random: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const other = (p: Player): Player => (p === 0 ? 1 : 0)

/** The next seat after `from` that's still playing (going round `dir` = 1 or −1). */
export function nextSeat(from: Player, count: number, out: boolean[], dir = 1): Player {
  for (let k = 1; k <= count; k++) {
    const seat = (((from + dir * k) % count) + count) % count
    if (!out[seat]) return seat
  }
  return from
}

/** An action that isn't allowed: the message is shown to the player. */
export class NotAllowed extends Error {}
