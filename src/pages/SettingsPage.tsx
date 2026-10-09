import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CatalogHero, CatalogLayout, CategoryBar, SideFilters, SideList } from '../components/catalog/Catalog'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { RequireAuth } from '../components/layout/RequireAuth'
import { Box } from '../components/ui/Box'
import {
  DataExport,
  DisplaySettings,
  FestiveSettings,
  LayoutSettings,
  PostingSettings,
  PrivacySettings,
  BellSettings,
  BrowserNotificationSettings,
  SavedLayoutsSettings,
  SessionSettings,
  SoundSettings,
} from '../features/account/Customization'
import { ThemeSettings } from '../features/account/ThemeStudio'
import { AvatarSettings, CursorSettings, DeleteAccount, EmailSettings, GadgetSettings, GamerTagSettings, PasswordSettings, ProfileSettings, SkinSettings } from '../features/account/Settings'
import { usePageTitle } from '../lib/usePageTitle'
import './AccountPages.css'
import { RelationSettings } from '../features/relations/Relations'
import type { Me } from '../../shared/api'
import { ResendConfirmation } from '../features/account/VerifyBanner'
import { useAuth } from '../lib/auth'
import { confirmLeave } from '../lib/unsavedChanges'

type Tab = 'profiel' | 'pimpen' | 'weergave' | 'meldingen' | 'privacy' | 'account'

/**
 * The settings in six topics, each with its sections. A section's id is its
 * anchor (/instellingen#privacy): links from elsewhere open the right topic.
 */
const TABS: { key: Tab; name: string; hint: string; icon: FarmIconName; sections: [id: string, label: string, icon: FarmIconName][] }[] = [
  {
    key: 'profiel',
    name: 'Profiel',
    hint: 'foto, over jou',
    icon: 'user',
    sections: [
      ['foto', 'Profielfoto', 'camera'],
      ['gegevens', 'Over jou', 'vcard'],
      ['gamertags', 'Gamertags', 'controller'],
      ['relaties', 'Relaties', 'heart'],
    ],
  },
  {
    key: 'pimpen',
    name: 'Pimpen',
    hint: 'design, gadgets',
    icon: 'paintcan',
    sections: [
      ['design', 'Pimp je profiel', 'paintcan'],
      ['cursor', 'Cursor', 'mouse'],
      ['gadgets', 'Gadgets', 'plugin'],
      ['indeling', 'Indeling', 'layout'],
      ['indelingen', 'Mijn indelingen', 'layout_content'],
    ],
  },
  {
    key: 'weergave',
    name: 'Weergave',
    hint: 'kleuren, tekst',
    icon: 'palette',
    sections: [
      ['kleuren', 'Kleuren van Kuddes', 'palette'],
      ['weergave', 'Tekst en ruimte', 'font'],
      ['feestelijk', 'Feestelijk', 'star'],
    ],
  },
  {
    key: 'meldingen',
    name: 'Meldingen',
    hint: 'pop-ups, geluid',
    icon: 'bell',
    sections: [
      ['bel', 'Bij de bel', 'bell'],
      ['browser-meldingen', 'In je browser', 'monitor'],
      ['geluid', 'Geluid', 'sound'],
    ],
  },
  {
    key: 'privacy',
    name: 'Privacy',
    hint: 'wie mag wat',
    icon: 'lock',
    sections: [
      ['privacy', 'Wie mag wat', 'lock'],
      ['berichten', 'Berichten plaatsen', 'comment'],
      ['gegevens-downloaden', 'Je gegevens', 'page_white_put'],
    ],
  },
  {
    key: 'account',
    name: 'Account',
    hint: 'e-mail, inloggen',
    icon: 'key',
    sections: [
      ['e-mailadres', 'E-mailadres', 'email'],
      ['wachtwoord', 'Wachtwoord', 'key'],
      ['apparaten', 'Apparaten', 'door_out'],
      ['verwijderen', 'Account verwijderen', 'warning'],
    ],
  },
]

const tabOfSection = (id: string) => TABS.find((t) => t.sections.some(([s]) => s === id))?.key

/** The section currently in view, for highlighting it in the list on the side. */
function useCurrentSection(ids: string[]) {
  const [current, setCurrent] = useState(ids[0])
  // Picked in the list: that one stays lit while the page scrolls there (it may stop short at the bottom)
  const picked = useRef(false)
  useEffect(() => {
    const onScroll = () => {
      if (picked.current) return
      // The last section whose top has passed a line near the top of the screen
      let found = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top < 140) found = id
      }
      // At the very bottom the last section can't scroll up that far (but only once you've scrolled)
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) found = ids[ids.length - 1]
      setCurrent(found)
    }
    // Scrolling yourself (wheel, finger, keys) lets go of the picked one
    const release = () => (picked.current = false)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchmove', release, { passive: true })
    window.addEventListener('keydown', release)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchmove', release)
      window.removeEventListener('keydown', release)
    }
  }, [ids])
  const pick = (id: string) => {
    picked.current = true
    setCurrent(id)
  }
  return [current, pick] as const
}

