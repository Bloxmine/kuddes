import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { Me, Profile, SavedLayout } from '../../shared/api'
import {
  DEFAULT_HOME_LAYOUT,
  DEFAULT_PROFILE_LAYOUT,
  HOME_BOXES,
  PROFILE_BOXES,
  normalizeLayout,
  type BoxLayout,
  type HomeBox,
  type ProfileBox,
} from '../../shared/customization'
import { gadgetSlot, type GadgetSlot } from '../../shared/gadgets'
import { api, errorMessage } from './api'
import { useAuth } from './auth'
import { keys } from './queries'

/** A box on the profile: one of the standard ones or a gadget. */
export type ProfileSlot = ProfileBox | GadgetSlot

/** The profile layout with these gadgets in it; new gadgets go at the bottom of the right column. */
export function profileLayoutOf(stored: BoxLayout<string> | null | undefined, gadgetIds: number[] = []): BoxLayout<ProfileSlot> {
  const slots = gadgetIds.map(gadgetSlot)
  const defaults: BoxLayout<ProfileSlot> = {
    columns: DEFAULT_PROFILE_LAYOUT.columns.map((col, i) => (i === 2 ? [...col, ...slots] : [...col])),
    hidden: [],
  }
  const known: ProfileSlot[] = [...(Object.keys(PROFILE_BOXES) as ProfileBox[]), ...slots]
  return normalizeLayout(stored, defaults, known)
}

export const homeLayoutOf = (stored: BoxLayout<string> | null | undefined) =>
  normalizeLayout(stored, DEFAULT_HOME_LAYOUT, Object.keys(HOME_BOXES) as HomeBox[])

/** The column a box sits in by default, where it goes back when un-hidden. */
export const defaultColumnOf =
  <K extends string>(defaults: BoxLayout<K>) =>
  (key: K) =>
    Math.max(0, defaults.columns.findIndex((c) => c.includes(key)))

/** After a look changes, the profile (skin, layout) has to be refetched too. */
function useSetMe() {
  const { setUser } = useAuth()
  const queryClient = useQueryClient()
  return (me: Me) => {
    setUser(me)
    // Show the new look right away, then refetch the rest
    queryClient.setQueryData<Profile>(keys.profile(me.username), (p) =>
      p && { ...p, skin: me.skin, profileColors: me.profileColors, layout: me.profileLayout },
    )
    queryClient.invalidateQueries({ queryKey: keys.profile(me.username) })
  }
}

/**
 * Arranging the boxes on your profile or Home: a draft while editing, saved
 * to your account with "Opslaan".
 */
export function useLayoutEditor<K extends string>(kind: 'profile' | 'home', stored: BoxLayout<K>, resetLayout?: BoxLayout<K>) {
  const setMe = useSetMe()
  const [draft, setDraft] = useState<BoxLayout<K> | null>(null)
  const field = kind === 'profile' ? 'profileLayout' : 'homeLayout'
  // "Standaard": the default layout, with any gadgets at the bottom of the right column
  const defaults = (kind === 'profile' ? DEFAULT_PROFILE_LAYOUT : DEFAULT_HOME_LAYOUT) as unknown as BoxLayout<K>
  const resetTo = resetLayout ?? defaults

  // Stable while the stored layout doesn't change, so it can be used in effects
  const storedJson = JSON.stringify(stored)
  const start = useCallback(() => setDraft(JSON.parse(storedJson) as BoxLayout<K>), [storedJson])

  const save = useMutation({
    mutationFn: (layout: BoxLayout<K> | null) => api<Me>('/me', { method: 'PATCH', body: { [field]: layout } }),
    onSuccess: (me) => {
      setMe(me)
      setDraft(null)
    },
  })

  return {
    layout: draft ?? stored,
    editing: draft !== null,
    dirty: draft !== null && JSON.stringify(draft) !== JSON.stringify(stored),
    start,
    change: setDraft,
    cancel: () => {
      setDraft(null)
      save.reset()
    },
    reset: () => setDraft(resetTo),
    /** A new box (a gadget just added) at the bottom of a column of the layout being edited. */
    add: (key: K, column: number) =>
      setDraft((d) => (d && !d.columns.some((c) => c.includes(key)) ? { ...d, columns: d.columns.map((c, i) => (i === column ? [...c, key] : c)) } : d)),
    save: () => draft && save.mutate(JSON.stringify(draft) === JSON.stringify(resetTo) ? null : draft),
    saving: save.isPending,
    error: save.isError ? errorMessage(save.error) : null,
  }
}

const layoutsKey = ['me', 'layouts'] as const

export function useSavedLayouts(enabled = true) {
  return useQuery({ queryKey: layoutsKey, queryFn: () => api<SavedLayout[]>('/me/layouts'), enabled })
}

/** Save, rename, overwrite, delete and switch between saved looks. */
export function useSavedLayoutActions() {
  const queryClient = useQueryClient()
  const setMe = useSetMe()
  const refresh = () => queryClient.invalidateQueries({ queryKey: layoutsKey })

  return {
    create: useMutation({
      mutationFn: (name: string) => api<SavedLayout>('/me/layouts', { method: 'POST', body: { name } }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: number; name?: string; overwrite?: boolean }) =>
        api<SavedLayout>(`/me/layouts/${id}`, { method: 'PATCH', body }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(`/me/layouts/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    apply: useMutation({
      mutationFn: (id: number) => api<Me>(`/me/layouts/${id}/apply`, { method: 'POST' }),
      onSuccess: setMe,
    }),
  }
}
