import { emptySheet, type FormDef, type FormResponse, type Question, type QuestionType, type Workbook } from '../../../shared/documents'
import { colName } from '../rekenblad/formula'

export const newId = () => crypto.randomUUID().slice(0, 8)
export const withOptions = (t: QuestionType) => t === 'keuze' || t === 'vinkjes' || t === 'lijst'

export const newQuestion = (type: QuestionType = 'keuze'): Question => ({
  id: newId(),
  type,
  title: '',
  help: '',
  required: false,
  options: withOptions(type) ? ['Optie 1'] : [],
  ...(type === 'schaal' ? { scaleMax: 5 } : {}),
})

export const blankForm = (): FormDef => ({
  description: '',
  open: true,
  anonymous: false,
  questions: [
    { ...newQuestion('kort'), title: 'Wat is je naam?', required: true },
    {
      ...newQuestion('keuze'),
      title: 'Kom je ook?',
      options: ['Ja', 'Nee', 'Misschien'],
    },
  ],
})

/** An answer as text, for the table and the export. */
export const answerText = (v: FormResponse['answers'][string] | undefined) => (v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v))

const when = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Header row and one row per answer: when, who (unless anonymous), then each question. */
export function answerRows(form: FormDef, responses: FormResponse[]) {
  const named = !form.anonymous
  return [
    ['Ingevuld', ...(named ? ['Naam'] : []), ...form.questions.map((q) => q.title || 'Vraag')],
    ...responses.map((r) => [when(r.createdAt), ...(named ? [r.user?.nickname ?? ''] : []), ...form.questions.map((q) => answerText(r.answers[q.id]))]),
  ]
}

const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(';')).join('\r\n')

/** The answers as a Rekenblad (A to Z, so at most 26 columns). Text that looks like a formula stays text. */
export function toWorkbook(rows: string[][]): Workbook {
  const sheet = {
    ...emptySheet('Antwoorden'),
    widths: {} as Record<string, number>,
  }
  rows.forEach((row, r) =>
    row.slice(0, 26).forEach((v, c) => {
      if (r === 0) sheet.formats[`${colName(c)}1`] = { b: true, fill: '#dbe5f1' }
      // Wide enough for the longest value in the column, within reason
      sheet.widths[colName(c)] = Math.min(260, Math.max(sheet.widths[colName(c)] ?? 0, 90, v.length * 8))
      if (v !== '') sheet.cells[`${colName(c)}${r + 1}`] = v.startsWith('=') ? ` ${v}` : v
    }),
  )
  return { sheets: [sheet], active: 0 }
}
