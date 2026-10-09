import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Footer } from './components/layout/Footer'
import { ConsentGate } from './features/account/ConsentGate'
import { Header } from './components/layout/Header'
import { useApplyPreferences } from './lib/preferences'
import { usePageTitle } from './lib/usePageTitle'
import { MembersOnly, NotWhileWaiting } from './components/MembersOnly'
import { BlogEditPage } from './pages/blogs/BlogEditPage'
import { BlogPage } from './pages/blogs/BlogPage'
import { BlogsPage } from './pages/blogs/BlogsPage'
import { useAuth } from './lib/auth'
import { Messenger } from './features/messenger/Messenger'
import { MessengerPage } from './pages/MessengerPage'
import { AdminPage } from './pages/AdminPage'
import { AgendaPage } from './pages/AgendaPage'
import { ForumAdminPage } from './pages/forum/ForumAdminPage'
import { ForumChatPage } from './pages/forum/ForumChatPage'
import { ForumIndexPage } from './pages/forum/ForumIndexPage'
import { ForumNewThreadPage } from './pages/forum/ForumNewThreadPage'
import { ForumProfilePage } from './pages/forum/ForumProfilePage'
import { ForumSearchPage } from './pages/forum/ForumSearchPage'
import { ForumSectionPage } from './pages/forum/ForumSectionPage'
import { ForumThreadPage } from './pages/forum/ForumThreadPage'
import { VideoChannelPage } from './pages/video/VideoChannelPage'
import { VideoHomePage } from './pages/video/VideoHomePage'
import { VideoSearchPage } from './pages/video/VideoSearchPage'
import { VideoUploadPage } from './pages/video/VideoUploadPage'
import { VideoWatchPage } from './pages/video/VideoWatchPage'
import { KuddePage } from './pages/KuddePage'
import { EventPage } from './pages/EventPage'
import { NewKuddePage } from './pages/NewKuddePage'
import { KuddesPage } from './pages/KuddesPage'
import { FriendsPage } from './pages/FriendsPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MessagePage, MessagesPage, NewMessagePage } from './pages/MessagesPage'
import { NewsListPage, NewsPage } from './pages/NewsPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { UserAgreementPage } from './pages/UserAgreementPage'
import { CookiesPage } from './pages/CookiesPage'
import { PhotographerPage, PhotographyHomePage } from './pages/PhotographyPage'
import { PhotoPage } from './pages/PhotoPage'
import { AboutPage } from './pages/AboutPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { SearchPage } from './pages/SearchPage'
import { MembersPage } from './pages/MembersPage'
import { SettingsPage } from './pages/SettingsPage'
import { useNotificationSounds } from './lib/useNotificationSounds'
import { useBrowserNotifications } from './lib/useBrowserNotifications'
import { GadgetMarketPage } from './pages/GadgetMarketPage'
import { ShareCardPage } from './pages/ShareCardPage'
import { SuggestionsPage } from './pages/SuggestionsPage'
import { TimelinePage } from './pages/TimelinePage'
import { AchievementsPage } from './pages/games/AchievementsPage'
import { GamesPage } from './pages/games/GamesPage'
import { GlittersPage } from './pages/GlittersPage'
import { DesignGalleryPage } from './pages/DesignGalleryPage'
import { ToolsPage } from './pages/ToolsPage'
import { WoordPage } from './features/woord/WoordPage'
import { RekenbladPage } from './features/rekenblad/RekenbladPage'
import { PresentatiePage } from './features/presentatie/PresentatiePage'
import { PaintPage } from './features/paint/PaintPage'
import { MindmapPage } from './features/mindmap/MindmapPage'
import { PlannerPage } from './features/planner/PlannerPage'
import { FormulierPage } from './features/formulier/FormulierPage'
import { FormFillPage } from './features/formulier/FormFillPage'
import { KladblokPage } from './features/kladblok/KladblokPage'
import { RekenmachinePage } from './features/rekenmachine/RekenmachinePage'
import { SharedDocPage } from './features/gadgets/SharedDocPage'
import { useStickySides } from './lib/stickySides'
import { QuietBanner } from './components/layout/QuietBanner'
import { StudioPage } from './features/studio/StudioPage'
import { ConfirmEmailPage, ConfirmNewAddressPage, ForgotPasswordPage, ResetPasswordPage } from './pages/EmailPages'
import { VerifyBanner } from './features/account/VerifyBanner'
import { RecipeEditPage } from './pages/recipes/RecipeEditPage'
import { MediaEditPage } from './pages/media/MediaEditPage'
import { MediaItemPage } from './pages/media/MediaItemPage'
import { MediaListPage } from './pages/media/MediaListPage'
import { RecipePage } from './pages/recipes/RecipePage'
import { RecipesPage } from './pages/recipes/RecipesPage'
import { SprayPage } from './pages/games/SprayPage'
import { GamePage } from './pages/games/GamePage'
import { SoloGamePage } from './pages/games/SoloGamePage'
import { GameLive } from './features/games/GameLive'
import { FestiveEffects } from './components/effects/FestiveEffects'
import { SiteEffect } from './components/effects/SiteEffect'
import { CookieNotice } from './components/layout/CookieNotice'
import { PlayerBar } from './features/music/PlayerBar'
import { UnsavedGuard } from './components/layout/UnsavedGuard'
import { ArtistPage, MusicChartsPage, MusicHomePage, MusicUploadPage } from './pages/MusicPage'
import { RadioHomePage, StationPage } from './pages/RadioPage'
import { RadioStudioPage } from './pages/RadioStudioPage'

