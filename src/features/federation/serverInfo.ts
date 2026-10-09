import { useQuery } from '@tanstack/react-query'
import type { ServerInfo } from '../../../shared/federation'
import { api } from '../../lib/api'

/** About this server (Beheer → Servers): its name, who runs it, how to reach them and its own rules. */
export function useServerInfo() {
  return useQuery({ queryKey: ['server'], queryFn: () => api<ServerInfo>('/server'), staleTime: 5 * 60 * 1000 }).data
}
