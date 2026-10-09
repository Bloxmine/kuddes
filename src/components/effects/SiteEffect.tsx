import { useSyncExternalStore } from 'react'
import { getSiteEffect, subscribeSiteEffect } from '../../lib/theme'
import { BackgroundEffect } from './BackgroundEffect'

/** The moving background of the member's own site theme, behind the whole page. */
export function SiteEffect() {
  const effect = useSyncExternalStore(subscribeSiteEffect, getSiteEffect)
  return effect ? <BackgroundEffect effect={effect} fixed /> : null
}
