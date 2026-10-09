import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './Dropdown.css'

type DropdownProps = {
  /** Contents of the toggle button. */
  label: ReactNode
  buttonClassName?: string
  align?: 'left' | 'right'
  /** Also open on hover (for the navigation bar). */
  hover?: boolean
  title?: string
  /** A speech bubble: rounded, popping out of the button, with a tail pointing at it. */
  bubble?: boolean
  children: (close: () => void) => ReactNode
}

/** A button with a menu panel. Closes on outside click and Escape. */
export function Dropdown({ label, buttonClassName, align = 'left', hover, title, bubble, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)

  // The bubble's tail right under the icon it pops out of, wherever the panel ended up
  useLayoutEffect(() => {
    if (!open || !bubble) return
    const button = ref.current?.querySelector('button')
    const box = panel.current
    if (!button || !box) return
    // The icon in an icon button (a profile picture, a bell), else the middle of the button (a menu with a name)
    const icon = (!/[a-z]/i.test(button.textContent ?? '') && button.querySelector('.avatar-img, img, svg')) || button
    const b = icon.getBoundingClientRect()
    // Layout positions, not getBoundingClientRect: the panel is still scaled by its pop animation
    const fixed = getComputedStyle(box).position === 'fixed'
    const left = (fixed || !box.offsetParent ? 0 : box.offsetParent.getBoundingClientRect().left) + box.offsetLeft
    const x = b.left + b.width / 2 - left
    box.style.setProperty('--tail-x', `${Math.min(Math.max(x, 16), box.offsetWidth - 16)}px`)
    box.style.setProperty('--tail-origin', `${x}px`)
  }, [open, bubble])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={ref}
      className={open ? 'dropdown open' : 'dropdown'}
      onMouseEnter={hover ? () => setOpen(true) : undefined}
      onMouseLeave={hover ? () => setOpen(false) : undefined}
    >
      <button
        type="button"
        className={buttonClassName}
        aria-expanded={open}
        aria-controls={id}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div id={id} ref={panel} className={`dropdown-panel dropdown-${align}${bubble ? ' bubble' : ''}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
