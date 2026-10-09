/**
 * Camera details from a photo's EXIF, read in the browser from the original
 * file (it's made smaller before uploading, which drops them). JPEG only; the
 * GPS part is never read, so a location can't come along.
 */
import type { PhotoExif } from '../../shared/photography'

const TAGS = {
  make: 0x010f,
  model: 0x0110,
  exifIfd: 0x8769,
  exposure: 0x829a,
  aperture: 0x829d,
  iso: 0x8827,
  takenAt: 0x9003,
  focalLength: 0x920a,
  lens: 0xa434,
}

export async function readExif(file: File): Promise<PhotoExif | null> {
  if (file.type !== 'image/jpeg') return null
  try {
    // The EXIF block is near the start: the first 256 kB is plenty
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer())
    if (view.getUint16(0) !== 0xffd8) return null
    let offset = 2
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset)
      const size = view.getUint16(offset + 2)
      // APP1 with "Exif\0\0"
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) return parseTiff(view, offset + 10)
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null
      offset += 2 + size
    }
  } catch {
    // a broken or unusual file: no details
  }
  return null
}

function parseTiff(view: DataView, start: number): PhotoExif | null {
  const little = view.getUint16(start) === 0x4949
  const u16 = (o: number) => view.getUint16(start + o, little)
  const u32 = (o: number) => view.getUint32(start + o, little)
  const ascii = (o: number, n: number) => {
    let s = ''
    for (let i = 0; i < n; i++) {
      const c = view.getUint8(start + o + i)
      if (!c) break
      s += String.fromCharCode(c)
    }
    return s.trim()
  }

  /** The values we know, from one directory (IFD0 or the Exif one). */
  const read = (ifd: number) => {
    const out = new Map<number, string | number>()
    const entries = u16(ifd)
    for (let i = 0; i < entries; i++) {
      const e = ifd + 2 + i * 12
      const tag = u16(e)
      if (!Object.values(TAGS).includes(tag)) continue
      const type = u16(e + 2)
      const n = u32(e + 4)
      const at = (bytes: number) => (bytes <= 4 ? e + 8 : u32(e + 8))
      if (type === 2) out.set(tag, ascii(at(n), n))
      else if (type === 3) out.set(tag, u16(at(2)))
      else if (type === 4) out.set(tag, u32(at(4)))
      else if (type === 5) {
        const o = at(8)
        const den = u32(o + 4)
        if (den) out.set(tag, u32(o) / den)
      }
    }
    return out
  }

  const ifd0 = read(u32(4))
  const exifAt = ifd0.get(TAGS.exifIfd)
  const sub = typeof exifAt === 'number' ? read(exifAt) : new Map<number, string | number>()
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const num = (v: unknown, digits = 1) => (typeof v === 'number' && v > 0 ? Math.round(v * 10 ** digits) / 10 ** digits : undefined)

  const make = str(ifd0.get(TAGS.make))
  const model = str(ifd0.get(TAGS.model))
  // "Canon Canon EOS 600D" → "Canon EOS 600D"
  const camera = model && make && !model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0]) ? `${make} ${model}` : (model ?? make)
  const taken = str(sub.get(TAGS.takenAt))?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  const exif: PhotoExif = {
    camera: camera?.slice(0, 60),
    lens: str(sub.get(TAGS.lens))?.slice(0, 80),
    focalLength: num(sub.get(TAGS.focalLength), 0),
    aperture: num(sub.get(TAGS.aperture)),
    exposure: num(sub.get(TAGS.exposure), 6),
    iso: num(sub.get(TAGS.iso), 0),
    takenAt: taken ? `${taken[1]}-${taken[2]}-${taken[3]}T${taken[4]}:${taken[5]}:${taken[6]}` : undefined,
  }
  const filled = Object.fromEntries(Object.entries(exif).filter(([, v]) => v !== undefined)) as PhotoExif
  return Object.keys(filled).length ? filled : null
}
