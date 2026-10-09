import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FORUM_LIMITS, parseForumTags, threadHref } from '../../../shared/forum'
import { RequireAuth } from '../../components/layout/RequireAuth'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { IconPicker } from '../../components/ui/IconPicker'
import { ForumEditor } from '../../features/forum/ForumEditor'
import { PollEditor } from '../../components/social/PollBox'
import { POLL_LIMITS } from '../../../shared/polls'
import { ForumLayout } from '../../features/forum/ForumLayout'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { keys, useForumIndex } from '../../lib/queries'
import { usePageTitle } from '../../lib/usePageTitle'

function NewThread() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: index } = useForumIndex()
  const [section, setSection] = useState(params.get('sectie') ?? '')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [poll, setPoll] = useState<{ question: string; options: string[] } | null>(null)
  const viewer = index?.viewer
  // Staff-only sections only for their moderators and admins
  const sections = (index?.sections ?? []).filter((s) => !s.staffOnly || viewer?.role === 'admin' || viewer?.moderates.includes(s.id))
  const current = sections.find((s) => s.slug === section)

  const create = useMutation({
    mutationFn: () =>
      api<{ id: number; section: string; title: string }>(`/forum/sections/${section}/threads`, { method: 'POST', body: { title, tags: parseForumTags(tags), body, poll, icon } }),
    onSuccess: async (t) => {
      await queryClient.invalidateQueries({ queryKey: keys.allForum })
      navigate(threadHref(t.section, t.id, t.title))
    },
  })
  const fields = create.error instanceof ApiRequestError ? create.error.fields : {}

  return (
    <ForumLayout crumbs={[...(current ? [{ label: current.name, to: `/forum/${current.slug}` }] : []), { label: 'Nieuw onderwerp' }]}>
      <Box title="Nieuw onderwerp" icon="add">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <div className="settings-grid">
            <Field label="Forumdeel">
              <select className="text-box" value={section} onChange={(e) => setSection(e.target.value)} required>
                <option value="">Kies…</option>
                {[...new Set(sections.map((s) => s.category))].map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {/* Each section with its subforums right under it */}
                    {sections
                      .filter((s) => s.category === cat && !s.parent)
                      .flatMap((s) => [s, ...sections.filter((c) => c.parent?.id === s.id)])
                      .map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.parent ? `\u00a0\u00a0↳ ${s.name}` : s.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Tags" hint="(max. 5, scheiden met komma's)" error={fields.tags}>
              <input className="text-box" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="games, retro" />
            </Field>
          </div>
          <div className="fm-title-row">
            <div className="field">
              <span>Pictogram</span>
              <IconPicker value={icon} onChange={setIcon} allowNone label="Kies" />
            </div>
            <Field label="Titel" error={fields.title}>
              <input className="text-box" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={FORUM_LIMITS.title} required />
            </Field>
          </div>
          {/* Not a <label>: a click in the editor's empty space would press its first button */}
          <div className={fields.body ? 'field has-error' : 'field'}>
            <span>Bericht</span>
            <ForumEditor value={body} onChange={setBody} rows={12} placeholder="Waar wil je het over hebben?" />
            {fields.body && <span className="form-error">{fields.body}</span>}
          </div>
          {poll ? (
            <div className="fm-new-poll">
              <span className="fm-new-poll-hdr">
                <b>
                  <FarmIcon name="chart_bar" /> Poll
                </b>
                <span className="muted">komt bovenaan het onderwerp</span>
              </span>
              <PollEditor value={poll} onChange={setPoll} limits={POLL_LIMITS} />
              {fields.poll && <span className="form-error">{fields.poll}</span>}
            </div>
          ) : (
            <button type="button" className="link-button fm-add-poll" onClick={() => setPoll({ question: '', options: ['', ''] })}>
              <FarmIcon name="chart_bar" /> Poll toevoegen
            </button>
          )}
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={create.isPending || !section || title.trim().length < 3 || !body.trim()}>
              <FarmIcon name="comment" /> Onderwerp plaatsen
            </Button>
            {create.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(create.error)}</span>}
          </div>
        </form>
      </Box>
    </ForumLayout>
  )
}

/** /forum/nieuw?sectie=… */
export function ForumNewThreadPage() {
  usePageTitle('Nieuw onderwerp - Kuddes Forum')
  return <RequireAuth>{() => <NewThread />}</RequireAuth>
}
