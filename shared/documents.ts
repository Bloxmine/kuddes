/**
 * Kuddes Woord (Tools → /tools/woord): private documents with a page layout.
 * The server keeps them per member; only the owner can open them.
 */

export const DOC_MARGINS = { normaal: 'Normaal', smal: 'Smal', breed: 'Breed' } as const
export type DocMargins = keyof typeof DOC_MARGINS

export type DocSettings = {
  margins: DocMargins
  orientation: 'staand' | 'liggend'
  columns: 1 | 2 | 3
  /** The page's colour (a hex), white by default. */
  pageColor: string
}

export const DEFAULT_DOC_SETTINGS: DocSettings = { margins: 'normaal', orientation: 'staand', columns: 1, pageColor: '#ffffff' }

/** Up to this many documents per member, each up to this many characters (pictures are stored inside it). */
export const MAX_DOCUMENTS = 200
export const MAX_DOCUMENT_CHARS = 6_000_000
export const DOC_TITLE_MAX = 80

export type DocumentSummary = { id: number; title: string; words: number; updatedAt: string; createdAt: string }
export type DocumentFull = DocumentSummary & { html: string; settings: DocSettings }

const HEX = /^#[0-9a-f]{6}$/i

/** Stored settings back to a complete, valid set (unknown or broken values become the default). */
export function docSettings(raw: unknown): DocSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    margins: typeof r.margins === 'string' && r.margins in DOC_MARGINS ? (r.margins as DocMargins) : DEFAULT_DOC_SETTINGS.margins,
    orientation: r.orientation === 'liggend' ? 'liggend' : 'staand',
    columns: r.columns === 2 || r.columns === 3 ? r.columns : 1,
    pageColor: typeof r.pageColor === 'string' && HEX.test(r.pageColor) ? r.pageColor : DEFAULT_DOC_SETTINGS.pageColor,
  }
}

// ------------------------------------------------------------ the kinds of document

export const DOC_KINDS = {
  woord: { name: 'Kuddes Woord', one: 'document', many: 'documenten', path: '/tools/woord', icon: 'page_white_word', size: 'woorden', newTitle: 'Document1' },
  rekenblad: { name: 'Kuddes Rekenblad', one: 'werkmap', many: 'werkmappen', path: '/tools/rekenblad', icon: 'page_white_excel', size: 'cellen', newTitle: 'Map1' },
  presentatie: { name: 'Kuddes Presentatie', one: 'presentatie', many: 'presentaties', path: '/tools/presentatie', icon: 'page_white_powerpoint', size: 'dia’s', newTitle: 'Presentatie1' },
  paint: { name: 'Kuddes Paint', one: 'tekening', many: 'tekeningen', path: '/tools/paint', icon: 'paintbrush', size: 'px breed', newTitle: 'Naamloos' },
  mindmap: { name: 'Kuddes Mindmap', one: 'mindmap', many: 'mindmaps', path: '/tools/mindmap', icon: 'chart_organisation', size: 'onderwerpen', newTitle: 'Mindmap1' },
  planner: { name: 'Kuddes Planner', one: 'planner', many: 'planners', path: '/tools/planner', icon: 'calendar_view_week', size: 'taken', newTitle: 'Mijn planner' },
  formulier: { name: 'Kuddes Formulieren', one: 'formulier', many: 'formulieren', path: '/tools/formulier', icon: 'application_form', size: 'vragen', newTitle: 'Formulier1' },
  kladblok: { name: 'Kladblok', one: 'notitie', many: 'notities', path: '/tools/kladblok', icon: 'note', size: 'woorden', newTitle: 'Naamloos' },
  studio: { name: 'Kuddes Studio', one: 'project', many: 'projecten', path: '/tools/studio', icon: 'drum', size: 'patronen', newTitle: 'Mijn beat' },
} as const
export type DocKind = keyof typeof DOC_KINDS
export const isDocKind = (k: unknown): k is DocKind => typeof k === 'string' && k in DOC_KINDS

export type DocumentItem = DocumentSummary & { kind: DocKind }

// ------------------------------------------------------------ Kuddes Rekenblad

/** Columns A to Z and this many rows, per sheet; at most this many sheets. */
export const SHEET_COLS = 26
export const SHEET_ROWS = 200
export const MAX_SHEETS = 10
export const MAX_CHARTS = 12
export const CELL_MAX = 2000

