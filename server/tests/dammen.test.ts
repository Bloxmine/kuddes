/** Tests for the dammen rules. Run with `npx tsx server/tests/dammen.test.ts`. */
import assert from 'node:assert/strict'
import {
  applyMove,
  fromPosition,
  initialState,
  isLegal,
  legalMoves,
  pieceCount,
  rcToSquare,
  replay,
  squareToRC,
  type DamMove,
  type DamState,
  type Piece,
  type Player,
} from '../../shared/games/dammen'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

/** Board from standard notation (1–50); a trailing K makes a king. White is player 0. */
function pos(white: string[], black: string[], turn: Player = 0): DamState {
  const board: (Piece | null)[] = Array.from({ length: 50 }, () => null)
  const put = (list: string[], owner: Player) => {
    for (const x of list) board[parseInt(x) - 1] = { owner, king: x.endsWith('K') }
  }
  put(white, 0)
  put(black, 1)
  return fromPosition(board, 0, turn)
}
/** Notation → 0-based path. */
const p = (...sqs: number[]): DamMove => sqs.map((n) => n - 1)
/** Legal moves as notation strings like "32-28" or "19x10x28". */
const show = (s: DamState) =>
  legalMoves(s)
    .map((m) => m.path.map((x) => x + 1).join(m.captured.length ? 'x' : '-'))
    .sort()

test('square numbering round-trips and matches notation', () => {
  for (let sq = 0; sq < 50; sq++) {
    const { r, c } = squareToRC(sq)
    assert.equal(rcToSquare(r, c), sq)
  }
  assert.deepEqual(squareToRC(0), { r: 0, c: 1 })
  assert.deepEqual(squareToRC(5), { r: 1, c: 0 })
  assert.deepEqual(squareToRC(49), { r: 9, c: 8 })
  assert.equal(rcToSquare(0, 0), null)
  assert.equal(rcToSquare(-1, 2), null)
  assert.equal(rcToSquare(10, 1), null)
})

test('opening: White has 9 moves, Black 9 in reply', () => {
  const s = initialState(1)
  assert.equal(s.white, 1)
  assert.equal(s.turn, 1)
  assert.equal(pieceCount(s, 0), 20)
  assert.equal(pieceCount(s, 1), 20)
  assert.deepEqual(show(s), ['31-26', '31-27', '32-27', '32-28', '33-28', '33-29', '34-29', '34-30', '35-30'])
  const next = applyMove(s, p(32, 28)).state
  assert.equal(next.turn, 0)
  assert.equal(legalMoves(next).length, 9)
  assert.equal(s.moves.length, 0, 'input state is not mutated')
  assert.equal(s.board[31]?.owner, 1)
})

test('men only move forward', () => {
  assert.deepEqual(show(pos(['28'], ['3'])), ['28-22', '28-23'])
  assert.deepEqual(show(pos(['48'], ['13'], 1)), ['13-18', '13-19'])
  assert.throws(() => applyMove(pos(['28'], ['3']), p(28, 33)))
})

test('capturing is compulsory', () => {
  const s = pos(['32', '46'], ['27'])
  assert.deepEqual(show(s), ['32x21'])
  assert.equal(isLegal(s, p(46, 41)), false)
  assert.throws(() => applyMove(s, p(46, 41)))
  const r = applyMove(s, p(32, 21))
  assert.deepEqual(r.captured, [26])
  assert.equal(pieceCount(r.state, 1), 0)
  assert.equal(r.state.over, true)
  assert.equal(r.state.winner, 0)
})

test('maximum capture: only the longest sequence is legal', () => {
  // 32x21x12 takes two; 38x29 takes one
  const s = pos(['32', '38'], ['27', '17', '33'])
  assert.deepEqual(show(s), ['32x21x12'])
  assert.throws(() => applyMove(s, p(38, 29)))
  assert.throws(() => applyMove(s, p(32, 21)), 'stopping halfway is illegal')
  const r = applyMove(s, p(32, 21, 12))
  assert.deepEqual(r.captured.map((x) => x + 1), [27, 17])
})

test('a man captures backwards', () => {
  const s = pos(['23'], ['28', '1'])
  assert.deepEqual(show(s), ['23x32'])
})

test('a man may not jump the same piece twice', () => {
  // 32x21 over 27; it cannot jump 27 again on the way back
  assert.deepEqual(show(pos(['32'], ['27', '5'])), ['32x21'])
})

test('flying king moves any distance', () => {
  const s = pos(['46K'], ['1'])
  assert.deepEqual(show(s), ['46-10', '46-14', '46-19', '46-23', '46-28', '46-32', '46-37', '46-41', '46-5'].sort())
})

test('king captures from a distance and picks its landing square', () => {
  const s = pos(['46K'], ['23', '1'])
  assert.deepEqual(show(s), ['46x10', '46x14', '46x19', '46x5'].sort())
  const r = applyMove(s, p(46, 14))
  assert.deepEqual(r.captured, [22])
  assert.equal(r.state.board[13]?.king, true)
  assert.equal(r.crowned, false)
})

