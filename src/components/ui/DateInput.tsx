/**
 * Date (and date + time) fields that are always Dutch: dd-mm-jjjj and 24-hour
 * uu:mm, whatever language the browser is in (the browser's own date fields
 * follow that language, so an English browser shows mm/dd/yyyy). The values
 * are the same as the browser's fields: "2026-09-29" and "2026-09-29T20:30".
 */
import { useEffect, useId, useRef, useState } from 'react'
import { FarmIcon } from './FarmIcon'
import './DateInput.css'

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** "2026-09-29" → "29-09-2026" */
function toText(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** "29-9-2026", "29.09.2026", "29/9/2026" or "29092026" → "2026-09-29"; null when it isn't a real date. */
function parseText(text: string): string | null {
  const t = text.trim()
  const m = /^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{4})$/.exec(t) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(t)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (y < 1900 || y > 2100 || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return iso(y, mo, d)
}

/**
 * While typing only digits, the dashes go in by themselves (29092026 → 29-09-2026).
 * Anything typed with its own separators (1-5-1990) is left as it is.
 */
function autoFormat(text: string) {
  if (!/^[\d-]*$/.test(text) || [...text].some((ch, i) => ch === '-' && i !== 2 && i !== 5)) return text
  const digits = text.replace(/-/g, '').slice(0, 8)
  let out = digits.slice(0, 2)
  if (digits.length > 2) out += `-${digits.slice(2, 4)}`
  if (digits.length > 4) out += `-${digits.slice(4)}`
  return out
}

/** "2030" → "20:30", "930" → "09:30"; null when it isn't a time. */
function parseTime(text: string): string | null {
  const t = text.trim()
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(t) ?? /^(\d{1,2})(\d{2})$/.exec(t) ?? /^(\d{1,2})$/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null
}

type Common = { id?: string; required?: boolean; disabled?: boolean; className?: string; 'aria-label'?: string }

/** A month to pick a day from, Monday first. */
function Calendar({ value, min, max, onPick, onClose }: { value: string; min?: string; max?: string; onPick: (v: string) => void; onClose: () => void }) {
  const start = value || new Date().toISOString().slice(0, 10)
  const [year, setYear] = useState(Number(start.slice(0, 4)))
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1)
  const box = useRef<HTMLDivElement>(null)
  const today = (() => {
    const d = new Date()
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
  })()

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!box.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [onClose])

  const step = (n: number) => {
    const d = new Date(year, month + n, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }
  const first = (new Date(year, month, 1).getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const thisYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = thisYear + 10; y >= 1900; y--) years.push(y)

  return (
    <div ref={box} className="di-cal" role="dialog" aria-label="Kies een datum">
      <div className="di-cal-head">
        <button type="button" className="di-cal-step" onClick={() => step(-1)} aria-label="Vorige maand">
          ‹
        </button>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Maand">
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Jaar">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="button" className="di-cal-step" onClick={() => step(1)} aria-label="Volgende maand">
          ›
        </button>
      </div>
      <div className="di-cal-grid">
        {DAYS.map((d) => (
          <span key={d} className="di-cal-day-name">
            {d}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const v = iso(year, month + 1, i + 1)
          const off = (!!min && v < min.slice(0, 10)) || (!!max && v > max.slice(0, 10))
          const cls = ['di-cal-day', v === value && 'selected', v === today && 'today'].filter(Boolean).join(' ')
          return (
            <button key={v} type="button" className={cls} disabled={off} onClick={() => onPick(v)} aria-label={`${i + 1} ${MONTHS[month]} ${year}`} aria-pressed={v === value}>
              {i + 1}
            </button>
          )
        })}
      </div>
      <div className="di-cal-foot">
        <button type="button" className="link-button" onClick={() => onPick(today)} disabled={(!!min && today < min.slice(0, 10)) || (!!max && today > max.slice(0, 10))}>
          Vandaag
        </button>
      </div>
    </div>
  )
}

