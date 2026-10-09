/**
 * The card games the server referees, for the game page (RefereeGame): the
 * board, whose turn it is, the score, the sounds and messages after an
 * action, and the rules. The rules themselves are in shared/games/.
 */
import type { ComponentType, ReactNode } from 'react'
import type { KleurView } from '../../../shared/games/kleurwissel'
import { MASTERMIND_MODES, mastermindTurn, type MastermindView } from '../../../shared/games/mastermind'
import type { MemoryView } from '../../../shared/games/memory'
import type { PokerView } from '../../../shared/games/poker'
import type { StapelView } from '../../../shared/games/stapelgek'
import { YACHT_BOXES, isYacht, totalScore, type YachtView } from '../../../shared/games/yacht'
import { YachtBoard } from './YachtBoard'
import { KleurwisselBoard, MemoryBoard, StapelgekBoard, type CardBoardProps } from './CardGames'
import { MastermindBoard } from './MastermindBoard'
import { PokerBoard } from './PokerBoard'
import { playCardDraw, playCardFlip, playCardPlace, playDice, playGood, playWrong } from './sounds'

type Player = number

export type RefereeDef<V> = {
  turn: (v: V) => Player
  over: (v: V) => boolean
  score: (v: V, p: Player) => number
  scoreTitle: string
  resultLine: (mine: number, theirs: number) => string
  yourTurn: (v: V) => string
  /** A message after something happened (yours or theirs). */
  /** `names`: everyone by seat ("Jij" for you). */
  note?: (before: V, after: V, my: Player, names: string[]) => string | null
  sounds?: (before: V, after: V, my: Player) => void
  Board: ComponentType<CardBoardProps<V>>
  rules: ReactNode
  /** Under the rules: how Kuddes keeps it fair (the card games: who shuffled). */
  fairness?: string
}

const memoryDef: RefereeDef<MemoryView> = {
  turn: (v) => v.turn,
  over: (v) => v.over,
  score: (v, p) => v.pairs[p],
  scoreTitle: 'Paren',
  resultLine: (a, b) => `${a} – ${b} paren`,
  yourTurn: (v) => (v.cards.some((c) => c.open) ? 'Draai nog een kaart om' : 'Jij bent aan de beurt: draai twee kaarten om'),
  note: (before, after, my, names) => {
    const found = (p: Player) => after.pairs[p] > before.pairs[p]
    if (found(my)) return 'Een paar! Je mag nog een keer.'
    if (found(my === 0 ? 1 : 0)) return `${names[my === 0 ? 1 : 0]} vindt een paar`
    if (after.cards.some((c) => c.miss) && !before.cards.some((c) => c.miss)) return after.turn === my ? 'Geen paar. Jouw beurt!' : 'Geen paar…'
    return null
  },
  sounds: (before, after) => {
    if (after.turned > before.turned) playCardFlip()
    if (after.pairs[0] + after.pairs[1] > before.pairs[0] + before.pairs[1]) window.setTimeout(playGood, 180)
  },
  Board: MemoryBoard,
  rules: (
    <ul className="gm-rules">
      <li>Er liggen 18 paren omgekeerd op tafel. Om de beurt draai je twee kaarten om.</li>
      <li>Zijn ze hetzelfde? Dan is het paar van jou en mag je nog een keer. Anders draaien ze weer om en is de ander aan de beurt; onthoud goed wat je zag!</li>
      <li>Als alle paren gevonden zijn, wint wie de meeste heeft.</li>
    </ul>
  ),
}

