import type { FarmIconName } from '../components/ui/farmIcons'
import { HIDDEN_STATUS } from '../../shared/onlineStatus'

export { ONLINE_STATUSES } from '../../shared/onlineStatus'

/** The Farm-Fresh status icon for an online status ("Online", "Bezig", …). */
export function statusIcon(status: string, online = true): FarmIconName {
  if (!online || status === HIDDEN_STATUS || status === 'Offline') return 'status_offline'
  if (status === 'Online') return 'status_online'
  if (status === 'Bezig') return 'status_busy'
  return 'status_away'
}
