/**
 * The collection Recensies starts with, so there's something to review from
 * day one. Added once, when media_items is still empty (server start);
 * members add the rest. Covers are drawn (shared/gadgets.ts), their colour
 * and style follow from the title.
 */
import { count } from 'drizzle-orm'
import { COVER_COLORS, COVER_STYLES, type CoverColor, type DrinkKind, type GamePlatform, type SeriesPlatform } from '../../shared/gadgets'
import { mediaSlug, type MediaDetails, type MediaKind } from '../../shared/media'
import { db } from './client'
import { mediaItems } from './schema'

type Seed = [title: string, creator: string, year: string, genre: string, description: string, details?: MediaDetails]

const BOOKS: Seed[] = [
  ['Harry Potter en de Steen der Wijzen', 'J.K. Rowling', '1997', 'Fantasy', 'Op zijn elfde verjaardag hoort Harry dat hij een tovenaar is, en hij gaat naar Zweinstein, de school voor hekserij en hocus-pocus.'],
  ['De Hobbit', 'J.R.R. Tolkien', '1937', 'Fantasy', 'Bilbo Balings gaat met dertien dwergen en de tovenaar Gandalf op weg naar de schat die de draak Smaug bewaakt.'],
  ['In de ban van de ring: De reisgenoten', 'J.R.R. Tolkien', '1954', 'Fantasy', 'Frodo moet de ene ring vernietigen, en een groep reisgenoten gaat met hem mee.'],
  ['Het Achterhuis', 'Anne Frank', '1947', 'Dagboek', 'Het dagboek dat Anne Frank bijhield toen ze met haar familie ondergedoken zat in het achterhuis aan de Prinsengracht.'],
  ['De avonden', 'Gerard Reve', '1947', 'Roman', 'Tien avonden uit het leven van Frits van Egters, in de laatste dagen van het jaar.'],
  ['Max Havelaar', 'Multatuli', '1860', 'Roman', 'Over het onrecht in Nederlands-Indië, verteld door onder anderen de koffiemakelaar Batavus Droogstoppel.'],
  ['De ontdekking van de hemel', 'Harry Mulisch', '1992', 'Roman', 'Over de vriendschap tussen Onno en Max, en een opdracht van de hemel zelf.'],
  ['Het diner', 'Herman Koch', '2009', 'Thriller', 'Twee broers en hun vrouwen gaan uit eten om te praten over iets vreselijks dat hun zonen hebben gedaan.'],
  ['Tirza', 'Arnon Grunberg', '2006', 'Roman', 'Jörgen Hofmeester en zijn geliefde jongste dochter Tirza, die na haar eindexamen op reis gaat.'],
  ['1984', 'George Orwell', '1949', 'Sciencefiction', 'Winston Smith leeft in een land waar Big Brother alles ziet en zelfs gedachten verboden kunnen zijn.'],
  ['De kleine prins', 'Antoine de Saint-Exupéry', '1943', 'Sprookje', 'Een piloot strandt in de woestijn en ontmoet een prinsje van een piepkleine planeet.'],
  ['De Da Vinci Code', 'Dan Brown', '2003', 'Thriller', 'Robert Langdon volgt de aanwijzingen in schilderijen van Leonardo da Vinci naar een oud geheim.'],
  ['De Hongerspelen', 'Suzanne Collins', '2008', 'Jeugdboek', 'Katniss Everdeen neemt de plaats in van haar zusje in een wrede wedstrijd op leven en dood.'],
  ['Twilight', 'Stephenie Meyer', '2005', 'Romantiek', 'Bella verhuist naar het regenachtige Forks en wordt verliefd op de mysterieuze Edward.'],
  ['De brief voor de koning', 'Tonke Dragt', '1962', 'Jeugdboek', 'De jonge Tiuri moet een geheime brief over de bergen naar de koning brengen.'],
  ['Pluk van de Petteflet', 'Annie M.G. Schmidt', '1971', 'Kinderboek', 'Pluk rijdt in zijn rode kraanwagentje en vindt een torenkamer in de Petteflet.'],
  ['Oorlogswinter', 'Jan Terlouw', '1972', 'Jeugdboek', 'Michiel raakt in de hongerwinter betrokken bij het verzet als hij een Engelse piloot moet helpen.'],
  ['De GVR', 'Roald Dahl', '1982', 'Kinderboek', 'Sophie wordt midden in de nacht meegenomen door de Grote Vriendelijke Reus.'],
  ['Sjakie en de chocoladefabriek', 'Roald Dahl', '1964', 'Kinderboek', 'Sjakie vindt een gouden toegangsbewijs voor de wonderlijke fabriek van Willie Wonka.'],
  ['Het leven is vurrukkulluk', 'Remco Campert', '1961', 'Roman', 'Een zomerse dag en nacht in Amsterdam, vol jonge mensen en de liefde.'],
  ['Trots en vooroordeel', 'Jane Austen', '1813', 'Klassieker', 'Elizabeth Bennet en de trotse meneer Darcy moeten allebei over hun eerste indruk heen.'],
  ['De vliegeraar', 'Khaled Hosseini', '2003', 'Roman', 'Over de vriendschap tussen Amir en Hassan in Kabul, en een schuld die Amir jaren meedraagt.'],
  ['Mannen die vrouwen haten', 'Stieg Larsson', '2005', 'Thriller', 'Journalist Mikael Blomkvist en hacker Lisbeth Salander zoeken naar een meisje dat veertig jaar geleden verdween.'],
  ['Het gouden ei', 'Tim Krabbé', '1984', 'Thriller', 'Saskia verdwijnt spoorloos bij een tankstation in Frankrijk, en Rex blijft jarenlang zoeken.'],
  ['Duin', 'Frank Herbert', '1965', 'Sciencefiction', 'Paul Atreides op de woestijnplaneet Arrakis, waar het kostbaarste goedje van het heelal vandaan komt.'],
]

