/**
 * More for a design or theme: colours over a texture, a glow and textures for
 * the boxes, and fonts for the text. Used by the design and theme editors.
 */
import { useState } from 'react'
import { BODY_FONTS, BOX_GLOW_LIMITS, TEXTURE_OVERLAYS, type BodyFont, type BoxLook, type TextureOverlay, type TextureOverlayStyle } from '../../../shared/customization'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { TextureDrawer } from './TextureDrawer'
import './LookExtras.css'

const OVERLAY_STYLES = Object.keys(TEXTURE_OVERLAYS) as TextureOverlayStyle[]

/** Over a texture: the colours (one, a gradient, or the glossy bar look) and how see-through. */
export function OverlayControls({ value, onChange }: { value: TextureOverlay | null | undefined; onChange: (next: TextureOverlay | null) => void }) {
  const style = value?.style ?? 'geen'
  const opacity = Math.round((value?.opacity ?? 0.4) * 100)
  return (
    <div className="overlay-controls">
      <span className="pref-label">Kleur over de textuur</span>
      <div className="overlay-styles" role="radiogroup" aria-label="Kleur over de textuur">
        {OVERLAY_STYLES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={style === s} className={style === s ? 'layout-chip current' : 'layout-chip'} onClick={() => onChange(s === 'geen' ? null : { style: s, opacity: (value?.opacity ?? 0.4) })}>
            {TEXTURE_OVERLAYS[s]}
          </button>
        ))}
      </div>
      {style !== 'geen' && (
        <label className="pref-row slider-row">
          <span className="pref-label">Hoe sterk</span>
          <input type="range" min={5} max={95} step={5} value={opacity} onChange={(e) => onChange({ style, opacity: Number(e.target.value) / 100 })} />
          <span className="slider-value">{opacity}%</span>
        </label>
      )}
    </div>
  )
}

/** A glow around the boxes, and textures inside them and in their headers: folded away until opened. */
export function BoxExtras<T extends BoxLook>({ value, onChange }: { value: T; onChange: (next: T) => void }) {
  const used = !!(value.boxGlow || value.boxTexture || value.boxHeaderTexture)
  const [open, setOpen] = useState(used)
  const glow = value.boxGlow
  const fade = Math.round((value.boxTextureFade ?? 0.7) * 100)
  const hdrFade = Math.round((value.boxHeaderFade ?? 0.4) * 100)
  return (
    <div className={open ? 'box-extras open' : 'box-extras'}>
      <button type="button" className="box-extras-bar" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <FarmIcon name="wand" />
        <span>
          <b>Gloed en textuur in de boxen</b> <span className="muted">{used ? 'aan' : 'een gloed om de boxen, of een textuur erin'}</span>
        </span>
        <FarmIcon name={open ? 'arrow_up' : 'arrow_down'} />
      </button>
      {open && (
        <div className="box-extras-body">
          <label className="gadget-toggle">
            <input type="checkbox" checked={!!glow} onChange={(e) => onChange({ ...value, boxGlow: e.target.checked ? { color: '#4ba3e0', size: 10 } : null })} /> Gloed om de boxen en de titelbalk
          </label>
          {glow && (
            <div className="box-extras-row">
              <label className="color-field">
                <input type="color" value={glow.color} onChange={(e) => onChange({ ...value, boxGlow: { ...glow, color: e.target.value } })} />
                <span>
                  Kleur
                  <small className="muted">{glow.color.toUpperCase()}</small>
                </span>
              </label>
              <label className="pref-row slider-row">
                <span className="pref-label">Grootte</span>
                <input type="range" min={BOX_GLOW_LIMITS.min} max={BOX_GLOW_LIMITS.max} value={glow.size} onChange={(e) => onChange({ ...value, boxGlow: { ...glow, size: Number(e.target.value) } })} />
                <span className="slider-value">{glow.size}px</span>
              </label>
            </div>
          )}
          <TextureDrawer label="Textuur in de boxen" value={value.boxTexture} onChange={(p) => onChange({ ...value, boxTexture: p })} onClear={() => onChange({ ...value, boxTexture: null })} />
          {value.boxTexture && (
            <label className="pref-row slider-row">
              <span className="pref-label">Boxkleur eroverheen</span>
              <input type="range" min={0} max={95} step={5} value={fade} onChange={(e) => onChange({ ...value, boxTextureFade: Number(e.target.value) / 100 })} />
              <span className="slider-value">{fade}%</span>
            </label>
          )}
          <TextureDrawer label="Textuur in de kopjes" value={value.boxHeaderTexture} onChange={(p) => onChange({ ...value, boxHeaderTexture: p })} onClear={() => onChange({ ...value, boxHeaderTexture: null })} />
          {value.boxHeaderTexture && (
            <label className="pref-row slider-row">
              <span className="pref-label">Kopkleur eroverheen</span>
              <input type="range" min={0} max={95} step={5} value={hdrFade} onChange={(e) => onChange({ ...value, boxHeaderFade: Number(e.target.value) / 100 })} />
              <span className="slider-value">{hdrFade}%</span>
            </label>
          )}
          <p className="muted box-extras-note">Met meer boxkleur over de textuur blijft de tekst beter leesbaar.</p>
        </div>
      )}
    </div>
  )
}

const BODY_FONT_KEYS = Object.keys(BODY_FONTS) as BodyFont[]

/** A row of fonts for the text or the titles, each shown in itself. */
export function BodyFontPicker({ label, value, onChange }: { label: string; value: BodyFont | null | undefined; onChange: (next: BodyFont | null) => void }) {
  const current = value ?? 'standaard'
  return (
    <div className="designer-row">
      <span className="designer-label">{label}</span>
      <div className="font-picker" role="radiogroup" aria-label={label}>
        {BODY_FONT_KEYS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={current === f}
            className={current === f ? 'layout-chip current' : 'layout-chip'}
            style={BODY_FONTS[f].css ? { fontFamily: BODY_FONTS[f].css } : undefined}
            onClick={() => onChange(f === 'standaard' ? null : f)}
          >
            {BODY_FONTS[f].name}
          </button>
        ))}
      </div>
    </div>
  )
}
