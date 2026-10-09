import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Photo, SharedKuddePhoto } from '../../../shared/api'
import { FORUM_LIMITS, signatureImageLine } from '../../../shared/forum'
import type { Glitter } from '../../../shared/glitters'
import { SmileyPicker } from '../../components/social/SmileyPicker'
import { PostPhotoPicker } from '../../components/social/PostPhotoPicker'
import { kuddePhotoHref } from '../../../shared/kuddes'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Smiley } from '../../lib/smileys'
import { useTextEditing } from '../../lib/textEditing'
import { GlitterPicker } from '../glitters/GlitterPicker'
import { ForumBody, KuddesEmbed } from './ForumBody'
import { glitterLink, parseKuddesLink, photoLink, type KuddesLink } from './embeds'
import '../../components/social/StatusComposer.css'

type ForumEditorProps = {
  value: string
  onChange: (next: string) => void
  rows?: number
  placeholder?: string
  /** Text to add at the end (a quote); changes with every "Citeren" click. */
  append?: { text: string; at: number } | null
  id?: string
  /** Longer texts than a forum post (the news). */
  maxLength?: number
  /**
   * The news: extra tools for pictures (uploaded with this, which returns the
   * picture's address), YouTube videos and buttons, and the news preview.
   */
  news?: { upload: (file: File) => Promise<string> }
  /**
   * A forum signature: pictures you upload (userbars, banners), over the whole
   * width or not, with a link or not; and the signature preview.
   */
  signature?: { upload: (file: File) => Promise<string> }
}

type Panel = 'smileys' | 'fotos' | 'insluiten' | null

const EMBED_NAMES: Record<KuddesLink['type'], { label: string; icon: FarmIconName }> = {
  video: { label: 'Video', icon: 'television' },
  profiel: { label: 'Profiel', icon: 'user' },
  kudde: { label: 'Kudde', icon: 'group' },
  evenement: { label: 'Evenement', icon: 'calendar' },
  onderwerp: { label: 'Forumonderwerp', icon: 'comment' },
  forumprofiel: { label: 'Forumprofiel', icon: 'user_comment' },
  foto: { label: 'Foto', icon: 'camera' },
  kuddefoto: { label: 'Foto uit een Kudde', icon: 'camera' },
  glitter: { label: 'Glitterplaatje', icon: 'rainbow' },
}

/** A small picture of what an embed line will show, for the strip under the text. */
function EmbedThumb({ link }: { link: KuddesLink }) {
  const photo = useQuery({ queryKey: ['photos', 'one', link.type === 'foto' ? link.id : 0], queryFn: () => api<Photo>(`/photos/${(link as { id: number }).id}`), enabled: link.type === 'foto', staleTime: 5 * 60_000 })
  const glitter = useQuery({ queryKey: ['glitters', 'one', link.type === 'glitter' ? link.id : 0], queryFn: () => api<Glitter>(`/glitters/${(link as { id: number }).id}`), enabled: link.type === 'glitter', staleTime: 5 * 60_000 })
  const kuddePhoto = useQuery({
    queryKey: ['kudde-photos', 'one', link.type === 'kuddefoto' ? link.id : 0],
    queryFn: () => api<SharedKuddePhoto>(`/kudde-photos/${(link as { id: number }).id}`),
    enabled: link.type === 'kuddefoto',
    staleTime: 5 * 60_000,
  })
  const src = photo.data?.url ?? kuddePhoto.data?.url ?? glitter.data?.url
  return src ? <img src={src} alt="" /> : <FarmIcon name={EMBED_NAMES[link.type].icon} size={32} />
}

function embedTitle(link: KuddesLink, line: string) {
  switch (link.type) {
    case 'profiel':
    case 'forumprofiel':
      return link.username
    case 'kudde':
      return link.slug
    default:
      return line.replace(/^https?:\/\/[^/]+/, '')
  }
}

