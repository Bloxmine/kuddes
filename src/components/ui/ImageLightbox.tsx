/** One picture shown big over the page (Prikbord and recipe photos), in the same viewer as photos (PhotoViewer). */
import type { ReactNode } from 'react'
import { PhotoViewer } from './PhotoViewer'

export function ImageLightbox({ src, alt, caption, onClose }: { src: string; alt: string; caption?: ReactNode; onClose: () => void }) {
  return <PhotoViewer photos={[{ id: src, url: src, caption: alt }]} index={0} onIndex={() => undefined} onClose={onClose} info={caption && <span className="lbx-caption">{caption}</span>} />
}
