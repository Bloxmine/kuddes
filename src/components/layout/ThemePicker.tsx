import { Link } from 'react-router-dom'
import { CUSTOM_THEME_KEY, type CustomTheme } from '../../../shared/customization'
import { THEMES, type ThemeKey } from '../../../shared/themes'
import { useAuth } from '../../lib/auth'
import { useSavedLayoutActions, useSavedLayouts } from '../../lib/layouts'
import { useTheme, type ThemeChoice } from '../../lib/theme'
import { sameTheme, useSavedThemes } from '../../features/account/savedThemes'
import { Dropdown } from '../ui/Dropdown'
import { FarmIcon } from '../ui/FarmIcon'
import './ThemePicker.css'

const split = (light: string, dark: string) => ({ background: `linear-gradient(135deg, ${light} 0 50%, ${dark} 50% 100%)` })

const swatch = (key: ThemeChoice, custom: CustomTheme | null) =>
  key === CUSTOM_THEME_KEY ? split(custom?.brand ?? '#ccc', custom?.button ?? '#999') : split(THEMES[key].swatch[0], THEMES[key].swatch[1])

export function ThemeOptions({ onPick }: { onPick?: () => void }) {
  const { theme, setTheme, custom } = useTheme()
  const choices: ThemeChoice[] = [...(Object.keys(THEMES) as ThemeKey[]), ...(custom ? [CUSTOM_THEME_KEY as ThemeChoice] : [])]
  return (
    <div className="theme-options" role="radiogroup" aria-label="Kleuren van Kuddes">
      {choices.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={key === theme}
          className={key === theme ? 'theme-option current' : 'theme-option'}
          onClick={() => {
            setTheme(key)
            onPick?.()
          }}
        >
          <span className="theme-swatch" style={swatch(key, custom)} aria-hidden="true" />
          {key === CUSTOM_THEME_KEY ? 'Eigen thema' : THEMES[key].name}
        </button>
      ))}
    </div>
  )
}

/** Quick switch between saved looks, in the palette menu. */
function SavedLayoutOptions({ onPick }: { onPick: () => void }) {
  const { data: layouts = [] } = useSavedLayouts()
  const { apply } = useSavedLayoutActions()
  if (layouts.length === 0) return null
  return (
    <>
      <div className="dropdown-note">Mijn indelingen</div>
      <div className="theme-options">
        {layouts.map((l) => (
          <button
            key={l.id}
            type="button"
            className="theme-option"
            disabled={apply.isPending}
            onClick={() => apply.mutate(l.id, { onSuccess: onPick })}
          >
            <FarmIcon name="layout" size={20} />
            {l.name}
          </button>
        ))}
      </div>
    </>
  )
}

/** Your own themes from Instellingen: switch with one click. */
function SavedThemeOptions({ onPick }: { onPick: () => void }) {
  const { data: themes = [] } = useSavedThemes()
  const { theme, custom, saveCustom } = useTheme()
  if (!themes.length) return null
  return (
    <>
      <div className="dropdown-note">Mijn thema’s</div>
      <div className="theme-options">
        {themes.map((t) => {
          const on = theme === CUSTOM_THEME_KEY && sameTheme(custom, t.data)
          return (
            <button key={t.id} type="button" className={on ? 'theme-option current' : 'theme-option'} onClick={() => void saveCustom(t.data).then(onPick, () => undefined)}>
              <span className="theme-swatch" style={split(t.data.brand, t.data.button)} aria-hidden="true" />
              {t.name}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** The palette button in the top bar. */
export function ThemePicker() {
  const { user } = useAuth()
  const { theme, custom } = useTheme()
  return (
    <Dropdown
      align="right"
      bubble
      buttonClassName="topbar-icon"
      title="Kleuren van Kuddes"
      label={<span className="theme-swatch theme-swatch-small" style={swatch(theme, custom)} aria-hidden="true" />}
    >
      {(close) => (
        <>
          <div className="dropdown-note">Kleuren van Kuddes</div>
          <ThemeOptions onPick={close} />
          {user && (
            <>
              <SavedThemeOptions onPick={close} />
              <SavedLayoutOptions onPick={close} />
              <Link to="/instellingen#kleuren" className="theme-more" onClick={close}>
                <FarmIcon name="color_wheel" /> Mijn thema’s maken en aanpassen…
              </Link>
            </>
          )}
        </>
      )}
    </Dropdown>
  )
}

/** The same choice as a row of buttons, for the settings page. */
export function ThemeSettingsList() {
  return <ThemeOptions />
}
