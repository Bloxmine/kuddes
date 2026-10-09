import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { useAuth } from '../../lib/auth'

/** Renders children for logged-in members; sends everyone else to the login page. */
export function RequireAuth({ children }: { children: (user: Me) => ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <main className="page page-con muted">Laden…</main>
  if (!user) return <Navigate to={`/inloggen?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children(user)}</>
}
