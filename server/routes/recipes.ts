import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  RECIPE_CATEGORIES,
  RECIPE_LEVELS,
  RECIPE_LIMITS,
  RECIPE_PHOTO,
  isRecipeCategory,
  recipeSlug,
  type Recipe,
  type RecipeCategory,
  type RecipeInput,
  type RecipeLevel,
  type RecipeList,
  type RecipeSummary,
} from '../../shared/recipes'
import { config } from '../config'
import { db } from '../db/client'
import { recipeLikes, recipes, users, type User } from '../db/schema'
import { recordActivity } from '../lib/activities'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { findUser, summaryColumns } from '../lib/users'
import { checkSoon } from '../lib/achievements'

type RecipeRow = typeof recipes.$inferSelect
type Row = { recipe: RecipeRow; user: Parameters<typeof toSummary>[0] }

const text = (max: number, label: string) => z.string().trim().max(max, `${label} mag maximaal ${max} tekens hebben.`)
const photo = z.string().regex(RECIPE_PHOTO, 'Upload de foto opnieuw.').nullable()

const recipeSchema = z.object({
  title: text(RECIPE_LIMITS.title, 'De naam').min(3, 'Geef je recept een naam.'),
  intro: text(RECIPE_LIMITS.intro, 'De inleiding'),
  category: z.enum(Object.keys(RECIPE_CATEGORIES) as [RecipeCategory], { message: 'Kies een soort gerecht.' }),
  level: z.enum(Object.keys(RECIPE_LEVELS) as [RecipeLevel]),
  minutes: z.number({ message: 'Vul de bereidingstijd in.' }).int().min(1, 'Vul de bereidingstijd in.').max(RECIPE_LIMITS.minutes, 'Dat is wel heel lang.'),
  servings: z.number({ message: 'Vul in voor hoeveel personen.' }).int().min(1, 'Vul in voor hoeveel personen.').max(RECIPE_LIMITS.servings),
  photo,
  ingredients: z
    .array(text(RECIPE_LIMITS.ingredient, 'Een ingrediënt'))
    .transform((list) => list.filter(Boolean))
    .pipe(z.array(z.string()).min(1, 'Zet er minstens één ingrediënt in.').max(RECIPE_LIMITS.ingredients, `Maximaal ${RECIPE_LIMITS.ingredients} ingrediënten.`)),
  steps: z
    .array(z.object({ text: text(RECIPE_LIMITS.step, 'Een stap'), photo }))
    .transform((list) => list.filter((s) => s.text || s.photo))
    .pipe(z.array(z.object({ text: z.string(), photo: z.string().nullable() })).min(1, 'Schrijf minstens één stap op.').max(RECIPE_LIMITS.steps, `Maximaal ${RECIPE_LIMITS.steps} stappen.`)),
  tips: text(RECIPE_LIMITS.tips, 'De tips'),
}) satisfies z.ZodType<RecipeInput, unknown>

/** The photos a recipe uses. */
const photosOf = (r: Pick<RecipeInput, 'photo' | 'steps'>) => [r.photo, ...r.steps.map((s) => s.photo)].filter((p): p is string => !!p)

/** Photos are named after the member who uploaded them; you can only use your own. */
function checkPhotos(input: RecipeInput, userId: number) {
  if (photosOf(input).some((p) => RECIPE_PHOTO.exec(p)?.[1] !== String(userId))) throw new HttpError(400, 'Je kunt alleen je eigen foto’s gebruiken.')
}

/**
 * Photos uploaded but never used in a recipe (a recipe that wasn't saved,
 * a photo that was replaced): removed once they're a day old.
 */
async function sweepPhotos(userId: number) {
  const dir = path.join(config.uploadDir, 'recipes')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.startsWith(`${userId}-`))
  if (!files.length) return
  const used = new Set((await db.select({ photo: recipes.photoPath, steps: recipes.steps }).from(recipes).where(eq(recipes.userId, userId))).flatMap((r) => photosOf({ photo: r.photo, steps: r.steps })))
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  await Promise.all(
    files
      .filter((f) => !used.has(`recipes/${f}`))
      .map(async (f) => {
        const s = await stat(path.join(dir, f)).catch(() => null)
        if (s && s.mtimeMs < dayAgo) await removeUpload(`recipes/${f}`)
      }),
  )
}

async function likedBy(viewer: User | null, ids: number[]) {
  if (!viewer || !ids.length) return new Set<number>()
  const rows = await db.select({ id: recipeLikes.recipeId }).from(recipeLikes).where(and(eq(recipeLikes.userId, viewer.id), inArray(recipeLikes.recipeId, ids)))
  return new Set(rows.map((r) => r.id))
}

