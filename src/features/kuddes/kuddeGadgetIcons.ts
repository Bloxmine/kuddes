import { KUDDE_GADGET_TYPES, type KuddeGadgetType } from '../../../shared/kuddeGadgets'
import type { FarmIconName } from '../../components/ui/farmIcons'

export const KUDDE_GADGET_ICONS: Record<KuddeGadgetType, FarmIconName> = {
  teller: 'chart_bar',
  leden: 'chart_pie',
  nieuwkomers: 'group_add',
  online: 'status_online',
  actief: 'medal_gold_1',
  agenda: 'calendar',
  mededeling: 'note_pin',
  regels: 'text_list_numbers',
  aftellen: 'hourglass',
}

export const KUDDE_GADGET_KINDS = Object.keys(KUDDE_GADGET_ICONS) as KuddeGadgetType[]

/** Lower case, without accents: "geüploade" is found with "geupload". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function findKuddeGadgets(query: string): KuddeGadgetType[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return KUDDE_GADGET_KINDS.filter((t) => words.every((w) => fold(`${KUDDE_GADGET_TYPES[t].name} ${KUDDE_GADGET_TYPES[t].description} kudde ${t}`).includes(w)))
}
