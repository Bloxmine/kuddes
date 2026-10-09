/**
 * The calculations of Kuddes Rekenblad: cell addresses, reading what was
 * typed (numbers with a comma or a dot, percentages, WAAR/ONWAAR), and
 * formulas as in Dutch Excel: =SOM(A1:A5), =ALS(B2>10;"veel";"weinig"),
 * with ; between arguments, the Dutch function names (and the English ones),
 * cell references with $ to anchor them, and Excel's error values.
 */
import { SHEET_COLS, SHEET_ROWS } from '../../../shared/documents'

export type ErrorValue = { error: '#DEEL/0!' | '#NAAM?' | '#VERW!' | '#WAARDE!' | '#CIRC!' | '#GETAL!' | '#N/B' }
export type Value = number | string | boolean | ErrorValue | null
export const isError = (v: unknown): v is ErrorValue => !!v && typeof v === 'object' && 'error' in v
const err = (e: ErrorValue['error']): ErrorValue => ({ error: e })

// ------------------------------------------------------------ addresses

export type Pos = { c: number; r: number }
export const colName = (c: number) => String.fromCharCode(65 + c)
export const addr = (c: number, r: number) => `${colName(c)}${r + 1}`
export function parseAddr(a: string): Pos | null {
  const m = /^\$?([A-Z])\$?(\d+)$/.exec(a.toUpperCase())
  if (!m) return null
  const c = m[1].charCodeAt(0) - 65
  const r = Number(m[2]) - 1
  return c < SHEET_COLS && r >= 0 && r < SHEET_ROWS ? { c, r } : null
}
export type Rect = { c1: number; r1: number; c2: number; r2: number }
export const rectOf = (a: Pos, b: Pos): Rect => ({ c1: Math.min(a.c, b.c), r1: Math.min(a.r, b.r), c2: Math.max(a.c, b.c), r2: Math.max(a.r, b.r) })
export const rectName = (x: Rect) => (x.c1 === x.c2 && x.r1 === x.r2 ? addr(x.c1, x.r1) : `${addr(x.c1, x.r1)}:${addr(x.c2, x.r2)}`)
export function parseRect(s: string): Rect | null {
  const [a, b = a] = s.split(':')
  const p = parseAddr(a)
  const q = parseAddr(b)
  return p && q ? rectOf(p, q) : null
}
export function* cellsIn(x: Rect) {
  for (let r = x.r1; r <= x.r2; r++) for (let c = x.c1; c <= x.c2; c++) yield { c, r }
}

// ------------------------------------------------------------ what was typed

/** A typed value: a number (also "12,5", "1.234,56", "15%", "€ 3,50"), WAAR/ONWAAR, or text. Formulas are handled apart. */
export function literal(raw: string): Value {
  const s = raw.trim()
  if (s === '') return null
  const up = s.toUpperCase()
  if (up === 'WAAR' || up === 'TRUE') return true
  if (up === 'ONWAAR' || up === 'FALSE') return false
  const pct = s.endsWith('%')
  const body = s.replace(/^€\s*/, '').replace(/%$/, '').trim()
  let num: string | null = null
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(body)) num = body.replace(/\./g, '').replace(',', '.')
  else if (/^[-+]?\d*,\d+$/.test(body) || /^[-+]?\d+,$/.test(body)) num = body.replace(',', '.')
  else if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(body)) num = body
  if (num === null) return s
  const n = Number(num)
  if (!Number.isFinite(n)) return s
  return pct ? n / 100 : n
}

/** The format a typed value suggests (€ → valuta, % → procent), when the cell has none yet. */
export function suggestedFormat(raw: string): 'valuta' | 'procent' | null {
  const s = raw.trim()
  if (/^€/.test(s) && typeof literal(s) === 'number') return 'valuta'
  if (/%$/.test(s) && typeof literal(s) === 'number') return 'procent'
  return null
}