const FILMS: Seed[] = [
  ['Titanic', 'James Cameron', '1997', 'Romantiek', 'Jack en Rose worden verliefd aan boord van het schip dat niet kon zinken.'],
  ['The Lord of the Rings: The Fellowship of the Ring', 'Peter Jackson', '2001', 'Fantasy', 'Het eerste deel van de verfilming van Tolkiens boeken, met Frodo en de reisgenoten.'],
  ['The Matrix', 'Lana en Lilly Wachowski', '1999', 'Sciencefiction', 'Neo ontdekt dat de wereld om hem heen een computersimulatie is.'],
  ['Pulp Fiction', 'Quentin Tarantino', '1994', 'Misdaad', 'Door elkaar lopende verhalen over gangsters, een bokser en een koffertje in Los Angeles.'],
  ['Jurassic Park', 'Steven Spielberg', '1993', 'Avontuur', 'Een pretpark vol gekloonde dinosaurussen: wat kan er misgaan?'],
  ['Finding Nemo', 'Andrew Stanton', '2003', 'Animatie', 'Clownvis Marlin zwemt de hele oceaan door om zijn zoontje Nemo terug te vinden.'],
  ['Shrek', 'Andrew Adamson en Vicky Jenson', '2001', 'Animatie', 'Een chagrijnige oger gaat met een pratende ezel een prinses redden.'],
  ['The Dark Knight', 'Christopher Nolan', '2008', 'Actie', 'Batman neemt het op tegen de Joker, die Gotham City in chaos wil storten.'],
  ['Inception', 'Christopher Nolan', '2010', 'Sciencefiction', 'Dieven die ideeën stelen uit dromen, krijgen de opdracht er een te planten.'],
  ['Toy Story', 'John Lasseter', '1995', 'Animatie', 'Cowboy Woody krijgt concurrentie van de gloednieuwe astronaut Buzz Lightyear.'],
  ['The Lion King', 'Roger Allers en Rob Minkoff', '1994', 'Animatie', 'Leeuwenwelp Simba moet zijn plek als koning van de savanne terugveroveren.'],
  ['Forrest Gump', 'Robert Zemeckis', '1994', 'Drama', 'Forrest beleeft zonder het door te hebben de grote momenten van de Amerikaanse geschiedenis.'],
  ['Back to the Future', 'Robert Zemeckis', '1985', 'Sciencefiction', 'Marty McFly reist in een DeLorean terug naar 1955 en moet zijn ouders aan elkaar koppelen.'],
  ['Pirates of the Caribbean: The Curse of the Black Pearl', 'Gore Verbinski', '2003', 'Avontuur', 'Kapitein Jack Sparrow en een vervloekte piratenbemanning op de Caribische Zee.'],
  ['Harry Potter en de Steen der Wijzen', 'Chris Columbus', '2001', 'Fantasy', 'De eerste film over de jonge tovenaar op Zweinstein.'],
  ['Zwartboek', 'Paul Verhoeven', '2006', 'Oorlog', 'Rachel Stein gaat in de Tweede Wereldoorlog undercover voor het verzet.'],
  ['Soldaat van Oranje', 'Paul Verhoeven', '1977', 'Oorlog', 'Leidse studenten in de Tweede Wereldoorlog, naar het verhaal van Erik Hazelhoff Roelfzema.'],
  ['Turks fruit', 'Paul Verhoeven', '1973', 'Drama', 'De stormachtige liefde tussen beeldhouwer Erik en Olga, naar het boek van Jan Wolkers.'],
  ['Alles is liefde', 'Joram Lürsen', '2007', 'Romantische komedie', 'Liefdesperikelen in Amsterdam in de dagen voor de intocht van Sinterklaas.'],
  ['Ja zuster, nee zuster', 'Pieter Kramer', '2002', 'Musical', 'De bioscoopversie van de tv-serie met zuster Klivia en haar vrolijke huis.'],
  ['New Kids Turbo', 'Steffen Haars en Flip van der Kuil', '2010', 'Komedie', 'De jongens uit Maaskantje raken hun baan kwijt en besluiten nergens meer voor te betalen.'],
  ['Spirited Away', 'Hayao Miyazaki', '2001', 'Animatie', 'Chihiro komt terecht in een badhuis voor geesten en moet haar ouders redden.'],
  ['Avatar', 'James Cameron', '2009', 'Sciencefiction', 'Een marinier leeft via een avatar tussen de Na’vi op de maan Pandora.'],
  ['Mean Girls', 'Mark Waters', '2004', 'Komedie', 'Cady komt op een Amerikaanse middelbare school en raakt verzeild tussen de Plastics.'],
  ['The Notebook', 'Nick Cassavetes', '2004', 'Romantiek', 'Een oude man leest een vrouw in een verzorgingshuis steeds hetzelfde liefdesverhaal voor.'],
  ['Frozen', 'Chris Buck en Jennifer Lee', '2013', 'Animatie', 'Anna gaat op zoek naar haar zus Elsa, die het koninkrijk per ongeluk in een eeuwige winter heeft gehuld.'],
  ['Star Wars', 'George Lucas', '1977', 'Sciencefiction', 'Luke Skywalker, prinses Leia en Han Solo tegen het Keizerrijk en Darth Vader.'],
]