function toSummaryRecipe({ recipe: r, user }: Row, liked: Set<number>): RecipeSummary {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: isRecipeCategory(r.category) ? r.category : 'overig',
    level: r.level in RECIPE_LEVELS ? (r.level as RecipeLevel) : 'makkelijk',
    minutes: r.minutes,
    servings: r.servings,
    photoUrl: uploadUrl(r.photoPath),
    likes: r.likes,
    liked: liked.has(r.id),
    user: toSummary(user),
    createdAt: r.createdAt.toISOString(),
  }
}

async function toRecipe(row: Row, viewer: User | null): Promise<Recipe> {
  const r = row.recipe
  return {
    ...toSummaryRecipe(row, await likedBy(viewer, [r.id])),
    intro: r.intro,
    photo: r.photoPath,
    ingredients: r.ingredients,
    steps: r.steps.map((s) => ({ ...s, photoUrl: uploadUrl(s.photo) })),
    tips: r.tips,
    canEdit: !!viewer && (viewer.id === r.userId || viewer.forumRole === 'admin'),
    updatedAt: r.updatedAt.toISOString(),
  }
}

const columns = ({ photo, ...input }: RecipeInput) => ({ ...input, slug: recipeSlug(input.title), photoPath: photo })

const selectRecipes = () => db.select({ recipe: recipes, user: summaryColumns }).from(recipes).innerJoin(users, eq(users.id, recipes.userId))

async function findRecipe(id: number) {
  const [row] = Number.isInteger(id) ? await selectRecipes().where(and(eq(recipes.id, id), sql`${users.blockedAt} is null`)) : []
  if (!row) throw notFound('Dit recept bestaat niet (meer).')
  return row
}

function mayEdit(me: User, r: RecipeRow) {
  if (r.userId !== me.id && me.forumRole !== 'admin') throw new HttpError(403, 'Dit is niet jouw recept.')
}

/** For the Recepten gadget: a member's own recipes and/or the ones they liked, newest first. */
export async function gadgetRecipes(userId: number, show: 'eigen' | 'lekker' | 'beide', limit: number, viewer: User | null): Promise<RecipeSummary[]> {
  const visible = sql`${users.blockedAt} is null`
  const own = show === 'lekker' ? [] : await selectRecipes().where(and(eq(recipes.userId, userId), visible)).orderBy(desc(recipes.id)).limit(limit)
  const liked =
    show === 'eigen' || own.length >= limit
      ? []
      : await db
          .select({ recipe: recipes, user: summaryColumns })
          .from(recipeLikes)
          .innerJoin(recipes, eq(recipes.id, recipeLikes.recipeId))
          .innerJoin(users, eq(users.id, recipes.userId))
          .where(and(eq(recipeLikes.userId, userId), visible))
          .orderBy(desc(recipeLikes.createdAt))
          .limit(limit)
  const rows = [...own, ...liked.filter((l) => !own.some((o) => o.recipe.id === l.recipe.id))].slice(0, limit)
  const likedByViewer = await likedBy(viewer, rows.map((r) => r.recipe.id))
  return rows.map((r) => toSummaryRecipe(r, likedByViewer))
}

