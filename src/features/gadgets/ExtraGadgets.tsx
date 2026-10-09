/** Mario Kart Wii, Tekstvak, Uitgelichte foto, Bezoekersteller and Citaat: more profile gadgets. */
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { NAME_FONTS } from '../../../shared/customization'
import { MK_CHARACTERS, MK_CONTROLLERS, MK_CUPS, MK_POINTS_MAX, MK_VEHICLES, mkCupOf, mkSprite } from '../../../shared/mariokart'
import { hideMissingSprite } from '../../lib/hideMissing'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { RichText } from '../../lib/richText'
import { withSmileys } from '../../lib/smileys'
import './ExtraGadgets.css'

type Of<T extends Gadget['type']> = Extract<Gadget, { type: T }>

// ------------------------------------------------------------------ Mario Kart Wii

const WEIGHT_NAME = { licht: 'Lichtgewicht', middel: 'Middengewicht', zwaar: 'Zwaargewicht' } as const

/** Stars on the licence, from the VR (like the ranks online). */
const starsFor = (vr: number) => (vr >= 9000 ? 3 : vr >= 7500 ? 2 : vr >= 6000 ? 1 : 0)

/** A Mario Kart Wii licence: the driver, the ride, the points and the friend code. */
export function MarioKartGadget({ gadget }: { gadget: Of<'mariokart'> }) {
  const m = gadget.config
  const driver = MK_CHARACTERS[m.character]
  const ride = MK_VEHICLES[m.vehicle]
  const cup = mkCupOf(m.track)
  const stars = starsFor(m.vr)
  return (
    <div className="mkw">
      <div className="mkw-head">
        <span className="mkw-logo">
          MARIO KART <b>Wii</b>
        </span>
        <span className="mkw-licence">Licentie</span>
        <span className="mkw-flag" aria-hidden="true" />
      </div>
      <div className="mkw-body">
        <div className={`mkw-driver w-${driver.weight}`}>
          <img onError={hideMissingSprite} src={mkSprite.character(m.character)} alt="" width={64} height={64} />
        </div>
        <div className="mkw-who">
          <b>
            {driver.name}
            {stars > 0 && <img onError={hideMissingSprite} className="mkw-rank" src={mkSprite.stars(stars as 1 | 2 | 3)} alt={`${stars} ${stars === 1 ? 'ster' : 'sterren'}`} title={`${stars} ${stars === 1 ? 'ster' : 'sterren'} (VR ${m.vr})`} />}
            {m.vr >= MK_POINTS_MAX && <img onError={hideMissingSprite} className="mkw-rank" src={mkSprite.crown} alt="Maximale VR" title="Maximale VR!" />}
          </b>
          <span>{WEIGHT_NAME[driver.weight]}</span>
          <span className="mkw-ride">
            {ride.bike ? 'Motor' : 'Kart'}: {ride.name}
          </span>
        </div>
        <img onError={hideMissingSprite} className="mkw-vehicle" src={mkSprite.vehicle(m.vehicle)} alt={ride.name} title={ride.name} />
      </div>
      <div className="mkw-strip" aria-hidden="true" />
      <div className="mkw-points">
        <div>
          <span>VR</span>
          <b>{m.vr ? m.vr.toLocaleString('nl-NL') : '—'}</b>
        </div>
        <div>
          <span>BR</span>
          <b>{m.br ? m.br.toLocaleString('nl-NL') : '—'}</b>
        </div>
      </div>
      <dl className="mkw-facts">
        <dt>Favoriete baan</dt>
        <dd>
          {cup && <img onError={hideMissingSprite} className="mkw-cup" src={mkSprite.cup(cup)} alt="" title={MK_CUPS[cup].name} />}
          {m.track}
          {cup && <span className="muted"> · {MK_CUPS[cup].name}</span>}
        </dd>
        <dt>Besturing</dt>
        <dd>
          {m.controller === 'stuur' && <img onError={hideMissingSprite} className="mkw-wheel" src={mkSprite.wheel} alt="" />}
          {MK_CONTROLLERS[m.controller]} · {m.drift === 'handmatig' ? 'handmatig driften' : 'automatisch driften'}
        </dd>
        {m.friendCode && (
          <>
            <dt>Vriendcode</dt>
            <dd className="mkw-code">{m.friendCode}</dd>
          </>
        )}
      </dl>
      {m.wiimmfi && (
        <p className="mkw-online">
          <FarmIcon name="world" /> Racet nog online via Wiimmfi
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Tekstvak

export function TextGadget({ gadget }: { gadget: Of<'tekst'> }) {
  const t = gadget.config
  if (!t.text.trim()) return <p className="empty">Het tekstvak is nog leeg.</p>
  const style = { background: t.background, color: t.color, fontFamily: NAME_FONTS[t.font].css, textAlign: t.align === 'midden' ? 'center' : 'left' } as CSSProperties
  return (
    <div className="tekstvak" style={style}>
      {t.text.split('\n').map((line, i) => (
        <p key={i}>{line.trim() ? <RichText text={line} /> : ' '}</p>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Uitgelichte foto

export function PhotoGadget({ gadget, username, isOwner }: { gadget: Of<'foto'>; username: string; isOwner: boolean }) {
  const { caption, frame } = gadget.config
  const photo = gadget.photo
  if (!photo) {
    return (
      <p className="empty">
        Nog geen foto gekozen.{isOwner && <> Kies er een bij <Link to={`/gadgetmarkt?tab=mijn#gadget-${gadget.id}`}>Bewerken</Link>.</>}
      </p>
    )
  }
  return (
    <figure className={`uitgelicht frame-${frame}`}>
      <Link to={`/profiel/${username}?tab=fotos&foto=${photo.id}`} className="uitgelicht-img" title="Groter bekijken">
        <img src={photo.url} alt={caption || photo.caption || 'Foto'} loading="lazy" />
      </Link>
      {(caption || photo.caption) && <figcaption>{withSmileys(caption || photo.caption)}</figcaption>}
    </figure>
  )
}

// ------------------------------------------------------------------ Bezoekersteller

export function CounterGadget({ gadget }: { gadget: Of<'teller'> }) {
  return <Counter views={gadget.views} {...gadget.config} />
}

/** The teller itself; Kudde gadgets use it too. */
export function Counter({ views, label, style }: { views: number; label: string; style: string }) {
  const digits = String(views).padStart(6, '0').split('')
  return (
    <div className={`teller teller-${style}`}>
      <div className="teller-digits" aria-label={`${views} ${label}`}>
        {digits.map((d, i) => (
          <span key={i} className={i === digits.length - 1 ? 'last' : undefined}>
            {d}
          </span>
        ))}
      </div>
      {label && <p className="teller-label">{label}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ Citaat

export function QuoteGadget({ gadget }: { gadget: Of<'citaat'> }) {
  return <Quote {...gadget.config} />
}

/** The quote on its board; the Kudde Mededeling uses it too. */
export function Quote({ quote, author, style }: { quote: string; author: string; style: string }) {
  if (!quote.trim()) return <p className="empty">Nog geen citaat.</p>
  return (
    <blockquote className={`citaat citaat-${style}`}>
      <p>{withSmileys(quote)}</p>
      {author && <footer>— {author}</footer>}
    </blockquote>
  )
}
