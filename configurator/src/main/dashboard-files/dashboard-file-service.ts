import { dialog, type BrowserWindow, type SaveDialogOptions } from 'electron'
import { basename, extname } from 'node:path'

import { documentOf } from '../../shared/configuration-documents'
import { CONFIGURATION_SCHEMA_VERSION } from '../../shared/configuration-schema'
import {
  DASHBOARD_FILE_EXTENSION,
  MAXIMUM_DASHBOARD_FILE_SIZE,
  emptyOpenReport,
  type DashboardFileError,
  type DashboardFileResult,
  type DashboardShareRequest,
  type DashboardShareSaveValue,
  type DashboardShareSummary,
  type OpenedDashboard
} from '../../shared/dashboard-files'
import {
  documentFamilyIds,
  documentImageIds,
  renameDocumentAssets
} from '../../shared/document-assets'
import type { DeviceConfiguration } from '../../shared/device'
import {
  MAXIMUM_TEMPLATE_DESCRIPTION,
  MAXIMUM_TEMPLATE_FILE_SIZE,
  MAXIMUM_TEMPLATE_NAME
} from '../../shared/templates'
import { isOlder } from '../../shared/version-compare'
import { parseDeviceConfigurationJson, parseDeviceConfigurationValue } from '../device/configuration-json'
import { parseTemplateDocument } from '../templates/template-documents'
import { writeFileAtomic } from '../write-file-atomic'
import { importFonts, importImages, type AssetLibraries } from './dashboard-asset-import'
import { DashboardFileFormatError, isContainer } from './dashboard-file-container'
import { gatherShare, summarizeShare } from './dashboard-file-export'
import {
  decodeDashboardFile,
  encodeDashboardFile,
  type DashboardFileContent
} from './dashboard-file-format'
import { t } from '@shared/ui-text'

export class DashboardFileService {
  constructor(
    private readonly libraries: AssetLibraries,
    private readonly fontsChanged: () => void,
    private readonly appVersion: () => string
  ) {}

  async inspect(json: string): Promise<DashboardFileResult<DashboardShareSummary>> {
    const dashboard = this.dashboardOf(json)
    if (!dashboard.ok) return dashboard
    return { ok: true, value: await summarizeShare(dashboard.value, this.libraries) }
  }

  async save(
    request: DashboardShareRequest,
    owner?: BrowserWindow
  ): Promise<DashboardFileResult<DashboardShareSaveValue>> {
    const name = request.name.trim()
    const description = request.description?.trim()
    if (name.length === 0 || name.length > MAXIMUM_TEMPLATE_NAME) {
      return failure('invalid_request', t('share.errors.name', { maximum: MAXIMUM_TEMPLATE_NAME }))
    }
    if (description && description.length > MAXIMUM_TEMPLATE_DESCRIPTION) {
      return failure('invalid_request', t('share.errors.description', { maximum: MAXIMUM_TEMPLATE_DESCRIPTION }))
    }
    const dashboard = this.dashboardOf(request.json)
    if (!dashboard.ok) return dashboard

    const options: SaveDialogOptions = {
      title: t('share.dialog.saveTitle'),
      buttonLabel: t('share.dialog.saveButton'),
      defaultPath: `${fileNameFor(name)}.${DASHBOARD_FILE_EXTENSION}`,
      filters: [{ name: t('share.dialog.filter'), extensions: [DASHBOARD_FILE_EXTENSION] }]
    }
    const chosen = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
    if (chosen.canceled || !chosen.filePath) return { ok: true, value: { saved: false } }
    const path =
      extname(chosen.filePath).toLowerCase() === `.${DASHBOARD_FILE_EXTENSION}`
        ? chosen.filePath
        : `${chosen.filePath}.${DASHBOARD_FILE_EXTENSION}`

    try {
      const { images, fonts } = await gatherShare(dashboard.value, this.libraries)
      const bytes = await encodeDashboardFile({
        name,
        ...(description ? { description } : {}),
        createdWith: { app: this.appVersion(), schema: CONFIGURATION_SCHEMA_VERSION },
        configuration: dashboard.value,
        images,
        fonts
      })
      if (bytes.byteLength > MAXIMUM_DASHBOARD_FILE_SIZE) {
        return failure('write_failed', t('share.file.tooLarge', { limit: MAXIMUM_DASHBOARD_FILE_SIZE / (1024 * 1024) }))
      }
      await writeFileAtomic(path, bytes)
      const carriedImages = new Set(images.map((image) => image.id))
      const carriedFonts = new Set(fonts.map((font) => font.id))
      return {
        ok: true,
        value: {
          saved: true,
          fileName: basename(path),
          bytes: bytes.byteLength,
          missingImages: documentImageIds(dashboard.value).filter((id) => !carriedImages.has(id)),
          missingFonts: documentFamilyIds(dashboard.value).filter((id) => !carriedFonts.has(id))
        }
      }
    } catch (error) {
      return failure('write_failed', error instanceof Error ? error.message : t('share.errors.notSaved'))
    }
  }

