import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import type {
  Birthday,
  ChatChannel,
  ForumIndex,
  ForumProfile,
  ForumProfileComment,
  ForumSectionPage,
  ForumThreadPage,
  ForumThreadSummary,
  VideoCommentPage,
  VideoDetail,
  VideoSummary,
  KuddeCategoryCounts,
  KuddeEvent,
  KuddeEventDetail,
  Gadget,
  Message,
  MessageBox,
  MessageSummary,
  Kudde,
  KuddeDetail,
  HomeData,
  NewsDetail,
  Suggestion,
  Knuffel,
  Page,
  Photo,
  Profile,
  SiteStats,
  Social,
  Status,
  TimelineItem,
  UserSummary,
} from '../../shared/api'
import type { PhotoAlbum } from '../../shared/photography'
import { api } from './api'
import type { OwnedKudde } from '../../shared/kuddeGadgets'

/** Query keys in one place so mutations know what to invalidate. */
export const keys = {
  me: ['me'] as const,
  notifications: ['notifications'] as const,
  home: ['home'] as const,
  stats: ['stats'] as const,
  kuddes: (sort: string) => ['kuddes', sort] as const,
  allKuddes: ['kuddes'] as const,
  kudde: (slug: string) => ['kuddes', 'detail', slug] as const,
  allEvents: ['events'] as const,
  allVideos: ['videos'] as const,
  allForum: ['forum'] as const,
  video: (id: string) => ['videos', 'detail', id] as const,
  event: (id: number) => ['events', 'detail', id] as const,
  userKuddes: (username: string) => ['profile', username, 'kuddes'] as const,
  suggestions: ['suggestions'] as const,
  news: (slug: string) => ['news', slug] as const,
  recentPhotos: ['photos', 'recent'] as const,
  statuses: (q: string, before: number | null) => ['statuses', q, before] as const,
  allStatuses: ['statuses'] as const,
  profile: (username: string) => ['profile', username] as const,
  userStatuses: (username: string) => ['profile', username, 'statuses'] as const,
  friends: (username: string) => ['profile', username, 'friends'] as const,
  photos: (username: string) => ['profile', username, 'photos'] as const,
  albums: (username: string) => ['profile', username, 'albums'] as const,
  knuffels: (username: string) => ['profile', username, 'knuffels'] as const,
  visitors: (username: string) => ['profile', username, 'visitors'] as const,
  gadgets: (username: string) => ['profile', username, 'gadgets'] as const,
  friendRequests: ['friendRequests'] as const,
  timeline: (tab: string, scope = 'iedereen') => ['timeline', tab, scope] as const,
  allTimeline: ['timeline'] as const,
  onlineFriends: ['friends', 'online'] as const,
  birthdays: ['friends', 'birthdays'] as const,
  allMessages: ['messages'] as const,
  messages: (box: string, q: string) => ['messages', 'list', box, q] as const,
  message: (id: number) => ['messages', 'detail', id] as const,
  messageCounts: ['messages', 'counts'] as const,
  search: (q: string) => ['search', q] as const,
}

export type FriendRequests = {
  incoming: { user: UserSummary; createdAt: string }[]
  outgoing: { user: UserSummary; createdAt: string }[]
}

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: () => api<HomeData>('/home'), refetchInterval: 60_000 })

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: () => api<SiteStats>('/stats'), staleTime: 60_000 })

export type KuddeFilters = { category?: string; sub?: string; q?: string }

export const useKuddes = (sort: 'populair' | 'nieuwste' | 'az', limit = 50, filters: KuddeFilters = {}) =>
  useQuery({
    queryKey: [...keys.kuddes(sort), limit, filters],
    queryFn: () => {
      const params = new URLSearchParams({ sort, limit: String(limit) })
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v)
      return api<Kudde[]>(`/kuddes?${params}`)
    },
  })

export const useKuddeCategories = () =>
  useQuery({ queryKey: [...keys.allKuddes, 'categories'], queryFn: () => api<KuddeCategoryCounts>('/kuddes/categories'), staleTime: 60_000 })

export const useKuddeEvent = (id: number) =>
  useQuery({ queryKey: keys.event(id), queryFn: () => api<KuddeEventDetail>(`/events/${id}`), retry: false })

