import { BUNDLED_TEMPLATE_PREFIX, type TemplateCredit } from '../../shared/templates'
import endurance from './bundled/endurance.json'
import gfRallyMode from './bundled/gf-rally-mode.pitrigdash?asset'
import lilygoLap from './bundled/lilygo-lap.json'
import retroCluster from './bundled/retro-cluster.json'
import roundDial480 from './bundled/round-dial-480.json'

interface BundledEntry {
  id: string
  credit?: TemplateCredit
}

export type BundledTemplateSource = BundledEntry & ({ source: unknown } | { file: string })

export const BUNDLED_TEMPLATE_SOURCES: readonly BundledTemplateSource[] = [
  { id: `${BUNDLED_TEMPLATE_PREFIX}lilygo-lap`, source: lilygoLap },
  { id: `${BUNDLED_TEMPLATE_PREFIX}round-dial-480`, source: roundDial480 },
  { id: `${BUNDLED_TEMPLATE_PREFIX}retro-cluster`, source: retroCluster },
  { id: `${BUNDLED_TEMPLATE_PREFIX}endurance`, source: endurance },
  {
    id: `${BUNDLED_TEMPLATE_PREFIX}gf-rally-mode`,
    file: gfRallyMode,
    credit: { name: 'GEAR FACTORY', url: 'https://www.youtube.com/@GEAR-FACTORY' }
  }
]
