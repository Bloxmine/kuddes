/**
 * Sending e-mail: the confirmation link after signing up, "wachtwoord
 * vergeten", confirming a new address and "you're approved". Goes through the SMTP relay in
 * .env (SMTP_HOST…, see DEPLOY.md); without one (development) the mail is
 * printed in the server log, links and all.
 */
import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config'

let transport: Transporter | null = null

function transporter() {
  if (!config.mail.host) return null
  transport ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    // 465 is TLS from the start; 587 upgrades with STARTTLS, which is required whenever there's a password to protect
    secure: config.mail.port === 465,
    requireTLS: config.mail.port !== 465 && !!config.mail.user,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  })
  return transport
}

/** A mail relay is set up; without one, mails only go to the log. */
export const mailEnabled = () => !!config.mail.host

export type Mail = { to: string; subject: string; text: string; html: string }

export async function sendMail(mail: Mail) {
  const t = transporter()
  if (!t) {
    if (config.isProduction) console.warn('[mail] SMTP_HOST is not set: this mail is only logged')
    console.log(`\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n${mail.text}\n`)
    return
  }
  await t.sendMail({ from: config.mail.from, ...mail })
}

/** Sends without making the request wait or fail; problems end up in the log. */
export function sendMailSoon(mail: Mail) {
  sendMail(mail).catch((e) => console.error('[mail] sending failed:', mail.to, mail.subject, e))
}

// ------------------------------------------------------------- templates

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

type Layout = {
  /** The grey line mail programs show after the subject. */
  preheader: string
  /** A Farm-Fresh icon (32×32) next to the title. */
  icon: string
  title: string
  greeting: string
  lines: string[]
  button: string
  link: string
  /** Small print under the button: how long the link works, what to do if it wasn't you. */
  footer: string
}

/**
 * A mail in the Kuddes style: the blue bar with the white logo, a white card
 * with a Farm-Fresh icon and the title, one big button, and the link spelled
 * out for mail programs without buttons. Tables and inline styles only (mail
 * programs ignore stylesheets); with images off it still reads fine. The
 * pictures come from the site the link points to.
 */
