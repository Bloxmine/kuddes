import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Me } from '../../shared/api'
import { api } from './api'
import { keys } from './queries'

type Credentials = { username: string; password: string }
type Registration = { username: string; email: string; password: string; name: string; reason?: string; captcha?: string; privacy: boolean; oldEnough: boolean }

/** The logged-in member (null when logged out) plus login/register/logout. */
export function useAuth() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: keys.me, queryFn: () => api<Me | null>('/auth/me'), staleTime: 30_000 })

  // Logging in or out changes what almost every query returns
  const reset = (user: Me | null) => {
    queryClient.setQueryData(keys.me, user)
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
  }

  const login = useMutation({
    mutationFn: (input: Credentials) => api<Me>('/auth/login', { method: 'POST', body: input }),
    onSuccess: reset,
  })
  const register = useMutation({
    mutationFn: (input: Registration) => api<Me>('/auth/register', { method: 'POST', body: input }),
    onSuccess: reset,
  })
  const logout = useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => reset(null),
  })

  return {
    user: me.data ?? null,
    /**
     * Not let in yet: logged in, but until you confirm your address (or, on
     * the waitlist, the admin approves you) you see what a visitor sees and
     * can only change your own account (the API answers the rest as for a
     * visitor; server/index.ts). `user.awaitingApproval` says which.
     */
    waiting: !!me.data && !me.data.emailVerified,
    /**
     * Waiting for the confirmation mail (not the waitlist): until they click
     * the link it's the site as for a visitor, without even their own profile
     * or settings; only their e-mail address and deleting the account.
     */
    unconfirmed: !!me.data && !me.data.emailVerified && !me.data.awaitingApproval,
    isLoading: me.isLoading,
    login,
    register,
    logout,
    /** Replace the cached member after a settings change. */
    setUser: (user: Me) => queryClient.setQueryData(keys.me, user),
  }
}
