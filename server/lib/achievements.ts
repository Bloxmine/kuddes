import { ALL_SPRAY_CANS, SPRAY_CANS, type SpraySet } from '../../shared/spray'
import { and, count, countDistinct, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql, sum } from 'drizzle-orm'
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS, type AchievementKey, type AchievementMetric, type AchievementOverview } from '../../shared/achievements'
import { BEJEWELED_BADGE_KEYS, type BejeweledBadge } from '../../shared/bejeweled'
import type { GameStats } from '../../shared/games'
import { db } from '../db/client'
import { forumPosts, friendships, gadgets, gamePlayers, games, glitters, kuddeMembers, kuddePollVotes, kuddePostReplies, kuddePosts, kuddes, knuffels, photos, recipeLikes, recipes, relations, soloScores, sprayProgress, statuses, bejeweledProgress, blogs, userAchievements, users, videos } from '../db/schema'

/** Game stats from finished games: wins, streaks and records. */
export async function gameStats(userId: number): Promise<GameStats> {
  // Every finished game the member played in (to the end, or until they left)
  const rows = await db
    .select({ id: games.id, kind: games.kind, winnerId: games.winnerId, score: gamePlayers.score })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.userId, userId), inArray(gamePlayers.status, ['meedoen', 'weg']), eq(games.status, 'klaar')))
    .orderBy(desc(games.finishedAt))
    .limit(2000)
  const stats: GameStats = { played: rows.length, won: 0, lost: 0, drawn: 0, streak: 0, bestStreak: 0, bestScore: 0, opponents: 0 }
  // Everyone they played with
  const others = rows.length
    ? await db
        .selectDistinct({ userId: gamePlayers.userId })
        .from(gamePlayers)
        .where(and(inArray(gamePlayers.gameId, rows.map((r) => r.id)), ne(gamePlayers.userId, userId), inArray(gamePlayers.status, ['meedoen', 'weg'])))
    : []
  let run = 0
  let current = true
  // Newest first: the current streak is the run at the start, the best one anywhere
  for (const g of rows) {
    // Scores differ per game; the record is the Mancala one
    if (g.kind === 'mancala') stats.bestScore = Math.max(stats.bestScore, g.score)
    if (g.winnerId === userId) {
      stats.won++
      run++
      stats.bestStreak = Math.max(stats.bestStreak, run)
    } else {
      if (g.winnerId === null) stats.drawn++
      else stats.lost++
      if (current) stats.streak = run
      current = false
      run = 0
    }
  }
  if (current) stats.streak = run
  stats.opponents = others.length
  return stats
}

type Metrics = Record<AchievementMetric, number>

/** The best value of every highlight a member reached, per game ("dammen:kings" → 2). */
async function highlightMaxima(userId: number): Promise<Map<string, number>> {
  const rows = await db.execute<{ kind: string; key: string; best: number }>(sql`
    select g.kind, h.key, max((h.value)::text::numeric) as best
    from ${gamePlayers} p
      join ${games} g on g.id = p.game_id,
      jsonb_each(p.highlights) h
    where g.status = 'klaar' and p.user_id = ${userId} and p.highlights is not null
      and jsonb_typeof(p.highlights) = 'object' and jsonb_typeof(h.value) = 'number'
    group by g.kind, h.key`)
  return new Map([...rows].map((r) => [`${r.kind}:${r.key}`, Number(r.best)]))
}

