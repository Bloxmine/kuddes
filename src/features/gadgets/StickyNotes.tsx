import { useState } from 'react'
import type { Gadget } from '../../../shared/api'
import { LIMITS, NOTE_COLORS, type NoteColor, type StickyNote } from '../../../shared/gadgets'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { errorMessage } from '../../lib/api'
import { withSmileys } from '../../lib/smileys'
import { useGadgetActions } from './useGadgetActions'

type NotesGadget = Extract<Gadget, { type: 'notities' }>

/** A steady tilt per note, so the board doesn't reshuffle on every render. */
function tilt(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ((Math.abs(h) % 7) - 3) * 0.9
}

const newId = () => Math.random().toString(36).slice(2, 10)

/** Paper notes pinned to a cork board. The owner writes on them right here. */
export function StickyNotes({ gadget, username, isOwner }: { gadget: NotesGadget; username: string; isOwner: boolean }) {
  const { update } = useGadgetActions(username)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const notes = gadget.config.notes

  const save = (next: StickyNote[]) => update.mutate({ id: gadget.id, config: { notes: next } })
  const finish = (note: StickyNote) => {
    setEditing(null)
    const text = draft.trim()
    if (!text) save(notes.filter((n) => n.id !== note.id))
    else if (text !== note.text) save(notes.map((n) => (n.id === note.id ? { ...n, text } : n)))
  }

  return (
    <div className="corkboard">
      {notes.length === 0 && !isOwner && <p className="corkboard-empty">Nog geen briefjes.</p>}
      <ul className="sticky-notes">
        {notes.map((note) => (
          <li
            key={note.id}
            className={editing === note.id ? 'sticky-note editing' : 'sticky-note'}
            style={{ '--note': NOTE_COLORS[note.color], '--tilt': `${tilt(note.id)}deg` } as React.CSSProperties}
          >
            <span className="sticky-pin" aria-hidden="true" />
            {editing === note.id ? (
              <>
                <textarea
                  autoFocus
                  value={draft}
                  maxLength={LIMITS.noteText}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => finish(note)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(null)
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(note)
                  }}
                  aria-label="Tekst van het briefje"
                />
                <div className="sticky-colors" onMouseDown={(e) => e.preventDefault()}>
                  {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      aria-label={`Kleur ${c}`}
                      aria-pressed={note.color === c}
                      style={{ background: NOTE_COLORS[c] }}
                      onClick={() => save(notes.map((n) => (n.id === note.id ? { ...n, color: c } : n)))}
                    />
                  ))}
                  <button
                    type="button"
                    className="sticky-delete"
                    title="Briefje weghalen"
                    aria-label="Briefje weghalen"
                    onClick={() => {
                      setEditing(null)
                      save(notes.filter((n) => n.id !== note.id))
                    }}
                  >
                    <FarmIcon name="note_delete" />
                  </button>
                </div>
              </>
            ) : isOwner ? (
              <button
                type="button"
                className="sticky-text"
                title="Klik om te bewerken"
                onClick={() => {
                  setDraft(note.text)
                  setEditing(note.id)
                }}
              >
                {withSmileys(note.text)}
              </button>
            ) : (
              <p className="sticky-text">{withSmileys(note.text)}</p>
            )}
          </li>
        ))}
        {isOwner && notes.length < LIMITS.notes && (
          <li className="sticky-add">
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => {
                const note: StickyNote = { id: newId(), text: 'Nieuw briefje', color: 'geel' }
                save([...notes, note])
                setDraft(note.text)
                setEditing(note.id)
              }}
            >
              <FarmIcon name="note_add" size={32} />
              Briefje erbij
            </button>
          </li>
        )}
      </ul>
      {update.isError && <p className="form-error">{errorMessage(update.error)}</p>}
    </div>
  )
}
