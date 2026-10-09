/**
 * Virtueel huisdier, Forumberichten, Glitterplakboek and Spelscores on a
 * profile. What they show comes with the gadget (server/lib/gadgetExtras.ts).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget, GameTally } from '../../../shared/api'
import { threadHref } from '../../../shared/forum'
import { PET_ACTIONS, PET_BACKGROUNDS, PET_COINS, PET_HATS, PET_SPECIES, type PetAction, type PetBackground, type PetHat } from '../../../shared/gadgets'
import { GAMES } from '../../../shared/games'
import type { Glitter } from '../../../shared/glitters'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Modal } from '../../components/ui/Modal'
import { api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import { playBallClick, playGood, playPickUp } from '../games/sounds'
import { useCollect } from '../glitters/glitterQueries'
import { PetArt, type PetMood } from './PetArt'
import './FunGadgets.css'

type Of<T extends Gadget['type']> = Extract<Gadget, { type: T }>

const PET_ICONS: Record<PetAction, FarmIconName> = { voeren: 'hamburger', aaien: 'heart', spelen: 'sport_basketball' }
const NEED_NAMES: Record<PetAction, string> = { voeren: 'Eten', aaien: 'Aandacht', spelen: 'Plezier' }
const STAGE_NAMES = { baby: 'Baby', jong: 'Jong', volwassen: 'Volwassen' }

/** Put a changed gadget into the profile's cached list. */
function usePutGadget(username: string) {
  const queryClient = useQueryClient()
  return (gadget: Gadget) => queryClient.setQueryData<Gadget[]>(keys.gadgets(username), (list = []) => list.map((g) => (g.id === gadget.id ? gadget : g)))
}

function petMood(pet: Of<'huisdier'>['pet']): PetMood {
  if (pet.sleeping) return 'slaap'
  const values = Object.values(pet.needs)
  if (Math.min(...values) < 20) return 'verdrietig'
  return values.reduce((a, b) => a + b, 0) / values.length > 65 ? 'blij' : 'gewoon'
}

/** What the pet says about itself. */
function petLine(name: string, pet: Of<'huisdier'>['pet']) {
  if (pet.sleeping) return `${name} slaapt. Zzz…`
  if (pet.needs.voeren < 30) return `${name} heeft honger!`
  if (pet.needs.aaien < 30) return `${name} wil geaaid worden.`
  if (pet.needs.spelen < 30) return `${name} verveelt zich…`
  if (Object.values(pet.needs).every((n) => n > 75)) return `${name} is superblij!`
  return `${name} voelt zich prima.`
}

const waitText = (iso: string) => {
  const minutes = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))
  return minutes >= 60 ? `over ${Math.ceil(minutes / 60)} uur weer` : `over ${minutes} min. weer`
}

