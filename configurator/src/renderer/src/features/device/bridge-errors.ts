import { t } from '@shared/ui-text'

const NO_HANDLER = 'No handler registered'
const MISSING_METHOD = /\bpitrig\.([A-Za-z_$][\w$]*) is not a function/
const MISSING_API = /Cannot read properties of undefined \(reading '[A-Za-z_$][\w$]*'\)/

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function looksLikeMissingBridge(message: string): boolean {
  if (message.includes(NO_HANDLER)) return true
  const api = window.pitrig as unknown as Record<string, unknown> | undefined
  if (!api) return MISSING_API.test(message) || MISSING_METHOD.test(message)
  const named = MISSING_METHOD.exec(message)?.[1]
  return named !== undefined && typeof api[named] !== 'function'
}

export function operationErrorMessage(error: unknown): string {
  const message = messageOf(error)
  if (looksLikeMissingBridge(message)) {
    return t('device.bridgeErrors.theConfigurationBridgeIsNot')
  }
  return message || t('device.bridgeErrors.theConfigurationOperationFailed')
}

export function bridgeErrorMessage(
  error: unknown,
  fallback = t('device.bridgeErrors.theConfigurationFileOperationFailed')
): string {
  const message = messageOf(error)
  if (looksLikeMissingBridge(message)) {
    return t('device.bridgeErrors.theElectronBridgeIsOutdated')
  }
  return message || fallback
}