const stapelgekDef: RefereeDef<StapelView> = {
  turn: (v) => v.turn,
  over: (v) => v.over,
  score: (v, p) => v.stockStart - v.stockLeft[p],
  scoreTitle: 'Kaarten van je stapel gespeeld',
  resultLine: (a, b) => `${a} – ${b} kaarten van de stapel gespeeld`,
  yourTurn: () => 'Jij bent aan de beurt: bouw op de stapels in het midden, en leg af om je beurt te eindigen',
  note: (before, after, my, names) => {
    const l = after.last
    if (!l || after.count === before.count) return null
    if (l.completed) return l.by === my ? 'Stapel vol tot 12: weg ermee!' : `${names[l.by]} maakt een stapel af`
    if (l.what === 'bouw' && l.from === 'stapel') return l.by === my ? `Weer een van je stapel! Nog ${after.stockLeft[my]}.` : `${names[l.by]} speelt van de eigen stapel (nog ${after.stockLeft[l.by]})`
    const gone = after.out.findIndex((o, p) => o && !before.out[p])
    if (gone >= 0) return `${names[gone]} is gestopt; de anderen spelen verder`
    return null
  },
  sounds: (before, after) => {
    if (after.count === before.count || !after.last) return
    playCardPlace()
    if (after.last.completed || (after.last.what === 'bouw' && after.last.from === 'stapel')) window.setTimeout(playGood, 120)
    if (after.last.what === 'afleg') window.setTimeout(() => playCardDraw(Math.max(1, 5 - before.handCounts[after.turn])), 250)
  },
  Board: StapelgekBoard,
  rules: (
    <ul className="gm-rules">
      <li>Je hebt een eigen stapel (20 kaarten met z’n tweeën, 16 met drie, 14 met vier; de bovenste ligt open), 5 kaarten in je hand en vier aflegstapels. In het midden liggen vier bouwstapels, voor iedereen.</li>
      <li>Op een bouwstapel komen de getallen op volgorde: eerst een 1, dan een 2, tot en met 12. Is een stapel vol, dan gaat hij weg en begint daar weer een nieuwe. Een joker (★) telt als elk getal.</li>
      <li>Je mag bouwen met kaarten uit je hand, de bovenste van je eigen stapel en de bovenste van je aflegstapels, zoveel je wilt. Is je hand leeg, dan krijg je er vijf nieuwe.</li>
      <li>Je beurt eindigt als je een kaart uit je hand op een van je aflegstapels legt. Aan het begin van je beurt vul je je hand aan tot vijf.</li>
      <li>Wie als eerste zijn eigen stapel helemaal kwijt is, wint.</li>
    </ul>
  ),
}

