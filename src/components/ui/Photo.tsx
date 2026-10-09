import { useState } from 'react'
import { seededGradient } from '../../lib/placeholder'

type PhotoProps = {
  src: string
  width: number
  height?: number
  alt: string
  className?: string
  /** Crop to fill the box instead of letterboxing. */
  cover?: boolean
}

/** An uploaded photo, with a coloured block if it fails to load. */
export function Photo({ src, width, height = width, alt, className, cover = true }: PhotoProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={className}
        style={{ display: 'block', width, height, background: seededGradient(src) }}
      />
    )
  }

  return (
    <img
      className={className}
      src={src}
      width={width}
      height={height}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ objectFit: cover ? 'cover' : 'contain', background: cover ? undefined : '#111' }}
    />
  )
}
