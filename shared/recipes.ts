/** Recepten (/recepten): members' own recipes with photos, to cook and share. */
import type { UserSummary } from './api'
import { slugify } from './forum'

export const RECIPE_CATEGORIES = {
  ontbijt: { name: 'Ontbijt & brunch', hint: 'eitjes & pannenkoeken', icon: 'cup' },
  lunch: { name: 'Lunch', hint: "broodjes & tosti's", icon: 'cheese' },
  hoofdgerecht: { name: 'Hoofdgerechten', hint: 'voor het avondeten', icon: 'cutlery' },
  soep: { name: 'Soepen', hint: 'warm & vullend', icon: 'soup' },
  salade: { name: 'Salades', hint: 'fris & gezond', icon: 'apple' },
  bijgerecht: { name: 'Bijgerechten', hint: 'friet & groente', icon: 'bread' },
  toetje: { name: 'Toetjes', hint: 'pudding & ijs', icon: 'icecream' },
  gebak: { name: 'Taart & gebak', hint: 'taarten & cupcakes', icon: 'cake' },
  koekjes: { name: 'Koekjes & snoep', hint: 'en andere zoetigheid', icon: 'cookies' },
  snacks: { name: 'Hapjes & snacks', hint: 'borrel & feestjes', icon: 'hamburger' },
  drankjes: { name: 'Drankjes', hint: 'smoothies & cocktails', icon: 'drink' },
  overig: { name: 'Overig', hint: 'van alles wat', icon: 'book' },
} as const satisfies Record<string, { name: string; hint: string; icon: string }>

export type RecipeCategory = keyof typeof RECIPE_CATEGORIES
export const isRecipeCategory = (v: unknown): v is RecipeCategory => typeof v === 'string' && v in RECIPE_CATEGORIES

export const RECIPE_LEVELS = { makkelijk: 'Makkelijk', gemiddeld: 'Gemiddeld', moeilijk: 'Voor gevorderden' } as const
export type RecipeLevel = keyof typeof RECIPE_LEVELS

export const RECIPE_LIMITS = {
  title: 80,
  intro: 600,
  ingredients: 40,
  ingredient: 120,
  steps: 25,
  step: 1200,
  tips: 600,
  minutes: 24 * 60,
  servings: 50,
  perPage: 12,
}

/**
 * Photos are uploaded one by one first (POST /recepten/fotos) and then used
 * in a recipe; their file names start with the member's id, so you can only
 * use your own.
 */
export const RECIPE_PHOTO = /^recipes\/(\d+)-[0-9a-f]{32}\.webp$/

export type RecipeStep = { text: string; photo: string | null }

/** What the editor sends; photos are upload paths (recipes/…). */
export type RecipeInput = {
  title: string
  intro: string
  category: RecipeCategory
  level: RecipeLevel
  minutes: number
  servings: number
  photo: string | null
  ingredients: string[]
  steps: RecipeStep[]
  tips: string
}

export type RecipeSummary = {
  id: number
  /** For the URL: /recepten/<id>-<slug>. */
  slug: string
  title: string
  category: RecipeCategory
  level: RecipeLevel
  minutes: number
  servings: number
  photoUrl: string | null
  likes: number
  liked: boolean
  user: UserSummary
  createdAt: string
}

export type Recipe = RecipeSummary & {
  intro: string
  /** Upload paths, for the editor. */
  photo: string | null
  ingredients: string[]
  steps: (RecipeStep & { photoUrl: string | null })[]
  tips: string
  canEdit: boolean
  updatedAt: string
}

export type RecipeList = {
  items: RecipeSummary[]
  total: number
  page: number
  pages: number
  counts: Record<RecipeCategory | 'alles', number>
}

export const recipeHref = (r: { id: number; slug: string }) => `/recepten/${r.id}-${r.slug}`

/** "hutspot-met-klapstuk" from "Hutspot met klapstuk!" */
export const recipeSlug = (title: string) => (slugify(title) === 'onderwerp' && !/onderwerp/i.test(title) ? 'recept' : slugify(title))

/** "1 uur 15 min" */
export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} uur ${m} min` : `${h} uur`
}
