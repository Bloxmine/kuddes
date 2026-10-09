import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Me } from '../../../shared/api'
import type { Preferences } from '../../../shared/customization'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'

/** PATCH /me and keep the cached member and profile in sync. */
export function useUpdateMe() {
  const { setUser } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    // Preferences are merged on the server, so a few of them is enough
    mutationFn: (changes: Omit<Partial<Me>, 'preferences'> & { preferences?: Partial<Preferences> }) => api<Me>('/me', { method: 'PATCH', body: changes }),
    onSuccess: (me) => {
      setUser(me)
      queryClient.invalidateQueries({ queryKey: keys.profile(me.username) })
    },
  })
}
