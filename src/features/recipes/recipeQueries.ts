import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RECIPE_CATEGORIES, type Recipe, type RecipeCategory, type RecipeInput, type RecipeList } from '../../../shared/recipes'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api } from '../../lib/api'
import { compressImage } from '../../lib/compressImage'

export type RecipeFilter = 'alles' | 'mijn' | 'favorieten'
export type RecipeQuery = { category: RecipeCategory | null; filter: RecipeFilter; q: string; sort: 'nieuwste' | 'populair'; page: number; by?: string; limit?: number }

export const recipeKeys = {
  all: ['recipes'] as const,
  list: (q: RecipeQuery) => ['recipes', 'list', q] as const,
  one: (id: number) => ['recipes', 'one', id] as const,
}

export function useRecipes(query: RecipeQuery, enabled = true) {
  const params = new URLSearchParams()
  if (query.category) params.set('categorie', query.category)
  if (query.filter !== 'alles') params.set('filter', query.filter)
  if (query.q) params.set('q', query.q)
  if (query.by) params.set('van', query.by)
  if (query.sort === 'populair') params.set('sort', 'populair')
  if (query.page > 1) params.set('pagina', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  return useQuery({
    queryKey: recipeKeys.list(query),
    queryFn: () => api<RecipeList>(`/recipes?${params}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useRecipe(id: number) {
  return useQuery({ queryKey: recipeKeys.one(id), queryFn: () => api<Recipe>(`/recipes/${id}`), enabled: Number.isInteger(id) && id > 0, retry: false })
}

/** "Lekker!" or not. */
export function useLike(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (like: boolean) => api<{ likes: number; liked: boolean }>(`/recipes/${id}/like`, { method: like ? 'POST' : 'DELETE' }),
    onSuccess: (r) => {
      queryClient.setQueryData<Recipe>(recipeKeys.one(id), (old) => (old ? { ...old, ...r } : old))
      queryClient.invalidateQueries({ queryKey: ['recipes', 'list'] })
    },
  })
}

export function useSaveRecipe(id: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecipeInput) => api<Recipe>(id ? `/recipes/${id}` : '/recipes', { method: id ? 'PATCH' : 'POST', body: input }),
    onSuccess: (r) => {
      queryClient.setQueryData(recipeKeys.one(r.id), r)
      queryClient.invalidateQueries({ queryKey: ['recipes', 'list'] })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  })
}

/** Uploads a photo for a recipe; it's kept once the recipe is saved with it. */
export async function uploadRecipePhoto(file: File) {
  const form = new FormData()
  form.set('file', await compressImage(file, 1600))
  return api<{ path: string; url: string }>('/recipes/photos', { method: 'POST', form })
}

export const categoryIcon = (c: RecipeCategory) => RECIPE_CATEGORIES[c].icon as FarmIconName
