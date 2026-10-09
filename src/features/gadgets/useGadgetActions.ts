import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Gadget } from '../../../shared/api'
import type { GadgetConfig, GadgetType } from '../../../shared/gadgets'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'

type Changes = { title?: string; enabled?: boolean; config?: GadgetConfig[GadgetType] }

/** Add, change and remove your own gadgets, keeping the profile's cached list in step. */
export function useGadgetActions(username: string) {
  const queryClient = useQueryClient()
  const key = keys.gadgets(username)
  const put = (gadget: Gadget) =>
    queryClient.setQueryData<Gadget[]>(key, (list = []) =>
      list.some((g) => g.id === gadget.id) ? list.map((g) => (g.id === gadget.id ? gadget : g)) : [...list, gadget],
    )

  return {
    create: useMutation({
      mutationFn: (type: GadgetType) => api<Gadget>('/me/gadgets', { method: 'POST', body: { type } }),
      onSuccess: put,
    }),
    update: useMutation({
      mutationFn: ({ id, ...changes }: Changes & { id: number }) => api<Gadget>(`/me/gadgets/${id}`, { method: 'PATCH', body: changes }),
      // Show the change right away (notes are edited in place); undo it if saving fails
      onMutate: async ({ id, ...changes }) => {
        await queryClient.cancelQueries({ queryKey: key })
        const previous = queryClient.getQueryData<Gadget[]>(key)
        queryClient.setQueryData<Gadget[]>(key, (list = []) => list.map((g) => (g.id === id ? ({ ...g, ...changes } as Gadget) : g)))
        return { previous }
      },
      onError: (_, __, context) => context?.previous && queryClient.setQueryData(key, context.previous),
      onSuccess: put,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(`/me/gadgets/${id}`, { method: 'DELETE' }),
      onSuccess: (_, id) => queryClient.setQueryData<Gadget[]>(key, (list = []) => list.filter((g) => g.id !== id)),
    }),
  }
}
