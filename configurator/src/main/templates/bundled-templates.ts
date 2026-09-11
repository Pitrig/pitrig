import { BUNDLED_TEMPLATE_PREFIX } from '../../shared/templates'
import lilygoLap from './bundled/lilygo-lap.json'
import raceDdu from './bundled/race-ddu.json'
import retroCluster from './bundled/retro-cluster.json'
import roundDial480 from './bundled/round-dial-480.json'

export interface BundledTemplateSource {
  id: string
  source: unknown
}

export const BUNDLED_TEMPLATE_SOURCES: readonly BundledTemplateSource[] = [
  { id: `${BUNDLED_TEMPLATE_PREFIX}lilygo-lap`, source: lilygoLap },
  { id: `${BUNDLED_TEMPLATE_PREFIX}round-dial-480`, source: roundDial480 },
  { id: `${BUNDLED_TEMPLATE_PREFIX}race-ddu`, source: raceDdu },
  { id: `${BUNDLED_TEMPLATE_PREFIX}retro-cluster`, source: retroCluster }
]
