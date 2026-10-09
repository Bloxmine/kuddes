import { Link } from 'react-router-dom'
import { GADGET_TYPES } from '../../shared/gadgets'
import { GAMES } from '../../shared/games'
import { Box } from '../components/ui/Box'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { useAuth } from '../lib/auth'
import { useStats } from '../lib/queries'
import { formatLongDate } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import { useServerInfo } from '../features/federation/serverInfo'
import './AboutPage.css'

/** Games you can play, without the variants (9-ball is part of Pool). */
const GAME_COUNT = Object.values(GAMES).filter((g) => !('variantOf' in g)).length
const GADGET_COUNT = Object.keys(GADGET_TYPES).length

const FEATURES: { icon: FarmIconName; title: string; text: string; to: string }[] = [
  { icon: 'user', title: 'Je eigen profiel', text: 'Vertel wie je bent, pimp je profiel met een eigen design en zet je vakjes waar jij ze wilt.', to: '/instellingen' },
  { icon: 'palette', title: 'Je eigen kleuren', text: 'Maak eigen thema’s voor de hele site en designs voor je profiel en je Kuddes, en deel ze met een code.', to: '/instellingen?onderdeel=weergave' },
  { icon: 'plugin', title: 'Gadgets', text: `Kies uit ${GADGET_COUNT} gadgets in de Gadgetmarkt: boekenkasten, muziek, radio, polls, een virtueel huisdier en meer.`, to: '/gadgetmarkt' },
  { icon: 'comment', title: 'WieWatWaar en knuffels', text: 'Laat weten wat je doet en waar je bent, en laat een knuffel achter bij je vrienden.', to: '/profiel/@me' },
  { icon: 'newspaper', title: 'Overzicht', text: 'Alles wat je vrienden en andere leden doen op één plek: WieWatWaars, foto’s, nieuwe muziek, blogs en meer.', to: '/tijdlijn' },
  { icon: 'email', title: 'Berichten', text: 'Persoonlijke berichten, met concepten, smileys en glitterplaatjes.', to: '/berichten' },
  { icon: 'msn_messenger', title: 'Kuddes Messenger', text: 'Chat met je vrienden, ook in groepjes, stuur nudges, deel wat je op Kuddes vindt en bel elkaar als je dat wilt.', to: '/messenger' },
  { icon: 'photos', title: "Foto's", text: "Deel je foto's met je vrienden, in albums. We halen er alle locatiegegevens uit.", to: '/profiel/@me?tab=fotos' },
  { icon: 'camera', title: 'Fotografie', text: 'Een eigen fotopagina voor je mooiste werk, met je camera-instellingen, albums en fotografie-Kuddes.', to: '/fotografie' },
  { icon: 'group', title: 'Kuddes en de agenda', text: 'Groepen, spots, scholen en verenigingen, met hun eigen prikbord, foto’s en evenementen.', to: '/kuddes' },
  { icon: 'controller', title: 'Spellen', text: `${GAME_COUNT} spellen om tegen je vrienden te spelen, van Mancala en Schaken tot Pool en de Kuddes Quiz, met prestaties.`, to: '/spellen' },
  { icon: 'comments', title: 'Forum en chat', text: 'Praat mee over van alles op het forum, of chat live met andere leden.', to: '/forum' },
  { icon: 'television', title: 'Kuddes Video', text: 'Upload je eigen video’s, maak een kanaal en geef sterren aan die van anderen.', to: '/video' },
  { icon: 'music', title: 'Kuddes Muziek', text: 'Laat je eigen muziek horen met je band of als artiest, luister naar die van anderen en volg de hitlijst.', to: '/muziek' },
  { icon: 'transmit', title: 'Kuddes Radio', text: 'Luister live naar zenders van leden, chat mee, of maak je eigen radioprogramma met DJ’s en geluidjes.', to: '/radio' },
  { icon: 'images', title: 'Glitterplaatjes', text: 'Verzamel glitterplaatjes voor elke gelegenheid en stuur ze mee met een knuffel.', to: '/glitterplaatjes' },
  { icon: 'cutlery', title: 'Recepten', text: 'Deel je lievelingsrecepten, stap voor stap met foto’s, en bewaar wat je lekker vindt.', to: '/recepten' },
  { icon: 'medal_gold_1', title: 'Recensies', text: 'Geef sterren aan boeken, films, series, muziek, spellen en drankjes, en zet ze in de kast op je profiel.', to: '/recensies' },
  { icon: 'book_open', title: 'Blogs', text: 'Schrijf je eigen blog, voor iedereen of alleen voor je vrienden.', to: '/blogs' },
  { icon: 'buddypoke', title: 'BuddyPoke', text: 'Je eigen 3D-buddy op je profiel. Kies een gevoel en poke je vrienden.', to: '/profiel/@me?tab=buddypoke' },
  { icon: 'paintcan', title: 'Graffitimuur', text: 'Spuit een muur vol, alleen of samen met je vrienden tegelijk.', to: '/graffiti' },
  { icon: 'star', title: 'Feestelijk', text: 'Sneeuw met kerst, pepernoten met Sinterklaas en hartjes op Valentijnsdag, als je dat leuk vindt.', to: '/instellingen#feestelijk' },
  { icon: 'vcard', title: 'Profielkaartje', text: 'Een kaartje van je profiel om op je eigen website of in je handtekening te zetten.', to: '/profielkaartje' },
]