/** "Kuddes insluiten": paste a link and see what it becomes before it goes in. */
function EmbedPanel({ onInsert, onClose }: { onInsert: (path: string) => void; onClose: () => void }) {
  const [link, setLink] = useState('')
  const parsed = parseKuddesLink(link.trim())
  return (
    <div className="fe-panel">
      <div className="fe-panel-hdr">
        <b>
          <FarmIcon name="television" /> Iets van Kuddes insluiten
        </b>
        <button type="button" className="link-button" onClick={onClose}>
          Sluiten
        </button>
      </div>
      <p className="muted">Plak een link naar een video, profiel, Kudde, evenement, forumonderwerp, foto of glitterplaatje op Kuddes.</p>
      <div className="fe-panel-row">
        <input className="text-box" value={link} onChange={(e) => setLink(e.target.value)} placeholder={`${location.origin}/video/kijk?v=…`} aria-label="Link" autoFocus />
        <Button variant="cta" disabled={!parsed} onClick={() => onInsert(link.trim().replace(location.origin, ''))}>
          <FarmIcon name="add" /> Invoegen
        </Button>
      </div>
      {link.trim() && !parsed && <p className="form-error">Dat is geen link naar een Kuddes-pagina die we kunnen insluiten.</p>}
      {parsed && (
        <div className="fe-panel-preview">
          <span className="muted">Zo komt het in je bericht:</span>
          <KuddesEmbed link={parsed} />
        </div>
      )}
    </div>
  )
}

/**
 * Writing a post: headings, lists, formatting, smileys, photos, glitterplaatjes
 * and Kuddes embeds, and a preview tab. Posts are plain text with light markup
 * (see ForumBody); the toolbar writes it, so nobody has to know it.
 */
