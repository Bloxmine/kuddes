/**
 * Who is looking, for code deep inside a request that doesn't get the
 * context (like toSummary): set once per API request, after the session is
 * known. Outside a request (Messenger events, mails) it counts as a member.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './session'

const store = new AsyncLocalStorage<{ loggedIn: boolean }>()

export const viewerMiddleware = createMiddleware<AppEnv>((c, next) => store.run({ loggedIn: !!c.get('user') }, next))

export const viewerLoggedIn = () => store.getStore()?.loggedIn ?? true
