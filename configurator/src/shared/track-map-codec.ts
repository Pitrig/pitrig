export const TRACK_MAP_OUTLINE_BINDING = 'track.map.outline'
export const TRACK_MAP_CAR_BINDINGS = [
  'track.map.cars_1',
  'track.map.cars_2',
  'track.map.cars_3',
  'track.map.cars_4'
] as const
export const TRACK_MAP_BINDINGS: readonly string[] = [
  TRACK_MAP_OUTLINE_BINDING,
  ...TRACK_MAP_CAR_BINDINGS
]

export const LAP_UNITS = 4096
export const GRID_SIZE = 4096

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const DIGIT_VALUES = new Map([...DIGITS].map((digit, value) => [digit, value]))
const OUTLINE_VERSION = 1
const MAXIMUM_TRACK_POINTS = 1023
const MAXIMUM_PIT_POINTS = 255
const MAXIMUM_SECTOR_STARTS = 15
const MAXIMUM_PIECES = 63
const PIECE_DIGITS = 59
const CHECK_MODULUS = 4096
const PIECE_HEADER_DIGITS = 4
const CHECK_DIGITS = 2
const CAR_DIGITS = 3
const CAR_FRACTION_UNITS = 2048
const CLASS_BITS = 3
const CLASS_MASK = 7
const MAXIMUM_CLASS = 4
const MINIMUM_TRACK_POINTS = 3
const MINIMUM_PIT_POINTS = 2

export const TRACK_MAP_ROLES = {
  player: 1,
  car: 2,
  ahead: 3,
  behind: 4,
  lapping: 5,
  lapped: 6
} as const

export type TrackPoint = readonly [number, number]

export interface TrackPitLane {
  from: number
  to: number
  points: readonly TrackPoint[]
}

export interface TrackOutline {
  id: string
  points: readonly TrackPoint[]
  pit: TrackPitLane | undefined
  finish: number
  sectors: readonly number[]
}

export interface TrackMapCar {
  fraction: number
  pit: boolean
  role: number
  cls: number
}

export interface OutlinePiece {
  index: number
  count: number
  id: string
  payload: string
}

function digitValue(text: string, position: number): number {
  return DIGIT_VALUES.get(text.charAt(position)) ?? -1
}

function signedStep(digit: number): number {
  return digit >= DIGITS.length / 2 ? digit - DIGITS.length : digit
}

class DigitReader {
  private position = 0
  private readonly text: string

  constructor(text: string) {
    this.text = text
  }

  one(): number {
    if (this.position >= this.text.length) return -1
    return digitValue(this.text, this.position++)
  }

  two(): number {
    const high = this.one()
    const low = this.one()
    return high < 0 || low < 0 ? -1 : (high << 6) | low
  }

  finished(): boolean {
    return this.position === this.text.length
  }
}

function checkDigitsMatch(body: string): boolean {
  if (body.length < CHECK_DIGITS) return false
  let sum = 0
  for (let position = 0; position + CHECK_DIGITS < body.length; position += 1) {
    const digit = digitValue(body, position)
    if (digit < 0) return false
    sum = (sum + digit) % CHECK_MODULUS
  }
  return new DigitReader(body.slice(body.length - CHECK_DIGITS)).two() === sum
}

function readLine(reader: DigitReader, count: number): TrackPoint[] | undefined {
  if (count === 0) return []
  let x = reader.two()
  let y = reader.two()
  if (x < 0 || y < 0) return undefined
  const points: TrackPoint[] = [[x, y]]
  for (let index = 1; index < count; index += 1) {
    const stepX = reader.one()
    const stepY = reader.one()
    if (stepX < 0 || stepY < 0) return undefined
    x += signedStep(stepX)
    y += signedStep(stepY)
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return undefined
    points.push([x, y])
  }
  return points
}

function countFits(count: number, minimum: number, maximum: number): boolean {
  return count === 0 || (count >= minimum && count <= maximum)
}

interface OutlineHeader {
  trackCount: number
  pitCount: number
  pitFrom: number
  pitTo: number
  finish: number
  sectorCount: number
}

