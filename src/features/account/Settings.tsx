import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useUnsavedChanges } from '../../lib/unsavedChanges'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import type { Gender, Me } from '../../../shared/api'
import { GAMER_PLATFORMS, GAMER_TAG_MAX, INTERESTS, INTEREST_MAX, type GamerPlatform, type InterestKey } from '../../../shared/profileExtras'
import { CUSTOM_SKIN_KEY } from '../../../shared/customization'
import { PROFILE_PRESETS, SKINS, customSkin } from '../../../shared/skins'
import { patternCss } from '../../../shared/customization'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys, useGadgets } from '../../lib/queries'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { ProfilePreview } from './Customization'
import { DesignStudio } from './DesignStudio'
import { ResendConfirmation } from './VerifyBanner'
import { AVATAR_FRAMES, type AvatarFrame } from '../../../shared/frames'
import { PROFILE_CURSORS, cursorUrl, type ProfileCursor as CursorKey } from '../../../shared/cursors'
import { ProfileCursor } from '../profile/ProfileCursor'
import { FramedAvatar } from '../profile/FramedAvatar'
import { DateInput } from '../../components/ui/DateInput'
import { Modal } from '../../components/ui/Modal'
import { AvatarStyler } from '../photos/AvatarStyler'
import { useUpdateMe } from './useUpdateMe'

const toList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export function AvatarSettings({ user }: { user: Me }) {
  const { setUser } = useAuth()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  // The chosen picture, while a filter and border can still be picked
  const [chosen, setChosen] = useState<File | null>(null)
  const closeStyler = () => {
    setChosen(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const done = (me: Me) => {
    setUser(me)
    closeStyler()
    queryClient.invalidateQueries({ queryKey: keys.profile(me.username) })
  }
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.set('file', file)
      return api<Me>('/me/avatar', { method: 'POST', form })
    },
    onSuccess: done,
  })
  const remove = useMutation({ mutationFn: () => api<Me>('/me/avatar', { method: 'DELETE' }), onSuccess: done })
  const frame = useUpdateMe()
  const current = frame.isPending ? (frame.variables.avatarFrame ?? null) : user.avatarFrame

  return (
    <Box title="Profielfoto" icon="camera">
      <div className="settings-avatar" id="foto">
        <FramedAvatar frame={current} seasonal={false}>
          <Avatar user={user} size="large" static />
        </FramedAvatar>
        <div className="settings-avatar-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            aria-label="Kies een nieuwe profielfoto"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                upload.reset()
                setChosen(file)
              }
            }}
          />
          <span className="muted">JPG, PNG, GIF of WebP, maximaal 8 MB. We halen locatiegegevens uit je foto.</span>
          {user.avatarUrl && (
            <button type="button" className="link-button" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Profielfoto verwijderen
            </button>
          )}
          {upload.isPending && <span className="muted">Uploaden…</span>}
          {(upload.isError || remove.isError) && <span className="form-error">{errorMessage(upload.error ?? remove.error)}</span>}
        </div>
      </div>
      {chosen && (
        <Modal title="Profielfoto opmaken" icon="camera" wide onClose={() => !upload.isPending && closeStyler()}>
          <AvatarStyler file={chosen} busy={upload.isPending} onUpload={(file) => upload.mutate(file)} onCancel={closeStyler} />
          {upload.isError && <p className="form-error">{errorMessage(upload.error)}</p>}
        </Modal>
      )}
      <h3 className="settings-subtitle">Lijstje om je foto</h3>
      <div className="frame-picker" role="radiogroup" aria-label="Lijstje om je profielfoto">
        {([null, ...Object.keys(AVATAR_FRAMES)] as (AvatarFrame | null)[]).map((key) => (
          <button
            key={key ?? 'geen'}
            type="button"
            role="radio"
            aria-checked={current === key}
            className={current === key ? 'frame-option selected' : 'frame-option'}
            disabled={frame.isPending}
            onClick={() => frame.mutate({ avatarFrame: key })}
          >
            <FramedAvatar frame={key} seasonal={false}>
              <span className="frame-sample" />
            </FramedAvatar>
            <span>{key ? AVATAR_FRAMES[key] : 'Geen'}</span>
          </button>
        ))}
      </div>
      <p className="muted settings-note">De lijstjes achteraan bewegen (draaiend, knipperend, vallend…), tenzij je “Minder beweging” aan hebt staan. Met een seizoensthema aan zie je rond de feestdagen een seizoensrand (zoals een kerstkrans), als je dat onder Feestelijk hebt aangezet.</p>
      {frame.isError && <p className="form-error">{errorMessage(frame.error)}</p>}
    </Box>
  )
}

