import { ANSWER_MAX, type FormAnswers, type Question } from '../../../shared/documents'

/** The input for one question, the same in the builder's preview and on the page that's filled in. */
export function AnswerField({
  q,
  value,
  onChange,
  disabled,
}: {
  q: Question
  value: FormAnswers[string] | undefined
  onChange: (v: FormAnswers[string]) => void
  disabled?: boolean
}) {
  const name = `frm-${q.id}`
  switch (q.type) {
    case 'kort':
      return (
        <input
          className="text-box frm-input"
          value={String(value ?? '')}
          maxLength={ANSWER_MAX}
          disabled={disabled}
          placeholder="Je antwoord"
          onChange={(e) => onChange(e.target.value)}
          aria-label={q.title}
        />
      )
    case 'lang':
      return (
        <textarea
          className="text-box frm-input"
          value={String(value ?? '')}
          maxLength={ANSWER_MAX}
          rows={4}
          disabled={disabled}
          placeholder="Je antwoord"
          onChange={(e) => onChange(e.target.value)}
          aria-label={q.title}
        />
      )
    case 'getal':
      return (
        <input
          className="text-box frm-input frm-short"
          type="number"
          step="any"
          value={value === undefined ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={q.title}
        />
      )
    case 'datum':
      return (
        <input
          className="text-box frm-input frm-short"
          type="date"
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={q.title}
        />
      )
    case 'lijst':
      return (
        <select className="text-box frm-input frm-short" value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={q.title}>
          <option value="">Kies…</option>
          {q.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      )
    case 'keuze':
      return (
        <div className="frm-choices" role="radiogroup" aria-label={q.title}>
          {q.options.map((o) => (
            <label key={o}>
              <input type="radio" name={name} checked={value === o} disabled={disabled} onChange={() => onChange(o)} /> {o}
            </label>
          ))}
        </div>
      )
    case 'vinkjes': {
      const list = Array.isArray(value) ? value : []
      return (
        <div className="frm-choices" role="group" aria-label={q.title}>
          {q.options.map((o) => (
            <label key={o}>
              <input type="checkbox" checked={list.includes(o)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      )
    }
    case 'schaal':
      return (
        <div className="frm-scale" role="radiogroup" aria-label={q.title}>
          {Array.from({ length: q.scaleMax ?? 5 }, (_, i) => i + 1).map((n) => (
            <label key={n}>
              <span>{n}</span>
              <input type="radio" name={name} checked={value === n} disabled={disabled} onChange={() => onChange(n)} />
            </label>
          ))}
        </div>
      )
  }
}