test('king must land where the capture can go on', () => {
  // After 46x23 only landing on 19 lets it take 24 as well
  const s = pos(['46K'], ['28', '24', '1'])
  assert.deepEqual(show(s), ['46x19x30', '46x19x35'])
})

test('Turkish strike: captured pieces block until the move ends', () => {
  // The king takes 14 or 23 but can't pass back over the first one to reach the other
  const s = pos(['19K'], ['14', '23', '7', '25'])
  for (const m of legalMoves(s)) assert.equal(m.captured.length, 1)
  assert.equal(isLegal(s, p(19, 10, 28)), false)
  assert.throws(() => applyMove(s, p(19, 5, 28)))
})

test('passing the far row mid-capture does not crown', () => {
  // 13x4x15: touches square 4 on the far row and carries on
  const s = pos(['13'], ['9', '10', '50'])
  assert.deepEqual(show(s), ['13x4x15'])
  const r = applyMove(s, p(13, 4, 15))
  assert.equal(r.crowned, false)
  assert.equal(r.state.board[14]?.king, false)
})

test('ending on the far row crowns', () => {
  const s = pos(['7'], ['50'])
  const r = applyMove(s, p(7, 2))
  assert.equal(r.crowned, true)
  assert.equal(r.state.board[1]?.king, true)
  const b = applyMove(pos(['1'], ['44'], 1), p(44, 49))
  assert.equal(b.crowned, true)
  // Capturing onto the far row also crowns
  const c = applyMove(pos(['13', '40'], ['8']), p(13, 2))
  assert.equal(c.crowned, true)
})

test('a blocked player loses', () => {
  // Black's only man on 6 is stuck behind White's 11 and 17; White makes a quiet move
  const s = pos(['11', '17', '48'], ['6'])
  const r = applyMove(s, p(48, 42))
  assert.deepEqual(legalMoves(r.state), [])
  assert.equal(r.state.over, true)
  assert.equal(r.state.winner, 0)
  assert.throws(() => applyMove(r.state, p(6, 11)))
  // A position where the side to move is already stuck is over at once
  const stuck = pos(['11', '17'], ['6'], 1)
  assert.equal(stuck.over, true)
  assert.equal(stuck.winner, 0)
})

test('50 quiet king plies in a row is a draw', () => {
  let s = pos(['46K'], ['1K'])
  const w = [p(46, 41), p(41, 46)]
  const b = [p(1, 7), p(7, 1)]
  for (let i = 0; i < 49; i++) {
    const mv = s.turn === 0 ? w[Math.floor(i / 2) % 2] : b[Math.floor(i / 2) % 2]
    s = applyMove(s, mv).state
    assert.equal(s.over, false)
    assert.equal(s.quietKingPlies, i + 1)
  }
  s = applyMove(s, b[24 % 2]).state
  assert.equal(s.quietKingPlies, 50)
  assert.equal(s.over, true)
  assert.equal(s.winner, null)
  assert.deepEqual(legalMoves(s), [])
})

test('a man move resets the quiet king counter', () => {
  let s = pos(['46K', '35'], ['1K'])
  s = applyMove(s, p(46, 41)).state
  s = applyMove(s, p(1, 7)).state
  assert.equal(s.quietKingPlies, 2)
  s = applyMove(s, p(35, 30)).state
  assert.equal(s.quietKingPlies, 0)
})

test('replay plays a game and throws on an illegal move', () => {
  const game = [p(32, 28), p(19, 23), p(28, 19), p(14, 23)]
  const { state, highlights } = replay(game, 0)
  assert.equal(state.moves.length, 4)
  assert.equal(pieceCount(state, 0), 19)
  assert.equal(pieceCount(state, 1), 19)
  assert.equal(highlights[0].bestCapture, 1)
  assert.equal(highlights[1].bestCapture, 1)
  assert.throws(() => replay([p(32, 28), p(19, 23), p(33, 29)], 0), /Ongeldige zet/)
  assert.throws(() => replay([p(32, 27, 22)], 0))
  assert.throws(() => replay([[] as number[]], 1))
  assert.throws(() => replay([p(19, 23)], 0), 'Black may not move first')
})

test('random self-play never throws and piece counts never grow', () => {
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  let finished = 0
  let draws = 0
  for (let g = 0; g < 300; g++) {
    const first: Player = g % 2 === 0 ? 0 : 1
    let s = initialState(first)
    for (let ply = 0; ply < 400 && !s.over; ply++) {
      const moves = legalMoves(s)
      assert.ok(moves.length > 0)
      const before = [pieceCount(s, 0), pieceCount(s, 1)]
      const m = moves[Math.floor(rnd() * moves.length)]
      assert.equal(new Set(m.captured).size, m.captured.length)
      const r = applyMove(s, m.path)
      const after = [pieceCount(r.state, 0), pieceCount(r.state, 1)]
      assert.equal(after[s.turn], before[s.turn])
      assert.equal(after[1 - s.turn], before[1 - s.turn] - r.captured.length)
      s = r.state
    }
    const again = replay(s.moves, first)
    assert.deepEqual(again.state, s)
    if (s.over) {
      finished++
      if (s.winner === null) draws++
    }
  }
  console.log(`   ${finished}/300 games finished, ${draws} draws`)
})

console.log(`${passed} tests passed`)
