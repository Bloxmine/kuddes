import { DRINK_KINDS, GAME_PLATFORMS, SERIES_PLATFORMS } from '../../../shared/gadgets'
import { MEDIA_KINDS, type MediaSummary } from '../../../shared/media'
import type { FarmIconName } from '../../components/ui/farmIcons'

export const kindIcon = (kind: MediaSummary['kind']) => MEDIA_KINDS[kind].icon as FarmIconName

/** "1997 · Fantasy · PlayStation": what's known about it, in one line. */
export function metaLine(m: Pick<MediaSummary, 'kind' | 'year' | 'genre' | 'details'>): string {
  const d = m.details
  const extra =
    m.kind === 'spellen' && d.gamePlatform
      ? GAME_PLATFORMS[d.gamePlatform]
      : m.kind === 'series'
        ? [d.seasons ? (d.seasons === 1 ? '1 seizoen' : `${d.seasons} seizoenen`) : '', d.seriesPlatform && d.seriesPlatform !== 'anders' ? SERIES_PLATFORMS[d.seriesPlatform] : ''].filter(Boolean).join(' · ')
        : m.kind === 'muziek' && d.format
          ? d.format === 'lp' ? 'Lp' : 'Cd'
          : m.kind === 'drank' && d.drinkKind
            ? DRINK_KINDS[d.drinkKind]
            : ''
  return [m.year, m.genre, extra].filter(Boolean).join(' · ')
}

/** "3,8" */
export const ratingText = (r: number) => r.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
