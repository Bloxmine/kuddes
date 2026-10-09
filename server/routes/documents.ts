import { and, count, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { DRUM_SOUNDS, PATTERN_LENGTHS, STUDIO_LIMITS, SYNTH_SOUNDS, type DrumSound, type PatternLength, type SynthSound } from '../../shared/studio'
import {
  CELL_MAX,
  DOC_KINDS,
  DOC_MARGINS,
  DOC_TITLE_MAX,
  IMAGE_SRC,
  MAX_CHARTS,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_CHARS,
  MAX_ELEMENTS,
  MAX_SHEETS,
  MINDMAP_MAX_NODES,
  MAX_QUESTIONS,
  MAX_OPTIONS,
  MAX_TASKS,
  ANSWER_MAX,
  NOTE_FONTS,
  NOTE_MAX,
  PAINT_MAX_SIDE,
  QUESTION_TYPES,
  TASK_COLUMNS,
  TASK_LABELS,
  MAX_SLIDES,
  NUMBER_FORMATS,
  SHAPES,
  SHEET_COLS,
  SHEET_ROWS,
  SLIDE_THEMES,
  TRANSITIONS,
  docSettings,
  isDocKind,
  type DocKind,
  type DocMargins,
  type FormAnswers,
  type FormDef,
  type FormResponse,
  type NoteFont,
  type PublicForm,
  type Question,
  type QuestionType,
  type TaskColumn,
  type TaskLabel,
  type DocumentFull,
  type DocumentItem,
  type NumberFormat,
  type ShapeKind,
  type SlideThemeKey,
  type Transition,
} from '../../shared/documents'
import { db } from '../db/client'
import { documents, formResponses, users } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { requireUser, type AppEnv } from '../lib/session'
import { randomBytes } from 'node:crypto'

const TOO_BIG = 'Dit bestand is te groot om te bewaren. Haal een paar grote afbeeldingen weg.'

const titleSchema = z.string().trim().min(1, 'Geef je bestand een naam.').max(DOC_TITLE_MAX, `Een naam mag maximaal ${DOC_TITLE_MAX} tekens hebben.`)
const settingsSchema = z
  .object({
    margins: z.enum(Object.keys(DOC_MARGINS) as [DocMargins]),
    orientation: z.enum(['staand', 'liggend']),
    columns: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    pageColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  })
  .partial()
const htmlSchema = z.string().max(MAX_DOCUMENT_CHARS, TOO_BIG)
const wordsSchema = z.number().int().min(0).max(10_000_000)

// ------------------------------------------------------------ what a workbook and a presentation may hold
const hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const cellKey = new RegExp(`^[A-${String.fromCharCode(64 + SHEET_COLS)}]([1-9]\\d{0,${String(SHEET_ROWS).length - 1}})$`)
const inGrid = (k: string) => cellKey.test(k) && Number(k.slice(1)) <= SHEET_ROWS
const cellMap = <T extends z.ZodType>(value: T) =>
  z.record(z.string(), value).refine((r) => Object.keys(r).every(inGrid), 'Onbekende cel.').refine((r) => Object.keys(r).length <= SHEET_COLS * SHEET_ROWS)

const workbookSchema = z.object({
  active: z.number().int().min(0).max(MAX_SHEETS - 1),
  sheets: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(31),
        cells: cellMap(z.string().max(CELL_MAX)),
        formats: cellMap(
          z.object({
            b: z.boolean().optional(),
            i: z.boolean().optional(),
            u: z.boolean().optional(),
            color: hex.optional(),
            fill: hex.optional(),
            align: z.enum(['left', 'center', 'right']).optional(),
            num: z.enum(Object.keys(NUMBER_FORMATS) as [NumberFormat]).optional(),
            dec: z.number().int().min(0).max(6).optional(),
            border: z.boolean().optional(),
          }),
        ),
        widths: z.record(z.string().regex(/^[A-Z]$/), z.number().min(24).max(600)),
        charts: z
          .array(
            z.object({
              id: z.string().max(40),
              type: z.enum(['staaf', 'kolom', 'lijn', 'taart']),
              range: z.string().regex(/^[A-Z]\d{1,3}:[A-Z]\d{1,3}$/),
              title: z.string().max(80),
              x: z.number().min(0).max(5000),
              y: z.number().min(0).max(10000),
              w: z.number().min(120).max(1200),
              h: z.number().min(90).max(900),
            }),
          )
          .max(MAX_CHARTS),
      }),
    )
    .min(1)
    .max(MAX_SHEETS),
})

