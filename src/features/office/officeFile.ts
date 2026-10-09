/**
 * What the Office programs share besides components (Office.tsx): Office's
 * colours, remembered settings, the colour scheme, and loading and saving a
 * file (useOfficeLoad, useOfficeFile).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DOC_KINDS, DOC_TITLE_MAX, type DocKind, type DocumentItem } from '../../../shared/documents'
import { api, errorMessage } from '../../lib/api'
import { formatTime } from '../../lib/time'
import { useUnsavedChanges } from '../../lib/unsavedChanges'

export type Scheme = 'blauw' | 'zilver' | 'zwart'

/** Office 2007's theme colours (lighter to darker) and standard colours, for every colour menu. */
export const PALETTE = [
  ['#ffffff', '#000000', '#eeece1', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646'],
  ['#f2f2f2', '#7f7f7f', '#ddd9c3', '#c6d9f0', '#dbe5f1', '#f2dcdb', '#ebf1dd', '#e5e0ec', '#dbeef3', '#fdeada'],
  ['#d8d8d8', '#595959', '#c4bd97', '#8db3e2', '#b8cce4', '#e5b9b7', '#d7e3bc', '#ccc1d9', '#b7dde8', '#fbd5b5'],
  ['#bfbfbf', '#3f3f3f', '#938953', '#548dd4', '#95b3d7', '#d99694', '#c3d69b', '#b2a2c7', '#92cddc', '#fac08f'],
  ['#a5a5a5', '#262626', '#494429', '#17365d', '#366092', '#953734', '#76923c', '#5f497a', '#31859b', '#e36c09'],
]
export const STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0']

export function remembered<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not remembered in this browser, that's fine
  }
}

/** The colour scheme, the same for all three programs. */
export function useScheme() {
  const [scheme, set] = useState<Scheme>(() => remembered('kuddes.office.schema', remembered('kuddes.woord.schema', 'blauw', ['blauw', 'zilver', 'zwart']), ['blauw', 'zilver', 'zwart']))
  const setScheme = (s: Scheme) => {
    set(s)
    remember('kuddes.office.schema', s)
  }
  return [scheme, setScheme] as const
}

/** Keeps the selection where it is: a press on a ribbon control doesn't move the focus. */
export const keep = (e: React.MouseEvent) => e.preventDefault()

export const DOCS_KEY = ['me', 'documents'] as const

export type OfficeFile<C> = { id: number; kind: DocKind; title: string; words: number; updatedAt: string; content: C | null }

/**
 * Saving a Rekenblad or Presentatie: the first save creates it (and its
 * address), later ones update it, every 20 seconds while there's something
 * new; Opslaan als makes a copy, Verwijderen removes it. `snapshot` gives
 * what to save at that moment.
 */
export function useOfficeFile<C>(kind: DocKind, initial: OfficeFile<C> | null, snapshot: () => { content: C; words: number }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [id, setId] = useState<number | null>(initial?.id ?? null)
  const [title, setTitleState] = useState(initial?.title ?? DOC_KINDS[kind].newTitle)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null)
  const [problem, setProblem] = useState<string | null>(null)
  const docs = useQuery({ queryKey: DOCS_KEY, queryFn: () => api<DocumentItem[]>('/me/documents') })
  const info = DOC_KINDS[kind]

  const saving = useRef(false)
  const save = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (saving.current) return
      saving.current = true
      const { content, words } = snapshot()
      const body = { kind, title: title.trim() || info.name, content, words }
      try {
        const saved = id
          ? await api<OfficeFile<C>>(`/me/documents/${id}`, { method: 'PATCH', body })
          : await api<OfficeFile<C>>('/me/documents', { method: 'POST', body })
        if (!id) {
          setId(saved.id)
          // Its own address from now on, without opening it anew (that would lose the selection and undo)
          window.history.replaceState(window.history.state, '', `${info.path}/${saved.id}`)
        }
        queryClient.setQueryData([...DOCS_KEY, saved.id], saved)
        void queryClient.invalidateQueries({ queryKey: DOCS_KEY, exact: true })
        setSavedAt(saved.updatedAt)
        setDirty(false)
        setProblem(null)
        return saved
      } catch (e) {
        setProblem(errorMessage(e))
        if (!opts.silent) throw e
      } finally {
        saving.current = false
      }
    },
    [id, info, kind, queryClient, snapshot, title],
  )
  const latest = useRef(save)
  useEffect(() => {
    latest.current = save
  })
  useEffect(() => {
    const t = setInterval(() => dirty && void latest.current({ silent: true }), 20_000)
    return () => clearInterval(t)
  }, [dirty])
  useUnsavedChanges(dirty, { what: `“${title}”`, save: () => save() })

  const saveAs = async () => {
    const name = prompt('Opslaan als:', `${title} (kopie)`.slice(0, DOC_TITLE_MAX))
    if (!name?.trim()) return
    try {
      const { content, words } = snapshot()
      const copy = await api<OfficeFile<C>>('/me/documents', { method: 'POST', body: { kind, title: name.trim(), content, words } })
      void queryClient.invalidateQueries({ queryKey: DOCS_KEY })
      setDirty(false)
      navigate(`${info.path}/${copy.id}`)
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  const remove = useMutation({
    mutationFn: () => api<void>(`/me/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDirty(false)
      void queryClient.invalidateQueries({ queryKey: DOCS_KEY })
      navigate(info.path, { replace: true })
    },
  })

  return {
    id,
    title,
    setTitle: (t: string) => {
      setTitleState(t)
      setDirty(true)
    },
    dirty,
    changed: () => {
      setDirty(true)
      setProblem(null)
    },
    savedAt,
    problem,
    setProblem,
    save: () => void save().catch(() => undefined),
    /** Saves and gives the saved file (Formulieren needs the address the server gave it). */
    saveNow: () => save(),
    saveAs: () => void saveAs(),
    remove: id ? () => confirm(`“${title}” verwijderen? Dit kan niet ongedaan worden gemaakt.`) && remove.mutate() : null,
    docs: docs.data ?? [],
    docsLoading: docs.isLoading,
    status: problem ?? (dirty ? 'Niet opgeslagen' : savedAt ? `Opgeslagen ${formatTime(savedAt)}` : 'Nieuw bestand'),
  }
}

/** Loads a file of this kind by its id (none: a new one), for the page around the program. */
export function useOfficeLoad<C>(kind: DocKind, id: string | undefined) {
  const docId = id ? Number(id) : null
  return useQuery({
    queryKey: [...DOCS_KEY, docId],
    queryFn: async () => {
      const doc = await api<OfficeFile<C>>(`/me/documents/${docId}`)
      if (doc.kind !== kind) throw new Error(`Dit is geen ${DOC_KINDS[kind].one}.`)
      return doc
    },
    enabled: docId !== null,
    // What's open is what you're working on; don't swap it underneath you
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}