const s = (seasons: number, seriesPlatform: SeriesPlatform): MediaDetails => ({ seasons, seriesPlatform })
const SERIES: Seed[] = [
  ['Friends', 'David Crane en Marta Kauffman', '1994', 'Komedie', 'Zes vrienden in New York, en koffie in Central Perk.', s(10, 'tv')],
  ['The Office', 'Greg Daniels', '2005', 'Komedie', 'Het dagelijkse leven op een papierkantoor in Scranton, met baas Michael Scott.', s(9, 'tv')],
  ['Breaking Bad', 'Vince Gilligan', '2008', 'Misdaad', 'Scheikundeleraar Walter White gaat drugs maken als hij hoort dat hij ernstig ziek is.', s(5, 'netflix')],
  ['Game of Thrones', 'David Benioff en D.B. Weiss', '2011', 'Fantasy', 'Adellijke families strijden om de IJzeren Troon van Westeros, terwijl de winter komt.', s(8, 'hbo')],
  ['Stranger Things', 'Matt en Ross Duffer', '2016', 'Sciencefiction', 'In het stadje Hawkins verdwijnt een jongen, en zijn vrienden vinden een meisje met bijzondere krachten.', s(5, 'netflix')],
  ['Gossip Girl', 'Josh Schwartz en Stephanie Savage', '2007', 'Drama', 'Rijke tieners in Manhattan, en een anonieme blogger die al hun geheimen kent. XOXO.', s(6, 'tv')],
  ['Prison Break', 'Paul Scheuring', '2005', 'Actie', 'Michael Scofield laat zich opsluiten om zijn broer uit de gevangenis te bevrijden.', s(5, 'tv')],
  ['Lost', 'J.J. Abrams, Jeffrey Lieber en Damon Lindelof', '2004', 'Mysterie', 'De overlevenden van een vliegtuigcrash op een wel heel vreemd eiland.', s(6, 'tv')],
  ['Desperate Housewives', 'Marc Cherry', '2004', 'Drama', 'De geheimen van vier vriendinnen in de keurige straat Wisteria Lane.', s(8, 'tv')],
  ['How I Met Your Mother', 'Carter Bays en Craig Thomas', '2005', 'Komedie', 'Ted vertelt zijn kinderen het héle lange verhaal van hoe hij hun moeder ontmoette.', s(9, 'tv')],
  ['The Big Bang Theory', 'Chuck Lorre en Bill Prady', '2007', 'Komedie', 'Vier nerdy wetenschappers en hun buurvrouw Penny.', s(12, 'tv')],
  ['Baantjer', '', '1995', 'Misdaad', 'Inspecteur De Cock en Vledder lossen moorden op in de Amsterdamse binnenstad.', s(12, 'tv')],
  ['Penoza', 'Pieter Bart Korthuis', '2010', 'Misdaad', 'Carmen van Walraven komt na de dood van haar man in de onderwereld terecht.', s(5, 'tv')],
  ['Sherlock', 'Mark Gatiss en Steven Moffat', '2010', 'Misdaad', 'Sherlock Holmes en dokter Watson in het Londen van nu.', s(4, 'tv')],
  ['The Crown', 'Peter Morgan', '2016', 'Drama', 'Het leven van koningin Elizabeth II, van haar huwelijk tot de eenentwintigste eeuw.', s(6, 'netflix')],
  ['Squid Game', 'Hwang Dong-hyuk', '2021', 'Thriller', 'Mensen met schulden doen mee aan kinderspelletjes met een levensgevaarlijke inzet.', s(3, 'netflix')],
  ['Wednesday', 'Alfred Gough en Miles Millar', '2022', 'Mysterie', 'Wednesday Addams gaat naar de Nevermore Academy en lost een reeks moorden op.', s(2, 'netflix')],
  ['The Simpsons', 'Matt Groening', '1989', 'Animatie', 'Homer, Marge, Bart, Lisa en Maggie in Springfield.', s(36, 'disney')],
  ['La casa de papel', 'Álex Pina', '2017', 'Misdaad', 'De Professor en zijn bende plegen de grootste overval in de geschiedenis van Spanje.', s(5, 'netflix')],
  ['Dexter', 'James Manos Jr.', '2006', 'Misdaad', 'Bloedspatten-expert bij de politie van Miami, en zelf in het geheim een seriemoordenaar.', s(8, 'tv')],
  ['Gilmore Girls', 'Amy Sherman-Palladino', '2000', 'Drama', 'Moeder Lorelai en dochter Rory in het stadje Stars Hollow, met veel koffie en snelle praat.', s(7, 'netflix')],
  ['The Mandalorian', 'Jon Favreau', '2019', 'Sciencefiction', 'Een premiejager in het Star Wars-heelal zorgt voor een wel heel schattig kind.', s(3, 'disney')],
  ['The Last of Us', 'Craig Mazin en Neil Druckmann', '2023', 'Drama', 'Joel smokkelt de tiener Ellie door een Amerika dat is verwoest door een schimmelinfectie.', s(2, 'hbo')],
  ['Goede tijden, slechte tijden', '', '1990', 'Soap', 'De langstlopende Nederlandse soap, over het leven in Meerdijk.', s(36, 'videoland')],
]

