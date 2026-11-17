import type { DashboardShareSummary, SharedFontSource } from '../../shared/dashboard-files'
import { documentFamilyIds, documentImageIds } from '../../shared/document-assets'
import type { DeviceConfiguration } from '../../shared/device'
import type { FontLibraryEntry } from '../../shared/font-library'
import { MAXIMUM_TEMPLATE_NAME } from '../../shared/templates'
import type { AssetLibraries } from './dashboard-asset-import'
import type { FileFont, FileImage } from './dashboard-file-format'

const HEADER_ALLOWANCE = 2048
const FONT_RATIO = 0.6
const TEXT_RATIO = 0.15

export async function summarizeShare(
  dashboard: DeviceConfiguration,
  libraries: AssetLibraries
): Promise<DashboardShareSummary> {
  const library = new Map(
    (await libraries.images.snapshot()).entries.map((entry) => [entry.id, entry])
  )
  const faces = await fontEntries(libraries)
  const images = documentImageIds(dashboard).map((id) => ({ id, included: library.has(id) }))
  const fonts = documentFamilyIds(dashboard).map((id) => ({ id, source: fontSource(faces.get(id)) }))
  const imageBytes = images.reduce((sum, image) => sum + (library.get(image.id)?.storedBytes ?? 0), 0)
  const fontBytes = fonts.reduce(
    (sum, font) => sum + (font.source === 'embedded' ? (faces.get(font.id)?.bytes ?? 0) : 0),
    0
  )
  const textBytes = Buffer.byteLength(JSON.stringify(dashboard), 'utf8')
  return {
    images,
    fonts,
    estimatedBytes: Math.round(
      HEADER_ALLOWANCE + imageBytes + fontBytes * FONT_RATIO + textBytes * TEXT_RATIO
    )
  }
}

export async function gatherShare(
  dashboard: DeviceConfiguration,
  libraries: AssetLibraries
): Promise<{ images: FileImage[]; fonts: FileFont[] }> {
  const images: FileImage[] = []
  for (const id of documentImageIds(dashboard)) {
    const planes = await libraries.images.readPlanes(id)
    if (!planes) continue
    images.push({
      id,
      width: planes.width,
      height: planes.height,
      frameCount: planes.frameCount,
      format: planes.format,
      planes: planes.bytes
    })
  }
  const faces = await fontEntries(libraries)
  const fonts: FileFont[] = []
  for (const id of documentFamilyIds(dashboard)) {
    const font = await fileFont(id, faces.get(id), libraries)
    if (font) fonts.push(font)
  }
  return { images, fonts }
}

async function fileFont(
  id: string,
  entry: FontLibraryEntry | undefined,
  libraries: AssetLibraries
): Promise<FileFont | undefined> {
  const source = fontSource(entry)
  if (!entry || source === 'missing') return undefined
  const reference = entry.source && fits(entry.source.family) && fits(entry.source.variant)
    ? { family: entry.source.family, variant: entry.source.variant }
    : undefined
  if (source === 'builtin') return { id, source, ...(reference ?? {}) }
  if (source === 'google' && reference) return { id, source, ...reference }
  const bytes = await libraries.fonts.readFace(id)
  if (!bytes) return undefined
  const name = entry.name.trim().slice(0, MAXIMUM_TEMPLATE_NAME).trim() || id
  return { id, source: 'embedded', name, bytes }
}

function fontSource(entry: FontLibraryEntry | undefined): SharedFontSource {
  if (!entry) return 'missing'
  if (entry.origin === 'bundled') return 'builtin'
  if (entry.origin === 'google' && entry.source && fits(entry.source.family)) return 'google'
  return 'embedded'
}

async function fontEntries(libraries: AssetLibraries): Promise<Map<string, FontLibraryEntry>> {
  return new Map((await libraries.fonts.list()).entries.map((entry) => [entry.id, entry]))
}

function fits(text: string | undefined): text is string {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= MAXIMUM_TEMPLATE_NAME
}
