import { useId, useState, type ReactNode } from 'react'
import { FarmIcon } from './FarmIcon'
import type { FarmIconName } from './farmIcons'
import './Box.css'

type BoxTab = {
  key: string
  label: string
  content: ReactNode
}

type BoxProps = {
  title?: ReactNode
  /** A Farm-Fresh icon shown before the title. */
  icon?: FarmIconName
  actions?: ReactNode
  className?: string
  noPadding?: boolean
  children?: ReactNode
  /** When given, the header renders tabs instead of a title. */
  tabs?: BoxTab[]
}

/** The bordered content box with a glossy header, used for nearly every block. */
export function Box({ title, icon, actions, className, noPadding, children, tabs }: BoxProps) {
  const [current, setCurrent] = useState(tabs?.[0]?.key)
  const id = useId()
  const activeTab = tabs?.find((t) => t.key === current)

  return (
    <section className={['box', className].filter(Boolean).join(' ')}>
      <header className="box-hdr">
        {tabs ? (
          <ul className="box-tabs" role="tablist">
            {tabs.map((tab) => (
              <li key={tab.key} className={tab.key === current ? 'current' : undefined}>
                <button
                  type="button"
                  role="tab"
                  id={`${id}-${tab.key}`}
                  aria-selected={tab.key === current}
                  onClick={() => setCurrent(tab.key)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <h2 className="box-title">
            {icon && (
              <span className="box-icon">
                <FarmIcon name={icon} />
              </span>
            )}
            {title}
          </h2>
        )}
        {actions && <div className="box-actns">{actions}</div>}
      </header>
      <div
        className={noPadding ? 'box-con box-con-flush' : 'box-con'}
        role={tabs ? 'tabpanel' : undefined}
        aria-labelledby={tabs ? `${id}-${current}` : undefined}
      >
        {activeTab ? activeTab.content : children}
      </div>
    </section>
  )
}

/** A divided sub-section inside a box. */
export function BoxSection({ children, alt }: { children: ReactNode; alt?: boolean }) {
  return <div className={alt ? 'box-sctn alt' : 'box-sctn'}>{children}</div>
}