function readHeader(reader: DigitReader): OutlineHeader | undefined {
  const version = reader.one()
  const header = {
    trackCount: reader.two(),
    pitCount: reader.two(),
    pitFrom: reader.two(),
    pitTo: reader.two(),
    finish: reader.two(),
    sectorCount: reader.one()
  }
  if (version !== OUTLINE_VERSION || Object.values(header).some((value) => value < 0)) {
    return undefined
  }
  const fits =
    countFits(header.trackCount, MINIMUM_TRACK_POINTS, MAXIMUM_TRACK_POINTS) &&
    countFits(header.pitCount, MINIMUM_PIT_POINTS, MAXIMUM_PIT_POINTS) &&
    header.sectorCount <= MAXIMUM_SECTOR_STARTS
  return fits ? header : undefined
}

export function decodeOutlineBody(id: string, body: string): TrackOutline | undefined {
  if (!checkDigitsMatch(body)) return undefined
  const reader = new DigitReader(body.slice(0, body.length - CHECK_DIGITS))
  const header = readHeader(reader)
  if (!header) return undefined
  const sectors: number[] = []
  for (let index = 0; index < header.sectorCount; index += 1) {
    const start = reader.two()
    if (start < 0) return undefined
    sectors.push(start / LAP_UNITS)
  }
  const points = readLine(reader, header.trackCount)
  const pit = readLine(reader, header.pitCount)
  if (!points || !pit || !reader.finished()) return undefined
  const drawn = points.length > 0
  const lane = { from: header.pitFrom / LAP_UNITS, to: header.pitTo / LAP_UNITS, points: pit }
  return {
    id,
    points,
    pit: drawn && pit.length > 0 ? lane : undefined,
    finish: header.finish / LAP_UNITS,
    sectors: drawn ? sectors : []
  }
}

export function parseOutlinePiece(text: string): OutlinePiece | undefined {
  if (text.length <= PIECE_HEADER_DIGITS) return undefined
  const index = digitValue(text, 0)
  const count = digitValue(text, 1)
  if (index < 0 || count < 1 || index >= count || count > MAXIMUM_PIECES) return undefined
  if (digitValue(text, 2) < 0 || digitValue(text, 3) < 0) return undefined
  const payload = text.slice(PIECE_HEADER_DIGITS)
  const last = index === count - 1
  if (payload.length > PIECE_DIGITS || (!last && payload.length !== PIECE_DIGITS)) return undefined
  return { index, count, id: text.slice(2, PIECE_HEADER_DIGITS), payload }
}

export class OutlineAssembler {
  private id = ''
  private count = 0
  private pieces: (string | undefined)[] = []
  private held = 0
  private published: TrackOutline | undefined

  feed(text: string): void {
    const piece = parseOutlinePiece(text)
    if (!piece) return
    if (piece.id !== this.id || piece.count !== this.count) {
      this.id = piece.id
      this.count = piece.count
      this.pieces = new Array<string | undefined>(piece.count).fill(undefined)
      this.held = 0
    }
    if (this.pieces[piece.index] !== undefined) return
    this.pieces[piece.index] = piece.payload
    this.held += 1
    if (this.held < this.count) return
    const outline = decodeOutlineBody(this.id, this.pieces.join(''))
    if (!outline) {
      this.pieces.fill(undefined)
      this.held = 0
      return
    }
    this.published = outline.points.length > 0 ? outline : undefined
  }

  outline(): TrackOutline | undefined {
    return this.published
  }

  reset(): void {
    this.id = ''
    this.count = 0
    this.pieces = []
    this.held = 0
    this.published = undefined
  }
}

export function decodeCars(text: string): TrackMapCar[] {
  const cars: TrackMapCar[] = []
  for (let offset = 0; offset + CAR_DIGITS <= text.length; offset += CAR_DIGITS) {
    const high = digitValue(text, offset)
    const low = digitValue(text, offset + 1)
    const kind = digitValue(text, offset + 2)
    if (high < 0 || low < 0 || kind < 0) continue
    const role = kind >> CLASS_BITS
    if (role < TRACK_MAP_ROLES.player || role > TRACK_MAP_ROLES.lapped) continue
    const packed = (high << 6) | low
    cars.push({
      fraction: (packed >> 1) / CAR_FRACTION_UNITS,
      pit: (packed & 1) === 1,
      role,
      cls: Math.min(kind & CLASS_MASK, MAXIMUM_CLASS)
    })
  }
  return cars
}
