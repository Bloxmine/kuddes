import type { MediaSummary } from '../../../shared/media'
import { Bottle, BoxSet } from '../gadgets/DrinkSeriesGadgets'
import { AlbumCover, BookCover, DvdCase, GameBox } from '../gadgets/ShelfGadgets'

type CoverData = Pick<MediaSummary, 'kind' | 'title' | 'creator' | 'year' | 'color' | 'style' | 'details'>

/**
 * The drawn cover, the same as in the kasten on profiles: a book, a dvd, a
 * box set, a cd or lp, a game box or a bottle. `size` scales it up.
 */
export function MediaCover({ item, size = 1 }: { item: CoverData; size?: number }) {
  const { title, creator, color, style, details: d } = item
  const icon = d.icon
  const cover = (() => {
    switch (item.kind) {
      case 'boeken':
        return <BookCover book={{ title, author: creator, color, style, icon }} />
      case 'films':
        return <DvdCase movie={{ title, year: item.year, color, style, icon }} />
      case 'series':
        return <BoxSet series={{ title, seasons: d.seasons ?? 1, platform: d.seriesPlatform ?? 'anders', color, style, icon }} />
      case 'muziek':
        return <AlbumCover album={{ title, artist: creator, format: d.format ?? 'cd', color, style, icon }} />
      case 'spellen':
        return <GameBox game={{ title, platform: d.gamePlatform ?? 'pc', color, style, icon }} />
      case 'drank':
        return <Bottle drink={{ title, maker: creator, kind: d.drinkKind ?? 'speciaal', color, style, icon }} />
    }
  })()
  return (
    <span className={`md-cover md-cover-${item.kind}`} style={{ zoom: size }} aria-hidden="true">
      {cover}
    </span>
  )
}

/** The photo when there is one, otherwise the drawn cover (for the collection and the lists). */
export function MediaFace({ item, size = 1, height }: { item: CoverData & { photoUrl: string | null }; size?: number; height: number }) {
  if (!item.photoUrl) return <MediaCover item={item} size={size} />
  return <img className="md-photo" src={item.photoUrl} alt="" loading="lazy" style={{ maxHeight: height }} />
}
