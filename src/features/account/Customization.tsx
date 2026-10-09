import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Me, SessionInfo } from '../../../shared/api'
import {
  BACKGROUND_MODES,
  CUSTOM_THEME_KEY,
  DEFAULT_HEADER,
  NAME_FONTS,
  NAME_SHADOWS,
  PROFILE_PATTERNS,
  luminance,
  patternCss,
  type HeaderDesign,
  type HeaderPattern,
  type NameFont,
  type NameShadow,
  type BackgroundImage,
  type BackgroundMode,
  type BoxLook,
  type Preferences,
  type ProfileColors,
  type ProfilePattern,
  mix as mixColors,
  textOn,
  BROWSER_NOTIFY_KINDS,
  type BrowserNotifyKind,
  type TextureOverlay,
} from '../../../shared/customization'
import { notificationsSupported, showBrowserNotification } from '../../lib/browserNotify'
import { designSkin, skinVars } from '../../../shared/skins'
import { useSiteDark } from '../../lib/useSiteDark'
import { playAchievementSound, playMentionSound, playMessengerSound, playNudgeSound } from '../../lib/siteSounds'
import { THEMES } from '../../../shared/themes'
import { EffectPicker } from './EffectPicker'
import { TextureDrawer } from './TextureDrawer'
import { BodyFontPicker, BoxExtras, OverlayControls } from './LookExtras'
import { isTexturePattern } from '../../../shared/textures'
import { BackgroundEffect } from '../../components/effects/BackgroundEffect'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useSavedLayoutActions, useSavedLayouts } from '../../lib/layouts'
import { usePreferences } from '../../lib/preferences'
import { keys } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import { compressImage } from '../../lib/compressImage'
import { FESTIVE_AMOUNTS, FESTIVE_MODES, activeFestivity, type FestiveMode } from '../../../shared/festive'
import type { FarmIconName } from '../../components/ui/farmIcons'

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>
        {label}
        <small className="muted">{value.toUpperCase()}</small>
      </span>
    </label>
  )
}

type Look = BoxLook & { image?: BackgroundImage | null }

/**
 * Background image (with how it covers the page) and see-through, blurred
 * boxes. Shared by the site theme and the profile design editors.
 */
export function BackgroundControls<T extends Look>({ value, onChange }: { value: T; onChange: (next: T) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.set('file', await compressImage(file, 2560))
      return api<{ url: string }>('/me/backgrounds', { method: 'POST', form })
    },
    onSuccess: ({ url }) => {
      onChange({ ...value, image: { url, mode: value.image?.mode ?? 'vullen', fixed: value.image?.fixed ?? false } })
      if (fileRef.current) fileRef.current.value = ''
    },
  })
  const image = value.image ?? null
  const setImage = (changes: Partial<BackgroundImage>) => image && onChange({ ...value, image: { ...image, ...changes } })
  const opacity = Math.round((value.boxOpacity ?? 1) * 100)
  const blur = value.boxBlur ?? 0

  return (
    <div className="bg-controls">
      <div className="pref-row">
        <span className="pref-label">Achtergrondafbeelding</span>
        <span className="bg-upload">
          {image && <span className="bg-thumb" style={{ backgroundImage: `url("${image.url}")` }} aria-hidden="true" />}
          <label className="btn">
            <FarmIcon name="picture_add" /> {image ? 'Andere afbeelding' : 'Kies een afbeelding'}
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload.mutate(file)
              }}
            />
          </label>
          {image && (
            <button type="button" className="link-button" onClick={() => onChange({ ...value, image: null })}>
              Weghalen
            </button>
          )}
        </span>
      </div>
      {upload.isPending && <p className="muted">Uploaden…</p>}
      {upload.isError && <p className="form-error">{errorMessage(upload.error)}</p>}
      {image && (
        <>
          <Choice label="Hoe" value={image.mode} options={BACKGROUND_MODES} onChange={(mode: BackgroundMode) => setImage({ mode })} />
          <Toggle
            label="Vast bij scrollen"
            hint="De afbeelding blijft staan terwijl de pagina eroverheen schuift."
            checked={image.fixed}
            onChange={(fixed) => setImage({ fixed })}
          />
        </>
      )}
      <label className="pref-row slider-row">
        <span className="pref-label">Doorzichtige boxen</span>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={opacity}
          onChange={(e) => onChange({ ...value, boxOpacity: Number(e.target.value) / 100 })}
        />
        <span className="slider-value">{opacity === 100 ? 'Dicht' : `${opacity}%`}</span>
      </label>
      <label className="pref-row slider-row">
        <span className="pref-label">Vervaging achter boxen</span>
        <input type="range" min={0} max={20} step={1} value={blur} onChange={(e) => onChange({ ...value, boxBlur: Number(e.target.value) })} />
        <span className="slider-value">{blur === 0 ? 'Uit' : `${blur}px`}</span>
      </label>
      <BoxExtras value={value} onChange={onChange} />
    </div>
  )
}

/** A warning when text would be hard to read on the chosen colours. */
function contrastWarning(fg: string, bg: string): string | null {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05) < 3 ? 'Let op: tekst is op deze kleuren misschien slecht te lezen.' : null
}

// ------------------------------------------------------- profile colours

const PATTERN_KEYS = Object.keys(PROFILE_PATTERNS) as (keyof typeof PROFILE_PATTERNS)[]

