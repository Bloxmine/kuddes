/**
 * The BuddyPoke background patterns (skulls, flowers, camouflage…) as tiles
 * in any colour. The artwork is a grey mask (server/assets/patterns, made
 * from BuddyPoke's red-channel art); this fills it with the colour. Used by
 * /patterns/:name.png and by the share pictures (the profielkaartje).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { BpPattern } from '../../shared/customization'

const DIR = path.resolve('server/assets/patterns')
const masks = new Map<string, Promise<{ data: Buffer; width: number; height: number }>>()
const tiles = new Map<string, Buffer>()

function mask(name: BpPattern) {
  let m = masks.get(name)
  if (!m) {
    m = readFile(path.join(DIR, `${name}.png`)).then(async (file) => {
      const { data, info } = await sharp(file).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    })
    masks.set(name, m)
  }
  return m
}

/** The tile as a PNG, in `color` (six hex digits, no #). */
export async function bpTile(name: BpPattern, color: string): Promise<Buffer> {
  const key = `${name}:${color}`
  let png = tiles.get(key)
  if (!png) {
    const { data, width, height } = await mask(name)
    const rgba = Buffer.alloc(width * height * 4)
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16))
    for (let i = 0; i < data.length; i++) {
      rgba[i * 4] = r
      rgba[i * 4 + 1] = g
      rgba[i * 4 + 2] = b
      rgba[i * 4 + 3] = data[i]
    }
    png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()
    tiles.set(key, png)
    if (tiles.size > 400) tiles.delete(tiles.keys().next().value!)
  }
  return png
}