function layout({ preheader, icon, title, greeting, lines, button, link, footer }: Layout): { text: string; html: string } {
  const site = new URL(link).origin
  const text = [greeting, '', ...lines, '', `${button}:`, link, '', footer, '', '--', 'Kuddes · Altijd lief voor elkaar!', site].join('\n')
  const font = "Verdana,Geneva,'DejaVu Sans',sans-serif"
  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#dcedf9;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#dcedf9">${escape(preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#dcedf9"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px">
<tr><td style="background:#4ba3e0;background-image:linear-gradient(#8ccbf5,#4ba3e0 60%,#3b93d0);border:1px solid #3a8fcb;border-bottom:0;border-radius:10px 10px 0 0;padding:14px 22px">
<a href="${escape(site)}" style="text-decoration:none"><img src="${escape(site)}/kuddes-logo.png" width="112" height="45" alt="kuddes" style="display:block;border:0;width:112px;height:45px;color:#ffffff;font:bold 28px Arial,sans-serif;letter-spacing:-1px"></a>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #bcdcf3;border-top:0;padding:26px 26px 10px;font-family:${font};font-size:14px;line-height:1.6;color:#1b2733">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>
<td style="vertical-align:middle;padding-right:10px"><img src="${escape(site)}/icons/32/${icon}.png" width="32" height="32" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle;font:bold 19px Arial,sans-serif;color:#13324f">${escape(title)}</td>
</tr></table>
<p style="margin:0 0 12px;font-weight:bold;color:#13324f">${escape(greeting)}</p>
${lines.map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto"><tr><td align="center" style="border-radius:6px;background:#1f6fb0;background-image:linear-gradient(#6cbcf0,#1f6fb0)">
<a href="${escape(link)}" style="display:inline-block;padding:12px 30px;border:1px solid #185a91;border-radius:6px;font:bold 15px Arial,sans-serif;color:#ffffff;text-decoration:none;text-shadow:0 1px 0 #185a91">${escape(button)} &raquo;</a>
</td></tr></table>
<p style="margin:0 0 14px;padding:10px 12px;background:#f3f9fd;border:1px solid #dcecf8;border-radius:6px;font-size:11px;line-height:1.5;color:#5b6b7a">Werkt de knop niet? Kopieer deze link in je browser:<br><a href="${escape(link)}" style="color:#1d74bd;word-break:break-all">${escape(link)}</a></p>
<p style="margin:0 0 16px;font-size:12px;color:#5b6b7a">${escape(footer)}</p>
</td></tr>
<tr><td style="background:#eef6fc;border:1px solid #bcdcf3;border-top:1px solid #d7eaf8;border-radius:0 0 10px 10px;padding:12px 26px;font-family:${font};font-size:11px;line-height:1.5;color:#6b7b8a">
<a href="${escape(site)}" style="color:#1d74bd;font-weight:bold;text-decoration:none">Kuddes</a> · Altijd lief voor elkaar!<br>Dit is een automatische mail; antwoorden komt nergens aan. Vragen? Gebruik &quot;Probleem melden&quot; op de site.
</td></tr>
</table></td></tr></table></body></html>`
  return { text, html }
}

export function confirmMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Bevestig je e-mailadres voor Kuddes',
    ...layout({
      preheader: 'Nog één klik en je kunt alles op Kuddes.',
      icon: 'email_open',
      title: 'Welkom bij Kuddes!',
      greeting: `Hoi ${name}!`,
      lines: [
        'Leuk dat je je hebt aangemeld. Bevestig nog even dat dit jouw e-mailadres is, dan ben je binnen.',
        'Daarna zie je de profielen, foto’s en Kuddes van anderen, en kun je knuffels geven, WieWatWaars plaatsen, berichten sturen en alles delen.',
      ],
      button: 'Bevestig mijn e-mailadres',
      link,
      footer: 'De link werkt 3 dagen. Verlopen? Log in en vraag bovenaan de pagina een nieuwe aan. Heb jij je niet aangemeld bij Kuddes? Dan kun je deze mail negeren; zonder bevestiging gebeurt er niets.',
    }),
  }
}

export function resetMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Een nieuw wachtwoord voor Kuddes',
    ...layout({
      preheader: 'Kies met deze link een nieuw wachtwoord. De link werkt 1 uur.',
      icon: 'key',
      title: 'Nieuw wachtwoord',
      greeting: `Hoi ${name},`,
      lines: ['Je hebt gevraagd om een nieuw wachtwoord voor Kuddes. Klik op de knop en kies een nieuw wachtwoord; daarna ben je meteen ingelogd.', 'Voor de veiligheid word je dan overal anders uitgelogd.'],
      button: 'Kies een nieuw wachtwoord',
      link,
      footer: 'De link werkt 1 uur en maar één keer. Heb jij dit niet gevraagd? Negeer deze mail dan; je wachtwoord blijft hetzelfde.',
    }),
  }
}

export function newAddressMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Bevestig je nieuwe e-mailadres voor Kuddes',
    ...layout({
      preheader: 'Bevestig dat je dit adres voor Kuddes wilt gebruiken.',
      icon: 'email_edit',
      title: 'Nieuw e-mailadres',
      greeting: `Hoi ${name},`,
      lines: ['Je wilt dit adres gaan gebruiken voor Kuddes. Bevestig het met de knop; tot die tijd blijft je oude adres gewoon werken.'],
      button: 'Bevestig mijn nieuwe adres',
      link,
      footer: 'De link werkt 3 dagen. Heb jij dit niet gevraagd? Dan kun je deze mail negeren.',
    }),
  }
}

/** To the old address, so a stolen account can't quietly change its address. */
export function addressChangedMail(to: string, name: string, newAddress: string, link: string): Mail {
  const hidden = newAddress.replace(/^(.)[^@]*(@.*)$/, '$1•••$2')
  return {
    to,
    subject: 'Je e-mailadres bij Kuddes is gewijzigd',
    ...layout({
      preheader: `Je Kuddes-account gebruikt nu ${hidden}.`,
      icon: 'shield',
      title: 'Je e-mailadres is gewijzigd',
      greeting: `Hoi ${name},`,
      lines: [`Het e-mailadres van je Kuddes-account is gewijzigd naar ${hidden}. Mails van Kuddes gaan voortaan naar dat adres.`, 'Was jij dit niet? Kies dan meteen een nieuw wachtwoord, en laat het ons weten via "Probleem melden".'],
      button: 'Kies een nieuw wachtwoord',
      link,
      footer: 'Was jij het wel? Dan hoef je niets te doen.',
    }),
  }
}

export function approvedMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Welkom op Kuddes: je account is goedgekeurd!',
    ...layout({
      preheader: 'Je kunt nu alles op Kuddes.',
      icon: 'accept',
      title: 'Je bent goedgekeurd!',
      greeting: `Hoi ${name}!`,
      lines: ['Goed nieuws: je aanmelding bij Kuddes is goedgekeurd. Je kunt nu knuffels geven, WieWatWaars plaatsen, berichten sturen en lid worden van Kuddes.'],
      button: 'Naar Kuddes',
      link,
      footer: 'Veel plezier!',
    }),
  }
}

/** For the admin: something that needs a look (Beheer → Rustige stand decides which), or the weekly summary. */
export function adminAlertMail(to: string, name: string, subject: string, lines: string[], link: string, button = 'Bekijken'): Mail {
  return {
    to,
    subject: `Kuddes: ${subject}`,
    ...layout({
      preheader: lines[0] ?? subject,
      icon: 'shield',
      title: subject,
      greeting: `Hoi ${name},`,
      lines,
      button,
      link,
      footer: 'Welke mails je krijgt, stel je in onder Beheer → Rustige stand.',
    }),
  }
}

/** From Beheer, to check that the relay (Brevo) works. */
export function testMail(to: string, name: string): Mail {
  return {
    to,
    subject: 'Testmail van Kuddes',
    ...layout({
      preheader: 'De mailserver werkt.',
      icon: 'email_go',
      title: 'Het werkt!',
      greeting: `Hoi ${name},`,
      lines: [`Deze testmail kwam via ${config.mail.host} van ${config.mail.from}. Bevestigingsmails en "wachtwoord vergeten" komen op dezelfde manier aan.`, 'Kijk in je mailprogramma bij "origineel bekijken" of SPF, DKIM en DMARC op PASS staan.'],
      button: 'Naar Beheer',
      link: `${(config.publicUrl || 'http://localhost:5173').replace(/\/$/, '')}/beheer`,
      footer: 'Kwam deze mail in je spam? Kijk dan de DNS-records na (DEPLOY.md, stap 12.2).',
    }),
  }
}
