import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { usePageTitle } from '../../lib/usePageTitle'
import { remember, remembered } from '../office/officeFile'
import { computeSheet, formatGeneral, isError } from '../rekenblad/formula'
import { Grafieken } from './Grafieken'
import './Rekenmachine.css'

type Mode = 'standaard' | 'wetenschappelijk' | 'grafieken' | 'omrekenen'

/** Units to convert between: the factor to the first unit of the group (temperature apart). */
const UNITS: Record<string, { name: string; units: [string, string, number][] }> = {
  lengte: {
    name: 'Lengte',
    units: [
      ['m', 'Meter', 1],
      ['km', 'Kilometer', 1000],
      ['cm', 'Centimeter', 0.01],
      ['mm', 'Millimeter', 0.001],
      ['mi', 'Mijl', 1609.344],
      ['yd', 'Yard', 0.9144],
      ['ft', 'Voet', 0.3048],
      ['in', 'Inch', 0.0254],
    ],
  },
  gewicht: {
    name: 'Gewicht',
    units: [
      ['kg', 'Kilogram', 1],
      ['g', 'Gram', 0.001],
      ['mg', 'Milligram', 1e-6],
      ['t', 'Ton', 1000],
      ['lb', 'Pond (lb)', 0.45359237],
      ['oz', 'Ons (oz)', 0.028349523125],
      ['ons', 'Ons (100 g)', 0.1],
    ],
  },
  temperatuur: {
    name: 'Temperatuur',
    units: [
      ['C', 'Celsius', 1],
      ['F', 'Fahrenheit', 1],
      ['K', 'Kelvin', 1],
    ],
  },
  oppervlakte: {
    name: 'Oppervlakte',
    units: [
      ['m2', 'Vierkante meter', 1],
      ['km2', 'Vierkante kilometer', 1e6],
      ['ha', 'Hectare', 10000],
      ['are', 'Are', 100],
      ['cm2', 'Vierkante centimeter', 1e-4],
      ['ft2', 'Vierkante voet', 0.09290304],
      ['acre', 'Acre', 4046.8564224],
    ],
  },
  volume: {
    name: 'Volume',
    units: [
      ['l', 'Liter', 1],
      ['ml', 'Milliliter', 0.001],
      ['cl', 'Centiliter', 0.01],
      ['m3', 'Kubieke meter', 1000],
      ['gal', 'Gallon (VS)', 3.785411784],
      ['kop', 'Kopje (250 ml)', 0.25],
      ['el', 'Eetlepel', 0.015],
      ['tl', 'Theelepel', 0.005],
    ],
  },
  snelheid: {
    name: 'Snelheid',
    units: [
      ['kmh', 'Kilometer per uur', 1],
      ['ms', 'Meter per seconde', 3.6],
      ['mph', 'Mijl per uur', 1.609344],
      ['kn', 'Knoop', 1.852],
    ],
  },
  tijd: {
    name: 'Tijd',
    units: [
      ['s', 'Seconde', 1],
      ['min', 'Minuut', 60],
      ['u', 'Uur', 3600],
      ['d', 'Dag', 86400],
      ['wk', 'Week', 604800],
      ['jr', 'Jaar (365 d)', 31536000],
    ],
  },
  data: {
    name: 'Gegevens',
    units: [
      ['B', 'Byte', 1],
      ['KB', 'Kilobyte', 1024],
      ['MB', 'Megabyte', 1024 ** 2],
      ['GB', 'Gigabyte', 1024 ** 3],
      ['TB', 'Terabyte', 1024 ** 4],
      ['bit', 'Bit', 0.125],
    ],
  },
}

function convert(group: string, from: string, to: string, v: number) {
  if (group === 'temperatuur') {
    const c = from === 'C' ? v : from === 'F' ? ((v - 32) * 5) / 9 : v - 273.15
    return to === 'C' ? c : to === 'F' ? (c * 9) / 5 + 32 : c + 273.15
  }
  const f = (u: string) => UNITS[group].units.find((x) => x[0] === u)![2]
  return (v * f(from)) / f(to)
}

/** What the calculator shows: ×, ÷ and − for the formula engine's *, / and -; a comma for the decimal point. */
const pretty = (expr: string) =>
  expr
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/(?<![A-Z(])-/g, '−')
    .replace(/\./g, ',')

/**
 * Works out the calculator's sum with the Rekenblad's formula engine
 * (Dutch function names). In degrees, the angle functions get RADIALEN
 * around what's in them; brackets left open are closed.
 */
