import type { ReactNode } from 'react'

/**
 * A window like Windows Live Messenger 2009's: a glassy title bar with the
 * title on the left and minimise, maximise and close on the right, in the
 * site's colours. Maximise opens the full-screen Messenger (/messenger).
 */
export function WlmWindow({
  title,
  icon,
  className = '',
  onMinimize,
  onMaximize,
  onRestore,
  onClose,
  children,
  label,
}: {
  title: ReactNode
  icon?: ReactNode
  className?: string
  onMinimize?: () => void
  onMaximize?: () => void
  /** On /messenger: back to the small pop-up. */
  onRestore?: () => void
  onClose?: () => void
  children: ReactNode
  label: string
}) {
  return (
    <section className={`wlm-window ${className}`} role="dialog" aria-label={label}>
      <header className="wlm-titlebar">
        <span className="wlm-title">
          {icon}
          <span className="wlm-title-text">{title}</span>
        </span>
        <span className="wlm-caption">
          {onMinimize && (
            <button type="button" className="wlm-cap wlm-cap-min" onClick={onMinimize} aria-label="Minimaliseren" title="Minimaliseren">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1" y="6.5" width="8" height="2.2" rx=".4" />
              </svg>
            </button>
          )}
          {onMaximize && (
            <button type="button" className="wlm-cap wlm-cap-max" onClick={onMaximize} aria-label="Groot openen" title="Groot openen">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1.2 1.2h7.6v7.6H1.2z" fill="none" strokeWidth="1.3" />
                <rect x="1.2" y="1.2" width="7.6" height="2" />
              </svg>
            </button>
          )}
          {onRestore && (
            <button type="button" className="wlm-cap wlm-cap-max" onClick={onRestore} aria-label="Klein maken" title="Klein maken">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1 3.5h5.5V9H1zM3.5 1H9v5.5" fill="none" strokeWidth="1.2" />
                <rect x="1" y="3.5" width="5.5" height="1.6" />
              </svg>
            </button>
          )}
          {onClose && (
            <button type="button" className="wlm-cap wlm-cap-close" onClick={onClose} aria-label="Sluiten" title="Sluiten">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </span>
      </header>
      <div className="wlm-body">{children}</div>
    </section>
  )
}