const kleurwisselDef: RefereeDef<KleurView> = {
  turn: (v) => v.turn,
  over: (v) => v.over,
  score: (v, p) => v.handCounts[p] ?? 0,
  scoreTitle: 'Kaarten in de hand',
  resultLine: (a, b) => `${Math.max(a, b)} punten voor de winnaar`,
  yourTurn: (v) => (v.drawn !== null ? 'Speel de kaart die je pakte, of pas' : 'Jij bent aan de beurt: leg een kaart, of pak er een'),
  note: (before, after, my, names) => {
    const l = after.last
    if (!l || after.count === before.count) return null
    const me = l.by === my
    const who = names[l.by]
    const victim = l.victim === undefined ? null : l.victim === my ? 'jij' : names[l.victim]
    const gone = after.out.findIndex((o, p) => o && !before.out[p])
    if (gone >= 0) return `${names[gone]} is gestopt; de anderen spelen verder`
    if (l.penalty) return me ? 'Vergeten "Laatste kaart!" te roepen: 2 strafkaarten' : `${who} vergat "Laatste kaart!" te roepen: 2 strafkaarten`
    if (l.what === 'speel' && l.card) {
      const two = after.handCounts.filter((_, p) => !after.out[p]).length === 2
      if (l.card.kind === 'plus4') return two ? (me ? '+4! Je mag nog een keer' : `${who} speelt +4: jij pakt er vier`) : `${me ? 'Jij speelt' : `${who} speelt`} +4: ${victim} pakt er vier en slaat een beurt over`
      if (l.card.kind === 'plus2') return two ? (me ? '+2! Je mag nog een keer' : `${who} speelt +2: jij pakt er twee`) : `${me ? 'Jij speelt' : `${who} speelt`} +2: ${victim} pakt er twee en slaat een beurt over`
      if (l.card.kind === 'overslaan') return two ? (me ? 'Je mag nog een keer' : `${who} mag nog een keer`) : `${victim === 'jij' ? 'Jij slaat' : `${victim} slaat`} een beurt over`
      if (l.card.kind === 'draai') return two ? (me ? 'Je mag nog een keer' : `${who} mag nog een keer`) : 'Draai om: de andere kant op!'
      if (l.card.kind === 'kleur') return `De kleur wordt ${after.colour}`
      if (after.handCounts[l.by] === 1) return me ? 'Laatste kaart!' : `${who}: laatste kaart!`
    }
    return null
  },
  sounds: (before, after, my) => {
    const l = after.last
    if (!l || after.count === before.count) return
    if (l.what === 'pak') playCardDraw(1)
    if (l.what === 'speel') {
      playCardPlace()
      if (l.card?.kind === 'plus2' || l.card?.kind === 'plus4') window.setTimeout(() => playCardDraw(l.card!.kind === 'plus4' ? 4 : 2), 200)
      if (l.penalty) window.setTimeout(playWrong, 150)
      else if (after.handCounts[l.by] === 1 && l.by === my) window.setTimeout(playGood, 150)
    }
  },
  Board: KleurwisselBoard,
  rules: (
    <ul className="gm-rules">
      <li>Iedereen begint met zeven kaarten. Leg om de beurt een kaart op de stapel: dezelfde kleur, hetzelfde getal of hetzelfde symbool als de bovenste.</li>
      <li>Kan of wil je niet? Pak een kaart. Past die, dan mag je hem meteen spelen; anders is de ander aan de beurt.</li>
      <li>Overslaan (⊘): de volgende slaat een beurt over. +2 en +4: de volgende pakt er twee of vier en slaat ook over. Draai om (⇄): de andere kant op (met z’n tweeën betekent dat: jij mag nog een keer). Kleur kiezen en +4 passen altijd, en daarmee kies je de nieuwe kleur.</li>
      <li>Leg je je voorlaatste kaart? Druk dan eerst op "Laatste kaart!", anders krijg je twee strafkaarten.</li>
      <li>Wie als eerste geen kaarten meer heeft, wint en krijgt punten voor wat de anderen nog vasthouden: getallen tellen hun waarde, symbolen 20 en kleurkaarten 50.</li>
    </ul>
  ),
}

/** Points like the real game: the guesser gets the rows it had left, the maker the guesses it took (plus one if it held). */
const mastermindPoints = (v: MastermindView, p: Player) => {
  if (!v.over) return 0
  const { rows } = MASTERMIND_MODES[v.mode]
  if (v.solved) return p === v.guesser ? rows - v.guesses.length + 1 : 0
  return p === v.maker && v.guesses.length >= rows ? v.guesses.length + 1 : 0
}

