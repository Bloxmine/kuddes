import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MIN_AGE, TERMS_VERSION } from '../../shared/privacy'
import { useServerInfo } from '../features/federation/serverInfo'
import { Box } from '../components/ui/Box'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
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

/**
 * The user agreement ("gebruikersovereenkomst"): the rules of the site and
 * what Kuddes does and doesn't promise. New members agree to it together with
 * the privacy statement when signing up (shared/privacy.ts holds the version).
 */
export function UserAgreementPage() {
  usePageTitle('Gebruikersovereenkomst - Kuddes')
  const server = useServerInfo()
  const contact = server && <a href={`mailto:${server.contactEmail}`}>{server.contactEmail}</a>
  const ownRules = (server?.rules ?? '')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
  return (
    <main className="page page-con">
      <Box title="Gebruikersovereenkomst" icon="accept">
        <article className="news-article pv">
          <h1>Gebruikersovereenkomst van Kuddes</h1>
          <p className="muted">Versie van {formatDate(TERMS_VERSION)}. Door lid te worden of Kuddes te gebruiken, ga je akkoord met deze afspraken.</p>

          <p className="pv-summary">
            <FarmIcon name="information" size={32} />
            <span>
              <b>Kort gezegd:</b> wees lief voor elkaar, plaats alleen wat je mag delen, en wat je plaatst blijft van jou. Kuddes is gratis en wordt met zorg gemaakt, maar zonder
              garanties. Wie zich niet aan de regels houdt, kan zijn account kwijtraken.
            </span>
          </p>

          <nav className="pv-toc" aria-label="Inhoud">
            <ol>
              <li><a href="#over">Over deze afspraken</a></li>
              <li><a href="#account">Je account</a></li>
              <li><a href="#regels">Gedragsregels</a></li>
              <li><a href="#inhoud">Wat je plaatst</a></li>
              <li><a href="#extern">Inhoud van andere diensten</a></li>
              <li><a href="#melden">Melden en ingrijpen</a></li>
              <li><a href="#garanties">Beschikbaarheid en aansprakelijkheid</a></li>
              <li><a href="#toeval">Toeval en merken</a></li>
              <li><a href="#stoppen">Stoppen</a></li>
              <li><a href="#wijzigingen">Wijzigingen</a></li>
              <li><a href="#recht">Toepasselijk recht</a></li>
              <li><a href="#contact">Contact</a></li>
            </ol>
          </nav>

          <Section id="over" icon="book_open" title="1. Over deze afspraken">
            <p>
              {server ? `${server.name} (${server.domain})` : 'Deze server'} is een kleine, niet-commerciële vriendensite uit {server?.country ?? 'Nederland'}
              {server?.adminName && `, beheerd door ${server.adminName}`}. Hij hoort bij Kuddes, een netwerk van servers zonder centrale eigenaar: elke server heeft een
              eigen beheerder en eigen leden, en leden van verschillende servers kunnen vrienden worden. Deze gebruikersovereenkomst geldt voor iedereen die deze server
              bezoekt of er lid van is, en voor wat je vanaf een andere server naar leden hier stuurt. Andere servers hebben hun eigen afspraken. Hoe we met je gegevens
              omgaan, staat in de <Link to="/privacy">privacyverklaring</Link>; die hoort bij deze afspraken.
            </p>
            <p>
              Met mensen op andere servers deel je wat je met vrienden deelt; wat daar met je bericht gebeurt, valt onder de regels van die server. De beheerder van deze
              server kan andere servers blokkeren of stil zetten, waarna hun accounts en wat ze hier plaatsten verdwijnen. Meld je iets van iemand op een andere server,
              dan gaat de melding ook naar die server (zonder je naam).
            </p>
          </Section>

          <Section id="account" icon="user" title="2. Je account">
            <ul>
              <li>
                Je moet <b>{MIN_AGE} jaar of ouder</b> zijn om je zelf aan te melden. Ben je jonger, dan heb je vooraf toestemming nodig van je ouder of verzorger.
              </li>
              <li>Je maakt één account voor jezelf aan, met een echt e-mailadres. Doe je niet voor als iemand anders.</li>
              <li>Houd je wachtwoord geheim. Je bent verantwoordelijk voor wat er met je account gebeurt; denk je dat iemand anders erin kan, verander dan meteen je wachtwoord.</li>
              <li>Een account is persoonlijk: je mag het niet verkopen of aan een ander geven.</li>
            </ul>
          </Section>

          <Section id="regels" icon="heart" title="3. Gedragsregels">
            <p>
              Kuddes is een gezellige plek en dat houden we zo. De beheerder heeft het recht om in te grijpen als de sfeer op de site ernstig wordt verstoord, ook als een
              specifieke situatie hieronder niet letterlijk wordt genoemd. Je plaatst of stuurt in ieder geval niets dat:
            </p>
            <ul>
              <li>anderen bedreigt, pest, intimideert of discrimineert, of oproept tot geweld of haat;</li>
              <li>pornografisch of seksueel getint is, of minderjarigen op welke manier dan ook in gevaar brengt;</li>
              <li>in strijd is met de wet, zoals oplichting, illegale handel of het delen van andermans privégegevens;</li>
              <li>inbreuk maakt op het auteursrecht, merkrecht of portretrecht van een ander;</li>
              <li>reclame of spam is, of mensen naar nepsites of virussen leidt;</li>
              <li>de site of andere leden schaadt, zoals proberen in te breken, de site te overbelasten of beveiliging te omzeilen.</li>
            </ul>
            <p>Plaats geen foto’s of video’s van anderen zonder dat zij het goed vinden. Gebruik automatische programma’s (bots, scrapers) alleen met toestemming van de beheerder. Kuddes gebruikt technische hulpmiddelen om geautomatiseerde toegang en nepaccounts tegen te gaan.</p>
            <p>
              <b>Geen reclame voor andere sites.</b> Je maakt op Kuddes geen reclame voor andere websites, webwinkels, apps, diensten of sociale-mediakanalen: niet in je profiel,
              WieWatWaars, knuffels, reacties, het forum, Kuddes, blogs of berichten, en ook niet door steeds links naar dezelfde site te plaatsen of anderen te vragen ergens
              anders heen te gaan. Een link naar iets leuks dat je zelf wilt delen mag gewoon; het gaat om aanprijzen, werven en verkopen. Wie toch reclame maakt, kan worden
              gewaarschuwd, en zijn account en internetverbinding kunnen worden geblokkeerd of geband, tijdelijk of voorgoed.
            </p>
            <p>
              Een account maken met als doel reclame te maken, mag niet. Blijkt uit je aanmelding of uit wat je daarna doet dat je vooral hier bent om reclame te maken of
              mensen naar een andere site te lokken, dan kan je aanmelding worden geweigerd en kun je meteen worden geblokkeerd of geband, ook zonder eerdere waarschuwing.
              Andere Kuddes-servers gelden hierbij niet als andere site: vertellen dat je ook op een andere server zit, of vrienden worden met iemand daar, mag gewoon.
            </p>
            {ownRules.length > 0 && (
              <>
                <p>
                  <b>Eigen regels van deze server.</b> Daarnaast spreekt {server?.name ?? 'deze server'} dit af:
                </p>
                <ul>
                  {ownRules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section id="inhoud" icon="photos" title="4. Wat je plaatst">
            <ul>
              <li>
                <b>Het blijft van jou.</b> Je houdt de rechten op je teksten, foto’s, video’s en alles wat je maakt.
              </li>
              <li>
                Je geeft Kuddes toestemming om het op de site te bewaren en te tonen aan wie jij dat laat zien, en om het daarvoor aan te passen (bijvoorbeeld een foto kleiner
                maken). Die toestemming stopt als je het verwijdert, behalve voor back-ups, die na uiterlijk 14 dagen definitief worden gewist.
              </li>
              <li>
                Deel je iets met anderen, bijvoorbeeld in een Kudde, op een prikbord of in een bericht, dan kunnen zij het zien, zolang het daar staat.
              </li>
              <li>Je verklaart dat je het mag delen: je hebt het zelf gemaakt, of je hebt toestemming van wie het maakte en van wie erop staan.</li>
            </ul>
          </Section>

          <Section id="extern" icon="world_link" title="5. Inhoud van andere diensten">
            <p>
              Sommige onderdelen tonen inhoud van andere diensten, zoals video’s van YouTube en radio van SomaFM. Die laden pas als je dat toestaat in de{' '}
              <Link to="/cookies">cookie-instellingen</Link>. Voor die inhoud gelden ook de voorwaarden van die diensten; Kuddes is er niet verantwoordelijk voor. Hetzelfde geldt voor
              links naar andere websites die leden plaatsen.
            </p>
          </Section>

          <Section id="melden" icon="warning" title="6. Melden en ingrijpen">
            <p>
              Zie je iets dat niet door de beugel kan? Meld het met de knop <b>Probleem melden</b> of via de <Link to="/suggesties?soort=probleem">meldingenpagina</Link>. We kijken er
              zo snel mogelijk naar. Als we vaststellen dat inhoud illegaal is of inbreuk maakt op rechten van derden, verwijderen we deze direct.
            </p>
            <p>
              De beheerder en de forummoderatoren mogen inhoud die in strijd is met deze afspraken of met de wet verwijderen, en een account waarschuwen, tijdelijk beperken (zoals
              een forumban), blokkeren of verwijderen. Bij ernstige zaken, zoals strafbare feiten, kunnen we de politie inschakelen.
            </p>
            <p>
              Kuddes gebruikt ook een automatische moderator: een bot die let op wat je plaatst waar anderen het zien, zoals WieWatWaars, knuffels en reacties. Vindt die bot
              inhoud ongepast of spam, bijvoorbeeld door woorden die hier niet mogen of door heel veel of steeds hetzelfde te plaatsen, dan kan hij die inhoud op elk moment en
              zonder vooraf te waarschuwen verwijderen. Je krijgt dan een bericht met de reden, en de beheerder kan ernaar kijken. Denk je dat het niet terecht was, laat het
              de beheerder dan weten via een <Link to="/suggesties?soort=probleem">melding</Link>; die kan een waarschuwing intrekken. Je privéberichten leest de bot nooit. Ook een
              aanmelding weigeren, een account blokkeren of een internetverbinding bannen kan automatisch gebeuren, volgens regels van de beheerder; ook dan kun je vragen dat de
              beheerder er zelf naar kijkt.
            </p>
          </Section>

          <Section id="garanties" icon="shield" title="7. Beschikbaarheid en aansprakelijkheid">
            <ul>
              <li>
                Kuddes is gratis en wordt gemaakt zoals het is (“as is”). We doen ons best, maar beloven niet dat de site altijd werkt, foutloos is of dat functies blijven bestaan.
              </li>
              <li>Gebruik Kuddes niet als enige plek voor belangrijke foto’s of gegevens: download wat je wilt bewaren. Gebruik de site ook niet voor noodgevallen.</li>
              <li>
                Kuddes is niet aansprakelijk voor schade door het gebruik van de site, door wat andere leden plaatsen of doen, of door storingen, behalve voor zover de wet dat niet
                toestaat (zoals bij opzet of grove nalatigheid).
              </li>
              <li>Je bent zelf verantwoordelijk voor wat je plaatst. Krijgt Kuddes een claim door iets dat jij plaatste, dan kunnen we je daarop aanspreken.</li>
            </ul>
          </Section>

          <Section id="toeval" icon="lightbulb" title="8. Toeval en merken">
            <p>
              Kuddes is een eigen, onafhankelijk project. <b>Elke gelijkenis met andere (bestaande of vroegere) websites, diensten, namen, ontwerpen of personen berust op toeval.</b>{' '}
              Kuddes is niet verbonden aan, gesponsord door of goedgekeurd door de eigenaren van andere websites of merken. Namen van merken, producten en diensten die op de site
              voorkomen, zijn van hun eigenaren en worden alleen gebruikt om ze aan te duiden.
            </p>
            <p>
              De iconen zijn de Farm-Fresh iconen van FatCow (CC BY 3.0). Het weer komt van Open-Meteo. Wat leden plaatsen is van henzelf, niet van Kuddes.
            </p>
          </Section>

          <Section id="stoppen" icon="door_out" title="9. Stoppen">
            <p>
              Je kunt altijd stoppen: verwijder je account onder <Link to="/instellingen#verwijderen">Instellingen</Link>. Alles wat je plaatste gaat dan mee, zoals beschreven in de
              privacyverklaring. Kuddes kan een account beëindigen als iemand zich (herhaaldelijk) niet aan deze afspraken houdt, of de site helemaal stoppen; dat laten we dan op
              tijd weten, zodat je je gegevens kunt downloaden.
            </p>
          </Section>

          <Section id="wijzigingen" icon="page_edit" title="10. Wijzigingen">
            <p>
              We kunnen deze afspraken aanpassen, bijvoorbeeld als er iets nieuws op de site komt. Belangrijke wijzigingen melden we op de site. Gebruik je Kuddes daarna nog, dan ga
              je akkoord met de nieuwe versie. Bovenaan staat altijd de datum van de versie die nu geldt.
            </p>
          </Section>

          <Section id="recht" icon="scale_image" title="11. Toepasselijk recht">
            <p>
              Op deze afspraken is Nederlands recht van toepassing. Komen we er samen niet uit, dan gaat een geschil naar de bevoegde rechter in Nederland. Als een deel van deze
              afspraken niet geldig blijkt, blijft de rest gewoon gelden.
            </p>
          </Section>

          <Section id="contact" icon="email" title="12. Contact">
            <p>Vragen over deze afspraken? Mail naar {contact}, of gebruik de knop Probleem melden.</p>
          </Section>
        </article>
      </Box>
    </main>
  )
}
