/**
 * Typing in a Messenger conversation (with one friend or a group): the
 * toolbar with smileys, the nudge, a glitterplaatje and something from the
 * site to share, the box to type in and Verzenden. The state lives in
 * useCompose (useCompose.ts), so the conversation can put the smileys over
 * its message area.
 */
import { useState, type ReactNode } from 'react'
import { MESSENGER_LIMITS } from '../../../shared/messenger'
import { SmileyPicker } from '../../components/social/SmileyPicker'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { GlitterImg } from '../glitters/GlitterImg'
import { GlitterPicker } from '../glitters/GlitterPicker'
import { ShareCard } from '../share/ShareCard'
import { sitePath } from '../share/shareLinks'
import { NudgeIcon } from './MessengerParts'
import type { Compose, ComposePanel } from './useCompose'

/** The smileys, over the whole message area: the window is small, a pop-up would be cut off. */
export function SmileyOverlay({ c }: { c: Compose }) {
  if (c.panel !== 'smileys') return null
  return (
    <div className="wlm-smileys" role="dialog" aria-label="Smileys">
      <SmileyPicker onPick={c.insert} msn />
      <button type="button" className="wlm-smileys-close" onClick={() => c.setPanel(null)} aria-label="Smileys sluiten" title="Sluiten">
        ×
      </button>
    </div>
  )
}

export function ComposeArea({ c, full, label, busy, onNudge, onEscape }: { c: Compose; full?: boolean; label: string; busy: boolean; onNudge: () => void; onEscape?: () => void }) {
  const [shareLink, setShareLink] = useState('')
  const { setInput, text, ready } = c
  const toggle = (p: ComposePanel) => c.setPanel(c.panel === p ? null : p)
  return (
    <div className="wlm-compose">
      <div className="wlm-format">
        <span className="wlm-drop">
          <button type="button" className="wlm-tool" aria-expanded={c.panel === 'smileys'} onClick={() => toggle('smileys')} title="Smileys">
            <FarmIcon name="emotion_happy" /> <span aria-hidden="true">▾</span>
          </button>
        </span>
        <button type="button" className="wlm-tool" onClick={onNudge} disabled={busy} title="Een nudge sturen">
          <NudgeIcon /> <span className="wlm-tool-label">Nudge</span>
        </button>
        <button type="button" className="wlm-tool" aria-expanded={c.panel === 'glitters'} onClick={() => c.setPanel('glitters')} title="Een glitterplaatje sturen">
          <FarmIcon name="rainbow" /> <span className="wlm-tool-label">Glitter</span>
        </button>
        <button type="button" className="wlm-tool" aria-expanded={c.panel === 'share'} onClick={() => toggle('share')} title="Iets van Kuddes delen: een recensie, recept, blog, video…">
          <FarmIcon name="link" /> <span className="wlm-tool-label">Delen</span>
        </button>
      </div>
      {c.panel === 'share' && (
        <form
          className="wlm-share-panel"
          onSubmit={(e) => {
            e.preventDefault()
            const path = sitePath(shareLink)
            if (!path) return
            c.setShare(path)
            setShareLink('')
            c.setPanel(null)
            c.focus()
          }}
        >
          <input
            className="text-box"
            value={shareLink}
            onChange={(e) => setShareLink(e.target.value)}
            placeholder="Plak een link van Kuddes (een recensie, recept, blog, video…)"
            aria-label="Link van Kuddes"
            autoFocus
          />
          <button type="submit" className="wlm-link-btn" disabled={!sitePath(shareLink)}>
            Toevoegen
          </button>
          <span className="muted">Of gebruik "Deel met" op de pagina zelf.</span>
        </form>
      )}
      {c.share && (
        <Pending onRemove={() => c.setShare(null)} what="Gedeelde pagina" className="wlm-pending-share">
          <ShareCard path={c.share} />
        </Pending>
      )}
      {c.glitter && (
        <Pending onRemove={() => c.setGlitter(null)} what="Glitterplaatje" className="wlm-pending-glitter">
          <GlitterImg glitter={{ id: c.glitter.id, title: c.glitter.title, url: c.glitter.url, width: c.glitter.width, height: c.glitter.height }} />
          <span className="muted">Gaat mee met je bericht</span>
        </Pending>
      )}
      {c.panel === 'glitters' && (
        <GlitterPicker
          onClose={() => c.setPanel(null)}
          onPick={(g) => {
            c.setGlitter(g)
            c.setPanel(null)
            c.focus()
          }}
        />
      )}
      <form
        className="wlm-type"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) c.say()
        }}
      >
        <textarea
          ref={setInput}
          value={text}
          maxLength={MESSENGER_LIMITS.text}
          rows={full ? 3 : 2}
          aria-label={label}
          onChange={(e) => c.type(e.target.value)}
          onPaste={(e) => {
            // A link from Kuddes pasted on its own: it goes along as a preview
            const path = sitePath(e.clipboardData.getData('text'))
            if (path && !c.share) {
              e.preventDefault()
              c.setShare(path)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!busy) c.say()
            }
            if (e.key === 'Escape') {
              c.setPanel(null)
              onEscape?.()
            }
          }}
        />
        <button type="submit" className="wlm-send" disabled={!ready || busy}>
          Verzenden
        </button>
      </form>
    </div>
  )
}

function Pending({ children, what, className, onRemove }: { children: ReactNode; what: string; className: string; onRemove: () => void }) {
  return (
    <div className={className}>
      {children}
      <button type="button" className="wlm-task-close" onClick={onRemove} aria-label={`${what} weghalen`} title="Weghalen">
        ×
      </button>
    </div>
  )
}
