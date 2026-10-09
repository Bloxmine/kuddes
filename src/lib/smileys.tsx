import type { ReactNode } from 'react'
import { SMILEY_PATTERN, SMILEYS, smileyName } from '../../shared/smileys'

/** One Hyves smiley, as its original GIF. */
export function Smiley({ name }: { name: string }) {
  const info = SMILEYS[name]
  if (!info) return <>{`:${name}:`}</>
  const [width, height] = info
  return (
    <img
      className="smiley"
      src={`/smileys/${name}.gif`}
      width={width}
      height={height}
      alt={`:${name}:`}
      title={`:${name}:`}
      loading="lazy"
      decoding="async"
    />
  )
}

/** Replaces smiley codes (:dj:, :-), (l)…) in a string with the smileys. */
export function withSmileys(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = new RegExp(SMILEY_PATTERN.source, 'g')
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const name = smileyName(match[0])
    if (!name) {
      // Not a smiley (e.g. ":30:" in a time); retry from the next character so ":x:dj:" still finds :dj:
      pattern.lastIndex = match.index + 1
      continue
    }
    if (match.index > last) out.push(text.slice(last, match.index))
    out.push(<Smiley key={out.length} name={name} />)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