export const recipeRoutes = new Hono<AppEnv>()
  // Browse: by category, one member's, your own or your favourites, search, newest or tastiest
  .get('/recipes', async (c) => {
    const viewer = c.get('user')
    const category = c.req.query('categorie')
    const filter = c.req.query('filter')
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const popular = c.req.query('sort') === 'populair'
    const perPage = Math.min(Number(c.req.query('limit')) || RECIPE_LIMITS.perPage, 48)

    const scope: (SQL | undefined)[] = [sql`${users.blockedAt} is null`]
    if (filter === 'mijn' || filter === 'favorieten') {
      if (!viewer) throw new HttpError(401, 'Je moet ingelogd zijn.')
      scope.push(
        filter === 'mijn'
          ? eq(recipes.userId, viewer.id)
          : inArray(recipes.id, db.select({ id: recipeLikes.recipeId }).from(recipeLikes).where(eq(recipeLikes.userId, viewer.id))),
      )
    }
    const author = c.req.query('van')
    if (author) scope.push(eq(recipes.userId, (await findUser(author)).id))
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      scope.push(or(ilike(recipes.title, like), sql`${recipes.ingredients}::text ilike ${like}`))
    }
    const inCategory = isRecipeCategory(category) ? eq(recipes.category, category) : undefined

    const countRows = await db
      .select({ category: recipes.category, n: count() })
      .from(recipes)
      .innerJoin(users, eq(users.id, recipes.userId))
      .where(and(...scope))
      .groupBy(recipes.category)
    const counts = Object.fromEntries([['alles', 0], ...Object.keys(RECIPE_CATEGORIES).map((k) => [k, 0])]) as RecipeList['counts']
    for (const r of countRows) {
      if (isRecipeCategory(r.category)) counts[r.category] = r.n
      counts.alles += r.n
    }
    const total = isRecipeCategory(category) ? counts[category] : counts.alles
    const pages = Math.max(1, Math.ceil(total / perPage))
    const page = Math.min(Math.max(1, Number(c.req.query('pagina')) || 1), pages)
    const rows = await selectRecipes()
      .where(and(...scope, inCategory))
      .orderBy(...(popular ? [desc(recipes.likes), desc(recipes.id)] : [desc(recipes.id)]))
      .limit(perPage)
      .offset((page - 1) * perPage)
    const liked = await likedBy(viewer, rows.map((r) => r.recipe.id))
    const result: RecipeList = { items: rows.map((r) => toSummaryRecipe(r, liked)), total, page, pages, counts }
    return c.json(result)
  })

  .get('/recipes/:id{[0-9]+}', async (c) => c.json(await toRecipe(await findRecipe(Number(c.req.param('id'))), c.get('user'))))

  // A photo for a recipe you're writing; it's only kept once a recipe uses it
  .post('/recipes/photos', bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, 'Die foto is te groot (max 8 MB).') } }), rateLimit('receptfoto’s', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const body = await c.req.parseBody()
    const stored = await storeImage(body.file, 'recipes', `${me.id}-`)
    return c.json({ path: stored.path, url: uploadUrl(stored.path) }, 201)
  })

  .post('/recipes', rateLimit('recepten', 20, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(recipeSchema, await c.req.json().catch(() => null))
    checkPhotos(input, me.id)
    const [row] = await db
      .insert(recipes)
      .values({ userId: me.id, ...columns(input) })
      .returning()
    await recordActivity({ type: 'recipe', actorId: me.id, recipeId: row.id })
    void sweepPhotos(me.id)
    checkSoon(me.id)
    return c.json(await toRecipe({ recipe: row, user: me }, me), 201)
  })

  .patch('/recipes/:id{[0-9]+}', rateLimit('recepten bewerken', 200, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { recipe: old, user } = await findRecipe(Number(c.req.param('id')))
    mayEdit(me, old)
    const input = parse(recipeSchema, await c.req.json().catch(() => null))
    // The admin can fix a recipe, but only with the photos that are already in it
    const kept = new Set(photosOf({ photo: old.photoPath, steps: old.steps }))
    if (photosOf(input).some((p) => !kept.has(p))) checkPhotos(input, old.userId)
    const [row] = await db
      .update(recipes)
      .set({ ...columns(input), updatedAt: new Date() })
      .where(eq(recipes.id, old.id))
      .returning()
    const used = new Set(photosOf(input))
    await Promise.all([...kept].filter((p) => !used.has(p)).map(removeUpload))
    return c.json(await toRecipe({ recipe: row, user }, me))
  })

  .delete('/recipes/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const { recipe } = await findRecipe(Number(c.req.param('id')))
    mayEdit(me, recipe)
    await db.delete(recipes).where(eq(recipes.id, recipe.id))
    await Promise.all(photosOf({ photo: recipe.photoPath, steps: recipe.steps }).map(removeUpload))
    return c.body(null, 204)
  })

  // "Lekker!"
  .post('/recipes/:id{[0-9]+}/like', rateLimit('lekker', 300, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { recipe } = await findRecipe(Number(c.req.param('id')))
    const likes = await db.transaction(async (tx) => {
      const added = await tx.insert(recipeLikes).values({ userId: me.id, recipeId: recipe.id }).onConflictDoNothing().returning()
      const [r] = added.length ? await tx.update(recipes).set({ likes: sql`${recipes.likes} + 1` }).where(eq(recipes.id, recipe.id)).returning({ likes: recipes.likes }) : [recipe]
      return r.likes
    })
    checkSoon(me.id, recipe.userId)
    return c.json({ likes, liked: true })
  })

  .delete('/recipes/:id{[0-9]+}/like', async (c) => {
    const me = requireUser(c)
    const { recipe } = await findRecipe(Number(c.req.param('id')))
    const likes = await db.transaction(async (tx) => {
      const removed = await tx.delete(recipeLikes).where(and(eq(recipeLikes.userId, me.id), eq(recipeLikes.recipeId, recipe.id))).returning()
      const [r] = removed.length ? await tx.update(recipes).set({ likes: sql`greatest(${recipes.likes} - 1, 0)` }).where(eq(recipes.id, recipe.id)).returning({ likes: recipes.likes }) : [recipe]
      return r.likes
    })
    return c.json({ likes, liked: false })
  })
