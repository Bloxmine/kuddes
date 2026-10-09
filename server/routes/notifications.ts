/** The bell in the top bar: your latest notifications, and marking them read (server/lib/notifications.ts). */
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import type { NotificationList } from '../../shared/api'
import { db } from '../db/client'
import { notifications, users } from '../db/schema'
import { pruneNotifications, unreadCount } from '../lib/notifications'
import { toSummary } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { send } from '../lib/messenger'
import { summaryColumns } from '../lib/users'

export const notificationRoutes = new Hono<AppEnv>()
  .get('/notifications', async (c) => {
    const me = requireUser(c)
    await pruneNotifications(me.id)
    const rows = await db
      .select({ n: notifications, actor: summaryColumns })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.actorId))
      .where(eq(notifications.userId, me.id))
      .orderBy(desc(notifications.id))
      .limit(30)
    const result: NotificationList = {
      items: rows.map(({ n, actor }) => ({
        id: n.id,
        kind: n.kind,
        actor: toSummary(actor),
        message: n.message,
        snippet: n.snippet,
        link: n.link,
        read: !!n.readAt,
        createdAt: n.createdAt.toISOString(),
      })),
      unread: await unreadCount(me.id),
    }
    return c.json(result)
  })

  // Opening the bell: everything in it has been seen (also in your other tabs)
  .post('/notifications/read', async (c) => {
    const me = requireUser(c)
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)))
    send(me.id, 'notify', { unread: 0 })
    return c.body(null, 204)
  })
