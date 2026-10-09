/** Editors for Virtueel huisdier, Forumberichten, Glitterplakboek and Spelscores. */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { LIMITS, PET_COLORS, PET_SPECIES, SCRAPBOOK_PAPERS, type GadgetConfig, type PetSpecies, type ScrapbookPaper } from '../../../shared/gadgets'
import { GAMES, type GameKind } from '../../../shared/games'
import type { Glitter, GlitterList } from '../../../shared/glitters'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api } from '../../lib/api'
import { PetArt } from './PetArt'
import './FunGadgets.css'

type Editor<T extends keyof GadgetConfig> = { value: GadgetConfig[T]; onChange: (next: GadgetConfig[T]) => void }

export function PetEditor({ value, onChange }: Editor<'huisdier'>) {
  return (
    <div className="gadget-rows">
      <div className="field">
        <span>Welk dier?</span>
        <div className="pet-pick" role="radiogroup" aria-label="Welk dier">
          {(Object.keys(PET_SPECIES) as PetSpecies[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={value.species === s} className={value.species === s ? 'on' : undefined} onClick={() => onChange({ ...value, species: s })}>
              <PetArt species={s} color={value.color} mood="blij" size={70} />
              <span>{PET_SPECIES[s]}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Naam</span>
        <input className="text-box" value={value.name} maxLength={LIMITS.petName} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Pluisje" />
      </label>
      <div className="field">
        <span>Kleur</span>
        <div className="pet-colors" role="radiogroup" aria-label="Kleur">
          {PET_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={value.color === c} aria-label={c} className={value.color === c ? 'on' : undefined} style={{ background: c }} onClick={() => onChange({ ...value, color: c })} />
          ))}
        </div>
      </div>
      <p className="muted">
        Iedereen die je profiel bekijkt kan je huisdier eten geven, aaien en ermee spelen (ieder om de 3 uur). Hoe meer zorg, hoe groter het wordt. Tussen 23 en 7 uur slaapt het.
      </p>
    </div>
  )
}

export function ForumEditor({ value, onChange }: Editor<'forum'>) {
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>Wat laat je zien?</span>
        <select className="text-box" value={value.show} onChange={(e) => onChange({ ...value, show: e.target.value as GadgetConfig['forum']['show'] })}>
          <option value="berichten">Mijn nieuwste berichten</option>
          <option value="onderwerpen">Onderwerpen die ik startte</option>
        </select>
      </label>
      <label className="field">
        <span>Hoeveel?</span>
        <input className="text-box" type="number" min={1} max={LIMITS.forumItems} value={value.count} onChange={(e) => onChange({ ...value, count: Math.max(1, Math.min(LIMITS.forumItems, Math.round(Number(e.target.value) || 1))) })} />
      </label>
      <label className="gadget-toggle">
        <input type="checkbox" checked={value.showStats} onChange={(e) => onChange({ ...value, showStats: e.target.checked })} /> Toon mijn forumtitel en tellers
      </label>
    </div>
  )
}

/** Your uploads and your collection, to pick from. */
function useOwnGlitters(enabled: boolean) {
  const load = (filter: string) => api<GlitterList>(`/glitters?filter=${filter}&limit=48`)
  return useQuery({
    queryKey: ['glitters', 'plakboek-kiezen'],
    enabled,
    queryFn: async () => {
      const [mine, collected] = await Promise.all([load('mijn'), load('verzameling')])
      const all: Glitter[] = [...collected.items, ...mine.items]
      return all.filter((g, i) => all.findIndex((x) => x.id === g.id) === i)
    },
  })
}

export function ScrapbookEditor({ value, onChange }: Editor<'plakboek'>) {
  const picking = value.source === 'gekozen'
  const { data: own = [], isLoading } = useOwnGlitters(picking)
  const toggle = (id: number) =>
    onChange({ ...value, picked: value.picked.includes(id) ? value.picked.filter((x) => x !== id) : value.picked.length < LIMITS.scrapbook ? [...value.picked, id] : value.picked })
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>Welke plaatjes?</span>
        <select className="text-box" value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value as GadgetConfig['plakboek']['source'] })}>
          <option value="verzameling">Mijn verzameling (nieuwste eerst)</option>
          <option value="uploads">Plaatjes die ik zelf plaatste</option>
          <option value="gekozen">Zelf kiezen</option>
        </select>
      </label>
      {picking && (
        <div className="field">
          <span>
            Kies je plaatjes <span className="hint">({value.picked.length} van max. {LIMITS.scrapbook}, in deze volgorde)</span>
          </span>
          {isLoading ? (
            <p className="muted">Laden…</p>
          ) : own.length ? (
            <ul className="sb-pick">
              {own.map((g) => {
                const n = value.picked.indexOf(g.id)
                return (
                  <li key={g.id}>
                    <button type="button" className={n >= 0 ? 'on' : undefined} aria-pressed={n >= 0} title={g.title} onClick={() => toggle(g.id)}>
                      <img src={g.url} alt={g.title} loading="lazy" />
                      {n >= 0 && <b>{n + 1}</b>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted">
              Je hebt nog geen plaatjes. Verzamel ze bij <Link to="/glitterplaatjes">Glitterplaatjes</Link>.
            </p>
          )}
        </div>
      )}
      <div className="field">
        <span>Papier</span>
        <div className="sb-papers" role="radiogroup" aria-label="Papier">
          {(Object.keys(SCRAPBOOK_PAPERS) as ScrapbookPaper[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={value.paper === p} className={`paper-${p}${value.paper === p ? ' on' : ''}`} onClick={() => onChange({ ...value, paper: p })}>
              <span>{SCRAPBOOK_PAPERS[p]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Games with a winner; the Graffitimuur has none. */
const SCORED = (Object.keys(GAMES) as GameKind[]).filter((k) => k !== 'spray')

export function ScoresEditor({ value, onChange }: Editor<'spelscores'>) {
  const toggle = (k: GameKind) => onChange({ ...value, kinds: value.kinds.includes(k) ? value.kinds.filter((x) => x !== k) : [...value.kinds, k] })
  return (
    <div className="gadget-rows">
      <div className="field">
        <span>
          Welke spellen? <span className="hint">(niets aangevinkt: alles wat je speelde)</span>
        </span>
        <div className="ss-kinds">
          {SCORED.map((k) => (
            <label key={k} className="gadget-toggle">
              <input type="checkbox" checked={value.kinds.includes(k)} onChange={() => toggle(k)} /> <FarmIcon name={GAMES[k].icon as FarmIconName} /> {GAMES[k].name}
            </label>
          ))}
        </div>
      </div>
      <label className="gadget-toggle">
        <input type="checkbox" checked={value.recent} onChange={(e) => onChange({ ...value, recent: e.target.checked })} /> Toon mijn laatste vijf potjes
      </label>
      <label className="field">
        <span>Uiterlijk</span>
        <select className="text-box" value={value.style} onChange={(e) => onChange({ ...value, style: e.target.value as GadgetConfig['spelscores']['style'] })}>
          <option value="scorebord">Scorebord</option>
          <option value="simpel">Simpel</option>
        </select>
      </label>
    </div>
  )
}
