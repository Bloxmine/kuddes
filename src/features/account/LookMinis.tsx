/**
 * Small pictures of a look, for cards and pickers: a site theme (ThemeMini)
 * and a profile or Kudde design (DesignMini). Used by Mijn thema's, Mijn
 * designs and the Designgalerij.
 */
import type { CSSProperties } from 'react'
import { NAME_FONTS, mix, patternCss, type CustomTheme, type ProfileColors } from '../../../shared/customization'
import { themeColors } from './savedThemes'
import './ThemeStudio.css'

/** A small picture of the site in a theme: top bar, page, a box with a link and a button. */
export function ThemeMini({ theme, big }: { theme: CustomTheme; big?: boolean }) {
  const c = themeColors(theme)
  const page: CSSProperties = {
    background:
      theme.pattern && theme.pattern !== 'effen' ? patternCss(theme.pattern, theme.background, theme.patternColor ?? mix(theme.brand, theme.background, 0.3), 0.35) : theme.background,
  }
  if (theme.image) Object.assign(page, { backgroundImage: `url("${theme.image.url}")`, backgroundSize: 'cover', backgroundPosition: 'center' })
  const bar: CSSProperties = {
    background:
      theme.barPattern && theme.barPattern !== 'effen'
        ? patternCss(theme.barPattern, theme.brand, theme.barPatternColor ?? mix(theme.brand, '#ffffff', 0.55), 0.3)
        : `linear-gradient(to bottom, ${mix(theme.brand, '#ffffff', 0.75)}, ${theme.brand})`,
  }
  const boxAlpha = theme.boxOpacity ?? 1
  return (
    <span className={big ? 'theme-mini big' : 'theme-mini'} style={page} aria-hidden="true">
      <span className="theme-mini-bar" style={bar}>
        <i />
        <i />
        <i />
      </span>
      <span className="theme-mini-box" style={{ background: `color-mix(in srgb, ${c.surface} ${Math.round(boxAlpha * 100)}%, transparent)`, borderColor: c.border }}>
        <span className="theme-mini-hdr" style={{ background: c.boxHeader, color: c.title }}>
          {big ? 'Een box' : ''}
        </span>
        <span className="theme-mini-text" style={{ color: c.text }}>
          {big ? (
            <>
              Gewone tekst met <u style={{ color: theme.link }}>een link</u>.
            </>
          ) : (
            <>
              <b style={{ background: c.text }} />
              <b style={{ background: theme.link }} />
            </>
          )}
        </span>
        <span className="theme-mini-btn" style={{ background: `linear-gradient(to bottom, ${c.ctaTop}, ${theme.button})` }}>
          {big ? 'Knop' : ''}
        </span>
      </span>
    </span>
  )
}

/** A small picture of a profile in a design: the background, the title bar with a name, and a box. */
export function DesignMini({ design, name = 'Naam' }: { design: ProfileColors; name?: string }) {
  const header = design.header
  const page: CSSProperties = { background: patternCss(design.pattern, design.background, design.background2, 0.35) }
  if (design.image) Object.assign(page, { backgroundImage: `url("${design.image.url}")`, backgroundSize: 'cover', backgroundPosition: 'center' })
  const bar: CSSProperties =
    header && header.pattern !== 'standaard'
      ? { background: patternCss(header.pattern, header.color, header.color2, 0.3) }
      : { background: `linear-gradient(to bottom, #ffffff, ${design.box})` }
  const surface = design.surface ?? '#ffffff'
  return (
    <span className="theme-mini design-mini" style={page} aria-hidden="true">
      <span className="design-mini-bar" style={bar}>
        <b
          style={{
            color: header?.nameColor ?? design.title,
            fontFamily: header ? NAME_FONTS[header.font]?.css : undefined,
            textShadow: header && header.shadow !== 'geen' ? '0 1px 2px rgba(0,0,0,0.5)' : undefined,
            background: header?.backdrop ? 'rgba(255,255,255,0.6)' : undefined,
          }}
        >
          {name}
        </b>
      </span>
      <span className="theme-mini-box" style={{ background: `color-mix(in srgb, ${surface} ${Math.round((design.boxOpacity ?? 1) * 100)}%, transparent)`, borderColor: design.box }}>
        <span className="theme-mini-hdr" style={{ background: design.box, color: design.title }} />
        <span className="theme-mini-text">
          <b style={{ background: design.text ?? '#1b2733' }} />
          <b style={{ background: design.link }} />
        </span>
      </span>
    </span>
  )
}
