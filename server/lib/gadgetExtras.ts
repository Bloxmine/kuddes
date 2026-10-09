/**
 * What the newer gadgets show besides their settings: the Virtueel huisdier's
 * needs, the Forumberichten, the glitterplaatjes in the Glitterplakboek and
 * the Spelscores. Used by server/routes/gadgets.ts.
 */
import { and, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { GadgetForum, GadgetGlitters, GadgetPet, GadgetScores, GameTally } from '../../shared/api'
import { GAMES, type GameKind } from '../../shared/games'
import { LIMITS, PET_ACTIONS, PET_COINS, PET_COOLDOWN_HOURS, PET_HOURS, petItemKind, petItemPrice, type GadgetConfig, type PetAction } from '../../shared/gadgets'
import { db } from '../db/client'
import { forumPosts, forumProfiles, forumReactions, forumSections, forumThreads, gadgetPets, gadgets, gamePlayers, games, glitterCollection, glitters, petCare, users, type User } from '../db/schema'
import { toGlitters } from '../routes/glitters'
import { plainText } from './seo'
import { toSummary } from './serialize'
import { summaryColumns } from './users'

type GadgetRow = typeof gadgets.$inferSelect
const HOUR = 60 * 60 * 1000
export const PET_ACTION_KEYS = Object.keys(PET_ACTIONS) as PetAction[]
const PET_COLUMN = { voeren: 'fedAt', aaien: 'pettedAt', spelen: 'playedAt' } as const

/** Pets sleep from 23:00 to 7:00, Dutch time. */
export function petSleeping(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('nl-NL', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Amsterdam' }).format(now))
  return hour >= 23 || hour < 7
}

export async function gadgetPet(g: GadgetRow, viewer: User | null): Promise<GadgetPet> {
  const now = Date.now()
  const [[row], carers, mine] = await Promise.all([
    db.select().from(gadgetPets).where(eq(gadgetPets.gadgetId, g.id)),
    db.select({ action: petCare.action, at: petCare.at, user: summaryColumns }).from(petCare).innerJoin(users, eq(users.id, petCare.userId)).where(eq(petCare.gadgetId, g.id)).orderBy(desc(petCare.at)).limit(6),
    viewer ? db.select({ action: petCare.action, at: petCare.at }).from(petCare).where(and(eq(petCare.gadgetId, g.id), eq(petCare.userId, viewer.id))) : Promise.resolve([]),
  ])
  // A new pet starts with every need full
  const since = (a: PetAction) => (row ? row[PET_COLUMN[a]].getTime() : g.createdAt.getTime())
  const needs = Object.fromEntries(PET_ACTION_KEYS.map((a) => [a, Math.max(0, Math.round(100 - ((now - since(a)) / HOUR / PET_HOURS[a]) * 100))])) as Record<PetAction, number>
  const care = row?.care ?? 0
  const nextAt = Object.fromEntries(
    PET_ACTION_KEYS.map((a) => {
      const last = mine.find((m) => m.action === a)?.at.getTime()
      return [a, last && last + PET_COOLDOWN_HOURS * HOUR > now ? new Date(last + PET_COOLDOWN_HOURS * HOUR).toISOString() : null]
    }),
  ) as Record<PetAction, string | null>
  return {
    needs,
    sleeping: petSleeping(),
    stage: care < 15 ? 'baby' : care < 60 ? 'jong' : 'volwassen',
    care,
    ageDays: Math.floor((now - g.createdAt.getTime()) / (24 * HOUR)),
    carers: carers.map((c) => ({ user: toSummary(c.user), action: c.action as PetAction, at: c.at.toISOString() })),
    nextAt,
    coins: row?.coins ?? 0,
    unlocked: row?.unlocked ?? [],
  }
}

/** Feeding, petting or playing: fills that need and counts as care. Returns an error message, or null. */
export async function carePet(g: GadgetRow, member: User, action: PetAction): Promise<string | null> {
  const name = (g.config as GadgetConfig['huisdier']).name || 'Het huisdier'
  if (petSleeping()) return `Sst… ${name} slaapt. Kom morgen na 7 uur terug!`
  const [done] = await db.select({ at: petCare.at }).from(petCare).where(and(eq(petCare.gadgetId, g.id), eq(petCare.userId, member.id), eq(petCare.action, action)))
  if (done && done.at.getTime() + PET_COOLDOWN_HOURS * HOUR > Date.now()) {
    const left = Math.ceil((done.at.getTime() + PET_COOLDOWN_HOURS * HOUR - Date.now()) / 60000)
    return `${name} heeft dat net al van je gehad. Probeer het over ${left >= 60 ? `${Math.ceil(left / 60)} uur` : `${left} minuten`} nog eens.`
  }
  const now = new Date()
  const coins = member.id === g.userId ? PET_COINS.owner : PET_COINS.visitor
  await db.transaction(async (tx) => {
    await tx
      .insert(petCare)
      .values({ gadgetId: g.id, userId: member.id, action, at: now })
      .onConflictDoUpdate({ target: [petCare.gadgetId, petCare.userId, petCare.action], set: { at: now } })
    // A pet without a row yet was full at the start: keep the other needs from then
    await tx
      .insert(gadgetPets)
      .values({ gadgetId: g.id, fedAt: g.createdAt, pettedAt: g.createdAt, playedAt: g.createdAt, [PET_COLUMN[action]]: now, care: 1, coins })
      .onConflictDoUpdate({ target: gadgetPets.gadgetId, set: { [PET_COLUMN[action]]: now, care: sql`${gadgetPets.care} + 1`, coins: sql`${gadgetPets.coins} + ${coins}` } })
  })
  return null
}

/** Whether the owner may wear or show this: free, or bought. */
export async function petOwns(gadgetId: number, item: string) {
  if (petItemPrice(item) === 0) return true
  const [row] = await db.select({ unlocked: gadgetPets.unlocked }).from(gadgetPets).where(eq(gadgetPets.gadgetId, gadgetId))
  return !!row?.unlocked.includes(item)
}

/** The pet shop: buy a background or hat with the pet's coins (and put it on), or use one bought before. */
export async function petShop(g: GadgetRow, item: string, buy: boolean): Promise<string | null> {
  const kind = petItemKind(item)
  const price = petItemPrice(item)
  if (!kind || price === null) return 'Dat is niet te koop.'
  if (buy && price > 0) {
    // Only when there are enough coins, and not twice
    const [paid] = await db
      .update(gadgetPets)
      .set({ coins: sql`${gadgetPets.coins} - ${price}`, unlocked: sql`array_append(${gadgetPets.unlocked}, ${item})` })
      .where(and(eq(gadgetPets.gadgetId, g.id), sql`${gadgetPets.coins} >= ${price}`, sql`not (${item} = any(${gadgetPets.unlocked}))`))
      .returning({ id: gadgetPets.gadgetId })
    if (!paid) return (await petOwns(g.id, item)) ? null : 'Daar heb je nog niet genoeg munten voor. Laat je huisdier verzorgen om munten te verdienen!'
  } else if (!(await petOwns(g.id, item))) return 'Koop dit eerst in de winkel.'
  const config = { ...(g.config as GadgetConfig['huisdier']), [kind]: item }
  await db.update(gadgets).set({ config }).where(eq(gadgets.id, g.id))
  return null
}

export async function gadgetForum(g: GadgetRow): Promise<GadgetForum> {
  const cfg = g.config as GadgetConfig['forum']
  const limit = Math.min(cfg.count, LIMITS.forumItems)
  const livePost = and(eq(forumPosts.userId, g.userId), isNull(forumPosts.deletedAt))
  const [[profile], [posts], [threads], [reactions], items] = await Promise.all([
    db.select({ title: forumProfiles.title }).from(forumProfiles).where(eq(forumProfiles.userId, g.userId)),
    db.select({ n: count() }).from(forumPosts).where(livePost),
    db.select({ n: count() }).from(forumThreads).where(eq(forumThreads.userId, g.userId)),
    db
      .select({ n: count() })
      .from(forumReactions)
      .innerJoin(forumPosts, eq(forumPosts.id, forumReactions.postId))
      .where(and(livePost, ne(forumReactions.userId, g.userId))),
    cfg.show === 'onderwerpen'
      ? db
          .select({ thread: forumThreads, section: { slug: forumSections.slug, name: forumSections.name } })
          .from(forumThreads)
          .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
          .where(eq(forumThreads.userId, g.userId))
          .orderBy(desc(forumThreads.createdAt))
          .limit(limit)
          .then((rows) =>
            rows.map((r) => ({
              threadId: r.thread.id,
              title: r.thread.title,
              section: r.section.slug,
              sectionName: r.section.name,
              postId: null,
              excerpt: '',
              at: r.thread.createdAt.toISOString(),
              replies: Math.max(0, r.thread.postCount - 1),
            })),
          )
      : db
          .select({ post: { id: forumPosts.id, body: forumPosts.body, createdAt: forumPosts.createdAt }, thread: { id: forumThreads.id, title: forumThreads.title, postCount: forumThreads.postCount }, section: { slug: forumSections.slug, name: forumSections.name } })
          .from(forumPosts)
          .innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId))
          .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
          .where(livePost)
          .orderBy(desc(forumPosts.id))
          .limit(limit)
          .then((rows) =>
            rows.map((r) => ({
              threadId: r.thread.id,
              title: r.thread.title,
              section: r.section.slug,
              sectionName: r.section.name,
              postId: r.post.id,
              excerpt: plainText(r.post.body, 140),
              at: r.post.createdAt.toISOString(),
              replies: Math.max(0, r.thread.postCount - 1),
            })),
          ),
  ])
  return { title: profile?.title ?? '', posts: posts.n, threads: threads.n, reactions: reactions.n, items }
}