const coord = z.number().min(-2000).max(4000)
const presentationSchema = z.object({
  theme: z.enum(Object.keys(SLIDE_THEMES) as [SlideThemeKey]),
  slides: z
    .array(
      z.object({
        id: z.string().max(40),
        notes: z.string().max(5000),
        transition: z.enum(Object.keys(TRANSITIONS) as [Transition]),
        background: hex.nullable().optional(),
        elements: z
          .array(
            z.object({
              id: z.string().max(40),
              type: z.enum(['text', 'image', 'shape']),
              x: coord,
              y: coord,
              w: z.number().min(4).max(4000),
              h: z.number().min(4).max(4000),
              text: z.string().max(5000).optional(),
              role: z.enum(['title', 'body']).optional(),
              src: z.string().regex(IMAGE_SRC, 'Deze afbeelding kan hier niet in.').optional(),
              shape: z.enum(Object.keys(SHAPES) as [ShapeKind]).optional(),
              fill: hex.optional(),
              line: hex.optional(),
              style: z
                .object({
                  font: z.string().max(80).optional(),
                  size: z.number().min(6).max(200).optional(),
                  bold: z.boolean().optional(),
                  italic: z.boolean().optional(),
                  underline: z.boolean().optional(),
                  color: hex.optional(),
                  align: z.enum(['left', 'center', 'right']).optional(),
                  bullets: z.boolean().optional(),
                })
                .optional(),
            }),
          )
          .max(MAX_ELEMENTS),
      }),
    )
    .min(1)
    .max(MAX_SLIDES),
})

const noteSchema = z.object({
  text: z.string().max(NOTE_MAX, 'Deze notitie is te lang.'),
  wrap: z.boolean(),
  font: z.enum(Object.keys(NOTE_FONTS) as [NoteFont]),
  size: z.number().int().min(8).max(48),
})

const drawingSchema = z.object({
  width: z.number().int().min(1).max(PAINT_MAX_SIDE),
  height: z.number().int().min(1).max(PAINT_MAX_SIDE),
  image: z.string().regex(/^data:image\/png;base64,[a-z0-9+/=]+$/i, 'Dit is geen tekening.'),
})

type Node = { id: string; text: string; color?: string; collapsed?: boolean; children: Node[] }
const nodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    id: z.string().max(40),
    text: z.string().max(300),
    color: hex.optional(),
    collapsed: z.boolean().optional(),
    children: z.array(nodeSchema).max(60),
  }),
)
const countNodes = (n: Node): number => 1 + n.children.reduce((a, c) => a + countNodes(c), 0)
const depth = (n: Node): number => 1 + Math.max(0, ...n.children.map(depth))
const mindmapSchema = z
  .object({ root: nodeSchema, style: z.enum(['klassiek', 'modern', 'krijt']) })
  .refine((m) => countNodes(m.root) <= MINDMAP_MAX_NODES, `Een mindmap kan maximaal ${MINDMAP_MAX_NODES} onderwerpen hebben.`)
  .refine((m) => depth(m.root) <= 12, 'Deze mindmap is te diep.')

const plannerSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().max(40),
        title: z.string().max(200),
        notes: z.string().max(4000),
        column: z.enum(Object.keys(TASK_COLUMNS) as [TaskColumn]),
        due: z.iso.date().nullable(),
        priority: z.enum(['laag', 'normaal', 'hoog']),
        label: z.enum(Object.keys(TASK_LABELS) as [TaskLabel]).nullable(),
        checklist: z.array(z.object({ id: z.string().max(40), text: z.string().max(200), done: z.boolean() })).max(50),
      }),
    )
    .max(MAX_TASKS),
})

