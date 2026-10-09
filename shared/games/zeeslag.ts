/**
 * Zeeslag (battleship). The fleets are secret, so the server keeps them and
 * answers every shot (server/lib/zeeslag.ts); the players only see what
 * they're allowed to. 10×10, ships may not touch, a hit means you may shoot
 * again.
 */

export type Player = 0 | 1

export const SIZE = 10

export const FLEET = [
  { name: 'Vliegdekschip', len: 5 },
  { name: 'Slagschip', len: 4 },
  { name: 'Kruiser', len: 3 },
  { name: 'Onderzeeër', len: 3 },
  { name: 'Torpedobootjager', len: 2 },
] as const

export type Ship = { x: number; y: number; len: number; dir: 'h' | 'v' }
export type ShotResult = 'mis' | 'raak' | 'gezonken'
export type Shot = { p: Player; x: number; y: number; r: ShotResult; /** The ship that sank, shown whole. */ sunk?: Ship }

export const cellsOf = (s: Ship) => Array.from({ length: s.len }, (_, i) => (s.dir === 'h' ? [s.x + i, s.y] : [s.x, s.y + i]) as [number, number])

/** Why a fleet isn't valid, or null when it is. */
export function fleetProblem(ships: Ship[]): string | null {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return 'Plaats al je schepen.'
  const wanted = FLEET.map((f) => f.len).sort().join(',')
  if (ships.map((s) => s.len).sort().join(',') !== wanted) return 'Dit zijn niet de juiste schepen.'
  const taken = new Map<string, number>()
  for (const [i, s] of ships.entries()) {
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || (s.dir !== 'h' && s.dir !== 'v')) return 'Ongeldig schip.'
    for (const [x, y] of cellsOf(s)) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return 'Een schip steekt buiten het bord.'
      // Ships may not overlap or touch, not even diagonally
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const other = taken.get(`${x + dx},${y + dy}`)
          if (other !== undefined && other !== i) return 'Schepen mogen elkaar niet raken.'
        }
      taken.set(`${x},${y}`, i)
    }
  }
  return null
}

/** A random valid fleet (for "Willekeurig"). */
export function randomFleet(random = Math.random): Ship[] {
  for (;;) {
    const ships: Ship[] = []
    for (const f of FLEET) {
      for (let tries = 0; tries < 200; tries++) {
        const dir = random() < 0.5 ? 'h' : 'v'
        const x = Math.floor(random() * (dir === 'h' ? SIZE - f.len + 1 : SIZE))
        const y = Math.floor(random() * (dir === 'v' ? SIZE - f.len + 1 : SIZE))
        const ship: Ship = { x, y, len: f.len, dir }
        if (!overlapsOrTouches([...ships, ship])) {
          ships.push(ship)
          break
        }
      }
    }
    // Very rarely the last ship doesn't fit: start over
    if (ships.length === FLEET.length) return ships
  }
}

function overlapsOrTouches(ships: Ship[]): boolean {
  const taken = new Map<string, number>()
  for (const [i, s] of ships.entries()) {
    for (const [x, y] of cellsOf(s)) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return true
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const other = taken.get(`${x + dx},${y + dy}`)
          if (other !== undefined && other !== i) return true
        }
      taken.set(`${x},${y}`, i)
    }
  }
  return false
}

/** What a shot at (x, y) on `fleet` does, given the shots already fired at it. */
export function resolveShot(fleet: Ship[], earlier: { x: number; y: number }[], x: number, y: number): { r: ShotResult; sunk?: Ship } {
  const ship = fleet.find((s) => cellsOf(s).some(([cx, cy]) => cx === x && cy === y))
  if (!ship) return { r: 'mis' }
  const hits = new Set([...earlier, { x, y }].map((s) => `${s.x},${s.y}`))
  const sunk = cellsOf(ship).every(([cx, cy]) => hits.has(`${cx},${cy}`))
  return sunk ? { r: 'gezonken', sunk: ship } : { r: 'raak' }
}

/** What a player sees of a game in progress (the server sends one per player). */
export type ZeeslagView = {
  phase: 'plaatsen' | 'spelen' | 'klaar'
  you: Player
  /** Your own ships (empty until you placed them). */
  fleet: Ship[]
  /** Whether the other player has placed their fleet. */
  opponentReady: boolean
  turn: Player
  shots: Shot[]
  /** The other player's fleet, once the game is over. */
  revealed: Ship[] | null
}