// ------------------------------------------------------------ formulas: reading them

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }
  | { t: '('; v: '(' }
  | { t: ')'; v: ')' }
  | { t: 'sep'; v: string }
  | { t: ':'; v: ':' }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let v = ''
      while (j < src.length) {
        if (src[j] === '"' && src[j + 1] === '"') {
          v += '"'
          j += 2
        } else if (src[j] === '"') break
        else v += src[j++]
      }
      if (j >= src.length) return null
      out.push({ t: 'str', v })
      i = j + 1
      continue
    }
    // A number: a comma or a dot as the decimal sign
    const num = /^(\d+([.,]\d+)?|\.\d+)(e[-+]?\d+)?/i.exec(src.slice(i))
    if (num && !/[A-Z$]/i.test(src[i - 1] ?? '')) {
      out.push({ t: 'num', v: Number(num[0].replace(',', '.')) })
      i += num[0].length
      continue
    }
    const ref = /^\$?[A-Z]\$?\d+/i.exec(src.slice(i))
    if (ref && !/^[(A-Z.]/i.test(src.slice(i + ref[0].length))) {
      out.push({ t: 'ref', v: ref[0].toUpperCase() })
      i += ref[0].length
      continue
    }
    const name = /^[A-Z][A-Z0-9.]*/i.exec(src.slice(i))
    if (name) {
      out.push({ t: 'name', v: name[0].toUpperCase() })
      i += name[0].length
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ t: 'op', v: two })
      i += 2
      continue
    }
    if ('+-*/^&=<>%'.includes(ch)) out.push({ t: 'op', v: ch })
    else if (ch === '(') out.push({ t: '(', v: '(' })
    else if (ch === ')') out.push({ t: ')', v: ')' })
    else if (ch === ';' || ch === ',') out.push({ t: 'sep', v: ch })
    else if (ch === ':') out.push({ t: ':', v: ':' })
    else return null
    i++
  }
  return out
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'ref'; p: Pos }
  | { t: 'range'; x: Rect }
  | { t: 'fn'; name: string; args: Node[] }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'pct'; a: Node }
  | { t: 'err'; e: ErrorValue['error'] }

class Parser {
  i = 0
  toks: Tok[]
  constructor(toks: Tok[]) {
    this.toks = toks
  }
  peek() {
    return this.toks[this.i]
  }
  next() {
    return this.toks[this.i++]
  }
  isOp(...ops: string[]) {
    const t = this.peek()
    return t?.t === 'op' && ops.includes(t.v)
  }
  /** The operator just found (isOp said there is one). */
  op() {
    return String(this.next().v)
  }
  expr(): Node {
    let a = this.concat()
    while (this.isOp('=', '<>', '<', '>', '<=', '>=')) a = { t: 'bin', op: this.op(), a, b: this.concat() }
    return a
  }
  concat(): Node {
    let a = this.add()
    while (this.isOp('&')) a = { t: 'bin', op: this.op(), a, b: this.add() }
    return a
  }
  add(): Node {
    let a = this.mul()
    while (this.isOp('+', '-')) a = { t: 'bin', op: this.op(), a, b: this.mul() }
    return a
  }
  mul(): Node {
    let a = this.pow()
    while (this.isOp('*', '/')) a = { t: 'bin', op: this.op(), a, b: this.pow() }
    return a
  }
  pow(): Node {
    let a = this.unary()
    while (this.isOp('^')) a = { t: 'bin', op: this.op(), a, b: this.unary() }
    return a
  }
  unary(): Node {
    if (this.isOp('-', '+')) return { t: 'un', op: this.op(), a: this.unary() }
    let a = this.primary()
    while (this.isOp('%')) {
      this.next()
      a = { t: 'pct', a }
    }
    return a
  }
  primary(): Node {
    const t = this.next()
    if (!t) throw new Error('end')
    if (t.t === 'num') return { t: 'num', v: t.v }
    if (t.t === 'str') return { t: 'str', v: t.v }
    if (t.t === '(') {
      const e = this.expr()
      if (this.next()?.t !== ')') throw new Error(')')
      return e
    }
    if (t.t === 'ref') {
      const p = parseAddr(t.v)
      if (this.peek()?.t === ':') {
        this.next()
        const end = this.next()
        const q = end?.t === 'ref' ? parseAddr(end.v) : null
        return p && q ? { t: 'range', x: rectOf(p, q) } : { t: 'err', e: '#VERW!' }
      }
      return p ? { t: 'ref', p } : { t: 'err', e: '#VERW!' }
    }
    if (t.t === 'name') {
      if (this.peek()?.t === '(') {
        this.next()
        const args: Node[] = []
        if (this.peek()?.t !== ')') {
          args.push(this.expr())
          while (this.peek()?.t === 'sep') {
            this.next()
            args.push(this.expr())
          }
        }
        if (this.next()?.t !== ')') throw new Error(')')
        return { t: 'fn', name: t.v, args }
      }
      if (t.v === 'WAAR' || t.v === 'TRUE') return { t: 'bool', v: true }
      if (t.v === 'ONWAAR' || t.v === 'FALSE') return { t: 'bool', v: false }
      return { t: 'err', e: '#NAAM?' }
    }
    if (t.t === 'op' && t.v === '#') return { t: 'err', e: '#NAAM?' }
    throw new Error('unexpected')
  }
}