/** Scroll to the top on navigation, or to the #anchor when the link has one. */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    // The target may only render after data loads; retry briefly
    let tries = 0
    const timer = setInterval(() => {
      const el = document.getElementById(hash.slice(1))
      if (el || ++tries > 20) {
        clearInterval(timer)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
    return () => clearInterval(timer)
  }, [pathname, hash])
  return null
}

// Readable before agreeing to a new privacy statement: the statements themselves, and settings (to delete the account)
const BEFORE_CONSENT = ['/privacy', '/gebruikersovereenkomst', '/cookies', '/instellingen']

function Layout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const askConsent = !!user?.privacyOutdated && !BEFORE_CONSENT.includes(pathname)
  useApplyPreferences()
  useStickySides()
  useNotificationSounds()
  useBrowserNotifications(user)

  return (
    <>
      <SiteEffect />
      <ScrollToTop />
      <Header />
      <VerifyBanner />
      <QuietBanner />
      {askConsent ? <ConsentGate /> : <Outlet />}
      <Footer />
      {!user?.privacyOutdated && (
        <>
          <Messenger />
          <GameLive />
        </>
      )}
      <FestiveEffects />
      <CookieNotice />
      <PlayerBar />
      <UnsavedGuard />
    </>
  )
}

/** Links from before the rename (/blips/…) still work. */
function OldKuddeLink() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={pathname.replace(/^\/blips/, '/kuddes') + search + hash} replace />
}

