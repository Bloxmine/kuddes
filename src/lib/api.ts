import type { ApiError } from '../../shared/api'

export class ApiRequestError extends Error {
  status: number
  fields: Record<string, string>
  code: string | null

  constructor(status: number, body: ApiError | null) {
    super(body?.error ?? 'Er ging iets mis. Probeer het later nog eens.')
    this.status = status
    this.fields = body?.fields ?? {}
    this.code = body?.code ?? null
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON. */
  body?: unknown
  /** Sent as multipart form data (file uploads). */
  form?: FormData
  signal?: AbortSignal
}

/** Calls the Kuddes API. Throws ApiRequestError for non-2xx responses. */
export async function api<T>(path: string, { method = 'GET', body, form, signal }: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch (e) {
    // Stopped on purpose: pass it on as it is
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    // Otherwise the browser's own (English) "Failed to fetch"
    throw new Error('Geen verbinding met Kuddes. Controleer je internet en probeer het nog eens.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiRequestError(res.status, data)
  return data as T
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Er ging iets mis.'
}