const parsed = new Map<string, Node | null>()
function parseFormula(src: string): Node | null {
  if (parsed.has(src)) return parsed.get(src)!
  let node: Node | null = null
  try {
    const toks = tokenize(src)
    if (toks) {
      const p = new Parser(toks)
      node = p.expr()
      if (p.i !== toks.length) node = null
    }
  } catch {
    node = null
  }
  if (parsed.size > 5000) parsed.clear()
  parsed.set(src, node)
  return node
}

/** Does this formula parse? (To warn before it's put in.) */
export const formulaOk = (raw: string) => !raw.startsWith('=') || parseFormula(raw.slice(1)) !== null

// ------------------------------------------------------------ formulas: working them out

type Get = (p: Pos) => Value
type Arg = Value | Value[]

const toNumber = (v: Value): number | ErrorValue => {
  if (isError(v)) return v
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = literal(v)
  return typeof n === 'number' ? n : err('#WAARDE!')
}
const toText = (v: Value): string | ErrorValue => (isError(v) ? v : v === null ? '' : typeof v === 'boolean' ? (v ? 'WAAR' : 'ONWAAR') : typeof v === 'number' ? formatGeneral(v) : v)
const toBool = (v: Value): boolean | ErrorValue => {
  if (isError(v)) return v
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null) return false
  const up = v.toUpperCase()
  return up === 'WAAR' || up === 'TRUE' ? true : up === 'ONWAAR' || up === 'FALSE' ? false : err('#WAARDE!')
}

/** All values of the arguments, ranges flattened. */
const flat = (args: Arg[]): Value[] => args.flatMap((a) => (Array.isArray(a) ? a : [a]))
/** The numbers among them: in ranges only real numbers count (as in Excel), typed arguments are converted. */
function numbers(args: Arg[]): number[] | ErrorValue {
  const out: number[] = []
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const v of a) {
        if (isError(v)) return v
        if (typeof v === 'number') out.push(v)
      }
    } else {
      const n = toNumber(a)
      if (isError(n)) return n
      out.push(n)
    }
  }
  return out
}

