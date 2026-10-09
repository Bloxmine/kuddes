/**
 * Prestaties (achievements). The server counts the metrics and hands out an
 * achievement once its target is reached (server/lib/achievements.ts); they
 * never go away again, even if the count drops later.
 */
import type { BejeweledBadge } from './bejeweled'
import type { GameStats } from './games'

export type AchievementMetric =
  | 'gamesPlayed'
  | 'gamesWon'
  | 'bestStreak'
  | 'bestScore'
  | 'bestCapture'
  | 'longestChain'
  | 'crushingWins'
  | 'opponents'
  | 'friends'
  | 'knuffelsGiven'
  | 'knuffelsReceived'
  | 'statuses'
  | 'photos'
  | 'profileViews'
  | 'pimped'
  | 'kuddes'
  | 'kuddesCreated'
  | 'forumPosts'
  | 'videos'
  | 'videoViews'
  | 'memberDays'
  | 'glitters'
  | 'glitterKnuffels'
  | 'winsVier'
  | 'vierQuick'
  | 'vierDiagonal'
  | 'winsZeeslag'
  | 'zeeslagSharp'
  | 'winsDammen'
  | 'dammenKings'
  | 'dammenCapture'
  | 'winsQuiz'
  | 'quizCorrect'
  | 'winsSchaken'
  | 'chessPromotions'
  | 'winsPool'
  | 'poolRun'
  | 'poolBreakAndRun'
  | 'winsMemory'
  | 'memoryStreak'
  | 'winsMastermind'
  | 'mastermindQuick'
  | 'winsPoker'
  | 'pokerBestHand'
  | 'winsSolitaire'
  | 'bubbleScore'
  | 'winsMahjong'
  | 'winsMinesweeper'
  | 'minesweeperExpert'
  | 'winsStapelgek'
  | 'winsKleurwissel'
  | 'kleurPoints'
  | 'winsYacht'
  | 'yachtsRolled'
  | 'yachtScore'
  | 'gameKindsWon'
  | 'bestFriends'
  | 'hasPartner'
  | 'pioneer'
  | 'recipes'
  | 'recipeLikes'
  | 'recipesLiked'
  | 'recipeCategories'
  | 'shelfBooks'
  | 'shelfMovies'
  | 'shelfAlbums'
  | 'shelfGames'
  | 'shelfItems'
  | 'gadgets'
  | 'kuddePosts'
  | 'kuddePolls'
  | 'kuddeVotes'
  | 'kuddeReplies'
  | 'kuddeDesigned'
  | 'kuddeMembersMax'
  | 'framed'
  | 'sprayCans'
  | 'sprayBasic'
  | 'spraySpecial'
  | 'spraySecret'
  | 'sprayUnlocked'
  | 'sprayTogether'
  | 'sprayPhotos'
  | 'statusPolls'
  | 'blogs'
  /** Bejeweled 3: the count (or best) of one of its badges (shared/bejeweled.ts). */
  | `bj_${BejeweledBadge}`

export type AchievementCategory = 'spellen' | 'bejeweled' | 'sociaal' | 'kuddes' | 'koken' | 'video'

export type AchievementTier = 'brons' | 'zilver' | 'goud'

export type AchievementDef = {
  name: string
  description: string
  icon: string
  category: AchievementCategory
  tier: AchievementTier
  metric: AchievementMetric
  target: number
}

export const ACHIEVEMENT_CATEGORIES: Record<AchievementCategory, { name: string; icon: string }> = {
  spellen: { name: 'Spellen', icon: 'controller' },
  bejeweled: { name: 'Bejeweled 3', icon: 'ruby' },
  sociaal: { name: 'Sociaal', icon: 'group' },
  kuddes: { name: 'Kuddes & forum', icon: 'tag_blue' },
  koken: { name: 'Koken & verzamelen', icon: 'cutlery' },
  video: { name: 'Video & meer', icon: 'television' },
}

