/**
 * The turn-based games (peer to peer) for the game page: how to replay the
 * moves, whose turn it is, the score, the board and the rules. Adding a game
 * is adding an entry here and in shared/games/rules.ts.
 */
import type { ComponentType, ReactNode } from 'react'
import * as dammen from '../../../shared/games/dammen'
import * as pool from '../../../shared/games/pool'
import * as schaken from '../../../shared/games/schaken'
import * as vier from '../../../shared/games/vieropeenrij'
import type { TurnKind } from '../../../shared/games/rules'
import * as mancala from '../../../shared/mancala'
import { DamBoard } from './DamBoard'
import { ChessBoard } from './ChessBoard'
import { MancalaPlay } from './MancalaBoard'
import { PoolTable } from './PoolTable'
import type { TurnBoardProps } from './turnBoard'
import { VierBoard } from './VierBoard'

type Player = 0 | 1

export type TurnGameDef<S, M> = {
  replay: (moves: M[], first: Player) => S
  turn: (s: S) => Player
  over: (s: S) => boolean
  isLegal: (s: S, move: M) => boolean
  /** A message after a move, e.g. "Je pikt er 5 in!" */
  note?: (before: S, move: M, mine: boolean, opponent: string) => string | null
  score: (s: S, p: Player) => number
  scoreTitle: string
  /** The line under the result ("31 – 17"); empty to leave it out. */
  resultLine?: (mine: number, theirs: number) => string
  yourTurn: string
  Board: ComponentType<TurnBoardProps<S, M>>
  rules: ReactNode
}

const mancalaDef: TurnGameDef<mancala.MancalaState, number> = {
  replay: (moves, first) => mancala.replay(moves, first).state,
  turn: (s) => s.turn,
  over: (s) => s.over,
  isLegal: (s, m) => mancala.isLegal(s, m),
  note: (before, m, mine, opponent) => {
    const r = mancala.applyMove(before, m)
    if (r.captured) return mine ? `Je pikt er ${r.captured} in!` : `${opponent} pikt er ${r.captured} in`
    if (r.extraTurn && !r.state.over) return mine ? 'In je pot: nog een keer!' : `${opponent} mag nog een keer`
    return null
  },
  score: (s, p) => mancala.score(s, p),
  scoreTitle: 'Knikkers in de pot',
  yourTurn: 'Jij bent aan de beurt: kies een kuiltje aan jouw kant',
  Board: MancalaPlay,
  rules: (
    <ul className="gm-rules">
      <li>Kies een kuiltje aan jouw kant (onderaan). Je knikkers gaan één voor één tegen de klok in naar de volgende kuiltjes, en in je eigen pot (rechts), maar nooit in die van je tegenstander.</li>
      <li>Valt je laatste knikker in je eigen pot? Dan mag je nog een keer.</li>
      <li>Valt je laatste knikker in een leeg kuiltje aan jouw kant, en liggen er aan de overkant knikkers? Dan pik je die allemaal in, samen met die ene.</li>
      <li>Is een van beide kanten leeg, dan is het spel uit: ieder krijgt de knikkers aan de eigen kant erbij. Wie de meeste knikkers in de pot heeft, wint.</li>
    </ul>
  ),
}

const vierDef: TurnGameDef<vier.VierState, number> = {
  replay: (moves, first) => vier.replay(moves, first).state,
  turn: (s) => s.turn,
  over: (s) => s.over,
  isLegal: (s, m) => vier.isLegal(s, m),
  note: (before, m, mine, opponent) => {
    const r = vier.applyMove(before, m)
    if (r.state.winner !== null) return mine ? 'Vier op een rij!' : `${opponent} heeft vier op een rij`
    if (r.state.over) return 'Het bord is vol: gelijkspel'
    return null
  },
  score: (s, p) => s.grid.filter((x) => x === p).length,
  scoreTitle: 'Stenen op het bord',
  resultLine: () => '',
  yourTurn: 'Jij bent aan de beurt: kies een kolom',
  Board: VierBoard,
  rules: (
    <ul className="gm-rules">
      <li>Om de beurt laat je een steen in een kolom vallen; hij valt tot onderaan of op de bovenste steen.</li>
      <li>Wie als eerste vier stenen op een rij heeft, recht of schuin, wint.</li>
      <li>Is het bord vol zonder vier op een rij? Dan is het gelijkspel.</li>
    </ul>
  ),
}