const profileForm = (user: Me) => ({
  name: user.name,
  nickname: user.nickname,
  gender: user.gender ?? '',
  birthdate: user.birthdate ?? '',
  city: user.city ?? '',
  website: user.website ?? '',
  about: user.about ?? '',
  brands: user.brands.join(', '),
  spots: user.spots.join(', '),
  music: user.music.join(', '),
  interests: Object.fromEntries((Object.keys(INTERESTS) as InterestKey[]).map((k) => [k, user.interests[k] ?? ''])) as Record<InterestKey, string>,
  sensitiveConsent: user.sensitiveConsent,
  aboutFirst: user.preferences.aboutFirst,
})

export function ProfileSettings({ user }: { user: Me }) {
  const update = useUpdateMe()
  const [form, setForm] = useState(() => profileForm(user))
  const [saved, setSaved] = useState(() => profileForm(user))
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)


  const fields = update.error instanceof ApiRequestError ? update.error.fields : {}
  const set = (key: Exclude<keyof typeof form, 'interests' | 'sensitiveConsent' | 'aboutFirst'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const setInterest = (key: InterestKey) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, interests: { ...f.interests, [key]: e.target.value } }))

  const saveNow = () => {
    const changes = {
        name: form.name,
        nickname: form.nickname,
        gender: (form.gender || null) as Gender | null,
        birthdate: form.birthdate || null,
        city: form.city,
        website: form.website,
        about: form.about,
        brands: toList(form.brands),
        spots: toList(form.spots),
        music: toList(form.music),
        interests: form.interests,
        sensitiveConsent: form.sensitiveConsent,
        preferences: { aboutFirst: form.aboutFirst },
      }
    return update.mutateAsync(changes).then(() => setSaved({ ...form, interests: { ...form.interests } }))
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void saveNow().catch(() => undefined)
  }
  // Don't lose what you typed by closing the tab or going elsewhere
  useUnsavedChanges(dirty, { what: '“Over jou”', save: saveNow })

  return (
    <Box title="Over jou" icon="vcard">
      <form onSubmit={submit} id="gegevens">
        <div className="settings-grid">
          <Field label="Naam" error={fields.name}>
            <input className="text-box" value={form.name} onChange={set('name')} maxLength={60} required />
          </Field>
          <Field label="Roepnaam" hint="(zo zien anderen je, bijv. *~Sanne~*)" error={fields.nickname}>
            <input className="text-box" value={form.nickname} onChange={set('nickname')} maxLength={40} required />
          </Field>
          <Field label="Geslacht" error={fields.gender}>
            <select className="text-box" value={form.gender} onChange={set('gender')}>
              <option value="">Zeg ik liever niet</option>
              <option value="vrouw">Vrouw</option>
              <option value="man">Man</option>
              <option value="anders">Anders</option>
            </select>
          </Field>
          <Field label="Geboortedatum" hint="(alleen je leeftijd is zichtbaar)" error={fields.birthdate}>
            <DateInput value={form.birthdate} max={new Date().toISOString().slice(0, 10)} onChange={(v) => setForm((f) => ({ ...f, birthdate: v }))} />
          </Field>
          <Field label="Woonplaats" error={fields.city}>
            <input className="text-box" value={form.city} onChange={set('city')} maxLength={60} />
          </Field>
          <Field label="Mijn website" hint="(staat als link op je profiel)" error={fields.website}>
            <input className="text-box" inputMode="url" value={form.website} onChange={set('website')} maxLength={200} placeholder="https://" />
          </Field>
          <div className="full">
            <Field label="Wie ben ik?" error={fields.about}>
              <textarea className="text-box" rows={5} value={form.about} onChange={set('about')} maxLength={2000} />
            </Field>
            <label className="about-place">
              Op je profiel staat dit
              <select className="text-box" value={form.aboutFirst ? 'boven' : 'onder'} onChange={(e) => setForm((f) => ({ ...f, aboutFirst: e.target.value === 'boven' }))}>
                <option value="boven">bovenaan in het Profiel-blok</option>
                <option value="onder">onderaan in het Profiel-blok</option>
              </select>
            </label>
          </div>
          <div className="full">
            <Field label="Mijn merken" hint="(scheiden met komma's)" error={fields.brands}>
              <input className="text-box" value={form.brands} onChange={set('brands')} placeholder="Nike, H&M, Converse" />
            </Field>
          </div>
          <div className="full">
            <Field label="Spots" hint="(waar je graag komt)" error={fields.spots}>
              <input className="text-box" value={form.spots} onChange={set('spots')} placeholder="Efteling, Paradiso" />
            </Field>
          </div>
          <div className="full">
            <Field label="Muziek" error={fields.music}>
              <input className="text-box" value={form.music} onChange={set('music')} placeholder="Jan Smit, Within Temptation" />
            </Field>
          </div>
          <h3 className="full settings-sub">
            <FarmIcon name="heart" /> Nog meer over jou <span className="muted">(alles is optioneel; wat leeg blijft, staat niet op je profiel)</span>
          </h3>
          {(Object.keys(INTERESTS) as InterestKey[]).map((k) => (
            <Field key={k} label={INTERESTS[k].label} error={fields[`interests.${k}`]}>
              <input className="text-box" value={form.interests[k]} onChange={setInterest(k)} maxLength={INTEREST_MAX} placeholder={INTERESTS[k].placeholder} />
            </Field>
          ))}
        </div>
        {/* The AVG asks for explicit consent before special personal data (art. 9) goes on a profile */}
        <label className="sensitive-consent">
          <input type="checkbox" checked={form.sensitiveConsent} onChange={(e) => setForm((f) => ({ ...f, sensitiveConsent: e.target.checked }))} />
          <span>
            <b>Bijzondere persoonsgegevens.</b> Vul je hierboven iets in over je gezondheid, geloof, politieke voorkeur of seksuele geaardheid? Dan geef ik uitdrukkelijk
            toestemming om dat op mijn profiel aan andere leden te laten zien. Je kunt dit altijd weer uitzetten; haal die gegevens dan ook uit je profiel.{' '}
            <Link to="/privacy#welke">Meer hierover</Link>
          </span>
        </label>
        <div className="account-actions">
          <Button type="submit" disabled={update.isPending}>
            Opslaan
          </Button>
          {dirty ? (
            <span className="muted">Je hebt wijzigingen die nog niet zijn opgeslagen.</span>
          ) : (
            update.isSuccess && <span className="form-success">Je profiel is opgeslagen!</span>
          )}
          {update.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(update.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

/** An animated cursor for visitors of your profile; try it by moving over the choices. */
export function CursorSettings({ user }: { user: Me }) {
  const update = useUpdateMe()
  const current = update.isPending ? (update.variables.profileCursor ?? null) : user.profileCursor
  const [area, setArea] = useState<HTMLDivElement | null>(null)
  return (
    <Box title="Cursor op je profiel" icon="mouse">
      <div id="cursor" ref={setArea}>
        <p className="muted settings-note">
          Bezoekers van je profiel krijgen deze bewegende cursor in plaats van hun muispijl. Beweeg over dit vak om hem te proberen. Wie dat niet wil, zet cursors uit onder Weergave.
        </p>
        <div className="cursor-picker" role="radiogroup" aria-label="Cursor op je profiel">
          {([null, ...Object.keys(PROFILE_CURSORS)] as (CursorKey | null)[]).map((key) => (
            <button
              key={key ?? 'geen'}
              type="button"
              role="radio"
              aria-checked={current === key}
              className={current === key ? 'frame-option selected' : 'frame-option'}
              disabled={update.isPending}
              onClick={() => update.mutate({ profileCursor: key })}
            >
              {key ? <img src={cursorUrl(key)} width={32} height={32} alt="" loading="lazy" /> : <FarmIcon name="mouse" size={32} />}
              <span>{key ? PROFILE_CURSORS[key] : 'Gewone muis'}</span>
            </button>
          ))}
        </div>
      </div>
      <ProfileCursor cursor={current} area={area} />
      {update.isError && <p className="form-error">{errorMessage(update.error)}</p>}
    </Box>
  )
}

export function SkinSettings({ user }: { user: Me }) {
  const update = useUpdateMe()
  const choices: [string | null, string, string][] = [
    [null, 'Standaard', ''],
    // Ready-made designs with their pattern scaled down, so a whole tile fits in the little swatch
    ...Object.entries(SKINS).map(([key, skin]): [string, string, string] => {
      const preset = PROFILE_PRESETS[key]
      return [key, skin.name, preset ? patternCss(preset.colors.pattern, preset.colors.background, preset.colors.background2, 0.4) : skin.background]
    }),
  ]
  const own = user.profileColors ? customSkin(user.profileColors) : null
  const ownSwatch = user.profileColors ? patternCss(user.profileColors.pattern, user.profileColors.background, user.profileColors.background2, 0.4) : null

  return (
    <Box title="Pimp je profiel" icon="paintcan">
      <div id="design" className="skin-picker">
        {choices.map(([key, name, background]) => (
          <button
            key={name}
            type="button"
            className="skin-option"
            aria-pressed={user.skin === key}
            disabled={update.isPending}
            onClick={() => update.mutate({ skin: key })}
          >
            <span className={key ? 'skin-swatch' : 'skin-swatch skin-swatch-standard'} style={key ? { background } : undefined} />
            {name}
          </button>
        ))}
        {own && (
          <button type="button" className="skin-option" aria-pressed={user.skin === CUSTOM_SKIN_KEY} disabled={update.isPending} onClick={() => update.mutate({ skin: CUSTOM_SKIN_KEY })}>
            <span className="skin-swatch skin-swatch-own" style={ownSwatch ? { background: ownSwatch } : undefined} />
            Laatste eigen design
          </button>
        )}
      </div>
      <DesignStudio
        subject="profiel"
        target="profiel"
        applied={user.skin === CUSTOM_SKIN_KEY ? user.profileColors : null}
        apply={(design) => update.mutateAsync({ profileColors: design, skin: CUSTOM_SKIN_KEY })}
        reset={() => update.mutateAsync({ skin: null })}
        preview={(design) => <ProfilePreview colors={design} user={user} />}
      />
      {update.isError && <p className="form-error">{errorMessage(update.error)}</p>}
    </Box>
  )
}

/** Your address, whether it's confirmed, and changing it (confirmed from a mail to the new one). */
export function EmailSettings({ user }: { user: Me }) {
  const { setUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const change = useMutation({
    mutationFn: () => api<Me>('/auth/email', { method: 'POST', body: { email, password } }),
    onSuccess: (me) => {
      setUser(me)
      setEmail('')
      setPassword('')
    },
  })
  const fields = change.error instanceof ApiRequestError ? change.error.fields : {}

  return (
    <Box title="E-mailadres" icon="email">
      <div id="e-mailadres" className="settings-intro">
        <p>
          <b>{user.email}</b>{' '}
          {user.emailVerified ? (
            <span className="form-success">
              <FarmIcon name="accept" /> {user.awaitingApproval ? 'goedgekeurd' : 'bevestigd'}
            </span>
          ) : user.awaitingApproval ? (
            <span className="form-notice">wacht op goedkeuring door de beheerder</span>
          ) : (
            <span className="form-error">nog niet bevestigd</span>
          )}
        </p>
        {!user.emailVerified && !user.awaitingApproval && (
          <p>
            Klik op de link in de mail die we je stuurden. <ResendConfirmation />
          </p>
        )}
        {user.pendingEmail && (
          <p className="form-notice">
            <FarmIcon name="email_go" /> We hebben een bevestigingslink gestuurd naar <b>{user.pendingEmail}</b>. Tot je daarop klikt, blijft je huidige adres gewoon werken.
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          change.mutate()
        }}
      >
        <div className="settings-grid">
          <Field label="Nieuw e-mailadres" error={fields.email}>
            <input className="text-box" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Je wachtwoord" hint="(ter controle)" error={fields.password}>
            <input className="text-box" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
        </div>
        <div className="account-actions">
          <Button type="submit" disabled={change.isPending}>
            E-mailadres wijzigen
          </Button>
          {change.isSuccess && (
            <span className="form-success">{change.data.email === user.email && change.data.pendingEmail ? 'Kijk in je mail om het nieuwe adres te bevestigen.' : 'Je e-mailadres is gewijzigd.'}</span>
          )}
          {change.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(change.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

/** Gamertags and friend codes, shown on your profile so friends can find you. */
export function GamerTagSettings({ user }: { user: Me }) {
  const update = useUpdateMe()
  const initial = () => Object.fromEntries((Object.keys(GAMER_PLATFORMS) as GamerPlatform[]).map((k) => [k, user.gamerTags[k] ?? ''])) as Record<GamerPlatform, string>
  const [tags, setTags] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const dirty = JSON.stringify(tags) !== JSON.stringify(saved)
  const fields = update.error instanceof ApiRequestError ? update.error.fields : {}
  return (
    <Box title="Gamertags" icon="controller">
      <form
        id="gamertags"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ gamerTags: tags }, { onSuccess: () => setSaved(tags) })
        }}
      >
        <p className="muted settings-intro">Zo kunnen je vrienden je vinden om samen te gamen. Ze staan in het Profiel-blok op je profiel; lege laat je gewoon leeg.</p>
        <div className="settings-grid">
          {(Object.keys(GAMER_PLATFORMS) as GamerPlatform[]).map((k) => (
            <Field key={k} label={GAMER_PLATFORMS[k].label} error={fields[`gamerTags.${k}`]}>
              <input
                className="text-box"
                value={tags[k]}
                onChange={(e) => setTags((t) => ({ ...t, [k]: e.target.value }))}
                maxLength={GAMER_TAG_MAX}
                placeholder={GAMER_PLATFORMS[k].placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          ))}
        </div>
        <div className="account-actions">
          <Button type="submit" disabled={update.isPending || !dirty}>
            Opslaan
          </Button>
          {update.isSuccess && !dirty && <span className="form-success">Opgeslagen.</span>}
          {update.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(update.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

export function PasswordSettings() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const change = useMutation({
    mutationFn: () => api<void>('/me/password', { method: 'POST', body: { current, next } }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setAgain('')
    },
  })
  const mismatch = again.length > 0 && again !== next
  const fields = change.error instanceof ApiRequestError ? change.error.fields : {}

  return (
    <Box title="Wachtwoord wijzigen" icon="key">
      <form
        id="wachtwoord"
        onSubmit={(e) => {
          e.preventDefault()
          if (again === next) change.mutate()
        }}
      >
        <div className="settings-grid">
          <Field label="Huidig wachtwoord" error={fields.current}>
            <input
              className="text-box"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Nieuw wachtwoord" hint="(minstens 8 tekens)" error={fields.next}>
            <input
              className="text-box"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="Nieuw wachtwoord nog een keer" error={mismatch ? 'De wachtwoorden zijn niet hetzelfde.' : undefined}>
            <input className="text-box" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
        </div>
        <div className="account-actions">
          <Button type="submit" disabled={change.isPending || mismatch}>
            Wachtwoord wijzigen
          </Button>
          {change.isSuccess && <span className="form-success">Je wachtwoord is gewijzigd.</span>}
          {change.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(change.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

export function DeleteAccount() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const remove = useMutation({
    mutationFn: () => api<void>('/me', { method: 'DELETE', body: { password } }),
    onSuccess: () => {
      queryClient.setQueryData(keys.me, null)
      queryClient.invalidateQueries()
      navigate('/')
    },
  })
  const fields = remove.error instanceof ApiRequestError ? remove.error.fields : {}

  return (
    <Box title="Account verwijderen" icon="warning" className="danger-zone">
      <form
        id="verwijderen"
        onSubmit={(e) => {
          e.preventDefault()
          if (confirm("Weet je het zeker? Je profiel, knuffels, WieWatWaars en foto's worden definitief verwijderd.")) {
            remove.mutate()
          }
        }}
      >
        <p>
          Hiermee verwijder je je account en alles wat je hebt geplaatst. Dit kan niet ongedaan worden gemaakt.
        </p>
        <br />
        <Field label="Bevestig met je wachtwoord" error={fields.password}>
          <input
            className="text-box"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" disabled={remove.isPending || !password}>
          Account definitief verwijderen
        </Button>
        {remove.isError && Object.keys(fields).length === 0 && <p className="form-error">{errorMessage(remove.error)}</p>}
      </form>
    </Box>
  )
}

/** Gadgets have their own page now: this points there. */
export function GadgetSettings({ user }: { user: Me }) {
  const { data: gadgets = [] } = useGadgets(user.username)
  const shown = gadgets.filter((g) => g.enabled).length + (user.buddyEnabled ? 1 : 0)

  return (
    <Box title="Gadgets" icon="plugin">
      <div id="gadgets" className="gadget-setting">
        <FarmIcon name="cart" size={32} className="gadget-setting-icon" />
        <div>
          <b>Gadgetmarkt</b>
          <p className="muted">
            Boekenkasten, muziek, radio, polls, BuddyPoke en nog veel meer: kies ze in de Gadgetmarkt, of voeg ze meteen toe op je profiel via <b>Indeling</b>.{' '}
            {shown ? `Er ${shown === 1 ? 'staat' : 'staan'} nu ${shown} ${shown === 1 ? 'gadget' : 'gadgets'} op je profiel.` : 'Je hebt nog geen gadgets op je profiel.'}
          </p>
        </div>
        <div className="gadget-setting-actions">
          <Link to="/gadgetmarkt" className="btn btn-cta">
            Naar de Gadgetmarkt
          </Link>
          <Link to="/gadgetmarkt?tab=mijn">Mijn gadgets beheren</Link>
        </div>
      </div>
    </Box>
  )
}
