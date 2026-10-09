import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DOC_KINDS, type DocKind, type DocumentItem } from '../../../shared/documents'
import { LIMITS, type DocGadget, type GadgetConfig } from '../../../shared/gadgets'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/time'
import { compile } from '../rekenmachine/graph'
import { GRAPH_COLORS } from '../rekenmachine/graphDraw'
import './ToolGadgets.css'

/** Your own files from Tools, of one kind or all, newest first. */
const useMyDocs = (kind?: DocKind) =>
  useQuery({
    queryKey: ['me', 'documents', 'soort', kind ?? 'alle'] as const,
    queryFn: () => api<DocumentItem[]>(`/me/documents${kind ? `?soort=${kind}` : ''}`),
  })

const shareNote = <p className="muted">Leden die je profiel bekijken, kunnen dit bekijken maar niet veranderen. Wat je later in het bestand verandert, zien ze ook.</p>

function DocRow({ d, picked, multi, onPick }: { d: DocumentItem; picked: boolean; multi: boolean; onPick: () => void }) {
  return (
    <li>
      <label className={picked ? 'on' : undefined}>
        <input type={multi ? 'checkbox' : 'radio'} name="tg-doc" checked={picked} onChange={onPick} />
        <FarmIcon name={DOC_KINDS[d.kind].icon} />
        <span>
          <b>{d.title}</b>
          <small>
            {multi ? `${DOC_KINDS[d.kind].name} · ` : ''}
            {formatDate(d.updatedAt)}
          </small>
        </span>
      </label>
    </li>
  )
}

/** Which file a Tekening, Mindmap, Planner… gadget shows. */
export function DocPickEditor({ kind, value, onChange }: { kind: DocGadget; value: GadgetConfig[DocGadget]; onChange: (v: GadgetConfig[DocGadget]) => void }) {
  const { data = [], isLoading } = useMyDocs(kind)
  const k = DOC_KINDS[kind]
  return (
    <div className="gadget-rows">
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : data.length === 0 ? (
        <p className="empty">
          Je hebt nog geen {k.many}. <Link to={k.path}>Maak er een in {k.name}</Link> en kies hem daarna hier.
        </p>
      ) : (
        <ul className="tg-pick">
          {data.map((d) => (
            <DocRow key={d.id} d={d} picked={value.docId === d.id} multi={false} onPick={() => onChange({ docId: d.id })} />
          ))}
        </ul>
      )}
      {shareNote}
    </div>
  )
}

/** Which files the Gedeelde bestanden gadget lists, in the order they're ticked. */
export function FilesEditor({ value, onChange }: { value: GadgetConfig['bestanden']; onChange: (v: GadgetConfig['bestanden']) => void }) {
  const { data = [], isLoading } = useMyDocs()
  const full = value.docIds.length >= LIMITS.sharedDocs
  return (
    <div className="gadget-rows">
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : data.length === 0 ? (
        <p className="empty">
          Je hebt nog geen bestanden. <Link to="/tools">Maak er een in Tools</Link>.
        </p>
      ) : (
        <>
          <p className="muted">
            Kies maximaal {LIMITS.sharedDocs} bestanden ({value.docIds.length} gekozen).
          </p>
          <ul className="tg-pick">
            {data.map((d) => {
              const picked = value.docIds.includes(d.id)
              return (
                <DocRow
                  key={d.id}
                  d={d}
                  picked={picked}
                  multi
                  onPick={() => (picked ? onChange({ docIds: value.docIds.filter((x) => x !== d.id) }) : !full && onChange({ docIds: [...value.docIds, d.id] }))}
                />
              )
            })}
          </ul>
        </>
      )}
      {shareNote}
    </div>
  )
}

export function CalculatorEditor({ value, onChange }: { value: GadgetConfig['rekenmachine']; onChange: (v: GadgetConfig['rekenmachine']) => void }) {
  const set = (i: number, src: string) => onChange({ ...value, functions: value.functions.map((f, j) => (j === i ? src : f)) })
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>Wat staat er op je profiel?</span>
        <select className="text-box" value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as GadgetConfig['rekenmachine']['mode'] })}>
          <option value="rekenmachine">Een rekenmachine voor je bezoekers</option>
          <option value="grafiek">Een grafiek van mijn functies</option>
        </select>
      </label>
      {value.mode === 'grafiek' && (
        <>
          {value.functions.map((f, i) => {
            const c = compile(f, false)
            return (
              <div key={i} className="tg-fn-row">
                <span className="tg-fn-dot" style={{ background: GRAPH_COLORS[i % GRAPH_COLORS.length] }} />
                <label htmlFor={`tg-fn-${i}`}>y{i + 1} =</label>
                <input id={`tg-fn-${i}`} className="text-box" value={f} maxLength={LIMITS.graphFunction} placeholder="bijv. x^2 - 2" onChange={(e) => set(i, e.target.value)} />
                <button type="button" className="icon-button" onClick={() => onChange({ ...value, functions: value.functions.filter((_, j) => j !== i) })} aria-label="Weghalen">
                  <FarmIcon name="cross" />
                </button>
                {'error' in c && c.error && <small className="form-error">{c.error}</small>}
              </div>
            )
          })}
          {value.functions.length < LIMITS.graphFunctions && (
            <Button onClick={() => onChange({ ...value, functions: [...value.functions, ''] })}>
              <FarmIcon name="add" /> Functie toevoegen
            </Button>
          )}
          <p className="muted">
            Typ bijvoorbeeld <code>x^2</code>, <code>3x+1</code>, <code>sin(x)</code> of <code>√(x)</code>. Bezoekers kunnen de grafiek verschuiven, inzoomen en hem openen in de
            Rekenmachine.
          </p>
        </>
      )}
    </div>
  )
}
