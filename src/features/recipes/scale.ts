/**
 * Scales the amount at the start of an ingredient ("200 g bloem",
 * "1,5 dl melk", "1/2 ui", "½ citroen", "2-3 teentjes knoflook") for more or
 * fewer people. Lines without an amount ("zout en peper") stay as they are.
 */
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
const AMOUNT = /^(\d+\s*[½¼¾⅓⅔]|\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾⅓⅔])(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?/

function parse(text: string): number {
  const mixed = /^(\d+)\s*([½¼¾⅓⅔])$/.exec(text)
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]]
  if (text in FRACTIONS) return FRACTIONS[text]
  const frac = /^(\d+)\/(\d+)$/.exec(text)
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : 0
  return Number(text.replace(',', '.'))
}

function format(n: number): string {
  if (n >= 10) return String(Math.round(n))
  const whole = Math.floor(n)
  const rest = n - whole
  // Halves and quarters read nicer than decimals in a recipe
  for (const [sign, v] of [['½', 0.5], ['¼', 0.25], ['¾', 0.75]] as const) {
    if (Math.abs(rest - v) < 0.04) return whole ? `${whole}${sign}` : sign
  }
  if (rest < 0.04) return String(whole)
  if (rest > 0.96) return String(whole + 1)
  return (Math.round(n * 10) / 10).toLocaleString('nl-NL')
}

export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line
  const m = AMOUNT.exec(line.trim())
  if (!m) return line
  const from = format(parse(m[1]) * factor)
  const to = m[2] ? `-${format(parse(m[2]) * factor)}` : ''
  return from + to + line.trim().slice(m[0].length)
}
