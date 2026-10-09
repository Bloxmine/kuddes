/**
 * The graphing calculator's maths: a small parser that turns "2x² + sin(x)"
 * into a fast function (no eval), and the analysis of a graph (zeros,
 * extremes, intersections, integrals). Plotting calls a function a few
 * thousand times per frame, which is why this doesn't go through the
 * Rekenblad's formula engine.
 */

export type Fn = (x: number, p: Record<string, number>) => number
export type Compiled = { fn: Fn; params: string[] } | { error: string }

const FUNCS: Record<string, (deg: boolean) => (...a: number[]) => number> = {
  sin: (d) => (v) => Math.sin(d ? (v * Math.PI) / 180 : v),
  cos: (d) => (v) => Math.cos(d ? (v * Math.PI) / 180 : v),
  tan: (d) => (v) => Math.tan(d ? (v * Math.PI) / 180 : v),
  asin: (d) => (v) => Math.asin(v) * (d ? 180 / Math.PI : 1),
  acos: (d) => (v) => Math.acos(v) * (d ? 180 / Math.PI : 1),
  atan: (d) => (v) => Math.atan(v) * (d ? 180 / Math.PI : 1),
  sinh: () => Math.sinh,
  cosh: () => Math.cosh,
  tanh: () => Math.tanh,
  sqrt: () => Math.sqrt,
  cbrt: () => Math.cbrt,
  abs: () => Math.abs,
  ln: () => Math.log,
  log: () => (v, b) => (b === undefined ? Math.log10(v) : Math.log(v) / Math.log(b)),
  exp: () => Math.exp,
  floor: () => Math.floor,
  ceil: () => Math.ceil,
  round: () => Math.round,
  sign: () => Math.sign,
  min: () => Math.min,
  max: () => Math.max,
  mod: () => (a, b) => a - b * Math.floor(a / b),
}
/** Other names people type, Dutch ones included. */
const ALIASES: Record<string, string> = {
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  wortel: 'sqrt',
  absoluut: 'abs',
  sgn: 'sign',
  afronden: 'round',
  entier: 'floor',
}
const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E }
/** Names tried first when splitting a run of letters ("pix" is pi·x, "sinx" is sin x). */
const NAMES = [...Object.keys(FUNCS), ...Object.keys(ALIASES), 'pi'].sort((a, b) => b.length - a.length)

type Tok = { t: 'num'; v: number } | { t: 'name'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const s = src.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/\s+/g, ' ')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === ' ') {
      i++
      continue
    }
    // A comma between digits is the Dutch decimal comma; arguments are split with ;
    const num = /^(\d+([.,]\d+)?|[.,]\d+)(e[+-]?\d+)?/i.exec(s.slice(i))
    if (num && /[\d.,]/.test(c)) {
      out.push({ t: 'num', v: Number(num[0].replace(',', '.')) })
      i += num[0].length
      continue
    }
    if (/[a-zA-Zπ]/.test(c)) {
      const run = /^[a-zA-Zπ]+/.exec(s.slice(i))![0]
      // "foo(x)" is a typo for a function, not f·o·o·(x)
      if (run.length > 2 && s[i + run.length] === '(' && !NAMES.some((n) => run.toLowerCase().includes(n))) throw new Error(`Onbekende functie: ${run}`)
      let j = 0
      while (j < run.length) {
        const rest = run.slice(j).toLowerCase()
        const name = NAMES.find((n) => rest.startsWith(n)) ?? rest[0]
        out.push({ t: 'name', v: name })
        j += name.length
      }
      i += run.length
      continue
    }
    if ('+-*/^()!²³√;,'.includes(c)) {
      out.push({ t: 'op', v: c === ',' ? ';' : c })
      i++
      continue
    }
    throw new Error(`Onbekend teken: ${c}`)
  }
  return out
}

type Node = (x: number, p: Record<string, number>) => number

