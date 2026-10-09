/**
 * Mario Kart Wii for the profile gadget: the characters with their weight
 * class, the karts and bikes each class can drive, and the 32 tracks. Names
 * as in the game.
 */

export type Weight = 'licht' | 'middel' | 'zwaar'

export const MK_CHARACTERS = {
  babymario: { name: 'Baby Mario', weight: 'licht' },
  babyluigi: { name: 'Baby Luigi', weight: 'licht' },
  babypeach: { name: 'Baby Peach', weight: 'licht' },
  babydaisy: { name: 'Baby Daisy', weight: 'licht' },
  toad: { name: 'Toad', weight: 'licht' },
  toadette: { name: 'Toadette', weight: 'licht' },
  koopa: { name: 'Koopa Troopa', weight: 'licht' },
  drybones: { name: 'Dry Bones', weight: 'licht' },
  mario: { name: 'Mario', weight: 'middel' },
  luigi: { name: 'Luigi', weight: 'middel' },
  peach: { name: 'Peach', weight: 'middel' },
  daisy: { name: 'Daisy', weight: 'middel' },
  yoshi: { name: 'Yoshi', weight: 'middel' },
  birdo: { name: 'Birdo', weight: 'middel' },
  diddy: { name: 'Diddy Kong', weight: 'middel' },
  bowserjr: { name: 'Bowser Jr.', weight: 'middel' },
  wario: { name: 'Wario', weight: 'zwaar' },
  waluigi: { name: 'Waluigi', weight: 'zwaar' },
  dk: { name: 'Donkey Kong', weight: 'zwaar' },
  bowser: { name: 'Bowser', weight: 'zwaar' },
  kingboo: { name: 'King Boo', weight: 'zwaar' },
  rosalina: { name: 'Rosalina', weight: 'zwaar' },
  funky: { name: 'Funky Kong', weight: 'zwaar' },
  drybowser: { name: 'Dry Bowser', weight: 'zwaar' },
  miiklein: { name: 'Mii (klein)', weight: 'licht' },
  miimiddel: { name: 'Mii (middel)', weight: 'middel' },
  miigroot: { name: 'Mii (groot)', weight: 'zwaar' },
} as const satisfies Record<string, { name: string; weight: Weight }>

export type MkCharacter = keyof typeof MK_CHARACTERS

export const MK_VEHICLES = {
  // Light
  standaardkart_s: { name: 'Standard Kart S', weight: 'licht', bike: false },
  boosterseat: { name: 'Booster Seat', weight: 'licht', bike: false },
  minibeast: { name: 'Mini Beast', weight: 'licht', bike: false },
  cheepcharger: { name: 'Cheep Charger', weight: 'licht', bike: false },
  tinytitan: { name: 'Tiny Titan', weight: 'licht', bike: false },
  bluefalcon: { name: 'Blue Falcon', weight: 'licht', bike: false },
  standaardbike_s: { name: 'Standard Bike S', weight: 'licht', bike: true },
  bulletbike: { name: 'Bullet Bike', weight: 'licht', bike: true },
  bitbike: { name: 'Bit Bike', weight: 'licht', bike: true },
  quacker: { name: 'Quacker', weight: 'licht', bike: true },
  magikruiser: { name: 'Magikruiser', weight: 'licht', bike: true },
  jetbubble: { name: 'Jet Bubble', weight: 'licht', bike: true },
  // Medium
  standaardkart_m: { name: 'Standard Kart M', weight: 'middel', bike: false },
  classicdragster: { name: 'Classic Dragster', weight: 'middel', bike: false },
  wildwing: { name: 'Wild Wing', weight: 'middel', bike: false },
  superblooper: { name: 'Super Blooper', weight: 'middel', bike: false },
  daytripper: { name: 'Daytripper', weight: 'middel', bike: false },
  sprinter: { name: 'Sprinter', weight: 'middel', bike: false },
  standaardbike_m: { name: 'Standard Bike M', weight: 'middel', bike: true },
  machbike: { name: 'Mach Bike', weight: 'middel', bike: true },
  sugarscoot: { name: 'Sugarscoot', weight: 'middel', bike: true },
  zipzip: { name: 'Zip Zip', weight: 'middel', bike: true },
  sneakster: { name: 'Sneakster', weight: 'middel', bike: true },
  dolphindasher: { name: 'Dolphin Dasher', weight: 'middel', bike: true },
  // Heavy
  standaardkart_l: { name: 'Standard Kart L', weight: 'zwaar', bike: false },
  offroader: { name: 'Offroader', weight: 'zwaar', bike: false },
  flameflyer: { name: 'Flame Flyer', weight: 'zwaar', bike: false },
  piranhaprowler: { name: 'Piranha Prowler', weight: 'zwaar', bike: false },
  jetsetter: { name: 'Jetsetter', weight: 'zwaar', bike: false },
  honeycoupe: { name: 'Honeycoupe', weight: 'zwaar', bike: false },
  standaardbike_l: { name: 'Standard Bike L', weight: 'zwaar', bike: true },
  flamerunner: { name: 'Flame Runner', weight: 'zwaar', bike: true },
  wariobike: { name: 'Wario Bike', weight: 'zwaar', bike: true },
  shootingstar: { name: 'Shooting Star', weight: 'zwaar', bike: true },
  spear: { name: 'Spear', weight: 'zwaar', bike: true },
  phantom: { name: 'Phantom', weight: 'zwaar', bike: true },
} as const satisfies Record<string, { name: string; weight: Weight; bike: boolean }>

