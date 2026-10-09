import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { COVER_COLORS, GAME_PLATFORMS, type ShelfGame, type Album, type Book, type CoverColor, type Movie, type ShelfLook, SHELF_LOOKS_FOR } from '../../../shared/gadgets'
import { withSmileys } from '../../lib/smileys'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { RespectButton } from './ItemRespect'
import { starTag, useItemRespect } from './gadgetData'
import { Stars } from './Stars'
import './ShelfGadgets.css'

type BooksData = Extract<Gadget, { type: 'boeken' }>
type MoviesData = Extract<Gadget, { type: 'films' }>
type AlbumsData = Extract<Gadget, { type: 'platen' }>
type GamesData = Extract<Gadget, { type: 'spellen' }>

const coverVars = (color: CoverColor) => ({ '--cv-bg': COVER_COLORS[color][0], '--cv-fg': COVER_COLORS[color][1] }) as CSSProperties

/** The icon picked for an item (shared/icons.ts), on its cover above the title. */
export function CoverIcon({ icon }: { icon?: string }) {
  if (!icon) return null
  return (
    <span className="cv-icon" aria-hidden="true">
      <FarmIcon name={icon as FarmIconName} size={32} />
    </span>
  )
}

/** A drawn book cover: no images, just the title and author in one of four layouts (and an icon if picked). */
export function BookCover({ book }: { book: Pick<Book, 'title' | 'author' | 'color' | 'style' | 'icon'> }) {
  return (
    <span className={`bk-cover cv-${book.style}`} style={coverVars(book.color)}>
      {book.style === 'sierlijk' && <span className="cv-ornament">❦</span>}
      <CoverIcon icon={book.icon} />
      <span className="cv-title">{book.title || 'Titel'}</span>
      {book.author && <span className="cv-author">{book.author}</span>}
    </span>
  )
}

/** A dvd in its case, with a drawn poster. */
export function DvdCase({ movie }: { movie: Pick<Movie, 'title' | 'year' | 'color' | 'style' | 'icon'> }) {
  return (
    <span className={`dvd-case cv-${movie.style}`} style={coverVars(movie.color)}>
      <span className="dvd-logo">DVD</span>
      <span className="dvd-poster">
        <span className="dvd-light" />
        <CoverIcon icon={movie.icon} />
        <span className="cv-title">{movie.title || 'Titel'}</span>
        {movie.year && <span className="cv-author">{movie.year}</span>}
      </span>
    </span>
  )
}

/** An album: a cd in its jewel case, or a record sleeve with the vinyl peeking out. */
export function AlbumCover({ album }: { album: Pick<Album, 'title' | 'artist' | 'format' | 'color' | 'style' | 'icon'> }) {
  const art = (
    <span className={`al-art cv-${album.style}`} style={coverVars(album.color)}>
      {album.style === 'sierlijk' && <span className="cv-ornament">❦</span>}
      <CoverIcon icon={album.icon} />
      <span className="cv-title">{album.title || 'Titel'}</span>
      {album.artist && <span className="cv-author">{album.artist}</span>}
    </span>
  )
  return album.format === 'lp' ? (
    <span className="lp">
      <span className="lp-vinyl" style={coverVars(album.color)} />
      <span className="lp-sleeve">{art}</span>
    </span>
  ) : (
    <span className="cd-case">
      {art}
      <span className="cd-hinge" />
    </span>
  )
}

/** The strip at the top (or side) of a game box, like on the real ones. */
const PLATFORM_STRIP: Record<ShelfGame['platform'], string> = {
  pc: 'PC CD-ROM',
  playstation: 'PlayStation',
  xbox: 'XBOX',
  nintendo: 'Nintendo',
  handheld: 'DS',
  gameboy: 'GAME BOY',
  bordspel: '',
}

/** A game in its box: the case (or cartridge, or board game box) of its platform. */
export function GameBox({ game }: { game: Pick<ShelfGame, 'title' | 'platform' | 'color' | 'style' | 'icon'> }) {
  return (
    <span className={`gm-box pf-${game.platform} cv-${game.style}`} style={coverVars(game.color)} title={GAME_PLATFORMS[game.platform]}>
      {PLATFORM_STRIP[game.platform] && <span className="gm-strip">{PLATFORM_STRIP[game.platform]}</span>}
      <span className="gm-art">
        <span className="dvd-light" />
        <CoverIcon icon={game.icon} />
        <span className="cv-title">{game.title || 'Titel'}</span>
      </span>
    </span>
  )
}

/** What the owner thought of the picked book or film. */
export function Detail({ title, sub, rating, note, onClose, respect, mediaId }: { title: string; sub: string; rating: number; note: string; onClose: () => void; respect?: ReactNode; mediaId?: number }) {
  return (
    <div className="shelf-detail" role="dialog" aria-label={title}>
      <button type="button" className="shelf-detail-close" onClick={onClose} aria-label="Sluiten">
        ×
      </button>
      <b>{title}</b>
      {sub && <span className="muted">{sub}</span>}
      <Stars rating={rating} />
      {note ? (
        <p>{withSmileys(note)}</p>
      ) : null}
      {mediaId && (
        <Link to={`/recensies/${mediaId}`} className="shelf-detail-review">
          Lees de recensies »
        </Link>
      )}
      {respect}
    </div>
  )
}

