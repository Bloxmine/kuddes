import { useQuery } from '@tanstack/react-query'
import type { SmileyCount } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { api } from '../../lib/api'
import { Smiley } from '../../lib/smileys'

/** "Smileys in de laatste 24 uur", like on Hyves: the most used first (only counts, never who). */
export function SmileysBox() {
  const { data, isLoading } = useQuery({ queryKey: ['home', 'smileys'], queryFn: () => api<SmileyCount[]>('/home/smileys'), staleTime: 5 * 60_000 })
  return (
    <Box title="Smileys in de laatste 24 uur" icon="emotion_happy" className="smileys-today">
      {isLoading ? (
        <p className="muted">Tellen…</p>
      ) : !data?.length ? (
        <p className="empty">Vandaag nog geen smileys. Wie begint? :)</p>
      ) : (
        <ul className="smileys-today-list">
          {data.map((s) => (
            <li key={s.name} title={`:${s.name}: ${s.count}× gebruikt`}>
              <Smiley name={s.name} />
              <span>{s.count}×</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}
