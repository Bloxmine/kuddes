import { BACKGROUND_EFFECTS, EFFECT_AMOUNTS, effectHasColor, type BackgroundEffect, type BackgroundEffectKind, type EffectAmount } from '../../../shared/backgroundEffects'
import { BackgroundEffect as Moving } from '../../components/effects/BackgroundEffect'
import './EffectPicker.css'

const KINDS = Object.keys(BACKGROUND_EFFECTS) as BackgroundEffectKind[]

/**
 * Choose something that moves in the background (stars, snow…), with its
 * colour and how much of it. Each choice shows a small moving sample.
 */
export function EffectPicker({ value, onChange }: { value: BackgroundEffect | null | undefined; onChange: (next: BackgroundEffect | null) => void }) {
  const kind = value?.kind ?? null
  return (
    <div className="effect-picker">
      <div className="effect-grid" role="radiogroup" aria-label="Bewegende achtergrond">
        <button type="button" role="radio" aria-checked={!kind} className={!kind ? 'effect-option current' : 'effect-option'} onClick={() => onChange(null)}>
          <span className="effect-sample effect-none" aria-hidden="true" />
          <b>Geen</b>
          <small>stil</small>
        </button>
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'effect-option current' : 'effect-option'} onClick={() => onChange({ kind: k, amount: value?.amount, ...(effectHasColor(k) && value?.color && kind && effectHasColor(kind) ? { color: value.color } : null) })}>
            <span className="effect-sample" aria-hidden="true">
              <Moving effect={{ kind: k }} mini />
            </span>
            <b>{BACKGROUND_EFFECTS[k].name}</b>
            <small>{BACKGROUND_EFFECTS[k].hint}</small>
          </button>
        ))}
      </div>
      {value && (
        <div className="effect-settings">
          {effectHasColor(value.kind) && (
            <label className="color-field">
              <input type="color" value={value.color ?? BACKGROUND_EFFECTS[value.kind].color ?? '#ffffff'} onChange={(e) => onChange({ ...value, color: e.target.value })} />
              <span>
                Kleur
                <small className="muted">{(value.color ?? BACKGROUND_EFFECTS[value.kind].color ?? '').toUpperCase()}</small>
              </span>
            </label>
          )}
          <div className="effect-amount" role="radiogroup" aria-label="Hoeveel">
            <span className="muted">Hoeveel</span>
            {(Object.keys(EFFECT_AMOUNTS) as EffectAmount[]).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={(value.amount ?? 'normaal') === a} className={(value.amount ?? 'normaal') === a ? 'layout-chip current' : 'layout-chip'} onClick={() => onChange({ ...value, amount: a })}>
                {EFFECT_AMOUNTS[a]}
              </button>
            ))}
          </div>
          {effectHasColor(value.kind) && value.color && (
            <button type="button" className="link-button" onClick={() => onChange({ kind: value.kind, amount: value.amount })}>
              Standaardkleur
            </button>
          )}
          <p className="muted effect-note">
            Het beweegt achter de boxen: zet “Doorzichtige boxen” aan (bij Achtergrond) om het ook door ze heen te zien. Op een lichte achtergrond zie je witte vlokken en sterretjes slecht: kies dan een donkerder kleur. Wie “Minder beweging” aan heeft, ziet niets bewegen.
          </p>
        </div>
      )}
    </div>
  )
}
