import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { withSmileys } from './smileys'

/**
 * Light formatting for WieWatWaars: **vet**, *schuin*, ~~doorgestreept~~,
 * [tekst](https://…) and bare links. Produces React elements, never HTML,
 * so posts can't inject markup. Only http(s) links and pages on Kuddes
 * itself ([tekst](/spellen)) are turned into links.
 */
const TOKEN =
  /(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(\[[^\]\n]{1,100}\]\((?:https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\))|(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/g

/**
 * The forum has a few more: __onderstreept__, ^^superscript^^, ,,subscript,,,
 * ==gemarkeerd== and `code`. Code goes first, so what's inside it stays as typed.
 */
const FORUM_TOKEN =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(\[[^\]\n]{1,100}\]\((?:https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\))|(https?:\/\/[^\s<>()`]+[^\s<>().,!?;:'"`])|(__[^_\n]+__)|(\^\^[^^\n]+\^\^)|(,,[^,\n]+,,)|(==[^=\n]+==)/g

/** "@sanne": a link to that profile (the server notifies them, server/lib/notifications.ts). Not in e-mail addresses. */
const MENTION = /(?<![\p{L}\p{N}_.@-])@([a-z0-9][a-z0-9_.-]{1,18}[a-z0-9_])/giu

/** Plain text: mentions become links, the rest gets its smileys. */
function plain(text: string, key: () => number): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MENTION)) {
    const index = m.index ?? 0
    if (index > last) out.push(...withSmileys(text.slice(last, index)).map((n) => <span key={key()}>{n}</span>))
    out.push(
      <Link key={key()} to={`/profiel/${m[1].toLowerCase()}`} className="mention">
        @{m[1]}
      </Link>,
    )
    last = index + m[0].length
  }
  if (last < text.length) out.push(...withSmileys(text.slice(last)).map((n) => <span key={key()}>{n}</span>))
  return out
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="nofollow noopener noreferrer ugc">
      {children}
    </a>
  )
}

/** A line that starts with "- " or "• " is a bullet point. */
const BULLET = /^[ \t]*[-•][ \t]+(.*)$/

/**
 * The text with its formatting. Outside the forum (which has its own blocks),
 * line breaks become new lines and "- " / "• " lines a bullet list. Both are
 * inline elements, so it can go inside a <p>.
 */
export function RichText({ text: raw, forum }: { text: string; forum?: boolean }) {
  // Posts sent as a form (the Kudde prikbord) have Windows line ends
  const text = raw.replace(/\r\n?/g, '\n')
  if (forum || !text.includes('\n')) {
    const bullet = forum ? null : BULLET.exec(text)
    return bullet ? <span className="rt-li">{inline(bullet[1])}</span> : <>{inline(text, forum)}</>
  }
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        const bullet = BULLET.exec(line)
        if (bullet) return <span key={i} className="rt-li">{inline(bullet[1])}</span>
        // A bullet point is its own line already; otherwise a break before every line but the first
        const breakBefore = i > 0 && !BULLET.test(lines[i - 1])
        return (
          <Fragment key={i}>
            {breakBefore && <br />}
            {inline(line)}
          </Fragment>
        )
      })}
    </>
  )
}

/** One line: bold, italic, links, mentions and smileys. */
function inline(text: string, forum?: boolean): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  const next = () => key++
  for (const match of text.matchAll(forum ? FORUM_TOKEN : TOKEN)) {
    const [token, ...groups] = match
    // The forum's pattern has code first and its extras at the end
    const [code, bold, strike, italic, mdLink, url, underline, sup, sub, mark] = forum ? groups : [undefined, ...groups]
    const index = match.index ?? 0
    if (index > last) out.push(...plain(text.slice(last, index), next))

    if (code) out.push(<code key={key++}>{code.slice(1, -1)}</code>)
    else if (underline) out.push(<u key={key++}>{withSmileys(underline.slice(2, -2))}</u>)
    else if (sup) out.push(<sup key={key++}>{withSmileys(sup.slice(2, -2))}</sup>)
    else if (sub) out.push(<sub key={key++}>{withSmileys(sub.slice(2, -2))}</sub>)
    else if (mark) out.push(<mark key={key++}>{withSmileys(mark.slice(2, -2))}</mark>)
    else if (bold) out.push(<strong key={key++}>{withSmileys(bold.slice(2, -2))}</strong>)
    else if (strike) out.push(<s key={key++}>{withSmileys(strike.slice(2, -2))}</s>)
    else if (italic) out.push(<em key={key++}>{withSmileys(italic.slice(1, -1))}</em>)
    else if (mdLink) {
      const [, label, href] = mdLink.match(/^\[(.+)\]\((.+)\)$/)!
      out.push(
        href.startsWith('/') ? (
          <Link key={key++} to={href}>
            {label}
          </Link>
        ) : (
          <ExternalLink key={key++} href={href}>
            {label}
          </ExternalLink>
        ),
      )
    } else if (url) {
      out.push(
        <ExternalLink key={key++} href={url}>
          {url.replace(/^https?:\/\//, '')}
        </ExternalLink>,
      )
    }
    last = index + token.length
  }
  if (last < text.length) out.push(...plain(text.slice(last), next))
  return out
}
