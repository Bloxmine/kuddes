import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_HOME_LAYOUT, HOME_BOXES, type HomeBox } from '../../shared/customization'
import { BoxLayoutGrid, LayoutEditBar } from '../components/layout/BoxLayout'
import { OnlineFriends } from '../components/social/OnlineFriends'
import { FarmIcon } from '../components/ui/FarmIcon'
import { AgendaBox } from '../features/events/AgendaBox'
import { Firehose } from '../features/home/Firehose'
import { KuddesBox, MediaTabsBox, NewestMembers, SuggestionsBox } from '../features/home/HomeBoxes'
import { BirthdaysBox, WelcomeBox } from '../features/home/MemberBoxes'
import { NewsCard } from '../features/home/NewsCard'
import { VisitorWelcome } from '../features/home/VisitorWelcome'
import { NowPanel } from '../features/home/NowPanel'
import { SmileysBox } from '../features/home/SmileysBox'
import { WeatherBox } from '../features/home/WeatherBox'
import { useAuth } from '../lib/auth'
import { defaultColumnOf, homeLayoutOf, useLayoutEditor } from '../lib/layouts'
import { useHome } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import '../features/home/HomeBoxes.css'

// You, the middle, what's going on
const COLUMN_WIDTHS = ['210px', '1fr', '290px']

export function HomePage() {
  const { user, waiting } = useAuth()
  const { data: home } = useHome()
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()
  const editor = useLayoutEditor<HomeBox>('home', homeLayoutOf(user?.homeLayout))
  usePageTitle('Kuddes - Het gezelligste vriendennetwerk van Nederland')

  // "Indelen" in the settings links here with ?indeling=1
  const { start: startEditing } = editor
  const wantsEditing = params.has('indeling') && !!user
  useEffect(() => {
    if (!wantsEditing) return
    startEditing()
    setParams({}, { replace: true })
  }, [wantsEditing, startEditing, setParams])

  const render = (key: HomeBox) => {
    switch (key) {
      case 'welkom':
        return user && <WelcomeBox user={user} onEditHome={editor.start} />
      case 'nieuws':
        return <NewsCard news={home?.news ?? []} />
      case 'leden':
        return <NewestMembers members={home?.newest ?? []} />
      case 'fotos':
        return <MediaTabsBox />
      case 'wiewatwaar':
        return (
          <div id="www">
            <Firehose query={query} onQuery={setQuery} />
          </div>
        )
      case 'suggesties':
        return <SuggestionsBox />
      case 'online':
        return <OnlineFriends />
      case 'jarig':
        return <BirthdaysBox />
      case 'weer':
        return <WeatherBox />
      case 'kuddes':
        return <KuddesBox />
      case 'agenda':
        return <AgendaBox />
      case 'smileys':
        return <SmileysBox />
    }
  }

  // Not logged in: the front door, then the news wide with suggestions and the weather beside it
  // (On the waitlist too: until the admin lets you in, Home is the front door, with how far you are)
  if (!user || waiting)
    return (
      <main className="page page-con home">
        <NowPanel />
        <VisitorWelcome waiting={waiting} />
        <div className="visitor-home-grid">
          <div>
            <NewsCard news={home?.news ?? []} wide />
          </div>
          <div>
            <SmileysBox />
            <SuggestionsBox />
            <WeatherBox />
          </div>
        </div>
      </main>
    )

  // A tile of "Nu in Nederland": the WieWatWaars about it
  const pickTerm = (term: string) => {
    setQuery(term)
    document.getElementById('www')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="page page-con home">
      <NowPanel onPick={editor.layout.hidden.includes('wiewatwaar') ? undefined : pickTerm} />
      {editor.editing ? (
        <LayoutEditBar
          title="Indeling van Home"
          dirty={editor.dirty}
          saving={editor.saving}
          error={editor.error}
          onSave={editor.save}
          onCancel={editor.cancel}
          onReset={editor.reset}
        />
      ) : (
        editor.layout.hidden.includes('welkom') && (
          <div className="home-tools">
            <button type="button" className="link-button" onClick={editor.start}>
              <FarmIcon name="layout_edit" /> Home aanpassen
            </button>
          </div>
        )
      )}
      <BoxLayoutGrid
        className="home-layout"
        layout={editor.layout}
        labels={HOME_BOXES}
        widths={COLUMN_WIDTHS}
        editing={editor.editing}
        onChange={editor.change}
        defaultColumn={defaultColumnOf(DEFAULT_HOME_LAYOUT)}
        render={render}
      />
    </main>
  )
}
