import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SHARED_DESIGN_TEXT_MAX } from '../../../shared/customization'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Modal } from '../../components/ui/Modal'
import { errorMessage } from '../../lib/api'
import { DesignMini, ThemeMini } from '../account/LookMinis'
import { useSavedDesigns } from '../account/savedDesigns'
import { useSavedThemes } from '../account/savedThemes'
import { useGalleryActions } from './designQueries'
import './DesignGallery.css'

/** Share one of your own saved themes or designs: pick it, then a name and a few words. */
export function ShareDesignDialog({ initial = null, onClose }: { initial?: number | null; onClose: () => void }) {
  const { data: themes = [], isLoading: l1 } = useSavedThemes()
  const { data: designs = [], isLoading: l2 } = useSavedDesigns()
  const { share } = useGalleryActions()
  const [picked, setPicked] = useState<number | null>(initial)
  const [name, setName] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const all = [...themes, ...designs]
  const choice = all.find((s) => s.id === picked)

  return (
    <Modal title="Deel een design" icon="paintbrush" onClose={onClose} wide>
      {l1 || l2 ? (
        <p className="muted">Laden…</p>
      ) : all.length === 0 ? (
        <p>
          Je hebt nog geen eigen thema’s of designs bewaard. Maak er een bij <Link to="/instellingen?onderdeel=weergave#eigen-thema">Mijn thema’s</Link> of{' '}
          <Link to="/instellingen?onderdeel=pimpen#eigen-design">Mijn designs</Link>, en deel hem dan hier.
        </p>
      ) : share.isSuccess ? (
        <>
          <p className="form-success">
            <FarmIcon name="tick" /> “{share.data.name}” staat in de galerij!
          </p>
          <div className="account-actions">
            <Button onClick={onClose}>Sluiten</Button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (choice) share.mutate({ savedId: choice.id, name: name?.trim() || choice.name, description })
          }}
        >
          <p className="muted">Kies wat je wilt delen. Er gaat een kopie naar de galerij: pas je het later aan, dan blijft de gedeelde versie zoals hij is. Een achtergrondfoto gaat niet mee.</p>
          {(
            [
              ['Mijn thema’s', themes],
              ['Mijn designs', designs],
            ] as const
          ).map(
            ([title, list]) =>
              list.length > 0 && (
                <section key={title} className="dg-pick-group">
                  <h3>{title}</h3>
                  <ul className="dg-pick" role="radiogroup" aria-label={title}>
                    {list.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={picked === s.id}
                          className={picked === s.id ? 'current' : undefined}
                          onClick={() => {
                            setPicked(s.id)
                            setName(null)
                          }}
                        >
                          {s.kind === 'design' ? <DesignMini design={s.data} /> : <ThemeMini theme={s.data} />}
                          <span>{s.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
          {choice && (
            <div className="dg-share-fields">
              <label>
                Naam in de galerij
                <input className="text-box" value={name ?? choice.name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
              </label>
              <label>
                Beschrijving <span className="muted">(mag leeg blijven)</span>
                <textarea
                  className="text-box"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={SHARED_DESIGN_TEXT_MAX}
                  placeholder="Bijv. rustig en donker, mooi met een zwarte profielfoto"
                />
              </label>
            </div>
          )}
          {share.isError && <p className="form-error">{errorMessage(share.error)}</p>}
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={!choice || share.isPending}>
              <FarmIcon name="paintbrush" /> In de galerij zetten
            </Button>
            <Button onClick={onClose}>Annuleren</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
