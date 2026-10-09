/**
 * Seamless photo textures for backgrounds and title bars: bricks, stone,
 * marble, wood, metal… From tutorialsforblender3d.com (made with Spiral
 * Graphics' Genetica; royalty-free, for commercial and noncommercial use),
 * kept here as 256×256 WebP files in public/textures/<category>/<key>.webp.
 * A texture is used as a pattern: `tx_<category>_<key>` (see patternCss).
 */

export const TEXTURE_CATEGORIES = {
  bricks: 'Bakstenen',
  stone: 'Steen',
  wall: 'Muren & vloeren',
  tile: 'Tegels',
  marble: 'Marmer',
  wood: 'Houten planken',
  metal: 'Metaal',
  tarnished: 'Oud metaal',
  grass: 'Gras',
} as const
export type TextureCategory = keyof typeof TEXTURE_CATEGORIES

/** Per category: the file key and its name. */
export const TEXTURES: Record<TextureCategory, readonly (readonly [key: string, name: string])[]> = {
  bricks: [
    ['alternating-brick', 'Alternating Brick'],
    ['alternating-mudbrick', 'Alternating Mudbrick'],
    ['ancient-mayan-blocks', 'Ancient Mayan Blocks'],
    ['ancient-stone-slabs', 'Ancient Stone Slabs'],
    ['blue-green-brick', 'Blue Green Brick'],
    ['bubbly-bricks', 'Bubbly Bricks'],
    ['burlywood-brickwork', 'Burlywood Brickwork'],
    ['chipped-bricks', 'Chipped Bricks'],
    ['chipped-red-bricks', 'Chipped Red Bricks'],
    ['cracked-alternating-bricks', 'Cracked Alternating Bricks'],
    ['cream-city-brick', 'Cream City Brick'],
    ['desert-blush-brick', 'Desert Blush Brick'],
    ['faded-pink-brickwork', 'Faded Pink Brickwork'],
  ],
  stone: [
    ['aboriginal-canvas', 'Aboriginal Canvas'],
    ['akaroa-sandstone', 'Akaroa Sandstone'],
    ['artificial-stone-decor', 'Artificial Stone Decor'],
    ['ashy-sandstone', 'Ashy Sandstone'],
    ['banded-limestone', 'Banded Limestone'],
    ['battered-rose-granite', 'Battered Rose Granite'],
    ['brown-pearl-granite', 'Brown Pearl Granite'],
    ['brown-qussair-granite', 'Brown Qussair Granite'],
    ['butterscotch-feldspar', 'Butterscotch Feldspar'],
    ['chipped-rock', 'Chipped Rock'],
    ['chiseled-stone', 'Chiseled Stone'],
    ['cracked-pomegranate', 'Cracked Pomegranate'],
    ['motherof-pearl', 'Motherof Pearl'],
  ],
  wall: [
    ['alien-carving', 'Alien Carving'],
    ['ancient-temple-wall', 'Ancient Temple Wall'],
    ['asylum-cell-green', 'Asylum Cell Green'],
    ['asylum-cell-orange', 'Asylum Cell Orange'],
    ['black-star', 'Black Star'],
    ['blood-splattered-wall', 'Blood Splattered Wall'],
    ['blue-chip-wall', 'Blue Chip Wall'],
    ['blue-floral-wallpaper', 'Blue Floral Wallpaper'],
    ['bubbly-wallpaper', 'Bubbly Wallpaper'],
    ['carved-sandstone', 'Carved Sandstone'],
    ['cave-wall', 'Cave Wall'],
    ['chalkboard', 'Chalkboard'],
    ['padded-orange-wall', 'Padded Orange Wall'],
  ],
  tile: [
    ['ancient-hopscotch', 'Ancient Hopscotch'],
    ['battered-red-clover', 'Battered Red Clover'],
    ['black-herringbone', 'Black Herringbone'],
    ['blue-marble-persian', 'Blue Marble Persian'],
    ['blue-marble-slabs', 'Blue Marble Slabs'],
    ['blue-painted-tiles', 'Blue Painted Tiles'],
    ['brown-byzantine', 'Brown Byzantine'],
    ['carved-tiles-1', 'Carved Tiles 1'],
    ['carved-tiles-2', 'Carved Tiles 2'],
    ['concrete-triangles', 'Concrete Triangles'],
    ['corroded-techno-tiles', 'Corroded Techno Tiles'],
    ['corroded-tiles', 'Corroded Tiles'],
  ],
  marble: [
    ['bianco-statuario', 'Bianco Statuario'],
    ['black-marble', 'Black Marble'],
    ['blanco-aurora', 'Blanco Aurora'],
    ['blanco-nafin', 'Blanco Nafin'],
    ['blood-marble', 'Blood Marble'],
    ['blue-crack-marble', 'Blue Crack Marble'],
    ['blue-marble', 'Blue Marble'],
    ['breccia-pernice', 'Breccia Pernice'],
    ['bright-purple-marble', 'Bright Purple Marble'],
    ['brown-swirl-marble', 'Brown Swirl Marble'],
    ['carved-honey-onyx', 'Carved Honey Onyx'],
    ['creamy-white-marble', 'Creamy White Marble'],
  ],
  wood: [
    ['african-ebony-boards', 'African Ebony Boards'],
    ['beige-painted-boards', 'Beige Painted Boards'],
    ['blue-stained-basketweave', 'Blue Stained Basketweave'],
    ['brown-stained-boards', 'Brown Stained Boards'],
    ['cedar-boards', 'Cedar Boards'],
    ['colorful-boards', 'Colorful Boards'],
    ['crazy-boards', 'Crazy Boards'],
    ['dark-herringbone', 'Dark Herringbone'],
    ['dry-cracked-boards', 'Dry Cracked Boards'],
    ['faded-basketweave', 'Faded Basketweave'],
    ['goofy-boards', 'Goofy Boards'],
    ['gouged-basketweave', 'Gouged Basketweave'],
    ['orange-herringbone', 'Orange Herringbone'],
  ],
  metal: [
    ['alien-alloy-1', 'Alien Alloy 1'],
    ['alien-alloy-2', 'Alien Alloy 2'],
    ['alien-alloy-3', 'Alien Alloy 3'],
    ['aluminum-brush', 'Aluminum Brush'],
    ['aluminum-tubing', 'Aluminum Tubing'],
    ['basketweave-plates', 'Basketweave Plates'],
    ['beaten-gold', 'Beaten Gold'],
    ['bornto-rule', 'Bornto Rule'],
    ['bornto-shine', 'Bornto Shine'],
    ['bronze-armor', 'Bronze Armor'],
    ['bubble-grip', 'Bubble Grip'],
    ['chrome', 'Chrome'],
  ],
  tarnished: [
    ['absolute-rust', 'Absolute Rust'],
    ['aluminum-meets-acid', 'Aluminum Meets Acid'],
    ['battered-robot', 'Battered Robot'],
    ['blue-rusted-metal', 'Blue Rusted Metal'],
    ['blue-tarnish', 'Blue Tarnish'],
    ['bronze-age-artifact', 'Bronze Age Artifact'],
    ['copper-patina', 'Copper Patina'],
    ['copper-tarnish', 'Copper Tarnish'],
    ['copper-verdigris', 'Copper Verdigris'],
    ['corroded-metal', 'Corroded Metal'],
    ['corrugated-metal', 'Corrugated Metal'],
    ['corrugated-sharp', 'Corrugated Sharp'],
  ],
  grass: [
    ['grass-1', 'Grass 1'],
    ['grass-2', 'Grass 2'],
    ['grass-3', 'Grass 3'],
    ['grass-4', 'Grass 4'],
    ['grass-5', 'Grass 5'],
    ['grass-6', 'Grass 6'],
  ],
}

export type TexturePattern = `tx_${TextureCategory}_${string}`

/** Every texture as a pattern key, for validation. */
export const TEXTURE_PATTERNS = (Object.keys(TEXTURES) as TextureCategory[]).flatMap((c) => TEXTURES[c].map(([key]) => `tx_${c}_${key}` as TexturePattern))

export const isTexturePattern = (p: string): p is TexturePattern => p.startsWith('tx_')

/** The category and file of a texture pattern. */
export function textureOf(p: TexturePattern): { category: TextureCategory; key: string; name: string } | null {
  const m = /^tx_([a-z]+)_(.+)$/.exec(p)
  if (!m || !(m[1] in TEXTURES)) return null
  const category = m[1] as TextureCategory
  const found = TEXTURES[category].find(([key]) => key === m[2])
  return found ? { category, key: found[0], name: found[1] } : null
}

export const textureUrl = (category: TextureCategory, key: string) => `/textures/${category}/${key}.webp`