export type MkVehicle = keyof typeof MK_VEHICLES

export const MK_CUPS = {
  paddenstoel: { name: 'Paddenstoel Cup', tracks: ["Luigi Circuit", 'Moo Moo Meadows', 'Mushroom Gorge', "Toad's Factory"] },
  bloem: { name: 'Bloemen Cup', tracks: ['Mario Circuit', 'Coconut Mall', 'DK Summit', "Wario's Gold Mine"] },
  ster: { name: 'Ster Cup', tracks: ['Daisy Circuit', 'Koopa Cape', 'Maple Treeway', 'Grumble Volcano'] },
  speciaal: { name: 'Speciale Cup', tracks: ['Dry Dry Ruins', 'Moonview Highway', "Bowser's Castle", 'Rainbow Road'] },
  schild: { name: 'Schild Cup', tracks: ['GCN Peach Beach', 'DS Yoshi Falls', 'SNES Ghost Valley 2', 'N64 Mario Raceway'] },
  banaan: { name: 'Bananen Cup', tracks: ['N64 Sherbet Land', 'GBA Shy Guy Beach', 'DS Delfino Square', 'GCN Waluigi Stadium'] },
  blad: { name: 'Blad Cup', tracks: ['DS Desert Hills', 'GBA Bowser Castle 3', "N64 DK's Jungle Parkway", 'GCN Mario Circuit'] },
  bliksem: { name: 'Bliksem Cup', tracks: ['SNES Mario Circuit 3', 'DS Peach Gardens', 'GCN DK Mountain', "N64 Bowser's Castle"] },
} as const

export const MK_TRACKS: readonly string[] = Object.values(MK_CUPS).flatMap((c) => c.tracks)

export const MK_CONTROLLERS = {
  stuur: 'Wii Wheel',
  nunchuk: 'Wii-afstandsbediening + Nunchuk',
  classic: 'Classic Controller',
  gamecube: 'GameCube-controller',
} as const
export type MkController = keyof typeof MK_CONTROLLERS

/** VR and BR are 1 to 9999 in the game; everyone starts at 5000. */
export const MK_POINTS_MAX = 9999

/** A friend code: 12 digits, written 1234-5678-9012. */
export const MK_FRIEND_CODE = /^\d{4}-\d{4}-\d{4}$/

export type MkCup = keyof typeof MK_CUPS

/** The cup a track is in. */
export const mkCupOf = (track: string) => (Object.keys(MK_CUPS) as MkCup[]).find((c) => (MK_CUPS[c].tracks as readonly string[]).includes(track))

/**
 * Sprites from the game (public/mkwii/, from The Spriters Resource): the
 * character select portraits, the vehicles, the cup icons and the licence's
 * rank stars. They're Nintendo's, so they aren't in the repository: a server
 * may add them itself (DEPLOY.md), and without them the gadget shows names only.
 */
export const mkSprite = {
  character: (c: MkCharacter) => `/mkwii/coureurs/${c}.png`,
  vehicle: (v: MkVehicle) => `/mkwii/voertuigen/${v}.png`,
  cup: (c: MkCup) => `/mkwii/cups/${c}.png`,
  stars: (n: 1 | 2 | 3) => `/mkwii/ster${n}.png`,
  wheel: '/mkwii/stuur.png',
  crown: '/mkwii/kroon.png',
}
