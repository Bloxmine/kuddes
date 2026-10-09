import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MIN_AGE, PRIVACY_VERSION } from '../../shared/privacy'
import { useServerInfo } from '../features/federation/serverInfo'
import { Box } from '../components/ui/Box'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { api } from '../lib/api'
import { formatDate } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import './PrivacyPage.css'

const Section = ({ id, icon, title, children }: { id: string; icon: FarmIconName; title: string; children: ReactNode }) => (
  <section id={id} className="pv-section">
    <h2>
      <FarmIcon name={icon} /> {title}
    </h2>
    {children}
  </section>
)

const External = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
)

/**
 * The privacy statement, written to the AVG (the Dutch name for the GDPR)
 * and the UAVG. New members agree to it when signing up (shared/privacy.ts
 * holds the version and who to contact). Keep it true to what the code does:
 * when something new stores or sends personal data, add it here.
 */
export function PrivacyPage() {
  usePageTitle('Privacyverklaring - Kuddes')
  // The same question the sign-up page asks: is the captcha on?
  const { data: options } = useQuery({ queryKey: ['auth-options'], queryFn: () => api<{ captcha: string | null; mail: boolean }>('/auth/options'), staleTime: Infinity })
  // Every server has its own admin, who is responsible for the data on it (Beheer → Servers)
  const server = useServerInfo()
  const contact = server && <a href={`mailto:${server.contactEmail}`}>{server.contactEmail}</a>
  return (
    <main className="page page-con">
      <Box title="Privacyverklaring" icon="lock">
        <article className="news-article pv">
          <h1>Privacyverklaring van {server?.name ?? 'Kuddes'}</h1>
          <p className="muted">Versie van {formatDate(PRIVACY_VERSION)}. Deze verklaring volgt de Algemene verordening gegevensbescherming (AVG, in het Engels GDPR) en de Uitvoeringswet AVG.</p>

          <p className="pv-summary">
            <FarmIcon name="information" size={32} />
            <span>
              <b>Kort gezegd:</b> Kuddes bewaart alleen wat nodig is om de site te laten werken en wat jij er zelf op zet. We verkopen niets, tonen geen advertenties, volgen je niet
              en gebruiken geen trackingcookies. Je kunt je gegevens altijd downloaden of je account met alles erop verwijderen.
            </span>
          </p>

          <nav className="pv-toc" aria-label="Inhoud">
            <ol>
              <li><a href="#wie">Wie is verantwoordelijk</a></li>
              <li><a href="#welke">Welke gegevens</a></li>
              <li><a href="#waarom">Waarvoor en op welke grondslag</a></li>
              <li><a href="#wie-ziet">Wie je gegevens ziet</a></li>
              <li><a href="#derden">Andere diensten</a></li>
              <li><a href="#bewaren">Hoe lang we bewaren</a></li>
              <li><a href="#cookies">Cookies en opslag in je browser</a></li>
              <li><a href="#beveiliging">Beveiliging</a></li>
              <li><a href="#leeftijd">Leeftijd</a></li>
              <li><a href="#rechten">Jouw rechten</a></li>
              <li><a href="#klacht">Een klacht</a></li>
              <li><a href="#wijzigingen">Wijzigingen</a></li>
            </ol>
          </nav>

          <Section id="wie" icon="user" title="1. Wie is verantwoordelijk">
            <p>
              De verwerkingsverantwoordelijke is {server ? `${server.name} (${server.domain})${server.adminName ? `, beheerd door ${server.adminName}` : ''}, ${server.country}` : 'de beheerder van deze server'}.
              Kuddes is een netwerk van kleine, niet-commerciële vriendensites zonder centrale eigenaar: elke server heeft een eigen beheerder, die verantwoordelijk is voor
              de gegevens van de leden van die server. Deze verklaring gaat over deze server. Vragen over je gegevens of over deze verklaring? Mail naar {contact}. Een
              functionaris voor gegevensbescherming is voor een site als deze niet verplicht.
            </p>
          </Section>

          <Section id="welke" icon="table" title="2. Welke gegevens">
            <ul>
              <li>
                <b>Je account:</b> je naam, gebruikersnaam, e-mailadres en wachtwoord. Het wachtwoord bewaren we alleen versleuteld (als hash); niemand, ook de beheerder niet, kan
                het lezen. Verder: wanneer je je aanmeldde, je e-mailadres bevestigde en met deze verklaring akkoord ging, en wanneer je voor het laatst online was, met het IP-adres van dat laatste bezoek.
              </li>
              <li>
                <b>Op de wachtlijst:</b> als de beheerder nieuwe leden zelf goedkeurt, ook wat je schreef over waarom je lid wilt worden. Dat wordt gewist zodra je bent goedgekeurd.
              </li>
              <li>
                <b>Je profiel:</b> wat je zelf invult, zoals woonplaats, geboortedatum (anderen zien alleen je leeftijd), geslacht, relatiestatus, interesses, gamertags, je
                profielfoto, achtergrond en design. Al deze velden zijn vrijwillig.
              </li>
              <li>
                <b>Wat je plaatst:</b> WieWatWaars, knuffels, reacties, foto’s, video’s, muziek, blogs, recepten, recensies, forumberichten, Kuddes en evenementen, en je stemmen en
                respect. Bij foto’s halen we alle metadata eruit, zoals de plek waar de foto is gemaakt. Alleen als jij daarvoor kiest, bewaren we de camera-info (camera, lens,
                diafragma, sluitertijd, ISO en wanneer de foto is gemaakt) om bij de foto te tonen; die lezen we in je eigen browser uit, en de locatie (GPS) nooit. Muziek die
                je uploadt zetten we om naar MP3, zonder de gegevens die in het bestand zaten.
              </li>
              <li>
                <b>Je bestanden (Tools):</b> wat je in Kuddes Woord, Rekenblad, Presentatie, Studio, Paint, Planner, Mindmap, Formulieren en Kladblok maakt en bewaart, met de
                afbeeldingen die je erin zet. Alleen jij kunt ze openen, behalve als je zelf een bestand in een gadget op je profiel zet (zoals Gedeelde bestanden,
                Tekening of Mindmap): dan kunnen leden die je profiel bekijken dat bestand zien, maar niet veranderen, tot je het weer uit de gadget haalt. Verwijder je een
                bestand, dan is het weg (en na 14 dagen ook uit de back-ups). De Rekenmachine bewaart zijn geheugen, geschiedenis en grafieken alleen in je eigen browser.
              </li>
              <li>
                <b>Formulieren:</b> deel je een formulier, dan kunnen andere leden het via de link invullen. Hun antwoorden bewaren we bij het formulier en ziet alleen de
                maker, met de naam van wie antwoordde, behalve als de maker het formulier anoniem heeft gemaakt (dat staat erboven bij het invullen). Vul jij een formulier
                in, dan ziet de maker dus je antwoorden. De antwoorden verdwijnen als de maker ze of het formulier verwijdert, of als jij je account verwijdert.
              </li>
              <li>
                <b>Muziek luisteren:</b> hoe vaak een nummer is beluisterd, voor de hitlijst. Daarbij bewaren we alleen wanneer het nummer werd afgespeeld, niet door wie. Wie een
                nummer leuk vindt, wordt wel bewaard.
              </li>
              <li>
                <b>Kuddes Radio:</b> je zender, je geplande uitzendingen, je eigen geluidjes, je DJ’s en wie je volgt. Een live uitzending (ook je stem en die van je DJ’s) gaat
                rechtstreeks naar de luisteraars en wordt <b>niet opgenomen</b>; de chat bij een uitzending verdwijnt als die stopt. Hoeveel mensen luisteren tellen we alleen
                zolang ze luisteren. Praat je als DJ rechtstreeks mee, dan ziet de host je IP-adres, net als bij bellen in Messenger.
              </li>
              <li>
                <b>Berichten en Kuddes Messenger:</b> de berichten die je stuurt en ontvangt, en of ze gelezen zijn.
              </li>
              <li>
                <b>Contacten:</b> je vrienden, vriendschapsverzoeken, familie en partner, en wie je profiel heeft bekeken (alleen het laatste bezoek per persoon).
              </li>
              <li>
                <b>Spellen:</b> je zetten, uitslagen, scores en prestaties.
              </li>
              <li>
                <b>Technische gegevens:</b> je IP-adres en browser (in het logboek van de webserver), een inlogsessie, en tellers die voorkomen dat iemand heel vaak achter elkaar iets
                probeert (zoals inloggen).
              </li>
            </ul>
            <p>
              Vul in je profiel liever geen <b>bijzondere persoonsgegevens</b> in (zoals je gezondheid, geloof, politieke voorkeur of seksuele geaardheid). Doe je dat toch, dan
              vragen we je in het profielscherm om hier expliciet toestemming voor te geven. Je maakt deze gegevens daarmee zelf zichtbaar voor andere leden.
            </p>
          </Section>

          <Section id="waarom" icon="scale_image" title="3. Waarvoor en op welke grondslag">
            <table className="pv-table">
              <thead>
                <tr>
                  <th>Waarvoor</th>
                  <th>Grondslag (AVG artikel 6)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Je account, je profiel, alles wat je plaatst, berichten, vrienden en spellen: de site zelf</td>
                  <td>Uitvoering van de overeenkomst die je met Kuddes aangaat door lid te worden (b)</td>
                </tr>
                <tr>
                  <td>Mails om je e-mailadres te bevestigen, een nieuw wachtwoord te kiezen of te melden dat je adres is gewijzigd. Geen nieuwsbrieven of reclame.</td>
                  <td>Uitvoering van de overeenkomst (b)</td>
                </tr>
                <tr>
                  <td>Vrijwillige profielvelden, zoals je geboortedatum, woonplaats en interesses</td>
                  <td>Toestemming (a): je vult ze zelf in en kunt ze altijd leegmaken</td>
                </tr>
                <tr>
                  <td>Bijzondere persoonsgegevens die je zelf op je profiel zet (zoals je gezondheid, geloof, politieke voorkeur of seksuele geaardheid)</td>
                  <td>Uitdrukkelijke toestemming (a, en artikel 9 lid 2a): je vinkt die aan in je profielscherm en kunt haar daar weer intrekken</td>
                </tr>
                <tr>
                  <td>Beveiliging: het logboek van de webserver, inlogpogingen beperken, back-ups, de controle tegen nepaccounts, misbruik of meldingen behandelen, een zwarte lijst van e-mailadressen, e-maildomeinen en gebruikersnamen waarmee na ernstig misbruik geen nieuw account gemaakt kan worden, en het IP-adres van je laatste bezoek, zodat de beheerder bij misbruik een internetverbinding tijdelijk kan blokkeren</td>
                  <td>Gerechtvaardigd belang (f): de site en haar leden veilig houden</td>
                </tr>
                <tr>
                  <td>Gegevens bewaren of afgeven als de wet dat eist</td>
                  <td>Wettelijke verplichting (c)</td>
                </tr>
              </tbody>
            </table>
            <p>
              We maken geen profielen van je voor reclame, en verkopen of verhuren niets. Sommige beslissingen neemt Kuddes automatisch, met regels die de beheerder
              instelt: bijvoorbeeld een aanmelding weigeren, iets wat je plaatste weghalen, je een waarschuwing of bericht sturen, rechten geven, of een account of
              internetverbinding blokkeren. Je kunt altijd vragen dat de beheerder er zelf naar kijkt; is het niet terecht, dan draait die het terug.
            </p>
          </Section>

          <Section id="wie-ziet" icon="group" title="4. Wie je gegevens ziet">
            <ul>
              <li>
                <b>Andere leden</b> zien je profiel, foto’s, WieWatWaars en wat je in Kuddes plaatst. Onder Instellingen → Privacy kun je je profiel alleen voor
                vrienden zichtbaar maken (anderen zien dan alleen je naam en profielfoto) en kiezen wie je een vriendschapsverzoek mag sturen. Een deel kun je afschermen, zoals blogs alleen voor vrienden, besloten Kuddes en
                verborgen video’s. Je e-mailadres is nooit zichtbaar voor andere leden.
              </li>
              <li>
                <b>Bezoekers zonder account</b> zien alleen het forum, de video’s, de muziek, het nieuws en de recepten. Profielen, foto’s, Kuddes en de agenda zijn alleen voor leden.
              </li>
              <li>
                <b>Zoekmachines en delen:</b> je profiel kan in Google en andere zoekmachines verschijnen met je naam, woonplaats en profielfoto; dat zet je uit onder Instellingen →
                Privacy. Deel je een link naar een profiel, Kudde of video, dan toont de app waarin je deelt een voorbeeld met die gegevens. Je foto’s komen niet in zoekmachines voor
                afbeeldingen.
              </li>
              <li>
                <b>Berichten</b> zijn alleen voor jou en de ontvanger. Bekijk je ingelogd een profiel, dan ziet alleen de eigenaar dat jij er was.
              </li>
              <li>
                <b>Bots</b> zijn accounts die vanzelf dingen doen, zoals nieuwe leden welkom heten; ze hebben altijd het label “Bot”. Stuur je een bot een bericht of
                knuffel, dan krijgt de bot die te zien. Is het een AI-bot, dan leest een taalmodel dat Kuddes zelf draait (LM Studio, op een computer van de beheerder)
                wat je stuurt, en de naam, woonplaats en “over mij” van leden als de bot die opzoekt. Dat gaat niet naar een AI-bedrijf en wordt niet gebruikt om het model te
                trainen. De beheerder kan zien wat een bot stuurt, net als bij andere accounts.
              </li>
              <li>
                <b>Melden:</b> meld je iets met de knop “Melden”, dan ziet alleen de beheerder dat jij het meldde, waarom, je toelichting en een stukje van wat er
                stond. Melden genoeg leden hetzelfde, of gaat het om iets dringends, dan wordt het vanzelf verborgen tot de beheerder ernaar kijkt; de schrijver krijgt
                dan een bericht. Afgehandelde meldingen bewaren we een jaar. Een gemeld privébericht ziet de beheerder alleen omdat jij het meldt.
              </li>
              <li>
                <b>Toezicht:</b> een bot kan letten op wat je plaatst waar anderen het zien (WieWatWaars, knuffels, reacties, het forum, Kuddes, blogs): op woorden die
                de beheerder niet wil, en op gedrag zoals heel veel of steeds hetzelfde plaatsen. Dan krijg je een waarschuwing, kan het bericht worden weggehaald en kan
                de beheerder een melding krijgen. Je privéberichten worden daarvoor nooit gelezen. Waarschuwingen bewaren we een jaar; ze staan in je gegevensdownload.
              </li>
              <li>
                <b>Andere Kuddes-servers (federatie):</b> word je vrienden met iemand op een andere server (naam@andere-server), dan krijgt die server wat die vriend
                op je profiel zou zien: je gebruikersnaam, naam, profielfoto, “over mij” en profielontwerp (niet als je profiel alleen voor vrienden is: dan alleen je
                naam en foto), je WieWatWaars (ook die voor vrienden) en de knuffels en respect die je daar geeft. Meld je iets van iemand op een andere server, dan hoort
                die server wat er gemeld is en waarom, maar niet dat jij het meldde. Je e-mailadres, wachtwoord, IP-adres en privéberichten gaan nooit naar een andere
                server. Volg je iemand op Mastodon of een andere server buiten Kuddes, dan krijgt die server je gebruikersnaam, naam en profielfoto
                (zoals hierboven) en dat je hem volgt; hun openbare berichten worden dan hier bewaard. Mensen op Mastodon, Pixelfed en andere servers kunnen
                jou ook volgen (zet je dat uit onder Instellingen → Privacy, of is je profiel alleen voor vrienden, dan kan dat niet): hun server krijgt dan je
                WieWatWaars voor iedereen, met foto’s, en kan die daar openbaar tonen. WieWatWaars voor vrienden gaan nooit naar volgers. Wat een andere server met die gegevens doet, valt onder de privacyverklaring van die server; je ziet bij een profiel van elders van welke server
                het komt. Van mensen op andere servers bewaart deze server op dezelfde manier wat nodig is: hun naam, foto en wat ze met leden hier delen.
              </li>
              <li>
                <b>De beheerder</b> ziet in Beheer je e-mailadres, wanneer je je aanmeldde en voor het laatst online was (met het IP-adres van dat bezoek), en wat je over je aanmelding schreef. Als beheerder van de
                server kan die technisch bij de database, maar leest je berichten niet, tenzij dat nodig is om een melding van misbruik te behandelen of de wet het eist.
              </li>
            </ul>
          </Section>

          <Section id="derden" icon="world" title="5. Andere diensten">
            <p>Kuddes gebruikt een paar andere diensten. Met wie gegevens voor ons verwerkt, sluiten we een verwerkersovereenkomst.</p>
            <ul>
              <li>
                <b>Hosting{server?.hosting && `: ${server.hosting}`}.</b> Op die servers draaien de site, de database, de back-ups en de opgeslagen foto’s en video’s.
              </li>
              {options?.mail !== false && (
                <li>
                  <b>Mail{server?.mailService && `: ${server.mailService}`}.</b> Deze dienst verstuurt de mails van de site en krijgt daarvoor je e-mailadres, je naam en de
                  inhoud van die mail.
                </li>
              )}
              {options?.captcha && (
                <li>
                  <b>Aanmelden: Cloudflare Turnstile</b> (Cloudflare Inc., Verenigde Staten). Om nepaccounts tegen te houden, controleert Turnstile op de aanmeldpagina of je een
                  mens bent. Cloudflare ziet daarbij je IP-adres en gegevens over je browser, alleen op die pagina, en gebruikt geen advertentiecookies. Cloudflare doet mee aan het
                  EU-VS Data Privacy Framework. Zie de <External href="https://www.cloudflare.com/privacypolicy/">privacyverklaring van Cloudflare</External>.
                </li>
              )}
              <li>
                <b>Bellen in Messenger:</b> alleen als jij en je vriend het allebei hebben aangezet. Het gesprek gaat rechtstreeks van browser naar browser (WebRTC); Kuddes
                geeft alleen door hoe jullie elkaar kunnen bereiken, en neemt niets op of bewaart niets. Net als bij spellen ziet de ander daarbij je IP-adres.
              </li>
              <li>
                <b>Spellen:</b> bij een potje tegen iemand anders maakt je browser rechtstreeks verbinding met die van je tegenstander. Die ziet daarbij je IP-adres, net als bij
                bellen via internet. Om die verbinding op te zetten, vraagt je browser bij een STUN-server van Google of Cloudflare (Verenigde Staten) naar je eigen IP-adres. Speel daarom
                alleen met mensen die je kent (je kunt alleen vrienden uitdagen). Kuddes bewaart alleen de zetten en de uitslag.
              </li>
              <li>
                <b>YouTube-filmpjes</b> in berichten en gadgets laden we via youtube-nocookie.com, en alleen als je YouTube toestaat in de cookie-instellingen. Pas als je op afspelen
                klikt, plaatst YouTube (Google) cookies. Het voorbeeldplaatje komt van Google (i.ytimg.com), dat daarbij je IP-adres ziet.
              </li>
              <li>
                <b>Het weerbericht</b>-gadget stuurt je postcode rechtstreeks vanuit je browser naar Open-Meteo (Zwitserland). Kuddes slaat je postcode niet op.
              </li>
              <li>
                <b>De radio</b>-gadget laadt, als je SomaFM toestaat in de cookie-instellingen, zenderlogo’s en, als je op afspelen drukt, de muziek van SomaFM (Verenigde Staten).
                Die ziet daarbij je IP-adres.
              </li>
            </ul>
            <p>
              Behalve voor de noodzakelijke technische werking van de STUN-servers en genoemde externe gadgets (zie hierboven), worden je gegevens niet buiten de Europese
              Economische Ruimte (EER) verwerkt. Een andere Kuddes-server of Mastodon-server waar een vriend van je zit, kan wel buiten de EER staan; die server is zelf
              verantwoordelijk voor wat hij bewaart. De beheerder kan servers blokkeren, en jij kiest zelf met wie je vrienden wordt.
            </p>
          </Section>

          <Section id="bewaren" icon="clock" title="6. Hoe lang we bewaren">
            <table className="pv-table">
              <tbody>
                <tr>
                  <td>Je account, profiel en wat je plaatst</td>
                  <td>Tot je het zelf verwijdert of je account verwijdert</td>
                </tr>
                <tr>
                  <td>Profielen en berichten van mensen op andere servers</td>
                  <td>Zolang iemand hier er iets mee heeft (een vriendschap, een knuffel), tot hun server meldt dat het weg is, of tot de beheerder die server blokkeert</td>
                </tr>
                <tr>
                  <td>Een aanmelding die de beheerder weigert</td>
                  <td>Meteen verwijderd</td>
                </tr>
                <tr>
                  <td>Een e-mailadres of gebruikersnaam op de zwarte lijst (na ernstig misbruik), met de reden. We bewaren ze versleuteld (als hash, zoals wachtwoorden): Kuddes kan een nieuw adres of nieuwe naam ermee vergelijken, maar het adres of de naam zelf is niet terug te lezen</td>
                  <td>Tot de beheerder het eraf haalt, ook als het account al weg is of je om verwijdering vraagt (zie artikel 10); vraag ernaar via de beheerder als je denkt dat je er onterecht op staat</td>
                </tr>
                <tr>
                  <td>Het IP-adres van je laatste bezoek</td>
                  <td>Vervangen bij je volgende bezoek, en 90 dagen na je laatste bezoek gewist</td>
                </tr>
                <tr>
                  <td>Meldingen die je deed (en die over jou)</td>
                  <td>Tot de beheerder ze afhandelt, daarna nog 1 jaar</td>
                </tr>
                <tr>
                  <td>Waarschuwingen van een bot (waarom, waar en wanneer)</td>
                  <td>1 jaar, of tot de beheerder ze intrekt</td>
                </tr>
                <tr>
                  <td>Een geblokkeerde internetverbinding (IP-adres of reeks), met de reden</td>
                  <td>Zolang als nodig is om de blokkade te handhaven (tijdelijk of permanent), of tot de beheerder de blokkade opheft</td>
                </tr>
                <tr>
                  <td>Je inlogsessie</td>
                  <td>30 dagen na je laatste bezoek, of tot je uitlogt</td>
                </tr>
                <tr>
                  <td>Links in mails (bevestigen, nieuw wachtwoord)</td>
                  <td>1 uur (wachtwoord) of 3 dagen, en ze werken maar één keer</td>
                </tr>
                <tr>
                  <td>Tellers tegen te vaak proberen</td>
                  <td>Alleen in het geheugen van de server, hooguit 24 uur</td>
                </tr>
                <tr>
                  <td>Het logboek van de webserver (IP-adressen)</td>
                  <td>Hooguit 14 dagen</td>
                </tr>
                <tr>
                  <td>Back-ups</td>
                  <td>14 dagen; wat je verwijdert, is na deze periode ook definitief uit onze back-ups gewist.</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section id="cookies" icon="cookies" title="7. Cookies en opslag in je browser">
            <p>
              Kuddes gebruikt <b>één cookie</b>, <code>kuddes_session</code>, om je ingelogd te houden. Daarnaast onthoudt je browser een paar instellingen, zoals je thema of een
              dichtgeklapt blok (local storage). Die blijven op je eigen apparaat. Dit is allemaal nodig om de site te laten werken, dus daar hoeft volgens de Telecommunicatiewet geen
              toestemming voor te worden gevraagd. Er zijn geen advertentie-, analyse- of trackingcookies.
            </p>
            <p>
              Inhoud van andere diensten (YouTube en SomaFM, zie hierboven) laadt pas als je daar toestemming voor geeft. Bij je eerste bezoek kies je tussen alles toestaan en alleen
              noodzakelijk; per dienst kiezen en je keuze veranderen kan altijd bij de <Link to="/cookies">cookie-instellingen</Link>.
            </p>
          </Section>

          <Section id="beveiliging" icon="shield" title="8. Beveiliging">
            <p>
              De site werkt alleen via een versleutelde verbinding (HTTPS). Wachtwoorden en inlogsessies bewaren we alleen als hash, net als de e-mailadressen en gebruikersnamen
              op de zwarte lijst. De database is niet vanaf internet bereikbaar, de
              back-ups kan alleen de beheerder lezen, en alleen de beheerder heeft toegang tot de server. Gaat er toch iets mis met je gegevens (een datalek), dan melden we dat binnen
              72 uur bij de Autoriteit Persoonsgegevens, en aan jou als het gevolgen voor je kan hebben.
            </p>
          </Section>

          <Section id="leeftijd" icon="user_green" title="9. Leeftijd">
            <p>
              Je moet <b>{MIN_AGE} jaar of ouder</b> zijn om je zelf aan te melden. Ben je jonger, dan heb je vooraf toestemming nodig van je ouder of verzorger (AVG artikel 8 en UAVG
              artikel 5). Bij het aanmelden geef je aan dat dat klopt. Denkt een ouder dat hun kind zonder toestemming een account heeft? Mail naar {contact}, dan verwijderen we het.
            </p>
          </Section>

          <Section id="rechten" icon="key" title="10. Jouw rechten">
            <p>Je hebt deze rechten over je gegevens:</p>
            <ul>
              <li>
                <b>Inzage en overdraagbaarheid:</b> onder <Link to="/instellingen">Instellingen</Link> download je een zip met al je foto's en uploads en alles wat je hebt geplaatst (als JSON-bestand).
              </li>
              <li>
                <b>Correctie:</b> je profiel, naam en e-mailadres pas je zelf aan onder Instellingen.
              </li>
              <li>
                <b>Verwijdering:</b> onder Instellingen verwijder je je account. Alles wat je hebt geplaatst wordt dan meteen verwijderd, en na 14 dagen ook uit de back-ups.
                Uitzondering: gegevens die op de zwarte lijst staan om misbruik te voorkomen (zie artikel 6), worden niet verwijderd als je je account wist of om verwijdering
                vraagt. Dat mag op grond van ons gerechtvaardigd belang om de site en haar leden te beschermen; je kunt er wel bezwaar tegen maken bij de beheerder.
              </li>
              <li>
                <b>Beperking en bezwaar:</b> je kunt vragen om je gegevens tijdelijk niet te gebruiken, of bezwaar maken tegen wat we op grond van gerechtvaardigd belang doen.
              </li>
              <li>
                <b>Toestemming intrekken:</b> maak een vrijwillig profielveld leeg, dan is het weg. Je toestemming voor bijzondere persoonsgegevens zet je uit in je profielscherm.
              </li>
            </ul>
            <p>Lukt iets niet zelf, of wil je een van deze rechten gebruiken? Mail naar {contact}. Je krijgt binnen een maand antwoord. We kunnen vragen te bewijzen dat het om jouw account gaat.</p>
          </Section>

          <Section id="klacht" icon="comment" title="11. Een klacht">
            <p>
              Ben je niet tevreden over hoe we met je gegevens omgaan? Laat het ons eerst weten via {contact}. Je mag ook een klacht indienen bij de{' '}
              <External href="https://autoriteitpersoonsgegevens.nl">Autoriteit Persoonsgegevens</External>.
            </p>
          </Section>

          <Section id="wijzigingen" icon="page_edit" title="12. Wijzigingen">
            <p>
              Verandert Kuddes iets aan wat er met je gegevens gebeurt, dan passen we deze verklaring aan en veranderen we de datum bovenaan. Bij een belangrijke wijziging laten we het
              je op de site weten.
            </p>
          </Section>
        </article>
      </Box>
    </main>
  )
}