const a = (format: 'cd' | 'lp'): MediaDetails => ({ format })
const MUSIC: Seed[] = [
  ['Thriller', 'Michael Jackson', '1982', 'Pop', 'Het bestverkochte album ooit, met Billie Jean, Beat It en natuurlijk Thriller.', a('lp')],
  ['Back to Black', 'Amy Winehouse', '2006', 'Soul', 'Met Rehab, You Know I’m No Good en de titelsong.', a('cd')],
  ['21', 'Adele', '2011', 'Pop', 'Het album met Rolling in the Deep en Someone Like You.', a('cd')],
  ['Nevermind', 'Nirvana', '1991', 'Grunge', 'Het album met Smells Like Teen Spirit, en een baby in het zwembad op de hoes.', a('cd')],
  ['The Dark Side of the Moon', 'Pink Floyd', '1973', 'Rock', 'Een van de bekendste albums uit de rockgeschiedenis, met het prisma op de hoes.', a('lp')],
  ['Abbey Road', 'The Beatles', '1969', 'Rock', 'Met Come Together, Something en Here Comes the Sun, en het beroemde zebrapad.', a('lp')],
  ['...Baby One More Time', 'Britney Spears', '1999', 'Pop', 'Het debuutalbum van de prinses van de pop. Oops!', a('cd')],
  ['The Fame', 'Lady Gaga', '2008', 'Pop', 'Het debuut met Just Dance en Poker Face.', a('cd')],
  ['Hybrid Theory', 'Linkin Park', '2000', 'Nu-metal', 'Met In the End, Crawling en One Step Closer.', a('cd')],
  ['American Idiot', 'Green Day', '2004', 'Punkrock', 'Een rockopera met Boulevard of Broken Dreams en Wake Me Up When September Ends.', a('cd')],
  ['The Marshall Mathers LP', 'Eminem', '2000', 'Hiphop', 'Met Stan, The Real Slim Shady en The Way I Am.', a('cd')],
  ['1989', 'Taylor Swift', '2014', 'Pop', 'Taylors eerste echte popalbum, met Shake It Off en Blank Space.', a('cd')],
  ['Rumours', 'Fleetwood Mac', '1977', 'Rock', 'Liefdesverdriet binnen de band werd een klassieker, met Dreams en Go Your Own Way.', a('lp')],
  ['A Night at the Opera', 'Queen', '1975', 'Rock', 'Het album met Bohemian Rhapsody.', a('lp')],
  ['Discovery', 'Daft Punk', '2001', 'Elektronisch', 'Met One More Time, Digital Love en Harder, Better, Faster, Stronger.', a('cd')],
  ['De waarheid', 'Marco Borsato', '1994', 'Nederpop', 'Het album waarmee Marco Borsato doorbrak in het Nederlands.', a('cd')],
  ['Together Alone', 'Anouk', '1997', 'Rock', 'Het debuutalbum van Anouk, met Nobody’s Wife.', a('cd')],
  ['Umoja', 'BLØF', '2006', 'Nederpop', 'BLØF nam de nummers op met muzikanten van over de hele wereld.', a('cd')],
  ['Mother Earth', 'Within Temptation', '2000', 'Symfonische metal', 'Het album met Ice Queen en de titelsong Mother Earth.', a('cd')],
  ['Skunk', 'Doe Maar', '1981', 'Nederpop', 'Het album dat van Doe Maar de grootste band van Nederland maakte.', a('lp')],
  ['Moontan', 'Golden Earring', '1973', 'Rock', 'Het album met Radar Love.', a('lp')],
  ['Just Be', 'Tiësto', '2004', 'Trance', 'Het album met Adagio for Strings en Just Be.', a('cd')],
  ['So Glad You Made It', 'Kane', '2000', 'Rock', 'Het debuutalbum van Kane, met Where Do I Go With Me en Let It Be.', a('cd')],
  ['Oops!... I Did It Again', 'Britney Spears', '2000', 'Pop', 'Het tweede album, met de titelsong in het rode pak.', a('cd')],
]

