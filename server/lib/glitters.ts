import { inArray } from 'drizzle-orm'
import type { GlitterImage } from '../../shared/glitters'
import { db } from '../db/client'
import { glitters } from '../db/schema'
import { uploadUrl } from './serialize'

/** The glitterplaatje of a knuffel, as the page shows it. */
export const glitterImage = (g: typeof glitters.$inferSelect | null): GlitterImage | null =>
  g ? { id: g.id, title: g.title, url: uploadUrl(g.path)!, width: g.width, height: g.height } : null

/** The glitterplaatjes of a page of WieWatWaars, by id. */
export async function glittersFor(ids: (number | null)[]): Promise<Map<number, GlitterImage>> {
  const wanted = [...new Set(ids.filter((x): x is number => x !== null))]
  if (!wanted.length) return new Map()
  const rows = await db.select().from(glitters).where(inArray(glitters.id, wanted))
  return new Map(rows.map((g) => [g.id, glitterImage(g)!]))
}
