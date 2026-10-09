/**
 * The ribbon of Kuddes Woord, as in Office 2007: tabs, and under each a row
 * of groups with big and small buttons and a name along the bottom. The
 * buttons don't take the focus, so what you selected on the page stays
 * selected while you format it.
 */
import { useRef, useState } from 'react'
import { DOC_MARGINS, type DocSettings } from '../../../shared/documents'
import { Big, ColorGrid, Group, Menu, Small } from '../office/Office'
import { keep, type Scheme } from '../office/officeFile'
import { FONTS, HIGHLIGHTS, SIZES, STYLES, SYMBOLS, type StyleKey } from './editor'

export type RibbonTab = 'start' | 'invoegen' | 'indeling' | 'beeld'
export type { Scheme }

export type FormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  sub: boolean
  sup: boolean
  ul: boolean
  ol: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  font: string
  size: number
  style: StyleKey
}

export type Dialog = 'zoeken' | 'vervangen' | 'link' | 'wordart' | 'fotos' | 'smiley'

/** What the ribbon can do to the document (WoordPage.tsx). */
export type EditorApi = {
  state: FormatState
  /** Run a change on the page: puts the selection back, then marks the document changed. */
  run: (change: () => void) => void
  command: (name: string, value?: string) => void
  insertHtml: (html: string) => void
  setFont: (family: string) => void
  setSize: (pt: number) => void
  setStyle: (key: StyleKey) => void
  setLineHeight: (value: string) => void
  changeCase: (mode: 'upper' | 'lower' | 'title') => void
  formatPainter: { armed: boolean; arm: () => void }
  insertTable: (rows: number, cols: number) => void
  insertImage: (file: File) => void
  insertPageBreak: () => void
  insertDate: (format: 'lang' | 'kort' | 'tijd') => void
  paste: () => void
  open: (dialog: Dialog) => void
  settings: DocSettings
  setSettings: (s: Partial<DocSettings>) => void
  zoom: number
  setZoom: (z: number) => void
  fitWidth: () => void
  ruler: boolean
  setRuler: (on: boolean) => void
  scheme: Scheme
  setScheme: (s: Scheme) => void
  fullscreen: () => void
}

const TABS: [RibbonTab, string][] = [
  ['start', 'Start'],
  ['invoegen', 'Invoegen'],
  ['indeling', 'Pagina-indeling'],
  ['beeld', 'Beeld'],
]

/** Hover over the grid to choose the size, as in Word. */
function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [at, setAt] = useState({ r: 0, c: 0 })
  return (
    <div className="ofc-table-grid">
      <h4>{at.r ? `Tabel van ${at.c}×${at.r}` : 'Tabel invoegen'}</h4>
      <div className="ofc-table-cells" onMouseLeave={() => setAt({ r: 0, c: 0 })}>
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 10 }, (_, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              className={r < at.r && c < at.c ? 'on' : undefined}
              onMouseEnter={() => setAt({ r: r + 1, c: c + 1 })}
              onFocus={() => setAt({ r: r + 1, c: c + 1 })}
              onClick={() => onPick(r + 1, c + 1)}
              aria-label={`${c + 1} kolommen, ${r + 1} rijen`}
            />
          )),
        )}
      </div>
    </div>
  )
}