/** Recursive descent: sums, products (also 2x and 3(x+1)), powers, then factors. */
function parse(toks: Tok[], deg: boolean, params: Set<string>): Node {
  let i = 0
  const peek = () => toks[i]
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(v === ')' ? 'Er mist een haakje )' : `Verwacht: ${v}`)
    i++
  }
  /** Can the next token start a factor, for multiplying without a × sign? */
  const startsFactor = () => {
    const t = peek()
    return !!t && (t.t === 'num' || t.t === 'name' || (t.t === 'op' && (t.v === '(' || t.v === '√')))
  }

  const sum = (): Node => {
    let a = product()
    while (isOp('+') || isOp('-')) {
      const op = toks[i++].v
      const l = a
      const r = product()
      a = op === '+' ? (x, p) => l(x, p) + r(x, p) : (x, p) => l(x, p) - r(x, p)
    }
    return a
  }
  const product = (): Node => {
    let a = unary()
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[i++].v
        const l = a
        const r = unary()
        a = op === '*' ? (x, p) => l(x, p) * r(x, p) : (x, p) => l(x, p) / r(x, p)
      } else if (startsFactor()) {
        const l = a
        const r = power()
        a = (x, p) => l(x, p) * r(x, p)
      } else return a
    }
  }
  const unary = (): Node => {
    if (isOp('-')) {
      i++
      const a = unary()
      return (x, p) => -a(x, p)
    }
    if (isOp('+')) {
      i++
      return unary()
    }
    return power()
  }
  // -x^2 is -(x²) and 2^-1 works, as on a TI
  const power = (): Node => {
    const base = postfix()
    if (!isOp('^')) return base
    i++
    const e = unary()
    return (x, p) => Math.pow(base(x, p), e(x, p))
  }
  const postfix = (): Node => {
    let a = primary()
    for (;;) {
      if (isOp('²') || isOp('³')) {
        const n = toks[i++].v === '²' ? 2 : 3
        const b = a
        a = (x, p) => Math.pow(b(x, p), n)
      } else if (isOp('!')) {
        i++
        const b = a
        a = (x, p) => factorial(b(x, p))
      } else return a
    }
  }
  const primary = (): Node => {
    const t = toks[i++]
    if (!t) throw new Error('De formule is niet af')
    if (t.t === 'num') return () => t.v
    if (t.t === 'op') {
      if (t.v === '(') {
        const a = sum()
        expect(')')
        return a
      }
      if (t.v === '√') {
        const a = power()
        return (x, p) => Math.sqrt(a(x, p))
      }
      throw new Error(`Onverwacht: ${t.v}`)
    }
    const name = ALIASES[t.v] ?? t.v
    if (FUNCS[name]) {
      const f = FUNCS[name](deg)
      // sin(x) with brackets, or sin x / sin 2x without (as on a TI)
      if (!isOp('(')) {
        const a = power()
        return (x, p) => f(a(x, p))
      }
      i++
      const args = [sum()]
      while (isOp(';')) {
        i++
        args.push(sum())
      }
      expect(')')
      if (args.length === 1) {
        const [a] = args
        return (x, p) => f(a(x, p))
      }
      return (x, p) => f(...args.map((a) => a(x, p)))
    }
    if (name in CONSTS) {
      const v = CONSTS[name]
      return () => v
    }
    if (name === 'x') return (x) => x
    if (name === 'y') throw new Error('Gebruik x als variabele')
    if (name.length === 1) {
      // Any other letter is a parameter with a slider (a, b, c…)
      params.add(name)
      return (_, p) => p[name] ?? 1
    }
    throw new Error(`Onbekende functie: ${name}`)
  }

  const node = sum()
  if (i < toks.length) throw new Error(isOp(')') ? 'Er staat een haakje ) te veel' : 'Onverwacht teken in de formule')
  return node
}

function factorial(n: number) {
  if (n < 0 || n > 170 || !Number.isInteger(n)) return NaN
  let f = 1
  for (let k = 2; k <= n; k++) f *= k
  return f
}

/** "y = 2x+1", "f(x) = 2x+1" and "2x+1" are all the same function. */
export function compile(src: string, degrees: boolean): Compiled {
  const body = src.replace(/^\s*(y|[a-z]\s*\(\s*x\s*\))\s*=/i, '')
  if (!body.trim()) return { error: '' }
  try {
    const params = new Set<string>()
    const node = parse(tokenize(body), degrees, params)
    return { fn: node, params: [...params].sort() }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ------------------------------------------------------------ numbers

/** A number as people write it in Dutch, short enough for a label. */
export function fmt(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'bestaat niet'
  if (Math.abs(v) < 1e-10) return '0'
  const abs = Math.abs(v)
  const s = abs >= 1e7 || abs < 1e-4 ? v.toExponential(digits - 2).replace(/\.?0+e/, 'e') : String(Number(v.toPrecision(digits)))
  return s.replace('.', ',').replace('-', '−')
}

/** Grid lines every 1, 2 or 5 × 10ⁿ, so they're about `px` apart. */
export function niceStep(unitsPerPx: number, px = 80) {
  const raw = unitsPerPx * px
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag
}

// ------------------------------------------------------------ analysis

export type Special = { kind: 'nulpunt' | 'maximum' | 'minimum' | 'snijpunt' | 'y-as'; x: number; y: number; with?: number }

const ok = Number.isFinite

/** Where g changes sign in [a, b], found by halving (and skipped when it's a jump, like tan at 90°). */
function rootsOf(g: (x: number) => number, a: number, b: number, n = 800): number[] {
  const out: number[] = []
  const dx = (b - a) / n
  let x0 = a
  let y0 = g(a)
  for (let k = 1; k <= n; k++) {
    const x1 = a + k * dx
    const y1 = g(x1)
    if (ok(y0) && ok(y1)) {
      if (y0 === 0) out.push(x0)
      else if (y0 * y1 < 0) {
        let lo = x0
        let hi = x1
        let ylo = y0
        for (let it = 0; it < 60; it++) {
          const mid = (lo + hi) / 2
          const ym = g(mid)
          if (!ok(ym)) break
          if (ylo * ym <= 0) hi = mid
          else {
            lo = mid
            ylo = ym
          }
        }
        const r = (lo + hi) / 2
        // A real zero, not a jump from +∞ to −∞
        if (Math.abs(g(r)) < 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1))) out.push(r)
      }
    }
    x0 = x1
    y0 = y1
  }
  if (ok(y0) && y0 === 0) out.push(x0)
  return out.filter((r, k) => k === 0 || Math.abs(r - out[k - 1]) > dx / 10)
}

