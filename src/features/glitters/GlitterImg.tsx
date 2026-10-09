import type { GlitterImage } from '../../../shared/glitters'
import './Glitters.css'

/** A glitterplaatje in a knuffel or on the timeline. */
export function GlitterImg({ glitter }: { glitter: GlitterImage }) {
  return <img className="glitter-img" src={glitter.url} alt={glitter.title} title={glitter.title} width={glitter.width} height={glitter.height} loading="lazy" />
}