const g = (gamePlatform: GamePlatform): MediaDetails => ({ gamePlatform })
const GAMES: Seed[] = [
  ['Super Mario Bros.', 'Nintendo', '1985', 'Platform', 'Mario springt door het Paddenstoelenrijk om prinses Peach te redden van Bowser.', g('nintendo')],
  ['The Legend of Zelda: Ocarina of Time', 'Nintendo', '1998', 'Avontuur', 'Link reist door Hyrule en door de tijd om Ganondorf te verslaan.', g('nintendo')],
  ['Pokémon Rood', 'Game Freak', '1996', 'Rollenspel', 'Vang ze allemaal: de eerste Pokémon-avonturen in de regio Kanto.', g('gameboy')],
  ['Tetris', 'Aleksej Pazjitnov', '1989', 'Puzzel', 'Blokjes draaien en rijen wegspelen, voor altijd verbonden met de Game Boy.', g('gameboy')],
  ['De Sims', 'Maxis', '2000', 'Simulatie', 'Bouw een huis, maak een familie en kijk wat er gebeurt (haal het trapje niet uit het zwembad).', g('pc')],
  ['De Sims 2', 'Maxis', '2004', 'Simulatie', 'Sims worden nu ouder, krijgen kinderen en hebben wensen en angsten.', g('pc')],
  ['RollerCoaster Tycoon', 'Chris Sawyer', '1999', 'Simulatie', 'Bouw je eigen pretpark, met achtbanen waar je bezoekers misselijk van worden.', g('pc')],
  ['Grand Theft Auto: San Andreas', 'Rockstar North', '2004', 'Actie', 'CJ komt terug naar Los Santos en raakt weer verzeild in het bendeleven.', g('playstation')],
  ['Halo: Combat Evolved', 'Bungie', '2001', 'Shooter', 'Master Chief vecht tegen de Covenant op een mysterieuze ringwereld.', g('xbox')],
  ['Wii Sports', 'Nintendo', '2006', 'Sport', 'Tennis, bowlen en boksen met de Wii-afstandsbediening in je hand (en de polsband om!).', g('nintendo')],
  ['Mario Kart Wii', 'Nintendo', '2008', 'Racen', 'Racen met Mario en zijn vrienden, met het stuurtje en een heleboel bananenschillen.', g('nintendo')],
  ['Nintendogs', 'Nintendo', '2005', 'Simulatie', 'Een puppy op je DS: aaien, uitlaten en kunstjes leren.', g('handheld')],
  ['Dr. Kawashima’s Brain Training', 'Nintendo', '2006', 'Puzzel', 'Elke dag rekensommetjes en puzzels om je hersenleeftijd omlaag te krijgen.', g('handheld')],
  ['World of Warcraft', 'Blizzard Entertainment', '2004', 'Online rollenspel', 'Met miljoenen anderen tegelijk op avontuur in de wereld van Azeroth.', g('pc')],
  ['Minecraft', 'Mojang', '2011', 'Sandbox', 'Blokken hakken en bouwen wat je wilt, en ’s nachts oppassen voor creepers.', g('pc')],
  ['Crash Bandicoot', 'Naughty Dog', '1996', 'Platform', 'De buideldas Crash springt en tolt door drie eilanden om Dr. Neo Cortex tegen te houden.', g('playstation')],
  ['Spyro the Dragon', 'Insomniac Games', '1998', 'Platform', 'Het paarse draakje Spyro bevrijdt zijn familie, die in kristal is veranderd.', g('playstation')],
  ['Guitar Hero III: Legends of Rock', 'Neversoft', '2007', 'Muziek', 'Met een plastic gitaar rocken op de grootste hits.', g('playstation')],
  ['SingStar', 'SCE London Studio', '2004', 'Muziek', 'Karaoke met twee microfoons en punten voor wie het zuiverst zingt.', g('playstation')],
  ['Habbo Hotel', 'Sulake', '2001', 'Online', 'Een pixelhotel vol kamers, meubi en chatten met iedereen.', g('pc')],
  ['De Kolonisten van Catan', 'Klaus Teuber', '1995', 'Bordspel', 'Handelen in hout, wol en graan, en wie heeft er nou steen?', g('bordspel')],
  ['Monopoly', 'Parker Brothers', '1935', 'Bordspel', 'Straten kopen, huizen bouwen en hopen dat je niet op de Kalverstraat komt.', g('bordspel')],
  ['Mens-erger-je-niet', 'Josef Friedrich Schmidt', '1914', 'Bordspel', 'Je pionnen rond het bord brengen, en anderen terug naar het begin sturen.', g('bordspel')],
  ['Animal Crossing: Wild World', 'Nintendo', '2005', 'Simulatie', 'Een eigen dorpje met pratende dieren, fossielen zoeken en je lening bij Tom Nook afbetalen.', g('handheld')],
  ['Super Smash Bros. Brawl', 'Nintendo', '2008', 'Vechtspel', 'Mario, Link, Pikachu en vele anderen vechten tegen elkaar in één groot feest.', g('nintendo')],
]