async function metrics(userId: number): Promise<Metrics> {
  const one = <T extends { n: unknown }>(rows: T[]) => Number(rows[0]?.n ?? 0)
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) throw new Error(`no user ${userId}`)
  const [stats, highlights, crushing, friends, given, received, statusCount, photoCount, kuddeCount, created, posts, videoCount, views, earlier, glitterCount, glitterSent, winRows, relationRows] = await Promise.all([
    gameStats(userId),
    highlightMaxima(userId),
    db
      .select({ n: count() })
      .from(games)
      .where(
        and(
          eq(games.status, 'klaar'),
          eq(games.kind, 'mancala'),
          eq(games.winnerId, userId),
          sql`(case when ${games.hostId} = ${userId} then ${games.guestScore} else ${games.hostScore} end) <= 12`,
        ),
      ),
    db
      .select({ n: count() })
      .from(friendships)
      .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))),
    db.select({ n: count() }).from(knuffels).where(and(eq(knuffels.authorId, userId), ne(knuffels.profileId, userId))),
    db.select({ n: count() }).from(knuffels).where(and(eq(knuffels.profileId, userId), ne(knuffels.authorId, userId))),
    db.select({ n: count() }).from(statuses).where(eq(statuses.userId, userId)),
    db.select({ n: count() }).from(photos).where(eq(photos.userId, userId)),
    db.select({ n: count() }).from(kuddeMembers).where(and(eq(kuddeMembers.userId, userId), ne(kuddeMembers.role, 'pending'))),
    db.select({ n: count() }).from(kuddes).where(eq(kuddes.creatorId, userId)),
    db.select({ n: count() }).from(forumPosts).where(and(eq(forumPosts.userId, userId), isNull(forumPosts.deletedAt))),
    db.select({ n: count() }).from(videos).where(and(eq(videos.userId, userId), eq(videos.status, 'klaar'))),
    db.select({ n: sum(videos.views) }).from(videos).where(eq(videos.userId, userId)),
    // Members who joined before this one, not counting the admin's dummy accounts
    db.select({ n: countDistinct(users.id) }).from(users).where(and(lte(users.createdAt, user.createdAt), ne(users.id, userId), eq(users.isDummy, false), isNull(users.domain))),
    db.select({ n: count() }).from(glitters).where(eq(glitters.userId, userId)),
    db.select({ n: count() }).from(knuffels).where(and(eq(knuffels.authorId, userId), isNotNull(knuffels.glitterId))),
    db.select({ kind: games.kind, n: count() }).from(games).where(and(eq(games.status, 'klaar'), eq(games.winnerId, userId))).groupBy(games.kind),
    db.select({ kind: relations.kind, n: count() }).from(relations).where(and(eq(relations.userId, userId), eq(relations.status, 'accepted'))).groupBy(relations.kind),
  ])
  const [recipeRows, likedRows, gadgetRows, postRows, voteRows, replyRows, ownedKuddes, sprayRows, sprayGames, statusPollRows, soloRows, bejeweledRows, blogRows, expertRows] = await Promise.all([
    db.select({ n: count(), likes: sum(recipes.likes), kinds: countDistinct(recipes.category) }).from(recipes).where(eq(recipes.userId, userId)),
    db.select({ n: count() }).from(recipeLikes).innerJoin(recipes, eq(recipes.id, recipeLikes.recipeId)).where(and(eq(recipeLikes.userId, userId), ne(recipes.userId, userId))),
    db.select({ type: gadgets.type, config: gadgets.config, enabled: gadgets.enabled }).from(gadgets).where(eq(gadgets.userId, userId)),
    db.select({ n: count(), polls: count(kuddePosts.poll) }).from(kuddePosts).where(eq(kuddePosts.userId, userId)),
    db.select({ n: count() }).from(kuddePollVotes).where(eq(kuddePollVotes.userId, userId)),
    db.select({ n: count() }).from(kuddePostReplies).where(eq(kuddePostReplies.userId, userId)),
    db
      .select({ design: kuddes.design, members: sql<number>`(select count(*) from ${kuddeMembers} m where m.kudde_id = ${kuddes.id} and m.role <> 'pending')` })
      .from(kuddeMembers)
      .innerJoin(kuddes, eq(kuddes.id, kuddeMembers.kuddeId))
      .where(and(eq(kuddeMembers.userId, userId), eq(kuddeMembers.role, 'owner'))),
    db.select().from(sprayProgress).where(eq(sprayProgress.userId, userId)),
    // Graffiti sessions a friend accepted (they never "finish", they stop)
    db
      .select({ n: count() })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(eq(games.kind, 'spray'), isNotNull(games.startedAt), eq(gamePlayers.userId, userId), inArray(gamePlayers.status, ['meedoen', 'weg']))),
    db.select({ n: count() }).from(statuses).where(and(eq(statuses.userId, userId), isNotNull(statuses.poll))),
    // Games on your own: how often won, and the best score
    db
      .select({ kind: soloScores.kind, wins: sql<number>`count(*) filter (where ${soloScores.won})::int`, best: sql<number>`coalesce(max(${soloScores.score}), 0)::int` })
      .from(soloScores)
      .where(eq(soloScores.userId, userId))
      .groupBy(soloScores.kind),
    db.select({ badges: bejeweledProgress.badges }).from(bejeweledProgress).where(eq(bejeweledProgress.userId, userId)),
    db.select({ n: count() }).from(blogs).where(eq(blogs.userId, userId)),
    // Mijnenveger on Expert, won
    db.select({ n: count() }).from(soloScores).where(and(eq(soloScores.userId, userId), eq(soloScores.kind, 'mijnenveger'), eq(soloScores.won, true), sql`${soloScores.details}->>'level' = '2'`)),
  ])
  const solo = (kind: string) => soloRows.find((r) => r.kind === kind)
  const sprayed = (sprayRows[0]?.cans ?? []).filter((c) => ALL_SPRAY_CANS.includes(c))
  const sprayIn = (set: SpraySet) => sprayed.filter((c) => (SPRAY_CANS[set] as readonly string[]).includes(c)).length
  // Items on the shelves of the member's gadgets
  const shelf = (type: string, field: string) =>
    gadgetRows.filter((g) => g.type === type).reduce((n, g) => n + (((g.config as Record<string, unknown>)[field] as unknown[] | undefined)?.length ?? 0), 0)
  const shelves = { books: shelf('boeken', 'books'), movies: shelf('films', 'movies'), albums: shelf('platen', 'albums'), games: shelf('spellen', 'games') }
  const wins = (kind: string) => winRows.find((r) => r.kind === kind)?.n ?? 0
  const rel = (kind: string) => relationRows.find((r) => r.kind === kind)?.n ?? 0
  const hl = (kind: string, key: string) => highlights.get(`${kind}:${key}`) ?? 0
  return {
    gamesPlayed: stats.played,
    gamesWon: stats.won,
    bestStreak: stats.bestStreak,
    bestScore: stats.bestScore,
    bestCapture: hl('mancala', 'bestCapture'),
    longestChain: hl('mancala', 'longestChain'),
    crushingWins: one(crushing),
    opponents: stats.opponents,
    friends: one(friends),
    knuffelsGiven: one(given),
    knuffelsReceived: one(received),
    statuses: one(statusCount),
    photos: one(photoCount),
    profileViews: user.views,
    pimped: user.skin || user.theme || user.profileColors ? 1 : 0,
    kuddes: one(kuddeCount),
    kuddesCreated: one(created),
    forumPosts: one(posts),
    videos: one(videoCount),
    videoViews: one(views),
    memberDays: Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000),
    pioneer: !user.isDummy && one(earlier) < 100 ? 1 : 0,
    glitters: one(glitterCount),
    glitterKnuffels: one(glitterSent),
    winsVier: wins('vieropeenrij'),
    vierQuick: hl('vieropeenrij', 'quickWin'),
    vierDiagonal: hl('vieropeenrij', 'diagonalWin'),
    winsZeeslag: wins('zeeslag'),
    zeeslagSharp: hl('zeeslag', 'sharpWin'),
    winsDammen: wins('dammen'),
    dammenKings: hl('dammen', 'kings'),
    dammenCapture: hl('dammen', 'bestCapture'),
    winsQuiz: wins('quiz'),
    quizCorrect: hl('quiz', 'correct'),
    winsSchaken: wins('schaken'),
    chessPromotions: hl('schaken', 'promotions'),
    winsPool: wins('pool') + wins('pool9'),
    poolRun: Math.max(hl('pool', 'bestRun'), hl('pool9', 'bestRun')),
    poolBreakAndRun: Math.max(hl('pool', 'breakAndRun'), hl('pool9', 'breakAndRun')),
    winsMemory: wins('memory'),
    memoryStreak: hl('memory', 'streak'),
    winsMastermind: wins('mastermind') + wins('mastermind8'),
    // Rows left: classic has 10 (4 tries or fewer leaves 6), modern 12 (5 or fewer leaves 7)
    mastermindQuick: hl('mastermind', 'crackedLeft') >= 6 || hl('mastermind8', 'crackedLeft') >= 7 ? 1 : 0,
    winsPoker: wins('poker'),
    pokerBestHand: hl('poker', 'bestHand'),
    winsSolitaire: solo('patience')?.wins ?? 0,
    bubbleScore: solo('bellen')?.best ?? 0,
    winsMahjong: solo('mahjong')?.wins ?? 0,
    winsMinesweeper: solo('mijnenveger')?.wins ?? 0,
    minesweeperExpert: one(expertRows),
    winsStapelgek: wins('stapelgek'),
    winsKleurwissel: wins('kleurwissel'),
    kleurPoints: hl('kleurwissel', 'points'),
    winsYacht: wins('yacht'),
    yachtsRolled: hl('yacht', 'yachts'),
    yachtScore: hl('yacht', 'score'),
    gameKindsWon: winRows.filter((r) => r.n > 0).length,
    bestFriends: rel('beste_vriend'),
    hasPartner: rel('partner'),
    recipes: recipeRows[0]?.n ?? 0,
    recipeLikes: Number(recipeRows[0]?.likes ?? 0),
    recipeCategories: recipeRows[0]?.kinds ?? 0,
    recipesLiked: one(likedRows),
    shelfBooks: shelves.books,
    shelfMovies: shelves.movies,
    shelfAlbums: shelves.albums,
    shelfGames: shelves.games,
    shelfItems: shelves.books + shelves.movies + shelves.albums + shelves.games,
    gadgets: gadgetRows.filter((g) => g.enabled).length,
    kuddePosts: postRows[0]?.n ?? 0,
    kuddePolls: postRows[0]?.polls ?? 0,
    kuddeVotes: one(voteRows),
    kuddeReplies: one(replyRows),
    kuddeDesigned: ownedKuddes.some((k) => k.design) ? 1 : 0,
    kuddeMembersMax: Math.max(0, ...ownedKuddes.map((k) => Number(k.members))),
    framed: user.avatarFrame ? 1 : 0,
    sprayCans: sprayed.length,
    sprayBasic: sprayIn('basic'),
    spraySpecial: sprayIn('special'),
    spraySecret: sprayIn('secret'),
    sprayUnlocked: sprayIn('basic') === SPRAY_CANS.basic.length && sprayIn('special') === SPRAY_CANS.special.length ? 1 : 0,
    sprayTogether: one(sprayGames),
    sprayPhotos: sprayRows[0]?.photos ?? 0,
    statusPolls: one(statusPollRows),
    blogs: one(blogRows),
    // Bejeweled 3: how far you are with each of its badges
    ...(Object.fromEntries(BEJEWELED_BADGE_KEYS.map((k) => [`bj_${k}`, bejeweledRows[0]?.badges[k]?.value ?? 0])) as Record<`bj_${BejeweledBadge}`, number>),
  }
}

