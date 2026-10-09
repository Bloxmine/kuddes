import type { UserSummary } from '../../../shared/api'

/** "Bot" next to the name of a bot account, so nobody mistakes it for a person. */
export function BotBadge({ user }: { user: Pick<UserSummary, 'bot'> | null | undefined }) {
  if (!user?.bot) return null
  return (
    <span className="bot-badge" title="Dit account is een bot: het doet dingen vanzelf, er zit geen mens achter">
      Bot
    </span>
  )
}
