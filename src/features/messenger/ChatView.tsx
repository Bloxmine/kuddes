import type { Me } from '../../../shared/api'
import { groupIdOf } from '../../../shared/messenger'
import { Conversation } from './Conversation'
import { GroupConversation } from './GroupConversation'

/** The conversation behind a window key: with a friend (their username) or a group (`groep:<id>`). */
export function ChatView({ chatKey, me, visible, full }: { chatKey: string; me: Me; visible: boolean; full?: boolean }) {
  const groupId = groupIdOf(chatKey)
  return groupId ? <GroupConversation id={groupId} me={me} visible={visible} full={full} /> : <Conversation username={chatKey} me={me} visible={visible} full={full} />
}