/** Whether every picked glitterplaatje is in the owner's collection or their own upload. */
export async function ownGlitters(ownerId: number, ids: number[]) {
  if (!ids.length) return true
  const [own, collected] = await Promise.all([
    db.select({ id: glitters.id }).from(glitters).where(and(eq(glitters.userId, ownerId), inArray(glitters.id, ids))),
    db.select({ id: glitterCollection.glitterId }).from(glitterCollection).where(and(eq(glitterCollection.userId, ownerId), inArray(glitterCollection.glitterId, ids))),
  ])
  const ok = new Set([...own, ...collected].map((r) => r.id))
  return ids.every((id) => ok.has(id))
}

export async function gadgetGlitters(g: GadgetRow, viewer: User | null): Promise<GadgetGlitters> {
  const cfg = g.config as GadgetConfig['plakboek']
  const pick = { glitter: glitters, user: summaryColumns }
  if (cfg.source === 'gekozen') {
    if (!cfg.picked.length) return { total: 0, items: [] }
    const rows = await db.select(pick).from(glitters).innerJoin(users, eq(users.id, glitters.userId)).where(inArray(glitters.id, cfg.picked))
    const ordered = cfg.picked.flatMap((id) => rows.filter((r) => r.glitter.id === id))
    return { total: ordered.length, items: await toGlitters(ordered, viewer) }
  }
  if (cfg.source === 'uploads') {
    const [[{ n }], rows] = await Promise.all([
      db.select({ n: count() }).from(glitters).where(eq(glitters.userId, g.userId)),
      db.select(pick).from(glitters).innerJoin(users, eq(users.id, glitters.userId)).where(eq(glitters.userId, g.userId)).orderBy(desc(glitters.id)).limit(LIMITS.scrapbook),
    ])
    return { total: n, items: await toGlitters(rows, viewer) }
  }
  const [[{ n }], rows] = await Promise.all([
    db.select({ n: count() }).from(glitterCollection).where(eq(glitterCollection.userId, g.userId)),
    db
      .select(pick)
      .from(glitterCollection)
      .innerJoin(glitters, eq(glitters.id, glitterCollection.glitterId))
      .innerJoin(users, eq(users.id, glitters.userId))
      .where(eq(glitterCollection.userId, g.userId))
      .orderBy(desc(glitterCollection.createdAt))
      .limit(LIMITS.scrapbook),
  ])
  return { total: n, items: await toGlitters(rows, viewer) }
}