const formSchema = z.object({
  description: z.string().max(2000),
  open: z.boolean(),
  anonymous: z.boolean(),
  publicId: z.string().optional(),
  questions: z
    .array(
      z.object({
        id: z.string().max(40),
        type: z.enum(Object.keys(QUESTION_TYPES) as [QuestionType]),
        title: z.string().max(300),
        help: z.string().max(500),
        required: z.boolean(),
        options: z.array(z.string().max(200)).max(MAX_OPTIONS),
        scaleMax: z.number().int().min(2).max(10).optional(),
      }),
    )
    .max(MAX_QUESTIONS),
})

const studioId = z.string().regex(/^[\w-]{1,40}$/)
const studioName = z.string().trim().max(STUDIO_LIMITS.name)
const studioSchema = z
  .object({
    tempo: z.number().min(STUDIO_LIMITS.minTempo).max(STUDIO_LIMITS.maxTempo),
    swing: z.number().min(0).max(100),
    master: z.number().min(0).max(1),
    channels: z
      .array(
        z.object({
          id: studioId,
          name: studioName,
          type: z.enum(['drum', 'synth']),
          sound: z.enum([...Object.keys(DRUM_SOUNDS), ...Object.keys(SYNTH_SOUNDS)] as [DrumSound | SynthSound]),
          color: hex,
          volume: z.number().min(0).max(1),
          pan: z.number().min(-1).max(1),
          mute: z.boolean(),
          solo: z.boolean(),
        }),
      )
      .max(STUDIO_LIMITS.channels),
    patterns: z
      .array(
        z.object({
          id: studioId,
          name: studioName,
          color: hex,
          length: z.union(PATTERN_LENGTHS.map((n) => z.literal(n)) as [z.ZodLiteral<PatternLength>, ...z.ZodLiteral<PatternLength>[]]),
          parts: z.record(
            studioId,
            z.object({
              steps: z.array(z.number().min(0).max(1)).max(64),
              notes: z
                .array(
                  z.object({
                    key: z.number().int().min(STUDIO_LIMITS.lowKey).max(STUDIO_LIMITS.highKey),
                    start: z.number().int().min(0).max(63),
                    length: z.number().int().min(1).max(64),
                    velocity: z.number().min(0).max(1),
                  }),
                )
                .max(STUDIO_LIMITS.notes),
            }),
          ),
        }),
      )
      .min(1)
      .max(STUDIO_LIMITS.patterns),
    playlist: z
      .array(z.object({ id: studioId, pattern: studioId, track: z.number().int().min(0).max(STUDIO_LIMITS.tracks - 1), bar: z.number().int().min(0).max(STUDIO_LIMITS.bars - 1) }))
      .max(STUDIO_LIMITS.clips),
  })
  // Parts and clips only for channels and patterns that exist
  .transform((p) => ({
    ...p,
    patterns: p.patterns.map((pt) => ({ ...pt, parts: Object.fromEntries(Object.entries(pt.parts).filter(([id]) => p.channels.some((c) => c.id === id))) })),
    playlist: p.playlist.filter((c) => p.patterns.some((pt) => pt.id === c.pattern)),
  }))

/**
 * The contents for a kind, checked; Woord has none (it uses html). A form
 * keeps the address it was given (`keep`), or gets one: only the server
 * hands those out.
 */
function contentFor(kind: DocKind, raw: unknown, keep?: unknown) {
  if (raw === undefined || kind === 'woord') return undefined
  if (JSON.stringify(raw).length > MAX_DOCUMENT_CHARS) throw new HttpError(413, TOO_BIG)
  switch (kind) {
    case 'rekenblad':
      return parse(workbookSchema, raw)
    case 'presentatie':
      return parse(presentationSchema, raw)
    case 'kladblok':
      return parse(noteSchema, raw)
    case 'paint':
      return parse(drawingSchema, raw)
    case 'mindmap':
      return parse(mindmapSchema, raw)
    case 'planner':
      return parse(plannerSchema, raw)
    case 'studio':
      return parse(studioSchema, raw)
    case 'formulier': {
      const form = parse(formSchema, raw)
      const kept = keep && typeof keep === 'object' && 'publicId' in keep && typeof keep.publicId === 'string' ? keep.publicId : null
      return { ...form, publicId: kept ?? randomBytes(9).toString('base64url') }
    }
  }
}