export const ACHIEVEMENTS = {
  // Spellen
  'eerste-potje': { name: 'Eerste potje', description: 'Speel je eerste potje, van welk spel dan ook.', icon: 'dice', category: 'spellen', tier: 'brons', metric: 'gamesPlayed', target: 1 },
  'eerste-winst': { name: 'Winnaar!', description: 'Win je eerste potje.', icon: 'medal_bronze_1', category: 'spellen', tier: 'brons', metric: 'gamesWon', target: 1 },
  'tien-winsten': { name: 'Geoefend', description: 'Win 10 potjes.', icon: 'medal_silver_1', category: 'spellen', tier: 'zilver', metric: 'gamesWon', target: 10 },
  'vijftig-winsten': { name: 'Mancala-meester', description: 'Win 50 potjes.', icon: 'medal_gold_2', category: 'spellen', tier: 'goud', metric: 'gamesWon', target: 50 },
  'op-dreef': { name: 'Op dreef', description: 'Win 3 potjes op rij.', icon: 'fire', category: 'spellen', tier: 'zilver', metric: 'bestStreak', target: 3 },
  onverslaanbaar: { name: 'Onverslaanbaar', description: 'Win 10 potjes op rij.', icon: 'crown_gold', category: 'spellen', tier: 'goud', metric: 'bestStreak', target: 10 },
  monsterscore: { name: 'Monsterscore', description: 'Haal 36 of meer knikkers in één potje Mancala.', icon: 'ruby', category: 'spellen', tier: 'goud', metric: 'bestScore', target: 36 },
  rover: { name: 'Rover', description: 'Pik in Mancala in één zet 10 of meer knikkers in.', icon: 'bomb', category: 'spellen', tier: 'zilver', metric: 'bestCapture', target: 10 },
  kettingreactie: { name: 'Kettingreactie', description: 'Mag in Mancala 3 keer achter elkaar nog een keer.', icon: 'lightning', category: 'spellen', tier: 'zilver', metric: 'longestChain', target: 3 },
  afgetroefd: { name: 'Afgetroefd', description: 'Win Mancala terwijl je tegenstander 12 of minder knikkers heeft.', icon: 'diamond', category: 'spellen', tier: 'goud', metric: 'crushingWins', target: 1 },
  gezelligheid: { name: 'Gezelligheid', description: 'Speel tegen 5 verschillende vrienden.', icon: 'emotion_happy', category: 'spellen', tier: 'zilver', metric: 'opponents', target: 5 },
  'vier-op-een-rij': { name: 'Vier op een rij!', description: 'Win een potje Vier op een rij.', icon: 'rosette', category: 'spellen', tier: 'brons', metric: 'winsVier', target: 1 },
  bliksemsnel: { name: 'Bliksemsnel', description: 'Win Vier op een rij met hooguit 6 van je stenen.', icon: 'lightning', category: 'spellen', tier: 'zilver', metric: 'vierQuick', target: 1 },
  schuin: { name: 'Schuin door het bord', description: 'Win Vier op een rij met een schuine rij.', icon: 'arrow_turn_left', category: 'spellen', tier: 'brons', metric: 'vierDiagonal', target: 1 },
  kapitein: { name: 'Kapitein', description: 'Win een potje Zeeslag.', icon: 'shield', category: 'spellen', tier: 'brons', metric: 'winsZeeslag', target: 1 },
  scherpschutter: { name: 'Scherpschutter', description: 'Win Zeeslag met hooguit 45 schoten.', icon: 'bomb', category: 'spellen', tier: 'goud', metric: 'zeeslagSharp', target: 1 },
  dammer: { name: 'Dammer', description: 'Win een potje Dammen.', icon: 'chess_horse', category: 'spellen', tier: 'brons', metric: 'winsDammen', target: 1 },
  'dam-gehaald': { name: 'Dam!', description: 'Haal een dam in Dammen.', icon: 'crown_gold', category: 'spellen', tier: 'zilver', metric: 'dammenKings', target: 1 },
  meerslag: { name: 'Meerslag', description: 'Sla in Dammen 3 of meer stukken in één zet.', icon: 'sport_8ball', category: 'spellen', tier: 'goud', metric: 'dammenCapture', target: 3 },
  quizkenner: { name: 'Quizkenner', description: 'Win een Kuddes Quiz.', icon: 'lightbulb', category: 'spellen', tier: 'brons', metric: 'winsQuiz', target: 1 },
  professor: { name: 'Professor', description: 'Beantwoord alle 10 quizvragen goed.', icon: 'brain', category: 'spellen', tier: 'goud', metric: 'quizCorrect', target: 10 },
  schaakmat: { name: 'Schaakmat!', description: 'Win een potje Schaken.', icon: 'crown_gold', category: 'spellen', tier: 'brons', metric: 'winsSchaken', target: 1 },
  promotie: { name: 'Promotie', description: 'Laat een pion promoveren in Schaken.', icon: 'star', category: 'spellen', tier: 'zilver', metric: 'chessPromotions', target: 1 },
  poolhaai: { name: 'Poolhaai', description: 'Win een potje Pool (8-ball of 9-ball).', icon: 'sport_8ball', category: 'spellen', tier: 'brons', metric: 'winsPool', target: 1 },
  'pool-serie': { name: 'Serie', description: 'Pot in Pool 5 ballen achter elkaar.', icon: 'lightning', category: 'spellen', tier: 'zilver', metric: 'poolRun', target: 5 },
  'break-and-run': { name: 'Break and run', description: 'Win Pool zonder dat je tegenstander ook maar één keer mag stoten.', icon: 'ruby', category: 'spellen', tier: 'goud', metric: 'poolBreakAndRun', target: 1 },
  geheugenkampioen: { name: 'Geheugenkampioen', description: 'Win een potje Memory.', icon: 'images', category: 'spellen', tier: 'brons', metric: 'winsMemory', target: 1 },
  olifantengeheugen: { name: 'Olifantengeheugen', description: 'Vind in Memory 4 paren achter elkaar.', icon: 'brain', category: 'spellen', tier: 'goud', metric: 'memoryStreak', target: 4 },
  codekraker: { name: 'Codekraker', description: 'Win een potje Mastermind (als raader of als codemaker).', icon: 'color_swatch', category: 'spellen', tier: 'brons', metric: 'winsMastermind', target: 1 },
  meesterbrein: { name: 'Meesterbrein', description: 'Kraak in Mastermind de code in 4 pogingen of minder (bij modern: 5).', icon: 'brain', category: 'spellen', tier: 'goud', metric: 'mastermindQuick', target: 1 },
  pokerface: { name: 'Pokerface', description: 'Win een potje Poker: pak alle fiches.', icon: 'coins', category: 'spellen', tier: 'zilver', metric: 'winsPoker', target: 1 },
  'full-house': { name: 'Full house', description: 'Win in Poker een pot met een full house of beter.', icon: 'award_star_gold_2', category: 'spellen', tier: 'goud', metric: 'pokerBestHand', target: 6 },
  kaartlegger: { name: 'Kaartlegger', description: 'Speel Patience uit.', icon: 'award_star_bronze_1', category: 'spellen', tier: 'brons', metric: 'winsSolitaire', target: 1 },
  mijnenveger: { name: 'Mijnenveger', description: 'Ruim een mijnenveld op zonder boem.', icon: 'flag_red', category: 'spellen', tier: 'brons', metric: 'winsMinesweeper', target: 1 },
  mijnenmeester: { name: 'Mijnenmeester', description: 'Ruim het Expert-veld van Mijnenveger op: 99 mijnen.', icon: 'bomb', category: 'spellen', tier: 'goud', metric: 'minesweeperExpert', target: 1 },
  schildpad: { name: 'Schildpad', description: 'Ruim in Mahjong de hele schildpad op.', icon: 'diamond', category: 'spellen', tier: 'zilver', metric: 'winsMahjong', target: 1 },
  bellenblazer: { name: 'Bellenblazer', description: 'Haal 10.000 punten in Bellen schieten.', icon: 'rainbow', category: 'spellen', tier: 'zilver', metric: 'bubbleScore', target: 10000 },
  stapelgek: { name: 'Stapelgek', description: 'Win een potje Stapelgek.', icon: 'note', category: 'spellen', tier: 'brons', metric: 'winsStapelgek', target: 1 },
  kleurwisselaar: { name: 'Kleurwisselaar', description: 'Win een potje Kleurwissel.', icon: 'color_wheel', category: 'spellen', tier: 'brons', metric: 'winsKleurwissel', target: 1 },
  zeebonk: { name: 'Zeebonk', description: 'Win een potje Yacht Dice.', icon: 'dice', category: 'spellen', tier: 'brons', metric: 'winsYacht', target: 1 },
  yacht: { name: 'Yacht!', description: 'Gooi in Yacht Dice vijf dezelfde en schrijf ze op.', icon: 'award_star_gold_1', category: 'spellen', tier: 'zilver', metric: 'yachtsRolled', target: 1 },
  driehonderd: { name: 'Driehonderd', description: 'Haal 300 punten of meer in Yacht Dice.', icon: 'medal_gold_1', category: 'spellen', tier: 'goud', metric: 'yachtScore', target: 300 },
  'volle-hand': { name: 'Met volle hand', description: 'Win Kleurwissel met 100 punten of meer.', icon: 'medal_gold_1', category: 'spellen', tier: 'goud', metric: 'kleurPoints', target: 100 },
  allrounder: { name: 'Allrounder', description: 'Win 5 verschillende spellen.', icon: 'cup_gold', category: 'spellen', tier: 'goud', metric: 'gameKindsWon', target: 5 },
  doorzetter: { name: 'Doorzetter', description: 'Speel 25 potjes.', icon: 'thumb_up', category: 'spellen', tier: 'zilver', metric: 'gamesPlayed', target: 25 },
  'eerste-tag': { name: 'Eerste tag', description: 'Spuit je eerste verf op de Graffitimuur.', icon: 'paintcan', category: 'spellen', tier: 'brons', metric: 'sprayCans', target: 1 },
  kleurenpalet: { name: 'Kleurenpalet', description: 'Probeer alle 10 gewone spuitbussen.', icon: 'color_wheel', category: 'spellen', tier: 'brons', metric: 'sprayBasic', target: 10 },
  glimmer: { name: 'Glimmer & glans', description: 'Probeer alle 10 speciale spuitbussen: goud, chroom, glitter…', icon: 'diamond', category: 'spellen', tier: 'zilver', metric: 'spraySpecial', target: 10 },
  'geheime-voorraad': { name: 'Geheime voorraad', description: 'Ontgrendel de geheime spuitbussen.', icon: 'key', category: 'spellen', tier: 'zilver', metric: 'sprayUnlocked', target: 1 },
  spuitmeester: { name: 'Spuitmeester', description: 'Spuit met alle 30 bussen, ook de 10 geheime.', icon: 'crown_gold', category: 'spellen', tier: 'goud', metric: 'sprayCans', target: 30 },
  'graffiti-crew': { name: 'Graffiti-crew', description: 'Spuit samen met een vriend op dezelfde muur.', icon: 'group', category: 'spellen', tier: 'zilver', metric: 'sprayTogether', target: 1 },
  straatkunstenaar: { name: 'Straatkunstenaar', description: 'Bewaar een foto van je graffiti.', icon: 'camera', category: 'spellen', tier: 'brons', metric: 'sprayPhotos', target: 1 },

  // Bejeweled 3: its badges, unlocked with the first (bronze) level
  'bj-inferno': { name: 'Inferno', description: 'Laat in Bejeweled 3 50 vuurjuwelen ontploffen.', icon: 'fire', category: 'bejeweled', tier: 'brons', metric: 'bj_inferno', target: 50 },
  'bj-stellar': { name: 'Stellar', description: 'Laat in Bejeweled 3 25 sterjuwelen ontploffen.', icon: 'star', category: 'bejeweled', tier: 'brons', metric: 'bj_stellar', target: 25 },
  'bj-chromatic': { name: 'Chromatic', description: 'Gebruik in Bejeweled 3 25 hyperkubussen.', icon: 'color_wheel', category: 'bejeweled', tier: 'brons', metric: 'bj_chromatic', target: 25 },
  'bj-blaster': { name: 'Blaster', description: 'Ruim in Bejeweled 3 30 juwelen op met één zet.', icon: 'bomb', category: 'bejeweled', tier: 'zilver', metric: 'bj_blaster', target: 30 },
  'bj-bejeweler': { name: 'Bejeweler', description: 'Haal 50.000 punten in Bejeweled 3 Classic.', icon: 'ruby', category: 'bejeweled', tier: 'brons', metric: 'bj_bejeweler', target: 50000 },
  'bj-finalfrenzy': { name: 'Final Frenzy', description: 'Haal 20.000 punten in de laatste ronde van Lightning.', icon: 'lightning', category: 'bejeweled', tier: 'zilver', metric: 'bj_finalfrenzy', target: 20000 },
  'bj-highvoltage': { name: 'High Voltage', description: 'Haal 100.000 punten in Lightning.', icon: 'lightning', category: 'bejeweled', tier: 'zilver', metric: 'bj_highvoltage', target: 100000 },
  'bj-anteup': { name: 'Ante Up', description: 'Haal 100.000 punten in Bejeweled 3 Poker.', icon: 'poker', category: 'bejeweled', tier: 'zilver', metric: 'bj_anteup', target: 100000 },
  'bj-gambler': { name: 'The Gambler', description: 'Maak 10 keer een Flush in Bejeweled 3 Poker.', icon: 'coins', category: 'bejeweled', tier: 'brons', metric: 'bj_gambler', target: 10 },
  'bj-glacial': { name: 'Glacial Explorer', description: 'Haal 100.000 punten in Ice Storm.', icon: 'weather_snow', category: 'bejeweled', tier: 'zilver', metric: 'bj_glacial', target: 100000 },
  'bj-icebreaker': { name: 'Ice Breaker', description: 'Breek 5 ijspilaren in één potje Ice Storm.', icon: 'weather_snow', category: 'bejeweled', tier: 'brons', metric: 'bj_icebreaker', target: 5 },
  'bj-diamondmine': { name: 'Diamond Mine', description: 'Haal 100.000 punten in Diamond Mine.', icon: 'diamond', category: 'bejeweled', tier: 'zilver', metric: 'bj_diamondmine', target: 100000 },
  'bj-relichunter': { name: 'Relic Hunter', description: 'Graaf 5 schatten op in één potje Diamond Mine.', icon: 'key', category: 'bejeweled', tier: 'zilver', metric: 'bj_relichunter', target: 5 },
  'bj-monarch': { name: 'Butterfly Monarch', description: 'Haal 100.000 punten in Butterflies.', icon: 'butterfly', category: 'bejeweled', tier: 'zilver', metric: 'bj_monarch', target: 100000 },
  'bj-bonanza': { name: 'Butterfly Bonanza', description: 'Bevrijd 4 vlinders met één zet in Butterflies.', icon: 'butterfly', category: 'bejeweled', tier: 'brons', metric: 'bj_bonanza', target: 4 },
  'bj-annihilator': { name: 'Annihilator', description: 'Wissel in Bejeweled 3 twee hyperkubussen met elkaar.', icon: 'bomb', category: 'bejeweled', tier: 'goud', metric: 'bj_annihilator', target: 1 },
  'bj-superstar': { name: 'Superstar', description: 'Maak in Bejeweled 3 een supernova: 6 of meer op een rij.', icon: 'award_star_gold_3', category: 'bejeweled', tier: 'goud', metric: 'bj_superstar', target: 1 },
  'bj-levelord': { name: 'Levelord', description: 'Haal level 10 in Bejeweled 3 Classic.', icon: 'crown_gold', category: 'bejeweled', tier: 'goud', metric: 'bj_levelord', target: 10 },

  // Sociaal
  'eerste-vriend': { name: 'Vriendschap', description: 'Maak je eerste vriend.', icon: 'user_add', category: 'sociaal', tier: 'brons', metric: 'friends', target: 1 },
  populair: { name: 'Populair', description: 'Heb 25 vrienden.', icon: 'star', category: 'sociaal', tier: 'zilver', metric: 'friends', target: 25 },
  bff: { name: 'BFF', description: 'Kies je beste vriend(in) op je profiel.', icon: 'star', category: 'sociaal', tier: 'brons', metric: 'bestFriends', target: 1 },
  tortelduifjes: { name: 'Tortelduifjes', description: 'Staat samen met je partner op Kuddes.', icon: 'heart', category: 'sociaal', tier: 'zilver', metric: 'hasPartner', target: 1 },
  knuffelaar: { name: 'Knuffelaar', description: 'Geef 10 knuffels.', icon: 'heart', category: 'sociaal', tier: 'brons', metric: 'knuffelsGiven', target: 10 },
  geliefd: { name: 'Geliefd', description: 'Krijg 25 knuffels.', icon: 'heart_add', category: 'sociaal', tier: 'zilver', metric: 'knuffelsReceived', target: 25 },
  kletskous: { name: 'Kletskous', description: 'Plaats 25 WieWatWaars.', icon: 'comment', category: 'sociaal', tier: 'brons', metric: 'statuses', target: 25 },
  fotograaf: { name: 'Fotograaf', description: "Upload 10 foto's.", icon: 'photo', category: 'sociaal', tier: 'brons', metric: 'photos', target: 10 },
  bekendheid: { name: 'Bekend gezicht', description: 'Je profiel is 100 keer bekeken.', icon: 'eye', category: 'sociaal', tier: 'zilver', metric: 'profileViews', target: 100 },
  gepimpt: { name: 'Gepimpt', description: 'Geef je profiel een eigen design of kleuren.', icon: 'paintcan', category: 'sociaal', tier: 'brons', metric: 'pimped', target: 1 },
  blogger: { name: 'Blogger', description: 'Schrijf je eerste blog.', icon: 'pencil', category: 'sociaal', tier: 'brons', metric: 'blogs', target: 1 },
  columnist: { name: 'Columnist', description: 'Schrijf 10 blogs.', icon: 'book_open', category: 'sociaal', tier: 'zilver', metric: 'blogs', target: 10 },
  ingelijst: { name: 'Ingelijst', description: 'Zet een lijstje om je profielfoto.', icon: 'photo', category: 'sociaal', tier: 'brons', metric: 'framed', target: 1 },

  // Kuddes & forum
  kuddedier: { name: 'Kuddedier', description: 'Word lid van 5 Kuddes.', icon: 'tag_blue', category: 'kuddes', tier: 'brons', metric: 'kuddes', target: 5 },
  oprichter: { name: 'Oprichter', description: 'Begin je eigen Kudde.', icon: 'flag_red', category: 'kuddes', tier: 'brons', metric: 'kuddesCreated', target: 1 },
  forumganger: { name: 'Forumganger', description: 'Schrijf 10 forumberichten.', icon: 'user_comment', category: 'kuddes', tier: 'brons', metric: 'forumPosts', target: 10 },
  forumlegende: { name: 'Forumlegende', description: 'Schrijf 250 forumberichten.', icon: 'award_star_gold_3', category: 'kuddes', tier: 'goud', metric: 'forumPosts', target: 250 },
  prikbordplakker: { name: 'Prikbordplakker', description: 'Plaats 10 berichten op het prikbord van een Kudde.', icon: 'note', category: 'kuddes', tier: 'brons', metric: 'kuddePosts', target: 10 },
  meeprater: { name: 'Meeprater', description: 'Reageer 25 keer op prikbordberichten.', icon: 'comment', category: 'kuddes', tier: 'zilver', metric: 'kuddeReplies', target: 25 },
  opiniepeiler: { name: 'Opiniepeiler', description: 'Start een poll op een Kudde.', icon: 'chart_bar', category: 'kuddes', tier: 'brons', metric: 'kuddePolls', target: 1 },
  peilingstation: { name: 'Peilingstation', description: 'Zet 5 polls in je WieWatWaars.', icon: 'chart_pie', category: 'kuddes', tier: 'zilver', metric: 'statusPolls', target: 5 },
  stemgerechtigd: { name: 'Stemgerechtigd', description: 'Stem in 10 polls op Kuddes.', icon: 'tick', category: 'kuddes', tier: 'brons', metric: 'kuddeVotes', target: 10 },
  binnenhuisarchitect: { name: 'Binnenhuisarchitect', description: 'Geef je Kudde een eigen design.', icon: 'palette', category: 'kuddes', tier: 'zilver', metric: 'kuddeDesigned', target: 1 },
  kuddeleider: { name: 'Kuddeleider', description: 'Beheer een Kudde met 25 leden of meer.', icon: 'group', category: 'kuddes', tier: 'goud', metric: 'kuddeMembersMax', target: 25 },

  // Koken & verzamelen
  thuiskok: { name: 'Thuiskok', description: 'Deel je eerste recept.', icon: 'cutlery', category: 'koken', tier: 'brons', metric: 'recipes', target: 1 },
  kookboek: { name: 'Kookboek', description: 'Deel 10 recepten.', icon: 'book', category: 'koken', tier: 'zilver', metric: 'recipes', target: 10 },
  sterrenchef: { name: 'Sterrenchef', description: 'Deel 25 recepten.', icon: 'crown_gold', category: 'koken', tier: 'goud', metric: 'recipes', target: 25 },
  'lekker-bezig': { name: 'Lekker bezig', description: 'Je recepten zijn samen 10 keer lekker gevonden.', icon: 'heart', category: 'koken', tier: 'zilver', metric: 'recipeLikes', target: 10 },
  publiekslieveling: { name: 'Publiekslieveling', description: 'Je recepten zijn samen 100 keer lekker gevonden.', icon: 'cup_gold', category: 'koken', tier: 'goud', metric: 'recipeLikes', target: 100 },
  smulpaap: { name: 'Smulpaap', description: 'Vind 10 recepten van anderen lekker.', icon: 'donut', category: 'koken', tier: 'brons', metric: 'recipesLiked', target: 10 },
  wereldkeuken: { name: 'Wereldkeuken', description: 'Deel recepten in 5 verschillende soorten gerechten.', icon: 'pizza', category: 'koken', tier: 'zilver', metric: 'recipeCategories', target: 5 },
  boekenwurm: { name: 'Boekenwurm', description: 'Zet 10 boeken in je boekenkast.', icon: 'book', category: 'koken', tier: 'brons', metric: 'shelfBooks', target: 10 },
  filmfanaat: { name: 'Filmfanaat', description: 'Zet 10 films in je filmrek.', icon: 'film', category: 'koken', tier: 'brons', metric: 'shelfMovies', target: 10 },
  platenverzamelaar: { name: 'Platenverzamelaar', description: 'Zet 10 albums in je platenkast.', icon: 'sound', category: 'koken', tier: 'brons', metric: 'shelfAlbums', target: 10 },
  gamer: { name: 'Gamer', description: 'Zet 10 spellen in je spellenkast.', icon: 'joystick', category: 'koken', tier: 'brons', metric: 'shelfGames', target: 10 },
  verzamelwoede: { name: 'Verzamelwoede', description: 'Zet in totaal 50 dingen in je kasten.', icon: 'award_star_gold_2', category: 'koken', tier: 'goud', metric: 'shelfItems', target: 50 },
  gadgetgek: { name: 'Gadgetgek', description: 'Zet 5 gadgets op je profiel.', icon: 'plugin', category: 'koken', tier: 'zilver', metric: 'gadgets', target: 5 },

  // Video & meer
  glitterfan: { name: 'Glitterfan', description: 'Stuur 10 knuffels met een glitterplaatje.', icon: 'rainbow', category: 'video', tier: 'brons', metric: 'glitterKnuffels', target: 10 },
  glitterkoning: { name: 'Glitterkoning', description: 'Upload 10 glitterplaatjes.', icon: 'crown_gold', category: 'video', tier: 'zilver', metric: 'glitters', target: 10 },
  regisseur: { name: 'Regisseur', description: 'Upload je eerste video.', icon: 'camcorder', category: 'video', tier: 'brons', metric: 'videos', target: 1 },
  kijkcijferkanon: { name: 'Kijkcijferkanon', description: "Je video's zijn samen 1.000 keer bekeken.", icon: 'television', category: 'video', tier: 'goud', metric: 'videoViews', target: 1000 },
  veteraan: { name: 'Veteraan', description: 'Een jaar lid van Kuddes.', icon: 'cake', category: 'video', tier: 'zilver', metric: 'memberDays', target: 365 },
  pionier: { name: 'Pionier', description: 'Een van de eerste 100 leden van Kuddes.', icon: 'rosette', category: 'video', tier: 'goud', metric: 'pioneer', target: 1 },
} as const satisfies Record<string, AchievementDef>

export type AchievementKey = keyof typeof ACHIEVEMENTS
export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS) as AchievementKey[]
export const isAchievementKey = (v: unknown): v is AchievementKey => typeof v === 'string' && v in ACHIEVEMENTS

export type AchievementProgress = { key: AchievementKey; unlockedAt: string | null; progress: number }

/** A member's achievements and game stats, as the page and the gadget get them. */
export type AchievementOverview = {
  achievements: AchievementProgress[]
  unlocked: number
  total: number
  stats: GameStats
}