const mastermindDef: RefereeDef<MastermindView> = {
  turn: mastermindTurn,
  over: (v) => v.over,
  score: mastermindPoints,
  scoreTitle: 'Punten',
  resultLine: (a, b) => `${a} – ${b} punten`,
  yourTurn: (v) => (v.codeSet ? `Jij bent aan de beurt: poging ${v.guesses.length + 1} van ${MASTERMIND_MODES[v.mode].rows}` : 'Verstop je geheime code'),
  note: (before, after, my, names) => {
    if (!before.codeSet && after.codeSet) return after.maker === my ? 'Je code is verstopt. Nu raden!' : `${names[after.maker]} heeft de code verstopt: jij bent!`
    if (after.guesses.length > before.guesses.length) {
      const g = after.guesses[after.guesses.length - 1]
      if (after.solved) return after.guesser === my ? 'Gekraakt!' : `${names[after.guesser]} heeft je code gekraakt`
      const who = after.guesser === my ? 'Je poging' : `Poging van ${names[after.guesser]}`
      return `${who}: ${g.black} goed op de goede plek, ${g.white} alleen de goede kleur`
    }
    return null
  },
  sounds: (before, after, my) => {
    if (after.guesses.length > before.guesses.length || (!before.codeSet && after.codeSet)) playCardPlace()
    if (after.solved && !before.solved) window.setTimeout(after.guesser === my ? playGood : playWrong, 150)
  },
  Board: MastermindBoard,
  fairness: 'Kuddes bewaart de geheime code: de raader ziet hem pas als het spel voorbij is, en de pinnetjes worden door Kuddes geteld.',
  rules: (
    <ul className="gm-rules">
      <li>De een verstopt een geheime rij gekleurde pinnen, de ander raadt. Kleuren mogen vaker voorkomen.</li>
      <li>Na elke poging zie je zwarte pinnetjes (goede kleur op de goede plek) en witte (goede kleur, verkeerde plek). Welke pinnen dat zijn, zie je niet: dat is de puzzel.</li>
      <li>Klassiek: 6 kleuren, 4 pinnen, 10 pogingen. Modern: 8 kleuren, 5 pinnen, 12 pogingen.</li>
      <li>Gekraakt? Dan wint de raader. Blijft de code geheim, dan wint de codemaker. De volgende keer dat jullie spelen, ruilen jullie van rol.</li>
    </ul>
  ),
}

const pokerDef: RefereeDef<PokerView> = {
  turn: (v) => v.toAct,
  over: (v) => v.over,
  score: (v, p) => v.chips[p] + (v.bet[p] ?? 0),
  scoreTitle: 'Fiches',
  resultLine: (a, b) => `${a.toLocaleString('nl-NL')} – ${b.toLocaleString('nl-NL')} fiches`,
  yourTurn: (v) => (v.toCall > 0 ? `Jij bent aan de beurt: ${v.toCall.toLocaleString('nl-NL')} om te callen` : 'Jij bent aan de beurt: check of zet in'),
  note: (before, after, my, names) => {
    if (after.last && after.last.hand !== before.last?.hand) {
      const pot = after.last.pots[0]
      if (!pot) return null
      const who = pot.winners.map((w) => names[w]).join(' en ')
      const hand = after.last.shown.find((s) => pot.winners.includes(s.seat))?.name
      return `${who} ${pot.winners.length > 1 ? 'delen' : pot.winners[0] === my ? 'wint' : 'wint'} de pot${hand ? ` met ${hand.toLowerCase()}` : ''}`
    }
    const gone = after.out.findIndex((o, p) => o && !before.out[p])
    if (gone >= 0) return gone === my ? 'Je fiches zijn op…' : `${names[gone]} is uit het spel`
    return null
  },
  sounds: (before, after, my) => {
    if (after.hand !== before.hand) playCardDraw(2)
    else if (after.board.length > before.board.length) playCardFlip()
    else if (after.log.length !== before.log.length) playCardPlace()
    if (after.last && after.last.hand !== before.last?.hand && after.last.pots.some((p) => p.winners.includes(my))) window.setTimeout(playGood, 200)
  },
  Board: PokerBoard,
  fairness: 'Kuddes schudt en deelt: je ziet alleen je eigen kaarten, die van de anderen pas als ze bij de showdown worden omgedraaid.',
  rules: (
    <ul className="gm-rules">
      <li>Iedereen krijgt twee kaarten; op tafel komen er vijf voor iedereen: eerst drie (de flop), dan één (de turn) en nog één (de river). Na elke ronde wordt er ingezet.</li>
      <li>Aan de beurt? Passen (je legt je kaarten weg), checken (niets inzetten als er nog niets staat), callen (evenveel als de hoogste inzet) of verhogen.</li>
      <li>Wie het langst meedoet en de beste vijf kaarten heeft (van zijn twee en de vijf op tafel), wint de pot. Van hoog naar laag: royal flush, straight flush, vier gelijke, full house, kleur, straat, drie gelijke, twee paar, paar, hoge kaart.</li>
      <li>Iedereen begint met 1000 fiches. De blinds (de verplichte inzet vooraf) gaan elke 6 handen omhoog. Wie alle fiches heeft, wint.</li>
    </ul>
  ),
}

