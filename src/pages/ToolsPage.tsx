import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DOC_KINDS, type DocKind, type DocumentItem } from '../../shared/documents'
import { CatalogHero } from '../components/catalog/Catalog'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatTime } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import './ToolsPage.css'

/** The programs that are there, with what they do. */
const PROGRAMS: { kind: DocKind; text: string; button: string }[] = [
  {
    kind: 'woord',
    text: 'Een tekstverwerker zoals Word 2007: het lint met Start, Invoegen en Pagina-indeling, stijlen, tabellen, afbeeldingen, WordArt en Hyves-smileys. Om te zetten naar Word, een webpagina of tekst.',
    button: 'Nieuw document',
  },
  {
    kind: 'rekenblad',
    text: 'Rekenen zoals in Excel 2007: formules als SOM, GEMIDDELDE en ALS, de vulgreep, sorteren, valuta en procenten, werkbladen en grafieken van je cijfers. Om te zetten naar Excel of CSV.',
    button: 'Nieuwe werkmap',
  },
  {
    kind: 'presentatie',
    text: 'Dia’s maken zoals in PowerPoint 2007: indelingen, thema’s, tekst, foto’s, vormen en smileys, overgangen, notities en een diavoorstelling op volledig scherm. Om te zetten naar een webpagina.',
    button: 'Nieuwe presentatie',
  },
]

/** The smaller programs, as cards under the Office ones. Rekenmachine keeps no files, so it's open to everyone. */
const MORE: { kind: DocKind | null; icon: FarmIconName; name: string; path: string; text: string; button: string }[] = [
  { kind: 'studio', icon: 'drum', name: 'Kuddes Studio', path: '/tools/studio', text: 'Beats en liedjes maken, zoals in FL Studio en GarageBand: drums in stappen, melodieën in de pianorol en patronen achter elkaar in een nummer. Exporteren als WAV.', button: 'Nieuw project' },
  { kind: 'paint', icon: 'paintbrush', name: 'Kuddes Paint', path: '/tools/paint', text: 'Tekenen zoals vroeger in Paint: potlood, kwast, spuitbus, emmer, vormen en tekst. Opslaan bij je foto’s of als profielfoto.', button: 'Nieuwe tekening' },
  { kind: 'planner', icon: 'calendar_view_week', name: 'Kuddes Planner', path: '/tools/planner', text: 'Taken op een bord (te doen, bezig, klaar), in een weekplanning of als lijst, met datums, labels en checklists.', button: 'Nieuwe planner' },
  { kind: 'mindmap', icon: 'chart_organisation', name: 'Kuddes Mindmap', path: '/tools/mindmap', text: 'Ideeën als een boom van takken, voor een werkstuk, een project of het plannen van een feest. Met Tab en Enter ben je zo klaar.', button: 'Nieuwe mindmap' },
  { kind: 'formulier', icon: 'application_form', name: 'Kuddes Formulieren', path: '/tools/formulier', text: 'Enquêtes en aanmeldformulieren voor andere leden. Deel de link; de antwoorden zie je als grafiek of in een rekenblad.', button: 'Nieuw formulier' },
  { kind: null, icon: 'calculator', name: 'Rekenmachine', path: '/tools/rekenmachine', text: 'Een rekenmachine met een wetenschappelijke stand, grafieken tekenen (nulpunten, toppen, snijpunten), geheugen en het omrekenen van eenheden.', button: 'Openen' },
  { kind: 'kladblok', icon: 'note', name: 'Kladblok', path: '/tools/kladblok', text: 'Snel iets opschrijven, zonder opmaak, en het overal terugvinden waar je inlogt.', button: 'Nieuwe notitie' },
]

/**
 * Tools: professional programs for members, in the look of Office 2007:
 * Kuddes Woord, Rekenblad and Presentatie, your files, and the smaller programs.
 */
export function ToolsPage() {
  usePageTitle('Tools - Kuddes')
  const { user } = useAuth()
  const docs = useQuery({ queryKey: ['me', 'documents'], queryFn: () => api<DocumentItem[]>('/me/documents'), enabled: !!user })

  return (
    <main className="page page-con tl-page">
      <CatalogHero title="Tools" intro="Programma’s om echt iets mee te maken: schrijven, rekenen, presenteren, tekenen en plannen. Alles bewaard bij je account, en alleen voor jou." />

      <div className="tl-top">
        <ul className="tl-programs">
          {PROGRAMS.map((p) => {
            const info = DOC_KINDS[p.kind]
            return (
              <li key={p.kind} className="box tl-app">
                <span className="tl-app-icon" aria-hidden="true">
                  <FarmIcon name={info.icon} size={32} />
                </span>
                <div className="tl-app-text">
                  <h2>{info.name}</h2>
                  <p>{p.text}</p>
                  {user ? (
                    <Link to={info.path} className="btn btn-cta">
                      <FarmIcon name="page_white_add" /> {p.button}
                    </Link>
                  ) : (
                    <Link to={`/inloggen?next=${info.path}`} className="btn btn-cta">
                      Log in om te beginnen
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {user && (
          <section className="box tl-docs sticky-side" id="documenten" aria-labelledby="tl-docs-title">
            <h2 id="tl-docs-title">
              <FarmIcon name="folder_page" /> Mijn bestanden
            </h2>
            {docs.isLoading ? (
              <p className="muted">Laden…</p>
            ) : !docs.data?.length ? (
              <p className="empty">Nog niets bewaard. Begin met een van de programma’s hiernaast!</p>
            ) : (
              <ul>
                {docs.data.map((d) => {
                  const info = DOC_KINDS[d.kind]
                  return (
                    <li key={d.id}>
                      <Link to={`${info.path}/${d.id}`}>
                        <FarmIcon name={info.icon} />
                        <b>{d.title}</b>
                        <span className="muted">
                          {d.words.toLocaleString('nl-NL')} {info.size} · {formatTime(d.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      <section className="tl-more" aria-labelledby="tl-meer">
        <h2 id="tl-meer">Meer programma’s</h2>
        <ul>
          {MORE.map((t) => (
            <li key={t.name} className="box">
              <span className="tl-app-icon small" aria-hidden="true">
                <FarmIcon name={t.icon} size={32} />
              </span>
              <div>
                <h3>{t.name}</h3>
                <p>{t.text}</p>
                {user || !t.kind ? (
                  <Link to={t.path} className="btn">
                    <FarmIcon name={t.kind ? 'page_white_add' : t.icon} /> {t.button}
                  </Link>
                ) : (
                  <Link to={`/inloggen?next=${t.path}`} className="btn">
                    Log in om te beginnen
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