  async open(bytes: Buffer): Promise<DashboardFileResult<OpenedDashboard>> {
    let content: DashboardFileContent
    try {
      content = isContainer(bytes) ? await decodeDashboardFile(bytes) : templateContent(bytes)
    } catch (error) {
      if (error instanceof DashboardFileFormatError) return failure(error.code, error.message)
      return failure('invalid_file', error instanceof Error ? error.message : t('share.file.damaged'))
    }

    let dashboard: DeviceConfiguration
    try {
      dashboard = documentOf(parseDeviceConfigurationValue(content.configuration), 'dashboard')
    } catch (error) {
      if (this.isNewer(content.createdWith)) {
        return failure('newer_file', t('share.file.newerVersion', { version: content.createdWith?.app ?? '?' }))
      }
      return failure('invalid_file', error instanceof Error ? error.message : t('share.file.damaged'))
    }

    const report = emptyOpenReport()
    const fonts = await importFonts(documentFamilyIds(dashboard), content.fonts, this.libraries, report)
    const images = await importImages(documentImageIds(dashboard), content.images, this.libraries, report)
    report.fontsRenamed = [...fonts].map(([from, to]) => ({ from, to }))
    report.imagesRenamed = [...images].map(([from, to]) => ({ from, to }))
    if (report.fontsAdded.length > 0) this.fontsChanged()
    return {
      ok: true,
      value: {
        name: content.name,
        ...(content.description ? { description: content.description } : {}),
        configuration: renameDocumentAssets(dashboard, { images, fonts }),
        report
      }
    }
  }

  private dashboardOf(json: string): DashboardFileResult<DeviceConfiguration> {
    try {
      return { ok: true, value: documentOf(parseDeviceConfigurationJson(json), 'dashboard') }
    } catch (error) {
      return failure('invalid_request', error instanceof Error ? error.message : t('share.errors.notSaved'))
    }
  }

  private isNewer(createdWith: DashboardFileContent['createdWith']): boolean {
    if (createdWith?.schema !== undefined && createdWith.schema > CONFIGURATION_SCHEMA_VERSION) {
      return true
    }
    return isOlder(this.appVersion(), createdWith?.app)
  }
}

export function isDashboardFile(bytes: Buffer): boolean {
  if (isContainer(bytes)) return true
  const head = bytes.subarray(0, 4096).toString('utf8')
  return /"format"\s*:\s*"(pitrig|simcore)-dashboard-template"/.test(head)
}

function templateContent(bytes: Buffer): DashboardFileContent {
  if (bytes.byteLength > MAXIMUM_TEMPLATE_FILE_SIZE) {
    throw new DashboardFileFormatError('invalid_file', t('share.file.damaged'))
  }
  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new DashboardFileFormatError('invalid_file', t('share.file.damaged'))
  }
  const document = parseTemplateDocument(value)
  return {
    name: document.name,
    ...(document.description ? { description: document.description } : {}),
    configuration: document.configuration,
    images: [],
    fonts: []
  }
}

function fileNameFor(name: string): string {
  const printable = [...name].filter((character) => character.charCodeAt(0) >= 0x20).join('')
  const cleaned = printable
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/^[\s.-]+|[\s.]+$/g, '')
    .slice(0, 100)
  return cleaned || 'dashboard'
}

function failure<T>(code: DashboardFileError['code'], message: string): DashboardFileResult<T> {
  return { ok: false, error: { code, message } }
}