export function PetGadget({ gadget, username, isOwner }: { gadget: Of<'huisdier'>; username: string; isOwner: boolean }) {
  const { pet, config } = gadget
  const name = config.name || PET_SPECIES[config.species]
  const put = usePutGadget(username)
  const [reaction, setReaction] = useState<PetAction | null>(null)
  const [shop, setShop] = useState(false)
  const background = config.background ?? 'kamer'
  const hat = config.hat ?? 'geen'
  const care = useMutation({
    mutationFn: (action: PetAction) => api<Gadget>(`/gadgets/${gadget.id}/huisdier`, { method: 'POST', body: { action } }),
    onSuccess: (g, action) => {
      put(g)
      setReaction(action)
      if (action === 'voeren') playPickUp(4)
      else if (action === 'aaien') playGood()
      else playBallClick(0.6)
    },
  })
  useEffect(() => {
    if (!reaction) return
    const t = window.setTimeout(() => setReaction(null), 1800)
    return () => clearTimeout(t)
  }, [reaction])

  return (
    <div className={pet.sleeping ? 'pet-gadget night' : 'pet-gadget'}>
      <div className={`pet-scene bg-${background}`}>
        <span className="pet-coins" title={`${name} verdient munten als iemand voor hem zorgt`}>
          <FarmIcon name="coins" /> {pet.coins}
        </span>
        {reaction && <span className="pet-earned">+{isOwner ? PET_COINS.owner : PET_COINS.visitor}</span>}
        <PetArt species={config.species} color={config.color} mood={reaction ? 'blij' : petMood(pet)} stage={pet.stage} reaction={reaction} hat={hat} />
        <div className="pet-tag">
          <b>{name}</b>
          <span>
            {STAGE_NAMES[pet.stage]} · {pet.ageDays === 0 ? 'vandaag geboren' : `${pet.ageDays} ${pet.ageDays === 1 ? 'dag' : 'dagen'} oud`}
          </span>
        </div>
      </div>
      <p className="pet-line" role="status">
        {reaction === 'voeren' ? 'Mmm, lekker!' : reaction === 'aaien' ? 'Prrr… ♥' : reaction === 'spelen' ? 'Joehoe, nog een keer!' : petLine(name, pet)}
      </p>
      <ul className="pet-needs">
        {(Object.keys(PET_ACTIONS) as PetAction[]).map((a) => (
          <li key={a}>
            <FarmIcon name={PET_ICONS[a]} />
            <span>{NEED_NAMES[a]}</span>
            <span className={`pet-bar ${pet.needs[a] < 30 ? 'low' : pet.needs[a] < 60 ? 'mid' : ''}`} role="meter" aria-valuenow={pet.needs[a]} aria-valuemin={0} aria-valuemax={100} aria-label={NEED_NAMES[a]}>
              <span style={{ width: `${pet.needs[a]}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <div className="pet-actions">
        {(Object.keys(PET_ACTIONS) as PetAction[]).map((a) => {
          const wait = pet.nextAt[a]
          return (
            <Button key={a} disabled={pet.sleeping || !!wait || care.isPending} title={pet.sleeping ? `${name} slaapt` : wait ? `Je kunt ${waitText(wait)}` : undefined} onClick={() => care.mutate(a)}>
              <FarmIcon name={PET_ICONS[a]} /> {PET_ACTIONS[a]}
            </Button>
          )
        })}
      </div>
      {care.isError && <p className="form-error">{errorMessage(care.error)}</p>}
      {isOwner && (
        <div className="pet-shop-open">
          <Button onClick={() => setShop(true)}>
            <FarmIcon name="cart" /> Winkel
          </Button>
        </div>
      )}
      {shop && <PetShop gadget={gadget} username={username} onClose={() => setShop(false)} />}
      {pet.carers.length > 0 ? (
        <div className="pet-carers">
          <span className="muted">Laatst verzorgd door</span>
          <ul>
            {pet.carers.map((c) => (
              <li key={`${c.user.id}-${c.action}`} title={`${c.user.nickname}: ${PET_ACTIONS[c.action].toLowerCase()}, ${formatTime(c.at)}`}>
                <Link to={`/profiel/${c.user.username}`}>
                  <Avatar user={c.user} size="tiny" static />
                  <FarmIcon name={PET_ICONS[c.action]} className="pet-carer-icon" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted pet-hint">{isOwner ? `Vraag je vrienden om ${name} te verzorgen!` : `Nog niemand heeft voor ${name} gezorgd. Jij als eerste?`}</p>
      )}
    </div>
  )
}

/** The owner's pet shop: backgrounds and hats, paid with the coins the pet earned. */
function PetShop({ gadget, username, onClose }: { gadget: Of<'huisdier'>; username: string; onClose: () => void }) {
  const { pet, config } = gadget
  const put = usePutGadget(username)
  const [tab, setTab] = useState<'background' | 'hat'>('hat')
  const buy = useMutation({
    mutationFn: (body: { item: string; buy: boolean }) => api<Gadget>(`/gadgets/${gadget.id}/huisdier/winkel`, { method: 'POST', body }),
    onSuccess: (g, body) => {
      put(g)
      if (body.buy) playGood()
    },
  })
  const items = tab === 'hat' ? (Object.keys(PET_HATS) as PetHat[]) : (Object.keys(PET_BACKGROUNDS) as PetBackground[])
  const info = (item: string) => (tab === 'hat' ? PET_HATS[item as PetHat] : PET_BACKGROUNDS[item as PetBackground])
  const current = tab === 'hat' ? (config.hat ?? 'geen') : (config.background ?? 'kamer')
  const name = config.name || PET_SPECIES[config.species]
  return (
    <Modal title={`Winkel van ${name}`} icon="cart" onClose={onClose} wide>
      <div className="pet-shop">
        <p className="pet-shop-coins">
          <FarmIcon name="coins" size={24} /> <b>{pet.coins}</b> {pet.coins === 1 ? 'munt' : 'munten'}
          <span className="muted">
            Elke keer dat iemand {name} eten geeft, aait of ermee speelt, krijg je er {PET_COINS.visitor} (van jezelf {PET_COINS.owner}).
          </span>
        </p>
        <div className="pet-shop-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'hat'} className={tab === 'hat' ? 'current' : undefined} onClick={() => setTab('hat')}>
            Hoedjes
          </button>
          <button type="button" role="tab" aria-selected={tab === 'background'} className={tab === 'background' ? 'current' : undefined} onClick={() => setTab('background')}>
            Achtergronden
          </button>
        </div>
        <ul className="pet-shop-items">
          {items.map((item) => {
            const { name: label, price } = info(item)
            const owned = price === 0 || pet.unlocked.includes(item)
            const using = current === item
            return (
              <li key={item} className={using ? 'using' : undefined}>
                <div className={`pet-scene pet-shop-preview bg-${tab === 'background' ? item : (config.background ?? 'kamer')}`}>
                  <PetArt species={config.species} color={config.color} mood="blij" stage={pet.stage} hat={tab === 'hat' ? (item as PetHat) : (config.hat ?? 'geen')} size={90} />
                </div>
                <b>{label}</b>
                {using ? (
                  <span className="pet-shop-using">
                    <FarmIcon name="accept" /> In gebruik
                  </span>
                ) : owned ? (
                  <Button disabled={buy.isPending} onClick={() => buy.mutate({ item, buy: false })}>
                    Gebruiken
                  </Button>
                ) : (
                  <Button variant="cta" disabled={buy.isPending || pet.coins < price} title={pet.coins < price ? `Nog ${price - pet.coins} munten nodig` : undefined} onClick={() => buy.mutate({ item, buy: true })}>
                    <FarmIcon name="coins" /> {price}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {buy.isError && <p className="form-error">{errorMessage(buy.error)}</p>}
      </div>
    </Modal>
  )
}

export function ForumGadget({ gadget, username, isOwner }: { gadget: Of<'forum'>; username: string; isOwner: boolean }) {
  const { forum, config } = gadget
  return (
    <div className="fg-gadget">
      {config.showStats && (
        <div className="fg-head">
          {forum.title && <span className="fg-rank">{forum.title}</span>}
          <div className="gh-stats">
            <div>
              <b>{forum.posts}</b>
              <span>berichten</span>
            </div>
            <div>
              <b>{forum.threads}</b>
              <span>onderwerpen</span>
            </div>
            <div>
              <b>{forum.reactions}</b>
              <span>reacties</span>
            </div>
          </div>
        </div>
      )}
      {forum.items.length === 0 ? (
        <p className="empty">
          {config.show === 'onderwerpen' ? 'Nog geen onderwerpen gestart.' : 'Nog geen forumberichten.'}
          {isOwner && (
            <>
              {' '}
              <Link to="/forum">Naar het forum</Link>
            </>
          )}
        </p>
      ) : (
        <ul className="fg-list">
          {forum.items.map((item) => (
            <li key={item.postId ?? `t${item.threadId}`}>
              <Link to={`${threadHref(item.section, item.threadId, item.title)}${item.postId ? `?bericht=${item.postId}` : ''}`} className="fg-item">
                <span className="fg-title">
                  <FarmIcon name={item.postId ? 'comment' : 'comments'} /> {item.title}
                </span>
                {item.excerpt && <span className="fg-bubble">{item.excerpt}</span>}
                <span className="fg-meta muted">
                  {item.sectionName} · {formatTime(item.at)} · {item.replies === 1 ? '1 reactie' : `${item.replies} reacties`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/forum/lid/${username}`} className="gadget-note muted">
        Forumprofiel »
      </Link>
    </div>
  )
}

/** Tilt, tape colour and a bit of shift per sticker, the same every time. */
const stickerStyle = (id: number, i: number) => ({ '--tilt': `${((id * 37 + i * 11) % 15) - 7}deg`, '--tape': ['#f7c5d5', '#bde3f5', '#fbe7a1', '#c9ecc0', '#e0cdf5'][id % 5] }) as CSSProperties

const PER_PAGE = 6

export function ScrapbookGadget({ gadget, username, isOwner }: { gadget: Of<'plakboek'>; username: string; isOwner: boolean }) {
  const { items, total } = gadget.glitters
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const [page, setPage] = useState(0)
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null)
  const [open, setOpen] = useState<Glitter | null>(null)
  const current = Math.min(page, pages - 1)
  const go = (to: number) => {
    setTurn(to > current ? 'next' : 'prev')
    setPage(to)
  }

  if (!items.length) {
    return (
      <p className="empty">
        Het plakboek is nog leeg.
        {isOwner && (
          <>
            {' '}
            Verzamel plaatjes bij <Link to="/glitterplaatjes">Glitterplaatjes</Link>!
          </>
        )}
      </p>
    )
  }
  return (
    <div className={`sb-gadget paper-${gadget.config.paper}`}>
      <div className="sb-book">
        <div className="sb-rings" aria-hidden="true" />
        <ul key={current} className={turn ? `sb-page turn-${turn}` : 'sb-page'} onAnimationEnd={() => setTurn(null)}>
          {items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE).map((g, i) => (
            <li key={g.id} style={stickerStyle(g.id, i)}>
              <button type="button" className="sb-sticker" onClick={() => setOpen(g)} title={g.title}>
                <img src={g.url} alt={g.title} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
        <span className="sb-pagenr">blz. {current + 1}</span>
      </div>
      {pages > 1 && (
        <div className="sb-nav">
          <button type="button" className="icon-button" disabled={current === 0} onClick={() => go(current - 1)} aria-label="Vorige bladzijde">
            <FarmIcon name="arrow_left" />
          </button>
          <span className="muted">
            {current + 1} van {pages}
          </span>
          <button type="button" className="icon-button" disabled={current === pages - 1} onClick={() => go(current + 1)} aria-label="Volgende bladzijde">
            <FarmIcon name="arrow_right" />
          </button>
        </div>
      )}
      <Link to="/glitterplaatjes" className="gadget-note muted">
        {total} {total === 1 ? 'plaatje' : 'plaatjes'} · Alle glitterplaatjes »
      </Link>
      {open && <GlitterWindow glitter={open} username={username} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** One sticker, big, to collect for yourself. */
function GlitterWindow({ glitter, username, onClose }: { glitter: Glitter; username: string; onClose: () => void }) {
  const collect = useCollect()
  const queryClient = useQueryClient()
  const [collected, setCollected] = useState(glitter.collected)
  return (
    <Modal title={glitter.title} icon="images" onClose={onClose}>
      <div className="sb-window">
        <img src={glitter.url} alt={glitter.title} width={glitter.width} height={glitter.height} />
        <p className="muted">
          Geplaatst door <Link to={`/profiel/${glitter.user.username}`}>{glitter.user.nickname}</Link>
        </p>
        <Button
          variant={collected ? 'default' : 'cta'}
          disabled={collect.isPending}
          onClick={() =>
            collect.mutate(
              { id: glitter.id, collect: !collected },
              {
                onSuccess: () => {
                  setCollected(!collected)
                  queryClient.invalidateQueries({ queryKey: keys.gadgets(username) })
                },
              },
            )
          }
        >
          <FarmIcon name={collected ? 'accept' : 'heart'} /> {collected ? 'In je verzameling' : 'Verzamelen'}
        </Button>
        {collect.isError && <p className="form-error">{errorMessage(collect.error)}</p>}
      </div>
    </Modal>
  )
}

const RESULT_NAMES = { winst: 'W', verlies: 'V', gelijk: 'G' } as const
const percent = (t: GameTally) => (t.played ? Math.round((t.won / t.played) * 100) : 0)

/** Won, drawn and lost as one bar. */
function TallyBar({ t }: { t: GameTally }) {
  return (
    <span className="ss-bar" title={`${t.won} gewonnen, ${t.drawn} gelijk, ${t.lost} verloren`}>
      <span className="won" style={{ flex: t.won }} />
      <span className="drawn" style={{ flex: t.drawn }} />
      <span className="lost" style={{ flex: t.lost }} />
    </span>
  )
}

export function ScoresGadget({ gadget, isOwner }: { gadget: Of<'spelscores'>; isOwner: boolean }) {
  const { total, kinds, recent, rival } = gadget.scores
  if (!total.played) {
    return (
      <p className="empty">
        Nog geen potjes gespeeld.
        {isOwner && (
          <>
            {' '}
            <Link to="/spellen">Daag een vriend uit!</Link>
          </>
        )}
      </p>
    )
  }
  const pct = percent(total)
  return (
    <div className={`ss-gadget style-${gadget.config.style}`}>
      <div className="ss-board">
        <div className="ss-big">
          <div className="won">
            <b>{total.won}</b>
            <span>gewonnen</span>
          </div>
          <div className="drawn">
            <b>{total.drawn}</b>
            <span>gelijk</span>
          </div>
          <div className="lost">
            <b>{total.lost}</b>
            <span>verloren</span>
          </div>
        </div>
        <div className="ss-ring" style={{ '--pct': pct } as CSSProperties} title={`${pct}% gewonnen`}>
          <b>{pct}%</b>
          <span>winst</span>
        </div>
      </div>
      <p className="ss-streak">
        {total.streak > 1 ? (
          <>
            <FarmIcon name="fire" /> <b>{total.streak} op rij</b> gewonnen!
          </>
        ) : (
          <>{total.played} potjes</>
        )}
        {total.bestStreak > 1 && <span className="muted"> · record {total.bestStreak} op rij</span>}
      </p>
      <table className="ss-table">
        <tbody>
          {kinds.map((k) => (
            <tr key={k.kind}>
              <th scope="row">
                <FarmIcon name={GAMES[k.kind].icon as FarmIconName} /> {GAMES[k.kind].name}
              </th>
              <td className="ss-wdl">
                {k.won}–{k.drawn}–{k.lost}
              </td>
              <td className="ss-barcell">
                <TallyBar t={k} />
              </td>
              <td className="ss-pct">{percent(k)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {recent.length > 0 && (
        <>
          <h4 className="ss-sub">Laatste potjes</h4>
          <ul className="ss-recent">
            {recent.map((r) => (
              <li key={r.id}>
                <span className={`ss-result ${r.result}`} title={r.result}>
                  {RESULT_NAMES[r.result]}
                </span>
                <FarmIcon name={GAMES[r.kind].icon as FarmIconName} label={GAMES[r.kind].name} />
                <span className="ss-vs">
                  tegen{' '}
                  {r.opponents.length
                    ? r.opponents.map((o, i) => (
                        <span key={o.id}>
                          {i > 0 && ', '}
                          <Link to={`/profiel/${o.username}`}>{o.nickname}</Link>
                        </span>
                      ))
                    : 'een oud-lid'}
                </span>
                <span className="muted">{formatTime(r.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {rival && (
        <div className="ss-rival">
          <Avatar user={rival.user} size="tiny" static />
          <span>
            <span className="muted">Grootste rivaal</span>
            <Link to={`/profiel/${rival.user.username}`}>{rival.user.nickname}</Link>
          </span>
          <b title="gewonnen–gelijk–verloren">
            {rival.won}–{rival.drawn}–{rival.lost}
          </b>
        </div>
      )}
    </div>
  )
}
