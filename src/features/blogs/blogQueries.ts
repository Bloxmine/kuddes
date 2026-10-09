import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '../../../shared/api'
import type { Blog, BlogInput, BlogSummary } from '../../../shared/blogs'
import { api } from '../../lib/api'

export const blogKeys = {
  all: ['blogs'] as const,
  list: (author: string | null, before: number | null, limit: number) => ['blogs', 'list', author, before, limit] as const,
  detail: (id: number) => ['blogs', 'detail', id] as const,
}

/** The newest blogs (of one member with `author`), a page at a time. */
export const useBlogs = (author: string | null, before: number | null = null, limit = 12, enabled = true) =>
  useQuery({
    queryKey: blogKeys.list(author, before, limit),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (author) params.set('van', author)
      if (before) params.set('before', String(before))
      return api<Page<BlogSummary>>(`/blogs?${params}`)
    },
    placeholderData: keepPreviousData,
    enabled,
  })

export const useBlog = (id: number) => useQuery({ queryKey: blogKeys.detail(id), queryFn: () => api<Blog>(`/blogs/${id}`), enabled: id > 0, retry: false })

export function useSaveBlog(id: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BlogInput) => api<Blog>(id ? `/blogs/${id}` : '/blogs', { method: id ? 'PATCH' : 'POST', body: input }),
    onSuccess: (blog) => {
      queryClient.setQueryData(blogKeys.detail(blog.id), blog)
      void queryClient.invalidateQueries({ queryKey: ['blogs', 'list'] })
    },
  })
}

export function useDeleteBlog() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/blogs/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      queryClient.removeQueries({ queryKey: blogKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: ['blogs', 'list'] })
    },
  })
}

/** A picture for in a blog; returns its address. */
export async function uploadBlogImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const { url } = await api<{ url: string }>('/blogs/images', { method: 'POST', form })
  return url
}
