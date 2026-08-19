import { BUNDLED_TEMPLATE_PREFIX } from '../../shared/templates'
import guitionRace from './bundled/guition-race.json'
import guitionReference from './bundled/guition-reference.json'
import guitionScreensAndSlots from './bundled/guition-screens-and-slots.json'
import lilygoLap from './bundled/lilygo-lap.json'

// The starters a fresh installation begins with. They are imported rather than
// read from disk because the application has no packaging step to copy files
// through — electron-vite builds the main process as a library and Vite's JSON
// plugin inlines these, which works the same in `dev` and in `build`.
//
// Typed as `unknown` on purpose: a starter goes through the same parse a user's
// own file does, so one that drifts from the configuration contract fails
// visibly here instead of shipping.

export interface BundledTemplateSource {
  id: string
  source: unknown
}

/** Listed in the order the library shows them: smallest board first. */
export const BUNDLED_TEMPLATE_SOURCES: readonly BundledTemplateSource[] = [
  { id: `${BUNDLED_TEMPLATE_PREFIX}lilygo-lap`, source: lilygoLap },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-reference`, source: guitionReference },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-screens-and-slots`, source: guitionScreensAndSlots },
  { id: `${BUNDLED_TEMPLATE_PREFIX}guition-race`, source: guitionRace }
]
