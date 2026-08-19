import { type WidgetConfiguration } from '@shared/configuration-schema'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import { BOARD_PROFILES, type DeviceConfiguration } from '@shared/device'
import { absolutePlacement, mutateDraftConfiguration, selectedWidget } from './document'
import { type WidgetSelection } from './store'
import { insertWidget, offsetWidget } from './widgets'
import { useDeviceStore } from '@/features/device/device-store'

// A widget copied out of one project has to be pasteable into another, so the
// clipboard carries the widget as JSON text rather than a live object. The
// in-memory copy is the fallback for the packaged app, where reading the system
// clipboard is not guaranteed.
let internalClipboard: WidgetConfiguration | undefined

export async function copyWidget(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): Promise<boolean> {
  const widget = selectedWidget(configuration, selection)
  if (!widget || selection?.type !== 'widget') return false
  // The clipboard carries the widget as it would sit on a screen: a paste has
  // no way to know which group the copy came from, so a relative box would be
  // read against the display.
  const box = absolutePlacement(configuration, selection.id)
  const lifted = box ? { ...widget, placement: box } : widget
  internalClipboard = structuredClone(lifted)
  try {
    await navigator.clipboard.writeText(JSON.stringify(lifted, null, 2))
  } catch {
    // A denied or unavailable system clipboard still leaves the in-app copy.
  }
  return true
}

export async function pasteWidget(
  display: { width: number; height: number }
): Promise<WidgetSelection | undefined> {
  const widget = (await clipboardWidget()) ?? internalClipboard
  if (!widget) return undefined
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, offsetWidget(widget, display))
  })
  return added
}

async function clipboardWidget(): Promise<WidgetConfiguration | undefined> {
  try {
    const text = await navigator.clipboard.readText()
    const value: unknown = JSON.parse(text)
    return isPasteableWidget(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * A pasted fragment is untrusted text, so it goes through the same validator
 * the device payload does — wrapped in the smallest document that can carry it.
 * That checks the discriminator and every property against the generated
 * allow-list, so a fragment from an older schema is rejected here rather than
 * by the board.
 */
function isPasteableWidget(value: unknown): value is WidgetConfiguration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const board = useDeviceStore.getState().draft?.board
  if (!board) return false
  const probe = {
    board,
    dashboard: { screens: [{ widgets: [value] }] }
  }
  return validateConfigurationDocument(probe, {
    supportedBoards: Object.keys(BOARD_PROFILES)
  }).ok
}
