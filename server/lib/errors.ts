import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

export class HttpError extends Error {
  status: ContentfulStatusCode
  fields?: Record<string, string>
  /** For the app to recognise, e.g. "unverified" (confirm your e-mail address first). */
  code?: string

  constructor(status: ContentfulStatusCode, message: string, fields?: Record<string, string>, code?: string) {
    super(message)
    this.status = status
    this.fields = fields
    this.code = code
  }
}

export const notFound = (what = 'Niet gevonden.') => new HttpError(404, what)

/** Parses input with a zod schema, turning failures into a 400 with per-field messages. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const fields: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    // A body that isn't an object at all (no JSON, a form post…) has no useful zod message
    fields[key] ??= key === '_' ? 'Ongeldig verzoek.' : issue.message
  }
  throw new HttpError(400, Object.values(fields)[0] ?? 'Ongeldige invoer.', fields)
}

/** What a visitor sees when something breaks (and what a banned connection sees, so it looks the same). */
export const GENERIC_ERROR = 'Er ging iets mis. Probeer het later nog eens.'

export function handleError(err: Error, c: Context) {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, fields: err.fields, code: err.code }, err.status)
  }
  // Hono's own middleware (csrf, etc.) throws these
  if (err instanceof HTTPException) {
    return c.json({ error: err.status === 403 ? 'Dit verzoek is geweigerd.' : err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: GENERIC_ERROR }, 500)
}
