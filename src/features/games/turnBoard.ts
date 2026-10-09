import type { Player } from '../../../shared/mancala'

/** What a turn-based game's board gets from the game page. */
export type TurnBoardProps<S, M> = {
  state: S
  /** Your side: 0 for the one who invited, 1 for the one invited. */
  my: Player
  myTurn: boolean
  onMove: (move: M) => void
  /** The game is over or stopped: nothing can be clicked any more. */
  finished: boolean
}