export type AgendaQuery = { view: 'mijn' | 'populair'; from: string; to: string; category?: string; sort?: 'datum' | 'drukst'; limit?: number }

export const useAgenda = (query: AgendaQuery) =>
  useQuery({
    queryKey: [...keys.allEvents, 'agenda', query],
    queryFn: () => {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v))
      return api<KuddeEvent[]>(`/agenda?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useMyEvents = (enabled: boolean) =>
  useQuery({ queryKey: [...keys.allEvents, 'mine'], queryFn: () => api<KuddeEvent[]>('/me/events'), enabled })

/** The Kuddes you run. */
export const useOwnedKuddes = (enabled = true) => useQuery({ queryKey: ['me', 'owned-kuddes'], queryFn: () => api<OwnedKudde[]>('/me/owned-kuddes'), enabled, staleTime: 60_000 })

export const useKudde = (slug: string) =>
  useQuery({ queryKey: keys.kudde(slug), queryFn: () => api<KuddeDetail>(`/kuddes/${encodeURIComponent(slug)}`) })

export const useUserKuddes = (username: string) =>
  useQuery({ queryKey: keys.userKuddes(username), queryFn: () => api<Kudde[]>(`/users/${encodeURIComponent(username)}/kuddes`) })

export const useSuggestions = (limit = 50) =>
  useQuery({ queryKey: [...keys.suggestions, limit], queryFn: () => api<Suggestion[]>(`/suggestions?limit=${limit}`) })

export const useNews = (slug: string) =>
  useQuery({ queryKey: keys.news(slug), queryFn: () => api<NewsDetail>(`/news/${encodeURIComponent(slug)}`) })

export const useRecentPhotos = () =>
  useQuery({ queryKey: keys.recentPhotos, queryFn: () => api<Photo[]>('/photos/recent?limit=25') })

export const useProfile = (username: string) =>
  useQuery({ queryKey: keys.profile(username), queryFn: () => api<Profile>(`/users/${encodeURIComponent(username)}`), retry: false })

export const useUserStatuses = (username: string, limit = 5) =>
  useQuery({
    queryKey: keys.userStatuses(username),
    queryFn: () => api<Page<Status>>(`/users/${encodeURIComponent(username)}/statuses?limit=${limit}`),
  })

/** All of a member's WieWatWaars, newest first, a page at a time (the "WieWatWaars" tab on a profile). */
export const useAllUserStatuses = (username: string) =>
  useInfiniteQuery({
    // Under the profile's key, so posting or deleting one refreshes this list too
    queryKey: [...keys.userStatuses(username), 'alle'],
    queryFn: ({ pageParam }) =>
      api<Page<Status>>(`/users/${encodeURIComponent(username)}/statuses?limit=15${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

export const useFriends = (username: string) =>
  useQuery({ queryKey: keys.friends(username), queryFn: () => api<UserSummary[]>(`/users/${encodeURIComponent(username)}/friends`) })

export const usePhotos = (username: string) =>
  useQuery({ queryKey: keys.photos(username), queryFn: () => api<Photo[]>(`/users/${encodeURIComponent(username)}/photos`) })

export const useAlbums = (username: string) =>
  useQuery({ queryKey: keys.albums(username), queryFn: () => api<PhotoAlbum[]>(`/users/${encodeURIComponent(username)}/albums`) })

/** A profile's knuffels, newest first, 20 at a time ("Meer knuffels bekijken" loads the next). */
export const useKnuffels = (username: string) =>
  useInfiniteQuery({
    queryKey: keys.knuffels(username),
    queryFn: ({ pageParam }) => api<Page<Knuffel>>(`/users/${encodeURIComponent(username)}/knuffels${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

export const useVisitors = (username: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.visitors(username),
    queryFn: () => api<(UserSummary & { visitedAt: string })[]>(`/users/${encodeURIComponent(username)}/visitors`),
    enabled,
  })

export const useFriendRequests = (enabled: boolean) =>
  useQuery({ queryKey: keys.friendRequests, queryFn: () => api<FriendRequests>('/friends/requests'), enabled })

export const useSearch = (q: string) =>
  useQuery({
    queryKey: keys.search(q),
    queryFn: () => api<UserSummary[]>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  })

export const useTimeline = (tab: string, scope: 'iedereen' | 'vrienden' = 'iedereen') =>
  useInfiniteQuery({
    queryKey: keys.timeline(tab, scope),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (tab !== 'alles') params.set('tab', tab)
      if (scope === 'vrienden') params.set('van', 'vrienden')
      if (pageParam) params.set('before', String(pageParam))
      return api<Page<TimelineItem>>(`/timeline?${params}`)
    },
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 30_000,
  })

export const useOnlineFriends = (enabled: boolean) =>
  useQuery({
    queryKey: keys.onlineFriends,
    queryFn: () => api<UserSummary[]>('/friends/online'),
    enabled,
    refetchInterval: 60_000,
  })

/**
 * After respecting or reacting, the server returns the item's new respect
 * and reactions. Patch every cached list that contains that item, so the
 * timeline, the homepage and profiles all agree without refetching.
 */
export function patchSocial(queryClient: QueryClient, social: Social) {
  const patchItem = <T extends { activityId: number }>(item: T): T =>
    item.activityId === social.activityId ? { ...item, ...social } : item
  const patchPage = (page: unknown) => {
    const p = page as Page<{ activityId: number }> | undefined
    return p?.items ? { ...p, items: p.items.map(patchItem) } : page
  }

  queryClient.setQueriesData({ queryKey: keys.allTimeline }, (data: unknown) => {
    const d = data as { pages: unknown[] } | undefined
    return d?.pages ? { ...d, pages: d.pages.map(patchPage) } : data
  })
  queryClient.setQueriesData({ queryKey: keys.allStatuses }, patchPage)
  queryClient.setQueriesData(
    { predicate: (q) => q.queryKey[0] === 'profile' && q.queryKey[2] === 'statuses' },
    patchPage,
  )
  // A blog carries its respect and reactions as `social`
  queryClient.setQueriesData({ queryKey: ['blogs', 'detail'] }, (data: unknown) => {
    const blog = data as { social?: Social; respectCount: number; commentCount: number } | undefined
    return blog?.social?.activityId === social.activityId ? { ...blog, social, respectCount: social.respect.count, commentCount: social.commentCount } : data
  })
}

export const useBirthdays = (enabled: boolean) =>
  useQuery({ queryKey: keys.birthdays, queryFn: () => api<Birthday[]>('/friends/birthdays'), enabled, staleTime: 10 * 60_000 })

export type MessageCounts = { unread: number; concepten: number }

export const useMessageCounts = (enabled: boolean) =>
  useQuery({
    queryKey: keys.messageCounts,
    queryFn: () => api<MessageCounts>('/messages/counts'),
    enabled,
    refetchInterval: 30_000,
  })

export const useMessages = (box: MessageBox, q: string) =>
  useInfiniteQuery({
    queryKey: keys.messages(box, q),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ box })
      if (q) params.set('q', q)
      if (pageParam) params.set('before', String(pageParam))
      return api<Page<MessageSummary>>(`/messages?${params}`)
    },
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: box === 'inbox' ? 30_000 : false,
  })

export const useMessage = (id: number | null) =>
  useQuery({ queryKey: keys.message(id ?? 0), queryFn: () => api<Message>(`/messages/${id}`), enabled: !!id, retry: false })

export const useGadgets = (username: string, enabled = true) =>
  useQuery({ queryKey: keys.gadgets(username), queryFn: () => api<Gadget[]>(`/users/${encodeURIComponent(username)}/gadgets`), enabled })

export type VideoListQuery = { sort?: string; category?: string; tag?: string; q?: string; limit?: number }

export const useVideoList = (query: VideoListQuery) =>
  useInfiniteQuery({
    queryKey: [...keys.allVideos, 'list', query],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v))
      if (pageParam) params.set('offset', String(pageParam))
      return api<Page<VideoSummary>>(`/videos?${params}`)
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
  })

export const useRecommendedVideos = (limit = 8) =>
  useQuery({ queryKey: [...keys.allVideos, 'aanbevolen', limit], queryFn: () => api<VideoSummary[]>(`/videos/aanbevolen?limit=${limit}`) })

export const useVideoCategories = () =>
  useQuery({ queryKey: [...keys.allVideos, 'categorieen'], queryFn: () => api<Record<string, number>>('/videos/categorieen'), staleTime: 60_000 })

/** Polls while the video is still being uploaded or processed. */
export const useVideo = (id: string) =>
  useQuery({
    queryKey: keys.video(id),
    queryFn: () => api<VideoDetail>(`/videos/${encodeURIComponent(id)}`),
    enabled: !!id,
    retry: false,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'verwerken' || q.state.data.status === 'uploaden') ? 3000 : false),
  })

export const useRelatedVideos = (id: string) =>
  useQuery({ queryKey: [...keys.video(id), 'related'], queryFn: () => api<VideoSummary[]>(`/videos/${encodeURIComponent(id)}/related`), enabled: !!id })

export const useVideoComments = (id: string) =>
  useInfiniteQuery({
    queryKey: [...keys.video(id), 'comments'],
    queryFn: ({ pageParam }) => api<VideoCommentPage>(`/videos/${encodeURIComponent(id)}/comments${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!id,
  })

/** Who a video channel belongs to: public, unlike the profile. */
export const useChannelOwner = (username: string) =>
  useQuery({
    queryKey: [...keys.allVideos, 'kanaal', username, 'eigenaar'],
    queryFn: () => api<{ user: UserSummary; createdAt: string; bannerUrl: string | null; bannerY: number; description: string; featured: string | null }>(`/users/${encodeURIComponent(username)}/channel`),
    retry: false,
  })

export const useChannelVideos = (username: string, tab: 'uploads' | 'favorieten' = 'uploads') =>
  useQuery({
    queryKey: [...keys.allVideos, 'kanaal', username, tab],
    queryFn: () => api<VideoSummary[]>(`/users/${encodeURIComponent(username)}/videos?tab=${tab}`),
    enabled: !!username,
  })

export const useForumIndex = () => useQuery({ queryKey: [...keys.allForum, 'index'], queryFn: () => api<ForumIndex>('/forum'), refetchInterval: 60_000 })

export const useForumRecent = (limit = 8) =>
  useQuery({ queryKey: [...keys.allForum, 'recent', limit], queryFn: () => api<ForumThreadSummary[]>(`/forum/recent?limit=${limit}`) })

export const useForumSection = (slug: string, page: number) =>
  useQuery({
    queryKey: [...keys.allForum, 'section', slug, page],
    queryFn: () => api<ForumSectionPage>(`/forum/sections/${encodeURIComponent(slug)}?pagina=${page}`),
    retry: false,
    placeholderData: (previous) => previous,
  })

export const useForumThread = (id: number, page: number, postId: number | null) =>
  useQuery({
    queryKey: [...keys.allForum, 'thread', id, page, postId],
    queryFn: () => api<ForumThreadPage>(`/forum/threads/${id}?${postId ? `bericht=${postId}` : `pagina=${page}`}`),
    enabled: id > 0,
    retry: false,
    placeholderData: (previous) => previous,
  })

export const useForumSearch = (q: string, tag: string, member = '') =>
  useQuery({
    queryKey: [...keys.allForum, 'search', q, tag, member],
    queryFn: () => api<ForumThreadSummary[]>(`/forum/search?${new URLSearchParams({ q, tag, lid: member })}`),
    enabled: !!(q || tag || member),
  })

export const useForumProfile = (username: string) =>
  useQuery({ queryKey: [...keys.allForum, 'profile', username], queryFn: () => api<ForumProfile>(`/forum/users/${encodeURIComponent(username)}`), retry: false })

export const useForumProfileComments = (username: string) =>
  useInfiniteQuery({
    queryKey: [...keys.allForum, 'profile', username, 'comments'],
    queryFn: ({ pageParam }) => api<Page<ForumProfileComment>>(`/forum/users/${encodeURIComponent(username)}/comments${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

export const useModeratedSections = (enabled: boolean) =>
  useQuery({ queryKey: [...keys.allForum, 'moderated'], queryFn: () => api<{ slug: string; name: string }[]>('/forum/moderated'), enabled })

export const useChatChannels = () =>
  useQuery({ queryKey: [...keys.allForum, 'chat', 'channels'], queryFn: () => api<ChatChannel[]>('/chat/channels'), refetchInterval: 15_000 })

export const useForumThreadSummary = (id: number) =>
  useQuery({ queryKey: [...keys.allForum, 'thread-summary', id], queryFn: () => api<ForumThreadSummary>(`/forum/threads/${id}/summary`), retry: false, enabled: id > 0 })
