/**
 * The connection between the players of a game. The server's room
 * (Server-Sent Events + POST /signal) carries the WebRTC setup; after that
 * the players talk directly over a data channel. If a direct connection
 * can't be made (strict NAT, no TURN server), messages keep going through
 * the server, so the game always works.
 *
 * The host always makes the offer and the guest answers, so the two never
 * both start at once. When either reloads, the host offers again.
 *
 * Games with more than two players (and the games the server referees) go
 * through the server only: every message goes to everyone else in the room,
 * or to one player with `to`, and arrives with `from`.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameSignal, GameSummary } from '../../../shared/games'
import { api } from '../../lib/api'

export type Transport = 'wachten' | 'verbinden' | 'direct' | 'via-server'

/** The messages the game itself sends (the rest is WebRTC setup). */
export type PlayMessage = Extract<GameSignal, { kind: 'move' | 'sync' | 'emote' | 'spray' }>

type Options = {
  gameId: number
  /** Only connect while the game can still be played. */
  enabled: boolean
  onMessage: (message: PlayMessage) => void
  /** The direct connection or the relay is ready: time to compare moves. */
  onConnected: () => void
  /** false for games the server referees: no WebRTC, the server sends 'state' instead. */
  p2p?: boolean
  onState?: (state: unknown) => void
}

const FALLBACK_AFTER_MS = 8000
const iceCache: { servers?: RTCIceServer[] } = {}

async function iceServers(): Promise<RTCIceServer[]> {
  if (!iceCache.servers) {
    iceCache.servers = await api<{ iceServers: RTCIceServer[] }>('/games/ice')
      .then((r) => r.iceServers)
      .catch(() => [{ urls: 'stun:stun.l.google.com:19302' }])
  }
  return iceCache.servers
}

