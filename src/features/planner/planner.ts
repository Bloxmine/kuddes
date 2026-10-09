import { TASK_COLUMNS, type Planner, type Task, type TaskColumn } from '../../../shared/documents'

export const newId = () => crypto.randomUUID().slice(0, 8)

export const PRIORITIES: Record<Task['priority'], string> = {
  laag: 'Laag',
  normaal: 'Normaal',
  hoog: 'Hoog',
}

export const newTask = (title: string, column: TaskColumn = 'todo', due: string | null = null): Task => ({
  id: newId(),
  title,
  notes: '',
  column,
  due,
  priority: 'normaal',
  label: null,
  checklist: [],
})

/** A new planner shows what it's for with a few example tasks. */
export const blankPlanner = (): Planner => {
  const today = dayKey(new Date())
  return {
    tasks: [
      { ...newTask('Sleep een taak naar een andere kolom'), label: 'blauw' },
      {
        ...newTask('Klik op een taak om hem te bewerken', 'todo', today),
        checklist: [{ id: newId(), text: 'Een stap afvinken', done: false }],
      },
      { ...newTask('Een planner maken', 'klaar'), label: 'groen' },
    ],
  }
}

/** yyyy-mm-dd in local time (toISOString would give the UTC day). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** The Monday of that week. */
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
/** Semicolons, as Dutch Excel expects. */
export const toCsv = (tasks: Task[]) =>
  [
    ['Taak', 'Status', 'Datum', 'Prioriteit', 'Label', 'Checklist', 'Notities'],
    ...tasks.map((t) => [
      t.title,
      TASK_COLUMNS[t.column],
      t.due ?? '',
      PRIORITIES[t.priority],
      t.label ?? '',
      t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : '',
      t.notes,
    ]),
  ]
    .map((row) => row.map(cell).join(';'))
    .join('\r\n')