/** Last check per member, so looking at profiles doesn't count everything each time. */
const lastChecked = new Map<number, number>()
const CHECK_EVERY_MS = 2 * 60 * 1000

/** Checks right away after something that may earn one (a recipe, a poll…), without waiting on it. */
export function checkSoon(...userIds: number[]) {
  for (const id of userIds) checkAchievements(id, true).catch((e) => console.error('achievements', id, e))
}

/**
 * Hands out every achievement whose target is reached and returns the new
 * ones. `force` skips the throttle (after a game).
 */
export async function checkAchievements(userId: number, force = false): Promise<{ metrics: Metrics | null; unlocked: AchievementKey[] }> {
  const now = Date.now()
  if (!force && now - (lastChecked.get(userId) ?? 0) < CHECK_EVERY_MS) return { metrics: null, unlocked: [] }
  lastChecked.set(userId, now)
  if (lastChecked.size > 5000) lastChecked.clear()
  const m = await metrics(userId)
  const reached = ACHIEVEMENT_KEYS.filter((k) => m[ACHIEVEMENTS[k].metric] >= ACHIEVEMENTS[k].target)
  if (!reached.length) return { metrics: m, unlocked: [] }
  const inserted = await db
    .insert(userAchievements)
    .values(reached.map((key) => ({ userId, key })))
    .onConflictDoNothing()
    .returning({ key: userAchievements.key })
  return { metrics: m, unlocked: inserted.map((r) => r.key as AchievementKey) }
}