/** A date as dd-mm-jjjj; `value` and `onChange` use "jjjj-mm-dd" ('' = empty or not a date yet). */
export function DateInput({ value, onChange, min, max, ...rest }: Common & { value: string; onChange: (value: string) => void; min?: string; max?: string }) {
  const [text, setText] = useState(() => toText(value))
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const autoId = useId()

  // A new value from outside (a reset, a loaded form): show it
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if ((parseText(text) ?? '') !== value) setText(toText(value))
  }

  const bad = text.trim() !== '' && parseText(text) === null
  useEffect(() => {
    input.current?.setCustomValidity(bad ? 'Vul de datum in als dd-mm-jjjj, bijvoorbeeld 29-09-1995.' : '')
  }, [bad])

  const type = (t: string) => {
    const next = autoFormat(t)
    setText(next)
    onChange(parseText(next) ?? '')
  }

  return (
    <span className={`di${rest.className ? ` ${rest.className}` : ''}`}>
      <input
        ref={input}
        id={rest.id ?? autoId}
        className="text-box di-text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd-mm-jjjj"
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={() => {
          const v = parseText(text)
          if (v) setText(toText(v))
        }}
        required={rest.required}
        disabled={rest.disabled}
        aria-label={rest['aria-label']}
        aria-invalid={bad || undefined}
      />
      <button type="button" className="di-pick" onClick={() => setOpen((o) => !o)} disabled={rest.disabled} aria-label="Kalender" aria-expanded={open} title="Kies op de kalender">
        <FarmIcon name="calendar" />
      </button>
      {open && (
        <Calendar
          value={value}
          min={min}
          max={max}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            setText(toText(v))
            onChange(v)
            setOpen(false)
            input.current?.focus()
          }}
        />
      )}
    </span>
  )
}

/** A time as uu:mm (24 hours). */
function TimeInput({ value, onChange, ...rest }: Common & { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if ((parseTime(text) ?? '') !== value) setText(value)
  }
  const bad = text.trim() !== '' && parseTime(text) === null
  useEffect(() => {
    input.current?.setCustomValidity(bad ? 'Vul de tijd in als uu:mm, bijvoorbeeld 20:30.' : '')
  }, [bad])
  return (
    <input
      ref={input}
      className="text-box di-time"
      inputMode="numeric"
      autoComplete="off"
      placeholder="uu:mm"
      maxLength={5}
      value={text}
      onChange={(e) => {
        let t = e.target.value
        // 2030 → 20:30 as you type (930 becomes 09:30 when you leave the field)
        if (/^\d{4}$/.test(t)) t = `${t.slice(0, 2)}:${t.slice(2)}`
        setText(t)
        onChange(parseTime(t) ?? '')
      }}
      onBlur={() => {
        const v = parseTime(text)
        if (v) setText(v)
      }}
      required={rest.required}
      disabled={rest.disabled}
      aria-label={rest['aria-label'] ?? 'Tijd'}
      aria-invalid={bad || undefined}
    />
  )
}

/**
 * A date and a time; `value` and `onChange` use "jjjj-mm-ddTuu:mm" ('' until
 * both are filled in). Picking a date with no time yet fills in `defaultTime`.
 */
export function DateTimeInput({
  value,
  onChange,
  min,
  defaultTime = '20:00',
  ...rest
}: Common & { value: string; onChange: (value: string) => void; min?: string; defaultTime?: string }) {
  const [date, setDate] = useState(value.slice(0, 10))
  const [time, setTime] = useState(value.slice(11, 16))
  // What we last sent up, so a new value from outside (a reset) can be told apart
  const [sent, setSent] = useState(value)
  if (value !== sent) {
    setSent(value)
    setDate(value.slice(0, 10))
    setTime(value.slice(11, 16))
  }

  const emit = (d: string, t: string) => {
    const next = d && t ? `${d}T${t}` : ''
    setSent(next)
    onChange(next)
  }

  return (
    <span className="di-dt">
      <DateInput
        {...rest}
        value={date}
        min={min}
        onChange={(d) => {
          const t = d && !time ? defaultTime : time
          setDate(d)
          setTime(t)
          emit(d, t)
        }}
      />
      <TimeInput
        value={time}
        required={rest.required}
        disabled={rest.disabled}
        onChange={(t) => {
          setTime(t)
          emit(date, t)
        }}
      />
    </span>
  )
}
