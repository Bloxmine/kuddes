import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { KuddeEventDetail } from '../../../shared/api'
import { EVENT_LIMITS } from '../../../shared/kuddes'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { fromLocalInput, toLocalInput } from './eventTime'
import { DateTimeInput } from '../../components/ui/DateInput'

type EventFormProps = {
  kuddeSlug: string
  /** Editing this event; otherwise a new one. */
  event?: KuddeEventDetail
  onDone: (saved?: KuddeEventDetail) => void
}

/** A default start: next Saturday at 21:00. */
function nextSaturday() {
  const d = new Date()
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
  d.setHours(21, 0, 0, 0)
  return d.toISOString()
}

export function EventForm({ kuddeSlug, event, onDone }: EventFormProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    startsAt: toLocalInput(event?.startsAt ?? nextSaturday()),
    endsAt: toLocalInput(event?.endsAt ?? null),
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        description: form.description,
        location: form.location,
        startsAt: fromLocalInput(form.startsAt),
        endsAt: fromLocalInput(form.endsAt),
      }
      return event
        ? api<KuddeEventDetail>(`/events/${event.id}`, { method: 'PATCH', body })
        : api<KuddeEventDetail>(`/kuddes/${kuddeSlug}/events`, { method: 'POST', body })
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(keys.event(saved.id), saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.kudde(kuddeSlug) }),
        queryClient.invalidateQueries({ queryKey: keys.allEvents, predicate: (q) => q.queryKey[1] !== 'detail' }),
      ])
      onDone(saved)
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}

  return (
    <form
      className="event-form"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Field label="Wat ga je doen?" error={fields.title}>
        <input className="text-box" value={form.title} onChange={set('title')} maxLength={EVENT_LIMITS.title} placeholder="Bijv. Foute Party, training, reünie" required />
      </Field>
      <div className="settings-grid">
        <Field label="Begint" error={fields.startsAt}>
          <DateTimeInput value={form.startsAt} onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))} required />
        </Field>
        <Field label="Eindigt" hint="(optioneel)" error={fields.endsAt}>
          <DateTimeInput value={form.endsAt} onChange={(v) => setForm((f) => ({ ...f, endsAt: v }))} min={form.startsAt} defaultTime={form.startsAt.slice(11, 16) || '23:00'} />
        </Field>
      </div>
      <Field label="Waar?" hint="(optioneel)" error={fields.location}>
        <input className="text-box" value={form.location} onChange={set('location')} maxLength={EVENT_LIMITS.location} placeholder="Adres of plek" />
      </Field>
      <Field label="Meer informatie" hint="(optioneel)" error={fields.description}>
        <textarea className="text-box" rows={4} value={form.description} onChange={set('description')} maxLength={EVENT_LIMITS.description} />
      </Field>
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={save.isPending || form.title.trim().length < 3}>
          <FarmIcon name={event ? 'diskette' : 'calendar_add'} /> {event ? 'Opslaan' : 'Evenement plaatsen'}
        </Button>
        <Button onClick={() => onDone()}>Annuleren</Button>
        {save.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(save.error)}</span>}
      </div>
    </form>
  )
}