const damDef: TurnGameDef<dammen.DamState, dammen.DamMove> = {
  replay: (moves, first) => dammen.replay(moves, first).state,
  turn: (s) => s.turn,
  over: (s) => s.over,
  isLegal: (s, m) => dammen.isLegal(s, m),
  note: (before, m, mine, opponent) => {
    const r = dammen.applyMove(before, m)
    if (r.crowned) return mine ? 'Dam! Je stuk is gekroond' : `${opponent} haalt een dam`
    if (r.captured.length > 1) return mine ? `Je slaat ${r.captured.length} stukken!` : `${opponent} slaat ${r.captured.length} stukken`
    if (r.state.over && r.state.winner === null) return 'Remise: niemand kan nog winnen'
    return null
  },
  score: (s, p) => dammen.pieceCount(s, p),
  scoreTitle: 'Stukken over',
  resultLine: (mine, theirs) => `${mine} – ${theirs} stukken over`,
  yourTurn: 'Jij bent aan de beurt: klik op een stuk en dan waar het heen moet',
  Board: DamBoard,
  rules: (
    <ul className="gm-rules">
      <li>Wit begint. Schijven gaan schuin vooruit, één veld per zet.</li>
      <li>Slaan is verplicht, ook achteruit, en je moet de weg nemen waarmee je de meeste stukken slaat. Na een slag mag (moet) je doorslaan.</li>
      <li>Kom je aan de overkant aan het eind van je zet, dan wordt je schijf een dam. Een dam mag over de hele diagonaal bewegen en van ver slaan.</li>
      <li>Wie geen zet meer kan doen (of geen stukken meer heeft), verliest. Doen jullie 25 zetten elk alleen met dammen zonder te slaan, dan is het remise.</li>
    </ul>
  ),
}

const CHESS_END: Record<schaken.EndReason, string> = {
  schaakmat: 'Schaakmat!',
  pat: 'Pat: remise',
  materiaal: 'Te weinig stukken om mat te zetten: remise',
  vijftig: 'Vijftig zetten zonder slaan of pionzet: remise',
  herhaling: 'Drie keer dezelfde stelling: remise',
}

const chessDef: TurnGameDef<schaken.ChessState, schaken.ChessMove> = {
  replay: (moves, first) => schaken.replay(moves, first).state,
  turn: (s) => s.turn,
  over: (s) => s.over,
  isLegal: (s, m) => schaken.isLegal(s, m),
  note: (before, m, mine, opponent) => {
    const r = schaken.applyMove(before, m)
    if (r.state.reason) return r.state.reason === 'schaakmat' ? (mine ? 'Schaakmat! Je wint.' : `Schaakmat door ${opponent}…`) : CHESS_END[r.state.reason]
    if (r.state.check) return mine ? 'Schaak!' : 'Je staat schaak!'
    if (r.castled) return mine ? 'Je rokeert' : `${opponent} rokeert`
    if (r.promoted) return mine ? 'Je pion promoveert!' : `${opponent} promoveert een pion`
    if (r.enPassant) return 'En passant!'
    return null
  },
  score: (s, p) => schaken.materialTaken(s, p),
  scoreTitle: 'Geslagen waarde (pion 1, paard en loper 3, toren 5, dame 9)',
  resultLine: () => '',
  yourTurn: 'Jij bent aan de beurt: klik op een stuk en dan waar het heen moet',
  Board: ChessBoard,
  rules: (
    <ul className="gm-rules">
      <li>Wit begint; wie uitdaagt en wie wordt uitgedaagd wisselt per potje. Je eigen stukken staan onderaan.</li>
      <li>Rokeren doe je door de koning twee velden naar de toren te zetten. En passant en promotie (naar elk stuk) kunnen ook.</li>
      <li>Zet je de koning van je tegenstander schaak zonder dat hij nog weg kan, dan is het schaakmat en win je.</li>
      <li>Remise: pat (geen zet meer, maar niet schaak), te weinig stukken om nog mat te zetten, vijftig zetten zonder slaan of pionzet, of drie keer dezelfde stelling.</li>
    </ul>
  ),
}

