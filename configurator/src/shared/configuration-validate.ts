import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ApplicationConfiguration
} from './configuration-schema'
import { documentPayloadBytes } from './configuration-documents'
import { t } from './ui-text'
import { findFontError } from './validate/fonts'
import { findHardwareError } from './validate/hardware'
import { findRangeError } from './validate/ranges'
import { findUnknownProperty } from './validate/schema-keys'
import { findScreenError } from './validate/structure'
import { findTransportError } from './validate/transport'

export interface ValidateOptions {
  supportedBoards: readonly string[]
}

export type ValidationResult =
  | { ok: true; configuration: ApplicationConfiguration }
  | { ok: false; error: string }

export function validateConfigurationDocument(
  value: unknown,
  options: ValidateOptions
): ValidationResult {
  try {
    return validate(value, options)
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    return { ok: false, error: t('validation.configuration.theConfigurationCouldNotBe', { detail }) }
  }
}

function validate(value: unknown, options: ValidateOptions): ValidationResult {
  if (!isObject(value)) {
    return { ok: false, error: t('validation.configuration.configurationMustBeAJson') }
  }
  const configuration = value as unknown as ApplicationConfiguration
  if (
    typeof configuration.board !== 'string' ||
    !options.supportedBoards.includes(configuration.board)
  ) {
    return { ok: false, error: t('validation.configuration.configurationMustTargetASupported') }
  }
  const unknown = findUnknownProperty(value, 'ApplicationConfiguration', '')
  if (unknown) return { ok: false, error: unknown }

  const hardwareError = findHardwareError(configuration)
  if (hardwareError) return { ok: false, error: hardwareError }

  const screenError = findScreenError(configuration)
  if (screenError) return { ok: false, error: screenError }

  const rangeError = findRangeError(configuration)
  if (rangeError) return { ok: false, error: rangeError }

  const transportError = findTransportError(configuration)
  if (transportError) return { ok: false, error: transportError }

  const fontError = findFontError(configuration)
  if (fontError) return { ok: false, error: fontError }

  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    const limit = CONFIGURATION_DOCUMENTS[document].maxPayload
    if (documentPayloadBytes(configuration, document) > limit) {
      return {
        ok: false,
        error:
          `The ${t(`documents.labelLower.${document}`)} configuration exceeds ` +
          `the ${limit}-byte device limit.`
      }
    }
  }
  return { ok: true, configuration }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