/** Criteria of AANTAL.ALS and SOM.ALS: ">5", "<>0", "=tekst" or just a value. */
function criterion(c: Value): (v: Value) => boolean {
  const s = c === null ? '' : String(isError(c) ? '' : c)
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s)!
  const op = m[1] ?? '='
  const target = literal(m[2])
  return (v) => {
    if (isError(v)) return false
    if (typeof target === 'number') {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? literal(v) : null
      if (typeof n !== 'number') return op === '<>'
      return op === '=' ? n === target : op === '<>' ? n !== target : op === '<' ? n < target : op === '>' ? n > target : op === '<=' ? n <= target : n >= target
    }
    const a = (v === null ? '' : String(v)).toLowerCase()
    const b = String(target ?? '').toLowerCase()
    const like = new RegExp(`^${b.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
    return op === '<>' ? !like.test(a) : like.test(a)
  }
}

const round = (n: number, d: number, how: 'nearest' | 'up' | 'down') => {
  const f = 10 ** d
  const x = n * f
  const r = how === 'nearest' ? Math.round(Math.abs(x) + 1e-9) * Math.sign(x) : how === 'up' ? Math.ceil(Math.abs(x) - 1e-9) * Math.sign(x) : Math.floor(Math.abs(x) + 1e-9) * Math.sign(x)
  return r / f
}

type Fn = (args: Arg[], raw: Node[], ev: (n: Node) => Arg) => Value
const scalar = (a: Arg): Value => (Array.isArray(a) ? (a.length === 1 ? a[0] : err('#WAARDE!')) : a)
const n1 = (args: Arg[], i: number) => toNumber(scalar(args[i] ?? null))
const t1 = (args: Arg[], i: number) => toText(scalar(args[i] ?? null))

/** A function of one number. */
const one = (args: Arg[], f: (n: number) => Value): Value => {
  const n = n1(args, 0)
  return isError(n) ? n : f(n)
}

const stat = (f: (ns: number[]) => Value): Fn => (args) => {
  const ns = numbers(args)
  return isError(ns) ? ns : f(ns)
}

const FUNCTIONS: Record<string, Fn> = {
  SOM: stat((ns) => ns.reduce((a, b) => a + b, 0)),
  GEMIDDELDE: stat((ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : err('#DEEL/0!'))),
  MIN: stat((ns) => (ns.length ? Math.min(...ns) : 0)),
  MAX: stat((ns) => (ns.length ? Math.max(...ns) : 0)),
  AANTAL: (args) => flat(args).filter((v) => typeof v === 'number').length,
  AANTALARG: (args) => flat(args).filter((v) => v !== null && v !== '').length,
  'AANTAL.LEGE.CELLEN': (args) => flat(args).filter((v) => v === null || v === '').length,
  PRODUCT: stat((ns) => ns.reduce((a, b) => a * b, 1)),
  MEDIAAN: stat((ns) => {
    if (!ns.length) return err('#GETAL!')
    const s = [...ns].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }),
  'AANTAL.ALS': (args) => {
    const test = criterion(scalar(args[1] ?? null))
    return (Array.isArray(args[0]) ? args[0] : [args[0]]).filter(test).length
  },
  'SOM.ALS': (args) => {
    const range = Array.isArray(args[0]) ? args[0] : [args[0]]
    const sum = args[2] === undefined ? range : Array.isArray(args[2]) ? args[2] : [args[2]]
    const test = criterion(scalar(args[1] ?? null))
    let total = 0
    range.forEach((v, i) => {
      if (test(v) && typeof sum[i] === 'number') total += sum[i] as number
    })
    return total
  },
  ALS: (args, raw, ev) => {
    const c = toBool(scalar(args[0] ?? null))
    if (isError(c)) return c
    const pick = c ? 1 : 2
    return raw[pick] ? scalar(ev(raw[pick])) : c
  },
  EN: (args) => {
    for (const v of flat(args)) {
      const b = toBool(v)
      if (isError(b)) return b
      if (!b) return false
    }
    return true
  },
  OF: (args) => {
    for (const v of flat(args)) {
      const b = toBool(v)
      if (isError(b)) return b
      if (b) return true
    }
    return false
  },
  NIET: (args) => {
    const b = toBool(scalar(args[0] ?? null))
    return isError(b) ? b : !b
  },
  AFRONDEN: (args) => {
    const n = n1(args, 0)
    const d = n1(args, 1)
    return isError(n) ? n : isError(d) ? d : round(n, d, 'nearest')
  },
  'AFRONDEN.NAAR.BOVEN': (args) => {
    const n = n1(args, 0)
    const d = n1(args, 1)
    return isError(n) ? n : isError(d) ? d : round(n, d, 'up')
  },
  'AFRONDEN.NAAR.BENEDEN': (args) => {
    const n = n1(args, 0)
    const d = n1(args, 1)
    return isError(n) ? n : isError(d) ? d : round(n, d, 'down')
  },
  INTEGER: (args) => {
    const n = n1(args, 0)
    return isError(n) ? n : Math.floor(n)
  },
  ABS: (args) => {
    const n = n1(args, 0)
    return isError(n) ? n : Math.abs(n)
  },
  WORTEL: (args) => {
    const n = n1(args, 0)
    return isError(n) ? n : n < 0 ? err('#GETAL!') : Math.sqrt(n)
  },
  MACHT: (args) => {
    const a = n1(args, 0)
    const b = n1(args, 1)
    return isError(a) ? a : isError(b) ? b : a ** b
  },
  REST: (args) => {
    const a = n1(args, 0)
    const b = n1(args, 1)
    return isError(a) ? a : isError(b) ? b : b === 0 ? err('#DEEL/0!') : a - b * Math.floor(a / b)
  },
  PI: () => Math.PI,
  // Angles in radians, as in Excel; RADIALEN and GRADEN convert
  SIN: (args) => one(args, Math.sin),
  COS: (args) => one(args, Math.cos),
  TAN: (args) => one(args, Math.tan),
  BOOGSIN: (args) => one(args, (n) => (n < -1 || n > 1 ? err('#GETAL!') : Math.asin(n))),
  BOOGCOS: (args) => one(args, (n) => (n < -1 || n > 1 ? err('#GETAL!') : Math.acos(n))),
  BOOGTAN: (args) => one(args, Math.atan),
  RADIALEN: (args) => one(args, (n) => (n * Math.PI) / 180),
  GRADEN: (args) => one(args, (n) => (n * 180) / Math.PI),
  LN: (args) => one(args, (n) => (n <= 0 ? err('#GETAL!') : Math.log(n))),
  LOG10: (args) => one(args, (n) => (n <= 0 ? err('#GETAL!') : Math.log10(n))),
  EXP: (args) => one(args, Math.exp),
  FACULTEIT: (args) =>
    one(args, (n) => {
      if (n < 0 || n > 170) return err('#GETAL!')
      let f = 1
      for (let i = 2; i <= Math.floor(n); i++) f *= i
      return f
    }),
  ASELECT: () => Math.random(),
  LENGTE: (args) => {
    const t = t1(args, 0)
    return isError(t) ? t : t.length
  },
  LINKS: (args) => {
    const t = t1(args, 0)
    const n = args[1] === undefined ? 1 : n1(args, 1)
    return isError(t) ? t : isError(n) ? n : t.slice(0, Math.max(0, n))
  },
  RECHTS: (args) => {
    const t = t1(args, 0)
    const n = args[1] === undefined ? 1 : n1(args, 1)
    return isError(t) ? t : isError(n) ? n : n <= 0 ? '' : t.slice(-n)
  },
  DEEL: (args) => {
    const t = t1(args, 0)
    const s = n1(args, 1)
    const n = n1(args, 2)
    return isError(t) ? t : isError(s) ? s : isError(n) ? n : t.substr(Math.max(0, s - 1), Math.max(0, n))
  },
  HOOFDLETTERS: (args) => {
    const t = t1(args, 0)
    return isError(t) ? t : t.toLocaleUpperCase('nl')
  },
  'KLEINE.LETTERS': (args) => {
    const t = t1(args, 0)
    return isError(t) ? t : t.toLocaleLowerCase('nl')
  },
  SPATIES: (args) => {
    const t = t1(args, 0)
    return isError(t) ? t : t.trim().replace(/\s+/g, ' ')
  },
  'TEKST.SAMENVOEGEN': (args) => {
    let out = ''
    for (const v of flat(args)) {
      const t = toText(v)
      if (isError(t)) return t
      out += t
    }
    return out
  },
  VANDAAG: () => new Date().toLocaleDateString('nl-NL'),
  NU: () => new Date().toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }),
}
// The English names Excel uses elsewhere, and older Dutch ones
const ALIASES: Record<string, string> = {
  SUM: 'SOM',
  AVERAGE: 'GEMIDDELDE',
  COUNT: 'AANTAL',
  COUNTA: 'AANTALARG',
  COUNTBLANK: 'AANTAL.LEGE.CELLEN',
  MEDIAN: 'MEDIAAN',
  COUNTIF: 'AANTAL.ALS',
  SUMIF: 'SOM.ALS',
  IF: 'ALS',
  AND: 'EN',
  OR: 'OF',
  NOT: 'NIET',
  ROUND: 'AFRONDEN',
  ROUNDUP: 'AFRONDEN.NAAR.BOVEN',
  ROUNDDOWN: 'AFRONDEN.NAAR.BENEDEN',
  INT: 'INTEGER',
  SQRT: 'WORTEL',
  POWER: 'MACHT',
  MOD: 'REST',
  RAND: 'ASELECT',
  ASIN: 'BOOGSIN',
  ACOS: 'BOOGCOS',
  ATAN: 'BOOGTAN',
  RADIANS: 'RADIALEN',
  DEGREES: 'GRADEN',
  FACT: 'FACULTEIT',
  LEN: 'LENGTE',
  LEFT: 'LINKS',
  RIGHT: 'RECHTS',
  MID: 'DEEL',
  UPPER: 'HOOFDLETTERS',
  LOWER: 'KLEINE.LETTERS',
  TRIM: 'SPATIES',
  CONCATENATE: 'TEKST.SAMENVOEGEN',
  CONCAT: 'TEKST.SAMENVOEGEN',
  SAMENVOEGEN: 'TEKST.SAMENVOEGEN',
  TODAY: 'VANDAAG',
  NOW: 'NU',
}

/** The functions in the Formules tab, by group: name and what it does. */
export const FUNCTION_LIST: { group: string; items: [string, string][] }[] = [
  {
    group: 'Wiskunde',
    items: [
      ['SOM', 'Telt getallen op: =SOM(A1:A10)'],
      ['PRODUCT', 'Vermenigvuldigt getallen'],
      ['AFRONDEN', 'Rondt af op een aantal decimalen: =AFRONDEN(A1;2)'],
      ['AFRONDEN.NAAR.BOVEN', 'Rondt naar boven af'],
      ['AFRONDEN.NAAR.BENEDEN', 'Rondt naar beneden af'],
      ['INTEGER', 'Het hele getal eronder'],
      ['ABS', 'De absolute waarde'],
      ['WORTEL', 'De wortel'],
      ['MACHT', 'Een getal tot een macht: =MACHT(2;10)'],
      ['REST', 'De rest na delen'],
      ['SOM.ALS', 'Telt op wat aan een voorwaarde voldoet: =SOM.ALS(A:A;">10")'],
      ['PI', 'Het getal pi'],
      ['SIN', 'De sinus (hoek in radialen; =SIN(RADIALEN(30)) voor graden)'],
      ['COS', 'De cosinus'],
      ['TAN', 'De tangens'],
      ['RADIALEN', 'Graden naar radialen'],
      ['GRADEN', 'Radialen naar graden'],
      ['LN', 'De natuurlijke logaritme'],
      ['LOG10', 'De logaritme met grondtal 10'],
      ['EXP', 'e tot een macht'],
      ['FACULTEIT', 'n! : 5! = 120'],
      ['ASELECT', 'Een willekeurig getal tussen 0 en 1'],
    ],
  },
  {
    group: 'Statistisch',
    items: [
      ['GEMIDDELDE', 'Het gemiddelde'],
      ['MIN', 'Het kleinste getal'],
      ['MAX', 'Het grootste getal'],
      ['MEDIAAN', 'Het middelste getal'],
      ['AANTAL', 'Hoeveel cellen een getal hebben'],
      ['AANTALARG', 'Hoeveel cellen niet leeg zijn'],
      ['AANTAL.LEGE.CELLEN', 'Hoeveel cellen leeg zijn'],
      ['AANTAL.ALS', 'Hoeveel cellen aan een voorwaarde voldoen: =AANTAL.ALS(B2:B20;"ja")'],
    ],
  },
  {
    group: 'Logisch',
    items: [
      ['ALS', 'Het een of het ander: =ALS(A1>10;"veel";"weinig")'],
      ['EN', 'WAAR als alles klopt'],
      ['OF', 'WAAR als er één klopt'],
      ['NIET', 'Draait WAAR en ONWAAR om'],
    ],
  },
  {
    group: 'Tekst',
    items: [
      ['TEKST.SAMENVOEGEN', 'Plakt tekst aan elkaar (of gebruik &)'],
      ['LENGTE', 'Hoeveel tekens'],
      ['LINKS', 'De eerste tekens'],
      ['RECHTS', 'De laatste tekens'],
      ['DEEL', 'Tekens uit het midden: =DEEL(A1;2;3)'],
      ['HOOFDLETTERS', 'IN HOOFDLETTERS'],
      ['KLEINE.LETTERS', 'in kleine letters'],
      ['SPATIES', 'Haalt overbodige spaties weg'],
    ],
  },
  {
    group: 'Datum en tijd',
    items: [
      ['VANDAAG', 'De datum van vandaag'],
      ['NU', 'De datum en tijd van nu'],
    ],
  },
]

const compare = (a: Value, b: Value, op: string): Value => {
  if (isError(a)) return a
  if (isError(b)) return b
  let x: number | string | boolean = a ?? 0
  let y: number | string | boolean = b ?? 0
  if (typeof x === 'string' && typeof y === 'string') {
    x = x.toLowerCase()
    y = y.toLowerCase()
  } else if (typeof x !== typeof y) {
    // As in Excel: numbers < text < booleans
    const rank = (v: unknown) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2)
    ;[x, y] = [rank(x), rank(y)]
  }
  switch (op) {
    case '=':
      return x === y
    case '<>':
      return x !== y
    case '<':
      return x < y
    case '>':
      return x > y
    case '<=':
      return x <= y
    default:
      return x >= y
  }
}

function evaluate(node: Node, get: Get): Arg {
  const ev = (n: Node) => evaluate(n, get)
  switch (node.t) {
    case 'num':
      return node.v
    case 'str':
      return node.v
    case 'bool':
      return node.v
    case 'err':
      return err(node.e)
    case 'ref':
      return get(node.p)
    case 'range':
      return [...cellsIn(node.x)].map(get)
    case 'pct': {
      const n = toNumber(scalar(ev(node.a)))
      return isError(n) ? n : n / 100
    }
    case 'un': {
      const n = toNumber(scalar(ev(node.a)))
      return isError(n) ? n : node.op === '-' ? -n : n
    }
    case 'bin': {
      const a = scalar(ev(node.a))
      const b = scalar(ev(node.b))
      if (node.op === '&') {
        const x = toText(a)
        const y = toText(b)
        return isError(x) ? x : isError(y) ? y : x + y
      }
      if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) return compare(a, b, node.op)
      const x = toNumber(a)
      const y = toNumber(b)
      if (isError(x)) return x
      if (isError(y)) return y
      switch (node.op) {
        case '+':
          return x + y
        case '-':
          return x - y
        case '*':
          return x * y
        case '/':
          return y === 0 ? err('#DEEL/0!') : x / y
        default: {
          const p = x ** y
          return Number.isFinite(p) ? p : err('#GETAL!')
        }
      }
    }
    case 'fn': {
      const name = ALIASES[node.name] ?? node.name
      const fn = FUNCTIONS[name]
      if (!fn) return err('#NAAM?')
      // ALS only works out the branch it takes
      const args = name === 'ALS' ? [ev(node.args[0] ?? { t: 'bool', v: false })] : node.args.map(ev)
      const v = fn(args, node.args, ev)
      return typeof v === 'number' && !Number.isFinite(v) ? err('#GETAL!') : v
    }
  }
}

/** Every cell's value: formulas worked out (each once, in any order), loops shown as #CIRC!. */
export function computeSheet(cells: Record<string, string>): Map<string, Value> {
  const done = new Map<string, Value>()
  const busy = new Set<string>()
  const value = (key: string): Value => {
    if (done.has(key)) return done.get(key)!
    const raw = cells[key]
    if (raw === undefined || raw === '') return null
    if (!raw.startsWith('=')) {
      const v = literal(raw)
      done.set(key, v)
      return v
    }
    if (busy.has(key)) return err('#CIRC!')
    busy.add(key)
    const node = parseFormula(raw.slice(1))
    const v = node ? scalar(evaluate(node, (p) => value(addr(p.c, p.r)))) : err('#NAAM?')
    busy.delete(key)
    done.set(key, v)
    return v
  }
  for (const key of Object.keys(cells)) value(key)
  return done
}

// ------------------------------------------------------------ copying formulas

/**
 * A formula moved by (dc, dr), as copying it does: references move along,
 * except the parts anchored with $. Text in quotes is left alone; a
 * reference that falls off the sheet becomes #VERW!.
 */
export function shiftFormula(raw: string, dc: number, dr: number): string {
  if (!raw.startsWith('=') || (dc === 0 && dr === 0)) return raw
  return raw.replace(/("(?:[^"]|"")*")|(\$?)([A-Z])(\$?)(\d+)(?![A-Z0-9.(])/gi, (m, quoted, d1, col, d2, row, offset, whole: string) => {
    if (quoted) return quoted
    // Not part of a function name (like LOG10) or a longer word
    if (/[A-Z0-9.]/i.test(whole[offset - 1] ?? '')) return m
    const c = d1 ? col.toUpperCase().charCodeAt(0) - 65 : col.toUpperCase().charCodeAt(0) - 65 + dc
    const r = d2 ? Number(row) - 1 : Number(row) - 1 + dr
    if (c < 0 || c >= SHEET_COLS || r < 0 || r >= SHEET_ROWS) return '#VERW!'
    return `${d1}${colName(c)}${d2}${r + 1}`
  })
}

// ------------------------------------------------------------ showing a value

const nl = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('nl-NL', opts)
const general = nl({ maximumSignificantDigits: 11, useGrouping: false })

/** A number as the Standaard format shows it: no thousands, up to 11 digits, scientific when huge. */
export function formatGeneral(n: number): string {
  if (n !== 0 && (Math.abs(n) >= 1e11 || Math.abs(n) < 1e-9)) return n.toExponential(5).replace('.', ',').replace('e', 'E')
  return general.format(n)
}

export function formatValue(v: Value, num: string | undefined, dec: number | undefined): string {
  if (v === null) return ''
  if (isError(v)) return v.error
  if (typeof v === 'boolean') return v ? 'WAAR' : 'ONWAAR'
  if (typeof v === 'string') return v
  switch (num) {
    case 'getal':
      return nl({ minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 }).format(v)
    case 'valuta':
      return nl({ style: 'currency', currency: 'EUR', minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 }).format(v)
    case 'procent':
      return nl({ style: 'percent', minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 0 }).format(v)
    default:
      return dec !== undefined ? nl({ minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false }).format(v) : formatGeneral(v)
  }
}