const FOUL: Record<pool.Foul, string> = {
  wit: 'de witte bal ging erin',
  mis: 'geen bal geraakt',
  verkeerd: 'eerst de verkeerde bal geraakt',
  buiten: 'een bal van tafel',
}

function poolDef(variant: pool.Variant): TurnGameDef<pool.PoolState, pool.Shot> {
  return {
    replay: (moves, first) => pool.replay(moves, first, variant).state,
    turn: (s) => s.turn,
    over: (s) => s.over,
    isLegal: (s, m) => pool.isValidShot(s, m),
    note: (before, m, mine, opponent) => {
      const { state, summary } = pool.applyShot(before, m)
      const who = mine ? 'Jij' : opponent
      if (state.over) return state.winner === before.turn ? `${who} pot de ${variant} en wint!` : `De 8 viel te vroeg: ${mine ? 'je verliest' : `${opponent} verliest`}`
      if (summary.foul) return `Fout: ${FOUL[summary.foul]}. ${mine ? `${opponent} heeft` : 'Jij hebt'} de witte bal in de hand.`
      if (summary.assigned) return mine ? `Jij speelt met de ${state.groups[before.turn] === 'vol' ? 'volle' : 'halve'} ballen` : `${opponent} speelt met de ${state.groups[before.turn] === 'vol' ? 'volle' : 'halve'} ballen`
      if (summary.respotted) return `De ${summary.respotted} gaat terug op de stip`
      if (summary.again) return mine ? `Raak! Nog een keer.` : `${opponent} pot en mag nog een keer`
      return null
    },
    score: (s, p) => s.pottedBy[p].length,
    scoreTitle: 'Gepotte ballen',
    resultLine: (mine, theirs) => `${mine} – ${theirs} gepot`,
    yourTurn: 'Jij bent aan de beurt: mik en stoot',
    Board: PoolTable,
    rules:
      variant === 8 ? (
        <ul className="gm-rules">
          <li>Na de afstoot is de tafel open. Wie als eerste een bal pot, speelt met die groep: de volle (1–7) of de halve (9–15). De ander krijgt de andere groep.</li>
          <li>Raak altijd eerst een bal van je eigen groep. Pot je er een, dan mag je nog een keer.</li>
          <li>Een fout (de witte erin, niets raken of eerst de verkeerde bal) geeft je tegenstander de witte bal in de hand: die mag hem overal neerleggen.</li>
          <li>Al je ballen weg? Pot dan de zwarte 8 en je wint. Valt de 8 eerder, of met een fout, dan verlies je. De 8 op de afstoot gaat terug op de stip.</li>
          <li>Mik met je muis of vinger, klik om de richting vast te zetten, kies je kracht en eventueel effect (doorstoot of trekstoot) en stoot.</li>
        </ul>
      ) : (
        <ul className="gm-rules">
          <li>Raak altijd eerst de laagste bal op tafel. Pot je daarbij een bal, welke dan ook, dan mag je nog een keer.</li>
          <li>Wie de 9 pot zonder fout, wint, ook als dat via een andere bal gaat of meteen bij de afstoot.</li>
          <li>Een fout (de witte erin, niets raken of eerst de verkeerde bal) geeft je tegenstander de witte bal in de hand. Viel de 9 bij een fout, dan gaat hij terug op de stip.</li>
          <li>Mik met je muis of vinger, klik om de richting vast te zetten, kies je kracht en eventueel effect en stoot.</li>
        </ul>
      ),
  }
}

// Each entry fits its own board; the game page only passes values through
export const TURN_GAMES = {
  mancala: mancalaDef,
  vieropeenrij: vierDef,
  dammen: damDef,
  schaken: chessDef,
  pool: poolDef(8),
  pool9: poolDef(9),
} as unknown as Record<TurnKind, TurnGameDef<unknown, unknown>>