export type ShelfProps = { username: string; isOwner: boolean }

/** A little star with the respect count on an item that has some. */
export function RespectTag({ gadget, item, username }: { gadget: Gadget; item: string; username: string }) {
  const { of } = useItemRespect(gadget, username)
  const n = of(item).count
  return n > 0 ? (
    <span className="shelf-respect" title={`${n} respect`}>
      ★ {n}
    </span>
  ) : null
}

/** The furniture: a header plate (or neon sign) and shelves, in the owner's look. */
export function ShelfCase({ look, kind, title, children }: { look: ShelfLook; kind: 'books' | 'dvds' | 'music' | 'games' | 'drinks' | 'series'; title: string; children: ReactNode }) {
  return (
    <div className={`shelf-case look-${look} shelf-${kind}`}>
      <div className="shelf-head">
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

/** A bookcase like in a bookshop, with the books face out on the shelves. */
export function BooksGadget({ gadget, username, isOwner }: { gadget: BooksData } & ShelfProps) {
  const books = gadget.config.books
  const [open, setOpen] = useState<string | null>(null)
  const picked = books.find((b) => b.id === open)
  if (books.length === 0) return <p className="empty">Nog geen boeken in de kast.</p>
  return (
    <ShelfCase look={gadget.config.look ?? SHELF_LOOKS_FOR.boeken[0]} kind="books" title="Gelezen & goed bevonden">
      <ul className="shelf-rows">
        {books.map((b) => (
          <li key={b.id}>
            <button type="button" className={open === b.id ? 'shelf-item open' : 'shelf-item'} onClick={() => setOpen(open === b.id ? null : b.id)} title={`${b.title}${b.author ? ` – ${b.author}` : ''}`}>
              <BookCover book={b} />
              <span className="bk-stand" aria-hidden="true" />
            </button>
            {b.rating >= 4 && (
              <span className="shelf-tag" aria-hidden="true">
                {b.rating === 5 ? 'Tip!' : starTag(b.rating)}
              </span>
            )}
            <RespectTag gadget={gadget} item={b.id} username={username} />
          </li>
        ))}
      </ul>
      {picked && <Detail title={picked.title} mediaId={picked.mediaId} sub={picked.author} rating={picked.rating} note={picked.note} onClose={() => setOpen(null)} respect={<RespectButton gadget={gadget} item={picked.id} username={username} isOwner={isOwner} />} />}
    </ShelfCase>
  )
}

/** A rack of dvd's face out, like in the video store. */
export function MoviesGadget({ gadget, username, isOwner }: { gadget: MoviesData } & ShelfProps) {
  const movies = gadget.config.movies
  const [open, setOpen] = useState<string | null>(null)
  const picked = movies.find((m) => m.id === open)
  if (movies.length === 0) return <p className="empty">Nog geen films in het rek.</p>
  return (
    <ShelfCase look={gadget.config.look ?? SHELF_LOOKS_FOR.films[0]} kind="dvds" title="Mijn favoriete films">
      <ul className="shelf-rows">
        {movies.map((m) => (
          <li key={m.id}>
            <button type="button" className={open === m.id ? 'shelf-item open' : 'shelf-item'} onClick={() => setOpen(open === m.id ? null : m.id)} title={`${m.title}${m.year ? ` (${m.year})` : ''}`}>
              <DvdCase movie={m} />
            </button>
            {m.rating >= 4 && (
              <span className="shelf-tag dvd-sticker" aria-hidden="true">
                {m.rating === 5 ? 'Top!' : starTag(m.rating)}
              </span>
            )}
            <RespectTag gadget={gadget} item={m.id} username={username} />
          </li>
        ))}
      </ul>
      {picked && <Detail title={picked.title} mediaId={picked.mediaId} sub={picked.year} rating={picked.rating} note={picked.note} onClose={() => setOpen(null)} respect={<RespectButton gadget={gadget} item={picked.id} username={username} isOwner={isOwner} />} />}
    </ShelfCase>
  )
}

const WALLET_PAGE = 4

/** A disc in a clear sleeve, printed with the album. */
function Disc({ album }: { album: Album }) {
  return (
    <span className={album.format === 'lp' ? 'cd-disc vinyl' : 'cd-disc'} style={coverVars(album.color)}>
      <span className="cd-label">
        <span className="cv-title">{album.title}</span>
        {album.artist && <span className="cv-author">{album.artist}</span>}
      </span>
    </span>
  )
}

/**
 * The zip-around cd wallet from the car's glove box: two pages of sleeves
 * with the discs in them, paged through like a book.
 */
function CdWallet({ albums, open, onOpen }: { albums: Album[]; open: string | null; onOpen: (id: string | null) => void }) {
  const [spread, setSpread] = useState(0)
  const spreads = Math.max(1, Math.ceil(albums.length / (WALLET_PAGE * 2)))
  const at = Math.min(spread, spreads - 1)
  const page = (n: number) => {
    const items: (Album | null)[] = albums.slice(n * WALLET_PAGE, (n + 1) * WALLET_PAGE)
    while (items.length < WALLET_PAGE) items.push(null)
    return items
  }
  return (
    <div className="cdw">
      <div className="cdw-case">
        <span className="cdw-patch" aria-hidden="true">
          CD
        </span>
        <div className="cdw-spread" key={at}>
          {[at * 2, at * 2 + 1].map((n) => (
            <ul key={n} className="cdw-page">
              {page(n).map((a, i) =>
                a ? (
                  <li key={a.id}>
                    <button type="button" className={open === a.id ? 'cdw-sleeve open' : 'cdw-sleeve'} onClick={() => onOpen(open === a.id ? null : a.id)} title={`${a.title}${a.artist ? ` – ${a.artist}` : ''}`}>
                      <Disc album={a} />
                    </button>
                  </li>
                ) : (
                  <li key={`leeg-${i}`}>
                    <span className="cdw-sleeve empty" />
                  </li>
                ),
              )}
            </ul>
          ))}
        </div>
      </div>
      {spreads > 1 && (
        <div className="cdw-nav">
          <button type="button" onClick={() => setSpread(at - 1)} disabled={at === 0} aria-label="Vorige bladzijde">
            ‹
          </button>
          <span>
            Blz. {at + 1} van {spreads}
          </span>
          <button type="button" onClick={() => setSpread(at + 1)} disabled={at === spreads - 1} aria-label="Volgende bladzijde">
            ›
          </button>
        </div>
      )}
    </div>
  )
}

/** A shelf of albums, cd's and records mixed (or the cd wallet). */
export function AlbumsGadget({ gadget, username, isOwner }: { gadget: AlbumsData } & ShelfProps) {
  const albums = gadget.config.albums
  const [open, setOpen] = useState<string | null>(null)
  const picked = albums.find((a) => a.id === open)
  if (albums.length === 0) return <p className="empty">Nog geen albums in de kast.</p>
  const detail = picked && <Detail title={picked.title} mediaId={picked.mediaId} sub={[picked.artist, picked.format === 'lp' ? 'lp' : 'cd'].filter(Boolean).join(' · ')} rating={picked.rating} note={picked.note} onClose={() => setOpen(null)} respect={<RespectButton gadget={gadget} item={picked.id} username={username} isOwner={isOwner} />} />
  if (gadget.config.look === 'cdmap') {
    return (
      <>
        <CdWallet albums={albums} open={open} onOpen={setOpen} />
        {detail}
      </>
    )
  }
  return (
    <ShelfCase look={gadget.config.look ?? SHELF_LOOKS_FOR.platen[0]} kind="music" title="Grijsgedraaid">
      <ul className="shelf-rows">
        {albums.map((a) => (
          <li key={a.id}>
            <button type="button" className={open === a.id ? 'shelf-item open' : 'shelf-item'} onClick={() => setOpen(open === a.id ? null : a.id)} title={`${a.title}${a.artist ? ` – ${a.artist}` : ''}`}>
              <AlbumCover album={a} />
            </button>
            {a.rating >= 4 && (
              <span className="shelf-tag dvd-sticker" aria-hidden="true">
                {a.rating === 5 ? 'Top!' : starTag(a.rating)}
              </span>
            )}
            <RespectTag gadget={gadget} item={a.id} username={username} />
          </li>
        ))}
      </ul>
      {detail}
    </ShelfCase>
  )
}

/** Favourite games, face out in the game store (or any of the other cases). */
export function GamesGadget({ gadget, username, isOwner }: { gadget: GamesData } & ShelfProps) {
  const games = gadget.config.games
  const [open, setOpen] = useState<string | null>(null)
  const picked = games.find((g) => g.id === open)
  if (games.length === 0) return <p className="empty">Nog geen spellen in de kast.</p>
  return (
    <ShelfCase look={gadget.config.look ?? SHELF_LOOKS_FOR.spellen[0]} kind="games" title="Mijn favoriete games">
      <ul className="shelf-rows">
        {games.map((g) => (
          <li key={g.id}>
            <button type="button" className={open === g.id ? 'shelf-item open' : 'shelf-item'} onClick={() => setOpen(open === g.id ? null : g.id)} title={`${g.title} (${GAME_PLATFORMS[g.platform]})`}>
              <GameBox game={g} />
            </button>
            {g.rating >= 4 && (
              <span className="shelf-tag dvd-sticker" aria-hidden="true">
                {g.rating === 5 ? 'Top!' : starTag(g.rating)}
              </span>
            )}
            <RespectTag gadget={gadget} item={g.id} username={username} />
          </li>
        ))}
      </ul>
      {picked && <Detail title={picked.title} mediaId={picked.mediaId} sub={GAME_PLATFORMS[picked.platform]} rating={picked.rating} note={picked.note} onClose={() => setOpen(null)} respect={<RespectButton gadget={gadget} item={picked.id} username={username} isOwner={isOwner} />} />}
    </ShelfCase>
  )
}
