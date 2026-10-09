import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { AchievementKey, AchievementOverview } from '../../../shared/achievements'
import type { UserSummary } from '../../../shared/api'
import type { GameKind, GameStats, GameSummary } from '../../../shared/games'
import { api } from '../../lib/api'

export const gameKeys = {
  all: ['games'] as const,
  mine: ['games', 'mine'] as const,
  live: ['games', 'live'] as const,
  leaderboard: ['games', 'leaderboard'] as const,
  game: (id: number) => ['games', 'detail', id] as const,
  achievements: (username: string) => ['achievements', username] as const,
  userGames: (username: string) => ['games', 'user', username] as const,
}

export type MyGames = { incoming: GameSummary[]; outgoing: GameSummary[]; active: GameSummary[]; recent: GameSummary[]; stats: GameStats }

export const gameHref = (g: Pick<GameSummary, 'id' | 'kind'>) => `/spellen/${g.kind}/${g.id}`

export const useMyGames = () => useQuery({ queryKey: gameKeys.mine, queryFn: () => api<MyGames>('/games'), refetchInterval: 20_000 })

export const useLeaderboard = () => useQuery({ queryKey: gameKeys.leaderboard, queryFn: () => api<{ user: UserSummary; wins: number }[]>('/games/leaderboard') })

export const useAchievements = (username: string) =>
  useQuery({ queryKey: gameKeys.achievements(username), queryFn: () => api<AchievementOverview>(`/users/${encodeURIComponent(username)}/achievements`) })

export const useUserGames = (username: string) => useQuery({ queryKey: gameKeys.userGames(username), queryFn: () => api<GameSummary[]>(`/users/${encodeURIComponent(username)}/games`) })

/** New achievements, for the pop-ups. Only while the tab is visible. */
export const useLive = (enabled: boolean) =>
  useQuery({
    queryKey: gameKeys.live,
    queryFn: () => api<{ achievements: AchievementKey[] }>('/games/live'),
    enabled,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })

/** Challenge a friend (or play again) and go to the game. */
export function useChallenge() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    // One friend, or (for games with more players) up to three
    mutationFn: ({ kind, usernames }: { kind: GameKind; usernames: string[] }) => api<GameSummary>('/games', { method: 'POST', body: { kind, usernames } }),
    onSuccess: (game) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all })
      navigate(gameHref(game))
    },
  })
}

/** Who invited starts with whoever said yes so far. */
export function useStartGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (game: GameSummary) => api<GameSummary>(`/games/${game.id}/start`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gameKeys.all }),
  })
}

/** Accept or decline an invite. */
export function useAnswerInvite() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: ({ game, accept }: { game: GameSummary; accept: boolean }) =>
      accept ? api<GameSummary>(`/games/${game.id}/accept`, { method: 'POST' }) : api<void>(`/games/${game.id}/decline`, { method: 'POST' }).then(() => null),
    onSuccess: (game) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all })
      if (game) navigate(gameHref(game))
    },
  })
}