const yachtDef: RefereeDef<YachtView> = {
  turn: (v) => v.turn,
  over: (v) => v.over,
  score: (v, p) => totalScore(v.sheets[p], v.bonusYachts[p]),
  scoreTitle: 'Punten',
  resultLine: (a, b) => `${a} – ${b} punten`,
  yourTurn: (v) => (v.rolls === 0 ? 'Jij bent aan de beurt: gooi!' : v.rolls < 3 ? `Houd vast wat je wilt en gooi nog eens, of kies een vakje` : 'Kies een vakje op je scoreblad'),
  note: (before, after, my, names) => {
    const l = after.last
    if (l && l !== before.last && (l.seat !== before.last?.seat || l.box !== before.last?.box)) {
      const who = l.seat === my ? 'Je' : names[l.seat]
      const box = YACHT_BOXES[l.box].name
      if (l.box === 'yacht' && l.points) return `${l.seat === my ? 'Je hebt' : `${names[l.seat]} heeft`} een Yacht! 50 punten`
      return l.points ? `${who} schrijft ${l.points} punten bij ${box}` : `${who} streept ${box} weg`
    }
    if (after.rollCount > before.rollCount && isYacht(after.dice)) return after.turn === my ? 'Yacht! Vijf dezelfde!' : `${names[after.turn]} gooit een Yacht!`
    const gone = after.out.findIndex((o, p) => o && !before.out[p])
    if (gone >= 0) return `${names[gone]} is gestopt; de anderen spelen verder`
    return null
  },
  sounds: (before, after) => {
    if (after.rollCount > before.rollCount) {
      playDice(after.held.filter((h) => !h).length)
      if (isYacht(after.dice)) window.setTimeout(playGood, 450)
    }
    if (after.last && after.last !== before.last && (after.last.box !== before.last?.box || after.last.seat !== before.last?.seat)) playCardPlace()
  },
  Board: YachtBoard,
  fairness: 'Kuddes gooit de dobbelstenen: niemand kan vals spelen, en iedereen ziet elke worp.',
  rules: (
    <ul className="gm-rules">
      <li>Je speelt 13 beurten. In je beurt gooi je met vijf dobbelstenen, tot drie keer. Tussen het gooien door klik je de dobbelstenen aan die je wilt houden.</li>
      <li>Daarna vul je één leeg vakje op je scoreblad in, ook als je er 0 punten voor krijgt. Elk vakje kan maar één keer.</li>
      <li>Bovenaan: Enen tot en met Zessen, de ogen van dat getal opgeteld. Haal je daar samen 63 of meer, dan krijg je 35 punten bonus.</li>
      <li>Onderaan: drie of vier gelijke (alle ogen opgeteld), full house (25), kleine straat van vier (30), grote straat van vijf (40), Yacht: vijf dezelfde (50), en Kans (alle ogen).</li>
      <li>Nog een Yacht, terwijl je er al 50 punten voor hebt? Dan krijg je 100 punten extra, en telt hij als joker voor een full house of straat.</li>
      <li>Als iedereen alle 13 vakjes vol heeft, wint wie de meeste punten heeft.</li>
    </ul>
  ),
}

export const REFEREE_GAMES = {
  memory: memoryDef,
  stapelgek: stapelgekDef,
  kleurwissel: kleurwisselDef,
  mastermind: mastermindDef,
  mastermind8: mastermindDef,
  poker: pokerDef,
  yacht: yachtDef,
} as unknown as Record<'memory' | 'stapelgek' | 'kleurwissel' | 'mastermind' | 'mastermind8' | 'poker' | 'yacht', RefereeDef<unknown>>
