/** Editors for Mario Kart Wii, Tekstvak, Uitgelichte foto, Bezoekersteller and Citaat. */
import { Link } from 'react-router-dom'
import { NAME_FONTS, type NameFont } from '../../../shared/customization'
import { LIMITS, type GadgetConfig } from '../../../shared/gadgets'
import { MK_CHARACTERS, MK_CONTROLLERS, MK_CUPS, MK_POINTS_MAX, MK_VEHICLES, mkSprite, type MkCharacter, type MkController, type MkVehicle } from '../../../shared/mariokart'
import { hideMissingSprite } from '../../lib/hideMissing'
import { usePhotos } from '../../lib/queries'
import './ExtraGadgets.css'

const WEIGHT_NAMES = { licht: 'Lichtgewicht', middel: 'Middengewicht', zwaar: 'Zwaargewicht' } as const

type Editor<T extends keyof GadgetConfig> = { value: GadgetConfig[T]; onChange: (next: GadgetConfig[T]) => void }

// ------------------------------------------------------------------ Mario Kart Wii

export function MarioKartEditor({ value, onChange }: Editor<'mariokart'>) {
  const set = <K extends keyof GadgetConfig['mariokart']>(key: K, v: GadgetConfig['mariokart'][K]) => onChange({ ...value, [key]: v })
  const weight = MK_CHARACTERS[value.character].weight
  const rides = (Object.keys(MK_VEHICLES) as MkVehicle[]).filter((v) => MK_VEHICLES[v].weight === weight)
  const pickCharacter = (character: MkCharacter) => {
    const w = MK_CHARACTERS[character].weight
    // A different weight class needs a ride from that class
    const vehicle = MK_VEHICLES[value.vehicle].weight === w ? value.vehicle : (Object.keys(MK_VEHICLES) as MkVehicle[]).find((v) => MK_VEHICLES[v].weight === w)!
    onChange({ ...value, character, vehicle })
  }
  const points = (key: 'vr' | 'br') => (
    <input
      className="text-box"
      type="number"
      min={0}
      max={MK_POINTS_MAX}
      value={value[key] || ''}
      placeholder="5000"
      onChange={(e) => set(key, Math.max(0, Math.min(MK_POINTS_MAX, Math.round(Number(e.target.value) || 0))))}
    />
  )
  return (
    <div className="gadget-rows">
      <div className="settings-grid">
        <div className="field wide">
          <span>Coureur</span>
          {(['licht', 'middel', 'zwaar'] as const).map((w) => (
            <div key={w} className="mkw-pick-group">
              <span className="hint">{WEIGHT_NAMES[w]}</span>
              <div className="mkw-pick" role="radiogroup" aria-label={WEIGHT_NAMES[w]}>
                {(Object.keys(MK_CHARACTERS) as MkCharacter[])
                  .filter((c) => MK_CHARACTERS[c].weight === w)
                  .map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={value.character === c} aria-label={MK_CHARACTERS[c].name} title={MK_CHARACTERS[c].name} onClick={() => pickCharacter(c)}>
                      <img onError={hideMissingSprite} src={mkSprite.character(c)} alt="" width={40} height={40} loading="lazy" />
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="field wide">
          <span>
            Kart of motor <span className="hint">(past bij het gewicht van {MK_CHARACTERS[value.character].name})</span>
          </span>
          {([false, true] as const).map((bike) => (
            <div key={String(bike)} className="mkw-pick-group">
              <span className="hint">{bike ? 'Motoren' : 'Karts'}</span>
              <div className="mkw-pick vehicles" role="radiogroup" aria-label={bike ? 'Motoren' : 'Karts'}>
                {rides
                  .filter((v) => MK_VEHICLES[v].bike === bike)
                  .map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={value.vehicle === v} aria-label={MK_VEHICLES[v].name} title={MK_VEHICLES[v].name} onClick={() => set('vehicle', v)}>
                      <img onError={hideMissingSprite} src={mkSprite.vehicle(v)} alt="" loading="lazy" />
                      <span>{MK_VEHICLES[v].name}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <label className="field">
          <span>
            VR <span className="hint">(punten online, 1 tot {MK_POINTS_MAX})</span>
          </span>
          {points('vr')}
        </label>
        <label className="field">
          <span>
            BR <span className="hint">(punten voor battles)</span>
          </span>
          {points('br')}
        </label>
        <label className="field">
          <span>Favoriete baan</span>
          <select className="text-box" value={value.track} onChange={(e) => set('track', e.target.value)}>
            {Object.values(MK_CUPS).map((cup) => (
              <optgroup key={cup.name} label={cup.name}>
                {cup.tracks.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Vriendcode <span className="hint">(optioneel)</span>
          </span>
          <input
            className="text-box"
            value={value.friendCode}
            inputMode="numeric"
            placeholder="1234-5678-9012"
            maxLength={14}
            onChange={(e) => {
              // Dashes go in by themselves
              const d = e.target.value.replace(/\D/g, '').slice(0, 12)
              set('friendCode', d.replace(/(\d{4})(?=\d)/g, '$1-'))
            }}
          />
        </label>
        <label className="field">
          <span>Besturing</span>
          <select className="text-box" value={value.controller} onChange={(e) => set('controller', e.target.value as MkController)}>
            {(Object.entries(MK_CONTROLLERS) as [MkController, string][]).map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Driften</span>
          <select className="text-box" value={value.drift} onChange={(e) => set('drift', e.target.value as 'handmatig' | 'automatisch')}>
            <option value="handmatig">Handmatig</option>
            <option value="automatisch">Automatisch</option>
          </select>
        </label>
      </div>
      <label className="gadget-toggle">
        <input type="checkbox" checked={value.wiimmfi} onChange={(e) => set('wiimmfi', e.target.checked)} /> Ik race nog online via Wiimmfi
      </label>
    </div>
  )
}

// ------------------------------------------------------------------ Tekstvak

export function TextEditor({ value, onChange }: Editor<'tekst'>) {
  const set = <K extends keyof GadgetConfig['tekst']>(key: K, v: GadgetConfig['tekst'][K]) => onChange({ ...value, [key]: v })
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>
          Tekst <span className="hint">(**vet**, *schuin*, links en smileys mogen)</span>
        </span>
        <textarea className="text-box" rows={6} value={value.text} maxLength={LIMITS.text} onChange={(e) => set('text', e.target.value)} />
      </label>
      <div className="settings-grid">
        <label className="field">
          <span>Achtergrond</span>
          <input type="color" value={value.background} onChange={(e) => set('background', e.target.value)} />
        </label>
        <label className="field">
          <span>Tekstkleur</span>
          <input type="color" value={value.color} onChange={(e) => set('color', e.target.value)} />
        </label>
        <label className="field">
          <span>Letters</span>
          <select className="text-box" value={value.font} onChange={(e) => set('font', e.target.value as NameFont)}>
            {(Object.entries(NAME_FONTS) as [NameFont, { name: string }][]).map(([k, f]) => (
              <option key={k} value={k}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Uitlijnen</span>
          <select className="text-box" value={value.align} onChange={(e) => set('align', e.target.value as 'links' | 'midden')}>
            <option value="links">Links</option>
            <option value="midden">Midden</option>
          </select>
        </label>
      </div>
      <div className="tekstvak-preview" style={{ background: value.background, color: value.color, fontFamily: NAME_FONTS[value.font].css, textAlign: value.align === 'midden' ? 'center' : 'left' }}>
        {value.text.trim() ? value.text.split('\n')[0] : 'Zo ziet je tekstvak eruit'}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Uitgelichte foto

export function PhotoPickEditor({ value, onChange, username }: Editor<'foto'> & { username: string }) {
  const { data: photos = [], isLoading } = usePhotos(username)
  return (
    <div className="gadget-rows">
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : photos.length === 0 ? (
        <p className="empty">
          Je hebt nog geen foto's. <Link to={`/profiel/${username}?tab=fotos`}>Upload er een</Link> en kies hem daarna hier.
        </p>
      ) : (
        <ul className="composer-photo-grid photo-pick">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" className={p.id === value.photoId ? 'current' : undefined} title={p.caption || 'Foto'} onClick={() => onChange({ ...value, photoId: p.id })} aria-pressed={p.id === value.photoId}>
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="field">
        <span>
          Onderschrift <span className="hint">(leeg = het onderschrift van de foto)</span>
        </span>
        <input className="text-box" value={value.caption} maxLength={LIMITS.photoCaption} onChange={(e) => onChange({ ...value, caption: e.target.value })} />
      </label>
      <label className="field">
        <span>Lijstje</span>
        <select className="text-box" value={value.frame} onChange={(e) => onChange({ ...value, frame: e.target.value as GadgetConfig['foto']['frame'] })}>
          <option value="polaroid">Polaroid</option>
          <option value="lijst">Houten lijst</option>
          <option value="geen">Geen</option>
        </select>
      </label>
    </div>
  )
}

// ------------------------------------------------------------------ Bezoekersteller

export function CounterEditor({ value, onChange }: Editor<'teller'>) {
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>Tekst onder de teller</span>
        <input className="text-box" value={value.label} maxLength={LIMITS.counterLabel} onChange={(e) => onChange({ ...value, label: e.target.value })} placeholder="bezoekers" />
      </label>
      <label className="field">
        <span>Soort teller</span>
        <select className="text-box" value={value.style} onChange={(e) => onChange({ ...value, style: e.target.value as GadgetConfig['teller']['style'] })}>
          <option value="kilometer">Kilometerteller</option>
          <option value="led">Rode ledjes</option>
          <option value="klassiek">In je eigen kleuren</option>
        </select>
      </label>
      <p className="muted">De teller telt hoe vaak je profiel bekeken is.</p>
    </div>
  )
}

// ------------------------------------------------------------------ Citaat

export function QuoteEditor({ value, onChange }: Editor<'citaat'>) {
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>Citaat</span>
        <textarea className="text-box" rows={3} value={value.quote} maxLength={LIMITS.quote} onChange={(e) => onChange({ ...value, quote: e.target.value })} placeholder="Het leven is als een doos bonbons…" />
      </label>
      <label className="field">
        <span>
          Wie zei het? <span className="hint">(optioneel)</span>
        </span>
        <input className="text-box" value={value.author} maxLength={LIMITS.quoteAuthor} onChange={(e) => onChange({ ...value, author: e.target.value })} placeholder="Forrest Gump" />
      </label>
      <label className="field">
        <span>Uiterlijk</span>
        <select className="text-box" value={value.style} onChange={(e) => onChange({ ...value, style: e.target.value as GadgetConfig['citaat']['style'] })}>
          <option value="krijtbord">Krijtbord</option>
          <option value="briefje">Geel briefje</option>
          <option value="neon">Neonbord</option>
        </select>
      </label>
    </div>
  )
}