/** Games with a winner (the Graffitimuur has none). */
const SCORED = (Object.keys(GAMES) as GameKind[]).filter((k) => k !== 'spray')
const tally = (): GameTally => ({ played: 0, won: 0, lost: 0, drawn: 0 })
const add = (t: GameTally, result: 'winst' | 'verlies' | 'gelijk') => {
  t.played++
  if (result === 'winst') t.won++
  else if (result === 'verlies') t.lost++
  else t.drawn++
}

export async function gadgetScores(g: GadgetRow): Promise<GadgetScores> {
  const cfg = g.config as GadgetConfig['spelscores']
  const kinds = cfg.kinds.length ? SCORED.filter((k) => cfg.kinds.includes(k)) : SCORED
  const rows = await db
    .select({ id: games.id, kind: games.kind, winnerId: games.winnerId, at: games.finishedAt })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.userId, g.userId), inArray(gamePlayers.status, ['meedoen', 'weg']), eq(games.status, 'klaar'), inArray(games.kind, kinds)))
    .orderBy(desc(games.finishedAt))
    .limit(2000)
  const others = rows.length
    ? await db
        .select({ gameId: gamePlayers.gameId, user: summaryColumns })
        .from(gamePlayers)
        .innerJoin(users, eq(users.id, gamePlayers.userId))
        .where(and(inArray(gamePlayers.gameId, rows.map((r) => r.id)), ne(gamePlayers.userId, g.userId), inArray(gamePlayers.status, ['meedoen', 'weg'])))
    : []
  const opponentsOf = new Map<number, (typeof others)[number]['user'][]>()
  for (const o of others) opponentsOf.set(o.gameId, [...(opponentsOf.get(o.gameId) ?? []), o.user])

  const total = { ...tally(), streak: 0, bestStreak: 0 }
  const perKind = new Map<GameKind, GameTally>()
  const vs = new Map<number, GameTally>()
  let run = 0
  let current = true
  // Newest first: the current streak is the run at the start
  for (const r of rows) {
    const result = r.winnerId === g.userId ? 'winst' : r.winnerId === null ? 'gelijk' : 'verlies'
    add(total, result)
    const kind = r.kind as GameKind
    if (!perKind.has(kind)) perKind.set(kind, tally())
    add(perKind.get(kind)!, result)
    if (result === 'winst') {
      run++
      total.bestStreak = Math.max(total.bestStreak, run)
    } else {
      if (current) total.streak = run
      current = false
      run = 0
    }
    // The rival: one against one only
    const opp = opponentsOf.get(r.id) ?? []
    if (opp.length === 1) {
      if (!vs.has(opp[0].id)) vs.set(opp[0].id, tally())
      add(vs.get(opp[0].id)!, result)
    }
  }
  if (current) total.streak = run
  const [rivalId, rivalTally] = [...vs].sort((a, b) => b[1].played - a[1].played)[0] ?? []
  const rivalUser = rivalId ? others.find((o) => o.user.id === rivalId)?.user : undefined

  return {
    total,
    kinds: [...perKind].map(([kind, t]) => ({ kind, ...t })).sort((a, b) => b.played - a.played),
    recent: cfg.recent
      ? rows.slice(0, 5).map((r) => ({
          id: r.id,
          kind: r.kind as GameKind,
          result: r.winnerId === g.userId ? 'winst' : r.winnerId === null ? 'gelijk' : 'verlies',
          opponents: (opponentsOf.get(r.id) ?? []).map(toSummary),
          at: (r.at ?? new Date()).toISOString(),
        }))
      : [],
    rival: rivalUser && rivalTally && rivalTally.played >= 3 ? { user: toSummary(rivalUser), ...rivalTally } : null,
  }
}
