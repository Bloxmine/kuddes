/**
 * What's going on on Kuddes right now, for Home: the smileys used in the last
 * 24 hours, and "Nu in Nederland" (the words and places in the WieWatWaars of
 * the last day, like on Hyves). Both are counted at most every few minutes.
 */
import { and, desc, eq, gt, ilike } from 'drizzle-orm'
import type { NowTerm, SmileyCount } from '../../shared/api'
import { SMILEY_PATTERN, smileyName } from '../../shared/smileys'
import { db } from '../db/client'
import { activityComments, blogs, chatMessages, forumPosts, knuffels, kuddePostReplies, kuddePosts, messengerLines, photos, statusPhotos, statuses, videoComments } from '../db/schema'
import { uploadUrl } from './serialize'

const CACHE_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** Rows per kind of text, newest first: enough to count, without reading everything on a busy day. */
const ROWS = 3000

function cached<T>(load: () => Promise<T>) {
  let value: { at: number; data: T } | null = null
  let pending: Promise<T> | null = null
  return async () => {
    if (value && Date.now() - value.at < CACHE_MS) return value.data
    pending ??= load()
      .then((data) => {
        value = { at: Date.now(), data }
        return data
      })
      .finally(() => (pending = null))
    return pending
  }
}

/** Smiley codes in a text, as smiley names. */
function smileysIn(text: string): string[] {
  const out: string[] = []
  const pattern = new RegExp(SMILEY_PATTERN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text))) {
    const name = smileyName(m[0])
    if (name) out.push(name)
    else pattern.lastIndex = m.index + 1
  }
  return out
}

/**
 * Every smiley typed on Kuddes in the last 24 hours: WieWatWaars, reactions,
 * knuffels, the forum and its chat, Kuddes, videos, blogs and the Messenger.
 * Only the counts leave the server, never who or where.
 */
export const smileysToday = cached(async (): Promise<SmileyCount[]> => {
  const since = new Date(Date.now() - DAY_MS)
  const texts = (await Promise.all([
    db.select({ t: statuses.text }).from(statuses).where(gt(statuses.createdAt, since)).orderBy(desc(statuses.id)).limit(ROWS),
    db.select({ t: activityComments.text }).from(activityComments).where(gt(activityComments.createdAt, since)).orderBy(desc(activityComments.id)).limit(ROWS),
    db.select({ t: knuffels.text }).from(knuffels).where(gt(knuffels.createdAt, since)).orderBy(desc(knuffels.id)).limit(ROWS),
    db.select({ t: forumPosts.body }).from(forumPosts).where(gt(forumPosts.createdAt, since)).orderBy(desc(forumPosts.id)).limit(ROWS),
    db.select({ t: chatMessages.text }).from(chatMessages).where(gt(chatMessages.createdAt, since)).orderBy(desc(chatMessages.id)).limit(ROWS),
    db.select({ t: kuddePosts.text }).from(kuddePosts).where(gt(kuddePosts.createdAt, since)).orderBy(desc(kuddePosts.id)).limit(ROWS),
    db.select({ t: kuddePostReplies.text }).from(kuddePostReplies).where(gt(kuddePostReplies.createdAt, since)).orderBy(desc(kuddePostReplies.id)).limit(ROWS),
    db.select({ t: videoComments.text }).from(videoComments).where(gt(videoComments.createdAt, since)).orderBy(desc(videoComments.id)).limit(ROWS),
    db.select({ t: blogs.body }).from(blogs).where(gt(blogs.createdAt, since)).orderBy(desc(blogs.id)).limit(ROWS),
    db.select({ t: messengerLines.text }).from(messengerLines).where(gt(messengerLines.createdAt, since)).orderBy(desc(messengerLines.id)).limit(ROWS),
  ])).flat()
  const counts = new Map<string, number>()
  for (const { t } of texts) for (const name of smileysIn(t)) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    // The six most used, like on Hyves
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))
})

