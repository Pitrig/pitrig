import { MAXIMUM_CONFIGURATION_TEXT_SIZE } from '../../shared/configuration-documents'
import { DASHBOARD_FILE_FORMAT_VERSION } from '../../shared/dashboard-files'
import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import { MAXIMUM_FACE_SIZE } from '../../shared/font-library'
import {
  IMAGE_COLOR_FORMATS,
  IMAGE_ID_PATTERN,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_SPRITE_FRAMES,
  imageAssetBytes,
  type ImageColorFormat
} from '../../shared/image-assets'
import {
  MAXIMUM_TEMPLATE_DESCRIPTION,
  MAXIMUM_TEMPLATE_NAME,
  TEMPLATE_FORMAT
} from '../../shared/templates'
import { faceProblem } from '../font-library/font-library-files'
import {
  damaged,
  isRecord,
  newer,
  openContainer,
  packContainer,
  type OpenedContainer
} from './dashboard-file-container'
import { t } from '@shared/ui-text'

const MAXIMUM_FONTS = 16
const MAXIMUM_DECODED_BYTES = 96 * 1024 * 1024

export interface FileImage {
  id: string
  width: number
  height: number
  frameCount: number
  format: ImageColorFormat
  planes: Buffer
}

export type FileFont =
  | { id: string; source: 'builtin'; family?: string; variant?: string }
  | { id: string; source: 'google'; family: string; variant: string }
  | { id: string; source: 'embedded'; name: string; bytes: Uint8Array }

export type DashboardFileTemplate = 'dashboard' | 'widget'

export interface DashboardFileContent {
  name: string
  description?: string
  createdWith?: { app?: string; schema?: number }
  template?: DashboardFileTemplate
  configuration: unknown
  images: FileImage[]
  fonts: FileFont[]
}

export type DashboardFileHeader = Omit<DashboardFileContent, 'images' | 'fonts'>

export function templateOf(content: Pick<DashboardFileContent, 'template'>): DashboardFileTemplate {
  return content.template ?? 'dashboard'
}

export function wrongTemplate(found: DashboardFileTemplate): string {
  return found === 'widget' ? t('share.file.isWidget') : t('share.file.isDashboard')
}

export async function encodeDashboardFile(content: DashboardFileContent): Promise<Buffer> {
  const payloads: Uint8Array[] = [Buffer.from(JSON.stringify(content.configuration), 'utf8')]
  const blobOf = (bytes: Uint8Array): number => payloads.push(bytes) - 1
  const images = content.images.map((image) => ({
    id: image.id,
    width: image.width,
    height: image.height,
    frames: image.frameCount,
    color_format: image.format,
    blob: blobOf(image.planes)
  }))
  const fonts = content.fonts.map((font) =>
    font.source === 'embedded'
      ? { id: font.id, source: font.source, name: font.name, blob: blobOf(font.bytes) }
      : font
  )
  return packContainer(
    {
      format: TEMPLATE_FORMAT,
      format_version: DASHBOARD_FILE_FORMAT_VERSION,
      name: content.name,
      ...(content.description ? { description: content.description } : {}),
      ...(content.createdWith ? { created_with: content.createdWith } : {}),
      ...(content.template === 'widget' ? { template: content.template } : {}),
      configuration: { blob: 0 },
      images,
      fonts
    },
    payloads
  )
}

export async function readDashboardFileHeader(bytes: Buffer): Promise<DashboardFileHeader> {
  return readHeader(openContainer(bytes))
}

export async function decodeDashboardFile(bytes: Buffer): Promise<DashboardFileContent> {
  const container = openContainer(bytes)
  const content = await readHeader(container)
  const budget = { left: MAXIMUM_DECODED_BYTES }
  const images = await decodeImages(container.header.images, container, budget)
  const fonts = await decodeFonts(container.header.fonts, container, budget)
  return { ...content, images, fonts }
}