const PROMISES: { icon: FarmIconName; title: string; text: string }[] = [
  { icon: 'coins', title: 'Gratis', text: 'Kuddes kost niets, en alles wat je ziet kun je gewoon gebruiken.' },
  { icon: 'cross', title: 'Geen advertenties', text: 'Geen banners, geen gesponsorde berichten en geen tracking. Kuddes zelf zet maar één cookie: om je ingelogd te houden. Video’s van YouTube en de radio van SomaFM laden pas als jij dat toestaat.' },
  { icon: 'lock', title: 'Alleen voor leden', text: 'Profielen, foto’s en wat je deelt zijn alleen te zien voor wie ingelogd is. Het forum, video’s, muziek, de radio, recepten en het nieuws zijn voor iedereen.' },
  { icon: 'heart', title: 'Gezellig', text: 'Nieuwe leden doen pas mee als hun aanmelding bevestigd is, en wat niet door de beugel kan, meld je bij de beheerder. Zo blijft Kuddes een fijne plek. Wees aardig voor elkaar!' },
]

const THANKS: { name: string; href: string; what: string }[] = [
  { name: 'Farm-Fresh', href: 'https://commons.wikimedia.org/wiki/Farm-Fresh_web_icons', what: 'de iconen, door FatCow (CC BY 3.0)' },
  { name: 'BuddyPoke', href: 'https://en.wikipedia.org/wiki/BuddyPoke', what: 'de 3D-buddy’s, nagebouwd van de originele app uit 2009' },
  { name: 'SomaFM', href: 'https://somafm.com', what: 'de reclamevrije radiozenders in de Radio-gadget' },
  { name: 'FFmpeg', href: 'https://ffmpeg.org', what: 'het omzetten van video’s en muziek, en de uitzendingen van Kuddes Radio' },
  { name: 'Open-Meteo', href: 'https://open-meteo.com', what: 'het weerbericht op Home' },
  { name: 'Twemoji', href: 'https://github.com/jdecked/twemoji', what: 'de vlaggetjes in de Landen-gadget (CC BY 4.0)' },
  { name: 'The Spriters Resource', href: 'https://www.spriters-resource.com/wii/mkwii/', what: 'de Mario Kart Wii-plaatjes (van Nintendo)' },
]

