/**
 * Cloudflare Turnstile, the "ben je een mens?" check (on the sign-up form).
 * Cloudflare's script is loaded only on the page that shows it. Most people
 * just see a tick; the token goes to our server, which asks Cloudflare.
 */
import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('De controle of je een mens bent kon niet starten. Ververs de pagina.')))
    script.onerror = () => {
      loading = null
      reject(new Error('De controle kon niet geladen worden. Staat er een adblocker aan?'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/** Calls `onToken` with a fresh token, or '' when it expired or failed. `resetKey` changing asks for a new one. */
export function Turnstile({ siteKey, onToken, onError, resetKey }: { siteKey: string; onToken: (token: string) => void; onError?: (message: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const callbacks = useRef({ onToken, onError })
  useEffect(() => {
    callbacks.current = { onToken, onError }
  })

  useEffect(() => {
    let gone = false
    loadTurnstile().then(
      (ts) => {
        if (gone || !box.current) return
        widget.current = ts.render(box.current, {
          sitekey: siteKey,
          language: 'nl',
          theme: 'auto',
          callback: (token: string) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(''),
          'error-callback': () => {
            callbacks.current.onToken('')
            callbacks.current.onError?.('De controle of je een mens bent lukte niet. Ververs de pagina en probeer het nog eens.')
          },
        })
      },
      (e: Error) => callbacks.current.onError?.(e.message),
    )
    return () => {
      gone = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [siteKey])

  // A token works once: after a failed sign-up, ask for a new one
  useEffect(() => {
    if (resetKey && widget.current) window.turnstile?.reset(widget.current)
  }, [resetKey])

  return <div ref={box} className="turnstile" />
}
