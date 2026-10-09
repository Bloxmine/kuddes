import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

/** Label + input + validation message. */
export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className={error ? 'field has-error' : 'field'}>
      <span>
        {label} {hint && <span className="hint">{hint}</span>}
      </span>
      {children}
      {error && <span className="form-error">{error}</span>}
    </label>
  )
}
