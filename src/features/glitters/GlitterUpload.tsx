import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { GLITTER_CATEGORIES, GLITTER_LIMITS, type Glitter, type GlitterCategory } from '../../../shared/glitters'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { glitterKeys } from './glitterQueries'

/** "Plaats Glitterplaatje": a GIF (or PNG/WebP), a title and one or more categories. `onPlaced` gets the new one (to use it right away). */
export function GlitterUpload({ onClose, initialCategory, onPlaced }: { onClose: () => void; initialCategory: GlitterCategory | null; onPlaced?: (glitter: Glitter) => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [categories, setCategories] = useState<GlitterCategory[]>(initialCategory ? [initialCategory] : [])
  const [fileError, setFileError] = useState<string | null>(null)

  // The preview's object URL is freed when it's replaced or the dialog closes
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set('file', file!)
      form.set('title', title)
      form.set('categories', categories.join(','))
      return api<Glitter>('/glitters', { method: 'POST', form })
    },
    onSuccess: (glitter) => {
      queryClient.invalidateQueries({ queryKey: glitterKeys.all })
      onPlaced?.(glitter)
      onClose()
    },
  })
  const fields = upload.error instanceof ApiRequestError ? upload.error.fields : {}

  return (
    <Modal title="Plaats een glitterplaatje" icon="picture_add" onClose={onClose}>
      <form
        className="gl-upload"
        onSubmit={(e) => {
          e.preventDefault()
          if (file) upload.mutate()
        }}
      >
        <label className={preview ? 'gl-drop has-file' : 'gl-drop'}>
          {preview ? <img src={preview} alt="Voorbeeld" /> : <FarmIcon name="picture_add" size={32} />}
          <span>{file ? file.name : 'Kies een GIF, PNG of WebP (tot 4 MB)'}</span>
          <input
            type="file"
            accept="image/gif,image/png,image/webp,image/jpeg"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFileError(f && f.size > GLITTER_LIMITS.bytes ? 'Dit plaatje is groter dan 4 MB.' : null)
              const ok = f && f.size <= GLITTER_LIMITS.bytes ? f : null
              setFile(ok)
              setPreview(ok ? URL.createObjectURL(ok) : null)
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, GLITTER_LIMITS.title))
            }}
          />
        </label>
        {fileError && <p className="form-error">{fileError}</p>}
        <Field label="Titel" error={fields.title}>
          <input className="text-box" value={title} maxLength={GLITTER_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <TagPicker value={categories} onChange={setCategories} error={tagError(fields)} />
        <p className="muted">
          <FarmIcon name="information" /> Iedereen kan je plaatje gebruiken in een knuffel. Upload alleen plaatjes die je mag delen, zonder foto's van
          echte mensen die dat niet weten. Animaties blijven bewaard; we maken het bestand wel kleiner.
        </p>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!file || !title.trim() || !categories.length || upload.isPending}>
            <FarmIcon name="picture_add" /> {upload.isPending ? 'Uploaden…' : 'Plaatsen'}
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
          {upload.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(upload.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}

/** The server names a wrong tag by its place ("categories.0"). */
const tagError = (fields: Record<string, string>) => Object.entries(fields).find(([k]) => k.startsWith('categories'))?.[1]

/** The categories as chips to switch on and off, up to GLITTER_LIMITS.tags. */
function TagPicker({ value, onChange, error }: { value: GlitterCategory[]; onChange: (tags: GlitterCategory[]) => void; error?: string }) {
  const full = value.length >= GLITTER_LIMITS.tags
  return (
    <fieldset className="gl-tag-pick">
      <legend>
        Categorieën <span className="hint">kies er 1 tot {GLITTER_LIMITS.tags}, bijvoorbeeld Dieren én Weekend</span>
      </legend>
      <div className="gl-tag-chips">
        {(Object.keys(GLITTER_CATEGORIES) as GlitterCategory[]).map((k) => {
          const on = value.includes(k)
          return (
            <button
              key={k}
              type="button"
              className={on ? 'gl-tag-chip on' : 'gl-tag-chip'}
              aria-pressed={on}
              disabled={!on && full}
              title={!on && full ? `Maximaal ${GLITTER_LIMITS.tags} categorieën` : GLITTER_CATEGORIES[k].hint}
              onClick={() => onChange(on ? value.filter((t) => t !== k) : [...value, k])}
            >
              <FarmIcon name={GLITTER_CATEGORIES[k].icon as FarmIconName} /> {GLITTER_CATEGORIES[k].name}
            </button>
          )
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
    </fieldset>
  )
}

/** Change the categories of a plaatje you placed. */
export function GlitterTags({ glitter, onClose }: { glitter: Glitter; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [categories, setCategories] = useState<GlitterCategory[]>(glitter.categories)
  const save = useMutation({
    mutationFn: () => api<void>(`/glitters/${glitter.id}`, { method: 'PATCH', body: { categories } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: glitterKeys.all })
      onClose()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <Modal title={`Categorieën van "${glitter.title}"`} icon="tag_blue" onClose={onClose}>
      <form
        className="gl-upload"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <img className="gl-tags-preview" src={glitter.url} alt="" />
        <TagPicker value={categories} onChange={setCategories} error={tagError(fields)} />
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!categories.length || save.isPending}>
            <FarmIcon name="accept" /> {save.isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
          {save.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}