function NotFound() {
  usePageTitle('Pagina niet gevonden - Kuddes')
  return (
    <main className="page page-con">
      <h1>Deze pagina bestaat niet</h1>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="profiel/:username" element={<MembersOnly><ProfilePage /></MembersOnly>} />
          <Route path="profiel/:username/bestanden/:gadgetId/:docId" element={<MembersOnly><SharedDocPage /></MembersOnly>} />
          <Route path="aanmelden" element={<RegisterPage />} />
          <Route path="inloggen" element={<LoginPage />} />
          <Route path="instellingen" element={<SettingsPage />} />
          <Route path="gadgetmarkt" element={<GadgetMarketPage />} />
          <Route path="profielkaartje" element={<ShareCardPage />} />
          <Route path="vrienden" element={<NotWhileWaiting><FriendsPage /></NotWhileWaiting>} />
          <Route path="zoeken" element={<MembersOnly><SearchPage /></MembersOnly>} />
          <Route path="leden" element={<MembersOnly><MembersPage /></MembersOnly>} />
          <Route path="kuddes" element={<MembersOnly><KuddesPage /></MembersOnly>} />
          <Route path="blips/*" element={<OldKuddeLink />} />
          <Route path="kuddes/nieuw" element={<MembersOnly><NewKuddePage /></MembersOnly>} />
          <Route path="kuddes/:slug" element={<MembersOnly><KuddePage /></MembersOnly>} />
          <Route path="kuddes/:slug/evenementen/:id" element={<MembersOnly><EventPage /></MembersOnly>} />
          <Route path="agenda" element={<MembersOnly><AgendaPage /></MembersOnly>} />
          <Route path="beheer" element={<AdminPage />} />
          <Route path="forum" element={<ForumIndexPage />} />
          <Route path="forum/nieuw" element={<ForumNewThreadPage />} />
          <Route path="forum/zoeken" element={<ForumSearchPage />} />
          <Route path="forum/tag/:tag" element={<ForumSearchPage />} />
          <Route path="forum/chat" element={<ForumChatPage />} />
          <Route path="forum/beheer" element={<ForumAdminPage />} />
          <Route path="forum/lid/:username" element={<MembersOnly><ForumProfilePage /></MembersOnly>} />
          <Route path="forum/:section" element={<ForumSectionPage />} />
          <Route path="forum/:section/:thread" element={<ForumThreadPage />} />
          <Route path="video" element={<VideoHomePage />} />
          <Route path="video/zoeken" element={<VideoSearchPage />} />
          <Route path="video/kijk" element={<VideoWatchPage />} />
          <Route path="video/uploaden" element={<VideoUploadPage />} />
          <Route path="video/kanaal/:username" element={<VideoChannelPage />} />
          <Route path="muziek" element={<MusicHomePage />} />
          <Route path="muziek/hitlijst" element={<MusicChartsPage />} />
          <Route path="muziek/uploaden" element={<MusicUploadPage />} />
          <Route path="muziek/:slug" element={<ArtistPage />} />
          <Route path="radio" element={<RadioHomePage />} />
          <Route path="radio/studio" element={<RadioStudioPage />} />
          <Route path="radio/:username" element={<StationPage />} />
          <Route path="suggesties" element={<SuggestionsPage />} />
          <Route path="nieuws" element={<NewsListPage />} />
          <Route path="nieuws/:slug" element={<NewsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="gebruikersovereenkomst" element={<UserAgreementPage />} />
          <Route path="cookies" element={<CookiesPage />} />
          <Route path="fotografie" element={<PhotographyHomePage />} />
          <Route path="fotografie/:username" element={<PhotographerPage />} />
          <Route path="fotografie/:username/foto/:id" element={<PhotoPage />} />
          <Route path="over-kuddes" element={<AboutPage />} />
          <Route path="tijdlijn" element={<MembersOnly><TimelinePage /></MembersOnly>} />
          <Route path="spellen" element={<GamesPage />} />
          <Route path="glitterplaatjes" element={<MembersOnly><GlittersPage /></MembersOnly>} />
          <Route path="designs" element={<DesignGalleryPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="tools/woord" element={<MembersOnly><WoordPage /></MembersOnly>} />
          <Route path="tools/woord/:id" element={<MembersOnly><WoordPage /></MembersOnly>} />
          <Route path="tools/rekenblad" element={<MembersOnly><RekenbladPage /></MembersOnly>} />
          <Route path="tools/rekenblad/:id" element={<MembersOnly><RekenbladPage /></MembersOnly>} />
          <Route path="tools/presentatie" element={<MembersOnly><PresentatiePage /></MembersOnly>} />
          <Route path="tools/presentatie/:id" element={<MembersOnly><PresentatiePage /></MembersOnly>} />
          <Route path="tools/paint" element={<MembersOnly><PaintPage /></MembersOnly>} />
          <Route path="tools/paint/:id" element={<MembersOnly><PaintPage /></MembersOnly>} />
          <Route path="tools/mindmap" element={<MembersOnly><MindmapPage /></MembersOnly>} />
          <Route path="tools/mindmap/:id" element={<MembersOnly><MindmapPage /></MembersOnly>} />
          <Route path="tools/planner" element={<MembersOnly><PlannerPage /></MembersOnly>} />
          <Route path="tools/planner/:id" element={<MembersOnly><PlannerPage /></MembersOnly>} />
          <Route path="tools/formulier" element={<MembersOnly><FormulierPage /></MembersOnly>} />
          <Route path="tools/formulier/:id" element={<MembersOnly><FormulierPage /></MembersOnly>} />
          <Route path="tools/kladblok" element={<MembersOnly><KladblokPage /></MembersOnly>} />
          <Route path="tools/kladblok/:id" element={<MembersOnly><KladblokPage /></MembersOnly>} />
          <Route path="tools/studio" element={<MembersOnly><StudioPage /></MembersOnly>} />
          <Route path="tools/studio/:id" element={<MembersOnly><StudioPage /></MembersOnly>} />
          <Route path="tools/rekenmachine" element={<RekenmachinePage />} />
          <Route path="formulieren/:publicId" element={<MembersOnly><FormFillPage /></MembersOnly>} />
          <Route path="recepten" element={<RecipesPage />} />
          <Route path="blogs" element={<MembersOnly><BlogsPage /></MembersOnly>} />
          <Route path="blogs/nieuw" element={<MembersOnly><BlogEditPage /></MembersOnly>} />
          <Route path="blogs/:id/bewerken" element={<MembersOnly><BlogEditPage /></MembersOnly>} />
          <Route path="blogs/:id" element={<MembersOnly><BlogPage /></MembersOnly>} />
          <Route path="recensies" element={<MediaListPage />} />
          <Route path="recensies/nieuw" element={<MediaEditPage />} />
          <Route path="recensies/:id/bewerken" element={<MediaEditPage />} />
          <Route path="recensies/:item" element={<MediaItemPage />} />
          <Route path="graffiti" element={<SprayPage />} />
          <Route path="bevestigen" element={<ConfirmEmailPage />} />
          <Route path="nieuw-adres" element={<ConfirmNewAddressPage />} />
          <Route path="wachtwoord-vergeten" element={<ForgotPasswordPage />} />
          <Route path="wachtwoord-herstellen" element={<ResetPasswordPage />} />
          <Route path="recepten/nieuw" element={<RecipeEditPage />} />
          <Route path="recepten/:id/bewerken" element={<RecipeEditPage />} />
          <Route path="recepten/:recipe" element={<RecipePage />} />
          <Route path="spellen/alleen/:kind" element={<SoloGamePage />} />
          <Route path="spellen/:kind/:id" element={<NotWhileWaiting><GamePage /></NotWhileWaiting>} />
          <Route path="prestaties/:username" element={<MembersOnly><AchievementsPage /></MembersOnly>} />
          <Route path="messenger" element={<NotWhileWaiting><MessengerPage /></NotWhileWaiting>} />
          <Route path="berichten" element={<NotWhileWaiting><MessagesPage /></NotWhileWaiting>} />
          <Route path="berichten/nieuw" element={<NotWhileWaiting><NewMessagePage /></NotWhileWaiting>} />
          <Route path="berichten/:id" element={<NotWhileWaiting><MessagePage /></NotWhileWaiting>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
