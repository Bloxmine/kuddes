import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** "cta" is the big green sign-up button; "default" is the grey pill. */
  variant?: 'default' | 'cta'
}

export function Button({ variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', variant === 'cta' && 'btn-cta', className].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...rest} />
}
