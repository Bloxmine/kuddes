/**
 * The Graffitimuur on a Kuddes page: the wall itself (public/spray) runs in
 * an iframe, and this component is the go-between. With friends it carries
 * the wall's messages over the game room (useGameRoom): with one friend
 * straight through the data channel when it can, with more (or when that
 * doesn't work) bundled a few times a second through the server. Every
 * message to the wall says who it's from, so each friend has their own can.
 * With one friend the host sends the wall when you connect, as always; with
 * more, whoever comes in waits, and the lowest seat of those already there
 * sends them the wall. It also reports cans and photos to your account for
 * achievements.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import type { Me } from '../../../shared/api'
import type { GameSummary } from '../../../shared/games'
import type { MessengerLine } from '../../../shared/messenger'
import type { SprayProgress } from '../../../shared/spray'
import { api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { useGameRoom, type Transport } from '../games/useGameRoom'
import './Spray.css'

type WallMessage = { spray: 1; type: string; m?: unknown; to?: number; name?: string; data?: unknown; b64?: string; mime?: string }

/** Big messages (the wall's snapshot) go in parts: the server relay takes 20 kB per message. */
const PART = 14_000
const RELAY_EVERY_MS = 120

/** The site's colour tokens, so the wall's menu matches the member's theme. */
const THEME_VARS = [
  '--font-body', '--font-title', '--brand', '--brand-dark', '--link', '--text', '--title', '--text-muted', '--surface',
  '--tint-1', '--tint-2', '--tint-3', '--box-border', '--box-hdr-top', '--box-hdr-bottom', '--btn-border', '--btn-border-dark',
  '--cta-top', '--cta-bottom', '--cta-border', '--cta-shadow', '--highlight',
]
function themeTokens() {
  const css = getComputedStyle(document.documentElement)
  return Object.fromEntries(THEME_VARS.map((v) => [v, css.getPropertyValue(v).trim()]).filter(([, value]) => value))
}

export type SprayStatus = { transport: Transport; peerOnline: boolean; online: number[]; game: GameSummary | null }

/** With a direct line there's one friend and no `from`: they're this one. */
const DIRECT = -1