/** /over-kuddes: what Kuddes is, what you can do on it, and who's behind it. */
export function AboutPage() {
  usePageTitle('Over Kuddes - Kuddes')
  const server = useServerInfo()
  const { user } = useAuth()
  const { data: stats } = useStats()

  return (
    <main className="page page-con ab-page">
      <section className="ab-hero">
        <img src="/favicon.svg" alt="" width={72} height={72} />
        <div>
          <h1>Over Kuddes</h1>
          <p className="ab-lead">
            Kuddes is een gezellig vriendennetwerk in de stijl van de late jaren nul: glimmende balken, knuffels op je profiel, WieWatWaars en groepen die hier
            <b> Kuddes</b> heten. Altijd lief voor elkaar!
          </p>
          {!user && (
            <div className="ab-cta">
              <Link to="/aanmelden" className="btn btn-cta">
                Word gratis lid
              </Link>
              <Link to="/inloggen">Ik heb al een account</Link>
            </div>
          )}
        </div>
        {stats && (
          <dl className="ab-stats">
            <div>
              <dt>Leden</dt>
              <dd>{stats.members}</dd>
            </div>
            <div>
              <dt>Nu online</dt>
              <dd>{stats.online}</dd>
            </div>
            <div>
              <dt>Knuffels vandaag</dt>
              <dd>{stats.knuffelsToday}</dd>
            </div>
            {stats.since && (
              <div>
                <dt>Sinds</dt>
                <dd className="ab-since">{formatLongDate(stats.since)}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <Box title="Wat je op Kuddes kunt doen" icon="star">
        <ul className="ab-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Link to={f.to}>
                <FarmIcon name={f.icon} size={32} />
                <span>
                  <b>{f.title}</b>
                  <span>{f.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Box>

      <div className="ab-columns">
        <Box title="Waar Kuddes voor staat" icon="heart">
          <ul className="ab-promises">
            {PROMISES.map((p) => (
              <li key={p.title}>
                <FarmIcon name={p.icon} size={24} />
                <span>
                  <b>{p.title}</b>
                  <span>{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Meer over wat we bewaren staat in de <Link to="/privacy">privacyverklaring</Link>.
          </p>
        </Box>

        <Box title="Wie zit erachter?" icon="user">
          <p>
            {server?.name ?? 'Deze server'}
            {server?.adminName && (
              <>
                {' '}
                wordt beheerd door <b>{server.adminName}</b>
              </>
            )}
            {server?.description ? `: ${server.description}` : '.'}
          </p>
          <p>
            Kuddes zelf heeft geen eigenaar. Het is een netwerk van servers die met elkaar praten via Weide, een open standaard bovenop ActivityPub: iedereen kan een
            eigen Kuddes-server beginnen, met eigen leden en regels, en leden van alle servers kunnen vrienden worden, elkaar knuffelen en elkaars WieWatWaars zien. Een
            plek zoals de vriendennetwerken van toen, zonder advertenties en zonder dat je gegevens worden verkocht. Zoek iemand op een andere server op met{' '}
            <b>@naam@server</b>.
          </p>
          <p>Kuddes groeit mee met wat de leden willen. Mis je iets, of werkt iets niet? Laat het weten:</p>
          <ul className="ab-links">
            <li>
              <FarmIcon name="lightbulb" /> <Link to="/suggesties">Doe een suggestie</Link> of stem op die van anderen
            </li>
            <li>
              <FarmIcon name="warning" /> <Link to="/suggesties?soort=probleem">Meld een probleem</Link> (alleen de beheerder van deze server ziet het)
            </li>
            <li>
              <FarmIcon name="newspaper" /> Lees wat er nieuw is in het <Link to="/nieuws">nieuws</Link>
            </li>
          </ul>
        </Box>
      </div>

      <Box title="Met dank aan" icon="award_star_gold_1">
        <ul className="ab-thanks">
          {THANKS.map((t) => (
            <li key={t.name}>
              <a href={t.href} target="_blank" rel="noopener noreferrer">
                {t.name}
              </a>{' '}
              voor {t.what}
            </li>
          ))}
        </ul>
        <p className="muted">
          En natuurlijk Hyves, dat van 2004 tot 2013 heel Nederland met elkaar verbond. Kuddes is er een eerbetoon aan, maar heeft er verder niets mee te maken.
        </p>
      </Box>
    </main>
  )
}
