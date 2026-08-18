import { MAXIMUM_PAYLOAD_SIZE, type ApplicationConfiguration } from './configuration-schema'
import { findFontError } from './validate/fonts'
import { findUnknownProperty } from './validate/schema-keys'
import { findScreenError } from './validate/structure'

// The single configuration validator. The renderer, the main process, and file
// import all use this instead of keeping their own partial copies, and the key
// allow-lists come from the same generated schema the firmware parser uses — so
// the configurator can no longer ship a payload the device answers with
// unknown_property.
//
// It runs four passes, each in its own file: the board and hardware gate here,
// then unknown keys, then structure and limits, then fonts.

export interface ValidateOptions {
  /** Board identifiers this build supports; a document targeting another is rejected. */
  supportedBoards: readonly string[]
}

export type ValidationResult =
  | { ok: true; configuration: ApplicationConfiguration; payloadBytes: number }
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

  const fontError = findFontError(configuration)
  if (fontError) return { ok: false, error: fontError }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(configuration)).byteLength
  if (payloadBytes > MAXIMUM_PAYLOAD_SIZE) {
    return {
      ok: false,
      error: `Configuration exceeds the ${MAXIMUM_PAYLOAD_SIZE}-byte device limit.`
    }
  }
  return { ok: true, configuration, payloadBytes }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