/** All achievements with progress, for the achievements page and the gadget. */
export async function achievementOverview(userId: number): Promise<AchievementOverview> {
  const { metrics: fresh } = await checkAchievements(userId)
  const [m, rows, stats] = await Promise.all([
    fresh ? Promise.resolve(fresh) : metrics(userId),
    db.select().from(userAchievements).where(eq(userAchievements.userId, userId)),
    gameStats(userId),
  ])
  const unlocked = new Map(rows.map((r) => [r.key, r.unlockedAt.toISOString()]))
  return {
    achievements: ACHIEVEMENT_KEYS.map((key) => ({
      key,
      unlockedAt: unlocked.get(key) ?? null,
      progress: Math.min(m[ACHIEVEMENTS[key].metric], ACHIEVEMENTS[key].target),
    })),
    unlocked: ACHIEVEMENT_KEYS.filter((k) => unlocked.has(k)).length,
    total: ACHIEVEMENT_KEYS.length,
    stats,
  }
}

/** Achievements the member hasn't seen the pop-up for yet; marks them as seen. */
export async function takeUnseenAchievements(userId: number): Promise<AchievementKey[]> {
  await checkAchievements(userId)
  const rows = await db
    .update(userAchievements)
    .set({ seenAt: new Date() })
    .where(and(eq(userAchievements.userId, userId), isNull(userAchievements.seenAt)))
    .returning({ key: userAchievements.key })
  return rows.map((r) => r.key).filter((k): k is AchievementKey => k in ACHIEVEMENTS)
}
