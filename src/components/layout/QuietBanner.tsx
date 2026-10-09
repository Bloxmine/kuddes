import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { FarmIcon } from '../ui/FarmIcon'

/** The quiet mode's line at the top of every page (Beheer → Rustige stand), when there is one. */
export function QuietBanner() {
  const { data } = useQuery({ queryKey: ['notice'], queryFn: () => api<{ notice: string | null }>('/notice'), staleTime: 5 * 60 * 1000 })
  if (!data?.notice) return null
  return (
    <div className="quiet-banner page" role="status">
      <FarmIcon name="clock" /> {data.notice}
    </div>
  )
}
