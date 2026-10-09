import { useEffect, useState, type CSSProperties } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import type { Profile } from '../../shared/api'
import { PROFILE_BOXES } from '../../shared/customization'
import { GADGET_SLOT, gadgetSlot } from '../../shared/gadgets'
import { resolveSkinFor, skinVars } from '../../shared/skins'
import { CUSTOM_SKIN_KEY } from '../../shared/customization'
import { BackgroundEffect } from '../components/effects/BackgroundEffect'
import { useSiteDark } from '../lib/useSiteDark'
import { BoxLayoutGrid, LayoutEditBar } from '../components/layout/BoxLayout'
import { GadgetDialog } from '../features/gadgets/GadgetEditor'
import { GadgetPickerDialog } from '../features/gadgets/GadgetMarket'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import { BotBadge } from '../components/ui/BotBadge'
import { Box } from '../components/ui/Box'
import { ProfileKuddesBox } from '../features/profile/KuddesBox'
import { BuddyPokeApp } from '../features/buddypoke/BuddyPoke'
import { BuddyPokeBox } from '../features/profile/BuddyPokeBox'
import { FriendsBox } from '../features/profile/FriendsBox'
import { KnuffelsBox } from '../features/profile/KnuffelsBox'
import { PhotosBox } from '../features/profile/PhotosBox'
import { ProfileActions } from '../features/profile/ProfileActions'
import { ProfileCursor } from '../features/profile/ProfileCursor'
import { ProfileHeader, type ProfileTab } from '../features/profile/ProfileHeader'
import { ProfileOverview, ProfileStatus, ProfileStatusList } from '../features/profile/ProfileOverview'
import { VisitorsBox } from '../features/profile/VisitorsBox'
import { ApiRequestError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { GadgetBox } from '../features/gadgets/GadgetBox'
import { defaultColumnOf, profileLayoutOf, useLayoutEditor, type ProfileSlot } from '../lib/layouts'
import { useGadgets, useProfile } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import './ProfilePage.css'
import '../features/federation/Federation.css'

const TABS: ProfileTab[] = ['over', 'wiewatwaars', 'vrienden', 'fotos', 'knuffels', 'buddypoke']

/** Column widths on the "Over" tab: picture | profile | sidebar. */
const COLUMN_WIDTHS = ['200px', '1fr', '300px']

/** Custom profile skins are applied by overriding the design tokens. */
function skinStyle(profile: Profile, siteDark: boolean): CSSProperties | undefined {
  // Light designs are shown dark on a dark site theme, like Kudde designs
  const skin = resolveSkinFor(profile.skin, profile.profileColors, siteDark)
  if (!skin) return undefined
  return skinVars(skin) as CSSProperties
}

export function ProfilePage() {
  const { username = '' } = useParams()
  const { user, isLoading } = useAuth()
  const { search } = useLocation()
  // "/profiel/@me" (from the menu) is your own profile
  if (username === '@me') {
    if (isLoading) return null
    return <Navigate to={user ? `/profiel/${user.username}${search}` : `/inloggen?next=${encodeURIComponent(`/profiel/@me${search}`)}`} replace />
  }
  // Remount per profile so the skin toggle etc. don't carry over
  return <ProfileView key={username} username={username.toLowerCase()} />
}

function ProfileView({ username }: { username: string }) {
  const { data: profile, error, isLoading } = useProfile(username)
  const [params, setParams] = useSearchParams()
  const [useSkin, setUseSkin] = useState(true)
  const siteDark = useSiteDark()
  // A profile for friends only (and you aren't one) has nothing to load but the name and photo
  const { data: gadgets = [] } = useGadgets(username, !!profile && !profile.locked)
  // Hidden (switched off) gadgets keep their place in the layout, they just don't show
  const gadgetIds = gadgets.map((g) => g.id)
  const editor = useLayoutEditor<ProfileSlot>('profile', profileLayoutOf(profile?.layout, gadgetIds), profileLayoutOf(null, gadgetIds))
  const { start: startEditing } = editor
  const [adding, setAdding] = useState(false)
  const [editingGadget, setEditingGadget] = useState<number | null>(null)

  // "Indelen" in the settings links here with ?indeling=1
  const wantsEditing = params.has('indeling') && !!profile?.relation?.isSelf
  useEffect(() => {
    if (!wantsEditing) return
    startEditing()
    setParams({}, { replace: true })
  }, [wantsEditing, startEditing, setParams])

  usePageTitle(profile ? `${profile.name} - Kuddes` : 'Profiel - Kuddes')

  if (isLoading) {
    return <main className="page page-con muted">Profiel laden…</main>
  }

  if (!profile) {
    const notFound = error instanceof ApiRequestError && error.status === 404
    return (
      <main className="page page-con">
        <Box title={notFound ? 'Lid niet gevonden' : 'Er ging iets mis'}>
          <p>
            {notFound ? (
              <>
                Er is geen lid met de naam <b>{username}</b>.{' '}
                <Link to={`/zoeken?q=${encodeURIComponent(username)}`}>Zoek leden</Link>
              </>
            ) : (
              'Dit profiel kon niet geladen worden. Probeer het later nog eens.'
            )}
          </p>
        </Box>
      </main>
    )
  }

  // A community elsewhere (Lemmy) is a Kudde here
  if (profile.remote?.kudde) return <Navigate to={`/kuddes/${profile.remote.kudde}`} replace />
  if (profile.locked) return <LockedProfile profile={profile} />

  const tabParam = params.get('tab') as ProfileTab | null
  const tab: ProfileTab = tabParam && TABS.includes(tabParam) ? tabParam : 'over'
  const photoParam = Number(params.get('foto')) || undefined
  const setTab = (next: ProfileTab) => setParams(next === 'over' ? {} : { tab: next }, { replace: true })
  const skinned = useSkin && !!resolveSkinFor(profile.skin, profile.profileColors, siteDark)

  const goToKnuffel = () => {
    if (tab !== 'over' && tab !== 'knuffels') setTab('knuffels')
    requestAnimationFrame(() => {
      const el = document.getElementById('knuffel-text')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
    })
  }

  return (
    <div className={skinned ? 'profile skinned' : 'profile'} style={skinned ? skinStyle(profile, siteDark) : undefined}>
      {/* The design's moving background: over its colours, behind the boxes */}
      {skinned && profile.skin === CUSTOM_SKIN_KEY && profile.profileColors?.effect && <BackgroundEffect effect={profile.profileColors.effect} />}
      <main className="page page-con">
        {/* "Zonder design" also brings back your own pointer */}
        <ProfileCursor cursor={useSkin ? profile.cursor : null} />
        <ProfileHeader
          profile={profile}
          tab={tab}
          onTab={setTab}
          useSkin={skinned}
          onToggleSkin={() => setUseSkin((s) => !s)}
          editingLayout={editor.editing}
          onEditLayout={() => {
            setTab('over')
            editor.start()
          }}
        />
        {profile.remote && <RemoteNote profile={profile} remote={profile.remote} />}

        {tab === 'over' && (
          <>
            {editor.editing && (
              <LayoutEditBar
                title="Indeling van je profiel"
                dirty={editor.dirty}
                saving={editor.saving}
                error={editor.error}
                onSave={editor.save}
                onCancel={editor.cancel}
                onReset={editor.reset}
              >
                <Button onClick={() => setAdding(true)}>
                  <FarmIcon name="plugin" /> Gadget toevoegen
                </Button>
                <Link to="/instellingen#indelingen" className="link-button">
                  Mijn indelingen
                </Link>
              </LayoutEditBar>
            )}
            {adding && (
              <GadgetPickerDialog
                username={profile.username}
                gadgets={gadgets}
                onClose={() => setAdding(false)}
                onAdded={(g) => {
                  // Into the layout being edited, and straight into its settings
                  editor.add(gadgetSlot(g.id), 2)
                  setAdding(false)
                  setEditingGadget(g.id)
                }}
              />
            )}
            {editingGadget !== null && gadgets.find((g) => g.id === editingGadget) && (
              <GadgetDialog gadget={gadgets.find((g) => g.id === editingGadget)!} username={profile.username} onClose={() => setEditingGadget(null)} />
            )}
            <BoxLayoutGrid
              className="profile-layout"
              layout={editor.layout}
              labels={{ ...PROFILE_BOXES, ...Object.fromEntries(gadgets.map((g) => [gadgetSlot(g.id), g.title])) } as Record<ProfileSlot, string>}
              widths={COLUMN_WIDTHS}
              editing={editor.editing}
              onChange={editor.change}
              defaultColumn={defaultColumnOf(profileLayoutOf(null, gadgetIds))}
              available={(key) => !GADGET_SLOT.test(key) || !!gadgets.find((g) => gadgetSlot(g.id) === key)?.enabled}
              render={(key) => {
                if (GADGET_SLOT.test(key)) {
                  const gadget = gadgets.find((g) => gadgetSlot(g.id) === key)
                  return gadget && <GadgetBox gadget={gadget} username={profile.username} isOwner={!!profile.relation?.isSelf} />
                }
                switch (key) {
                  case 'acties':
                    return <ProfileActions profile={profile} onKnuffel={goToKnuffel} />
                  case 'wiewatwaar':
                    return <ProfileStatus profile={profile} />
                  case 'profiel':
                    return <ProfileOverview profile={profile} />
                  case 'knuffels':
                    return <KnuffelsBox profile={profile} />
                  case 'vrienden':
                    return <FriendsBox profile={profile} limit={9} onShowAll={() => setTab('vrienden')} />
                  case 'buddypoke':
                    return <BuddyPokeBox profile={profile} onOpen={() => setTab('buddypoke')} />
                  case 'fotos':
                    return <PhotosBox profile={profile} limit={6} onShowAll={() => setTab('fotos')} />
                  case 'kuddes':
                    return <ProfileKuddesBox profile={profile} />
                  case 'bezoekers':
                    return <VisitorsBox profile={profile} />
                }
              }}
            />
          </>
        )}

        {tab === 'wiewatwaars' && <ProfileStatusList profile={profile} />}
        {tab === 'vrienden' && <FriendsBox profile={profile} />}
        {tab === 'fotos' && <PhotosBox profile={profile} initialPhotoId={photoParam} />}
        {tab === 'knuffels' && <KnuffelsBox profile={profile} />}
        {tab === 'buddypoke' && (
          <Box title="BuddyPoke" icon="buddypoke" className="buddypoke-tab">
            {profile.relation?.isSelf ? (
              <BuddyPokeApp username={profile.username} />
            ) : (
              <div className="box-con">
                <p>Open BuddyPoke op je eigen profiel om je buddy aan te passen en vrienden te poken.</p>
              </div>
            )}
          </Box>
        )}
      </main>
    </div>
  )
}

/** Someone's profile that's for friends only, seen by someone who isn't: the name, the photo and a way to become friends. */
/** Someone on another server: where they are, and that this is what their server shared with this one. */
function RemoteNote({ profile, remote }: { profile: Profile; remote: NonNullable<Profile['remote']> }) {
  return (
    <p className="fd-remote">
      <FarmIcon name="world_link" />
      {remote.weide ? (
        <span>
          <b>@{profile.username}</b> zit op een andere Kuddes-server, <b>{remote.domain}</b>. Je ziet hier wat die server met deze deelt; knuffels, respect en vriendschap
          gaan gewoon naar daar.
        </span>
      ) : (
        <span>
          <b>@{profile.username}</b> zit op <b>{remote.domain}</b>, een server buiten Kuddes (zoals Mastodon). Volg dit account om de openbare berichten in Overzicht →
          Fediverse te zien; respect komt daar aan als een like.
        </span>
      )}
      {remote.url && (
        <a href={remote.url} target="_blank" rel="noopener noreferrer nofollow">
          Bekijk op {remote.domain}
        </a>
      )}
    </p>
  )
}

function LockedProfile({ profile }: { profile: Profile }) {
  return (
    <main className="page page-con profile-locked">
      <Box title={profile.name} icon="lock">
        <p className="profile-locked-note">
          <span className="muted">@{profile.username}</span> <BotBadge user={profile} />
          <br />
          Het profiel van {profile.nickname} is alleen zichtbaar voor vrienden.
        </p>
        {profile.relation && <ProfileActions profile={profile} onKnuffel={() => {}} />}
      </Box>
    </main>
  )
}