/** Buttons that show each pattern in the colours you picked, and the photo textures folded away under them. */
export function PatternPicker({
  value,
  onChange,
  a,
  b,
  withStandard,
  overlay,
  onOverlay,
}: {
  value: HeaderPattern
  onChange: (p: HeaderPattern) => void
  a: string
  b: string
  withStandard?: boolean
  /** With a texture chosen: the colours over it (OverlayControls). */
  overlay?: TextureOverlay | null
  onOverlay?: (next: TextureOverlay | null) => void
}) {
  const options: (keyof typeof PROFILE_PATTERNS | 'standaard')[] = withStandard ? ['standaard', ...PATTERN_KEYS] : PATTERN_KEYS
  return (
    <>
    <div className="pattern-grid" role="radiogroup" aria-label="Patroon">
      {options.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} className={value === p ? 'pattern-option current' : 'pattern-option'} onClick={() => onChange(p)}>
          <span
            className={p === 'standaard' ? 'pattern-swatch standard' : 'pattern-swatch'}
            style={p === 'standaard' ? undefined : { background: patternCss(p, a, b, 0.45) }}
            aria-hidden="true"
          />
          {p === 'standaard' ? 'Standaard' : PROFILE_PATTERNS[p]}
        </button>
      ))}
    </div>
    <TextureDrawer value={value} onChange={onChange} />
    {onOverlay && isTexturePattern(value) && <OverlayControls value={overlay} onChange={onOverlay} />}
    </>
  )
}

/**
 * A small copy of your profile in the design you're making: background,
 * the title bar with your name and tabs, and a few boxes. It uses the same
 * tokens and classes as the real profile, so what you see is what you get.
 */
