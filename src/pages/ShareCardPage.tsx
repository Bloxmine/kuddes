import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../shared/api'
import { INTERESTS, type InterestKey } from '../../shared/profileExtras'
import { SHARE_CARD_LIMITS, cardImagePath, cardPath, joinPath, type ShareCard, type ShareCardSettings } from '../../shared/shareCard'
import { RequireAuth } from '../components/layout/RequireAuth'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { api, errorMessage } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'
import './ShareCardPage.css'

type Mine = { settings: ShareCardSettings; card: ShareCard | null }
const KEY = ['me', 'share-card'] as const

/** /profielkaartje: choose what's on your card, and share it. */
export function ShareCardPage() {
  usePageTitle('Profielkaartje - Kuddes')
  return <RequireAuth>{(user) => <CardEditor key={user.username} me={user} />}</RequireAuth>
}

function Copy({ value, label, multiline }: { value: string; label: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // No clipboard: the text is selected, so Ctrl+C works
    }
  }
  return (
    <div className="sc-copy">
      {multiline ? (
        <textarea className="text-box" readOnly rows={3} value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      ) : (
        <input className="text-box" readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      )}
      <Button onClick={copy}>
        <FarmIcon name={copied ? 'accept' : 'page_save'} /> {copied ? 'Gekopieerd!' : 'Kopiëren'}
      </Button>
    </div>
  )
}

