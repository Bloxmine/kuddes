import { useState } from 'react'
import { TEXTURES, TEXTURE_CATEGORIES, isTexturePattern, textureOf, textureUrl, type TextureCategory, type TexturePattern } from '../../../shared/textures'
import { FarmIcon } from '../../components/ui/FarmIcon'
import './TextureDrawer.css'

const CATEGORIES = Object.keys(TEXTURE_CATEGORIES) as TextureCategory[]
const TOTAL = CATEGORIES.reduce((n, c) => n + TEXTURES[c].length, 0)

/**
 * The photo textures (bricks, marble, wood…) as a bar that folds open, under
 * the patterns, so they don't crowd the editor. Open by itself when one is in use.
 */
export function TextureDrawer({
  value,
  onChange,
  onClear,
  label = 'Texturen',
}: {
  value: string | null | undefined
  onChange: (p: TexturePattern) => void
  /** Offers "Geen textuur" (for boxes; a pattern grid has its own "Effen"). */
  onClear?: () => void
  label?: string
}) {
  const current = value && isTexturePattern(value) ? textureOf(value) : null
  const [open, setOpen] = useState(!!current)
  const [category, setCategory] = useState<TextureCategory>(current?.category ?? 'bricks')
  return (
    <div className={open ? 'texture-drawer open' : 'texture-drawer'}>
      <button type="button" className="texture-drawer-bar" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <FarmIcon name="picture_frame" />
        <span>
          <b>{label}</b> <span className="muted">baksteen, marmer, hout, metaal… ({TOTAL})</span>
        </span>
        {current && <span className="texture-drawer-current">{current.name}</span>}
        <FarmIcon name={open ? 'arrow_up' : 'arrow_down'} />
      </button>
      {open && (
        <div className="texture-drawer-body">
          <div className="texture-tabs" role="tablist" aria-label="Soort textuur">
            {onClear && (
              <button type="button" className={current ? 'layout-chip' : 'layout-chip current'} onClick={onClear}>
                Geen textuur
              </button>
            )}
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={category === c} className={category === c ? 'layout-chip current' : 'layout-chip'} onClick={() => setCategory(c)}>
                {TEXTURE_CATEGORIES[c]} <span className="muted">{TEXTURES[c].length}</span>
              </button>
            ))}
          </div>
          <div className="texture-grid" role="radiogroup" aria-label={TEXTURE_CATEGORIES[category]}>
            {TEXTURES[category].map(([key, name]) => {
              const pattern = `tx_${category}_${key}` as TexturePattern
              return (
                <button key={key} type="button" role="radio" aria-checked={value === pattern} title={name} className={value === pattern ? 'texture-option current' : 'texture-option'} onClick={() => onChange(pattern)}>
                  <img src={textureUrl(category, key)} alt="" loading="lazy" width={64} height={64} />
                  <span>{name}</span>
                </button>
              )
            })}
          </div>
          <p className="muted texture-credit">Textures: tutorialsforblender3d.com, gemaakt met Genetica van Spiral Graphics.</p>
        </div>
      )}
    </div>
  )
}