export function useGameRoom({ gameId, enabled, onMessage, onConnected, p2p = true, onState }: Options) {
  const [game, setGame] = useState<GameSummary | null>(null)
  const [peerOnline, setPeerOnline] = useState(false)
  /** The other players in the room right now, and since when someone who left is gone. */
  const [online, setOnline] = useState<number[]>([])
  const [goneSince, setGoneSince] = useState<Record<number, number>>({})
  /** Since when the other player isn't in the room (null while they are). */
  const [peerGoneSince, setPeerGoneSince] = useState<number | null>(null)
  const [transport, setTransport] = useState<Transport>('wachten')
  const [roomError, setRoomError] = useState<string | null>(null)

  const pc = useRef<RTCPeerConnection | null>(null)
  const channel = useRef<RTCDataChannel | null>(null)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const fallbackTimer = useRef<number | undefined>(undefined)
  const role = useRef<'host' | 'guest' | null>(null)
  const reoffer = useRef<() => void>(() => undefined)
  const current = useRef<GameSummary | null>(null)
  // The latest callbacks, without reconnecting when they change
  const handlers = useRef({ onMessage, onConnected, onState })
  useLayoutEffect(() => {
    handlers.current = { onMessage, onConnected, onState }
  })

  const post = useCallback((signal: GameSignal) => api<{ delivered: boolean }>(`/games/${gameId}/signal`, { method: 'POST', body: signal }).catch(() => ({ delivered: false })), [gameId])

  const closePeer = useCallback(() => {
    window.clearTimeout(fallbackTimer.current)
    channel.current?.close()
    pc.current?.close()
    channel.current = null
    pc.current = null
    pendingIce.current = []
  }, [])

  const attachChannel = useCallback((dc: RTCDataChannel) => {
    channel.current = dc
    dc.onopen = () => {
      window.clearTimeout(fallbackTimer.current)
      setTransport('direct')
      handlers.current.onConnected()
    }
    dc.onclose = () => {
      if (channel.current === dc) {
        channel.current = null
        setTransport((t) => (t === 'direct' ? 'via-server' : t))
        // The line dropped (the other player reloaded?): the host tries again
        if (role.current === 'host') window.setTimeout(() => reoffer.current(), 1500)
      }
    }
    dc.onmessage = (e) => {
      try {
        handlers.current.onMessage(JSON.parse(String(e.data)) as PlayMessage)
      } catch {
        // not ours
      }
    }
  }, [])

  /** No direct line after a few seconds: play through the server meanwhile. */
  const startFallback = useCallback(() => {
    window.clearTimeout(fallbackTimer.current)
    setTransport((t) => (t === 'direct' ? t : 'verbinden'))
    fallbackTimer.current = window.setTimeout(() => {
      if (channel.current?.readyState === 'open') return
      setTransport('via-server')
      handlers.current.onConnected()
    }, FALLBACK_AFTER_MS)
  }, [])

  const newPeer = useCallback(async () => {
    closePeer()
    const peer = new RTCPeerConnection({ iceServers: await iceServers() })
    pc.current = peer
    peer.onicecandidate = (e) =>
      void post({ kind: 'ice', data: e.candidate ? (e.candidate.toJSON() as { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }) : null })
    peer.ondatachannel = (e) => attachChannel(e.channel)
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' && pc.current === peer) {
        setTransport('via-server')
        handlers.current.onConnected()
      }
    }
    startFallback()
    return peer
  }, [closePeer, post, attachChannel, startFallback])

  const offer = useCallback(async () => {
    const peer = await newPeer()
    attachChannel(peer.createDataChannel('spel', { ordered: true }))
    await peer.setLocalDescription(await peer.createOffer())
    await post({ kind: 'offer', data: { type: 'offer', sdp: peer.localDescription!.sdp } })
  }, [newPeer, post, attachChannel])

  const handleSignal = useCallback(
    async (signal: GameSignal) => {
      switch (signal.kind) {
        case 'offer': {
          if (role.current !== 'guest') return
          const peer = await newPeer()
          await peer.setRemoteDescription(signal.data)
          for (const c of pendingIce.current.splice(0)) await peer.addIceCandidate(c).catch(() => undefined)
          await peer.setLocalDescription(await peer.createAnswer())
          await post({ kind: 'answer', data: { type: 'answer', sdp: peer.localDescription!.sdp } })
          return
        }
        case 'answer':
          if (pc.current && pc.current.signalingState === 'have-local-offer') {
            await pc.current.setRemoteDescription(signal.data)
            for (const c of pendingIce.current.splice(0)) await pc.current.addIceCandidate(c).catch(() => undefined)
          }
          return
        case 'ice':
          if (!signal.data) return
          if (pc.current?.remoteDescription) await pc.current.addIceCandidate(signal.data).catch(() => undefined)
          else pendingIce.current.push(signal.data)
          return
        default:
          // The game, relayed by the server
          handlers.current.onMessage(signal)
      }
    },
    [newPeer, post],
  )

  // The room itself
  useEffect(() => {
    if (!enabled) return
    const source = new EventSource(`/api/games/${gameId}/stream`)
    let peerHere = false
    const update = (game: GameSummary) => {
      current.current = game
      setGame(game)
    }
    reoffer.current = () => {
      if (!channel.current || channel.current.readyState !== 'open') connect()
    }
    // Both players here and the game is on: the host offers, the guest waits for it
    const connect = () => {
      const game = current.current
      if (!p2p || game?.status !== 'bezig' || !peerHere) return
      if (role.current === 'host') void offer().catch(() => setTransport('via-server'))
      else startFallback()
    }
    // Without WebRTC, the room is the line: ready as soon as someone else is here
    const relay = () => {
      if (p2p || current.current?.status !== 'bezig') return
      setTransport(peerHere ? 'via-server' : 'wachten')
      if (peerHere) handlers.current.onConnected()
    }
    let here = new Set<number>()
    source.addEventListener('hello', (e) => {
      const { game, peerOnline, online: ids = [] } = JSON.parse((e as MessageEvent).data) as { game: GameSummary; peerOnline: boolean; online?: number[] }
      role.current = game.you
      peerHere = peerOnline
      here = new Set(ids)
      setOnline([...here])
      update(game)
      setPeerOnline(peerOnline)
      setPeerGoneSince(peerOnline ? null : Date.now())
      setRoomError(null)
      if (!peerOnline) setTransport('wachten')
      connect()
      relay()
    })
    source.addEventListener('peer', (e) => {
      const { online: isOnline, userId } = JSON.parse((e as MessageEvent).data) as { online: boolean; userId?: number }
      if (userId !== undefined) {
        if (isOnline) here.add(userId)
        else here.delete(userId)
        setOnline([...here])
        setGoneSince((g) => {
          const next = { ...g }
          if (isOnline) delete next[userId]
          else next[userId] = Date.now()
          return next
        })
      }
      const anyone = userId === undefined ? isOnline : here.size > 0
      peerHere = anyone
      setPeerOnline(anyone)
      setPeerGoneSince(anyone ? null : Date.now())
      if (!p2p) return relay()
      if (anyone) {
        connect()
      } else {
        closePeer()
        setTransport('wachten')
      }
    })
    source.addEventListener('game', (e) => {
      const next = JSON.parse((e as MessageEvent).data) as GameSummary
      const wasInvite = current.current?.status === 'uitgenodigd'
      update(next)
      // The invite was just accepted and the other player is here: connect
      if (wasInvite && next.status === 'bezig') {
        connect()
        relay()
      }
      if (next.status !== 'bezig' && next.status !== 'uitgenodigd') {
        closePeer()
        source.close()
      }
    })
    source.addEventListener('state', (e) => handlers.current.onState?.(JSON.parse((e as MessageEvent).data)))
    source.addEventListener('signal', (e) => void handleSignal(JSON.parse((e as MessageEvent).data) as GameSignal).catch(() => undefined))
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setRoomError('De verbinding met Kuddes is verbroken. Herlaad de pagina.')
    }
    return () => {
      source.close()
      closePeer()
    }
  }, [enabled, gameId, offer, handleSignal, closePeer, startFallback, p2p])

  /** To the other player (or everyone, or with `to` one of them): directly if we can, otherwise through the server. */
  const send = useCallback(
    (message: PlayMessage, to?: number) => {
      if (to === undefined && channel.current?.readyState === 'open') channel.current.send(JSON.stringify(message))
      else void post(to === undefined ? message : { ...message, to })
    },
    [post],
  )

  const replaceGame = useCallback((g: GameSummary) => {
    current.current = g
    setGame(g)
  }, [])

  return { game, setGame: replaceGame, peerOnline, peerGoneSince, online, goneSince, transport, roomError, send }
}