// Words that say nothing about what's going on (Dutch and the English everyone mixes in)
const STOPWORDS = new Set(
  `aan aangezien achter af al alle alleen allemaal als altijd ander andere anders ben beetje bij bijna binnen boven daar daarna daarom dan dat de deze die dit doe doen door dus echt een eens eigenlijk en er even ga gaan gaat gedaan geen gehad geweest gewoon goed had hadden heb hebben hebt heeft heel hele hem hen het hier hij hoe hun iemand iets ik in is ja je jij jou jouw jullie kan kom komen komt kon kunnen kun maak maar me meer meteen mij mijn mn moet moeten mag morgen na naar natuurlijk nee niet niks nog nou nu of om omdat ondanks ons onze ook op over gisteren vandaag vanavond want wanneer waar waarom wat we weer wel welke werd wezen wie wij wil willen word worden wordt zal ze zei zelf zich zie zijn zit zo zoals zou zouden zullen zij zo'n zn ff effe weet toch alweer lekker leuk super heerlijk keer tijd dag dagen jaar week uur wel echt helemaal waarschijnlijk iedereen niemand niets alles mensen eerst laatste beste
  the and for that this with you your are was were have has had not but just like all get got what when out now can will would about from they them then than there here been being some more very really one also too into its it's i'm dont don't im lol omg haha hahaha xd`.split(/\s+/),
)

/** The words of a WieWatWaar worth counting: no links, mentions, numbers, smileys or little words. */
function wordsIn(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(new RegExp(SMILEY_PATTERN.source, 'g'), ' ')
    .split(/[^\p{L}\p{N}'-]+/u)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length >= 4 && w.length <= 24 && !/^\d+$/.test(w) && !STOPWORDS.has(w.toLowerCase()))
}

type Term = { term: string; key: string; authors: Set<number>; uses: number; spellings: Map<string, number> }

/**
 * "Nu in Nederland": what open WieWatWaars of the last day are about. A word
 * or place counts once per member, so one chatterbox can't fill the board;
 * with little going on it looks back a week.
 */
const trendingTerms = cached(async () => {
  for (const days of [1, 7]) {
    const rows = await db
      .select({ id: statuses.id, userId: statuses.userId, text: statuses.text, where: statuses.where })
      .from(statuses)
      .where(and(eq(statuses.visibility, 'iedereen'), gt(statuses.createdAt, new Date(Date.now() - days * DAY_MS))))
      .orderBy(desc(statuses.id))
      .limit(ROWS)
    const terms = new Map<string, Term>()
    const add = (word: string, userId: number) => {
      const key = word.toLocaleLowerCase('nl')
      const t = terms.get(key) ?? { term: word, key, authors: new Set(), uses: 0, spellings: new Map() }
      t.authors.add(userId)
      t.uses++
      t.spellings.set(word, (t.spellings.get(word) ?? 0) + 1)
      terms.set(key, t)
    }
    for (const r of rows) {
      for (const w of new Set(wordsIn(r.text))) add(w, r.userId)
      // "@ Efteling": a place counts as a whole
      const place = r.where?.trim()
      if (place && place.length >= 2 && place.length <= 30) add(place, r.userId)
    }
    const top = [...terms.values()]
      .sort((a, b) => b.authors.size - a.authors.size || b.uses - a.uses)
      .slice(0, 16)
      // Shown as it's written most often ("Ajax", not "ajax")
      .map((t) => ({ term: [...t.spellings].sort((a, b) => b[1] - a[1])[0][0], count: t.authors.size, uses: t.uses }))
    if (top.length >= 8 || days === 7) return top
  }
  return []
})

/** A photo for a term: from an open WieWatWaar about it, with a photo. */
async function photoFor(term: string): Promise<string | null> {
  const [row] = await db
    .select({ path: photos.path })
    .from(statuses)
    .innerJoin(statusPhotos, eq(statusPhotos.statusId, statuses.id))
    .innerJoin(photos, eq(photos.id, statusPhotos.photoId))
    .where(and(eq(statuses.visibility, 'iedereen'), ilike(statuses.text, `%${term.replace(/[%_\\]/g, '\\$&')}%`)))
    .orderBy(desc(statuses.id))
    .limit(1)
  return row ? uploadUrl(row.path) : null
}

const trendingWithPhotos = cached(async (): Promise<NowTerm[]> => {
  const terms = await trendingTerms()
  // Pictures for the biggest few tiles, like on Hyves
  const pics = await Promise.all(terms.slice(0, 6).map((t) => photoFor(t.term)))
  return terms.map((t, i) => ({ term: t.term, count: t.count, photoUrl: pics[i] ?? null }))
})

/** The tiles; photos are members' and only for members. */
export async function nowInNederland(member: boolean): Promise<NowTerm[]> {
  const terms = await trendingWithPhotos()
  return member ? terms : terms.map((t) => ({ ...t, photoUrl: null }))
}
