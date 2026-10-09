/**
 * Cloudflare Turnstile: the "ben je een mens?" check on the sign-up form.
 * Most visitors never see a puzzle; Cloudflare decides from the browser.
 * The page gets a token from the widget, and we ask Cloudflare whether it's
 * real before creating the account.
 */
import { config } from '../config'

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

export const turnstileEnabled = () => !!(config.turnstile.siteKey && config.turnstile.secretKey)

/** true when Cloudflare says the token is real (and not used before). */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!token || token.length > 2048) return false
  const body = new URLSearchParams({ secret: config.turnstile.secretKey, response: token })
  if (ip && ip !== 'unknown') body.set('remoteip', ip)
  try {
    const res = await fetch(`${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`, { method: 'POST', body, signal: AbortSignal.timeout(8000) })
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (!data.success) console.warn('turnstile refused:', data['error-codes']?.join(', '))
    return data.success === true
  } catch (e) {
    // Cloudflare unreachable: better to refuse a sign-up than let spam in; they can try again
    console.error('turnstile check failed', e)
    return false
  }
}