async function readHeader(container: OpenedContainer): Promise<DashboardFileHeader> {
  const header = container.header
  const createdWith = parseCreatedWith(header.created_with)
  if (header.format !== TEMPLATE_FORMAT) throw damaged()
  const version = header.format_version
  if (!Number.isSafeInteger(version) || (version as number) < 2) throw damaged()
  if ((version as number) > DASHBOARD_FILE_FORMAT_VERSION) throw newer(createdWith?.app)
  const name = typeof header.name === 'string' ? header.name.trim() : ''
  if (name.length === 0 || name.length > MAXIMUM_TEMPLATE_NAME) throw damaged()
  const description = header.description
  if (
    description !== undefined &&
    (typeof description !== 'string' || description.length > MAXIMUM_TEMPLATE_DESCRIPTION)
  ) {
    throw damaged()
  }
  if (!isRecord(header.configuration)) throw damaged()
  const text = await container.blob(header.configuration.blob, MAXIMUM_CONFIGURATION_TEXT_SIZE)
  let configuration: unknown
  try {
    configuration = JSON.parse(text.toString('utf8'))
  } catch {
    throw damaged()
  }
  return {
    name,
    ...(description ? { description } : {}),
    ...(createdWith ? { createdWith } : {}),
    ...(header.template === 'widget' ? { template: 'widget' as const } : {}),
    configuration
  }
}

async function decodeImages(
  value: unknown,
  container: OpenedContainer,
  budget: { left: number }
): Promise<FileImage[]> {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAXIMUM_IMAGES) throw damaged()
  const seen = new Set<string>()
  const images: FileImage[] = []
  for (const entry of value) {
    if (!isRecord(entry)) throw damaged()
    const { id, width, height, frames, color_format: format } = entry
    if (
      typeof id !== 'string' ||
      !IMAGE_ID_PATTERN.test(id) ||
      seen.has(id) ||
      !isCount(width, MAXIMUM_IMAGE_DIMENSION) ||
      !isCount(height, MAXIMUM_IMAGE_DIMENSION) ||
      !isCount(frames, MAXIMUM_SPRITE_FRAMES) ||
      !IMAGE_COLOR_FORMATS.includes(format as ImageColorFormat)
    ) {
      throw damaged()
    }
    seen.add(id)
    const expected =
      imageAssetBytes(width as number, height as number, format as ImageColorFormat) *
      (frames as number)
    spend(budget, expected)
    const planes = await container.blob(entry.blob, expected)
    if (planes.byteLength !== expected) throw damaged()
    images.push({
      id,
      width: width as number,
      height: height as number,
      frameCount: frames as number,
      format: format as ImageColorFormat,
      planes
    })
  }
  return images
}

async function decodeFonts(
  value: unknown,
  container: OpenedContainer,
  budget: { left: number }
): Promise<FileFont[]> {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAXIMUM_FONTS) throw damaged()
  const seen = new Set<string>()
  const fonts: FileFont[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !FONT_FAMILY_PATTERN.test(entry.id)) {
      throw damaged()
    }
    if (seen.has(entry.id)) throw damaged()
    seen.add(entry.id)
    const family = shortText(entry.family)
    const variant = shortText(entry.variant)
    if (entry.source === 'builtin') {
      fonts.push({
        id: entry.id,
        source: 'builtin',
        ...(family && variant ? { family, variant } : {})
      })
    } else if (entry.source === 'google') {
      if (!family || !variant) throw damaged()
      fonts.push({ id: entry.id, source: 'google', family, variant })
    } else if (entry.source === 'embedded') {
      const name = shortText(entry.name)
      if (!name) throw damaged()
      spend(budget, MAXIMUM_FACE_SIZE)
      const bytes = new Uint8Array(await container.blob(entry.blob, MAXIMUM_FACE_SIZE))
      if (faceProblem(bytes)) throw damaged()
      fonts.push({ id: entry.id, source: 'embedded', name, bytes })
    }
  }
  return fonts
}

function parseCreatedWith(value: unknown): DashboardFileContent['createdWith'] {
  if (!isRecord(value)) return undefined
  const app = typeof value.app === 'string' && value.app.length <= 32 ? value.app : undefined
  const schema = Number.isSafeInteger(value.schema) ? (value.schema as number) : undefined
  return app === undefined && schema === undefined
    ? undefined
    : { ...(app ? { app } : {}), ...(schema !== undefined ? { schema } : {}) }
}

function spend(budget: { left: number }, bytes: number): void {
  budget.left -= bytes
  if (budget.left < 0) throw damaged()
}

function shortText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= MAXIMUM_TEMPLATE_NAME ? trimmed : undefined
}

function isCount(value: unknown, maximum: number): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maximum
}