/** Waiting for the confirmation mail: only the address (to fix a typo) and deleting the account. */
function UnconfirmedSettings({ user }: { user: Me }) {
  return (
    <main className="page page-con settings-unconfirmed">
      <h1>Instellingen</h1>
      <br />
      <Box title="Bevestig eerst je e-mailadres" icon="email_open">
        <p>
          Je profiel invullen, een profielfoto, je design en de rest van de instellingen kun je zodra je je e-mailadres hebt bevestigd met de link in de mail naar <b>{user.email}</b>.
          Niets gekregen? Kijk in je spam of ongewenste e-mail, of <ResendConfirmation label="stuur de mail opnieuw" />. Klopt het adres niet? Pas het hieronder aan.
        </p>
      </Box>
      <EmailSettings user={user} />
      <DeleteAccount />
    </main>
  )
}

export function SettingsPage() {
  usePageTitle('Instellingen - Kuddes')
  const { unconfirmed } = useAuth()
  const { hash } = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // A link to a section (#privacy) opens its topic; otherwise ?onderdeel=, or the first
  const tab = tabOfSection(hash.slice(1)) ?? TABS.find((t) => t.key === params.get('onderdeel'))?.key ?? 'profiel'
  const info = TABS.find((t) => t.key === tab)!
  const ids = useMemo(() => info.sections.map(([id]) => id), [info])
  const [current, pickSection] = useCurrentSection(ids)

  return (
    <RequireAuth>
      {(user) =>
        unconfirmed ? (
          <UnconfirmedSettings user={user} />
        ) : (
          <main className="page page-con settings-page">
            <CatalogHero
              title="Instellingen"
              intro="Je profiel, hoe Kuddes eruitziet, meldingen, privacy en je account. Wijzigingen worden meteen bewaard, behalve formulieren met een eigen knop."
              side={
                <Link to={`/profiel/${user.username}`} className="btn settings-hero-btn">
                  <FarmIcon name="user" /> Bekijk je profiel
                </Link>
              }
            />
            <CategoryBar
              label="Onderdelen"
              items={TABS.map((t) => ({ key: t.key, name: t.name, hint: t.hint, icon: t.icon }))}
              current={tab}
              onPick={(key) =>
                // Another topic closes this one's forms: ask first when something isn't saved
                void confirmLeave().then((leave) => {
                  if (!leave) return
                  navigate(key && key !== 'profiel' ? `?onderdeel=${key}` : '.', { replace: true })
                  window.scrollTo(0, 0)
                })
              }
            />
            <CatalogLayout
              side={
                <>
                  <SideFilters
                    title={`In ${info.name}`}
                    options={info.sections.map(([id, label, icon]) => [id, label, icon])}
                    value={current}
                    onChange={(id) => {
                      pickSection(id)
                      navigate(`#${id}`, { replace: true })
                      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  />
                  <SideList
                    title="Ook handig"
                    items={[
                      ['cookies', <Link key="cookies" to="/cookies">Cookie-instellingen</Link>],
                      ['shield', <Link key="privacy" to="/privacy">Privacyverklaring</Link>],
                      ['vcard', <Link key="kaartje" to="/profielkaartje">Je profielkaartje</Link>],
                    ]}
                  />
                </>
              }
            >
              <div className="settings-main">
                {tab === 'profiel' && (
                  <>
                    <AvatarSettings user={user} />
                    {/* Keyed by username so the form resets if the account changes */}
                    <ProfileSettings key={user.username} user={user} />
                    <GamerTagSettings key={`gt-${user.username}`} user={user} />
                    <RelationSettings user={user} />
                  </>
                )}
                {tab === 'pimpen' && (
                  <>
                    <SkinSettings user={user} />
                    <CursorSettings user={user} />
                    <GadgetSettings user={user} />
                    <LayoutSettings user={user} />
                    <SavedLayoutsSettings />
                  </>
                )}
                {tab === 'weergave' && (
                  <>
                    <ThemeSettings />
                    <DisplaySettings />
                    <FestiveSettings />
                  </>
                )}
                {tab === 'meldingen' && (
                  <>
                    <BellSettings />
                    <BrowserNotificationSettings />
                    <SoundSettings />
                  </>
                )}
                {tab === 'privacy' && (
                  <>
                    <PrivacySettings />
                    <PostingSettings />
                    <DataExport />
                  </>
                )}
                {tab === 'account' && (
                  <>
                    <EmailSettings user={user} />
                    <PasswordSettings />
                    <SessionSettings />
                    <DeleteAccount />
                  </>
                )}
              </div>
            </CatalogLayout>
          </main>
        )
      }
    </RequireAuth>
  )
}
