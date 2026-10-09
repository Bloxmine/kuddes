/**
 * Admin rights can only be given here, on the server, never from the website.
 *
 *   npm run admin -- list                 who is admin
 *   npm run admin -- grant hein           make a member the admin (and let them in, if they were on the waitlist)
 *   npm run admin -- approve piet         let someone in from the waitlist
 *   npm run admin -- revoke hein          take it away again
 *   npm run admin -- reset-password hein  set a new random password (prints it once)
 */
import { randomBytes } from 'node:crypto'
import { eq, sql as q } from 'drizzle-orm'
import { db, sql } from '../db/client'
import { adminLog, sessions, users } from '../db/schema'
import { hashPassword } from '../lib/password'

const [command, username] = process.argv.slice(2)

async function member(name: string | undefined) {
  if (!name) throw new Error('Welke gebruikersnaam?')
  const [row] = await db.select().from(users).where(eq(users.username, name.toLowerCase()))
  if (!row) throw new Error(`Er is geen lid met de gebruikersnaam "${name}".`)
  return row
}

try {
  switch (command) {
    case 'list': {
      const rows = await db.select({ username: users.username, name: users.name }).from(users).where(eq(users.forumRole, 'admin'))
      console.log(rows.length ? rows.map((r) => `${r.username} (${r.name})`).join('\n') : 'Er is nog geen beheerder.')
      break
    }
    case 'grant': {
      const user = await member(username)
      // The admin is let in straight away: there's nobody else to approve them
      await db.update(users).set({ forumRole: 'admin', emailVerifiedAt: q`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, user.id))
      await db.insert(adminLog).values({ action: 'beheerder gemaakt (server)', target: `lid ${user.username}` })
      console.log(`${user.username} is nu beheerder.`)
      break
    }
    case 'approve': {
      const user = await member(username)
      if (user.emailVerifiedAt) {
        console.log(`${user.username} is al goedgekeurd.`)
        break
      }
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id))
      await db.insert(adminLog).values({ action: 'aanmelding goedgekeurd (server)', target: `lid ${user.username}` })
      console.log(`${user.username} is goedgekeurd.`)
      break
    }
    case 'revoke': {
      const user = await member(username)
      await db.update(users).set({ forumRole: null }).where(eq(users.id, user.id))
      await db.insert(adminLog).values({ action: 'beheerdersrechten afgenomen (server)', target: `lid ${user.username}` })
      console.log(`${user.username} is geen beheerder meer.`)
      break
    }
    case 'reset-password': {
      const user = await member(username)
      const password = randomBytes(12).toString('base64url')
      await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id))
      // Log out everywhere, the old password shouldn't keep working through a session
      await db.delete(sessions).where(eq(sessions.userId, user.id))
      await db.insert(adminLog).values({ action: 'wachtwoord opnieuw ingesteld (server)', target: `lid ${user.username}` })
      console.log(`Nieuw wachtwoord voor ${user.username}: ${password}\nVerander het na het inloggen onder Instellingen.`)
      break
    }
    default:
      console.log('Gebruik: npm run admin -- list | grant <gebruikersnaam> | approve <gebruikersnaam> | revoke <gebruikersnaam> | reset-password <gebruikersnaam>')
      process.exitCode = 1
  }
} catch (e) {
  const error = e as Error
  // A failed query hides the real reason (a wrong password, no database) in its cause
  const cause = error.cause instanceof Error ? error.cause.message : null
  console.error(cause ?? error.message)
  if (cause) console.error('Kan de database niet bereiken. Draai dit als de kuddes-gebruiker in /opt/kuddes: sudo -u kuddes npm run admin -- ...')
  process.exitCode = 1
} finally {
  await sql.end()
}
