const BRIDGE_MISSING = [
  'not a function',
  'No handler registered',
  'saveDeviceConfiguration',
  'exportSimHubProfile'
]

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function looksLikeMissingBridge(message: string): boolean {
  return BRIDGE_MISSING.some((marker) => message.includes(marker))
}

export function operationErrorMessage(error: unknown): string {
  const message = messageOf(error)
  if (looksLikeMissingBridge(message)) {
    return 'The configuration bridge is not loaded. Fully restart SimCore Configurator and reconnect the board.'
  }
  return message || 'The configuration operation failed.'
}

export function bridgeErrorMessage(
  error: unknown,
  fallback = 'The configuration file operation failed.'
): string {
  const message = messageOf(error)
  if (looksLikeMissingBridge(message)) {
    return 'The Electron bridge is outdated. Fully restart SimCore Configurator.'
  }
  return message || fallback
}