function evaluate(expr: string, degrees: boolean): string {
  let src = expr.replace(/π/g, 'PI()').replace(/(?<![A-Z])e(?![A-Z(])/g, 'EXP(1)')
  const open = (src.match(/\(/g) ?? []).length - (src.match(/\)/g) ?? []).length
  if (open > 0) src += ')'.repeat(open)
  if (degrees) {
    // SIN( … ) → SIN(RADIALEN( … )), with the matching bracket found
    let out = ''
    const stack: boolean[] = []
    for (let i = 0; i < src.length; i++) {
      const m = /^(SIN|COS|TAN)\(/.exec(src.slice(i))
      if (m) {
        out += `${m[1]}(RADIALEN(`
        stack.push(true)
        i += m[0].length - 1
      } else if (src[i] === '(') {
        out += '('
        stack.push(false)
      } else if (src[i] === ')') {
        out += stack.pop() ? '))' : ')'
      } else out += src[i]
    }
    src = out
    // The inverse ones give degrees back
    src = src.replace(/(BOOGSIN|BOOGCOS|BOOGTAN)\(/g, 'GRADEN($1(').replace(/GRADEN\((BOOGSIN|BOOGCOS|BOOGTAN)\(([^()]*)\)/g, 'GRADEN($1($2))')
  }
  const v = computeSheet({ A1: `=${src}` }).get('A1')
  if (isError(v)) return v.error === '#DEEL/0!' ? 'Kan niet delen door nul' : 'Ongeldige invoer'
  if (typeof v !== 'number') return 'Ongeldige invoer'
  return formatGeneral(Math.abs(v) < 1e-12 ? 0 : v)
}

/** Rekenmachine (/tools/rekenmachine): standard, scientific, graphs and converting, as the Windows 7 calculator. */
export function RekenmachinePage() {
  usePageTitle('Rekenmachine - Kuddes')
  // ?f=x^2&f=sin(x): a graph opened from someone's profile
  const [search] = useSearchParams()
  const [linked] = useState(() => search.getAll('f').filter(Boolean))
  const [mode, setModeState] = useState<Mode>(() =>
    linked.length ? 'grafieken' : remembered('kuddes.rekenmachine.stand', 'standaard', ['standaard', 'wetenschappelijk', 'grafieken', 'omrekenen']),
  )
  const [expr, setExpr] = useState('')
  const [shown, setShown] = useState('0')
  const [fresh, setFresh] = useState(true)
  const [degrees, setDegrees] = useState(true)
  const [memory, setMemory] = useState<number | null>(() => {
    try {
      const m = localStorage.getItem('kuddes.rekenmachine.geheugen')
      return m && Number.isFinite(Number(m)) ? Number(m) : null
    } catch {
      return null
    }
  })
  const [history, setHistory] = useState<[string, string][]>(() => {
    try {
      return JSON.parse(localStorage.getItem('kuddes.rekenmachine.geschiedenis') ?? '[]')
    } catch {
      return []
    }
  })
  const setMode = (m: Mode) => {
    setModeState(m)
    remember('kuddes.rekenmachine.stand', m)
  }
  useEffect(() => remember('kuddes.rekenmachine.geschiedenis', JSON.stringify(history.slice(0, 30))), [history])
  useEffect(() => remember('kuddes.rekenmachine.geheugen', memory === null ? '' : String(memory)), [memory])

  const toNumber = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
  const current = () => (shown === 'Ongeldige invoer' || shown.startsWith('Kan') ? 0 : toNumber(shown))

  // ---------------------------------------------------------------- keys
  // `expr` is the sum so far ("12+5*"), `shown` the number being typed; `fresh`: the next digit starts a new number
  const endsWithOp = (e: string) => /[*/+\-^(]$/.test(e)
  const digit = (d: string) => {
    if (fresh) {
      setShown(d === ',' ? '0,' : d)
      setFresh(false)
    } else if (!(d === ',' && shown.includes(','))) setShown(shown === '0' && d !== ',' ? d : shown + d)
  }
  /** The sum with the shown number after it (not after a closing bracket that was just typed). */
  const withShown = () => (fresh && expr.endsWith(')') ? expr : expr + String(current()))
  const operator = (op: string) => {
    // Another operator straight after one replaces it
    setExpr(fresh && expr && /[*/+\-^]$/.test(expr) ? expr.slice(0, -1) + op : withShown() + op)
    setFresh(true)
  }
  const equals = () => {
    if (!expr) return
    const full = fresh && /[*/+\-^]$/.test(expr) ? expr + String(current()) : withShown()
    const result = evaluate(full, degrees)
    setHistory((h) => [[pretty(full), result] as [string, string], ...h].slice(0, 30))
    setExpr('')
    setShown(result)
    setFresh(true)
  }
  /** A function on the shown number (√, x², 1/x, sin…), worked out straight away, as Windows does. */
  const apply = (fn: string, wrap: (n: string) => string) => {
    const n = String(current())
    const result = evaluate(wrap(n), degrees)
    setHistory((h) => [[pretty(`${fn}(${n.replace('.', ',')})`), result] as [string, string], ...h].slice(0, 30))
    setShown(result)
    setFresh(true)
  }
  const clearAll = () => {
    setExpr('')
    setShown('0')
    setFresh(true)
  }
  const back = () => !fresh && setShown(shown.length > 1 ? shown.slice(0, -1) : '0')
  const negate = () => setShown(shown.startsWith('-') ? shown.slice(1) : shown === '0' ? '0' : `-${shown}`)
  const bracket = (b: '(' | ')') => {
    if (b === '(') setExpr((e) => (e === '' || endsWithOp(e) ? e : e + '*') + '(')
    else {
      setExpr(withShown() + ')')
      setFresh(true)
    }
  }
  const constant = (v: string) => {
    setShown(evaluate(v, degrees))
    setFresh(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea') || e.ctrlKey || e.metaKey || mode === 'omrekenen' || mode === 'grafieken') return
      const k = e.key
      const run = (f: () => void) => {
        e.preventDefault()
        f()
      }
      if (/^\d$/.test(k)) run(() => digit(k))
      else if (k === ',' || k === '.') run(() => digit(','))
      else if (k === '+' || k === '-' || k === '*' || k === '/' || k === '^') run(() => operator(k))
      else if (k === 'Enter' || k === '=') run(equals)
      else if (k === 'Backspace') run(back)
      else if (k === 'Escape' || k === 'Delete') run(clearAll)
      else if (k === '(' || k === ')') run(() => bracket(k))
      else if (k === '%') run(() => apply('%', (n) => `${n}/100`))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const key = (label: string, onClick: () => void, cls = '', title?: string) => (
    <button type="button" className={`rmc-key ${cls}`} onClick={onClick} title={title} aria-label={title ?? label}>
      {label}
    </button>
  )

  // ---------------------------------------------------------------- converting
  const [group, setGroup] = useState('lengte')
  const [from, setFrom] = useState('m')
  const [to, setTo] = useState('km')
  const [amount, setAmount] = useState('1')
  const amountN = Number(amount.replace(',', '.'))
  const converted = Number.isFinite(amountN) && amount.trim() !== '' ? formatGeneral(convert(group, from, to, amountN)) : ''

  return (
    <main className="page page-con rmc-page">
      <div className="rmc-window" data-mode={mode}>
        <header className="rmc-title">
          <FarmIcon name="calculator" /> Rekenmachine
          <Link to="/tools" className="rmc-close" aria-label="Sluiten" title="Sluiten (terug naar Tools)">
            ×
          </Link>
        </header>
        <nav className="rmc-modes" aria-label="Weergave">
          {(
            [
              ['standaard', 'Standaard'],
              ['wetenschappelijk', 'Wetenschappelijk'],
              ['grafieken', 'Grafieken'],
              ['omrekenen', 'Eenheden omrekenen'],
            ] as const
          ).map(([m, name]) => (
            <button key={m} type="button" className={mode === m ? 'on' : undefined} onClick={() => setMode(m)} aria-pressed={mode === m}>
              {name}
            </button>
          ))}
        </nav>

        {mode === 'grafieken' ? (
          <Grafieken initial={linked} />
        ) : (
          <div className="rmc-body">
            <div className="rmc-calc">
              {mode === 'omrekenen' ? (
                <div className="rmc-convert">
                  <label>
                    Soort
                    <select
                      value={group}
                      onChange={(e) => {
                        const g = e.target.value
                        setGroup(g)
                        setFrom(UNITS[g].units[0][0])
                        setTo(UNITS[g].units[1][0])
                      }}
                    >
                      {Object.entries(UNITS).map(([k, u]) => (
                        <option key={k} value={k}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Van
                    <span className="rmc-convert-row">
                      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Hoeveel" />
                      <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Van eenheid">
                        {UNITS[group].units.map(([k, name]) => (
                          <option key={k} value={k}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="rmc-swap"
                    onClick={() => {
                      setFrom(to)
                      setTo(from)
                    }}
                    title="Omdraaien"
                    aria-label="Omdraaien"
                  >
                    ⇅
                  </button>
                  <label>
                    Naar
                    <span className="rmc-convert-row">
                      <output className="rmc-convert-out">{converted.replace('.', ',')}</output>
                      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Naar eenheid">
                        {UNITS[group].units.map(([k, name]) => (
                          <option key={k} value={k}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                </div>
              ) : (
                <>
                  <div className="rmc-display" aria-live="polite">
                    <div className="rmc-expr">{pretty(expr) || ' '}</div>
                    <div className="rmc-shown">{shown}</div>
                    {memory !== null && <span className="rmc-m">M</span>}
                  </div>
                  <div className="rmc-keys">
                    {mode === 'wetenschappelijk' && (
                      <div className="rmc-sci">
                        <span className="rmc-angle" role="radiogroup" aria-label="Hoeken">
                          <label>
                            <input type="radio" checked={degrees} onChange={() => setDegrees(true)} /> Graden
                          </label>
                          <label>
                            <input type="radio" checked={!degrees} onChange={() => setDegrees(false)} /> Radialen
                          </label>
                        </span>
                        {key('sin', () => apply('sin', (n) => `SIN(${n})`))}
                        {key('cos', () => apply('cos', (n) => `COS(${n})`))}
                        {key('tan', () => apply('tan', (n) => `TAN(${n})`))}
                        {key('sin⁻¹', () => apply('sin⁻¹', (n) => `BOOGSIN(${n})`))}
                        {key('cos⁻¹', () => apply('cos⁻¹', (n) => `BOOGCOS(${n})`))}
                        {key('tan⁻¹', () => apply('tan⁻¹', (n) => `BOOGTAN(${n})`))}
                        {key('ln', () => apply('ln', (n) => `LN(${n})`))}
                        {key('log', () => apply('log', (n) => `LOG10(${n})`))}
                        {key('n!', () => apply('fact', (n) => `FACULTEIT(${n})`))}
                        {key('x²', () => apply('sqr', (n) => `(${n})^2`))}
                        {key('x³', () => apply('cube', (n) => `(${n})^3`))}
                        {key('xʸ', () => operator('^'), '', 'x tot de macht y')}
                        {key('10ˣ', () => apply('10^', (n) => `10^(${n})`))}
                        {key('eˣ', () => apply('e^', (n) => `EXP(${n})`))}
                        {key('π', () => constant('PI()'))}
                        {key('e', () => constant('EXP(1)'))}
                        {key('(', () => bracket('('))}
                        {key(')', () => bracket(')'))}
                      </div>
                    )}
                    <div className="rmc-std">
                      {key('MC', () => setMemory(null), 'mem', 'Geheugen wissen')}
                      {key('MR', () => memory !== null && (setShown(formatGeneral(memory)), setFresh(true)), 'mem', 'Geheugen terughalen')}
                      {key('MS', () => setMemory(current()), 'mem', 'In het geheugen zetten')}
                      {key('M+', () => setMemory((m) => (m ?? 0) + current()), 'mem', 'Optellen bij het geheugen')}
                      {key('M−', () => setMemory((m) => (m ?? 0) - current()), 'mem', 'Aftrekken van het geheugen')}
                      {key('←', back, '', 'Terug')}
                      {key('CE', () => (setShown('0'), setFresh(true)), '', 'Invoer wissen')}
                      {key('C', clearAll, '', 'Alles wissen')}
                      {key('±', negate, '', 'Plus of min')}
                      {key('√', () => apply('√', (n) => `WORTEL(${n})`), '', 'Wortel')}
                      {key('7', () => digit('7'))}
                      {key('8', () => digit('8'))}
                      {key('9', () => digit('9'))}
                      {key('÷', () => operator('/'), 'op', 'Delen')}
                      {key('%', () => apply('%', (n) => `${n}/100`), '', 'Procent')}
                      {key('4', () => digit('4'))}
                      {key('5', () => digit('5'))}
                      {key('6', () => digit('6'))}
                      {key('×', () => operator('*'), 'op', 'Vermenigvuldigen')}
                      {key('1/x', () => apply('reciproc', (n) => `1/(${n})`), '', 'Eén gedeeld door')}
                      {key('1', () => digit('1'))}
                      {key('2', () => digit('2'))}
                      {key('3', () => digit('3'))}
                      {key('−', () => operator('-'), 'op', 'Aftrekken')}
                      {key('=', equals, 'eq', 'Is')}
                      {key('0', () => digit('0'), 'zero')}
                      {key(',', () => digit(','), '', 'Komma')}
                      {key('+', () => operator('+'), 'op', 'Optellen')}
                    </div>
                  </div>
                </>
              )}
            </div>
            {mode !== 'omrekenen' && (
              <aside className="rmc-history" aria-label="Geschiedenis">
                <h2>
                  Geschiedenis
                  {history.length > 0 && (
                    <button type="button" className="link-button" onClick={() => setHistory([])}>
                      wissen
                    </button>
                  )}
                </h2>
                {history.length === 0 ? (
                  <p className="muted">Nog niets uitgerekend.</p>
                ) : (
                  <ol>
                    {history.map(([q, a], i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => {
                            setShown(a)
                            setFresh(true)
                          }}
                          title="Gebruiken"
                        >
                          <span>{q} =</span>
                          <b>{a}</b>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