export function ForumEditor({ value, onChange, rows = 8, placeholder, append, id, maxLength = FORUM_LIMITS.body, news, signature }: ForumEditorProps) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'schrijven' | 'voorbeeld'>('schrijven')
  const [panel, setPanel] = useState<Panel>(null)
  const [glitters, setGlitters] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const { ref, wrap, addLink, insert } = useTextEditing(value, onChange, maxLength)
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p))

  // A quote from "Citeren" lands at the end, with the cursor after it
  const appendAt = append?.at
  useEffect(() => {
    if (!append) return
    setTab('schrijven')
    const next = `${value.trim() ? `${value.trimEnd()}\n\n` : ''}${append.text}\n\n`
    onChange(next.slice(0, maxLength))
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(next.length, next.length)
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new quote comes in
  }, [appendAt])

  const focusAt = (start: number, end = start) =>
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(start, end)
    })

  /** The whole lines the cursor or selection is on. */
  const selectedLines = () => {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? start
    const from = value.lastIndexOf('\n', start - 1) + 1
    const nl = value.indexOf('\n', Math.max(end - (end > start && value[end - 1] === '\n' ? 1 : 0), from))
    const to = nl === -1 ? value.length : nl
    return { from, to, lines: value.slice(from, to).split('\n') }
  }

  /** Changes each selected line (a heading, a list, a quote). */
  const editLines = (change: (line: string, i: number) => string) => {
    const { from, to, lines } = selectedLines()
    const replaced = lines.map(change).join('\n')
    const next = value.slice(0, from) + replaced + value.slice(to)
    if (next.length > maxLength) return
    onChange(next)
    focusAt(from, from + replaced.length)
  }

  const STRIP = /^(#{1,3}\s+|\s*[-*•]\s+|\s*\d{1,4}[.)]\s+|>\s?)/
  const heading = (level: 0 | 1 | 2 | 3) => editLines((l) => (level ? `${'#'.repeat(level)} ` : '') + l.replace(/^#{1,3}\s+/, ''))
  /** A list: on again takes it off again. */
  const list = (kind: 'bullet' | 'number' | 'quote') => {
    const { lines } = selectedLines()
    const test = kind === 'bullet' ? /^\s*[-*•]\s+/ : kind === 'number' ? /^\s*\d{1,4}[.)]\s+/ : /^>\s?/
    const on = lines.every((l) => !l.trim() || test.test(l))
    let n = 0
    editLines((l) => {
      const bare = l.replace(STRIP, '')
      if (on || !l.trim()) return on ? bare : l
      n++
      return (kind === 'bullet' ? '- ' : kind === 'number' ? `${n}. ` : '> ') + bare
    })
  }
  const center = () => editLines((l) => (/^->.*<-$/.test(l.trim()) ? l.trim().replace(/^->\s?/, '').replace(/\s?<-$/, '') : l.trim() ? `-> ${l.trim()} <-` : l))

  /** A line of its own at the cursor: an embed, or the line (---). */
  const insertLine = (line: string) => {
    const el = ref.current
    const at = el?.selectionEnd ?? value.length
    const before = value.slice(0, at)
    const after = value.slice(at)
    const pre = before && !before.endsWith('\n') ? '\n' : ''
    const post = after.startsWith('\n') ? '' : '\n'
    const next = before + pre + line + post + after
    if (next.length > maxLength) return
    onChange(next)
    setTab('schrijven')
    const cursor = (before + pre + line + post).length
    focusAt(cursor)
  }

  /** Code: in the line (`code`), or a block when the selection has more lines. */
  const code = () => {
    const el = ref.current
    const selected = el ? value.slice(el.selectionStart, el.selectionEnd) : ''
    if (selected.includes('\n')) wrap('```\n', '\n```', 'code')
    else wrap('`', '`', 'code')
  }

  const busy = useRef(false)
  /** News: upload a picture and put it in on a line of its own, with a caption to fill in. */
  const addImage = async (file: File | undefined) => {
    if (!file || !news || busy.current) return
    busy.current = true
    setUploading(true)
    setUploadError(null)
    try {
      const url = await news.upload(file)
      const caption = prompt('Een onderschrift bij de afbeelding? (mag leeg blijven)') ?? ''
      insertLine(`![${caption.replace(/[\]\n]/g, '')}](${url})`)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Uploaden is niet gelukt.')
    } finally {
      setUploading(false)
      busy.current = false
    }
  }
  /** Signature: upload a picture, and ask whether it goes over the whole width and where it links to. */
  const addSignatureImage = async (file: File | undefined, withLink: boolean) => {
    // The file input fires "input" and "change"; one upload per picture
    if (!file || !signature || busy.current) return
    busy.current = true
    let href: string | null = null
    if (withLink) {
      href = prompt('Waar gaat het plaatje heen als je erop klikt? (https://… of een pagina op Kuddes zoals /forum)')?.trim() || null
      if (!href || !/^(https?:\/\/\S+|\/(?!\/)\S*)$/.test(href)) {
        busy.current = false
        if (href) alert('Dat is geen goede link. Begin met https:// of met /.')
        return
      }
    }
    setUploading(true)
    setUploadError(null)
    try {
      const url = await signature.upload(file)
      const wide = confirm('Het plaatje over de hele breedte van je handtekening? (goed voor banners; Annuleren = gewoon op zijn eigen grootte, zoals een userbar)')
      insertLine(signatureImageLine(url, wide, href))
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Uploaden is niet gelukt.')
    } finally {
      setUploading(false)
      busy.current = false
    }
  }
  const addYoutube = () => {
    const url = prompt('Plak de link naar de YouTube-video')?.trim()
    if (!url) return
    if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(url)) return alert('Dat is geen YouTube-link.')
    insertLine(url)
  }
  const addButton = () => {
    const label = prompt('Wat staat er op de knop? (bijvoorbeeld: Probeer het nu)')?.trim()
    if (!label) return
    const href = prompt('Waar gaat de knop heen? (een pagina op Kuddes zoals /gadgetmarkt, of https://…)')?.trim()
    if (!href) return
    if (!/^(https?:\/\/|\/(?!\/))/.test(href)) return alert('Een link begint met / (een pagina op Kuddes) of met https://')
    insertLine(`[[${label.replace(/[\]\n]/g, '').slice(0, 60)}]](${href})`)
  }

  // What the post embeds, to show under the text
  const embeds = value
    .split('\n')
    .map((line, i) => ({ line: line.trim(), i, link: parseKuddesLink(line.trim()) }))
    .filter((e): e is { line: string; i: number; link: KuddesLink } => !!e.link)
  const removeLine = (i: number) => onChange(value.split('\n').filter((_, j) => j !== i).join('\n'))

  const tool = (title: string, icon: FarmIconName, onClick: () => void, pressed?: boolean) => (
    <button type="button" title={title} aria-label={title} onClick={onClick} aria-pressed={pressed} className={pressed ? 'current' : undefined}>
      <FarmIcon name={icon} />
    </button>
  )

  return (
    <div className="fe-editor">
      <div className="fe-editor-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'schrijven'} className={tab === 'schrijven' ? 'current' : undefined} onClick={() => setTab('schrijven')}>
          <FarmIcon name="pencil" /> Schrijven
        </button>
        <button type="button" role="tab" aria-selected={tab === 'voorbeeld'} className={tab === 'voorbeeld' ? 'current' : undefined} onClick={() => setTab('voorbeeld')}>
          <FarmIcon name="eye" /> Voorbeeld
        </button>
      </div>
      {tab === 'schrijven' ? (
        <div className="composer-editor">
          <div className="composer-toolbar fe-toolbar" role="toolbar" aria-label="Opmaak">
            <select
              className="fe-style"
              aria-label="Tekststijl"
              value=""
              onChange={(e) => {
                heading(Number(e.target.value) as 0 | 1 | 2 | 3)
              }}
            >
              <option value="" disabled>
                Stijl…
              </option>
              <option value="0">Normale tekst</option>
              <option value="1">Kop 1</option>
              <option value="2">Kop 2</option>
              <option value="3">Kop 3</option>
            </select>
            <span className="fe-tool-group">
              {tool('Vet', 'text_bold', () => wrap('**'))}
              {tool('Schuin', 'text_italic', () => wrap('*'))}
              {tool('Onderstreept', 'text_underline', () => wrap('__'))}
              {tool('Doorgestreept', 'text_strikethrough', () => wrap('~~'))}
            </span>
            <span className="fe-tool-group">
              {tool('Superscript (x²)', 'text_superscript', () => wrap('^^'))}
              {tool('Subscript (x₂)', 'text_subscript', () => wrap(',,'))}
              {tool('Markeren', 'highlighter', () => wrap('=='))}
              {tool('Code', 'page_white_code', code)}
            </span>
            <span className="fe-tool-group">
              {tool('Opsomming', 'text_list_bullets', () => list('bullet'))}
              {tool('Genummerde lijst', 'text_list_numbers', () => list('number'))}
              {tool('Citaat', 'comment', () => list('quote'))}
              {tool('Centreren', 'text_align_center', center)}
              {tool('Lijn', 'text_horizontalrule', () => insertLine('---'))}
            </span>
            <span className="fe-tool-group">
              {tool('Link', 'link', addLink)}
              <button type="button" title="Smileys" aria-label="Smileys" aria-expanded={panel === 'smileys'} className={panel === 'smileys' ? 'current' : undefined} onClick={() => toggle('smileys')}>
                <Smiley name="lach" />
              </button>
            </span>
            <span className="fe-tool-group fe-insert">
              {user && (
                <button type="button" className={panel === 'fotos' ? 'fe-embed-btn current' : 'fe-embed-btn'} aria-expanded={panel === 'fotos'} onClick={() => toggle('fotos')} title="Een foto uit je Foto's-box">
                  <FarmIcon name="picture_insert" /> Foto
                </button>
              )}
              {user && (
                <button type="button" className="fe-embed-btn" onClick={() => setGlitters(true)} title="Een glitterplaatje">
                  <FarmIcon name="rainbow" /> Glitter
                </button>
              )}
              <button type="button" className={panel === 'insluiten' ? 'fe-embed-btn current' : 'fe-embed-btn'} aria-expanded={panel === 'insluiten'} onClick={() => toggle('insluiten')} title="Video, profiel, Kudde, evenement of onderwerp">
                <FarmIcon name="television" /> Kuddes insluiten
              </button>
            </span>
            {signature && (
              <span className="fe-tool-group fe-insert">
                <label className={uploading ? 'fe-embed-btn busy' : 'fe-embed-btn'} title="Een plaatje (bijvoorbeeld een userbar of banner) uploaden; bewegende GIF's blijven bewegen">
                  <FarmIcon name="picture_add" /> {uploading ? 'Uploaden…' : 'Plaatje'}
                  <input type="file" accept="image/gif,image/png,image/webp,image/jpeg" hidden disabled={uploading} onChange={(e) => { void addSignatureImage(e.target.files?.[0], false); e.target.value = '' }} />
                </label>
                <label className={uploading ? 'fe-embed-btn busy' : 'fe-embed-btn'} title="Een plaatje dat een link is (naar je site, je Kudde, …)">
                  <FarmIcon name="link" /> Plaatje met link
                  <input type="file" accept="image/gif,image/png,image/webp,image/jpeg" hidden disabled={uploading} onChange={(e) => { void addSignatureImage(e.target.files?.[0], true); e.target.value = '' }} />
                </label>
              </span>
            )}
            {news && (
              <span className="fe-tool-group fe-insert">
                <label className={uploading ? 'fe-embed-btn busy' : 'fe-embed-btn'} title="Een afbeelding uploaden en in het bericht zetten">
                  <FarmIcon name="picture_add" /> {uploading ? 'Uploaden…' : 'Afbeelding'}
                  <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                <button type="button" className="fe-embed-btn" onClick={addYoutube} title="Een YouTube-video (laadt pas als je op afspelen drukt)">
                  <FarmIcon name="film" /> YouTube
                </button>
                <button type="button" className="fe-embed-btn" onClick={addButton} title="Een grote knop naar een pagina, bijvoorbeeld een nieuwe functie">
                  <FarmIcon name="link" /> Knop
                </button>
              </span>
            )}
          </div>
          <textarea
            id={id}
            ref={ref}
            className="composer-text"
            rows={rows}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label="Bericht"
            onChange={(e) => onChange(e.target.value)}
          />
          {embeds.length > 0 && (
            <div className="fe-embeds" aria-label="Ingesloten in dit bericht">
              <span className="muted">In dit bericht:</span>
              <ul>
                {embeds.map((e) => (
                  <li key={`${e.i}-${e.line}`} title={e.line}>
                    <span className="fe-embed-thumb">
                      <EmbedThumb link={e.link} />
                    </span>
                    <span className="fe-embed-label">
                      <b>{EMBED_NAMES[e.link.type].label}</b>
                      <span className="muted">{embedTitle(e.link, e.line)}</span>
                    </span>
                    <button type="button" className="icon-button" title="Weghalen uit het bericht" onClick={() => removeLine(e.i)}>
                      <FarmIcon name="cross" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className={signature ? 'fe-preview fm-signature' : 'fe-preview'}>{value.trim() ? <ForumBody body={value} news={!!news} signature={!!signature} /> : <p className="muted">Nog niets om te laten zien.</p>}</div>
      )}
      {tab === 'schrijven' && panel === 'smileys' && <SmileyPicker onPick={insert} />}
      {tab === 'schrijven' && panel === 'fotos' && user && (
        <PostPhotoPicker
          username={user.username}
          selected={[]}
          onPick={(p) => {
            insertLine(p.kind === 'eigen' ? photoLink(user.username, p.photo.id) : kuddePhotoHref(p.kudde.slug, p.photo.id))
            setPanel(null)
          }}
        />
      )}
      {tab === 'schrijven' && panel === 'insluiten' && (
        <EmbedPanel
          onClose={() => setPanel(null)}
          onInsert={(path) => {
            insertLine(path)
            setPanel(null)
          }}
        />
      )}
      {glitters && (
        <GlitterPicker
          onClose={() => setGlitters(false)}
          onPick={(g) => {
            insertLine(glitterLink(g.id))
            setGlitters(false)
          }}
        />
      )}
      {uploadError && <p className="form-error">{uploadError}</p>}
      <details className="fe-editor-help muted">
        <summary>
          Opmaakhulp · {(maxLength - value.length).toLocaleString('nl-NL')} tekens over
        </summary>
        <p>
          **vet** · *schuin* · __onderstreept__ · ~~doorgestreept~~ · ^^superscript^^ · ,,subscript,, · ==markeren== · `code` · # Kop 1 · ## Kop 2 · ### Kop 3 · - opsomming · 1.
          genummerd · &gt; citaat · -&gt; midden &lt;- · --- lijn · ``` codeblok ``` · :smiley: · [tekst](/pagina) · een Kuddes-link op een eigen regel wordt ingesloten
          {news && ' · ![onderschrift](afbeelding) · een YouTube-link op een eigen regel · [[Knoptekst]](/pagina)'}
          {signature && ` · plaatjes (max. ${FORUM_LIMITS.signatureImages}, elk op een eigen regel): ![](plaatje) · ![breed](plaatje) over de hele breedte · [![](plaatje)](https://…) als link`}
        </p>
      </details>
    </div>
  )
}