/** Local maxima and minima, refined with a golden-section search. */
function extremesOf(f: (x: number) => number, a: number, b: number, n = 800): { x: number; y: number; max: boolean }[] {
  const out: { x: number; y: number; max: boolean }[] = []
  const dx = (b - a) / n
  const ys = Array.from({ length: n + 1 }, (_, k) => f(a + k * dx))
  for (let k = 1; k < n; k++) {
    const [p, c, q] = [ys[k - 1], ys[k], ys[k + 1]]
    if (!ok(p) || !ok(c) || !ok(q)) continue
    const max = c > p && c >= q
    const min = c < p && c <= q
    if (!max && !min) continue
    let lo = a + (k - 1) * dx
    let hi = a + (k + 1) * dx
    const s = max ? -1 : 1
    const r = (Math.sqrt(5) - 1) / 2
    for (let it = 0; it < 50; it++) {
      const m1 = hi - r * (hi - lo)
      const m2 = lo + r * (hi - lo)
      if (s * f(m1) < s * f(m2)) hi = m2
      else lo = m1
    }
    const x = (lo + hi) / 2
    const y = f(x)
    // Not a corner at an asymptote: the neighbours must be close
    if (ok(y) && Math.abs(y - c) <= Math.abs(p - q) + Math.abs(c) * 1e-6 + 1e-9) out.push({ x, y, max })
  }
  return out
}

/** Rounds away the last bit of searching: 1e-9 is 0, 1,99999999 is 2 (relative to the range shown). */
const snapper = (a: number, b: number) => (x: number) => {
  const r = Math.round(x * 1e4) / 1e4
  return Math.abs(x - r) < (b - a) * 1e-8 ? r : x
}

/** Zeros, extremes and where it meets the y-axis, for one function in [a, b]; at most `cap` of each. */
export function specials(f: (x: number) => number, a: number, b: number, cap = 25): Special[] {
  const out: Special[] = []
  const snap = snapper(a, b)
  for (const x of rootsOf(f, a, b).slice(0, cap)) out.push({ kind: 'nulpunt', x: snap(x), y: 0 })
  for (const e of extremesOf(f, a, b).slice(0, cap)) out.push({ kind: e.max ? 'maximum' : 'minimum', x: snap(e.x), y: e.y })
  if (a <= 0 && b >= 0 && ok(f(0))) out.push({ kind: 'y-as', x: 0, y: f(0) })
  return out
}

/** Where f and g cross in [a, b]. */
export function intersections(f: (x: number) => number, g: (x: number) => number, a: number, b: number, cap = 25): { x: number; y: number }[] {
  const snap = snapper(a, b)
  return rootsOf((x) => f(x) - g(x), a, b)
    .slice(0, cap)
    .map((x) => ({ x: snap(x), y: f(snap(x)) }))
}

/** All x in [a, b] where f(x) = c. */
export const solve = (f: (x: number) => number, c: number, a: number, b: number) => rootsOf((x) => f(x) - c, a, b).slice(0, 25)

/** The slope at x (central difference). */
export function derivative(f: (x: number) => number, x: number) {
  const h = 1e-5 * Math.max(1, Math.abs(x))
  return (f(x + h) - f(x - h)) / (2 * h)
}

/** ∫ f from a to b with Simpson's rule; NaN when f isn't defined everywhere on the way. */
export function integral(f: (x: number) => number, a: number, b: number, n = 2000) {
  const h = (b - a) / n
  let s = f(a) + f(b)
  for (let k = 1; k < n; k++) s += f(a + k * h) * (k % 2 ? 4 : 2)
  return (s * h) / 3
}
