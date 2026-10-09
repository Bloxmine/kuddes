/** Times of shows: "vandaag 20:00–22:00", "za 12 okt 20:00–21:30". */
const DAY = 86_400_000
const time = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

function dayLabel(d: Date, now = new Date()) {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(d) - start(now)) / DAY)
  if (diff === 0) return 'vandaag'
  if (diff === 1) return 'morgen'
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatShowTime(startsAt: string, endsAt: string) {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  return `${dayLabel(s)} ${time(s)}–${time(e)}`
}

/** Planned now (between start and end). */
export const isOnSchedule = (startsAt: string, endsAt: string, now = Date.now()) => new Date(startsAt).getTime() <= now && now < new Date(endsAt).getTime()

/** "1:23:45" or "23:45" since a show went live. */
export function sinceLabel(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** For <input type="datetime-local">: local time, no seconds. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