export const NUMBER_FORMATS = { standaard: 'Standaard', getal: 'Getal', valuta: 'Valuta (€)', procent: 'Percentage', tekst: 'Tekst' } as const
export type NumberFormat = keyof typeof NUMBER_FORMATS

export type CellFormat = {
  b?: boolean
  i?: boolean
  u?: boolean
  color?: string
  fill?: string
  align?: 'left' | 'center' | 'right'
  num?: NumberFormat
  /** Decimals for getal, valuta and procent. */
  dec?: number
  border?: boolean
}

export type ChartType = 'staaf' | 'kolom' | 'lijn' | 'taart'
export type SheetChart = { id: string; type: ChartType; range: string; title: string; x: number; y: number; w: number; h: number }

export type Sheet = {
  name: string
  /** What was typed, per cell ("A1" → "12" or "=SOM(A1:A3)"). */
  cells: Record<string, string>
  formats: Record<string, CellFormat>
  /** Column widths in pixels, per column letter. */
  widths: Record<string, number>
  charts: SheetChart[]
}

export type Workbook = { sheets: Sheet[]; active: number }

export const emptySheet = (name: string): Sheet => ({ name, cells: {}, formats: {}, widths: {}, charts: [] })
export const EMPTY_WORKBOOK: Workbook = { sheets: [emptySheet('Blad1'), emptySheet('Blad2'), emptySheet('Blad3')], active: 0 }

// ------------------------------------------------------------ Kuddes Presentatie

/** Slides are drawn on a 960×540 (16:9) canvas; positions and sizes are in those units. */
export const SLIDE_W = 960
export const SLIDE_H = 540
export const MAX_SLIDES = 100
export const MAX_ELEMENTS = 40

export const SLIDE_THEMES = {
  office: { name: 'Office', bg: '#ffffff', bg2: '#ffffff', title: '#1f497d', text: '#000000', accent: '#4f81bd', font: 'Calibri, Carlito, sans-serif', titleFont: 'Cambria, Caladea, Georgia, serif' },
  hemel: { name: 'Hemelsblauw', bg: '#dbeaf8', bg2: '#8db3e2', title: '#17365d', text: '#17365d', accent: '#1f497d', font: 'Calibri, Carlito, sans-serif', titleFont: 'Calibri, Carlito, sans-serif' },
  aurora: { name: 'Aurora', bg: '#0c1d3d', bg2: '#2a6b8a', title: '#ffffff', text: '#e3eefc', accent: '#7fd1ff', font: '"Trebuchet MS", sans-serif', titleFont: '"Trebuchet MS", sans-serif' },
  zonsondergang: { name: 'Zonsondergang', bg: '#ffe2b8', bg2: '#f26b38', title: '#5a1f00', text: '#3d1500', accent: '#c0392b', font: 'Georgia, serif', titleFont: 'Georgia, serif' },
  natuur: { name: 'Natuur', bg: '#eef6e3', bg2: '#9bbb59', title: '#2f4a12', text: '#24350f', accent: '#76923c', font: 'Calibri, Carlito, sans-serif', titleFont: 'Cambria, Caladea, Georgia, serif' },
  snoep: { name: 'Snoepwinkel', bg: '#fff0f7', bg2: '#ffb3d9', title: '#a3195b', text: '#5c0f34', accent: '#e8478f', font: '"Comic Sans MS", "Comic Neue", cursive', titleFont: '"Comic Sans MS", "Comic Neue", cursive' },
  nacht: { name: 'Nacht', bg: '#1b1b1b', bg2: '#3b3b3b', title: '#f7c948', text: '#eeeeee', accent: '#f7c948', font: 'Verdana, sans-serif', titleFont: 'Verdana, sans-serif' },
  krijtbord: { name: 'Krijtbord', bg: '#2e4a3a', bg2: '#1f3328', title: '#fdfbe3', text: '#f2f2e0', accent: '#ffd966', font: '"Comic Sans MS", "Comic Neue", cursive', titleFont: '"Comic Sans MS", "Comic Neue", cursive' },
} as const
export type SlideThemeKey = keyof typeof SLIDE_THEMES

export const TRANSITIONS = { geen: 'Geen', vervagen: 'Vervagen', duwen: 'Duwen', wissen: 'Wissen', zoomen: 'Inzoomen', draaien: 'Draaien' } as const
export type Transition = keyof typeof TRANSITIONS

export const SHAPES = { rect: 'Rechthoek', round: 'Afgeronde rechthoek', ellipse: 'Ovaal', triangle: 'Driehoek', arrow: 'Pijl', star: 'Ster' } as const
export type ShapeKind = keyof typeof SHAPES

