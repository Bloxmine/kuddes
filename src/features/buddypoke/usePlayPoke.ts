import { useEffect, useRef, useState, type RefObject } from 'react'
import type { ReceivedPoke } from './BuddyPoke'

/**
 * Plays a received poke once in the small BuddyPoke on the profile (see
 * web/js/gadget.js), with the poker's buddy and the member's. `playing` is the
 * poke that's on now.
 */
export function usePlayPoke(frameRef: RefObject<HTMLIFrameElement | null>, ownCode: string | null) {
  const [playing, setPlaying] = useState<number | null>(null)
  const current = useRef<ReceivedPoke | null>(null)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frameRef.current?.contentWindow) return
      const data = e.data as { source?: string; type?: string; poke?: string }
      if (data?.source !== 'buddypoke' || data.poke !== current.current?.action) return
      if (data.type === 'poke-end' || data.type === 'poke-unavailable') {
        current.current = null
        setPlaying(null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frameRef])
  const play = (poke: ReceivedPoke) => {
    const frame = frameRef.current?.contentWindow
    if (!frame) return
    current.current = poke
    setPlaying(poke.id)
    frame.postMessage({ source: 'kuddes', type: 'poke', poke: poke.action, from: poke.fromCode, to: ownCode }, location.origin)
  }
  return { play, playing }
}
