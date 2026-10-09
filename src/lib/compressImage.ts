/**
 * Shrinks a photo in the browser before it's uploaded, so a 6 MB phone photo
 * goes up as a few hundred kB. The server re-encodes it anyway (and strips
 * EXIF/GPS); this only saves the upload itself. GIFs are left alone (they may
 * be animated), and so is anything that wouldn't get smaller.
 */
export async function compressImage(file: File, maxSide: number): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    // Small enough already
    if (scale === 1 && file.size < 500 * 1024) return file
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)

    const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
    let blob = await encode('image/webp', 0.85)
    // Safari can't make WebP: JPEG then, but only for images without transparency
    if (!blob || blob.type !== 'image/webp') {
      if (file.type === 'image/png' || file.type === 'image/webp') return file
      blob = await encode('image/jpeg', 0.85)
    }
    if (!blob || blob.size >= file.size) return file
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'foto'}.${ext}`, { type: blob.type })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
