import { VALIDATION_ERROR_TOKENS, type ValidationErrorToken } from './configuration-schema'

const VALIDATION_MESSAGES: Record<ValidationErrorToken, string> = {
  none: 'The device reported no error.',
  malformed:
    'The device could not read the configuration. It is either not valid JSON or larger than the device accepts.',
  unsupported_schema:
    'This configuration uses a schema version the device firmware does not accept. Update the firmware or the configurator so the two agree.',
  invalid_board: 'The configuration does not name a board the device recognises.',
  board_mismatch:
    'This configuration was authored for a different board than the connected device.',
  invalid_hardware:
    'The hardware section is malformed, declares more peripherals than the board drives, or names a peripheral this firmware has no driver for.',
  invalid_led_pin:
    'An LED output names a pin this board does not offer, or two outputs are wired to the same one.',
  invalid_led_sprite:
    'An LED sprite\u2019s geometry, palette and pixels do not agree, or an effect draws a sprite the output does not carry.',
  invalid_transport: 'This board does not support the selected telemetry transport.',
  invalid_uart: 'The UART pins or baud rate are not valid for this board.',
  invalid_module:
    'An LED segment or effect is out of range, names a segment its chain does not have, or carries a property its kind has none of.',
  invalid_screen: 'A screen is malformed, or the configuration has more screens than the device allows.',
  invalid_dashboard: 'The dashboard is malformed, or it uses a module that is not enabled.',
  invalid_widget:
    'A widget property is malformed, out of range, sits entirely off the display, or is nested too deeply.',
  invalid_slot:
    'A slot carries an appearance it has none of, was authored inside a container instead of on a screen, or holds no page the tap can reach.',
  invalid_slot_page:
    'A slot page is malformed, or its trigger disagrees with the telemetry, rules and duration it carries.',
  unknown_property: 'The configuration contains a property this firmware version does not know.',
  duplicate_property: 'The same property appears twice within one object.'
}

const DEPENDENCY_MESSAGES: Record<string, string> = {
  font: 'The dashboard uses a font family that is not installed on the device. Upload a font package containing it, or choose a family the device already has. Remember that widget captions carry their own font.',
  image:
    'The dashboard uses an image that is not installed on the device. Upload it, or choose one the device already has.'
}

const REQUEST_MESSAGES: Record<string, string> = {
  storage: 'The device could not write to its configuration storage.',
  unsupported: 'The device cannot carry out this request in its current state.',
  unknown_command: 'The device did not recognise the request.',
  busy: 'The device is still starting up and has nothing to apply this to yet.'
}

const UPLOAD_MESSAGES: Record<string, string> = {
  busy:
    'The device connection is busy — either another upload is using it, or the board is still ' +
    'finishing its startup and has not let go of the storage this would overwrite. Wait a moment ' +
    'and try again.',
  timeout: 'The upload timed out.',
  frame_crc: 'An upload frame failed its checksum. The connection may be unreliable.',
  sequence: 'An upload frame arrived out of order.',
  protocol_overrun: 'The device received upload data faster than it could take it.',
  invalid_frame: 'An upload frame was malformed.',
  incomplete_package: 'The upload was committed before the whole package had arrived.',
  invalid_size: 'The package does not fit the space the device reserves for it.',
  invalid_package: 'The package contents are not valid.',
  invalid_state: 'The device is not ready for this step of the upload.',
  reboot_required: 'The device must be restarted before this can be done.',
  storage_failure: 'The device could not write to its asset storage.',
  unavailable: 'Asset storage is unavailable on this device.',
  unknown: 'The device reported a failure it could not describe.',
  unknown_command: 'The device did not recognise the upload command.'
}

const UPLOAD_TAGS: Record<string, string> = {
  FONT: 'font package',
  IMAGE: 'image',
  FW: 'firmware image'
}

const isValidationToken = (value: string): value is ValidationErrorToken =>
  (VALIDATION_ERROR_TOKENS as readonly string[]).includes(value)

const parseDetail = (
  detail: string
): { screen?: number; widget?: number; path?: string } => {
  const result: { screen?: number; widget?: number; path?: string } = {}
  for (const part of detail.split(',')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key === 'path') {
      if (value) result.path = value
      continue
    }
    if (key !== 'screen' && key !== 'widget') continue
    const index = Number.parseInt(value, 10)
    if (Number.isInteger(index) && index >= 0) result[key] = index
  }
  return result
}

const describeLocation = (screen?: number, widget?: number): string => {
  const parts: string[] = []
  if (screen !== undefined) parts.push(`screen ${screen + 1}`)
  if (widget !== undefined) parts.push(`widget ${widget + 1}`)
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

export const describeDeviceError = (payload: string): string => {
  const text = payload.trim()
  if (!text) return 'The device rejected the request without giving a reason.'

  const separator = text.indexOf(':')
  const head = separator < 0 ? text : text.slice(0, separator)
  const rest = separator < 0 ? '' : text.slice(separator + 1)

  const uploadKind = UPLOAD_TAGS[head]
  if (uploadKind) {
    const word = rest.trim()
    const message = UPLOAD_MESSAGES[word]
    return message
      ? `Uploading the ${uploadKind} failed. ${message}`
      : `Uploading the ${uploadKind} failed: ${word || 'no reason given'}.`
  }

  if (isValidationToken(head)) {
    const { screen, widget, path } = parseDetail(rest)
    const dependency = head === 'invalid_widget' && path ? DEPENDENCY_MESSAGES[path] : undefined
    if (dependency) return dependency
    const location = describeLocation(screen, widget)
    const property = path ? ` Property: ${path}.` : ''
    return `${VALIDATION_MESSAGES[head]}${location}${property}`
  }

  return REQUEST_MESSAGES[head] ?? `The device rejected the request: ${text}`
}
