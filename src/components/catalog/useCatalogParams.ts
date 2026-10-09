import { useSearchParams } from 'react-router-dom'

/** The URL parameters of a catalogue page (Catalog.tsx); changing a filter goes back to page 1. */
export function useCatalogParams(replace = false) {
  const [params, setParams] = useSearchParams()
  const update = (changes: Record<string, string | null>, keepPage = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!keepPage) next.delete('pagina')
        return next
      },
      { replace },
    )
  const page = Math.max(1, Number(params.get('pagina')) || 1)
  return { params, update, page }
}
