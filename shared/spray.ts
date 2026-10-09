/**
 * The Graffitimuur (/graffiti): the spray-paint wall from public/spray, with
 * Kuddes friends as the second player. The cans' names are the ones the wall
 * reports; the server only counts these for achievements.
 */
export const SPRAY_CANS = {
  basic: ['Sneeuw', 'Nacht', 'Vuurrood', 'Mandarijn', 'Zonneschijn', 'Blad', 'Hemelsblauw', 'Kobalt', 'Violet', 'Kauwgom'],
  special: ['Goud', 'Zilver', 'Koper', 'Chroom', 'Holografisch', 'Goudglitter', 'Discoglitter', 'Sterrenconfetti', 'Gouden sterren', 'Regenboog'],
  secret: ['Houtnerf', 'Vampier', 'Plasma', 'Lava', 'Melkweg', 'Camouflage', 'Zebra', 'Marmer', 'Luipaard', 'RGB'],
} as const

export type SpraySet = keyof typeof SPRAY_CANS
export const ALL_SPRAY_CANS: readonly string[] = [...SPRAY_CANS.basic, ...SPRAY_CANS.special, ...SPRAY_CANS.secret]
export const setOfCan = (name: string): SpraySet | null => (Object.keys(SPRAY_CANS) as SpraySet[]).find((s) => (SPRAY_CANS[s] as readonly string[]).includes(name)) ?? null

/** What the wall gets back from your account. */
export type SprayProgress = {
  /** Cans you've sprayed with, on any computer. */
  tried: string[]
  /** All basic and special cans tried: the secret row is open. */
  unlocked: boolean
  photos: number
}

/** A message between the wall and the page (js/net.js and SprayWall). */
export type SprayEvent = { name: 'can'; data: { name: string; set: string } } | { name: 'unlock'; data: null } | { name: 'photo'; data: null }
