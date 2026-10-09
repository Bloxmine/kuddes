import { useState } from 'react'
import type { Gadget } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { GADGET_ICONS } from './gadgetIcons'
import { GadgetDialog } from './GadgetEditor'
import { AchievementsGadget } from './AchievementsGadget'
import { PhotographyGadget } from '../photography/PhotographyGadget'
import { KuddesMusicGadget } from '../music/MusicGadget'
import { KuddesRadioGadget } from '../radio/RadioGadget'
import { MindfulnessGadget } from './MindfulnessGadget'
import { KuddesVideoGadget } from './KuddesVideoGadget'
import { CountdownGadget, PollGadget } from './CountdownPoll'
import { MusicGadget, VideoGadget } from './MediaGadgets'
import { StickyNotes } from './StickyNotes'
import { AlbumsGadget, BooksGadget, GamesGadget, MoviesGadget } from './ShelfGadgets'
import { DrinksGadget, SeriesGadget } from './DrinkSeriesGadgets'
import { RecipesGadget } from './RecipesGadget'
import { BlogGadget } from '../blogs/BlogGadget'
import { ChannelGadget, ClockGadget, CountriesGadget, LinksGadget, ListGadget, RadioGadget } from './MoreGadgets'
import { CounterGadget, MarioKartGadget, PhotoGadget, QuoteGadget, TextGadget } from './ExtraGadgets'
import { ForumGadget, PetGadget, ScoresGadget, ScrapbookGadget } from './FunGadgets'
import { CalculatorGadget, DocGadget, FilesGadget } from './ToolGadgets'
import './Gadgets.css'

/** A gadget as a box on the profile. */
export function GadgetBox({ gadget, username, isOwner }: { gadget: Gadget; username: string; isOwner: boolean }) {
  // The pencil opens the gadget's settings right here, in a window
  const [editing, setEditing] = useState(false)
  return (
    <Box
      title={gadget.title}
      icon={GADGET_ICONS[gadget.type]}
      className={`gadget gadget-${gadget.type}`}
      noPadding={gadget.type === 'notities' || gadget.type === 'radio' || gadget.type === 'huisdier'}
      actions={
        isOwner ? (
          <button type="button" className="gadget-edit icon-button" title="Gadget bewerken" onClick={() => setEditing(true)}>
            <FarmIcon name="pencil" label="Bewerken" />
          </button>
        ) : undefined
      }
    >
      {editing && <GadgetDialog gadget={gadget} username={username} onClose={() => setEditing(false)} />}
      {gadget.type === 'notities' ? (
        <StickyNotes gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'muziek' ? (
        <MusicGadget gadget={gadget} />
      ) : gadget.type === 'video' ? (
        <VideoGadget gadget={gadget} />
      ) : gadget.type === 'aftellen' ? (
        <CountdownGadget gadget={gadget} />
      ) : gadget.type === 'poll' ? (
        <PollGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'kuddesvideo' ? (
        <KuddesVideoGadget gadget={gadget} isOwner={isOwner} />
      ) : gadget.type === 'boeken' ? (
        <BooksGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'films' ? (
        <MoviesGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'platen' ? (
        <AlbumsGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'spellen' ? (
        <GamesGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'recepten' ? (
        <RecipesGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'kanaal' ? (
        <ChannelGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'radio' ? (
        <RadioGadget gadget={gadget} />
      ) : gadget.type === 'klok' ? (
        <ClockGadget gadget={gadget} />
      ) : gadget.type === 'lijstje' ? (
        <ListGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'landen' ? (
        <CountriesGadget gadget={gadget} />
      ) : gadget.type === 'links' ? (
        <LinksGadget gadget={gadget} />
      ) : gadget.type === 'mariokart' ? (
        <MarioKartGadget gadget={gadget} />
      ) : gadget.type === 'tekst' ? (
        <TextGadget gadget={gadget} />
      ) : gadget.type === 'foto' ? (
        <PhotoGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'teller' ? (
        <CounterGadget gadget={gadget} />
      ) : gadget.type === 'citaat' ? (
        <QuoteGadget gadget={gadget} />
      ) : gadget.type === 'drank' ? (
        <DrinksGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'series' ? (
        <SeriesGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'huisdier' ? (
        <PetGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'forum' ? (
        <ForumGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'plakboek' ? (
        <ScrapbookGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'blog' ? (
        <BlogGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'fotografie' ? (
        <PhotographyGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'mindfulness' ? (
        <MindfulnessGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'kuddesradio' ? (
        <KuddesRadioGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'kuddesmuziek' ? (
        <KuddesMusicGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'spelscores' ? (
        <ScoresGadget gadget={gadget} isOwner={isOwner} />
      ) : gadget.type === 'bestanden' ? (
        <FilesGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'rekenmachine' ? (
        <CalculatorGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : gadget.type === 'prestaties' ? (
        <AchievementsGadget gadget={gadget} username={username} isOwner={isOwner} />
      ) : (
        // What's left are the gadgets that show one file
        <DocGadget gadget={gadget} username={username} isOwner={isOwner} />
      )}
    </Box>
  )
}
