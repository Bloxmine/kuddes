/**
 * Moving backgrounds for a profile design, a Kudde design or your own site
 * theme: stars that blink, snow, rain… They're drawn by CSS animations
 * (src/components/effects/BackgroundEffect.tsx) over the background and
 * behind the boxes. "Minder beweging" turns them off.
 */
export const BACKGROUND_EFFECTS = {
  sterren: { name: 'Knipperende sterren', hint: 'sterretjes aan en uit', color: '#fff4c2' },
  sneeuw: { name: 'Sneeuw', hint: 'vlokken die dwarrelen', color: '#ffffff' },
  regen: { name: 'Regen', hint: 'een flinke bui', color: '#b9d4f2' },
  vuurvliegjes: { name: 'Vuurvliegjes', hint: 'glimmende lichtjes', color: '#fff27a' },
  bubbels: { name: 'Bubbels', hint: 'zeepbellen omhoog', color: '#ffffff' },
  hartjes: { name: 'Zwevende hartjes', hint: 'hartjes naar boven', color: '#ff6f9c' },
  confetti: { name: 'Confetti', hint: 'altijd feest', color: null },
  bladeren: { name: 'Herfstbladeren', hint: 'vallende blaadjes', color: null },
  bloesem: { name: 'Bloemblaadjes', hint: 'kersenbloesem', color: '#ffc4d8' },
  vallendesterren: { name: 'Vallende sterren', hint: 'wens maar raak', color: '#ffffff' },
  glitter: { name: 'Glitter', hint: 'fonkelende sterretjes', color: '#ffe27a' },
} as const satisfies Record<string, { name: string; hint: string; color: string | null }>

export type BackgroundEffectKind = keyof typeof BACKGROUND_EFFECTS

export const EFFECT_AMOUNTS = { weinig: 'Weinig', normaal: 'Normaal', veel: 'Veel' } as const
export type EffectAmount = keyof typeof EFFECT_AMOUNTS

export type BackgroundEffect = {
  kind: BackgroundEffectKind
  /** The colour of the stars, flakes… (not for the multi-coloured kinds); missing = the standard one. */
  color?: string
  amount?: EffectAmount
}

/** Whether the colour can be chosen (confetti and leaves have their own). */
export const effectHasColor = (kind: BackgroundEffectKind) => BACKGROUND_EFFECTS[kind].color !== null
