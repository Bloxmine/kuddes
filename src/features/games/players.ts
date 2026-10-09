/** Who's in a game, seen from one player. */
import type { GamePlayer, GameSummary } from '../../../shared/games'

/** Still in it: invited, or playing (not who said no or left before it started). */
export const inGame = (p: GamePlayer) => p.status === 'meedoen' || p.status === 'uitgenodigd' || p.status === 'weg'

/** Everyone else in the game, in seat order. */
export const othersIn = (g: GameSummary, seat = g.seat) => g.players.filter((p) => p.seat !== seat && inGame(p))

/** The players who actually played (for games that started). */
export const playedIn = (g: GameSummary) => g.players.filter((p) => p.status === 'meedoen' || p.status === 'weg')

/** "Anna", "Anna en Bram", "Anna, Bram en Cas". */
export function namesList(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`
}
