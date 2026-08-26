import { BUNDLED_TEMPLATE_PREFIX } from '../../shared/templates'
import guitionRace from './bundled/guition-race.json'
import guitionReference from './bundled/guition-reference.json'
import guitionScreensAndSlots from './bundled/guition-screens-and-slots.json'
import lilygoLap from './bundled/lilygo-lap.json'

export interface BundledTemplateSource {
  id: string
  source: unknown
}

export const BUNDLED_TEMPLATE_SOURCES: readonly BundledTemplateSource[] = [
  { id: `${BUNDLED_TEMPLATE_PREFIX}lilygo-lap`, source: lilygoLap },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-reference`, source: guitionReference },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-screens-and-slots`, source: guitionScreensAndSlots },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-race`, source: guitionRace }
]
