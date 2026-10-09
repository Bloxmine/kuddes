import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import type { KuddeDetail } from '../../../shared/api'
import { patternCss, type ProfileColors } from '../../../shared/customization'
import { PROFILE_PRESETS, designSkin, skinVars } from '../../../shared/skins'
import { BackgroundEffect } from '../../components/effects/BackgroundEffect'
import { useSiteDark } from '../../lib/useSiteDark'
import { Box } from '../../components/ui/Box'
import { api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { seededGradient } from '../../lib/placeholder'
import { DesignStudio } from '../account/DesignStudio'
import '../../pages/AccountPages.css'

/** Whether the Kudde's design is this ready-made one (the server may add fields of its own). */
function isPreset(design: ProfileColors | null, preset: ProfileColors) {
  const same = (a: unknown, b: unknown): boolean =>
    a !== null && typeof a === 'object' && b !== null && typeof b === 'object' ? Object.entries(a).every(([k, v]) => same(v, (b as Record<string, unknown>)[k])) : a === b
  return !!design && same(preset, design)
}

function KuddePreview({ colors, kudde }: { colors: ProfileColors; kudde: KuddeDetail }) {
  // What this viewer will see: dark on a dark site theme
  const skin = designSkin(colors, useSiteDark())
  return (
    <div className="profile-preview-frame">
      <div className="profile-preview kudde-page skinned" style={{ ...(skinVars(skin) as CSSProperties), background: skin.background }} aria-hidden="true">
        {colors.effect && <BackgroundEffect effect={colors.effect} />}
        <div className="kudde-hero box">
          <div className="kudde-hero-img" style={kudde.imageUrl ? { backgroundImage: `url(${kudde.imageUrl})` } : { background: seededGradient(kudde.name) }} />
          <div className="kudde-hero-info">
            <h1>{kudde.name}</h1>
            <p className="muted">{kudde.memberCount} leden</p>
          </div>
        </div>
        <div className="profile-preview-boxes">
          <div className="box">
            <header className="box-hdr">
              <h2 className="box-title">Over deze Kudde</h2>
            </header>
            <div className="box-con">
              Welkom bij onze Kudde! <a href="#design">Bekijk de agenda</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** "Pimp deze Kudde": the owner's designs (shared with their profile), one of them in use here. */
export function KuddeDesignEditor({ kudde, onDone }: { kudde: KuddeDetail; onDone: () => void }) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (design: ProfileColors | null) => api<{ design: ProfileColors | null }>(`/kuddes/${kudde.slug}/design`, { method: 'PUT', body: { design } }),
    onSuccess: ({ design }) => queryClient.setQueryData<KuddeDetail>(keys.kudde(kudde.slug), (k) => (k ? { ...k, design } : k)),
  })
  return (
    <Box title="Pimp deze Kudde" icon="palette" actions={<button type="button" className="link-button" onClick={onDone}>Sluiten</button>}>
      <p className="settings-intro">Geef je Kudde een eigen look: een achtergrond met patroon, gekleurde boxen en een titelblok met een eigen lettertype. Alleen jij als beheerder kunt dit aanpassen.</p>
      {/* The ready-made designs, as on your profile */}
      <div className="skin-picker">
        <button type="button" className="skin-option" aria-pressed={!kudde.design} disabled={save.isPending} onClick={() => save.mutate(null)}>
          <span className="skin-swatch skin-swatch-standard" />
          Standaard
        </button>
        {Object.entries(PROFILE_PRESETS).map(([key, p]) => (
          <button key={key} type="button" className="skin-option" aria-pressed={isPreset(kudde.design, p.colors)} disabled={save.isPending} onClick={() => save.mutate(p.colors)}>
            <span className="skin-swatch" style={{ background: patternCss(p.colors.pattern, p.colors.background, p.colors.background2, 0.4) }} />
            {p.name}
          </button>
        ))}
      </div>
      <DesignStudio
        subject="kudde"
        target={`kudde-${kudde.slug}`}
        applied={kudde.design}
        apply={(design) => save.mutateAsync(design)}
        reset={() => save.mutateAsync(null)}
        preview={(colors) => <KuddePreview colors={colors} kudde={kudde} />}
      />
      {save.isError && <p className="form-error">{errorMessage(save.error)}</p>}
    </Box>
  )
}
