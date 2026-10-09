import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { GAME_EMOTES, type GameSummary } from '../../../shared/games'
import { gameKeys } from './gameQueries'
import { playEmote, playResult, playYourTurn } from './sounds'

/** A smiley from a player (you, "them" in a game of two, or someone's user id), shown for a few seconds. */
export function useEmotes() {
  const [emote, setEmote] = useState<{ who: 'me' | 'them' | number; name: string; at: number } | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    if (!emote) return
    const t = window.setTimeout(() => setEmote(null), 3000)
    return () => window.clearTimeout(t)
  }, [emote])
  return {
    emote,
    show: (who: 'me' | 'them' | number, name: string) => {
      if (!(GAME_EMOTES as readonly string[]).includes(name)) return
      setEmote({ who, name, at: ++seq.current })
      playEmote()
    },
  }
}

/** After a game: refresh everything that shows games, stats and achievements. */
export function useFinishedRefresh() {
  const queryClient = useQueryClient()
  return (g: GameSummary) => {
    queryClient.setQueryData(gameKeys.game(g.id), g)
    queryClient.invalidateQueries({ queryKey: gameKeys.all })
    queryClient.invalidateQueries({ queryKey: ['achievements'] })
  }
}

/** A little ping when it becomes your turn (not when you open the page on your turn). */
export function useYourTurnSound(myTurn: boolean) {
  const was = useRef(myTurn)
  useEffect(() => {
    if (myTurn && !was.current) playYourTurn()
    was.current = myTurn
  }, [myTurn])
}

/** The jingle when a game you're playing ends (not when you open a finished one). */
export function useResultSound(game: GameSummary) {
  const first = useRef(game.status)
  useEffect(() => {
    if (game.status !== 'klaar' || first.current === 'klaar') return
    playResult(game.winner === 'gelijk' ? 'gelijk' : game.winner === game.you ? 'win' : 'verlies')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it's over
  }, [game.status])
}