export function Ribbon({ tab, onTab, ed }: { tab: RibbonTab; onTab: (t: RibbonTab) => void; ed: EditorApi }) {
  const s = ed.state
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <div className="ofc-ribbon">
      <div className="ofc-tabs" role="tablist">
        {TABS.map(([key, name]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : undefined} onMouseDown={keep} onClick={() => onTab(key)}>
            {name}
          </button>
        ))}
      </div>
      <div className="ofc-ribbon-body" role="tabpanel">
        {tab === 'start' && (
          <>
            <Group label="Klembord">
              <Big icon="paste_word" label="Plakken" onClick={ed.paste} title="Plakken (Ctrl+V)" />
              <div className="ofc-stack">
                <Small icon="cut" label="Knippen" onClick={() => ed.command('cut')} title="Knippen (Ctrl+X)" />
                <Small icon="page_copy" label="Kopiëren" onClick={() => ed.command('copy')} title="Kopiëren (Ctrl+C)" />
                <Small icon="format_painter" label="Opmaak kopiëren" onClick={ed.formatPainter.arm} active={ed.formatPainter.armed} title="Opmaak kopiëren: neem de opmaak van de tekst waar je cursor staat over op wat je daarna selecteert" />
              </div>
            </Group>
            <Group label="Lettertype" wide>
              <div className="ofc-rows">
                <div className="ofc-row">
                  <select
                    className="ofc-select ofc-font"
                    value={FONTS.find(([name]) => name === s.font)?.[0] ?? ''}
                    onChange={(e) => ed.setFont(e.target.value)}
                    aria-label="Lettertype"
                  >
                    {!FONTS.some(([name]) => name === s.font) && <option value="">{s.font}</option>}
                    {FONTS.map(([name, stack]) => (
                      <option key={name} value={name} style={{ fontFamily: stack }}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select className="ofc-select ofc-size" value={SIZES.includes(s.size) ? s.size : ''} onChange={(e) => ed.setSize(Number(e.target.value))} aria-label="Tekengrootte">
                    {!SIZES.includes(s.size) && <option value="">{s.size}</option>}
                    {SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Small icon="text_uppercase" onClick={() => ed.setSize(SIZES.find((n) => n > s.size) ?? s.size)} title="Lettertype vergroten" />
                  <Small icon="text_lowercase" onClick={() => ed.setSize([...SIZES].reverse().find((n) => n < s.size) ?? s.size)} title="Lettertype verkleinen" />
                  <Small icon="draw_eraser" onClick={() => ed.command('removeFormat')} title="Opmaak wissen" />
                </div>
                <div className="ofc-row">
                  <Small icon="text_bold" onClick={() => ed.command('bold')} active={s.bold} title="Vet (Ctrl+B)" />
                  <Small icon="text_italic" onClick={() => ed.command('italic')} active={s.italic} title="Cursief (Ctrl+I)" />
                  <Small icon="text_underline" onClick={() => ed.command('underline')} active={s.underline} title="Onderstrepen (Ctrl+U)" />
                  <Small icon="text_strikethrough" onClick={() => ed.command('strikeThrough')} active={s.strike} title="Doorhalen" />
                  <Small icon="text_subscript" onClick={() => ed.command('subscript')} active={s.sub} title="Subscript" />
                  <Small icon="text_superscript" onClick={() => ed.command('superscript')} active={s.sup} title="Superscript" />
                  <Menu icon="text_smallcaps" title="Hoofdletters/kleine letters">
                    {(close) => (
                      <div className="ofc-popup-list">
                        {(
                          [
                            ['upper', 'HOOFDLETTERS'],
                            ['lower', 'kleine letters'],
                            ['title', 'Elk Woord Met Hoofdletter'],
                          ] as const
                        ).map(([mode, name]) => (
                          <button key={mode} type="button" className="ofc-popup-item" onClick={() => (ed.changeCase(mode), close())}>
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </Menu>
                  <Menu icon="highlighter" title="Tekstmarkeringskleur">
                    {(close) => <ColorGrid colors={[HIGHLIGHTS.slice(0, 7), HIGHLIGHTS.slice(7)]} standard={[]} none="Geen kleur" onPick={(c) => (ed.run(() => document.execCommand('hiliteColor', false, c ?? 'transparent')), close())} />}
                  </Menu>
                  <Menu icon="font" title="Tekstkleur">
                    {(close) => <ColorGrid none="Automatisch" onPick={(c) => (ed.run(() => document.execCommand('foreColor', false, c ?? '#000000')), close())} />}
                  </Menu>
                </div>
              </div>
            </Group>
            <Group label="Alinea" wide>
              <div className="ofc-rows">
                <div className="ofc-row">
                  <Small icon="text_list_bullets" onClick={() => ed.command('insertUnorderedList')} active={s.ul} title="Opsommingstekens" />
                  <Small icon="text_list_numbers" onClick={() => ed.command('insertOrderedList')} active={s.ol} title="Nummering" />
                  <Small icon="text_indent_remove" onClick={() => ed.command('outdent')} title="Inspringing verkleinen" />
                  <Small icon="text_indent" onClick={() => ed.command('indent')} title="Inspringing vergroten" />
                </div>
                <div className="ofc-row">
                  <Small icon="text_align_left" onClick={() => ed.command('justifyLeft')} active={s.align === 'left'} title="Links uitlijnen (Ctrl+L)" />
                  <Small icon="text_align_center" onClick={() => ed.command('justifyCenter')} active={s.align === 'center'} title="Centreren (Ctrl+E)" />
                  <Small icon="text_align_right" onClick={() => ed.command('justifyRight')} active={s.align === 'right'} title="Rechts uitlijnen (Ctrl+R)" />
                  <Small icon="text_align_justity" onClick={() => ed.command('justifyFull')} active={s.align === 'justify'} title="Uitvullen (Ctrl+J)" />
                  <Menu icon="text_linespacing" title="Regelafstand">
                    {(close) => (
                      <div className="ofc-popup-list">
                        {['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'].map((v) => (
                          <button key={v} type="button" className="ofc-popup-item" onClick={() => (ed.setLineHeight(v), close())}>
                            {v.replace('.', ',')}
                          </button>
                        ))}
                      </div>
                    )}
                  </Menu>
                </div>
              </div>
            </Group>
            <Group label="Stijlen" wide>
              <div className="ofc-styles">
                {STYLES.map((st) => (
                  <button key={st.key} type="button" className={s.style === st.key ? 'on' : undefined} onMouseDown={keep} onClick={() => ed.setStyle(st.key)} title={st.name}>
                    <span className={`ofc-style-sample ${st.key}`}>AaBbCc</span>
                    <small>{st.name}</small>
                  </button>
                ))}
              </div>
            </Group>
            <Group label="Bewerken">
              <div className="ofc-stack">
                <Small icon="find" label="Zoeken" onClick={() => ed.open('zoeken')} title="Zoeken (Ctrl+F)" />
                <Small icon="text_replace" label="Vervangen" onClick={() => ed.open('vervangen')} title="Vervangen (Ctrl+H)" />
                <Small icon="table_select_all" label="Selecteren" onClick={() => ed.command('selectAll')} title="Alles selecteren (Ctrl+A)" />
              </div>
            </Group>
          </>
        )}

        {tab === 'invoegen' && (
          <>
            <Group label="Pagina's">
              <Big icon="page_break" label="Pagina-einde" onClick={ed.insertPageBreak} title="De volgende tekst op een nieuwe pagina beginnen" />
            </Group>
            <Group label="Tabellen">
              <Menu big icon="table_insert" label="Tabel" title="Tabel invoegen">
                {(close) => <TableGrid onPick={(r, c) => (ed.insertTable(r, c), close())} />}
              </Menu>
            </Group>
            <Group label="Illustraties">
              <Big icon="picture" label="Afbeelding" onClick={() => fileInput.current?.click()} title="Een afbeelding van je computer" />
              <Big icon="photos" label="Mijn foto's" onClick={() => ed.open('fotos')} title="Een foto uit je Foto's op Kuddes" />
              <Big icon="emotion_happy" label="Smiley" onClick={() => ed.open('smiley')} title="Een Hyves-smiley" />
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) ed.insertImage(file)
                }}
              />
            </Group>
            <Group label="Koppelingen">
              <Big icon="link" label="Hyperlink" onClick={() => ed.open('link')} title="Hyperlink invoegen (Ctrl+K)" />
            </Group>
            <Group label="Tekst">
              <Big icon="text_dropcaps" label="WordArt" onClick={() => ed.open('wordart')} title="WordArt invoegen" />
              <div className="ofc-stack">
                <Small icon="text_horizontalrule" label="Horizontale lijn" onClick={() => ed.command('insertHorizontalRule')} />
                <Menu icon="date" label="Datum en tijd" title="Datum en tijd">
                  {(close) => (
                    <div className="ofc-popup-list">
                      {(
                        [
                          ['lang', new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
                          ['kort', new Date().toLocaleDateString('nl-NL')],
                          ['tijd', new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })],
                        ] as const
                      ).map(([format, sample]) => (
                        <button key={format} type="button" className="ofc-popup-item" onClick={() => (ed.insertDate(format), close())}>
                          {sample}
                        </button>
                      ))}
                    </div>
                  )}
                </Menu>
                <Menu icon="text_signature" label="Symbool" title="Symbool invoegen">
                  {(close) => (
                    <div className="ofc-symbols">
                      {SYMBOLS.map((c) => (
                        <button key={c} type="button" onClick={() => (ed.run(() => document.execCommand('insertText', false, c)), close())}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </Menu>
              </div>
            </Group>
          </>
        )}

        {tab === 'indeling' && (
          <>
            <Group label="Pagina-instelling">
              <Menu big icon="document_margins" label="Marges" title="Marges">
                {(close) => (
                  <div className="ofc-popup-list">
                    {(Object.keys(DOC_MARGINS) as DocSettings['margins'][]).map((m) => (
                      <button key={m} type="button" className={ed.settings.margins === m ? 'ofc-popup-item on' : 'ofc-popup-item'} onClick={() => (ed.setSettings({ margins: m }), close())}>
                        <b>{DOC_MARGINS[m]}</b>
                        <small>{m === 'normaal' ? 'Boven en opzij 2,5 cm' : m === 'smal' ? 'Rondom 1,27 cm' : 'Boven 2,54 cm, opzij 5,08 cm'}</small>
                      </button>
                    ))}
                  </div>
                )}
              </Menu>
              <Menu big icon="page_orientation" label="Afdrukstand" title="Afdrukstand">
                {(close) => (
                  <div className="ofc-popup-list">
                    {(['staand', 'liggend'] as const).map((o) => (
                      <button key={o} type="button" className={ed.settings.orientation === o ? 'ofc-popup-item on' : 'ofc-popup-item'} onClick={() => (ed.setSettings({ orientation: o }), close())}>
                        {o === 'staand' ? 'Staand' : 'Liggend'}
                      </button>
                    ))}
                  </div>
                )}
              </Menu>
              <Menu big icon="text_columns" label="Kolommen" title="Kolommen">
                {(close) => (
                  <div className="ofc-popup-list">
                    {([1, 2, 3] as const).map((n) => (
                      <button key={n} type="button" className={ed.settings.columns === n ? 'ofc-popup-item on' : 'ofc-popup-item'} onClick={() => (ed.setSettings({ columns: n }), close())}>
                        {n === 1 ? 'Eén' : n === 2 ? 'Twee' : 'Drie'}
                      </button>
                    ))}
                  </div>
                )}
              </Menu>
            </Group>
            <Group label="Pagina-achtergrond">
              <Menu big icon="page_paintbrush" label="Paginakleur" title="Paginakleur">
                {(close) => <ColorGrid none="Geen kleur (wit)" onPick={(c) => (ed.setSettings({ pageColor: c ?? '#ffffff' }), close())} />}
              </Menu>
            </Group>
          </>
        )}

        {tab === 'beeld' && (
          <>
            <Group label="Zoomen">
              <Big icon="zoom" label="100%" onClick={() => ed.setZoom(100)} title="Zoomen naar 100%" />
              <Big icon="page_size" label="Paginabreedte" onClick={ed.fitWidth} title="Zo breed als het venster" />
              <div className="ofc-stack">
                <Small icon="zoom_in" label="Inzoomen" onClick={() => ed.setZoom(Math.min(200, ed.zoom + 10))} />
                <Small icon="zoom_out" label="Uitzoomen" onClick={() => ed.setZoom(Math.max(30, ed.zoom - 10))} />
              </div>
            </Group>
            <Group label="Weergeven/verbergen">
              <label className="ofc-check">
                <input type="checkbox" checked={ed.ruler} onChange={(e) => ed.setRuler(e.target.checked)} /> Liniaal
              </label>
            </Group>
            <Group label="Kleurenschema">
              {(
                [
                  ['blauw', 'Blauw'],
                  ['zilver', 'Zilver'],
                  ['zwart', 'Zwart'],
                ] as const
              ).map(([key, name]) => (
                <button key={key} type="button" className={ed.scheme === key ? 'ofc-scheme on' : 'ofc-scheme'} onMouseDown={keep} onClick={() => ed.setScheme(key)}>
                  <span className={`ofc-scheme-swatch ${key}`} aria-hidden="true" />
                  {name}
                </button>
              ))}
            </Group>
            <Group label="Venster">
              <Big icon="slideshow_full_screen" label="Volledig scherm" onClick={ed.fullscreen} />
            </Group>
          </>
        )}
      </div>
    </div>
  )
}
