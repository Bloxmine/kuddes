import type { KuddeDetail } from '../../../shared/api'
import type { KuddeRight } from '../../../shared/kuddes'

/** Whether the viewer may do this in running the Kudde (owners may do everything). */
export const can = (kudde: KuddeDetail, right: KuddeRight) => kudde.rights.includes(right)