function CardEditor({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => api<Mine>('/me/share-card') })
  const [edited, setDraft] = useState<ShareCardSettings | null>(null)
  // What you changed, or else what's saved
  const draft = edited ?? data?.settings ?? null
  const save = useMutation({
    mutationFn: (settings: ShareCardSettings) => api<Mine>('/me/share-card', { method: 'PUT', body: settings }),
    onSuccess: (next) => queryClient.setQueryData(KEY, next),
  })
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  /** Change a setting: shown right away, saved a moment later. */
  const change = (patch: Partial<ShareCardSettings>) => {
    if (!draft) return
    const next = { ...draft, ...patch }
    setDraft(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => save.mutate(next), 450)
  }

  if (isLoading || !draft) return <main className="page page-con muted">Laden…</main>
  const card = data?.card ?? null
  const url = `${location.origin}${cardPath(me.username)}`
  const imageUrl = `${location.origin}${cardImagePath(me.username, card?.version)}`
  const embed = `<iframe src="${url}?embed" width="460" height="420" style="border:0;max-width:100%" title="${me.name} op Kuddes" loading="lazy"></iframe>`
  const text = `Ik zit op Kuddes, het gezellige vriendennetwerk! Bekijk mijn kaartje en word ook lid:`
  const filled = (Object.keys(INTERESTS) as InterestKey[]).filter((k) => me.interests?.[k]?.trim())

  const toggleInterest = (k: InterestKey) =>
    change({ interests: draft.interests.includes(k) ? draft.interests.filter((x) => x !== k) : draft.interests.length < SHARE_CARD_LIMITS.interests ? [...draft.interests, k] : draft.interests })

  const shareNative = async () => {
    try {
      const blob = await (await fetch(imageUrl)).blob()
      const file = new File([blob], `kuddes-${me.username}.jpg`, { type: 'image/jpeg' })
      const withFile = { title: `${me.name} op Kuddes`, text: `${text} ${url}`, files: [file] }
      if (navigator.canShare?.(withFile)) await navigator.share(withFile)
      else await navigator.share({ title: `${me.name} op Kuddes`, text, url })
    } catch {
      // Cancelled, or not possible here: the buttons below still work
    }
  }
  const download = async () => {
    const blob = await (await fetch(imageUrl)).blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kuddes-kaartje-${me.username}.jpg`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const enc = encodeURIComponent
  const shareLinks: { label: string; icon: FarmIconName; href: string }[] = [
    { label: 'WhatsApp', icon: 'iphone', href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
    { label: 'Facebook', icon: 'world', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: 'X', icon: 'comment', href: `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}` },
    { label: 'E-mail', icon: 'email', href: `mailto:?subject=${enc('Kom je ook op Kuddes?')}&body=${enc(`${text}\n${url}`)}` },
  ]

  const check = (key: keyof ShareCardSettings, label: string, hint?: string, disabled?: boolean) => (
    <label className="gadget-toggle sc-check">
      <input type="checkbox" checked={!!draft[key]} disabled={disabled} onChange={(e) => change({ [key]: e.target.checked })} />
      <span>
        {label}
        {hint && <small className="muted">{hint}</small>}
      </span>
    </label>
  )

  return (
    <main className="page page-con sc-page">
      <div className="sc-hero">
        <FarmIcon name="vcard" size={48} />
        <div>
          <h1>Profielkaartje</h1>
          <p>Laat op andere sites zien dat je op Kuddes zit: zet je kaartje op je blog of website, deel het als plaatje of stuur de link. Er staat altijd een knop op om lid te worden.</p>
        </div>
      </div>

      <div className="sc-layout">
        <div className="sc-controls">
          <Box title="Je kaartje" icon="vcard">
            <label className={draft.enabled ? 'sc-switch on' : 'sc-switch'}>
              <input type="checkbox" checked={draft.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
              <span>
                <b>{draft.enabled ? 'Je kaartje staat aan' : 'Je kaartje staat uit'}</b>
                <small className="muted">
                  {draft.enabled ? 'Iedereen met de link kan het zien, ook zonder account.' : 'Alleen jij ziet het voorbeeld. Profielen zijn alleen voor leden; op het kaartje staat alleen wat je hieronder kiest.'}
                </small>
              </span>
            </label>
            <h3 className="sc-sub">Wat staat erop?</h3>
            <p className="muted sc-always">Altijd: je naam{me.nickname !== me.name ? ' en roepnaam' : ''}, en een knop om lid te worden van Kuddes.</p>
            {check('photo', 'Profielfoto', me.avatarUrl ? undefined : 'Je hebt nog geen profielfoto.')}
            {check('city', 'Woonplaats', me.city ? me.city : 'Nog niet ingevuld.')}
            {check('age', 'Leeftijd', me.birthdate ? undefined : 'Je hebt geen geboortedatum ingevuld.')}
            {check('about', 'Een stukje van "Wie ben ik?"', me.about ? undefined : 'Nog niet ingevuld.')}
            {check('music', 'Je muziek', me.music.length ? me.music.slice(0, 3).join(', ') : 'Nog niet ingevuld.')}
            {check('gamerTags', 'Gamertags', Object.values(me.gamerTags ?? {}).some(Boolean) ? undefined : 'Nog niet ingevuld.')}
            {check('design', 'In de kleuren van je profiel', me.skin ? 'Je profieldesign.' : 'Je hebt geen eigen design: dan in het Kuddes-blauw.')}
            <h3 className="sc-sub">
              Favorieten <span className="muted">({draft.interests.length} van max. {SHARE_CARD_LIMITS.interests})</span>
            </h3>
            {filled.length ? (
              <div className="sc-chips">
                {filled.map((k) => (
                  <button key={k} type="button" className={draft.interests.includes(k) ? 'layout-chip current' : 'layout-chip'} aria-pressed={draft.interests.includes(k)} onClick={() => toggleInterest(k)}>
                    {INTERESTS[k].label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">
                Vul eerst je favorieten in bij <Link to="/instellingen#gegevens">Over jou</Link>.
              </p>
            )}
            <label className="field sc-message">
              <span>Een zin van jezelf</span>
              <input className="text-box" value={draft.message} maxLength={SHARE_CARD_LIMITS.message} placeholder="Kom je ook? Dan knuffel ik je!" onChange={(e) => change({ message: e.target.value })} />
            </label>
            <p className="muted sc-saving">{save.isPending ? 'Opslaan…' : save.isError ? '' : 'Wijzigingen worden meteen bewaard.'}</p>
            {save.isError && <p className="form-error">{errorMessage(save.error)}</p>}
          </Box>
        </div>

        <div className="sc-side">
          <Box title="Voorbeeld" icon="eye">
            <iframe key={card?.version} className="sc-preview" src={`${cardPath(me.username)}?voorbeeld&embed`} title="Voorbeeld van je kaartje" />
          </Box>

          <Box title="Delen" icon="world_link">
            {!draft.enabled && <p className="form-notice">Zet je kaartje eerst aan: anders zien anderen het niet.</p>}
            <div className={draft.enabled ? 'sc-share' : 'sc-share off'}>
              <h3 className="sc-sub">
                <FarmIcon name="link" /> De link
              </h3>
              <p className="muted">Op sites die geen embeds toestaan (fora, chats, sociale media) wordt de link vanzelf een plaatje met tekst.</p>
              <Copy value={url} label="Link naar je kaartje" />

              <h3 className="sc-sub">
                <FarmIcon name="page_white_code" /> Op je eigen site
              </h3>
              <p className="muted">Plak deze code in je blog of website.</p>
              <Copy value={embed} label="Code om je kaartje in te sluiten" multiline />

              <h3 className="sc-sub">
                <FarmIcon name="images" /> Als plaatje
              </h3>
              {card && <img className="sc-image" src={cardImagePath(me.username, card.version)} alt={`Het kaartje van ${me.name} als plaatje`} />}
              <div className="sc-buttons">
                <Button onClick={download} disabled={!draft.enabled}>
                  <FarmIcon name="page_save" /> Plaatje downloaden
                </Button>
                {'share' in navigator && (
                  <Button variant="cta" onClick={shareNative} disabled={!draft.enabled}>
                    <FarmIcon name="world_link" /> Delen…
                  </Button>
                )}
              </div>
              <div className="sc-buttons">
                {shareLinks.map((s) => (
                  <a key={s.label} className="btn" href={s.href} target="_blank" rel="noopener noreferrer" aria-disabled={!draft.enabled}>
                    <FarmIcon name={s.icon} /> {s.label}
                  </a>
                ))}
              </div>
              <p className="muted sc-join">
                Wie op &quot;Word ook lid&quot; klikt, komt op <code>{joinPath(me.username)}</code>.
              </p>
            </div>
          </Box>
        </div>
      </div>
    </main>
  )
}