export type TextStyle = {
  font?: string
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
  bullets?: boolean
}

export type SlideElement = {
  id: string
  type: 'text' | 'image' | 'shape'
  x: number
  y: number
  w: number
  h: number
  /** Text boxes (and text on a shape). */
  text?: string
  style?: TextStyle
  /** The title and body boxes of a layout get the theme's fonts and colours. */
  role?: 'title' | 'body'
  /** Pictures: an upload on Kuddes, a smiley, or the picture itself as data. */
  src?: string
  shape?: ShapeKind
  fill?: string
  line?: string
}

export type Slide = { id: string; elements: SlideElement[]; notes: string; transition: Transition; background?: string | null }
export type Presentation = { theme: SlideThemeKey; slides: Slide[] }

/** Where a picture in a presentation may come from. */
export const IMAGE_SRC = /^(data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+|\/uploads\/[\w./-]+|\/smileys\/[\w-]+\.gif)$/i

// ------------------------------------------------------------ Kladblok

export const NOTE_FONTS = { consolas: 'Consolas', lucida: 'Lucida Console', courier: 'Courier New', calibri: 'Calibri', comic: 'Comic Sans MS' } as const
export type NoteFont = keyof typeof NOTE_FONTS
export type Note = { text: string; wrap: boolean; font: NoteFont; size: number }
export const NOTE_MAX = 500_000

// ------------------------------------------------------------ Kuddes Paint

export const PAINT_MAX_SIDE = 2000
/** A drawing: its size, and the picture itself as a PNG (data URL). */
export type Drawing = { width: number; height: number; image: string }

// ------------------------------------------------------------ Kuddes Mindmap

export const MINDMAP_MAX_NODES = 300
export const MINDMAP_COLORS = ['#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646', '#2c4d75', '#d4598f']
export type MindNode = { id: string; text: string; color?: string; collapsed?: boolean; children: MindNode[] }
export type Mindmap = { root: MindNode; style: 'klassiek' | 'modern' | 'krijt' }

// ------------------------------------------------------------ Kuddes Planner

export const TASK_COLUMNS = { todo: 'Te doen', bezig: 'Bezig', klaar: 'Klaar' } as const
export type TaskColumn = keyof typeof TASK_COLUMNS
export const TASK_LABELS = { rood: '#c0504d', oranje: '#f79646', geel: '#e8c547', groen: '#9bbb59', blauw: '#4f81bd', paars: '#8064a2' } as const
export type TaskLabel = keyof typeof TASK_LABELS
export const MAX_TASKS = 500
export type Task = {
  id: string
  title: string
  notes: string
  column: TaskColumn
  /** yyyy-mm-dd */
  due: string | null
  priority: 'laag' | 'normaal' | 'hoog'
  label: TaskLabel | null
  checklist: { id: string; text: string; done: boolean }[]
}
export type Planner = { tasks: Task[] }

// ------------------------------------------------------------ Kuddes Formulieren

export const QUESTION_TYPES = {
  kort: 'Kort antwoord',
  lang: 'Alinea',
  keuze: 'Meerkeuze',
  vinkjes: 'Selectievakjes',
  lijst: 'Keuzelijst',
  getal: 'Getal',
  datum: 'Datum',
  schaal: 'Lineaire schaal',
} as const
export type QuestionType = keyof typeof QUESTION_TYPES
export const MAX_QUESTIONS = 50
export const MAX_OPTIONS = 20
export const ANSWER_MAX = 2000

export type Question = { id: string; type: QuestionType; title: string; help: string; required: boolean; options: string[]; scaleMax?: number }
export type FormDef = {
  description: string
  questions: Question[]
  /** Answers come in only while it's open. */
  open: boolean
  /** Without names: the maker sees the answers but not who gave them. */
  anonymous: boolean
  /** The address others fill it in at (/formulieren/:publicId); set by the server. */
  publicId?: string
}

/** One answer per question: text, a number, or the ticked options. */
export type FormAnswers = Record<string, string | number | string[]>
/** What someone filling it in gets: the form, without the maker's settings. */
export type PublicForm = { publicId: string; title: string; description: string; questions: Question[]; open: boolean; anonymous: boolean; owner: { username: string; nickname: string }; answered: boolean }
export type FormResponse = { id: number; createdAt: string; answers: FormAnswers; user: { username: string; nickname: string } | null }