// Big enough for a file with pictures in it, not for anything else
const docBody = bodyLimit({
  maxSize: MAX_DOCUMENT_CHARS + 64 * 1024,
  onError: () => {
    throw new HttpError(413, TOO_BIG)
  },
})

const summary = (d: typeof documents.$inferSelect): DocumentItem => ({
  id: d.id,
  kind: d.kind,
  title: d.title,
  words: d.words,
  updatedAt: d.updatedAt.toISOString(),
  createdAt: d.createdAt.toISOString(),
})
const full = (d: typeof documents.$inferSelect) => ({ ...summary(d), html: d.html, settings: docSettings(d.settings), content: d.content ?? null }) satisfies DocumentFull & { kind: DocKind; content: unknown }

async function own(userId: number, id: number) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
  if (!doc) throw notFound('Dit bestand bestaat niet (meer).')
  return doc
}

/** The Tools' files: documents, workbooks and presentations (private; nobody else can open them). */
export const documentRoutes = new Hono<AppEnv>()
  // ?soort=woord|rekenblad|presentatie, or all of them
  .get('/me/documents', async (c) => {
    const me = requireUser(c)
    const kind = c.req.query('soort')
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.userId, me.id), isDocKind(kind) ? eq(documents.kind, kind) : undefined))
      .orderBy(desc(documents.updatedAt))
    return c.json(rows.map(summary))
  })

  .get('/me/documents/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    return c.json(full(await own(me.id, Number(c.req.param('id')))))
  })

  .post('/me/documents', docBody, rateLimit('documenten', 60, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({
        kind: z.enum(Object.keys(DOC_KINDS) as [DocKind]).default('woord'),
        title: titleSchema,
        html: htmlSchema.default(''),
        content: z.unknown().optional(),
        settings: settingsSchema.default({}),
        words: wordsSchema.default(0),
      }),
      await c.req.json().catch(() => null),
    )
    const [{ n }] = await db.select({ n: count() }).from(documents).where(eq(documents.userId, me.id))
    if (n >= MAX_DOCUMENTS) throw new HttpError(400, `Je kunt maximaal ${MAX_DOCUMENTS} bestanden bewaren. Verwijder er eerst een.`)
    const [row] = await db
      .insert(documents)
      .values({
        userId: me.id,
        kind: input.kind,
        title: input.title,
        html: input.kind === 'woord' ? input.html : '',
        content: contentFor(input.kind, input.content) ?? null,
        settings: docSettings(input.settings),
        words: input.words,
      })
      .returning()
    return c.json(full(row), 201)
  })

  // Saving (also the autosave every so often while you work)
  .patch('/me/documents/:id{[0-9]+}', docBody, rateLimit('documenten opslaan', 600, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({ title: titleSchema.optional(), html: htmlSchema.optional(), content: z.unknown().optional(), settings: settingsSchema.optional(), words: wordsSchema.optional() }),
      await c.req.json().catch(() => null),
    )
    const doc = await own(me.id, Number(c.req.param('id')))
    const content = contentFor(doc.kind, input.content, doc.content)
    const [row] = await db
      .update(documents)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.html !== undefined && doc.kind === 'woord' && { html: input.html }),
        ...(content !== undefined && { content }),
        ...(input.words !== undefined && { words: input.words }),
        ...(input.settings && { settings: docSettings({ ...docSettings(doc.settings), ...input.settings }) }),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id))
      .returning()
    return c.json(full(row))
  })

  .delete('/me/documents/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    await db.delete(documents).where(and(eq(documents.id, Number(c.req.param('id'))), eq(documents.userId, me.id)))
    return c.body(null, 204)
  })

  // ------------------------------------------------------------ Kuddes Formulieren: answering a form, and the answers

  // A form to fill in (members only), without the maker's settings
  .get('/forms/:publicId', async (c) => {
    const me = requireUser(c)
    const { doc, owner } = await formByPublicId(c.req.param('publicId'))
    const form = doc.content as FormDef
    const [mine] = await db
      .select({ id: formResponses.id })
      .from(formResponses)
      .where(and(eq(formResponses.documentId, doc.id), eq(formResponses.userId, me.id)))
    return c.json({
      publicId: form.publicId!,
      title: doc.title,
      description: form.description,
      questions: form.questions,
      open: form.open,
      anonymous: form.anonymous,
      owner,
      answered: !!mine,
    } satisfies PublicForm)
  })

  .post('/forms/:publicId/responses', rateLimit('formulieren invullen', 30, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { doc } = await formByPublicId(c.req.param('publicId'))
    const form = doc.content as FormDef
    if (!form.open) throw new HttpError(400, 'Dit formulier is gesloten: er kunnen geen antwoorden meer bij.')
    const { answers } = parse(z.object({ answers: z.record(z.string(), z.unknown()) }), await c.req.json().catch(() => null))
    const clean = checkAnswers(form.questions, answers)
    const [row] = await db.insert(formResponses).values({ documentId: doc.id, userId: me.id, answers: clean }).onConflictDoNothing().returning({ id: formResponses.id })
    if (!row) throw new HttpError(409, 'Je hebt dit formulier al ingevuld.')
    return c.body(null, 201)
  })

  // The answers to your own form (names left out when it's anonymous)
  .get('/me/documents/:id{[0-9]+}/responses', async (c) => {
    const me = requireUser(c)
    const doc = await own(me.id, Number(c.req.param('id')))
    if (doc.kind !== 'formulier') throw notFound('Dit is geen formulier.')
    const anonymous = (doc.content as FormDef | null)?.anonymous ?? false
    const rows = await db
      .select({ r: formResponses, username: users.username, nickname: users.nickname })
      .from(formResponses)
      .innerJoin(users, eq(users.id, formResponses.userId))
      .where(eq(formResponses.documentId, doc.id))
      .orderBy(desc(formResponses.id))
    return c.json(
      rows.map(
        ({ r, username, nickname }): FormResponse => ({ id: r.id, createdAt: r.createdAt.toISOString(), answers: r.answers, user: anonymous ? null : { username, nickname } }),
      ),
    )
  })

  .delete('/me/documents/:id{[0-9]+}/responses/:rid{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const doc = await own(me.id, Number(c.req.param('id')))
    await db.delete(formResponses).where(and(eq(formResponses.id, Number(c.req.param('rid'))), eq(formResponses.documentId, doc.id)))
    return c.body(null, 204)
  })

