import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Kudde } from '../../shared/api'
import { KUDDE_CATEGORIES, isKuddeCategory, type KuddeCategory, type KuddeVisibility } from '../../shared/kuddes'
import { RequireAuth } from '../components/layout/RequireAuth'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import { Field } from '../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../lib/api'
import { keys } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import './KuddesPage.css'
import { compressImage } from '../lib/compressImage'

export type KuddeDetailsForm = {
  description: string
  category: KuddeCategory
  subcategory: string
  address: string
  city: string
  phone: string
  website: string
  visibility: KuddeVisibility
  /** A photography Kudde (shared/photography.ts): camera details on photos, and on /fotografie. */
  photography: boolean
}

/** Category, subcategory, address and who can join: shared by "new" and "edit". */
export function KuddeDetailsFields({
  form,
  onChange,
  fields,
}: {
  form: KuddeDetailsForm
  onChange: (next: KuddeDetailsForm) => void
  fields: Record<string, string>
}) {
  const info = KUDDE_CATEGORIES[form.category]
  const set = (key: keyof KuddeDetailsForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...form, [key]: e.target.value })

  return (
    <>
      <div className="kudde-category-picker" role="radiogroup" aria-label="Categorie">
        {(Object.keys(KUDDE_CATEGORIES) as KuddeCategory[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={k === form.category}
            className={k === form.category ? 'current' : undefined}
            onClick={() => onChange({ ...form, category: k, subcategory: '' })}
          >
            <FarmIcon name={KUDDE_CATEGORIES[k].icon} size={32} />
            {KUDDE_CATEGORIES[k].name}
          </button>
        ))}
      </div>
      <Field label="Soort" error={fields.subcategory}>
        <select className="text-box" value={form.subcategory} onChange={set('subcategory')}>
          <option value="">Kies…</option>
          {info.subcategories.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Over deze ${info.singular}`} error={fields.description}>
        <textarea className="text-box" rows={3} value={form.description} onChange={set('description')} maxLength={1000} />
      </Field>
      <div className="settings-grid">
        {info.place && (
          <>
            <Field label="Adres" error={fields.address}>
              <input className="text-box" value={form.address} onChange={set('address')} maxLength={120} placeholder="Straat en huisnummer, postcode" />
            </Field>
            <Field label="Plaats" error={fields.city}>
              <input className="text-box" value={form.city} onChange={set('city')} maxLength={60} />
            </Field>
          </>
        )}
        <Field label="Telefoon" hint="(optioneel, zichtbaar voor iedereen die de Kudde ziet)" error={fields.phone}>
          <input className="text-box" type="tel" value={form.phone} onChange={set('phone')} maxLength={30} placeholder="Bijv. 020 123 45 67" />
        </Field>
        <Field label="Website" hint="(optioneel)" error={fields.website}>
          <input className="text-box" type="url" value={form.website} onChange={set('website')} maxLength={200} placeholder="https://" />
        </Field>
      </div>
      <fieldset className="kudde-visibility">
        <legend>Wie mag er lid worden?</legend>
        <label>
          <input type="radio" name="visibility" checked={form.visibility === 'openbaar'} onChange={() => onChange({ ...form, visibility: 'openbaar' })} />
          <FarmIcon name="lock_open" /> <b>Openbaar</b> <span className="muted">— iedereen kan lid worden en de evenementen zien</span>
        </label>
        <label>
          <input type="radio" name="visibility" checked={form.visibility === 'besloten'} onChange={() => onChange({ ...form, visibility: 'besloten' })} />
          <FarmIcon name="lock" /> <b>Besloten</b> <span className="muted">— jij keurt nieuwe leden goed; evenementen zijn alleen voor leden</span>
        </label>
      </fieldset>
      <label className="kudde-toggle kudde-photography">
        <input type="checkbox" checked={form.photography} onChange={(e) => onChange({ ...form, photography: e.target.checked })} />
        <FarmIcon name="camera" size={32} />
        <span>
          <b>Fotografie-Kudde</b>
          <small className="muted">
            Voor een fotoclub of iedereen die graag fotografeert: de foto’s staan groot zoals bij Fotografie, met albums om doorheen te bladeren en de camera-info (nooit de
            locatie). De Kudde staat ook op de pagina Fotografie.
          </small>
        </span>
      </label>
    </>
  )
}

function NewKuddeForm() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const start = params.get('categorie')
  const [name, setName] = useState('')
  const [form, setForm] = useState<KuddeDetailsForm>({
    description: '',
    category: isKuddeCategory(start) ? start : 'groepen',
    subcategory: '',
    address: '',
    city: '',
    phone: '',
    website: '',
    visibility: 'openbaar',
    photography: params.get('fotografie') === '1',
  })

  const create = useMutation({
    mutationFn: async () => {
      const data = new FormData()
      data.set('name', name)
      for (const [k, v] of Object.entries(form)) data.set(k, String(v))
      const file = fileRef.current?.files?.[0]
      if (file) data.set('file', await compressImage(file, 1200))
      return api<Kudde>('/kuddes', { method: 'POST', form: data })
    },
    onSuccess: async (kudde) => {
      await queryClient.invalidateQueries({ queryKey: keys.allKuddes })
      navigate(`/kuddes/${kudde.slug}`)
    },
  })
  const fields = create.error instanceof ApiRequestError ? create.error.fields : {}
  const info = KUDDE_CATEGORIES[form.category]

  return (
    <main className="page page-con">
      <h1>Nieuwe Kudde aanmaken</h1>
      <br />
      <Box title={`Nieuwe ${info.singular}`} icon="wand" className="new-kudde">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Naam" error={fields.name}>
            <input className="text-box" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
          </Field>
          <KuddeDetailsFields form={form} onChange={setForm} fields={fields} />
          <Field label="Afbeelding" hint="(optioneel, bijv. een logo of foto)">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" />
          </Field>
          <Button variant="cta" type="submit" disabled={create.isPending || name.trim().length < 3}>
            {create.isPending ? 'Bezig…' : 'Kudde aanmaken'}
          </Button>
          {create.isError && Object.keys(fields).length === 0 && <p className="form-error">{errorMessage(create.error)}</p>}
        </form>
      </Box>
    </main>
  )
}

export function NewKuddePage() {
  usePageTitle('Nieuwe Kudde - Kuddes')
  return <RequireAuth>{() => <NewKuddeForm />}</RequireAuth>
}
