import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ApplicationConfiguration
} from './configuration-schema'
import {
  CONFIGURATION_DOCUMENT_LABELS,
  documentPayloadBytes
} from './configuration-documents'
import { findFontError } from './validate/fonts'
import { findRangeError } from './validate/ranges'
import { findUnknownProperty } from './validate/schema-keys'
import { findScreenError } from './validate/structure'

// The single configuration validator. The renderer, the main process, and file
// import all use this instead of keeping their own partial copies, and the key
// allow-lists come from the same generated schema the firmware parser uses — so
// the configurator can no longer ship a payload the device answers with
// unknown_property.
//
// It runs five passes, each in its own file: the board and hardware gate here,
// then unknown keys, then structure and limits, then scalar ranges, then fonts.
// The range pass reads the same bounds the firmware validator generates from
// configuration/configuration_schema.json, so a value this accepts is not
// refused by the device for being out of range.

export interface ValidateOptions {
  /** Board identifiers this build supports; a document targeting another is rejected. */
  supportedBoards: readonly string[]
}

export type ValidationResult =
  | { ok: true; configuration: ApplicationConfiguration }
  | { ok: false; error: string }

export function validateConfigurationDocument(
  value: unknown,
  options: ValidateOptions
): ValidationResult {
  if (!isObject(value)) {
    return { ok: false, error: 'Configuration must be a JSON object.' }
  }
  const configuration = value as unknown as ApplicationConfiguration
  if (
    typeof configuration.board !== 'string' ||
    !options.supportedBoards.includes(configuration.board)
  ) {
    return { ok: false, error: 'Configuration must target a supported board.' }
  }
  if (
    configuration.hardware !== undefined &&
    (!Array.isArray(configuration.hardware) || configuration.hardware.length !== 0)
  ) {
    return { ok: false, error: 'The hardware list must be an empty array.' }
  }

  const unknown = findUnknownProperty(value, 'ApplicationConfiguration', '')
  if (unknown) return { ok: false, error: unknown }

  const screenError = findScreenError(configuration)
  if (screenError) return { ok: false, error: screenError }

  const rangeError = findRangeError(configuration)
  if (rangeError) return { ok: false, error: rangeError }

  const fontError = findFontError(configuration)
  if (fontError) return { ok: false, error: fontError }

  // Per document, because that is how the bytes travel: the dashboard has the
  // whole 64 KB and the other two a kilobyte each. Measuring the aggregate
  // would refuse a dashboard that is exactly at its bound for the sake of a
  // transport section the device counts separately.
  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    const limit = CONFIGURATION_DOCUMENTS[document].maxPayload
    if (documentPayloadBytes(configuration, document) > limit) {
      return {
        ok: false,
        error:
          `The ${CONFIGURATION_DOCUMENT_LABELS[document].toLowerCase()} configuration exceeds ` +
          `the ${limit}-byte device limit.`
      }
    }
  }
  return { ok: true, configuration }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