async function formByPublicId(publicId: string) {
  const [row] = await db
    .select({ doc: documents, username: users.username, nickname: users.nickname })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.userId))
    .where(and(eq(documents.kind, 'formulier'), sql`${documents.content}->>'publicId' = ${publicId}`, sql`${users.blockedAt} is null`))
  if (!row) throw notFound('Dit formulier bestaat niet (meer).')
  return { doc: row.doc, owner: { username: row.username, nickname: row.nickname } }
}

/** The answers, checked against the questions: required ones there, choices among the options, numbers and dates as such. */
function checkAnswers(questions: Question[], raw: Record<string, unknown>): FormAnswers {
  const out: FormAnswers = {}
  for (const q of questions) {
    const v = raw[q.id]
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) {
      if (q.required) throw new HttpError(400, `Vul “${q.title || 'deze vraag'}” in.`, { [q.id]: 'Verplicht' })
      continue
    }
    const bad = () => new HttpError(400, `Het antwoord op “${q.title || 'een vraag'}” klopt niet.`, { [q.id]: 'Ongeldig' })
    switch (q.type) {
      case 'kort':
      case 'lang':
        if (typeof v !== 'string' || v.length > ANSWER_MAX) throw bad()
        out[q.id] = v.trim()
        break
      case 'keuze':
      case 'lijst':
        if (typeof v !== 'string' || !q.options.includes(v)) throw bad()
        out[q.id] = v
        break
      case 'vinkjes':
        if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && q.options.includes(x))) throw bad()
        out[q.id] = [...new Set(v as string[])]
        break
      case 'getal': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
        if (!Number.isFinite(n)) throw bad()
        out[q.id] = n
        break
      }
      case 'datum':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad()
        out[q.id] = v
        break
      case 'schaal': {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1 || n > (q.scaleMax ?? 5)) throw bad()
        out[q.id] = n
        break
      }
    }
  }
  return out
}

