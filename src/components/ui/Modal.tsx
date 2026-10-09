import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FarmIcon } from './FarmIcon'
import type { FarmIconName } from './farmIcons'
import { Icon } from './Icon'
import './Modal.css'

/**
 * A box on a dimmed page; Escape, the × or a click outside closes it. It's
 * rendered at the end of <body>, so it can be opened from inside a form.
 */
export function Modal({ title, icon, onClose, children, wide }: { title: string; icon: FarmIconName; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // The page behind stays put while the box is open
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return createPortal(
    // React passes events up through the portal: a form in here must never also submit the form it was opened from
    <div className="modal-overlay" onClick={onClose} onSubmit={(e) => e.stopPropagation()}>
      <div className={wide ? 'box modal wide' : 'box modal'} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="box-hdr">
          <h2 className="box-title">
            <span className="box-icon">
              <FarmIcon name={icon} />
            </span>{' '}
            {title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Sluiten">
            <Icon name="x" />
          </button>
        </header>
        <div className="box-con modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