export function SprayWall({
  me,
  game: initial,
  onStatus,
}: {
  me: Me | null
  game?: GameSummary | null
  onStatus?: (s: SprayStatus) => void
}) {
  const queryClient = useQueryClient()
  const frame = useRef<HTMLIFrameElement>(null)
  const ready = useRef(false)
  const connected = useRef(false)
  const parts = useRef(new Map<string, string[]>())
  const queue = useRef<unknown[]>([])
  const lastCursor = useRef<unknown>(null)
  const flushTimer = useRef<number | undefined>(undefined)
  /** Messages that came in before the wall had loaded. */
  const early = useRef<{ m: unknown; from: number }[]>([])
  /** host/guest with one friend; with more everyone is a "peer" and the wall comes on joining. */
  const role = useRef<'host' | 'guest' | 'peer' | null>(null)

  const toWall = useCallback((msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ spray: 1, ...msg }, location.origin), [])

  /**
   * The friend is there: tell the wall (once). A message from them counts
   * too; over a direct line the host's first messages can arrive before our
   * own side notices the line is open.
   */
  const connectWall = useCallback(() => {
    if (connected.current || !role.current) return
    connected.current = true
    if (ready.current) toWall({ type: 'connect', role: role.current })
  }, [toWall])

  const deliver = useCallback(
    (message: unknown, from: number) => {
      // Parts are put back together, bundles unpacked, and the rest goes to the wall
      const handle = function handle(data: unknown) {
        if (!data || typeof data !== 'object') return
        const d = data as { __part?: string; i?: number; n?: number; s?: string; __batch?: unknown[] }
        if (typeof d.__part === 'string' && typeof d.i === 'number' && typeof d.n === 'number' && typeof d.s === 'string' && d.n <= 2000) {
          const list = parts.current.get(d.__part) ?? new Array<string>(d.n)
          list[d.i] = d.s
          parts.current.set(d.__part, list)
          if (list.filter((x) => x !== undefined).length === d.n) {
            parts.current.delete(d.__part)
            try {
              handle(JSON.parse(list.join('')))
            } catch {
              // a broken message: skip it
            }
          }
          return
        }
        if (Array.isArray(d.__batch)) {
          for (const m of d.__batch) handle(m)
          return
        }
        if (!ready.current) early.current.push({ m: data, from })
        else toWall({ type: 'msg', m: data, from })
      }
      connectWall()
      handle(message)
    },
    [toWall, connectWall],
  )

  // A direct line only for two; with more everyone talks through the server
  const two = !initial || initial.players.filter((p) => p.status !== 'geweigerd').length <= 2
  const room = useGameRoom({
    gameId: initial?.id ?? 0,
    enabled: !!initial && (initial.status === 'uitgenodigd' || initial.status === 'bezig'),
    p2p: two,
    onMessage: (m) => {
      if (m.kind === 'spray') deliver(m.data, m.from ?? DIRECT)
    },
    onConnected: () => connectWall(),
  })
  const game = room.game ?? initial ?? null
  const friends = game ? game.players.filter((p) => p.seat !== game.seat && p.status === 'meedoen') : []
  const friendName = friends.map((p) => p.user.nickname).join(', ')
  useEffect(() => {
    if (!game || game.seat === null) return
    role.current = two ? (game.you ?? 'guest') : 'peer'
  }, [game, two])
  // Everyone's name on the wall, by who their messages are from
  const peerNames = JSON.stringify(Object.fromEntries([...friends.map((p) => [p.user.id, p.user.nickname]), ...(friends.length === 1 ? [[DIRECT, friends[0].user.nickname]] : [])]))
  useEffect(() => {
    if (ready.current) toWall({ type: 'peers', names: JSON.parse(peerNames) })
  }, [peerNames, toWall])
  // Someone new came in: the lowest seat of those already here gives them the wall; someone left: their can goes
  const seen = useRef<number[]>([])
  const seatOfUser = JSON.stringify(Object.fromEntries(friends.map((p) => [p.user.id, p.seat])))
  useEffect(() => {
    const was = seen.current
    seen.current = room.online
    if (!connected.current || two || !game || game.seat === null) return
    const seats = JSON.parse(seatOfUser) as Record<number, number>
    for (const id of room.online) {
      if (was.includes(id)) continue
      const already = room.online.filter((o) => o !== id).map((o) => seats[o] ?? 99)
      if (already.every((seat) => seat > game.seat!)) toWall({ type: 'join', id })
    }
    for (const id of was) if (!room.online.includes(id)) toWall({ type: 'leave', id })
  }, [room.online, two, toWall, game, seatOfUser])

  /** One message (or its parts) to the others, or to one of them. */
  const sendNow = useCallback(
    (data: unknown, to?: number) => {
      const target = to === DIRECT ? undefined : to
      const text = JSON.stringify(data)
      if (text.length <= PART) return room.send({ kind: 'spray', data }, target)
      const id = Math.random().toString(36).slice(2, 10)
      const n = Math.ceil(text.length / PART)
      for (let i = 0; i < n; i++) room.send({ kind: 'spray', data: { __part: id, i, n, s: text.slice(i * PART, (i + 1) * PART) } }, target)
    },
    [room],
  )

  // What a friend you spray with says in Kuddes Messenger shows as a speech bubble at their can
  const friendIds = friends.map((p) => p.user.id).join(',')
  useEffect(() => {
    const ids = friendIds.split(',').map(Number)
    const onLine = (e: Event) => {
      const line = (e as CustomEvent<MessengerLine>).detail
      if (line.kind !== 'msg' || !line.text || !ids.includes(line.from)) return
      toWall({ type: 'chat', from: two ? DIRECT : line.from, text: line.text.slice(0, 200) })
    }
    window.addEventListener('kuddes:messenger-line', onLine)
    return () => window.removeEventListener('kuddes:messenger-line', onLine)
  }, [friendIds, two, toWall])

  const flush = useCallback(() => {
    flushTimer.current = undefined
    const list = queue.current.splice(0)
    if (lastCursor.current) list.push(lastCursor.current)
    lastCursor.current = null
    if (list.length) sendNow({ __batch: list })
  }, [sendNow])

  /**
   * What the wall sends: straight on over a direct line, bundled through the
   * server otherwise. While the line is still being set up it waits, so all
   * of it takes the same road and arrives in order (the wall's "hello" must
   * come before its snapshot).
   */
  const fromWall = useCallback(
    (m: unknown, to?: number) => {
      // For one friend only (the wall for someone who just came in): straight away
      if (to !== undefined) return sendNow(m, to)
      if (room.transport === 'direct' && !queue.current.length) return sendNow(m)
      // Only the latest cursor position matters
      if (m && typeof m === 'object' && (m as { t?: string }).t === 'cur') lastCursor.current = m
      else queue.current.push(m)
      if (room.transport === 'via-server') flushTimer.current ??= window.setTimeout(flush, RELAY_EVERY_MS)
    },
    [room.transport, sendNow, flush],
  )

  // The line is ready: send what waited, in order
  useEffect(() => {
    if (room.transport === 'direct') {
      window.clearTimeout(flushTimer.current)
      flushTimer.current = undefined
      for (const m of queue.current.splice(0)) sendNow(m)
      if (lastCursor.current) sendNow(lastCursor.current)
      lastCursor.current = null
    } else if (room.transport === 'via-server' && (queue.current.length || lastCursor.current)) {
      flushTimer.current ??= window.setTimeout(flush, RELAY_EVERY_MS)
    }
  }, [room.transport, sendNow, flush])

  // The wall's side: ready, messages for the friend, and things for achievements
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== location.origin) return
      const d = e.data as WallMessage
      if (!d || d.spray !== 1) return
      if (d.type === 'ready') {
        const progress = me ? await api<SprayProgress>('/spray/progress').catch(() => null) : null
        toWall({ type: 'init', theme: themeTokens(), tried: progress?.tried ?? [], unlocked: progress?.unlocked ?? false, friendName, canSavePhoto: !!me?.emailVerified })
        toWall({ type: 'peers', names: JSON.parse(peerNames) })
        ready.current = true
        if (connected.current && role.current) toWall({ type: 'connect', role: role.current })
        for (const e of early.current.splice(0)) toWall({ type: 'msg', m: e.m, from: e.from })
      } else if (d.type === 'send') {
        if (connected.current) fromWall(d.m, typeof d.to === 'number' ? d.to : undefined)
      } else if (d.type === 'photo' && me && typeof d.b64 === 'string') {
        // "Foto bewaren": the picture goes straight into your Foto's
        try {
          const bytes = Uint8Array.from(atob(d.b64), (ch) => ch.charCodeAt(0))
          const form = new FormData()
          form.set('file', new Blob([bytes], { type: d.mime === 'image/png' ? 'image/png' : 'image/webp' }), 'graffiti.webp')
          form.set('caption', 'Gespoten op de Graffitimuur')
          await api('/photos', { method: 'POST', form })
          void queryClient.invalidateQueries({ queryKey: keys.photos(me.username) })
          toWall({ type: 'photo-saved', ok: true })
        } catch (err) {
          toWall({ type: 'photo-saved', ok: false, text: errorMessage(err) })
        }
      } else if (d.type === 'event' && me) {
        void api<SprayProgress>('/spray/progress', { method: 'POST', body: { name: d.name, data: d.data ?? null } })
          .then(() => queryClient.invalidateQueries({ queryKey: ['games', 'live'] }))
          .catch(() => undefined)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [me, friendName, peerNames, fromWall, toWall, queryClient])

  // The friend left (or the session stopped): the wall goes on alone
  useEffect(() => {
    if ((!room.peerOnline || game?.status !== 'bezig') && connected.current) {
      connected.current = false
      toWall({ type: 'disconnect' })
    }
  }, [room.peerOnline, game?.status, toWall])

  useEffect(() => onStatus?.({ transport: room.transport, peerOnline: room.peerOnline, online: room.online, game }), [room.transport, room.peerOnline, room.online, game, onStatus])
  useEffect(() => () => window.clearTimeout(flushTimer.current), [])

  return (
    <div className="spray-frame">
      <iframe ref={frame} src="/spray/index.html" title="Graffitimuur" allow="clipboard-write" />
    </div>
  )
}
