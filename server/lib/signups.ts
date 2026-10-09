/**
 * Letting new members in. Normally they confirm their address by mail; with
 * the waitlist on (Beheer, server/lib/siteSettings.ts) they wait until the
 * admin approves them (Beheer → Aanmeldingen), and the admin gets a personal
 * message for each sign-up. Either way the admin can let someone in by hand,
 * and the member gets a welcome message (and a mail, when approved).
 */
import { and, eq } from 'drizzle-orm'
import { ageFrom } from './serialize'
import { db } from '../db/client'
import { emailTokens, users, type User } from '../db/schema'
import { approvedMail, mailEnabled, sendMailSoon } from './mail'
import { absolute } from './seo'
import { admins, deliverMessage } from './videoAccess'
import { botEvent } from './bots'

/** "Nieuwe aanmelding" in the admin's inbox, sent by the new member (so replying reaches them). */
export async function notifyAdminsOfSignup(user: User) {
  const body = [
    `${user.name} (@${user.username}) heeft zich aangemeld bij Kuddes en wacht op je goedkeuring.`,
    '',
    `**E-mailadres:** ${user.email}`,
    ...(user.city ? [`**Woonplaats:** ${user.city}`] : []),
    ...(ageFrom(user.birthdate) !== null ? [`**Leeftijd:** ${ageFrom(user.birthdate)}`] : []),
    ...(user.signupReason ? ['', '**Waarom ik lid wil worden:**', user.signupReason] : []),
    '',
    `Goedkeuren of weigeren: [Beheer → Aanmeldingen](${absolute('/beheer?tab=aanmeldingen')})`,
    `Profiel: [${user.name}](${absolute(`/profiel/${user.username}`)})`,
    '',
    'Je kunt ook op dit bericht antwoorden; dat komt bij het nieuwe lid terecht.',
  ].join('\n')
  for (const admin of await admins()) {
    if (admin.id !== user.id) await deliverMessage(user.id, admin.id, `Nieuwe aanmelding: ${user.name} (@${user.username})`, body)
  }
}

/**
 * "Welkom op Kuddes!" in the new member's inbox, from the admin: once they're
 * let in, by the admin or by confirming their address.
 */
export async function welcomeMember(user: User, from?: User) {
  // Bots that greet new members (Beheer → Bots), and automations
  botEvent({ trigger: 'nieuw_lid', member: user })
  void import('./automations').then((a) => a.automationEvent('nieuw_lid', { member: user }))
  const sender = from ?? (await admins()).find((a) => a.id !== user.id)
  if (!sender) return
  await deliverMessage(
    sender.id,
    user.id,
    'Welkom op Kuddes!',
    [
      `Hoi ${user.nickname}!`,
      '',
      `${from ? 'Je aanmelding is goedgekeurd' : 'Je e-mailadres is bevestigd'}: je kunt nu knuffels geven, WieWatWaars plaatsen, berichten sturen, lid worden van Kuddes en alles delen.`,
      '',
      `Tip: [pimp je profiel](${absolute('/instellingen#design')}) en zoek je vrienden op. Veel plezier!`,
    ].join('\n'),
  )
}

/** Lets the member in by hand (the waitlist, or a confirmation mail that never arrived): they can post from now on. */
export async function approveMember(user: User, admin: User) {
  const [approved] = await db.update(users).set({ emailVerifiedAt: new Date(), signupReason: null }).where(eq(users.id, user.id)).returning()
  // The link in their confirmation mail has done its job
  await db.delete(emailTokens).where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, 'bevestigen')))
  await welcomeMember(user, admin)
  if (mailEnabled()) sendMailSoon(approvedMail(user.email, user.nickname, absolute(`/profiel/${user.username}`)))
  return approved
}
