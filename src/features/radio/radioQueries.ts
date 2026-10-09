import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { UserSummary } from '../../../shared/api'
import { RADIO_GENRES, RADIO_TERMS, RADIO_UPLOAD_REASONS, type RadioAccess, type RadioChatLine, type RadioEvents, type RadioGenre, type RadioLive, type RadioShow, type RadioSound, type RadioStation } from '../../../shared/radio'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api } from '../../lib/api'
import type { RightsKind } from '../music/MusicAccess'

export const radioKeys = {
  all: ['radio'] as const,
  me: ['radio', 'me'] as const,
  explore: (genre: string, q: string) => ['radio', 'explore', genre, q] as const,
  station: (username: string) => ['radio', 'station', username] as const,
}

export const genreIcon = (g: RadioGenre) => RADIO_GENRES[g].icon as FarmIconName

export type RadioExplore = { live: RadioStation[]; stations: RadioStation[]; upcoming: RadioShow[]; genres: Partial<Record<RadioGenre, number>> }
export type MyRadio = { access: RadioAccess; station: RadioStation | null; djs: UserSummary[]; sounds: RadioSound[]; shows: RadioShow[]; djAt: RadioStation[] }
export type StationPage = { station: RadioStation; shows: RadioShow[]; chat: RadioChatLine[] }

export const useMyRadio = (enabled = true) => useQuery({ queryKey: radioKeys.me, queryFn: () => api<MyRadio>('/radio/me'), enabled, staleTime: 15_000 })

export const useStation = (username: string) =>
  useQuery({ queryKey: radioKeys.station(username), queryFn: () => api<StationPage>(`/radio/stations/${encodeURIComponent(username)}`), retry: false })

/**
 * A station's event stream: whether it's live (and what's on), the chat, and
 * the set-up messages of the DJs' microphones (`onDj`, only for the studio and
 * the DJs themselves).
 */
export function useRadioEvents(username: string | null, initial: { live?: RadioLive | null; chat?: RadioChatLine[] } = {}, onDj?: (e: RadioEvents['dj']) => void) {
  const [live, setLive] = useState<RadioLive | null>(initial.live ?? null)
  const [chat, setChat] = useState<RadioChatLine[]>(initial.chat ?? [])
  const djHandler = useRef(onDj)
  useEffect(() => {
    djHandler.current = onDj
  })
  useEffect(() => {
    if (!username) return
    const source = new EventSource(`/api/radio/stations/${encodeURIComponent(username)}/events`)
    source.addEventListener('live', (e) => {
      const next = JSON.parse((e as MessageEvent<string>).data) as RadioLive | null
      setLive(next)
      if (!next) setChat([])
    })
    source.addEventListener('chat', (e) => {
      const line = JSON.parse((e as MessageEvent<string>).data) as RadioChatLine
      setChat((list) => (list.some((l) => l.id === line.id) ? list : [...list.slice(-99), line]))
    })
    source.addEventListener('dj', (e) => djHandler.current?.(JSON.parse((e as MessageEvent<string>).data) as RadioEvents['dj']))
    return () => source.close()
  }, [username])
  return { live, chat, setChat }
}

export const RADIO_RIGHTS: RightsKind = {
  endpoint: '/me/radio-access',
  queryKey: radioKeys.me,
  icon: 'transmit',
  title: 'Radio maken aanvragen',
  what: 'radio maken',
  meanwhile: { to: '/radio', label: 'radio luisteren' },
  intro:
    'Iedereen kan Kuddes Radio luisteren. Wil je zelf live uitzenden, met muziek van Kuddes Muziek, je eigen stem en DJ’s? Vraag dan eerst of je mag: de beheerder krijgt je aanvraag als bericht en laat je weten of het goed is.',
  reasonsLabel: 'Wat voor radio wil je maken? (kies er minstens één)',
  reasons: RADIO_UPLOAD_REASONS,
  terms: RADIO_TERMS,
  termsTitle: 'De regels voor radio',
  placeholder: 'Bijvoorbeeld: elke vrijdagavond een uurtje muziek en praten met mijn klasgenoten.',
}