export function ProfilePreview({ colors, user }: { colors: ProfileColors; user: Me }) {
  // What this viewer sees: dark on a dark site theme
  const skin = designSkin(colors, useSiteDark())
  return (
    <div className="profile-preview-frame">
      <div className="profile-preview profile skinned" style={{ ...(skinVars(skin) as CSSProperties), background: skin.background }} aria-hidden="true">
        {colors.effect && <BackgroundEffect effect={colors.effect} />}
        <div className="box profile-hdr">
          <div className="profile-hdr-info">
            <Avatar user={user} size="small" static />
            <div>
              <h1>
                {user.name} {user.nickname !== user.name && <small>({user.nickname})</small>}
              </h1>
              <ul className="profile-menu">
                <li className="current">
                  <button type="button" tabIndex={-1}>
                    Over
                  </button>
                </li>
                <li>
                  <button type="button" tabIndex={-1}>
                    Vrienden
                  </button>
                </li>
                <li>
                  <button type="button" tabIndex={-1}>
                    Knuffels
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="profile-preview-boxes">
          <div className="box">
            <header className="box-hdr">
              <h2 className="box-title">Profiel</h2>
            </header>
            <div className="box-con">
              <b>Woonplaats:</b> Kuddesdorp
              <br />
              <b>Muziek:</b> <a href="#design">Within Temptation</a>
            </div>
          </div>
          <div className="box">
            <header className="box-hdr">
              <h2 className="box-title">Knuffels</h2>
            </header>
            <div className="box-con">
              <a href="#design">Sanne</a>: Hoi! Leuk profiel :)
              <div className="profile-preview-btn">
                <span className="btn btn-cta">Knuffel terug</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const LIGHT_SURFACE = '#ffffff'
const DARK_SURFACE = '#1b202b'

/**
 * "Boxen & tekst": the boxes' header and border colour, what's inside them
 * (white, or light or dark in any colour) and the text, titles and links on it.
 */
function BoxColors({ colors, onChange }: { colors: ProfileColors; onChange: (next: ProfileColors) => void }) {
  const surface = colors.surface ?? LIGHT_SURFACE
  const text = colors.text ?? textOn(surface)
  const set = <K extends keyof ProfileColors>(key: K) => (value: ProfileColors[K]) => onChange({ ...colors, [key]: value })
  /** Light or dark boxes in one click: titles and links that wouldn't be readable any more are made readable. */
  const switchTo = (next: string) => {
    const dark = luminance(next) <= 0.3
    const fix = (c: string) => (contrastWarning(c, next) ? mixColors(c, dark ? '#ffffff' : '#000000', 0.45) : c)
    onChange({ ...colors, surface: next === LIGHT_SURFACE ? undefined : next, text: undefined, title: fix(colors.title), link: fix(colors.link) })
  }
  const dark = luminance(surface) <= 0.3
  const warnings = [
    contrastWarning(text, surface) && 'de tekst',
    contrastWarning(colors.title, surface) && 'de titels',
    contrastWarning(colors.link, surface) && 'de links',
  ].filter(Boolean)
  return (
    <div className="designer-section">
      <div className="segmented" role="group" aria-label="Boxen">
        <button type="button" className={!dark ? 'current' : undefined} aria-pressed={!dark} onClick={() => switchTo(LIGHT_SURFACE)}>
          <FarmIcon name="weather_sun" /> Lichte boxen
        </button>
        <button type="button" className={dark ? 'current' : undefined} aria-pressed={dark} onClick={() => switchTo(DARK_SURFACE)}>
          <FarmIcon name="weather_clouds" /> Donkere boxen
        </button>
      </div>
      <div className="color-grid">
        <ColorField label="Randen en koppen" value={colors.box} onChange={set('box')} />
        <ColorField label="Binnenkant" value={surface} onChange={(v) => onChange({ ...colors, surface: v, text: colors.text })} />
        <ColorField label="Tekst" value={text} onChange={set('text')} />
        <ColorField label="Titels" value={colors.title} onChange={set('title')} />
        <ColorField label="Links" value={colors.link} onChange={set('link')} />
      </div>
      {colors.text && (
        <button type="button" className="link-button" onClick={() => onChange({ ...colors, text: undefined })}>
          Tekstkleur automatisch (licht of donker bij de binnenkant)
        </button>
      )}
      {warnings.length > 0 && <p className="form-notice">Let op: {warnings.join(', ').replace(/, ([^,]*)$/, ' en $1')} {warnings.length === 1 ? 'is' : 'zijn'} op de binnenkant van de boxen misschien slecht te lezen.</p>}
      <p className="muted">Doorzichtige en wazige boxen stel je in bij Achtergrond, onder het plaatje.</p>
    </div>
  )
}


/**
 * The designer itself: presets, background, boxes and the title bar with its
 * font, next to a live `preview`. Profiles and Kuddes both use it; `subject`
 * picks the wording. Controlled: DesignStudio keeps the design, its undo
 * history and the saving.
 */
export function DesignEditor({
  value: colors,
  onChange,
  preview,
  subject = 'profiel',
}: {
  value: ProfileColors
  onChange: (next: ProfileColors) => void
  preview: (colors: ProfileColors) => ReactNode
  subject?: 'profiel' | 'kudde'
}) {
  const setColors = (next: ProfileColors | ((c: ProfileColors) => ProfileColors)) => onChange(typeof next === 'function' ? next(colors) : next)
  const [section, setSection] = useState<'achtergrond' | 'animatie' | 'boxen' | 'titelbalk'>('achtergrond')
  const nameWord = subject === 'kudde' ? 'De naam' : 'Je naam'
  const set = <K extends keyof ProfileColors>(key: K) => (value: ProfileColors[K]) => setColors((c) => ({ ...c, [key]: value }))
  const header = colors.header ?? DEFAULT_HEADER
  const setHeader = <K extends keyof HeaderDesign>(key: K) => (value: HeaderDesign[K]) => setColors((c) => ({ ...c, header: { ...(c.header ?? DEFAULT_HEADER), [key]: value } }))
  // Is the name readable? Checked against the title bar's first colour (or white for the standard bar)
  const nameWarning =
    !header.backdrop && contrastWarning(header.nameColor, header.pattern === 'standaard' ? '#ffffff' : header.color)
      ? `${nameWord} is op deze kleuren misschien slecht te lezen. Zet "Plaatje achter de naam" aan of kies een schaduw.`
      : null

  const siteDark = useSiteDark()

  return (
    <div className="custom-editor designer">
      {siteDark && (
        <p className="form-notice">
          Je gebruikt het donkere thema, dus het voorbeeld laat zien hoe leden met het donkere thema {subject === 'kudde' ? 'je Kudde' : 'je profiel'} zien: lichte kleuren worden
          donker. Met het lichte thema ziet iedereen je kleuren precies zoals je ze kiest (en een donker design blijft altijd donker).
        </p>
      )}
      <div className="designer-layout">
        <div className="designer-controls">
          <div className="designer-tabs" role="tablist">
            {(
              [
                ['achtergrond', 'Achtergrond', 'picture_add'],
                ['animatie', 'Animatie', 'wand'],
                ['boxen', 'Boxen & tekst', 'layout'],
                ['titelbalk', 'Titelbalk', 'font'],
              ] as const
            ).map(([key, label, icon]) => (
              <button key={key} type="button" role="tab" aria-selected={section === key} className={section === key ? 'current' : undefined} onClick={() => setSection(key)}>
                <FarmIcon name={icon} /> {label}
              </button>
            ))}
          </div>

          {section === 'achtergrond' && (
            <div className="designer-section">
              <div className="color-grid">
                <ColorField label="Achtergrond" value={colors.background} onChange={set('background')} />
                <ColorField label="Tweede kleur" value={colors.background2} onChange={set('background2')} />
              </div>
              <PatternPicker value={colors.pattern} onChange={(p) => set('pattern')(p as ProfilePattern)} a={colors.background} b={colors.background2} overlay={colors.overlay} onOverlay={(o) => set('overlay')(o)} />
              <BackgroundControls value={colors} onChange={setColors} />
            </div>
          )}

          {section === 'animatie' && (
            <div className="designer-section">
              <p className="muted">Iets dat beweegt op de achtergrond, achter je boxen. Je ziet het meteen in het voorbeeld.</p>
              <EffectPicker value={colors.effect} onChange={(effect) => set('effect')(effect)} />
            </div>
          )}

          {section === 'boxen' && (
            <>
              <BoxColors colors={colors} onChange={setColors} />
              <div className="designer-section">
                <BodyFontPicker label="Lettertype tekst" value={colors.font} onChange={(f) => set('font')(f)} />
                <BodyFontPicker label="Lettertype kopjes" value={colors.titleFont} onChange={(f) => set('titleFont')(f)} />
              </div>
            </>
          )}

          {section === 'titelbalk' && (
            <div className="designer-section">
              <p className="muted">{subject === 'kudde' ? 'Het blok bovenaan de Kudde, met de naam en de knoppen.' : 'De balk bovenaan je profiel, met je naam en de tabs.'}</p>
              <PatternPicker value={header.pattern} onChange={setHeader('pattern')} a={header.color} b={header.color2} withStandard overlay={header.overlay} onOverlay={(o) => setHeader('overlay')(o)} />
              <div className="color-grid">
                {header.pattern !== 'standaard' && (
                  <>
                    <ColorField label="Balkkleur" value={header.color} onChange={setHeader('color')} />
                    <ColorField label="Tweede kleur" value={header.color2} onChange={setHeader('color2')} />
                  </>
                )}
                <ColorField label={nameWord} value={header.nameColor} onChange={setHeader('nameColor')} />
              </div>
              <div className="designer-row">
                <span className="designer-label">Lettertype</span>
                <div className="font-picker" role="radiogroup" aria-label="Lettertype">
                  {(Object.keys(NAME_FONTS) as NameFont[]).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={header.font === f} className={header.font === f ? 'layout-chip current' : 'layout-chip'} style={{ fontFamily: NAME_FONTS[f].css }} onClick={() => setHeader('font')(f)}>
                      {NAME_FONTS[f].name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="designer-row">
                <span className="designer-label">Schaduw</span>
                <div className="font-picker" role="radiogroup" aria-label="Schaduw">
                  {(Object.keys(NAME_SHADOWS) as NameShadow[]).map((sh) => (
                    <button key={sh} type="button" role="radio" aria-checked={header.shadow === sh} className={header.shadow === sh ? 'layout-chip current' : 'layout-chip'} onClick={() => setHeader('shadow')(sh)}>
                      {NAME_SHADOWS[sh]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="gadget-toggle">
                <input type="checkbox" checked={header.backdrop} onChange={(e) => setHeader('backdrop')(e.target.checked)} /> Plaatje achter de naam (voor
                leesbaarheid)
              </label>
              {nameWarning && <p className="form-notice">{nameWarning}</p>}
              {colors.header && (
                <button type="button" className="link-button" onClick={() => set('header')(null)}>
                  Standaard titelbalk herstellen
                </button>
              )}
            </div>
          )}
        </div>
        {preview(colors)}
      </div>

    </div>
  )
}

// --------------------------------------------------------------- layouts

/** Arranging your profile and Home, and going back to the standard layout. */
export function LayoutSettings({ user }: { user: Me }) {
  const { setUser } = useAuth()
  const queryClient = useQueryClient()
  const reset = useMutation({
    mutationFn: (field: 'profileLayout' | 'homeLayout') => api<Me>('/me', { method: 'PATCH', body: { [field]: null } }),
    onSuccess: (me) => {
      setUser(me)
      queryClient.invalidateQueries({ queryKey: keys.profile(me.username) })
    },
  })

  const rows = [
    { field: 'profileLayout' as const, title: 'Je profiel', to: `/profiel/${user.username}?indeling=1`, custom: !!user.profileLayout },
    { field: 'homeLayout' as const, title: 'Home', to: '/?indeling=1', custom: !!user.homeLayout },
  ]

  return (
    <Box title="Indeling" icon="layout">
      <p id="indeling" className="settings-intro">
        Zet de boxen op je profiel en op Home waar jij ze wilt hebben, of verberg wat je niet gebruikt.
      </p>
      <ul className="layout-settings">
        {rows.map((r) => (
          <li key={r.field}>
            <FarmIcon name={r.field === 'profileLayout' ? 'user' : 'house'} size={32} />
            <div>
              <b>{r.title}</b>
              <span className="muted">{r.custom ? 'Eigen indeling' : 'Standaard indeling'}</span>
            </div>
            <Link to={r.to} className="btn">
              <FarmIcon name="layout_edit" /> Indelen
            </Link>
            {r.custom && (
              <button type="button" className="link-button" disabled={reset.isPending} onClick={() => reset.mutate(r.field)}>
                Standaard herstellen
              </button>
            )}
          </li>
        ))}
      </ul>
    </Box>
  )
}

/** "Mijn indelingen": save the current look and switch between saved ones. */
export function SavedLayoutsSettings() {
  const { data: layouts = [], isLoading } = useSavedLayouts()
  const { create, update, remove, apply } = useSavedLayoutActions()
  const [name, setName] = useState('')
  const [applied, setApplied] = useState<number | null>(null)
  const error = create.error ?? update.error ?? remove.error ?? apply.error

  return (
    <Box title="Mijn indelingen" icon="layout_content">
      <p id="indelingen" className="settings-intro">
        Bewaar je huidige design (kleuren, profieldesign en de indeling van je profiel en Home) en wissel later met één klik.
        Ook via het palet bovenaan.
      </p>
      <form
        className="saved-layout-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate(name, { onSuccess: () => setName('') })
        }}
      >
        <input
          className="text-box"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Naam, bijv. Zomer 2011"
          aria-label="Naam van de indeling"
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <FarmIcon name="diskette" /> Huidige look bewaren
        </Button>
      </form>

      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : layouts.length === 0 ? (
        <p className="empty">Je hebt nog geen indelingen bewaard.</p>
      ) : (
        <ul className="saved-layouts">
          {layouts.map((l) => {
            const t = l.data.theme
            const themeName = t === CUSTOM_THEME_KEY ? 'Eigen thema' : t && t in THEMES ? THEMES[t as keyof typeof THEMES].name : 'Kuddes'
            return (
              <li key={l.id}>
                <FarmIcon name="layout" size={32} />
                <div>
                  <b>{l.name}</b>
                  <span className="muted">
                    {themeName} · bewaard {formatTime(l.updatedAt)}
                  </span>
                </div>
                <span className="saved-layout-actions">
                  <Button
                    variant="cta"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate(l.id, { onSuccess: () => setApplied(l.id) })}
                  >
                    {applied === l.id ? 'Gebruikt!' : 'Gebruiken'}
                  </Button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Naam wijzigen"
                    aria-label={`${l.name}: naam wijzigen`}
                    onClick={() => {
                      const next = prompt('Nieuwe naam', l.name)?.trim()
                      if (next && next !== l.name) update.mutate({ id: l.id, name: next })
                    }}
                  >
                    <FarmIcon name="pencil" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Overschrijven met je huidige look"
                    aria-label={`${l.name}: overschrijven met je huidige look`}
                    onClick={() => {
                      if (confirm(`"${l.name}" vervangen door je huidige look?`)) update.mutate({ id: l.id, overwrite: true })
                    }}
                  >
                    <FarmIcon name="page_save" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Verwijderen"
                    aria-label={`${l.name} verwijderen`}
                    onClick={() => {
                      if (confirm(`"${l.name}" verwijderen?`)) remove.mutate(l.id)
                    }}
                  >
                    <FarmIcon name="bin" />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="form-error">{errorMessage(error)}</p>}
    </Box>
  )
}

// ------------------------------------------------------------ preferences

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Record<T, string>
  onChange: (v: T) => void
}) {
  return (
    <div className="pref-row">
      <span className="pref-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {(Object.keys(options) as T[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === value} className={k === value ? 'current' : undefined} onClick={() => onChange(k)}>
            {options[k]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** "Laat horen": plays a sound as an example (inside a toggle's label, so it mustn't tick the box). */
function SoundSample({ onPlay, disabled }: { onPlay: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="link-button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        onPlay()
      }}
    >
      Laat horen
    </button>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="pref-row pref-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <small className="muted">{hint}</small>}
      </span>
    </label>
  )
}

type PrefSave = ReturnType<typeof usePreferences>['save']

function PrefBox({
  title,
  id,
  icon,
  save,
  children,
}: {
  title: string
  id: string
  icon: 'font' | 'comment' | 'lock' | 'star' | 'bell' | 'sound'
  save: PrefSave
  children: ReactNode
}) {
  // "Opgeslagen" shows briefly after each change
  const { isSuccess, submittedAt, reset } = save
  useEffect(() => {
    if (!isSuccess) return
    const t = setTimeout(reset, 1500)
    return () => clearTimeout(t)
  }, [isSuccess, submittedAt, reset])

  return (
    <Box title={title} icon={icon} actions={isSuccess ? <span className="form-success">Opgeslagen</span> : undefined}>
      <div id={id} className="prefs">
        {children}
      </div>
      {save.isError && <p className="form-error">{errorMessage(save.error)}</p>}
    </Box>
  )
}

export function DisplaySettings() {
  const { prefs, setPreference, save } = usePreferences()
  const set =
    <K extends keyof Preferences>(key: K) =>
    (v: Preferences[K]) =>
      setPreference(key, v)
  return (
    <PrefBox title="Tekst en ruimte" id="weergave" icon="font" save={save}>
      <Choice label="Tekstgrootte" value={prefs.textSize} onChange={set('textSize')} options={{ klein: 'Klein', normaal: 'Normaal', groot: 'Groot', extra: 'Extra groot' }} />
      <Choice label="Tijden" value={prefs.timeFormat} onChange={set('timeFormat')} options={{ relatief: 'vandaag, 22:11', exact: '25 sep 2026, 22:11' }} />
      <Choice label="Na het inloggen naar" value={prefs.startPage} onChange={set('startPage')} options={{ home: 'Home', tijdlijn: 'Overzicht', profiel: 'Mijn profiel' }} />
      <Toggle label="Compact" hint="Minder ruimte rond de boxen, zodat er meer op je scherm past." checked={prefs.compact} onChange={set('compact')} />
      <Toggle label="Minder beweging" hint="Geen animaties en geen soepel scrollen." checked={prefs.reduceMotion} onChange={set('reduceMotion')} />
      <Toggle label="Cursors op profielen" hint="De bewegende cursor die iemand voor het eigen profiel heeft gekozen. Uit: je houdt je eigen muispijl." checked={prefs.profileCursors} onChange={set('profileCursors')} />
    </PrefBox>
  )
}

/** Sounds, and music that starts by itself. */
export function SoundSettings() {
  const { prefs, setPreference, save } = usePreferences()
  const set =
    <K extends keyof Preferences>(key: K) =>
    (v: Preferences[K]) =>
      setPreference(key, v)
  return (
    <PrefBox title="Geluid" id="geluid" icon="sound" save={save}>
      <Toggle label="Muziek op profielen vanzelf afspelen" hint="Als iemand dat voor zijn muziekspeler heeft aangezet. Uit: je drukt zelf op afspelen." checked={prefs.musicAutoplay} onChange={set('musicAutoplay')} />
      <Toggle
        label="Geluid bij meldingen"
        hint={
          <>
            Een geluidje bij een nieuw bericht, een vriendschapsverzoek, een nieuwe melding (een knuffel, iemand die je noemt), een uitnodiging om te spelen (in Messenger) en een nieuwe prestatie.{' '}
            <SoundSample onPlay={playAchievementSound} disabled={!prefs.notificationSounds} />
          </>
        }
        checked={prefs.notificationSounds}
        onChange={set('notificationSounds')}
      />
      <Toggle
        label="Geluid in de chat en Messenger"
        hint={
          <>
            In de forumchat een zachte tik bij een nieuwe regel en een duidelijker geluid als iemand je naam noemt. <SoundSample onPlay={playMentionSound} disabled={!prefs.chatSounds} />{' '}
            In Messenger een geluidje bij een nieuw bericht <SoundSample onPlay={playMessengerSound} disabled={!prefs.chatSounds} /> en een ratel bij een nudge.{' '}
            <SoundSample onPlay={playNudgeSound} disabled={!prefs.chatSounds} />
          </>
        }
        checked={prefs.chatSounds}
        onChange={set('chatSounds')}
      />
    </PrefBox>
  )
}

/** Snow, leaves, bats and Christmas lights, with matching colours. */
export function FestiveSettings() {
  const { prefs, setPreference, save } = usePreferences()
  const season = activeFestivity('automatisch')
  return (
    <PrefBox title="Feestelijk" id="feestelijk" icon="star" save={save}>
      <div className="pref-row">
        <span className="pref-label">Effecten</span>
        <div className="festive-picker" role="radiogroup" aria-label="Effecten">
          {(Object.keys(FESTIVE_MODES) as FestiveMode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={prefs.festive === m} className={prefs.festive === m ? 'festive-option current' : 'festive-option'} onClick={() => setPreference('festive', m)}>
              <FarmIcon name={FESTIVE_ICONS[m]} size={32} />
              <span>{FESTIVE_MODES[m]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="muted pref-note">
        <FarmIcon name="information" /> Winter: veel sneeuw en ijspegels. Valentijnsdag: hartjes en rozen. Lente: bloesemblaadjes en tulpen. Pasen:
        paaseieren, een paashaas en vlaggetjes. Zomer: vlinders en het strand. Herfst: vallende bladeren. Halloween: bladeren, vleermuizen en
        pompoenen. Sinterklaas: pepernoten en grachtenpandjes (in het donkere thema met Sint op de daken). Kerst: sneeuw, lampjes en kerstbomen.
        Automatisch kiest wat past bij de tijd van het jaar
        {season ? ` (nu: ${FESTIVE_MODES[season].toLowerCase()})` : ' (nu even niets)'}.
      </p>
      {prefs.festive !== 'uit' && (
        <>
          <Toggle
            label="Vallende sneeuw, bladeren, hartjes en meer"
            hint="Uit: je ziet alleen de versiering (lampjes, bomen, ijspegels…)."
            checked={prefs.festiveParticles}
            onChange={(v) => setPreference('festiveParticles', v)}
          />
          {prefs.festiveParticles && <Choice label="Hoeveel" value={prefs.festiveAmount} onChange={(v) => setPreference('festiveAmount', v)} options={FESTIVE_AMOUNTS} />}
          <Toggle
            label="Bijpassende kleuren"
            hint="Kuddes krijgt zolang de kleuren van het seizoen, zoals kerstrood, winterblauw, valentijnsroze, sinterklaasrood-en-goud of zomers turquoise (niet met een eigen thema). Met het donkere thema krijg je er een sterrenhemel bij."
            checked={prefs.festiveColors}
            onChange={(v) => setPreference('festiveColors', v)}
          />
          <Toggle
            label="Seizoensrand om profielfoto's"
            hint="Een kerstkrans, pompoenen, ijs, bladeren, bloesem, hartjes, paaseieren, pepernoten of zonnetjes om de grote profielfoto's."
            checked={prefs.festiveFrames}
            onChange={(v) => setPreference('festiveFrames', v)}
          />
          {prefs.reduceMotion && <p className="form-notice">Je hebt "Minder beweging" aan: je ziet de versiering, maar niets dat valt.</p>}
        </>
      )}
    </PrefBox>
  )
}

const FESTIVE_ICONS: Record<FestiveMode, FarmIconName> = {
  uit: 'cross',
  automatisch: 'date',
  winter: 'weather_snow',
  valentijn: 'heart',
  lente: 'flower',
  pasen: 'rabbit',
  zomer: 'weather_sun',
  herfst: 'acorn',
  halloween: 'emotion_pumpkin',
  sinterklaas: 'cookies',
  kerst: 'star',
}

export function PostingSettings() {
  const { prefs, setPreference, save } = usePreferences()
  return (
    <PrefBox title="Berichten plaatsen" id="berichten" icon="comment" save={save}>
      <Choice
        label="Nieuwe WieWatWaars zijn standaard voor"
        value={prefs.defaultVisibility}
        onChange={(v) => setPreference('defaultVisibility', v)}
        options={{ iedereen: 'Iedereen', vrienden: 'Alleen vrienden' }}
      />
      <Toggle
        label="Versturen met Ctrl+Enter"
        hint="Plaats WieWatWaars, knuffels en berichten met Ctrl+Enter (⌘+Enter op een Mac)."
        checked={prefs.sendShortcut}
        onChange={(v) => setPreference('sendShortcut', v)}
      />
    </PrefBox>
  )
}

export function PrivacySettings() {
  const { prefs, setPreference, save } = usePreferences()
  return (
    <PrefBox title="Privacy" id="privacy" icon="lock" save={save}>
      <Choice
        label="Wie mag je profiel zien?"
        value={prefs.profileFor}
        onChange={(v) => setPreference('profileFor', v)}
        options={{ iedereen: 'Alle leden', vrienden: 'Alleen vrienden' }}
      />
      <p className="muted pref-note">
        <FarmIcon name="information" /> Met “Alleen vrienden” zien anderen alleen je naam en profielfoto, met een knop om vrienden te worden. Je WieWatWaars voor iedereen
        blijven wel op de tijdlijn en bij Kuddes staan; kies daarvoor “Vrienden” bij het plaatsen.
      </p>
      <Choice
        label="Wie mag je een vriendschapsverzoek sturen?"
        value={prefs.friendRequestsFrom}
        onChange={(v) => setPreference('friendRequestsFrom', v)}
        options={{ iedereen: 'Iedereen', vriendenvanvrienden: 'Vrienden van vrienden', niemand: 'Niemand' }}
      />
      <Choice
        label="Wie mag je knuffelen?"
        value={prefs.knuffelsFrom}
        onChange={(v) => setPreference('knuffelsFrom', v)}
        options={{ iedereen: 'Iedereen', vrienden: 'Alleen vrienden' }}
      />
      <Choice
        label="Wie mag je berichten sturen?"
        value={prefs.messagesFrom}
        onChange={(v) => setPreference('messagesFrom', v)}
        options={{ iedereen: 'Iedereen', vrienden: 'Alleen vrienden', niemand: 'Niemand' }}
      />
      <p className="muted pref-note">
        <FarmIcon name="information" /> Wie jij een bericht stuurde, kan je altijd terugschrijven.
      </p>
      <Toggle label="Toon mijn leeftijd" hint="Op je profiel en bij Nieuwste leden." checked={prefs.showAge} onChange={(v) => setPreference('showAge', v)} />
      <Toggle
        label="Volgers buiten Kuddes"
        hint="Mensen op Mastodon, Pixelfed en andere servers kunnen je volgen. Ze zien dan je WieWatWaars voor iedereen (met foto’s); die voor vrienden niet. Uit: ze sturen een vriendschapsverzoek."
        checked={prefs.fediverseFollowers}
        onChange={(v) => setPreference('fediverseFollowers', v)}
      />
      <Toggle
        label="Fediverse in Overzicht"
        hint="Een tab met de openbare berichten van wie je volgt op Mastodon en andere servers buiten Kuddes."
        checked={prefs.showFediverse}
        onChange={(v) => setPreference('showFediverse', v)}
      />
      <Toggle
        label="Anoniem bezoeken"
        hint="Je komt niet in 'Laatste bezoekers' van profielen die je bekijkt."
        checked={prefs.anonymousVisits}
        onChange={(v) => setPreference('anonymousVisits', v)}
      />
      <Toggle
        label="Bellen via Messenger"
        hint="Vrienden die dit ook aan hebben, kunnen je bellen als je online bent. Jullie praten rechtstreeks met elkaar; de ander ziet daarbij je IP-adres."
        checked={prefs.allowCalls}
        onChange={(v) => setPreference('allowCalls', v)}
      />
      <Toggle
        label="Profielfoto zichtbaar zonder account"
        hint="Bezoekers die niet zijn ingelogd zien je foto, bijvoorbeeld op het forum en bij Kuddes Video. Uit: zij zien alleen je initialen."
        checked={prefs.avatarPublic}
        onChange={(v) => setPreference('avatarPublic', v)}
      />
      <Toggle
        label="Vindbaar in zoekmachines"
        hint="Je profiel mag in Google en andere zoekmachines verschijnen. Een gedeelde link toont altijd een voorbeeld."
        checked={prefs.searchEngines}
        onChange={(v) => setPreference('searchEngines', v)}
      />
    </PrefBox>
  )
}

// --------------------------------------------------------------- account

/** Where you're logged in, and logging out everywhere else. */
export function SessionSettings() {
  const queryClient = useQueryClient()
  const sessionsKey = ['me', 'sessions']
  const { data } = useQuery({ queryKey: sessionsKey, queryFn: () => api<SessionInfo>('/me/sessions') })
  const logoutOthers = useMutation({
    mutationFn: () => api<SessionInfo>('/me/sessions/logout-others', { method: 'POST' }),
    onSuccess: (info) => queryClient.setQueryData(sessionsKey, info),
  })
  const others = (data?.count ?? 1) - 1

  return (
    <Box title="Apparaten" icon="door_out">
      <div id="apparaten" className="gadget-setting">
        <div>
          <p>
            {others <= 0
              ? 'Je bent alleen op dit apparaat ingelogd.'
              : `Je bent ook nog op ${others} ${others === 1 ? 'ander apparaat' : 'andere apparaten'} ingelogd.`}
          </p>
          <p className="muted">Ben je ergens vergeten uit te loggen? Log dan overal behalve hier uit.</p>
        </div>
        <div className="gadget-setting-actions">
          <Button disabled={others <= 0 || logoutOthers.isPending} onClick={() => logoutOthers.mutate()}>
            Log overal anders uit
          </Button>
        </div>
      </div>
      {logoutOthers.isSuccess && <p className="form-success">Je bent op alle andere apparaten uitgelogd.</p>}
      {logoutOthers.isError && <p className="form-error">{errorMessage(logoutOthers.error)}</p>}
    </Box>
  )
}

export function DataExport() {
  return (
    <Box title="Je gegevens" icon="page_white_put">
      <div id="gegevens-downloaden" className="gadget-setting">
        <div>
          <p>Download alles wat je op Kuddes hebt gezet: je profiel, WieWatWaars, knuffels, berichten, Kuddes, recepten, blogs en meer, met al je foto's, video's en muziek.</p>
          <p className="muted">Een zip-bestand: je gegevens als JSON-bestand en je bestanden in een map ernaast. Met veel video's kan het even duren.</p>
        </div>
        <div className="gadget-setting-actions">
          <a className="btn" href="/api/me/export" download>
            Download mijn gegevens
          </a>
        </div>
      </div>
    </Box>
  )
}

/**
 * Pop-ups from the browser while Kuddes is in the background, per kind, and
 * the count on the tab (src/lib/browserNotify.ts, src/lib/tabBadge.ts).
 */
/** What gets a notification behind the bell at all (the browser pop-ups are below, per kind). */
export function BellSettings() {
  const { prefs, setPreference, save } = usePreferences()
  return (
    <PrefBox title="Meldingen bij de bel" id="bel" icon="bell" save={save}>
      <Toggle
        label="Reacties op je forumonderwerpen"
        hint="Iemand reageert op een onderwerp dat jij op het forum begon."
        checked={prefs.forumReplies}
        onChange={(v) => setPreference('forumReplies', v)}
      />
    </PrefBox>
  )
}

export function BrowserNotificationSettings() {
  const { prefs, setPreference, save } = usePreferences()
  const supported = notificationsSupported()
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (supported ? Notification.permission : 'unsupported'))
  const allowed = permission === 'granted'
  const ask = async () => {
    if (!supported) return
    const answer = await Notification.requestPermission()
    setPermission(answer)
    if (answer === 'granted' && !prefs.notifyBrowser) setPreference('notifyBrowser', true)
  }
  return (
    <PrefBox title="Meldingen in je browser" id="browser-meldingen" icon="bell" save={save}>
      <p className="muted pref-note">
        <FarmIcon name="information" /> Een melding van je browser als er iets nieuws is terwijl Kuddes op de achtergrond staat (een ander tabblad, of je browser is
        geminimaliseerd). Ben je op Kuddes zelf, dan zie je het aan de bel, Messenger en de geluidjes.
      </p>
      {!supported ? (
        <p className="muted">Deze browser kan geen meldingen tonen.</p>
      ) : permission === 'denied' ? (
        <p className="form-error">
          Je browser blokkeert meldingen van Kuddes. Sta ze toe via het slotje naast het adres in je browser, en laad de pagina opnieuw.
        </p>
      ) : !allowed ? (
        <div className="pref-row">
          <Button variant="cta" onClick={() => void ask()}>
            <FarmIcon name="bell" /> Meldingen in je browser toestaan
          </Button>
        </div>
      ) : (
        <>
          <Toggle label="Meldingen in je browser" hint="Hoofdschakelaar: uit is even helemaal stil." checked={prefs.notifyBrowser} onChange={(v) => setPreference('notifyBrowser', v)} />
          <fieldset className="pref-kinds" disabled={!prefs.notifyBrowser}>
            <legend className="visually-hidden">Waarvoor</legend>
            {(Object.keys(BROWSER_NOTIFY_KINDS) as BrowserNotifyKind[]).map((k) => (
              <Toggle key={k} label={BROWSER_NOTIFY_KINDS[k].label} hint={BROWSER_NOTIFY_KINDS[k].hint} checked={prefs[k]} onChange={(v) => setPreference(k, v)} />
            ))}
          </fieldset>
          <div className="pref-row">
            <Button
              onClick={() =>
                void showBrowserNotification('notifyMessages', { title: 'Testmelding van Kuddes', body: 'Zo ziet een melding eruit. Klik erop om terug te gaan.', url: '/instellingen#browser-meldingen', force: true })
              }
            >
              <FarmIcon name="bell" /> Stuur een testmelding
            </Button>
          </div>
        </>
      )}
      <Toggle label="Aantal in de titel van het tabblad" hint={'Zoals "(3) Kuddes": nieuwe berichten, verzoeken, meldingen en chats.'} checked={prefs.tabCount} onChange={(v) => setPreference('tabCount', v)} />
      <Toggle label="Rood bolletje op het icoon van het tabblad" hint="Met hetzelfde aantal." checked={prefs.tabIcon} onChange={(v) => setPreference('tabIcon', v)} />
    </PrefBox>
  )
}
