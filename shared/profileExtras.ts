/**
 * More about a member for the Profiel box: favourites ("Favoriete eten",
 * "Lijfspreuk"…) and gamertags. All optional; empty ones aren't shown.
 */

export const INTERESTS = {
  eten: { label: 'Favoriete eten', placeholder: 'Pannenkoeken, sushi, stamppot' },
  drinken: { label: 'Favoriete drinken', placeholder: 'Chocomel, cola, thee' },
  films: { label: 'Films', placeholder: 'Titanic, Shrek, The Matrix' },
  series: { label: 'Series', placeholder: 'Friends, GTST, The Office' },
  boeken: { label: 'Boeken', placeholder: 'Harry Potter, Pluk van de Petteflet' },
  games: { label: 'Games', placeholder: 'Mario Kart Wii, The Sims 2' },
  sport: { label: 'Sport', placeholder: 'Voetbal, hockey, zwemmen' },
  hobbys: { label: "Hobby's", placeholder: 'Tekenen, gamen, gitaar spelen' },
  dieren: { label: 'Huisdieren', placeholder: 'Kat Minoes, hond Bello' },
  vakantie: { label: 'Droomvakantie', placeholder: 'Japan, een roadtrip door Amerika' },
  idool: { label: 'Mijn idool', placeholder: 'Mijn oma, André Hazes' },
  motto: { label: 'Lijfspreuk', placeholder: 'Niet geschoten is altijd mis' },
} as const

export type InterestKey = keyof typeof INTERESTS
export type Interests = Partial<Record<InterestKey, string>>
export const INTEREST_MAX = 200

/**
 * Gamertags and friend codes. `pattern` is only a hint in the form; anything
 * up to the length is accepted (platforms change their rules).
 */
export const GAMER_PLATFORMS = {
  psn: { label: 'PlayStation Network', short: 'PSN', placeholder: 'Jouw PSN-naam', icon: 'controller' },
  xbox: { label: 'Xbox', short: 'Xbox', placeholder: 'Jouw gamertag', icon: 'controller' },
  steam: { label: 'Steam', short: 'Steam', placeholder: 'Jouw Steam-naam', icon: 'game_monitor' },
  nintendo: { label: 'Nintendo Switch', short: 'Switch', placeholder: 'SW-1234-5678-9012', icon: 'joystick' },
  wii: { label: 'Wii / Wiimmfi', short: 'Wii', placeholder: '1234-5678-9012', icon: 'joystick' },
  epic: { label: 'Epic Games', short: 'Epic', placeholder: 'Jouw Epic-naam', icon: 'game_monitor' },
  battlenet: { label: 'Battle.net', short: 'Battle.net', placeholder: 'Naam#1234', icon: 'game_monitor' },
  riot: { label: 'Riot Games', short: 'Riot', placeholder: 'Naam#EUW', icon: 'game_monitor' },
  minecraft: { label: 'Minecraft', short: 'Minecraft', placeholder: 'Jouw Minecraft-naam', icon: 'joystick' },
  discord: { label: 'Discord', short: 'Discord', placeholder: 'jouwnaam', icon: 'comment' },
} as const satisfies Record<string, { label: string; short: string; placeholder: string; icon: string }>

export type GamerPlatform = keyof typeof GAMER_PLATFORMS
export type GamerTags = Partial<Record<GamerPlatform, string>>
export const GAMER_TAG_MAX = 40