const d = (drinkKind: DrinkKind): MediaDetails => ({ drinkKind })
const DRINKS: Seed[] = [
  ['Heineken', 'Heineken', '', 'Pils', 'Het bekendste Nederlandse bier, met de rode ster op het groene flesje.', d('pils')],
  ['Grolsch Premium Pilsner', 'Grolsch', '', 'Pils', 'Pils uit Enschede, bekend van de beugelfles.', d('pils')],
  ['Hertog Jan Pilsener', 'Hertog Jan', '', 'Pils', 'Pils uit Arcen, in Limburg.', d('pils')],
  ['Amstel', 'Amstel', '', 'Pils', 'Pils die zijn naam heeft van de Amsterdamse rivier.', d('pils')],
  ['Bavaria', 'Bavaria', '', 'Pils', 'Pils uit Lieshout, in Brabant.', d('pils')],
  ['La Trappe Quadrupel', 'Bierbrouwerij De Koningshoeven', '', 'Trappist', 'Zwaar trappistenbier, gebrouwen in de abdij bij Berkel-Enschot.', d('speciaal')],
  ['Duvel', 'Duvel Moortgat', '', 'Blond', 'Sterk Belgisch blond bier, in het bolle glas.', d('speciaal')],
  ['Westmalle Tripel', 'Brouwerij Westmalle', '', 'Trappist', 'Trappistentripel van de abdij van Westmalle.', d('speciaal')],
  ['Leffe Blond', 'Leffe', '', 'Abdijbier', 'Belgisch abdijbier met een zachte, zoetige smaak.', d('speciaal')],
  ['Hoegaarden', 'Hoegaarden', '', 'Witbier', 'Troebel Belgisch witbier met koriander en sinaasappelschil.', d('witbier')],
  ['Wieckse Witte', 'Brand', '', 'Witbier', 'Fris witbier uit Limburg, vaak met een schijfje citroen.', d('witbier')],
  ['Guinness Draught', 'Guinness', '', 'Stout', 'Donkere Ierse stout met een romige schuimkraag.', d('donker')],
  ['Kasteel Donker', 'Brouwerij Van Honsebrouck', '', 'Donker', 'Zwaar, donker Belgisch bier.', d('donker')],
  ['Texels Skuumkoppe', 'Texelse Bierbrouwerij', '', 'Donker', 'Donker tarwebier van het eiland Texel.', d('donker')],
  ['Casillero del Diablo Cabernet Sauvignon', 'Concha y Toro', '', 'Rode wijn', 'Chileense rode wijn, met de duivel in de kelder.', d('rood')],
  ['Marqués de Cáceres Rioja Crianza', 'Marqués de Cáceres', '', 'Rode wijn', 'Spaanse rode wijn uit de Rioja.', d('rood')],
  ['Villa Maria Sauvignon Blanc', 'Villa Maria', '', 'Witte wijn', 'Frisse witte wijn uit Nieuw-Zeeland.', d('wit')],
  ['Mateus Rosé', 'Mateus', '', 'Rosé', 'Portugese rosé in de bekende platte fles.', d('rose')],
  ['Moët & Chandon Impérial', 'Moët & Chandon', '', 'Champagne', 'Champagne voor als er iets te vieren valt.', d('bubbels')],
  ['Freixenet Cordon Negro', 'Freixenet', '', 'Cava', 'Spaanse cava in de zwarte fles.', d('bubbels')],
  ['Strongbow', 'Strongbow', '', 'Cider', 'Engelse appelcider.', d('cider')],
  ['Somersby Apple Cider', 'Somersby', '', 'Cider', 'Zoete appelcider, lekker met veel ijs.', d('cider')],
  ['Bacardi Carta Blanca', 'Bacardi', '', 'Rum', 'Witte rum met de vleermuis op het etiket.', d('sterk')],
  ['Jägermeister', 'Mast-Jägermeister', '', 'Kruidenlikeur', 'Duitse kruidenlikeur, het liefst ijskoud.', d('sterk')],
  ['Bols Jonge Jenever', 'Bols', '', 'Jenever', 'Jonge jenever uit Amsterdam.', d('sterk')],
  ['Licor 43', 'Diego Zamora', '', 'Likeur', 'Spaanse likeur van 43 ingrediënten, met vanille.', d('sterk')],
  ['Baileys Original Irish Cream', 'Baileys', '', 'Roomlikeur', 'Ierse roomlikeur met whiskey.', d('sterk')],
]

const SEEDS: [MediaKind, Seed[]][] = [
  ['boeken', BOOKS],
  ['films', FILMS],
  ['series', SERIES],
  ['muziek', MUSIC],
  ['spellen', GAMES],
  ['drank', DRINKS],
]

const COLORS = Object.keys(COVER_COLORS) as CoverColor[]
function hash(text: string) {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

export async function seedMedia() {
  const [{ n }] = await db.select({ n: count() }).from(mediaItems)
  if (n > 0) return
  const rows = SEEDS.flatMap(([kind, list]) =>
    list.map(([title, creator, year, genre, description, details = {}]) => {
      const h = hash(`${kind}:${title}`)
      return { kind, title, slug: mediaSlug(title), creator, year, genre, description, details, color: COLORS[h % COLORS.length], style: COVER_STYLES[(h >>> 8) % COVER_STYLES.length] }
    }),
  )
  await db.insert(mediaItems).values(rows).onConflictDoNothing()
  console.log(`Recensies: ${rows.length} titels in de collectie gezet.`)
}
