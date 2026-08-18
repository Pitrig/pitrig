/**
 * Turning a thrown IPC failure into something an author can act on.
 *
 * A bridge that is missing or outdated fails as a plain TypeError from
 * ipcRenderer, whose message names an internal channel. That is worth
 * translating once: the answer is always the same — restart the app — and it
 * was being recognised by three different string tests in two panels.
 */

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

/** For a device operation, where the bridge and the board are both suspects. */
export function operationErrorMessage(error: unknown): string {
  const message = messageOf(error)
  if (looksLikeMissingBridge(message)) {
    return 'The configuration bridge is not loaded. Fully restart SimCore Configurator and reconnect the board.'
  }
  return message || 'The configuration operation failed.'
}

/** For anything that only crosses the bridge, such as a file or an export. */
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
