import path from 'node:path'

const isProduction = process.env.NODE_ENV === 'production'

// In production the database password must come from the environment
if (isProduction && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy deploy/env.production.example to .env and fill it in.')
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://kuddes:kuddes@localhost:5433/kuddes',
  port: Number(process.env.PORT ?? 8787),
  /** 127.0.0.1 in production: only Caddy on the same server talks to the app. */
  host: process.env.HOST ?? (isProduction ? '127.0.0.1' : 'localhost'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  /** The BuddyPoke HTML5 port, served at /buddypoke/ for the profile gadget. */
  buddypokeDir: path.resolve(process.env.BUDDYPOKE_DIR ?? './web'),
  /** Bejeweled 3 (the web/ folder of games/bejeweled, with its assets), served at /bejeweled/. */
  bejeweledDir: path.resolve(process.env.BEJEWELED_DIR ?? './games/bejeweled/web'),
  isProduction,
  /** Behind a reverse proxy on this server (Caddy): trust its X-Forwarded-For. */
  trustProxy: process.env.TRUST_PROXY === '1',
  /** The public address, e.g. https://kuddes.example (links in mails and .ics files, and every member's federated address). */
  publicUrl: process.env.PUBLIC_URL ?? '',
  /** Served over HTTPS (the live site): HSTS and upgrading insecure requests. */
  https: (process.env.PUBLIC_URL ?? '').startsWith('https://'),
  sessionDays: 30,
  /**
   * Cloudflare Turnstile on the sign-up form, against spam accounts. Off
   * until both keys are set (dash.cloudflare.com → Turnstile).
   */
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY ?? '',
    secretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
  },
  /**
   * Outgoing mail (confirming addresses, resetting passwords) through an SMTP
   * relay such as Brevo. Without SMTP_HOST, mails are printed in the server log.
   * How new members get in (by mail or the waitlist) is set in Beheer
   * (server/lib/siteSettings.ts; SIGNUP_APPROVAL only gives the first default).
   */
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? `Kuddes <noreply@${(process.env.PUBLIC_URL ?? '').replace(/^https?:\/\//, '').replace(/[:/].*$/, '') || 'localhost'}>`,
  },
}
