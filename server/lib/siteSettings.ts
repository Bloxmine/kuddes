/**
 * Settings the admin changes in Beheer (Aanmeldingen, Rustige stand, Servers), kept in site_settings.
 * They're read on every request, so they live in memory: loaded at start-up,
 * replaced when the admin saves, and reloaded every 15 seconds (server/index.ts).
 *
 * signupMode, how new members get in:
 * - 'mail': they click the link in a confirmation mail (the normal way);
 * - 'approval': the waitlist, they wait until the admin approves them.
 * Either way, until then they see what a visitor sees and can only change
 * their own account, and the admin can let someone in by hand (Beheer →
 * Aanmeldingen). The first default comes from SIGNUP_APPROVAL in .env, or
 * else from whether mail is set up.
 */
import { config } from '../config'
import { db } from '../db/client'
import { siteSettings } from '../db/schema'
import { mailEnabled } from './mail'
import { DEFAULT_SAFETY, type SafetySettings } from '../../shared/safety'
import type { ServerInfo, ServerInfoInput } from '../../shared/federation'

export type SignupMode = 'mail' | 'approval'

const defaultMode = (): SignupMode => {
  const env = process.env.SIGNUP_APPROVAL
  if (env === '1') return 'approval'
  if (env === '0') return 'mail'
  return mailEnabled() || !config.isProduction ? 'mail' : 'approval'
}

let mode: SignupMode = defaultMode()
let safetySettings: SafetySettings = DEFAULT_SAFETY

/**
 * This server's address: PUBLIC_URL, or the API itself while developing. It's
 * part of every member's federated address (naam@domein), so it can't change
 * once the server federates.
 */
export const baseUrl = () => (config.publicUrl || `http://${config.host}:${config.port}`).replace(/\/+$/, '')
export const serverDomain = () => new URL(baseUrl()).host

/** The first values, until the admin fills in Beheer → Servers (SERVER_* in .env can give them too). */
const defaultServerInfo = (): ServerInfoInput => ({
  name: process.env.SERVER_NAME ?? 'Kuddes',
  description: process.env.SERVER_DESCRIPTION ?? 'Een gezellige vriendensite, zoals vroeger.',
  adminName: process.env.SERVER_ADMIN_NAME ?? '',
  contactEmail: process.env.SERVER_CONTACT_EMAIL ?? `privacy@${serverDomain().replace(/:\d+$/, '')}`,
  country: process.env.SERVER_COUNTRY ?? 'Nederland',
  hosting: process.env.SERVER_HOSTING ?? '',
  mailService: process.env.SERVER_MAIL_SERVICE ?? '',
  rules: '',
  federation: process.env.FEDERATION === 'uit' ? 'uit' : 'open',
  fediverse: process.env.FEDIVERSE !== 'uit',
})
let serverSettings: ServerInfoInput = defaultServerInfo()

/** Saved settings over the defaults, so a setting added later has a value too. */
function withSafetyDefaults(v: Partial<SafetySettings> | undefined): SafetySettings {
  return { ...DEFAULT_SAFETY, ...v, alerts: { ...DEFAULT_SAFETY.alerts, ...v?.alerts }, quiet: { ...DEFAULT_SAFETY.quiet, ...v?.quiet } }
}

export async function loadSiteSettings() {
  const rows = await db.select().from(siteSettings)
  const saved = rows.find((r) => r.key === 'signupMode')?.value
  mode = saved === 'mail' || saved === 'approval' ? saved : defaultMode()
  safetySettings = withSafetyDefaults(rows.find((r) => r.key === 'safety')?.value as Partial<SafetySettings> | undefined)
  serverSettings = { ...defaultServerInfo(), ...(rows.find((r) => r.key === 'server')?.value as Partial<ServerInfoInput> | undefined) }
}

/** About this server (Beheer → Servers): its name, who runs it, its rules and how it federates. */
export const serverInfo = (): ServerInfo => ({ ...serverSettings, domain: serverDomain() })

export async function setServerInfo(next: ServerInfoInput) {
  await db
    .insert(siteSettings)
    .values({ key: 'server', value: next })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: next, updatedAt: new Date() } })
  serverSettings = next
}

export const signupMode = () => mode
/** New members wait for the admin (instead of confirming their address by mail); the quiet mode can switch this on too. */
export const signupApproval = () => mode === 'approval' || (quiet()?.signups === 'wachtlijst')

/** Reports, mails to the admin and the quiet mode (Beheer → Rustige stand). */
export const safety = () => safetySettings
/** The quiet mode, when it's on. */
export const quiet = () => (safetySettings.quiet.on ? safetySettings.quiet : null)
/** No new accounts at all for now (the quiet mode). */
export const signupsClosed = () => quiet()?.signups === 'dicht'
/** After how many reports a post is hidden: fewer in the quiet mode. */
export const hideAfter = () => quiet()?.hideAfter ?? safetySettings.hideAfter

export async function setSafety(next: SafetySettings) {
  await db
    .insert(siteSettings)
    .values({ key: 'safety', value: next })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: next, updatedAt: new Date() } })
  safetySettings = next
}

export async function setSignupMode(next: SignupMode) {
  await db
    .insert(siteSettings)
    .values({ key: 'signupMode', value: next })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: next, updatedAt: new Date() } })
  mode = next
}
