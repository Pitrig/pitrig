import { BUNDLED_TEMPLATE_PREFIX } from '../../shared/templates'
import enduranceDdu from './bundled/endurance-ddu.json'
import flagStrip from './bundled/flag-strip.json'
import fuelCard from './bundled/fuel-card.json'
import gtGeneric from './bundled/gt-generic.json'
import guitionRace from './bundled/guition-race.json'
import guitionReference from './bundled/guition-reference.json'
import guitionScreensAndSlots from './bundled/guition-screens-and-slots.json'
import inputCoach from './bundled/input-coach.json'
import lilygoLap from './bundled/lilygo-lap.json'
import lsrDdu from './bundled/lsr-ddu.json'
import nightClean from './bundled/night-clean.json'
import pitStrategy from './bundled/pit-strategy.json'
import rallyeStage from './bundled/rallye-stage.json'
import retroCluster from './bundled/retro-cluster.json'
import roundDial480 from './bundled/round-dial-480.json'
import roundScreen480 from './bundled/round-screen-480.json'
import roundTwinDial from './bundled/round-twin-dial.json'
import standings from './bundled/standings.json'
import tyreCorners480 from './bundled/tyre-corners-480.json'

export interface BundledTemplateSource {
  id: string
  source: unknown
}

export const BUNDLED_TEMPLATE_SOURCES: readonly BundledTemplateSource[] = [
  { id: `${BUNDLED_TEMPLATE_PREFIX}lilygo-lap`, source: lilygoLap },
  { id: `${BUNDLED_TEMPLATE_PREFIX}rallye-stage`, source: rallyeStage },
  { id: `${BUNDLED_TEMPLATE_PREFIX}flag-strip`, source: flagStrip },
  { id: `${BUNDLED_TEMPLATE_PREFIX}fuel-card`, source: fuelCard },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-reference`, source: guitionReference },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-screens-and-slots`, source: guitionScreensAndSlots },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-race`, source: guitionRace },
  { id: `${BUNDLED_TEMPLATE_PREFIX}round-dial-480`, source: roundDial480 },
  { id: `${BUNDLED_TEMPLATE_PREFIX}round-screen-480`, source: roundScreen480 },
  { id: `${BUNDLED_TEMPLATE_PREFIX}tyre-corners-480`, source: tyreCorners480 },
  { id: `${BUNDLED_TEMPLATE_PREFIX}lsr-ddu`, source: lsrDdu },
  { id: `${BUNDLED_TEMPLATE_PREFIX}endurance-ddu`, source: enduranceDdu },
  { id: `${BUNDLED_TEMPLATE_PREFIX}gt-generic`, source: gtGeneric },
  { id: `${BUNDLED_TEMPLATE_PREFIX}round-twin-dial`, source: roundTwinDial },
  { id: `${BUNDLED_TEMPLATE_PREFIX}retro-cluster`, source: retroCluster },
  { id: `${BUNDLED_TEMPLATE_PREFIX}night-clean`, source: nightClean },
  { id: `${BUNDLED_TEMPLATE_PREFIX}standings`, source: standings },
  { id: `${BUNDLED_TEMPLATE_PREFIX}pit-strategy`, source: pitStrategy },
  { id: `${BUNDLED_TEMPLATE_PREFIX}input-coach`, source: inputCoach }
]
